import { hashWebhookPayload, hashWebhookValue } from "./verifyMetaWebhook.js";

const PROVIDER = "meta_whatsapp";

function cleanText(value) {
  return String(value || "").trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueList(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function firstNonEmpty(...values) {
  return values.map(cleanText).find(Boolean) || "";
}

function getEntries(payload) {
  return safeArray(payload?.entry);
}

function getChanges(entry) {
  return safeArray(entry?.changes);
}

function getMessageWaId(value, message) {
  const contacts = safeArray(value?.contacts);
  return firstNonEmpty(
    message?.from,
    contacts[0]?.wa_id,
    contacts[0]?.profile?.wa_id
  );
}

function baseRedactedPayload({
  payload,
  entry,
  change,
  value,
  rawBody,
  appSecret,
}) {
  const messages = safeArray(value?.messages);
  const statuses = safeArray(value?.statuses);
  const phoneNumberId = cleanText(value?.metadata?.phone_number_id);
  const waId = firstNonEmpty(
    messages[0]?.from,
    value?.contacts?.[0]?.wa_id,
    statuses[0]?.recipient_id
  );

  return {
    object: cleanText(payload?.object) || null,
    entry_id_hash: hashWebhookValue(entry?.id, appSecret) || null,
    field: cleanText(change?.field) || null,
    messaging_product: cleanText(value?.messaging_product) || null,
    message_count: messages.length,
    status_count: statuses.length,
    message_types: uniqueList(messages.map((message) => message?.type)),
    status_values: uniqueList(statuses.map((status) => status?.status)),
    phone_number_id_hash: hashWebhookValue(phoneNumberId, appSecret) || null,
    wa_id_hash: hashWebhookValue(waId, appSecret) || null,
    payload_hash: hashWebhookPayload(rawBody),
    contains_message_body: messages.some((message) => Boolean(message?.text?.body)),
    contains_media: messages.some((message) =>
      ["audio", "document", "image", "sticker", "video"].includes(
        cleanText(message?.type)
      )
    ),
  };
}

function eventIdFromParts(parts) {
  return parts.map(cleanText).filter(Boolean).join(":") || "";
}

function buildInboundMessageEvent({
  payload,
  entry,
  change,
  value,
  message,
  rawBody,
  appSecret,
  receivedAt,
}) {
  const providerMessageId = cleanText(message?.id);
  const payloadHash = hashWebhookPayload(rawBody);
  const phoneNumberId = cleanText(value?.metadata?.phone_number_id);
  const waId = getMessageWaId(value, message);

  return {
    provider: PROVIDER,
    providerEventId:
      eventIdFromParts([
        entry?.id,
        change?.field,
        "message",
        providerMessageId,
      ]) || `payload:${payloadHash}`,
    providerMessageId: providerMessageId || null,
    phoneNumberIdHash: hashWebhookValue(phoneNumberId, appSecret) || null,
    waIdHash: hashWebhookValue(waId, appSecret) || null,
    eventType: "message_inbound",
    payloadHash,
    payloadRedacted: baseRedactedPayload({
      payload,
      entry,
      change,
      value,
      rawBody,
      appSecret,
    }),
    receivedAt,
  };
}

function buildStatusEvent({
  payload,
  entry,
  change,
  value,
  status,
  rawBody,
  appSecret,
  receivedAt,
}) {
  const payloadHash = hashWebhookPayload(rawBody);
  const phoneNumberId = cleanText(value?.metadata?.phone_number_id);

  return {
    provider: PROVIDER,
    providerEventId:
      eventIdFromParts([
        entry?.id,
        change?.field,
        "status",
        status?.id,
        status?.status,
        status?.timestamp,
      ]) || `payload:${payloadHash}`,
    providerMessageId: null,
    phoneNumberIdHash: hashWebhookValue(phoneNumberId, appSecret) || null,
    waIdHash: hashWebhookValue(status?.recipient_id, appSecret) || null,
    eventType: "message_status",
    payloadHash,
    payloadRedacted: baseRedactedPayload({
      payload,
      entry,
      change,
      value,
      rawBody,
      appSecret,
    }),
    receivedAt,
  };
}

function buildNonMessageEvent({
  payload,
  entry,
  change,
  value,
  rawBody,
  appSecret,
  receivedAt,
  eventType,
}) {
  const payloadHash = hashWebhookPayload(rawBody);
  const phoneNumberId = cleanText(value?.metadata?.phone_number_id);

  return {
    provider: PROVIDER,
    providerEventId:
      eventIdFromParts([entry?.id, change?.field, eventType, payloadHash]) ||
      `payload:${payloadHash}`,
    providerMessageId: null,
    phoneNumberIdHash: hashWebhookValue(phoneNumberId, appSecret) || null,
    waIdHash: null,
    eventType,
    payloadHash,
    payloadRedacted: baseRedactedPayload({
      payload,
      entry,
      change,
      value,
      rawBody,
      appSecret,
    }),
    receivedAt,
  };
}

export function parseMetaWebhookEvents({
  payload,
  rawBody,
  appSecret,
  receivedAt = new Date().toISOString(),
} = {}) {
  const events = [];
  const entries = getEntries(payload);

  for (const entry of entries) {
    for (const change of getChanges(entry)) {
      const value = change?.value || {};
      const messages = safeArray(value?.messages);
      const statuses = safeArray(value?.statuses);

      for (const message of messages) {
        events.push(
          buildInboundMessageEvent({
            payload,
            entry,
            change,
            value,
            message,
            rawBody,
            appSecret,
            receivedAt,
          })
        );
      }

      for (const status of statuses) {
        events.push(
          buildStatusEvent({
            payload,
            entry,
            change,
            value,
            status,
            rawBody,
            appSecret,
            receivedAt,
          })
        );
      }

      if (messages.length === 0 && statuses.length === 0) {
        events.push(
          buildNonMessageEvent({
            payload,
            entry,
            change,
            value,
            rawBody,
            appSecret,
            receivedAt,
            eventType: "event_without_messages",
          })
        );
      }
    }
  }

  if (events.length === 0) {
    const payloadHash = hashWebhookPayload(rawBody);
    events.push({
      provider: PROVIDER,
      providerEventId: `unknown:${payloadHash}`,
      providerMessageId: null,
      phoneNumberIdHash: null,
      waIdHash: null,
      eventType: "unknown",
      payloadHash,
      payloadRedacted: {
        object: cleanText(payload?.object) || null,
        entry_count: entries.length,
        payload_hash: payloadHash,
      },
      receivedAt,
    });
  }

  return events;
}

