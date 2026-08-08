import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildMetaEmbeddedSignupLoginOptions,
  canStartMetaEmbeddedSignup,
  isAllowedMetaEmbeddedSignupOrigin,
  parseMetaEmbeddedSignupPostMessage,
  setupFacebookSdkLoader,
  startMetaEmbeddedSignupLogin,
  summarizeFacebookLoginResponse,
} from "../app/admin/whatsapp-coexistence/embeddedSignup.js";

const finishPayload = {
  type: "WA_EMBEDDED_SIGNUP",
  event: "FINISH",
  data: {
    waba_id: "waba_id_de_prueba",
    phone_number_id: "phone_number_id_de_prueba",
  },
};

function createMockDocument({ existingScript = null, onInsert } = {}) {
  const scripts = [
    {
      parentNode: {
        insertBefore(script) {
          scripts.unshift(script);
          onInsert?.(script);
        },
      },
    },
  ];

  return {
    head: {
      appendChild(script) {
        scripts.push(script);
        onInsert?.(script);
      },
    },
    body: {
      appendChild(script) {
        scripts.push(script);
        onInsert?.(script);
      },
    },
    createElement(tagName) {
      return { tagName };
    },
    getElementById(id) {
      return existingScript?.id === id ? existingScript : null;
    },
    getElementsByTagName(tagName) {
      return tagName === "script" ? scripts : [];
    },
  };
}

test("acepta únicamente orígenes oficiales de Meta para Embedded Signup", () => {
  assert.equal(
    isAllowedMetaEmbeddedSignupOrigin("https://www.facebook.com"),
    true
  );
  assert.equal(
    isAllowedMetaEmbeddedSignupOrigin("https://web.facebook.com"),
    true
  );
  assert.equal(isAllowedMetaEmbeddedSignupOrigin("https://example.com"), false);
});

test("ignora mensajes de orígenes no permitidos", () => {
  const result = parseMetaEmbeddedSignupPostMessage({
    origin: "https://example.com",
    data: finishPayload,
  });

  assert.deepEqual(result, {
    trusted: false,
    handled: false,
  });
});

test("procesa FINISH sin exponer WABA ID ni Phone Number ID", () => {
  const result = parseMetaEmbeddedSignupPostMessage({
    origin: "https://www.facebook.com",
    data: JSON.stringify(finishPayload),
  });

  assert.equal(result.trusted, true);
  assert.equal(result.handled, true);
  assert.equal(result.status, "FINISH");
  assert.equal(result.wabaIdReceived, true);
  assert.equal(result.phoneNumberIdReceived, true);
  assert.equal(result.message, "Meta completó el flujo de coexistencia.");

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /waba_id_de_prueba/);
  assert.doesNotMatch(serialized, /phone_number_id_de_prueba/);
});

test("procesa CANCEL con mensaje seguro", () => {
  const result = parseMetaEmbeddedSignupPostMessage({
    origin: "https://web.facebook.com",
    data: {
      type: "WA_EMBEDDED_SIGNUP",
      event: "CANCEL",
    },
  });

  assert.equal(result.status, "CANCEL");
  assert.equal(
    result.message,
    "El flujo fue cancelado. No se realizaron cambios desde esta aplicación."
  );
});

test("procesa ERROR sin regresar payload crudo", () => {
  const result = parseMetaEmbeddedSignupPostMessage({
    origin: "https://www.facebook.com",
    data: {
      type: "WA_EMBEDDED_SIGNUP",
      event: "ERROR",
      data: {
        error_message: "detalle sensible de prueba",
      },
    },
  });

  assert.equal(result.status, "ERROR");
  assert.doesNotMatch(JSON.stringify(result), /detalle sensible/);
});

test("construye FB.login con configuración de coexistencia sin hardcodear config_id", () => {
  const options = buildMetaEmbeddedSignupLoginOptions("config_de_prueba");

  assert.deepEqual(options, {
    config_id: "config_de_prueba",
    response_type: "code",
    override_default_response_type: true,
    extras: {
      feature_type: "COEXISTENCE",
      session_info_version: "2",
      setup_extensions: {
        platform: "CLOUD_API",
      },
    },
  });
});

test("resume authorization code sin exponerlo", () => {
  const result = summarizeFacebookLoginResponse({
    status: "connected",
    authResponse: {
      code: "authorization_code_de_prueba",
    },
  });

  assert.deepEqual(result, {
    status: "connected",
    authorizationCodeReceived: true,
  });
  assert.doesNotMatch(JSON.stringify(result), /authorization_code_de_prueba/);
});

