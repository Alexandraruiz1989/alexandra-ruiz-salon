import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

const DEFAULT_MAX_BODY_BYTES = 512 * 1024;
const META_SIGNATURE_PREFIX = "sha256=";

function cleanText(value) {
  return String(value || "").trim();
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  return Buffer.from(String(value || ""), "utf8");
}

export function getConfiguredMaxBodyBytes(env = process.env) {
  const configured = Number(env.BOT_WEBHOOK_MAX_BODY_BYTES);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_MAX_BODY_BYTES;
  }
  return Math.floor(configured);
}

export function getRawBodyByteLength(rawBody) {
  return toBuffer(rawBody).byteLength;
}

export function hashWebhookValue(value, secret = "") {
  const normalized = cleanText(value);
  if (!normalized) return "";

  if (cleanText(secret)) {
    return createHmac("sha256", cleanText(secret))
      .update(normalized)
      .digest("hex");
  }

  return createHash("sha256").update(normalized).digest("hex");
}

export function hashWebhookPayload(rawBody) {
  return createHash("sha256").update(toBuffer(rawBody)).digest("hex");
}

export function safeCompareText(left, right) {
  const leftBuffer = Buffer.from(cleanText(left), "utf8");
  const rightBuffer = Buffer.from(cleanText(right), "utf8");

  if (!leftBuffer.length || !rightBuffer.length) return false;
  if (leftBuffer.length !== rightBuffer.length) return false;

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function validateMetaWebhookChallenge({
  url,
  env = process.env,
} = {}) {
  const currentUrl = url instanceof URL ? url : new URL(String(url || ""));
  const mode = cleanText(currentUrl.searchParams.get("hub.mode"));
  const token = cleanText(currentUrl.searchParams.get("hub.verify_token"));
  const challenge = currentUrl.searchParams.get("hub.challenge");
  const expectedToken = cleanText(env.META_WEBHOOK_VERIFY_TOKEN);

  if (mode !== "subscribe" || !token || challenge === null) {
    return {
      ok: false,
      status: 400,
      code: "invalid_challenge_request",
    };
  }

  if (!expectedToken) {
    return {
      ok: false,
      status: 503,
      code: "verify_token_not_configured",
    };
  }

  if (!safeCompareText(token, expectedToken)) {
    return {
      ok: false,
      status: 403,
      code: "invalid_verify_token",
    };
  }

  return { ok: true, challenge };
}

export function parseMetaSignatureHeader(signatureHeader) {
  const header = cleanText(signatureHeader);

  if (!header) {
    return {
      ok: false,
      code: "missing_signature",
    };
  }

  if (!header.startsWith(META_SIGNATURE_PREFIX)) {
    return {
      ok: false,
      code: "malformed_signature",
    };
  }

  const signatureHex = header.slice(META_SIGNATURE_PREFIX.length);
  if (!/^[a-f0-9]{64}$/i.test(signatureHex)) {
    return {
      ok: false,
      code: "malformed_signature",
    };
  }

  return { ok: true, signatureHex: signatureHex.toLowerCase() };
}

export function signMetaWebhookBody(rawBody, appSecret) {
  return `${META_SIGNATURE_PREFIX}${createHmac("sha256", cleanText(appSecret))
    .update(toBuffer(rawBody))
    .digest("hex")}`;
}

export function validateMetaWebhookSignature({
  rawBody,
  signatureHeader,
  appSecret,
} = {}) {
  const secret = cleanText(appSecret);

  if (!secret) {
    return {
      ok: false,
      status: 503,
      code: "app_secret_not_configured",
    };
  }

  const parsed = parseMetaSignatureHeader(signatureHeader);
  if (!parsed.ok) {
    return {
      ok: false,
      status: 403,
      code: parsed.code,
    };
  }

  const expectedHex = signMetaWebhookBody(rawBody, secret).slice(
    META_SIGNATURE_PREFIX.length
  );
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(parsed.signatureHex, "hex");

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return {
      ok: false,
      status: 403,
      code: "invalid_signature",
    };
  }

  return { ok: true };
}

