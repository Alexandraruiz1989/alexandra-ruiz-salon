const TABLE_NAME = "bot_webhook_events";

function cleanText(value) {
  return String(value || "").trim();
}

function toRow(event, now) {
  const receivedAt = cleanText(event.receivedAt) || now;

  return {
    provider: cleanText(event.provider),
    provider_event_id: cleanText(event.providerEventId) || null,
    provider_message_id: cleanText(event.providerMessageId) || null,
    phone_number_id_hash: cleanText(event.phoneNumberIdHash) || null,
    wa_id_hash: cleanText(event.waIdHash) || null,
    event_type: cleanText(event.eventType) || "unknown",
    payload_hash: cleanText(event.payloadHash),
    payload_redacted: event.payloadRedacted || null,
    status: "received",
    received_at: receivedAt,
    processed_at: null,
    error_code: null,
    error_message: null,
    created_at: now,
    updated_at: now,
  };
}

function isDuplicateError(error) {
  const code = cleanText(error?.code).toLowerCase();
  const message = cleanText(error?.message).toLowerCase();
  return code === "23505" || message.includes("duplicate key");
}

export function createBotWebhookEventRepository({ supabase } = {}) {
  if (!supabase?.from) {
    throw new Error("bot_webhook_repository_requires_supabase");
  }

  return {
    async recordEvents(events = [], { now = new Date().toISOString() } = {}) {
      const results = [];

      for (const event of events) {
        const row = toRow(event, now);

        const { data, error } = await supabase
          .from(TABLE_NAME)
          .insert([row])
          .select("id, status")
          .single();

        if (error) {
          if (isDuplicateError(error)) {
            results.push({
              status: "duplicate",
              id: null,
              created: false,
              eventStatus: null,
              eventType: row.event_type,
              providerMessageId: row.provider_message_id,
              providerEventId: row.provider_event_id,
              payloadHash: row.payload_hash,
            });
            continue;
          }

          throw error;
        }

        results.push({
          status: "received",
          id: data?.id || null,
          created: true,
          eventStatus: data?.status || "received",
          eventType: row.event_type,
          providerMessageId: row.provider_message_id,
          providerEventId: row.provider_event_id,
          payloadHash: row.payload_hash,
        });
      }

      return {
        ok: true,
        received: results.filter((item) => item.status === "received").length,
        duplicate: results.filter((item) => item.status === "duplicate").length,
        events: results,
      };
    },
  };
}