test("init, verificación y login usan exactamente el mismo objeto FB del click", () => {
  const calls = [];
  const fb = {
    init(options) {
      calls.push({ step: "init", thisValue: this, options });
    },
    getAuthResponse() {
      calls.push({ step: "getAuthResponse", thisValue: this });
      return { accessToken: "token_que_no_debe_exponerse" };
    },
    login(callback, options) {
      calls.push({ step: "login", thisValue: this, options });
      callback({ status: "connected", authResponse: { code: "code_de_prueba" } });
    },
    api() {},
  };

  const result = startMetaEmbeddedSignupLogin({
    fb,
    appId: "app_id_publico_de_prueba",
    version: "v26.0",
    configId: "config_de_prueba",
    onResponse() {},
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    calls.map((call) => call.step),
    ["init", "getAuthResponse", "login"]
  );
  assert.equal(calls[0].thisValue, fb);
  assert.equal(calls[1].thisValue, fb);
  assert.equal(calls[2].thisValue, fb);
  assert.equal(calls[0].options.appId, "app_id_publico_de_prueba");
  assert.equal(calls[0].options.version, "v26.0");
  assert.equal(calls[0].options.xfbml, false);
  assert.equal(calls[2].options.response_type, "code");
  assert.equal(calls[2].options.override_default_response_type, true);
  assert.equal(calls[2].options.extras.feature_type, "COEXISTENCE");
});

test("FB.init ocurre inmediatamente antes de getAuthResponse y login", () => {
  const order = [];
  const fb = {
    init() {
      order.push("init");
    },
    getAuthResponse() {
      order.push("getAuthResponse");
      return { accessToken: "token_ignorado" };
    },
    login() {
      order.push("login");
    },
    api() {},
  };

  const result = startMetaEmbeddedSignupLogin({
    fb,
    appId: "app_id_publico_de_prueba",
    configId: "config_de_prueba",
    onResponse() {},
  });

  assert.equal(result.ok, true);
  assert.deepEqual(order, ["init", "getAuthResponse", "login"]);
});

test("si Meta reporta before FB.init, FB.login no se ejecuta", () => {
  const calls = [];
  const fb = {
    init() {
      calls.push("init");
    },
    getAuthResponse() {
      calls.push("getAuthResponse");
      throw new Error("FB.login() called before FB.init().");
    },
    login() {
      calls.push("login");
    },
    api() {},
  };

  const result = startMetaEmbeddedSignupLogin({
    fb,
    appId: "app_id_publico_de_prueba",
    configId: "config_de_prueba",
    onResponse() {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "sdk_init_not_confirmed");
  assert.deepEqual(calls, ["init", "getAuthResponse"]);
});

test("no inicializa Facebook SDK con App ID vacío durante el click", () => {
  let initCalled = false;
  const result = startMetaEmbeddedSignupLogin({
    fb: {
      init() {
        initCalled = true;
      },
      getAuthResponse() {},
      login() {},
      api() {},
    },
    appId: "",
    version: "v26.0",
    configId: "config_de_prueba",
    onResponse() {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_app_id");
  assert.equal(initCalled, false);
});

test("FB.login no se ejecuta si falta la prueba pública de inicialización", () => {
  let loginCalled = false;
  const result = startMetaEmbeddedSignupLogin({
    fb: {
      init() {},
      login() {
        loginCalled = true;
      },
      api() {},
    },
    appId: "app_id_publico_de_prueba",
    configId: "config_de_prueba",
    onResponse() {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "sdk_init_check_unavailable");
  assert.equal(loginCalled, false);
});

test("no expone ni almacena authResponse usado para verificar inicialización", () => {
  const result = startMetaEmbeddedSignupLogin({
    fb: {
      init() {},
      getAuthResponse() {
        return {
          accessToken: "access_token_de_prueba",
          userID: "usuario_de_prueba",
        };
      },
      login() {},
      api() {},
    },
    appId: "app_id_publico_de_prueba",
    configId: "config_de_prueba",
    onResponse() {},
  });

  assert.equal(result.ok, true);
  assert.doesNotMatch(JSON.stringify(result), /access_token_de_prueba/);
  assert.doesNotMatch(JSON.stringify(result), /usuario_de_prueba/);
});

test("fbAsyncInit se registra antes de insertar el script del SDK", () => {
  const globalScope = {};
  let registeredBeforeInsert = false;
  const documentRef = createMockDocument({
    onInsert(script) {
      registeredBeforeInsert = typeof globalScope.fbAsyncInit === "function";
      assert.equal(script.id, "facebook-jssdk");
      assert.equal(script.src, "https://connect.facebook.net/es_LA/sdk.js");
    },
  });

  const result = setupFacebookSdkLoader({
    globalScope,
    documentRef,
    appId: "app_id_publico_de_prueba",
    version: "v26.0",
  });

  assert.equal(result.ok, true);
  assert.equal(result.scriptInserted, true);
  assert.equal(registeredBeforeInsert, true);
});

test("el cargador reconoce el FB real entregado por el SDK oficial", () => {
  const globalScope = {};
  const documentRef = createMockDocument();
  let availableFb = null;
  let asyncInitExecuted = false;

  setupFacebookSdkLoader({
    globalScope,
    documentRef,
    appId: "app_id_publico_de_prueba",
    version: "v26.0",
    onFbAsyncInit() {
      asyncInitExecuted = true;
    },
    onSdkAvailable({ fb }) {
      availableFb = fb;
    },
  });

  const realFb = {
    init() {},
    getAuthResponse() {},
    login() {},
    api() {},
  };

  globalScope.FB = realFb;
  globalScope.fbAsyncInit();

  assert.equal(asyncInitExecuted, true);
  assert.equal(availableFb, realFb);
});

test("un window.FB preliminar incompleto no se considera disponible", () => {
  const globalScope = {
    FB: {
      init() {},
    },
  };
  let available = false;
  const result = setupFacebookSdkLoader({
    globalScope,
    documentRef: createMockDocument(),
    appId: "app_id_publico_de_prueba",
    version: "v26.0",
    onSdkAvailable() {
      available = true;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.scriptInserted, true);
  assert.equal(available, false);
});

test("el script del SDK no se inserta dos veces", () => {
  const globalScope = {};
  const existingScript = { id: "facebook-jssdk" };
  let insertCount = 0;
  const result = setupFacebookSdkLoader({
    globalScope,
    documentRef: createMockDocument({
      existingScript,
      onInsert() {
        insertCount += 1;
      },
    }),
    appId: "app_id_publico_de_prueba",
    version: "v26.0",
  });

  assert.equal(result.ok, true);
  assert.equal(result.scriptInserted, false);
  assert.equal(insertCount, 0);
});

test("montaje repetido no deja SDK disponible falso antes de fbAsyncInit", () => {
  const globalScope = {};
  const existingScript = { id: "facebook-jssdk" };
  let available = false;

  const first = setupFacebookSdkLoader({
    globalScope,
    documentRef: createMockDocument({ existingScript }),
    appId: "app_id_publico_de_prueba",
    version: "v26.0",
    onSdkAvailable() {
      available = true;
    },
  });
  const second = setupFacebookSdkLoader({
    globalScope,
    documentRef: createMockDocument({ existingScript }),
    appId: "app_id_publico_de_prueba",
    version: "v26.0",
    onSdkAvailable() {
      available = true;
    },
  });

  assert.equal(first.scriptInserted, false);
  assert.equal(second.scriptInserted, false);
  assert.equal(available, false);
  assert.equal(typeof globalScope.fbAsyncInit, "function");
});

test("FB.login usa el objeto FB actual recibido por el handler", () => {
  let loginThis = null;
  const currentFb = {
    init() {},
    getAuthResponse() {},
    login() {
      loginThis = this;
    },
    api() {},
  };

  const result = startMetaEmbeddedSignupLogin({
    fb: currentFb,
    appId: "app_id_publico_de_prueba",
    configId: "config_de_prueba",
    onResponse() {},
  });

  assert.equal(result.ok, true);
  assert.equal(loginThis, currentFb);
});

test("la pantalla mantiene el botón deshabilitado antes de tener SDK disponible", () => {
  assert.equal(
    canStartMetaEmbeddedSignup({
      accessLoading: false,
      isAdmin: true,
      launching: false,
      missingConfig: [],
      sdkAvailable: false,
    }),
    false
  );
  assert.equal(
    canStartMetaEmbeddedSignup({
      accessLoading: false,
      isAdmin: true,
      launching: false,
      missingConfig: [],
      sdkAvailable: true,
    }),
    true
  );
});

test("un fallo de FB.init bloquea FB.login", () => {
  let loginCalled = false;
  const result = startMetaEmbeddedSignupLogin({
    fb: {
      init() {
        throw new Error("fallo de prueba");
      },
      getAuthResponse() {},
      login() {
        loginCalled = true;
      },
      api() {},
    },
    appId: "app_id_publico_de_prueba",
    version: "v26.0",
    configId: "config_de_prueba",
    onResponse() {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "init_failed");
  assert.equal(loginCalled, false);
});

test("la ruta temporal no llama registro, envío ni APIs internas sensibles", () => {
  const pageSource = readFileSync(
    new URL("../app/admin/whatsapp-coexistence/page.js", import.meta.url),
    "utf8"
  );
  const helperSource = readFileSync(
    new URL("../app/admin/whatsapp-coexistence/embeddedSignup.js", import.meta.url),
    "utf8"
  );
  const source = `${pageSource}\n${helperSource}`;

  assert.doesNotMatch(source, /\/register\b/);
  assert.doesNotMatch(source, /graph\.facebook\.com/i);
  assert.doesNotMatch(source, /messages\?/i);
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /META_APP_SECRET/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /console\.(log|info|warn|error)/);
  assert.match(pageSource, /NEXT_PUBLIC_META_SDK_VERSION \|\| "v26\.0"/);
  assert.doesNotMatch(pageSource, /"v23\.0"/);
  assert.match(pageSource, /addEventListener\("message", handleMetaMessage\)/);
  assert.match(pageSource, /removeEventListener\("message", handleMetaMessage\)/);
});
