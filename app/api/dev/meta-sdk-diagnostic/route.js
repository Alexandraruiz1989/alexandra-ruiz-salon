const META_SDK_VERSION_FALLBACK = "v26.0";

function safeScriptString(value) {
  return JSON.stringify(String(value || "")).replace(/</g, "\\u003c");
}

function buildDiagnosticHtml() {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID || "";
  const configId = process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID || "";
  const sdkVersion =
    process.env.NEXT_PUBLIC_META_SDK_VERSION || META_SDK_VERSION_FALLBACK;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Diagnóstico local Meta SDK</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f8fafc;
        --card: #ffffff;
        --border: #e2e8f0;
        --text: #17233a;
        --muted: #64748b;
        --brand: #1877f2;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: var(--bg);
        color: var(--text);
        font-family:
          Inter,
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
      }

      main {
        width: min(760px, calc(100% - 32px));
        margin: 0 auto;
        padding: 48px 0;
      }

      section {
        border: 1px solid var(--border);
        border-radius: 24px;
        background: var(--card);
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
        padding: 28px;
      }

      h1 {
        margin: 0;
        font-size: clamp(1.8rem, 4vw, 2.6rem);
        line-height: 1.1;
      }

      p {
        color: var(--muted);
        line-height: 1.65;
      }

      dl {
        display: grid;
        gap: 12px;
        margin: 24px 0;
      }

      .row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 14px 16px;
      }

      dt,
      dd {
        margin: 0;
      }

      dd {
        font-weight: 700;
      }

      button {
        width: 100%;
        min-height: 48px;
        border: 0;
        border-radius: 999px;
        background: var(--brand);
        color: #ffffff;
        cursor: pointer;
        font-size: 1rem;
        font-weight: 700;
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.48;
      }

      .result {
        margin-top: 18px;
        border-radius: 16px;
        background: #f1f5f9;
        padding: 14px 16px;
        color: var(--text);
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>Diagnóstico local del SDK de Meta</h1>
        <p>
          Esta página usa HTML y JavaScript mínimos para probar Embedded Signup
          sin React, hooks ni Next Script.
        </p>

        <dl aria-label="Estado seguro del SDK">
          <div class="row">
            <dt>SDK solicitado</dt>
            <dd id="sdk-requested">No</dd>
          </div>
          <div class="row">
            <dt>fbAsyncInit ejecutado</dt>
            <dd id="fb-async-init">No</dd>
          </div>
          <div class="row">
            <dt>FB.init ejecutado</dt>
            <dd id="fb-init">No</dd>
          </div>
        </dl>

        <button id="start-button" type="button" disabled>
          Iniciar Embedded Signup
        </button>

        <div id="result" class="result" role="status" aria-live="polite">
          Esperando inicialización del SDK.
        </div>
      </section>
    </main>

    <script>
      (function () {
        "use strict";

        var META_APP_ID = ${safeScriptString(appId)};
        var META_CONFIG_ID = ${safeScriptString(configId)};
        var META_SDK_VERSION = ${safeScriptString(sdkVersion)};
        var ALLOWED_ORIGINS = {
          "https://www.facebook.com": true,
          "https://web.facebook.com": true
        };

        function setText(id, value) {
          var element = document.getElementById(id);
          if (element) {
            element.textContent = value;
          }
        }

        function setResult(value) {
          setText("result", value);
        }

        function parseMessageData(data) {
          if (!data) {
            return null;
          }

          if (typeof data === "string") {
            try {
              return JSON.parse(data);
            } catch (_error) {
              return null;
            }
          }

          if (typeof data === "object") {
            return data;
          }

          return null;
        }

        window.fbAsyncInit = function() {
          if (!window.FB || typeof window.FB.init !== "function") {
            setResult("El SDK de Meta no está disponible.");
            return;
          }

          window.FB.init({
            appId: META_APP_ID,
            xfbml: false,
            version: META_SDK_VERSION || "v26.0"
          });

          setText("fb-async-init", "Sí");
          setText("fb-init", "Sí");

          var startButton = document.getElementById("start-button");
          if (startButton && META_APP_ID && META_CONFIG_ID) {
            startButton.disabled = false;
            setResult("SDK inicializado. Puedes iniciar Embedded Signup.");
          } else {
            setResult("Configuración pública incompleta.");
          }
        };

        window.addEventListener("message", function(event) {
          if (!ALLOWED_ORIGINS[event.origin]) {
            return;
          }

          var data = parseMessageData(event.data);
          if (!data || data.type !== "WA_EMBEDDED_SIGNUP") {
            return;
          }

          var eventName = String(data.event || data.status || "").toUpperCase();
          var payload = data.data && typeof data.data === "object" ? data.data : {};
          var wabaReceived = Boolean(payload.waba_id || payload.wabaId);
          var phoneReceived = Boolean(payload.phone_number_id || payload.phoneNumberId);

          if (eventName === "FINISH") {
            setResult(
              "Embedded Signup finalizó. WABA ID recibido: " +
                (wabaReceived ? "Sí" : "No") +
                ". Phone Number ID recibido: " +
                (phoneReceived ? "Sí" : "No") +
                "."
            );
            return;
          }

          if (eventName === "CANCEL") {
            setResult("Flujo cancelado.");
            return;
          }

          if (eventName === "ERROR") {
            setResult("Meta reportó un error.");
          }
        });

        var startButton = document.getElementById("start-button");
        if (startButton) {
          startButton.addEventListener("click", function() {
            if (!window.FB || typeof window.FB.login !== "function") {
              setResult("El SDK de Meta no está listo.");
              return;
            }

            window.FB.login(function(response) {
              if (response && response.authResponse && response.authResponse.code) {
                setResult("Authorization code recibido: Sí");
              } else {
                setResult("Meta no devolvió autorización.");
              }
            }, {
              config_id: META_CONFIG_ID,
              response_type: "code",
              override_default_response_type: true,
              extras: {
                feature_type: "COEXISTENCE",
                session_info_version: "2",
                setup_extensions: {
                  platform: "CLOUD_API"
                }
              }
            });
          });
        }

        (function(d, s, id) {
          var js;
          var fjs = d.getElementsByTagName(s)[0];
          if (d.getElementById(id)) {
            setText("sdk-requested", "Sí");
            return;
          }
          js = d.createElement(s);
          js.id = id;
          js.src = "https://connect.facebook.net/en_US/sdk.js";
          js.async = true;
          js.defer = true;
          if (fjs && fjs.parentNode) {
            fjs.parentNode.insertBefore(js, fjs);
          } else {
            d.head.appendChild(js);
          }
          setText("sdk-requested", "Sí");
        }(document, "script", "facebook-jssdk"));
      }());
    </script>
  </body>
</html>`;
}

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }

  return new Response(buildDiagnosticHtml(), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
