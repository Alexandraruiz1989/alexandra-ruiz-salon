import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { GET } from "../app/api/dev/meta-sdk-diagnostic/route.js";

const routeSource = readFileSync(
  new URL("../app/api/dev/meta-sdk-diagnostic/route.js", import.meta.url),
  "utf8"
);

async function withEnv(values, callback) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }

  try {
    return await callback();
  } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test("la ruta de diagnóstico devuelve 404 fuera de development", async () => {
  await withEnv({ NODE_ENV: "production" }, async () => {
    const response = await GET();
    assert.equal(response.status, 404);
  });
});

test("la ruta de diagnóstico devuelve HTML solo en development", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      NEXT_PUBLIC_META_APP_ID: "app_id_publico_de_prueba",
      NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID: "config_publico_de_prueba",
      NEXT_PUBLIC_META_SDK_VERSION: "",
    },
    async () => {
      const response = await GET();
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /text\/html/);
      assert.match(html, /Iniciar Embedded Signup/);
      assert.match(html, /var META_SDK_VERSION = "v26\.0"/);
    }
  );
});

test("fbAsyncInit se declara antes de cargar sdk.js", () => {
  const fbAsyncInitIndex = routeSource.indexOf("window.fbAsyncInit = function");
  const sdkIndex = routeSource.indexOf("https://connect.facebook.net/en_US/sdk.js");

  assert.notEqual(fbAsyncInitIndex, -1);
  assert.notEqual(sdkIndex, -1);
  assert.ok(fbAsyncInitIndex < sdkIndex);
});

test("FB.init está dentro de fbAsyncInit y antes de habilitar el botón", () => {
  const fbAsyncInitIndex = routeSource.indexOf("window.fbAsyncInit = function");
  const initIndex = routeSource.indexOf("window.FB.init", fbAsyncInitIndex);
  const enableIndex = routeSource.indexOf("startButton.disabled = false", initIndex);

  assert.notEqual(fbAsyncInitIndex, -1);
  assert.notEqual(initIndex, -1);
  assert.notEqual(enableIndex, -1);
  assert.ok(fbAsyncInitIndex < initIndex);
  assert.ok(initIndex < enableIndex);
});

test("el botón empieza deshabilitado y solo se habilita después de FB.init", () => {
  assert.match(
    routeSource,
    /<button id="start-button" type="button" disabled>/
  );

  const initIndex = routeSource.indexOf("window.FB.init");
  const enableIndex = routeSource.indexOf("startButton.disabled = false");

  assert.ok(initIndex > -1);
  assert.ok(enableIndex > initIndex);
});

test("FB.login mantiene exactamente los parámetros de coexistencia", () => {
  assert.match(routeSource, /window\.FB\.login\(function\(response\)/);
  assert.match(routeSource, /config_id: META_CONFIG_ID/);
  assert.match(routeSource, /response_type: "code"/);
  assert.match(routeSource, /override_default_response_type: true/);
  assert.match(routeSource, /feature_type: "COEXISTENCE"/);
  assert.match(routeSource, /session_info_version: "2"/);
  assert.match(routeSource, /platform: "CLOUD_API"/);
});

test("no contiene registro, envío, token exchange ni almacenamiento sensible", () => {
  assert.doesNotMatch(routeSource, /\/register\b/);
  assert.doesNotMatch(routeSource, /\/messages\b|messages\?/i);
  assert.doesNotMatch(routeSource, /token\s*exchange|exchange\s*token/i);
  assert.doesNotMatch(routeSource, /graph\.facebook\.com/i);
  assert.doesNotMatch(routeSource, /fetch\s*\(/);
  assert.doesNotMatch(routeSource, /localStorage|sessionStorage/);
  assert.doesNotMatch(routeSource, /META_APP_SECRET/);
  assert.doesNotMatch(routeSource, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(routeSource, /console\.(log|info|warn|error)/);
});

test("no imprime payloads, IDs completos ni authorization code", () => {
  assert.doesNotMatch(routeSource, /JSON\.stringify\(response/);
  assert.doesNotMatch(routeSource, /JSON\.stringify\(event/);
  assert.doesNotMatch(routeSource, /textContent\s*=\s*response/);
  assert.doesNotMatch(routeSource, /textContent\s*=\s*payload/);
  assert.match(routeSource, /Authorization code recibido: Sí/);
  assert.match(routeSource, /WABA ID recibido: "/);
  assert.match(routeSource, /Phone Number ID recibido: "/);
});
