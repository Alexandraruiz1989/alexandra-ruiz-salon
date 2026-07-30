import { hashWebhookValue } from "./verifyMetaWebhook.js";

const PROVIDER = "meta_whatsapp";
const NON_TEXTUAL_MESSAGE_TYPES = new Set([
  "audio",
  "contacts",
  "document",
  "image",
  "interactive",
  "location",
  "sticker",
  "video",
]);

function cleanText(value) {
  return String(value || "").trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstNonEmpty(...values) {
  return values.map(cleanText).find(Boolean) || "";
}

export function normalizeWhatsappPhone(value) {
  return cleanText(value).replace(/\D/g, "");
}

function isoFromUnixTimestamp(value, fallback) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return fallback;
  return new Date(timestamp * 1000).toISOString();
}

function safeMessageType(value) {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return "unknown";
  return normalized.replace(/[^a-z0-9_:-]/g, "_").slice(0, 60);
}

function getMessageWaId(value, message) {
  const contacts = safeArray(value?.contacts);
  return firstNonEmpty(
    message?.from,
    contacts[0]?.wa_id,
    contacts[0]?.profile?.wa_id
  );
}

function bodyForMessage(message, messageType) {
  if (messageType === "text") {
    return cleanText(message?.text?.body);
  }

  return `Mensaje ${messageType || "no textual"} recibido. Requiere revisión humana.`;
}

export function extractMetaInboundMessages({
  payload,
  appSecret,
  receivedAt = new Date().toISOString(),
} = {}) {
  const messages = [];

  for (const entry of safeArray(payload?.entry)) {
    for (const change of safeArray(entry?.changes)) {
      const value = change?.value || {};
      const phoneNumberId = cleanText(value?.metadata?.phone_number_id);

      for (const message of safeArray(value?.messages)) {
        const providerMessageId = cleanText(message?.id);
        const messageType = safeMessageType(message?.type);
        const waId = getMessageWaId(value, message);
        const normalizedPhone = normalizeWhatsappPhone(waId);

        if (!providerMessageId || !normalizedPhone) {
          continue;
        }

        const isText = messageType === "text";
        const requiresHumanReview =
          !isText || NON_TEXTUAL_MESSAGE_TYPES.has(messageType);
        const body = bodyForMessage(message, messageType);

        messages.push({
          provider: PROVIDER,
          providerMessageId,
          providerEventId: firstNonEmpty(
            entry?.id,
            change?.field,
            "message",
            providerMessageId
          ),
          normalizedPhone,
          phoneNumberIdHash:
            hashWebhookValue(phoneNumberId, appSecret) || null,
          waIdHash: hashWebhookValue(waId, appSecret) || null,
          providerConversationKey:
            hashWebhookValue(waId || normalizedPhone, appSecret) || null,
          messageType,
          body,
          receivedAt: isoFromUnixTimestamp(message?.timestamp, receivedAt),
          requiresHumanReview,
          safeMetadata: {
            source: "meta_whatsapp_webhook",
            provider: PROVIDER,
            message_type: messageType,
            has_text: isText && Boolean(body),
            requires_human_review: requiresHumanReview,
            phone_number_id_hash:
              hashWebhookValue(phoneNumberId, appSecret) || null,
            wa_id_hash: hashWebhookValue(waId, appSecret) || null,
          },
        });
      }
    }
  }

  return messages;
}
