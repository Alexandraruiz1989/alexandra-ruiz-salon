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

test("procesa CANCEL y ERROR con mensajes seguros", () => {
  const cancelResult = parseMetaEmbeddedSignupPostMessage({
    origin: "https://web.facebook.com",
    data: {
      type: "WA_EMBEDDED_SIGNUP",
      event: "CANCEL",
    },
  });
  const errorResult = parseMetaEmbeddedSignupPostMessage({
    origin: "https://www.facebook.com",
    data: {
      type: "WA_EMBEDDED_SIGNUP",
      event: "ERROR",
      data: {
        error_message: "detalle sensible de prueba",
      },
    },
  });

  assert.equal(cancelResult.message, "Flujo cancelado.");
  assert.equal(errorResult.message, "Meta reportó un error.");
  assert.doesNotMatch(JSON.stringify(errorResult), /detalle sensible/);
});

test("construye FB.login con configuración exacta de coexistencia", () => {
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

test("fbAsyncInit se registra antes de insertar el script oficial del SDK", () => {
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

test("FB.init ocurre dentro de fbAsyncInit con cookie true y xfbml true", () => {
  const globalScope = {};
  let fbAsyncInitExecuted = false;
  let initializedFb = null;
  let initOptions = null;

  setupFacebookSdkLoader({
    globalScope,
    documentRef: createMockDocument(),
    appId: "app_id_publico_de_prueba",
    version: "v26.0",
    onFbAsyncInit() {
      fbAsyncInitExecuted = true;
    },
    onSdkInitialized({ fb }) {
      initializedFb = fb;
    },
  });

  const realFb = {
    init(options) {
      initOptions = options;
    },
    login() {},
  };

  globalScope.FB = realFb;
  const result = globalScope.fbAsyncInit();

  assert.equal(result.ok, true);
  assert.equal(result.status, "initialized");
  assert.equal(fbAsyncInitExecuted, true);
  assert.equal(initializedFb, realFb);
  assert.deepEqual(initOptions, {
    appId: "app_id_publico_de_prueba",
    cookie: true,
    xfbml: true,
    version: "v26.0",
  });
});

test("la versión del SDK conserva fallback v26.0", () => {
  const globalScope = {};
  let initOptions = null;

  setupFacebookSdkLoader({
    globalScope,
    documentRef: createMockDocument(),
    appId: "app_id_publico_de_prueba",
    version: "",
  });

  globalScope.FB = {
    init(options) {
      initOptions = options;
    },
    login() {},
  };

  globalScope.fbAsyncInit();
  assert.equal(initOptions.version, "v26.0");
});

test("el botón permanece deshabilitado hasta que el SDK quede inicializado", () => {
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

test("FB.login se ejecuta directamente sobre el mismo objeto FB inicializado", () => {
  let initCalled = false;
  let loginThis = null;
  let loginOptions = null;
  const fb = {
    init() {
      initCalled = true;
    },
    login(callback, options) {
      loginThis = this;
      loginOptions = options;
      callback({ status: "connected", authResponse: { code: "code_de_prueba" } });
    },
  };

  const result = startMetaEmbeddedSignupLogin({
    fb,
    configId: "config_de_prueba",
    onResponse() {},
  });

  assert.equal(result.ok, true);
  assert.equal(initCalled, false);
  assert.equal(loginThis, fb);
  assert.equal(loginOptions.response_type, "code");
  assert.equal(loginOptions.override_default_response_type, true);
  assert.equal(loginOptions.extras.feature_type, "COEXISTENCE");
});

test("FB.login no se ejecuta si el objeto FB no tiene forma oficial mínima", () => {
  let loginCalled = false;
  const result = startMetaEmbeddedSignupLogin({
    fb: {
      login() {
        loginCalled = true;
      },
    },
    configId: "config_de_prueba",
    onResponse() {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "sdk_not_available");
  assert.equal(loginCalled, false);
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

test("un window.FB preliminar incompleto no se considera inicializado", () => {
  const globalScope = {
    FB: {
      init() {},
    },
  };
  let initialized = false;

  const result = setupFacebookSdkLoader({
    globalScope,
    documentRef: createMockDocument(),
    appId: "app_id_publico_de_prueba",
    version: "v26.0",
    onSdkInitialized() {
      initialized = true;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.scriptInserted, true);
  assert.equal(initialized, false);
});

test("montaje repetido no inserta doble script ni marca listo antes de fbAsyncInit", () => {
  const globalScope = {};
  const existingScript = { id: "facebook-jssdk" };
  let initialized = false;

  const first = setupFacebookSdkLoader({
    globalScope,
    documentRef: createMockDocument({ existingScript }),
    appId: "app_id_publico_de_prueba",
    version: "v26.0",
    onSdkInitialized() {
      initialized = true;
    },
  });
  const second = setupFacebookSdkLoader({
    globalScope,
    documentRef: createMockDocument({ existingScript }),
    appId: "app_id_publico_de_prueba",
    version: "v26.0",
    onSdkInitialized() {
      initialized = true;
    },
  });

  assert.equal(first.scriptInserted, false);
  assert.equal(second.scriptInserted, false);
  assert.equal(initialized, false);
  assert.equal(typeof globalScope.fbAsyncInit, "function");
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
  assert.doesNotMatch(source, /\/messages\b|messages\?/i);
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /META_APP_SECRET/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /getAuthResponse/);
  assert.doesNotMatch(source, /console\.(log|info|warn|error)/);
  assert.match(pageSource, /NEXT_PUBLIC_META_SDK_VERSION \|\| "v26\.0"/);
  assert.doesNotMatch(pageSource, /"v23\.0"/);
  assert.match(pageSource, /addEventListener\("message", handleMetaMessage\)/);
  assert.match(pageSource, /removeEventListener\("message", handleMetaMessage\)/);
});

test("la página conserva textos seguros y no expone identificadores completos", () => {
  const pageSource = readFileSync(
    new URL("../app/admin/whatsapp-coexistence/page.js", import.meta.url),
    "utf8"
  );

  assert.match(pageSource, /Configuración de coexistencia de WhatsApp/);
  assert.match(
    pageSource,
    /Esta herramienta inicia el flujo oficial de Meta para conectar\s+WhatsApp Business App con Cloud API\. No activa el bot ni envía\s+mensajes\./
  );
  assert.match(pageSource, /Authorization code recibido: Sí/);
  assert.match(pageSource, /WABA ID recibido/);
  assert.match(pageSource, /Phone Number ID recibido/);
  assert.doesNotMatch(pageSource, /authResponse\.code[^?]/);
  assert.doesNotMatch(pageSource, /waba_id_de_prueba/);
  assert.doesNotMatch(pageSource, /phone_number_id_de_prueba/);
});
