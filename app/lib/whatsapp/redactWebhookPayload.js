import { parseMetaWebhookEvents } from "./parseMetaWebhookEvent.js";

function scrubDangerousValues(value) {
  if (Array.isArray(value)) {
    return value.map(scrubDangerousValues);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const result = {};
  for (const [key, currentValue] of Object.entries(value)) {
    const normalizedKey = String(key || "").toLowerCase();
    if (
      [
        "body",
        "from",
        "to",
        "wa_id",
        "phone_number",
        "display_phone_number",
        "name",
        "profile",
        "text",
        "token",
        "signature",
      ].includes(normalizedKey)
    ) {
      continue;
    }
    result[key] = scrubDangerousValues(currentValue);
  }

  return result;
}

export function buildRedactedWebhookEvents(options = {}) {
  return parseMetaWebhookEvents(options).map((event) => ({
    ...event,
    payloadRedacted: scrubDangerousValues(event.payloadRedacted),
  }));
}

