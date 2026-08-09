"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import AdminShell from "../components/AdminShell";
import {
  canStartMetaEmbeddedSignup,
  parseMetaEmbeddedSignupPostMessage,
  setupFacebookSdkLoader,
  startMetaEmbeddedSignupLogin,
  summarizeFacebookLoginResponse,
} from "./embeddedSignup";

const metaAppId = process.env.NEXT_PUBLIC_META_APP_ID || "";
const metaEmbeddedSignupConfigId =
  process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID || "";
const metaSdkVersion = process.env.NEXT_PUBLIC_META_SDK_VERSION || "v26.0";

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

async function getCurrentProfile(user) {
  if (!user) return null;

  const { data: profileById } = await supabase
    .from("user_profiles")
    .select("id, auth_user_id, email, full_name, role, active")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileById) return profileById;

  if (!user.email) return null;

  const { data: profileByEmail } = await supabase
    .from("user_profiles")
    .select("id, auth_user_id, email, full_name, role, active")
    .ilike("email", user.email)
    .maybeSingle();

  return profileByEmail || null;
}

export default function WhatsAppCoexistencePage() {
  const [accessState, setAccessState] = useState({
    loading: true,
    isAdmin: false,
  });
  const [fbAsyncInitExecuted, setFbAsyncInitExecuted] = useState(false);
  const [fbInitExecuted, setFbInitExecuted] = useState(false);
  const [sdkScriptLoaded, setSdkScriptLoaded] = useState(false);
  const [sdkAvailable, setSdkAvailable] = useState(false);
  const [sdkLoadStatus, setSdkLoadStatus] = useState("idle");
  const [launching, setLaunching] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [loginSummary, setLoginSummary] = useState(null);
  const [metaEventSummary, setMetaEventSummary] = useState(null);

  const missingConfig = useMemo(() => {
    const missing = [];
    if (!metaAppId) missing.push("NEXT_PUBLIC_META_APP_ID");
    if (!metaEmbeddedSignupConfigId) {
      missing.push("NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID");
    }
    return missing;
  }, []);

  useEffect(() => {
    const checkAccess = async () => {
      const { data } = await supabase.auth.getSession();
      const profile = await getCurrentProfile(data.session?.user);
      const isAdmin =
        profile?.active !== false && normalizeRole(profile?.role) === "admin";

      setAccessState({
        loading: false,
        isAdmin,
      });
    };

    checkAccess();
  }, []);

  useEffect(() => {
    let active = true;

    if (!metaAppId) return undefined;

    queueMicrotask(() => {
      if (!active) return;

      setSdkLoadStatus("loading");
      setStatusMessage((current) => current || "Preparando conexión con Meta...");

      const result = setupFacebookSdkLoader({
        globalScope: window,
        documentRef: document,
        appId: metaAppId,
        version: metaSdkVersion,
        onScriptLoaded: () => {
          if (!active) return;
          setSdkScriptLoaded(true);
        },
        onFbAsyncInit: () => {
          if (!active) return;
          setFbAsyncInitExecuted(true);
        },
        onSdkInitialized: () => {
          if (!active) return;
          setFbInitExecuted(true);
          setSdkAvailable(true);
          setSdkLoadStatus("available");
          setStatusMessage((current) =>
            current === "Preparando conexión con Meta..."
              ? "SDK de Meta listo."
              : current || "SDK de Meta listo."
          );
        },
        onError: () => {
          if (!active) return;
          setSdkAvailable(false);
          setSdkLoadStatus("failed");
          setStatusMessage(
            "No se pudo cargar el SDK de Meta. Revisa la configuración e inténtalo nuevamente."
          );
        },
      });

      if (!result.ok && result.reason !== "missing_app_id") {
        setSdkAvailable(false);
        setSdkLoadStatus("failed");
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const canStartSignup = canStartMetaEmbeddedSignup({
    accessLoading: accessState.loading,
    isAdmin: accessState.isAdmin,
    launching,
    missingConfig,
    sdkAvailable,
  });

  useEffect(() => {
    const handleMetaMessage = (event) => {
      const summary = parseMetaEmbeddedSignupPostMessage(event);

      if (!summary.handled) return;

      setMetaEventSummary(summary);
      setStatusMessage(summary.message);
      setLaunching(false);
    };

    window.addEventListener("message", handleMetaMessage);
    return () => window.removeEventListener("message", handleMetaMessage);
  }, []);

  const handleStart = () => {
    setStatusMessage("");
    setLoginSummary(null);
    setMetaEventSummary(null);

    if (!accessState.isAdmin) {
      setStatusMessage("Solo una cuenta administradora puede iniciar este flujo.");
      return;
    }

    if (missingConfig.length > 0) {
      setStatusMessage(
        `Falta configuración pública: ${missingConfig.join(", ")}.`
      );
      return;
    }

    if (!sdkAvailable) {
      setStatusMessage("Preparando conexión con Meta...");
      return;
    }

    setLaunching(true);
    setStatusMessage("Abriendo configuración...");

    const result = startMetaEmbeddedSignupLogin({
      fb: window.FB,
      configId: metaEmbeddedSignupConfigId,
      onResponse: (response) => {
        const summary = summarizeFacebookLoginResponse(response);
        setLoginSummary(summary);

        if (summary.authorizationCodeReceived) {
          setStatusMessage("Authorization code recibido: Sí");
        } else {
          setStatusMessage("Meta no devolvió autorización.");
        }

        setLaunching(false);
      },
    });

    if (!result.ok) {
      setLaunching(false);
      if (result.reason === "sdk_not_available") {
        setStatusMessage("Preparando conexión con Meta...");
      } else {
        setStatusMessage(
          "No se pudo iniciar el flujo de Meta. Espera unos segundos e inténtalo de nuevo."
        );
      }
    }
  };

  const sdkStatusLabel =
    sdkAvailable
      ? "Listo"
      : sdkLoadStatus === "failed"
          ? "Error de inicialización"
          : sdkScriptLoaded
            ? "Script cargado"
            : "Cargando";

  return (
    <AdminShell
      title="Configuración de coexistencia de WhatsApp"
      subtitle="Herramienta temporal para iniciar el flujo oficial de Meta."
      activeModule="bot"
    >
      <section className="mx-auto grid max-w-5xl gap-6">
        <div className="rounded-[2rem] border border-[#e8dadd] bg-white p-6 shadow-sm md:p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
            Meta WhatsApp
          </p>

          <h1 className="mt-3 text-3xl font-light text-[#263238] md:text-4xl">
            Configuración de coexistencia de WhatsApp
          </h1>

          <p className="mt-4 max-w-3xl text-sm leading-7 text-[#68777c] md:text-base">
            Esta herramienta inicia el flujo oficial de Meta para conectar
            WhatsApp Business App con Cloud API. No activa el bot ni envía
            mensajes.
          </p>

          <div className="mt-6 grid gap-3 rounded-[1.5rem] bg-[#fff8fa] p-4 text-sm text-[#5f4a4d] md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                App ID público
              </p>
              <p className="mt-1 font-medium">{metaAppId ? "Configurado" : "Pendiente"}</p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                Configuración Meta
              </p>
              <p className="mt-1 font-medium">
                {metaEmbeddedSignupConfigId ? "Configurada" : "Pendiente"}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                SDK
              </p>
              <p className="mt-1 font-medium">
                {sdkStatusLabel}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 rounded-[1.5rem] bg-[#f8fafb] p-4 text-xs text-[#68777c] md:grid-cols-3">
            <p>
              SDK disponible:{" "}
              <span className="font-medium text-[#263238]">
                {sdkAvailable ? "Sí" : "No"}
              </span>
            </p>
            <p>
              fbAsyncInit ejecutado:{" "}
              <span className="font-medium text-[#263238]">
                {fbAsyncInitExecuted ? "Sí" : "No"}
              </span>
            </p>
            <p>
              FB.init ejecutado:{" "}
              <span className="font-medium text-[#263238]">
                {fbInitExecuted ? "Sí" : "No"}
              </span>
            </p>
          </div>

          {!sdkAvailable && sdkLoadStatus !== "failed" && (
            <div className="mt-6 rounded-2xl border border-[#e8dadd] bg-white p-4 text-sm text-[#68777c]">
              Preparando conexión con Meta...
            </div>
          )}

          {accessState.loading ? (
            <div className="mt-6 rounded-2xl border border-[#e8dadd] bg-white p-4 text-sm text-[#68777c]">
              Validando permisos de administrador...
            </div>
          ) : !accessState.isAdmin ? (
            <div className="mt-6 rounded-2xl border border-[#f3c1c1] bg-[#fff5f5] p-4 text-sm text-[#8a3a3a]">
              Esta herramienta temporal está restringida a una cuenta con rol
              administrador.
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleStart}
              disabled={
                !canStartSignup
              }
              className="rounded-full bg-[#bd7b83] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#a7646d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {launching
                ? "Abriendo configuración..."
                : !sdkAvailable
                  ? "Preparando conexión con Meta..."
                  : "Iniciar configuración de coexistencia"}
            </button>

            <p className="text-xs leading-5 text-[#8a969a]">
              El flujo solo inicia tras este click. No se ejecuta
              automáticamente al cargar la página.
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[1.75rem] border border-[#e8dadd] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-light text-[#263238]">
              Resultado seguro del flujo
            </h2>

            {statusMessage ? (
              <p className="mt-4 rounded-2xl bg-[#f7f1f2] p-4 text-sm leading-6 text-[#5f4a4d]">
                {statusMessage}
              </p>
            ) : (
              <p className="mt-4 text-sm leading-6 text-[#68777c]">
                Aún no hay resultado. Cuando Meta responda, aquí solo se
                mostrarán indicadores seguros.
              </p>
            )}

            {metaEventSummary?.status === "FINISH" && (
              <div className="mt-4 grid gap-3 text-sm text-[#536166]">
                <p>
                  WABA ID recibido:{" "}
                  <span className="font-medium text-[#263238]">
                    {metaEventSummary.wabaIdReceived ? "Sí" : "No"}
                  </span>
                </p>
                <p>
                  Phone Number ID recibido:{" "}
                  <span className="font-medium text-[#263238]">
                    {metaEventSummary.phoneNumberIdReceived ? "Sí" : "No"}
                  </span>
                </p>
              </div>
            )}

            {loginSummary?.authorizationCodeReceived && (
              <p className="mt-4 rounded-2xl border border-[#d8e8d8] bg-[#f4fbf4] p-4 text-sm text-[#38633a]">
                Authorization code recibido: Sí
              </p>
            )}
          </div>

          <div className="rounded-[1.75rem] border border-[#e8dadd] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-light text-[#263238]">
              Límites de esta prueba
            </h2>

            <ul className="mt-4 space-y-3 text-sm leading-6 text-[#68777c]">
              <li>No ejecuta registro manual del número.</li>
              <li>No intercambia authorization codes por tokens.</li>
              <li>No guarda WABA ID ni Phone Number ID.</li>
              <li>No envía mensajes de WhatsApp.</li>
              <li>No modifica webhooks, citas, pagos, agenda ni bot.</li>
            </ul>
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
