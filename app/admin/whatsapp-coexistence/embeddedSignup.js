const META_EMBEDDED_SIGNUP_EVENT_TYPE = "WA_EMBEDDED_SIGNUP";

const META_EMBEDDED_SIGNUP_ALLOWED_ORIGINS = new Set([
  "https://www.facebook.com",
  "https://web.facebook.com",
]);

const FACEBOOK_SDK_SCRIPT_ID = "facebook-jssdk";
const FACEBOOK_SDK_SRC = "https://connect.facebook.net/es_LA/sdk.js";
const SDK_INITIALIZED_STATUS = "initialized";

function cleanText(value) {
  return String(value || "").trim();
}

function parseMessageData(data) {
  if (!data) return null;

  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  if (typeof data === "object") {
    return data;
  }

  return null;
}

function pickPayload(data) {
  return data?.data && typeof data.data === "object" ? data.data : data;
}

function pickEventName(data) {
  return cleanText(data?.event || data?.data?.event || data?.status).toUpperCase();
}

function hasValue(value) {
  return cleanText(value).length > 0;
}

function hasFacebookSdkShape(fb) {
  return (
    fb &&
    typeof fb.init === "function" &&
    typeof fb.login === "function"
  );
}

export function isAllowedMetaEmbeddedSignupOrigin(origin) {
  return META_EMBEDDED_SIGNUP_ALLOWED_ORIGINS.has(cleanText(origin));
}

export function buildMetaEmbeddedSignupLoginOptions(configId) {
  return {
    config_id: cleanText(configId),
    response_type: "code",
    override_default_response_type: true,
    extras: {
      feature_type: "COEXISTENCE",
      session_info_version: "2",
      setup_extensions: {
        platform: "CLOUD_API",
      },
    },
  };
}

export function canStartMetaEmbeddedSignup({
  accessLoading = true,
  isAdmin = false,
  launching = false,
  missingConfig = [],
  sdkAvailable = false,
} = {}) {
  return (
    !accessLoading &&
    isAdmin &&
    !launching &&
    missingConfig.length === 0 &&
    sdkAvailable
  );
}

export function setupFacebookSdkLoader({
  globalScope,
  documentRef,
  appId,
  version = "v26.0",
  onScriptLoaded,
  onFbAsyncInit,
  onSdkInitialized,
  onSdkAvailable,
  onError,
} = {}) {
  const cleanAppId = cleanText(appId);
  const cleanVersion = cleanText(version) || "v26.0";

  if (!cleanAppId) {
    return { ok: false, reason: "missing_app_id" };
  }

  if (!globalScope || !documentRef) {
    return { ok: false, reason: "browser_unavailable" };
  }

  const initializeOfficialSdk = () => {
    onFbAsyncInit?.();

    const fb = globalScope.FB;

    if (!hasFacebookSdkShape(fb)) {
      onError?.({ reason: "sdk_not_ready" });
      return { ok: false, reason: "sdk_not_ready" };
    }

    try {
      fb.init({
        appId: cleanAppId,
        cookie: true,
        xfbml: true,
        version: cleanVersion,
      });
    } catch {
      onError?.({ reason: "init_failed" });
      return { ok: false, reason: "init_failed" };
    }

    onSdkInitialized?.({ fb });
    onSdkAvailable?.({ fb });
    return { ok: true, status: SDK_INITIALIZED_STATUS, fb };
  };

  globalScope.fbAsyncInit = initializeOfficialSdk;

  if (hasFacebookSdkShape(globalScope.FB)) {
    onScriptLoaded?.();
    return {
      ok: true,
      alreadyLoaded: true,
      scriptInserted: false,
      initialization: initializeOfficialSdk(),
    };
  }

  const existingScript = documentRef.getElementById?.(FACEBOOK_SDK_SCRIPT_ID);

  if (existingScript) {
    return {
      ok: true,
      alreadyLoaded: false,
      scriptInserted: false,
    };
  }

  const script = documentRef.createElement("script");
  script.id = FACEBOOK_SDK_SCRIPT_ID;
  script.src = FACEBOOK_SDK_SRC;
  script.async = true;
  script.defer = true;
  script.crossOrigin = "anonymous";
  script.onload = () => onScriptLoaded?.();
  script.onerror = () => onError?.({ reason: "script_load_failed" });

  const firstScript = documentRef.getElementsByTagName?.("script")?.[0];

  if (firstScript?.parentNode?.insertBefore) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    documentRef.head?.appendChild?.(script) ||
      documentRef.body?.appendChild?.(script);
  }

  return {
    ok: true,
    alreadyLoaded: false,
    scriptInserted: true,
  };
}

export function startMetaEmbeddedSignupLogin({
  fb,
  configId,
  onResponse,
} = {}) {
  if (!hasFacebookSdkShape(fb)) {
    return { ok: false, reason: "sdk_not_available" };
  }

  try {
    fb.login(onResponse, buildMetaEmbeddedSignupLoginOptions(configId));
    return { ok: true };
  } catch {
    return { ok: false, reason: "login_failed" };
  }
}

export function summarizeFacebookLoginResponse(response = {}) {
  return {
    status: cleanText(response?.status) || "unknown",
    authorizationCodeReceived: hasValue(response?.authResponse?.code),
  };
}

export function parseMetaEmbeddedSignupPostMessage(event = {}) {
  if (!isAllowedMetaEmbeddedSignupOrigin(event.origin)) {
    return {
      trusted: false,
      handled: false,
    };
  }

  const data = parseMessageData(event.data);

  if (!data || data.type !== META_EMBEDDED_SIGNUP_EVENT_TYPE) {
    return {
      trusted: true,
      handled: false,
    };
  }

  const eventName = pickEventName(data);
  const payload = pickPayload(data);
  const wabaIdReceived = hasValue(payload?.waba_id || payload?.wabaId);
  const phoneNumberIdReceived = hasValue(
    payload?.phone_number_id || payload?.phoneNumberId
  );

  if (eventName === "FINISH") {
    return {
      trusted: true,
      handled: true,
      status: "FINISH",
      wabaIdReceived,
      phoneNumberIdReceived,
      message: "Meta completó el flujo de coexistencia.",
    };
  }

  if (eventName === "CANCEL") {
    return {
      trusted: true,
      handled: true,
      status: "CANCEL",
      wabaIdReceived: false,
      phoneNumberIdReceived: false,
      message: "Flujo cancelado.",
    };
  }

  if (eventName === "ERROR") {
    return {
      trusted: true,
      handled: true,
      status: "ERROR",
      wabaIdReceived: false,
      phoneNumberIdReceived: false,
      message: "Meta reportó un error.",
    };
  }

  return {
    trusted: true,
    handled: true,
    status: "UNKNOWN",
    wabaIdReceived: false,
    phoneNumberIdReceived: false,
    message:
      "Meta envió una respuesta no reconocida. No se realizaron cambios desde esta aplicación.",
  };
}
