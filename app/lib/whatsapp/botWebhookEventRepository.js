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

async function findExistingBy(supabase, criteria) {
  const normalizedCriteria = Object.fromEntries(
    Object.entries(criteria).filter(([, value]) => cleanText(value))
  );

  if (Object.keys(normalizedCriteria).length === 0) return null;

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("id, status, event_type")
    .match(normalizedCriteria)
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

async function findExistingEvent(supabase, row) {
  if (row.provider_message_id) {
    const existing = await findExistingBy(supabase, {
      provider: row.provider,
      provider_message_id: row.provider_message_id,
    });
    if (existing) return existing;
  }

  if (row.provider_event_id) {
    const existing = await findExistingBy(supabase, {
      provider: row.provider,
      provider_event_id: row.provider_event_id,
    });
    if (existing) return existing;
  }

  return findExistingBy(supabase, {
    provider: row.provider,
    payload_hash: row.payload_hash,
  });
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
        const existing = await findExistingEvent(supabase, row);

        if (existing) {
          results.push({
            status: "duplicate",
            id: existing.id,
            eventStatus: existing.status || null,
            eventType: existing.event_type || row.event_type,
            providerMessageId: row.provider_message_id,
            providerEventId: row.provider_event_id,
          });
          continue;
        }

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
              eventType: row.event_type,
              providerMessageId: row.provider_message_id,
              providerEventId: row.provider_event_id,
            });
            continue;
          }

          throw error;
        }

        results.push({
          status: "received",
          id: data?.id || null,
          eventStatus: data?.status || "received",
          eventType: row.event_type,
          providerMessageId: row.provider_message_id,
          providerEventId: row.provider_event_id,
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
