"use client";

const DEFAULT_SITE_URL = "https://www.alexandraruizsalon.com";
const CLIENT_CALLBACK_PATH = "/cliente/auth/callback";
const CLIENT_LOGIN_CONFIRMED_PATH = "/cliente/login?confirmed=1";

function isLocalBrowser() {
  if (typeof window === "undefined") return false;

  return ["localhost", "127.0.0.1", "::1"].includes(
    window.location.hostname
  );
}

export function getClientPortalOrigin() {
  if (isLocalBrowser()) {
    return window.location.origin;
  }

  const configuredSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    DEFAULT_SITE_URL;

  try {
    const parsedUrl = new URL(String(configuredSiteUrl), DEFAULT_SITE_URL);
    return parsedUrl.origin;
  } catch {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }

    return DEFAULT_SITE_URL;
  }
}

export function getClientEmailRedirectUrl() {
  const origin = getClientPortalOrigin().replace(/\/$/, "");
  const next = encodeURIComponent("/cliente/agenda");

  return `${origin}${CLIENT_CALLBACK_PATH}?next=${next}`;
}

export function getClientConfirmedLoginUrl() {
  const origin = getClientPortalOrigin().replace(/\/$/, "");

  return `${origin}${CLIENT_LOGIN_CONFIRMED_PATH}`;
}
