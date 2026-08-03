import { extractMetaInboundMessages } from "./metaInboundMessageExtractor.js";

const CONVERSATIONS_TABLE = "bot_conversations";
const MESSAGES_TABLE = "bot_messages";
const EVENTS_TABLE = "bot_webhook_events";

function cleanText(value) {
  return String(value || "").trim();
}

function isDuplicateError(error) {
  const code = cleanText(error?.code).toLowerCase();
  const message = cleanText(error?.message).toLowerCase();
  return code === "23505" || message.includes("duplicate key");
}

function shouldProcessEventResult(result) {
  if (!result?.id) return false;
  if (result.eventType !== "message_inbound") return false;
  if (result.created !== true) return false;
  return result.status === "received";
}

async function findExistingMessage(supabase, inbound) {
  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .select("id")
    .eq("provider", inbound.provider)
    .eq("provider_message_id", inbound.providerMessageId)
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

async function findConversationByProviderKey(supabase, inbound) {
  if (!inbound.providerConversationKey) return null;

  const { data, error } = await supabase
    .from(CONVERSATIONS_TABLE)
    .select("*")
    .eq("provider", inbound.provider)
    .eq("provider_conversation_key", inbound.providerConversationKey)
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

async function findConversationByPhone(supabase, inbound) {
  const { data, error } = await supabase
    .from(CONVERSATIONS_TABLE)
    .select("*")
    .eq("client_phone", inbound.normalizedPhone)
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

function conversationPayload(inbound, now, existing = null) {
  const requiresHumanReview =
    Boolean(existing?.requires_human_review) ||
    Boolean(inbound.requiresHumanReview);
  const handoffToHuman =
    existing?.handoff_to_human === true || Boolean(inbound.requiresHumanReview);
  const botEnabled =
    existing?.bot_enabled === false || handoffToHuman ? false : true;

  return {
    provider: inbound.provider,
    provider_conversation_key: inbound.providerConversationKey,
    client_phone: inbound.normalizedPhone,
    last_message: inbound.body,
    last_message_at: inbound.receivedAt || now,
    last_inbound_at: inbound.receivedAt || now,
    wa_id_hash: inbound.waIdHash,
    requires_human_review: requiresHumanReview,
    bot_enabled: botEnabled,
    handoff_to_human: handoffToHuman,
    status: handoffToHuman ? "human" : existing?.status || "abierta",
    unread_count: Number(existing?.unread_count || 0) + 1,
    updated_at: now,
  };
}

async function createConversation(supabase, inbound, now) {
  const payload = {
    ...conversationPayload(inbound, now),
    client_name: null,
    current_step: "inicio",
    intent: null,
    created_at: now,
  };

  const { data, error } = await supabase
    .from(CONVERSATIONS_TABLE)
    .insert([payload])
    .select()
    .single();

  if (error) {
    if (isDuplicateError(error)) {
      return findConversationByPhone(supabase, inbound);
    }
    throw error;
  }

  return data;
}

async function getOrCreateConversation(supabase, inbound, now) {
  const byProvider = await findConversationByProviderKey(supabase, inbound);
  if (byProvider) return byProvider;

  const byPhone = await findConversationByPhone(supabase, inbound);
  if (byPhone) {
    const { data, error } = await supabase
      .from(CONVERSATIONS_TABLE)
      .update(conversationPayload(inbound, now, byPhone))
      .eq("id", byPhone.id)
      .select()
      .single();

    if (error) throw error;
    return data || byPhone;
  }

  return createConversation(supabase, inbound, now);
}

async function insertInboundMessage(supabase, conversation, inbound, now) {
  const payload = {
    conversation_id: conversation.id,
    client_phone: inbound.normalizedPhone,
    provider: inbound.provider,
    provider_message_id: inbound.providerMessageId,
    direction: "incoming",
    message_type: inbound.messageType,
    delivery_status: "received",
    body: inbound.body,
    media_url: null,
    raw_payload: inbound.safeMetadata,
    received_at: inbound.receivedAt || now,
    requires_human_review: Boolean(inbound.requiresHumanReview),
    created_at: now,
  };

  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .insert([payload])
    .select("id")
    .single();

  if (error) {
    if (isDuplicateError(error)) {
      return { duplicate: true, id: null };
    }
    throw error;
  }

  return { duplicate: false, id: data?.id || null };
}

async function markEventProcessed(supabase, eventId, now) {
  if (!eventId) return;

  const { error } = await supabase
    .from(EVENTS_TABLE)
    .update({
      status: "processed",
      processed_at: now,
      updated_at: now,
      error_code: null,
      error_message: null,
    })
    .eq("id", eventId)
    .eq("status", "received");

  if (error) throw error;
}

async function markEventFailed(supabase, eventId, now, error) {
  if (!eventId) return;

  await supabase
    .from(EVENTS_TABLE)
    .update({
      status: "failed",
      updated_at: now,
      error_code: cleanText(error?.code || error?.name) || "inbound_failed",
      error_message: cleanText(error?.message).slice(0, 240) || null,
    })
    .eq("id", eventId);
}

export function isInboundProcessingEnabled(env = process.env) {
  return (
    env.BOT_WEBHOOK_RECEIVE_ENABLED === "true" &&
    env.BOT_INBOUND_PROCESSING_ENABLED === "true"
  );
}

export function createBotInboundMessageProcessor({ supabase } = {}) {
  if (!supabase?.from) {
    throw new Error("bot_inbound_processor_requires_supabase");
  }

  return {
    async process({
      payload,
      recordResult,
      appSecret,
      now = new Date().toISOString(),
    } = {}) {
      const inboundMessages = extractMetaInboundMessages({
        payload,
        appSecret,
        receivedAt: now,
      });
      const resultsByMessageId = new Map();

      for (const result of recordResult?.events || []) {
        if (shouldProcessEventResult(result)) {
          resultsByMessageId.set(cleanText(result.providerMessageId), result);
        }
      }

      let processed = 0;
      let duplicate = 0;
      let skipped = 0;

      for (const inbound of inboundMessages) {
        const eventResult = resultsByMessageId.get(inbound.providerMessageId);
        if (!eventResult) {
          skipped += 1;
          continue;
        }

        try {
          const existingMessage = await findExistingMessage(supabase, inbound);
          if (existingMessage) {
            duplicate += 1;
            await markEventProcessed(supabase, eventResult.id, now);
            continue;
          }

          const conversation = await getOrCreateConversation(supabase, inbound, now);
          const messageResult = await insertInboundMessage(
            supabase,
            conversation,
            inbound,
            now
          );

          if (messageResult.duplicate) {
            duplicate += 1;
          } else {
            processed += 1;
          }

          await markEventProcessed(supabase, eventResult.id, now);
        } catch (error) {
          await markEventFailed(supabase, eventResult.id, now, error);
          throw error;
        }
      }

      return {
        ok: true,
        processed,
        duplicate,
        skipped,
      };
    },
  };
}
