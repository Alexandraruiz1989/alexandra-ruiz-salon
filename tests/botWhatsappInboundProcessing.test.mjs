import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createBotInboundMessageProcessor,
  isInboundProcessingEnabled,
} from "../app/lib/whatsapp/botInboundMessageProcessor.js";
import {
  createBotResponseDraftOrchestrator,
  generateSafeDraftReply,
  isDraftGenerationEnabled,
  isOutboundSendEnabled,
} from "../app/lib/whatsapp/botResponseDraftGenerator.js";
import { hashWebhookValue } from "../app/lib/whatsapp/verifyMetaWebhook.js";

const now = "2026-07-30T12:00:00.000Z";
const testProviderConversationKey = hashWebhookValue(
  "5219991234567",
  "app_secret_de_prueba"
);

function inboundPayload(overrides = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "entry_123",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                phone_number_id: "phone_number_id_123",
                display_phone_number: "display_should_not_be_stored",
              },
              contacts: [
                {
                  profile: { name: "Nombre Personal" },
                  wa_id: "5219991234567",
                },
              ],
              messages: [
                {
                  from: "5219991234567",
                  id: "wamid.test.1",
                  timestamp: "1785412800",
                  text: { body: "Hola, quiero una cita" },
                  type: "text",
                  ...overrides.message,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function recordResult(overrides = {}) {
  return {
    events: [
      {
        id: "event_1",
        status: "received",
        created: true,
        eventStatus: "received",
        eventType: "message_inbound",
        providerMessageId: "wamid.test.1",
        ...overrides,
      },
    ],
  };
}

function makeStore(seed = {}) {
  return {
    bot_conversations: [...(seed.bot_conversations || [])],
    bot_messages: [...(seed.bot_messages || [])],
    bot_response_drafts: [...(seed.bot_response_drafts || [])],
    bot_webhook_events: [
      {
        id: "event_1",
        status: "received",
        provider: "meta_whatsapp",
        provider_message_id: "wamid.test.1",
        event_type: "message_inbound",
      },
      ...(seed.bot_webhook_events || []),
    ],
    failBotMessageSelect: Boolean(seed.failBotMessageSelect),
  };
}

function matches(row, filters) {
  return filters.every(({ key, value }) => row[key] === value);
}

class FakeQuery {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.mode = "select";
    this.payload = null;
    this.filters = [];
  }

  select() {
    return this;
  }

  eq(key, value) {
    this.filters.push({ key, value });
    return this;
  }

  limit() {
    return this;
  }

  insert(payload) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }

  single() {
    return this;
  }

  then(resolve, reject) {
    try {
      const rows = this.store[this.table];

      if (this.mode === "insert") {
        const row = {
          ...this.payload[0],
          id: `${this.table}_${rows.length + 1}`,
        };

        if (
          this.table === "bot_messages" &&
          row.provider &&
          row.provider_message_id &&
          rows.some(
            (existing) =>
              existing.provider === row.provider &&
              existing.provider_message_id === row.provider_message_id
          )
        ) {
          resolve({
            data: null,
            error: { code: "23505", message: "duplicate key value" },
          });
          return;
        }

        if (
          this.table === "bot_response_drafts" &&
          row.inbound_message_id &&
          rows.some(
            (existing) =>
              existing.inbound_message_id === row.inbound_message_id
          )
        ) {
          resolve({
            data: null,
            error: { code: "23505", message: "duplicate key value" },
          });
          return;
        }

        if (
          this.table === "bot_conversations" &&
          rows.some((existing) => existing.client_phone === row.client_phone)
        ) {
          resolve({
            data: null,
            error: { code: "23505", message: "duplicate key value" },
          });
          return;
        }

        rows.push(row);
        resolve({ data: row, error: null });
        return;
      }

      if (this.mode === "update") {
        const updated = [];
        for (const row of rows) {
          if (matches(row, this.filters)) {
            Object.assign(row, this.payload);
            updated.push(row);
          }
        }
        resolve({ data: updated[0] || null, error: null });
        return;
      }

      if (
        this.mode === "select" &&
        this.table === "bot_messages" &&
        this.store.failBotMessageSelect
      ) {
        resolve({
          data: null,
          error: { code: "select_failed", message: "forced select failure" },
        });
        return;
      }

      resolve({
        data: rows.filter((row) => matches(row, this.filters)),
        error: null,
      });
    } catch (error) {
      reject(error);
    }
  }
}

function fakeSupabase(seed) {
  const store = makeStore(seed);

  return {
    store,
    from(table) {
      assert.ok(
        [
          "bot_conversations",
          "bot_messages",
          "bot_response_drafts",
          "bot_webhook_events",
        ].includes(table)
      );
      return new FakeQuery(store, table);
    },
  };
}

async function processMessage(supabase, options = {}) {
  const processor = createBotInboundMessageProcessor({ supabase });
  return processor.process({
    payload: inboundPayload(options.payload || {}),
    recordResult: recordResult(options.result || {}),
    appSecret: "app_secret_de_prueba",
    now,
    env: options.env || {},
    draftOrchestrator: options.draftOrchestrator || null,
  });
}

function draftEnv(overrides = {}) {
  return {
    BOT_DRAFT_GENERATION_ENABLED: "true",
    BOT_OUTBOUND_SEND_ENABLED: "false",
    ...overrides,
  };
}

function makeDraftOrchestrator(supabase, options = {}) {
  return createBotResponseDraftOrchestrator({
    supabase,
    env: options.env || draftEnv(),
    contextProvider:
      options.contextProvider ||
      (async () => ({
        recentMessages: [],
        services: options.services || [],
        settings: options.settings || {},
        faqs: options.faqs || [],
        knowledgeItems: options.knowledgeItems || [],
      })),
    replyGenerator: options.replyGenerator || generateSafeDraftReply,
  });
}

function seededDraftStore(options = {}) {
  return fakeSupabase({
    bot_conversations: [
      {
        id: "conversation_1",
        client_phone: "5219991234567",
        provider: "meta_whatsapp",
        bot_enabled: false,
        handoff_to_human: true,
        status: "human",
        unread_count: 0,
        ...(options.conversation || {}),
      },
    ],
    bot_messages: [
      {
        id: "message_1",
        conversation_id: "conversation_1",
        direction: "incoming",
        provider: "meta_whatsapp",
        provider_message_id: "wamid.test.1",
        message_type: "text",
        body: "Hola",
        ...(options.message || {}),
      },
    ],
    bot_webhook_events: [
      {
        id: "event_direct_1",
        status: "received",
        provider: "meta_whatsapp",
        provider_message_id: "wamid.test.1",
        event_type: "message_inbound",
        ...(options.event || {}),
      },
    ],
    bot_response_drafts: [...(options.bot_response_drafts || [])],
  });
}

test("bandera privada: procesa solo cuando recepcion e inbound estan en true", () => {
  assert.equal(
    isInboundProcessingEnabled({
      BOT_WEBHOOK_RECEIVE_ENABLED: "true",
      BOT_INBOUND_PROCESSING_ENABLED: "true",
    }),
    true
  );
  assert.equal(
    isInboundProcessingEnabled({
      BOT_WEBHOOK_RECEIVE_ENABLED: "true",
      BOT_INBOUND_PROCESSING_ENABLED: "false",
    }),
    false
  );
  assert.equal(
    isInboundProcessingEnabled({
      BOT_WEBHOOK_RECEIVE_ENABLED: "false",
      BOT_INBOUND_PROCESSING_ENABLED: "true",
    }),
    false
  );
});

test("bandera privada: borradores solo se habilitan con true exacto y envio saliente queda separado", () => {
  assert.equal(
    isDraftGenerationEnabled({ BOT_DRAFT_GENERATION_ENABLED: "true" }),
    true
  );
  for (const value of ["false", "FALSE", "1", "yes", "", undefined]) {
    assert.equal(
      isDraftGenerationEnabled({ BOT_DRAFT_GENERATION_ENABLED: value }),
      false
    );
  }
  assert.equal(isDraftGenerationEnabled({}), false);
  assert.equal(isOutboundSendEnabled({ BOT_OUTBOUND_SEND_ENABLED: "true" }), true);
  assert.equal(
    isOutboundSendEnabled({ BOT_OUTBOUND_SEND_ENABLED: "false" }),
    false
  );
});

test("texto nuevo crea una conversacion y un mensaje entrante", async () => {
  const supabase = fakeSupabase();
  const result = await processMessage(supabase);

  assert.equal(result.processed, 1);
  assert.equal(supabase.store.bot_conversations.length, 1);
  assert.equal(supabase.store.bot_messages.length, 1);
  assert.equal(supabase.store.bot_messages[0].direction, "incoming");
  assert.equal(supabase.store.bot_messages[0].message_type, "text");
  assert.equal(supabase.store.bot_messages[0].created_at, now);
  assert.equal(supabase.store.bot_conversations[0].bot_enabled, false);
  assert.equal(supabase.store.bot_conversations[0].handoff_to_human, true);
  assert.equal(supabase.store.bot_conversations[0].requires_human_review, false);
  assert.equal(supabase.store.bot_conversations[0].status, "human");
  assert.equal(
    supabase.store.bot_messages[0].received_at,
    "2026-07-30T12:00:00.000Z"
  );
  assert.equal(supabase.store.bot_webhook_events[0].status, "processed");
  assert.equal(supabase.store.bot_response_drafts.length, 0);
});

test("BOT_OUTBOUND_SEND_ENABLED=true no envia ni genera borrador en esta fase", async () => {
  const supabase = fakeSupabase();

  const result = await processMessage(supabase, {
    env: {
      BOT_DRAFT_GENERATION_ENABLED: "true",
      BOT_OUTBOUND_SEND_ENABLED: "true",
    },
    draftOrchestrator: makeDraftOrchestrator(supabase, {
      env: {
        BOT_DRAFT_GENERATION_ENABLED: "true",
        BOT_OUTBOUND_SEND_ENABLED: "true",
      },
    }),
  });

  assert.equal(result.processed, 1);
  assert.equal(result.drafts.generated, 0);
  assert.equal(result.drafts.skipped, 1);
  assert.equal(supabase.store.bot_response_drafts.length, 0);
  assert.equal(
    supabase.store.bot_messages.filter((message) => message.direction === "outgoing")
      .length,
    0
  );
});

test("mensaje informativo simple crea exactamente un borrador interno y no mensaje saliente", async () => {
  const supabase = fakeSupabase();

  const result = await processMessage(supabase, {
    env: draftEnv(),
    payload: {
      message: {
        text: { body: "Que servicios tienen?" },
      },
    },
    draftOrchestrator: makeDraftOrchestrator(supabase),
  });

  assert.equal(result.processed, 1);
  assert.equal(result.drafts.enabled, true);
  assert.equal(result.drafts.generated, 1);
  assert.equal(supabase.store.bot_response_drafts.length, 1);
  assert.equal(supabase.store.bot_response_drafts[0].status, "generated");
  assert.equal(supabase.store.bot_response_drafts[0].provider, "meta_whatsapp");
  assert.equal(
    supabase.store.bot_response_drafts[0].inbound_message_id,
    supabase.store.bot_messages[0].id
  );
  assert.equal(
    supabase.store.bot_response_drafts[0].webhook_event_id,
    "event_1"
  );
  assert.equal(
    Object.keys(supabase.store.bot_response_drafts[0].metadata).sort().join(","),
    "outbound_send_enabled,reason,source"
  );
  assert.equal(
    supabase.store.bot_messages.filter((message) => message.direction === "outgoing")
      .length,
    0
  );
});

test("mensaje duplicado no crea segundo borrador", async () => {
  const supabase = fakeSupabase();
  const orchestrator = makeDraftOrchestrator(supabase);

  await processMessage(supabase, {
    env: draftEnv(),
    draftOrchestrator: orchestrator,
  });
  const replay = await processMessage(supabase, {
    env: draftEnv(),
    result: {
      id: "event_2",
      status: "received",
      created: true,
      eventStatus: "received",
    },
    draftOrchestrator: orchestrator,
  });

  assert.equal(replay.processed, 0);
  assert.equal(replay.duplicate, 1);
  assert.equal(supabase.store.bot_messages.length, 1);
  assert.equal(supabase.store.bot_response_drafts.length, 1);
});

test("BOT_DRAFT_GENERATION_ENABLED=false no genera ni modifica borradores", async () => {
  const supabase = fakeSupabase();

  const result = await processMessage(supabase, {
    env: {
      BOT_DRAFT_GENERATION_ENABLED: "false",
      BOT_OUTBOUND_SEND_ENABLED: "false",
    },
  });

  assert.equal(result.processed, 1);
  assert.equal(result.drafts.enabled, false);
  assert.equal(result.drafts.generated, 0);
  assert.equal(supabase.store.bot_response_drafts.length, 0);
});

test("conversacion Bot OFF puede generar borrador interno sin activar el bot", async () => {
  const supabase = fakeSupabase({
    bot_conversations: [
      {
        id: "conversation_1",
        client_phone: "5219991234567",
        provider: "meta_whatsapp",
        provider_conversation_key: testProviderConversationKey,
        bot_enabled: false,
        handoff_to_human: true,
        status: "human",
        unread_count: 0,
      },
    ],
  });

  await processMessage(supabase, {
    env: draftEnv(),
    draftOrchestrator: makeDraftOrchestrator(supabase),
  });

  assert.equal(supabase.store.bot_response_drafts.length, 1);
  assert.equal(supabase.store.bot_conversations[0].bot_enabled, false);
  assert.equal(supabase.store.bot_conversations[0].handoff_to_human, true);
  assert.equal(supabase.store.bot_conversations[0].status, "human");
});

test("conversacion con handoff conserva handoff y deja borrador para revision", async () => {
  const supabase = fakeSupabase({
    bot_conversations: [
      {
        id: "conversation_1",
        client_phone: "5219991234567",
        provider: "meta_whatsapp",
        bot_enabled: false,
        handoff_to_human: true,
        status: "human",
        requires_human_review: true,
        unread_count: 0,
      },
    ],
  });

  await processMessage(supabase, {
    env: draftEnv(),
    draftOrchestrator: makeDraftOrchestrator(supabase),
  });

  assert.equal(supabase.store.bot_response_drafts.length, 1);
  assert.equal(supabase.store.bot_conversations[0].handoff_to_human, true);
  assert.equal(supabase.store.bot_conversations[0].bot_enabled, false);
});

test("pregunta de precio usa precio existente y no inventa informacion", () => {
  const draft = generateSafeDraftReply({
    inboundMessage: {
      body: "Cuanto cuesta lifting de pestanas?",
      message_type: "text",
    },
    services: [
      {
        name: "Lifting de pestañas",
        category: "Pestañas",
        base_price: 450,
      },
    ],
  });

  assert.equal(draft.requiresHumanReview, false);
  assert.match(draft.body, /Lifting de pestañas/);
  assert.match(draft.body, /\$450 MXN/);
});

test("pregunta de precio sin precio configurado requiere revision humana", () => {
  const draft = generateSafeDraftReply({
    inboundMessage: {
      body: "Cuanto cuesta pedicure medicado?",
      message_type: "text",
    },
    services: [
      {
        name: "Pedicure Medicado",
        category: "Pedicure",
        base_price: 0,
      },
    ],
  });

  assert.equal(draft.requiresHumanReview, true);
  assert.doesNotMatch(draft.body, /\$\d+/);
});

test("solicitud de disponibilidad no consulta agenda, no confirma horario y requiere revision", () => {
  const draft = generateSafeDraftReply({
    inboundMessage: {
      body: "Tienen disponibilidad manana a las 5?",
      message_type: "text",
    },
  });

  assert.equal(draft.requiresHumanReview, true);
  assert.match(draft.body, /requiere revisión humana/i);
  assert.match(draft.body, /No debo confirmar disponibilidad/i);
});

test("solicitud de cita no crea cita ni llama transaccion y requiere revision", async () => {
  const supabase = fakeSupabase();

  await processMessage(supabase, {
    env: draftEnv(),
    payload: {
      message: {
        text: { body: "Quiero agendar una cita mañana" },
      },
    },
    draftOrchestrator: makeDraftOrchestrator(supabase),
  });

  assert.equal(supabase.store.bot_response_drafts.length, 1);
  assert.equal(supabase.store.bot_response_drafts[0].requires_human_review, true);
  assert.equal(supabase.store.bot_messages.length, 1);
});

test("solicitud de pago o anticipo no marca pago recibido y requiere revision", () => {
  const draft = generateSafeDraftReply({
    inboundMessage: {
      body: "Ya mande mi anticipo por transferencia",
      message_type: "text",
    },
  });

  assert.equal(draft.requiresHumanReview, true);
  assert.doesNotMatch(draft.body, /pago recibido|anticipo recibido/i);
});

test("mensaje no textual genera solo borrador de revision humana y no salida", async () => {
  const supabase = fakeSupabase();

  await processMessage(supabase, {
    env: draftEnv(),
    payload: {
      message: {
        id: "wamid.test.1",
        type: "image",
        text: undefined,
        image: { id: "media_should_not_be_stored" },
      },
    },
    draftOrchestrator: makeDraftOrchestrator(supabase),
  });

  assert.equal(supabase.store.bot_response_drafts.length, 1);
  assert.equal(supabase.store.bot_response_drafts[0].requires_human_review, true);
  assert.equal(
    supabase.store.bot_messages.filter((message) => message.direction === "outgoing")
      .length,
    0
  );
});

test("fallo del motor deja borrador failed sin salida, citas, pagos ni source bot", async () => {
  const supabase = fakeSupabase();

  const result = await processMessage(supabase, {
    env: draftEnv(),
    draftOrchestrator: makeDraftOrchestrator(supabase, {
      replyGenerator: async () => {
        const error = new Error("forced draft failure");
        error.code = "forced_draft_failure";
        throw error;
      },
    }),
  });

  assert.equal(result.processed, 1);
  assert.equal(result.drafts.failed, 1);
  assert.equal(supabase.store.bot_response_drafts.length, 1);
  assert.equal(supabase.store.bot_response_drafts[0].status, "failed");
  assert.equal(
    supabase.store.bot_response_drafts[0].error_code,
    "forced_draft_failure"
  );
  assert.equal(
    supabase.store.bot_response_drafts[0].error_message,
    "No se pudo generar el borrador interno de forma segura."
  );
  assert.equal(
    supabase.store.bot_messages.filter((message) => message.direction === "outgoing")
      .length,
    0
  );
});

test("error sensible del generador queda sanitizado y no persiste secretos falsos", async () => {
  const supabase = fakeSupabase();

  await processMessage(supabase, {
    env: draftEnv(),
    draftOrchestrator: makeDraftOrchestrator(supabase, {
      replyGenerator: async () => {
        const error = new Error(
          "Bearer abc access_token=123 App Secret xyz x-hub-signature Authorization"
        );
        error.code = "Bearer_access_token";
        throw error;
      },
    }),
  });

  const serialized = JSON.stringify(supabase.store.bot_response_drafts);
  assert.equal(supabase.store.bot_response_drafts[0].status, "failed");
  assert.equal(
    supabase.store.bot_response_drafts[0].error_code,
    "draft_generation_failed"
  );
  assert.doesNotMatch(serialized, /Bearer/i);
  assert.doesNotMatch(serialized, /access_token/i);
  assert.doesNotMatch(serialized, /App Secret/i);
  assert.doesNotMatch(serialized, /x-hub-signature/i);
  assert.doesNotMatch(serialized, /Authorization/i);
});

test("dos intentos simultaneos de borrador para el mismo inbound crean una sola fila", async () => {
  const supabase = seededDraftStore();
  const orchestrator = makeDraftOrchestrator(supabase);
  const conversation = { id: "conversation_1" };
  const inboundMessage = {
    id: "message_1",
    conversation_id: "conversation_1",
    direction: "incoming",
    provider: "meta_whatsapp",
    provider_message_id: "wamid.test.1",
    message_type: "text",
    body: "Que servicios tienen?",
  };

  const [first, second] = await Promise.all([
    orchestrator.maybeGenerateDraft({
      conversation,
      inboundMessage,
      webhookEventId: "event_direct_1",
      now,
    }),
    orchestrator.maybeGenerateDraft({
      conversation,
      inboundMessage,
      webhookEventId: "event_direct_1",
      now,
    }),
  ]);

  assert.equal(first.generated + second.generated, 1);
  assert.equal(first.duplicate + second.duplicate, 1);
  assert.equal(supabase.store.bot_response_drafts.length, 1);
});

test("replay con borrador existente no cambia body, status ni updated_at", async () => {
  const supabase = seededDraftStore({
    bot_response_drafts: [
      {
        id: "draft_1",
        conversation_id: "conversation_1",
        inbound_message_id: "message_1",
        status: "generated",
        body: "Borrador original",
        updated_at: "2026-07-30T10:00:00.000Z",
      },
    ],
  });
  const orchestrator = makeDraftOrchestrator(supabase, {
    replyGenerator: async () => ({
      body: "Borrador nuevo que no debe guardarse",
      requiresHumanReview: false,
    }),
  });

  const result = await orchestrator.maybeGenerateDraft({
    conversation: { id: "conversation_1" },
    inboundMessage: {
      id: "message_1",
      conversation_id: "conversation_1",
      direction: "incoming",
      provider: "meta_whatsapp",
      provider_message_id: "wamid.test.1",
      message_type: "text",
      body: "Hola",
    },
    now,
  });

  assert.equal(result.duplicate, 1);
  assert.equal(supabase.store.bot_response_drafts.length, 1);
  assert.equal(supabase.store.bot_response_drafts[0].status, "generated");
  assert.equal(supabase.store.bot_response_drafts[0].body, "Borrador original");
  assert.equal(
    supabase.store.bot_response_drafts[0].updated_at,
    "2026-07-30T10:00:00.000Z"
  );
});

test("borrador failed existente no se reintenta automaticamente", async () => {
  let called = 0;
  const supabase = seededDraftStore({
    bot_response_drafts: [
      {
        id: "draft_1",
        conversation_id: "conversation_1",
        inbound_message_id: "message_1",
        status: "failed",
        body: null,
        error_code: "draft_generation_failed",
        updated_at: "2026-07-30T10:00:00.000Z",
      },
    ],
  });
  const orchestrator = makeDraftOrchestrator(supabase, {
    replyGenerator: async () => {
      called += 1;
      return { body: "No debe ejecutarse", requiresHumanReview: false };
    },
  });

  const result = await orchestrator.maybeGenerateDraft({
    conversation: { id: "conversation_1" },
    inboundMessage: {
      id: "message_1",
      conversation_id: "conversation_1",
      direction: "incoming",
      provider: "meta_whatsapp",
      provider_message_id: "wamid.test.1",
      message_type: "text",
      body: "Hola",
    },
    now,
  });

  assert.equal(result.duplicate, 1);
  assert.equal(called, 0);
  assert.equal(supabase.store.bot_response_drafts[0].status, "failed");
});

test("borrador generated existente no se regenera", async () => {
  let called = 0;
  const supabase = seededDraftStore({
    bot_response_drafts: [
      {
        id: "draft_1",
        conversation_id: "conversation_1",
        inbound_message_id: "message_1",
        status: "generated",
        body: "Borrador existente",
      },
    ],
  });
  const orchestrator = makeDraftOrchestrator(supabase, {
    replyGenerator: async () => {
      called += 1;
      return { body: "No debe regenerarse", requiresHumanReview: false };
    },
  });

  await orchestrator.maybeGenerateDraft({
    conversation: { id: "conversation_1" },
    inboundMessage: {
      id: "message_1",
      conversation_id: "conversation_1",
      direction: "incoming",
      provider: "meta_whatsapp",
      provider_message_id: "wamid.test.1",
      message_type: "text",
      body: "Hola",
    },
    now,
  });

  assert.equal(called, 0);
  assert.equal(supabase.store.bot_response_drafts[0].body, "Borrador existente");
});

test("mensaje saliente o conversacion cruzada no pueden crear borrador", async () => {
  const supabase = seededDraftStore({
    message: {
      direction: "outgoing",
    },
  });
  const orchestrator = makeDraftOrchestrator(supabase);

  const outgoing = await orchestrator.maybeGenerateDraft({
    conversation: { id: "conversation_1" },
    inboundMessage: {
      id: "message_1",
      conversation_id: "conversation_1",
      direction: "outgoing",
      message_type: "text",
      body: "No valido",
    },
  });
  supabase.store.bot_messages.push({
    id: "message_2",
    conversation_id: "conversation_2",
    direction: "incoming",
    provider: "meta_whatsapp",
    provider_message_id: "wamid.test.2",
    message_type: "text",
    body: "No valido",
  });
  const mismatched = await orchestrator.maybeGenerateDraft({
    conversation: { id: "conversation_1" },
    inboundMessage: {
      id: "message_2",
      conversation_id: "conversation_2",
      direction: "incoming",
      message_type: "text",
      body: "No valido",
    },
  });

  assert.equal(outgoing.code, "invalid_inbound_message");
  assert.equal(mismatched.code, "invalid_inbound_message");
  assert.equal(supabase.store.bot_response_drafts.length, 0);
});

test("webhook_event_id ajeno se rechaza de forma controlada sin crear borrador", async () => {
  const supabase = seededDraftStore({
    event: {
      provider_message_id: "wamid.otro",
    },
  });
  const orchestrator = makeDraftOrchestrator(supabase);

  const result = await orchestrator.maybeGenerateDraft({
    conversation: { id: "conversation_1" },
    inboundMessage: {
      id: "message_1",
      conversation_id: "conversation_1",
      direction: "incoming",
      provider: "meta_whatsapp",
      provider_message_id: "wamid.test.1",
      message_type: "text",
      body: "Hola",
    },
    webhookEventId: "event_direct_1",
    now,
  });

  assert.equal(result.code, "invalid_webhook_event");
  assert.equal(supabase.store.bot_response_drafts.length, 0);
  assert.equal(supabase.store.bot_messages.length, 1);
  assert.equal(supabase.store.bot_conversations[0].bot_enabled, false);
  assert.equal(supabase.store.bot_conversations[0].handoff_to_human, true);
});

test("bandera apagada no consulta bot_response_drafts aunque la tabla no exista", async () => {
  let draftsTouched = false;
  const supabase = {
    from(table) {
      if (table === "bot_response_drafts") {
        draftsTouched = true;
        throw new Error("draft_table_should_not_be_touched");
      }
      throw new Error("unexpected_table_access");
    },
  };
  const orchestrator = createBotResponseDraftOrchestrator({
    supabase,
    env: { BOT_DRAFT_GENERATION_ENABLED: "false" },
  });

  const result = await orchestrator.maybeGenerateDraft({
    conversation: { id: "conversation_1" },
    inboundMessage: {
      id: "message_1",
      conversation_id: "conversation_1",
      direction: "incoming",
      provider: "meta_whatsapp",
      provider_message_id: "wamid.test.1",
      message_type: "text",
      body: "Hola",
    },
  });

  assert.equal(result.enabled, false);
  assert.equal(draftsTouched, false);
});

test("importar generador no requiere tabla, Meta, OpenAI ni efectos secundarios", () => {
  const source = readFileSync(
    new URL("../app/lib/whatsapp/botResponseDraftGenerator.js", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(source, /OpenAI|chat\.completions|responses\.create/);
  assert.doesNotMatch(source, /META_WHATSAPP_ACCESS_TOKEN/);
  assert.doesNotMatch(source, /graph\.facebook\.com/);
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /createAdminClient/);
  assert.doesNotMatch(source, /META_APP_SECRET/);
});

test("limite de body excesivo genera failed controlado sin truncar", async () => {
  const supabase = seededDraftStore();
  const orchestrator = makeDraftOrchestrator(supabase, {
    replyGenerator: async () => ({
      body: "x".repeat(1300),
      requiresHumanReview: false,
      reason: "oversized_body",
    }),
  });

  const result = await orchestrator.maybeGenerateDraft({
    conversation: { id: "conversation_1" },
    inboundMessage: {
      id: "message_1",
      conversation_id: "conversation_1",
      direction: "incoming",
      provider: "meta_whatsapp",
      provider_message_id: "wamid.test.1",
      message_type: "text",
      body: "Hola",
    },
    now,
  });

  assert.equal(result.failed, 1);
  assert.equal(supabase.store.bot_response_drafts[0].status, "failed");
  assert.equal(
    supabase.store.bot_response_drafts[0].error_code,
    "draft_body_limit_exceeded"
  );
});

test("metadata fuera de allowlist y metadata excesiva no se persisten", async () => {
  const allowlistStore = seededDraftStore();
  const allowlistOrchestrator = makeDraftOrchestrator(allowlistStore, {
    replyGenerator: async () => ({
      body: "Borrador seguro",
      requiresHumanReview: false,
      reason: "safe_reason",
      metadata: {
        raw_payload: "no debe guardarse",
        authorization: "no debe guardarse",
      },
    }),
  });

  await allowlistOrchestrator.maybeGenerateDraft({
    conversation: { id: "conversation_1" },
    inboundMessage: {
      id: "message_1",
      conversation_id: "conversation_1",
      direction: "incoming",
      provider: "meta_whatsapp",
      provider_message_id: "wamid.test.1",
      message_type: "text",
      body: "Hola",
    },
    now,
  });

  assert.deepEqual(
    Object.keys(allowlistStore.store.bot_response_drafts[0].metadata).sort(),
    ["outbound_send_enabled", "reason", "source"]
  );
  assert.doesNotMatch(
    JSON.stringify(allowlistStore.store.bot_response_drafts[0].metadata),
    /raw_payload|authorization/i
  );

  const oversizedStore = seededDraftStore({
    message: {
      id: "message_2",
      provider_message_id: "wamid.test.2",
    },
    event: {
      id: "event_direct_2",
      provider_message_id: "wamid.test.2",
    },
  });
  const oversizedOrchestrator = makeDraftOrchestrator(oversizedStore, {
    replyGenerator: async () => ({
      body: "Borrador seguro",
      requiresHumanReview: false,
      reason: "r".repeat(900),
    }),
  });

  await oversizedOrchestrator.maybeGenerateDraft({
    conversation: { id: "conversation_1" },
    inboundMessage: {
      id: "message_2",
      conversation_id: "conversation_1",
      direction: "incoming",
      provider: "meta_whatsapp",
      provider_message_id: "wamid.test.2",
      message_type: "text",
      body: "Hola",
    },
    now,
  });

  assert.equal(oversizedStore.store.bot_response_drafts[0].status, "failed");
  assert.equal(
    oversizedStore.store.bot_response_drafts[0].error_code,
    "draft_metadata_limit_exceeded"
  );
});

test("texto nuevo en conversacion existente crea solo un mensaje", async () => {
  const supabase = fakeSupabase({
    bot_conversations: [
      {
        id: "conversation_1",
        client_phone: "5219991234567",
        provider: "meta_whatsapp",
        provider_conversation_key: null,
        bot_enabled: true,
        handoff_to_human: false,
        unread_count: 0,
      },
    ],
  });

  await processMessage(supabase);

  assert.equal(supabase.store.bot_conversations.length, 1);
  assert.equal(supabase.store.bot_messages.length, 1);
  assert.equal(supabase.store.bot_conversations[0].unread_count, 1);
  assert.equal(supabase.store.bot_conversations[0].bot_enabled, true);
  assert.equal(supabase.store.bot_conversations[0].handoff_to_human, false);
});

test("texto nuevo en conversacion Meta existente conserva Bot ON/OFF y handoff", async () => {
  const supabase = fakeSupabase({
    bot_conversations: [
      {
        id: "conversation_1",
        client_phone: "5219991234567",
        provider: "meta_whatsapp",
        provider_conversation_key: testProviderConversationKey,
        bot_enabled: true,
        handoff_to_human: false,
        requires_human_review: false,
        unread_count: 2,
      },
    ],
  });

  await processMessage(supabase);

  assert.equal(supabase.store.bot_conversations.length, 1);
  assert.equal(supabase.store.bot_messages.length, 1);
  assert.equal(supabase.store.bot_conversations[0].unread_count, 3);
  assert.equal(supabase.store.bot_conversations[0].bot_enabled, true);
  assert.equal(supabase.store.bot_conversations[0].handoff_to_human, false);
  assert.equal(supabase.store.bot_conversations[0].last_inbound_at, now);
});

test("provider_message_id duplicado no duplica mensaje ni conversacion", async () => {
  const supabase = fakeSupabase({
    bot_conversations: [
      {
        id: "conversation_1",
        client_phone: "5219991234567",
        provider: "meta_whatsapp",
        bot_enabled: true,
        handoff_to_human: false,
      },
    ],
    bot_messages: [
      {
        id: "message_1",
        provider: "meta_whatsapp",
        provider_message_id: "wamid.test.1",
        conversation_id: "conversation_1",
      },
    ],
  });

  const result = await processMessage(supabase, {
    result: {
      id: null,
      status: "duplicate",
      created: false,
      eventStatus: "received",
    },
  });

  assert.equal(result.duplicate, 0);
  assert.equal(result.skipped, 1);
  assert.equal(supabase.store.bot_conversations.length, 1);
  assert.equal(supabase.store.bot_messages.length, 1);
  assert.equal(supabase.store.bot_conversations[0].bot_enabled, true);
  assert.equal(supabase.store.bot_conversations[0].handoff_to_human, false);
});

test("evento duplicado ya procesado no reprocesa", async () => {
  const supabase = fakeSupabase();
  const result = await processMessage(supabase, {
    result: {
      id: null,
      status: "duplicate",
      created: false,
      eventStatus: "processed",
    },
  });

  assert.equal(result.processed, 0);
  assert.equal(result.skipped, 1);
  assert.equal(supabase.store.bot_conversations.length, 0);
  assert.equal(supabase.store.bot_messages.length, 0);
});

test("telefono nuevo crea una sola conversacion logica", async () => {
  const supabase = fakeSupabase();

  await processMessage(supabase);
  await processMessage(supabase, {
    result: {
      id: null,
      status: "duplicate",
      created: false,
      eventStatus: "received",
    },
  });

  assert.equal(supabase.store.bot_conversations.length, 1);
  assert.equal(supabase.store.bot_messages.length, 1);
});

test("evento historico received y POST nuevo distinto procesa solo el evento nuevo", async () => {
  const supabase = fakeSupabase({
    bot_webhook_events: [
      {
        id: "event_2",
        status: "received",
      },
    ],
  });

  const result = await processMessage(supabase, {
    payload: {
      message: {
        id: "wamid.test.2",
        text: { body: "Mensaje nuevo distinto" },
      },
    },
    result: {
      id: "event_2",
      status: "received",
      created: true,
      eventStatus: "received",
      providerMessageId: "wamid.test.2",
    },
  });

  assert.equal(result.processed, 1);
  assert.equal(supabase.store.bot_webhook_events[0].status, "received");
  assert.equal(supabase.store.bot_webhook_events[1].status, "processed");
  assert.equal(supabase.store.bot_messages.length, 1);
  assert.equal(
    supabase.store.bot_messages[0].provider_message_id,
    "wamid.test.2"
  );
});

test("evento historico received y POST duplicado no cambia evento historico", async () => {
  const supabase = fakeSupabase();

  const result = await processMessage(supabase, {
    result: {
      id: null,
      status: "duplicate",
      created: false,
      eventStatus: "received",
    },
  });

  assert.equal(result.processed, 0);
  assert.equal(result.skipped, 1);
  assert.equal(supabase.store.bot_webhook_events[0].status, "received");
  assert.equal(supabase.store.bot_conversations.length, 0);
  assert.equal(supabase.store.bot_messages.length, 0);
});

test("fallo parcial marca evento failed sin conversacion ni mensaje y replay no procesa historicos", async () => {
  const supabase = fakeSupabase({ failBotMessageSelect: true });

  await assert.rejects(
    processMessage(supabase, {
      result: {
        id: "event_1",
        status: "received",
        created: true,
        eventStatus: "received",
      },
    }),
    (error) =>
      error?.code === "select_failed" &&
      error?.message === "forced select failure"
  );

  assert.equal(supabase.store.bot_webhook_events[0].status, "failed");
  assert.equal(
    supabase.store.bot_webhook_events[0].error_code,
    "select_failed"
  );
  assert.equal(supabase.store.bot_conversations.length, 0);
  assert.equal(supabase.store.bot_messages.length, 0);
  assert.equal(supabase.store.bot_response_drafts.length, 0);

  supabase.store.failBotMessageSelect = false;

  const replay = await processMessage(supabase, {
    result: {
      id: null,
      status: "duplicate",
      created: false,
      eventStatus: "failed",
    },
  });

  assert.equal(replay.processed, 0);
  assert.equal(replay.skipped, 1);
  assert.equal(supabase.store.bot_webhook_events[0].status, "failed");
  assert.equal(supabase.store.bot_conversations.length, 0);
  assert.equal(supabase.store.bot_messages.length, 0);
});

test("dos POST simultaneos del mismo mensaje producen un solo bot_message", async () => {
  const supabase = fakeSupabase({
    bot_webhook_events: [
      {
        id: "event_2",
        status: "received",
      },
    ],
  });

  const [first, second] = await Promise.all([
    processMessage(supabase, {
      result: {
        id: "event_1",
        status: "received",
        created: true,
        eventStatus: "received",
      },
    }),
    processMessage(supabase, {
      result: {
        id: "event_2",
        status: "received",
        created: true,
        eventStatus: "received",
      },
    }),
  ]);

  assert.equal(first.processed + second.processed, 1);
  assert.equal(first.duplicate + second.duplicate, 1);
  assert.equal(supabase.store.bot_messages.length, 1);
  assert.equal(supabase.store.bot_conversations.length, 1);
});

test("Bot OFF conserva bot_enabled=false", async () => {
  const supabase = fakeSupabase({
    bot_conversations: [
      {
        id: "conversation_1",
        client_phone: "5219991234567",
        provider: "meta_whatsapp",
        bot_enabled: false,
        handoff_to_human: false,
        unread_count: 0,
      },
    ],
  });

  await processMessage(supabase);

  assert.equal(supabase.store.bot_conversations[0].bot_enabled, false);
  assert.equal(supabase.store.bot_conversations[0].handoff_to_human, false);
});

test("handoff conserva handoff_to_human=true", async () => {
  const supabase = fakeSupabase({
    bot_conversations: [
      {
        id: "conversation_1",
        client_phone: "5219991234567",
        provider: "meta_whatsapp",
        bot_enabled: false,
        handoff_to_human: true,
        unread_count: 0,
      },
    ],
  });

  await processMessage(supabase);

  assert.equal(supabase.store.bot_conversations[0].bot_enabled, false);
  assert.equal(supabase.store.bot_conversations[0].handoff_to_human, true);
});

test("mensaje no textual en conversacion existente Bot OFF no activa el bot", async () => {
  const supabase = fakeSupabase({
    bot_conversations: [
      {
        id: "conversation_1",
        client_phone: "5219991234567",
        provider: "meta_whatsapp",
        bot_enabled: false,
        handoff_to_human: true,
        requires_human_review: false,
        unread_count: 0,
      },
    ],
  });

  await processMessage(supabase, {
    payload: {
      message: {
        id: "wamid.test.1",
        type: "image",
        text: undefined,
        image: { id: "media_should_not_be_stored" },
      },
    },
  });

  assert.equal(supabase.store.bot_conversations[0].requires_human_review, true);
  assert.equal(supabase.store.bot_conversations[0].bot_enabled, false);
  assert.equal(supabase.store.bot_conversations[0].handoff_to_human, true);
  assert.equal(supabase.store.bot_messages[0].requires_human_review, true);
});

test("mensaje no textual marca revision humana sin descargar archivo", async () => {
  const supabase = fakeSupabase();

  await processMessage(supabase, {
    payload: {
      message: {
        id: "wamid.test.1",
        type: "image",
        text: undefined,
        image: { id: "media_should_not_be_stored" },
      },
    },
  });

  assert.equal(supabase.store.bot_conversations[0].requires_human_review, true);
  assert.equal(supabase.store.bot_conversations[0].handoff_to_human, true);
  assert.equal(supabase.store.bot_conversations[0].bot_enabled, false);
  assert.equal(supabase.store.bot_messages[0].requires_human_review, true);
  assert.equal(supabase.store.bot_messages[0].message_type, "image");
  assert.doesNotMatch(
    JSON.stringify(supabase.store),
    /media_should_not_be_stored/
  );
});

test("no guarda payload crudo ni secretos en mensajes o conversaciones", async () => {
  const supabase = fakeSupabase();
  await processMessage(supabase);

  const serialized = JSON.stringify({
    conversations: supabase.store.bot_conversations,
    messages: supabase.store.bot_messages,
  });

  assert.doesNotMatch(serialized, /display_should_not_be_stored/);
  assert.doesNotMatch(serialized, /Nombre Personal/);
  assert.doesNotMatch(serialized, /app_secret_de_prueba/);
  assert.doesNotMatch(serialized, /phone_number_id_123/);
});

test("la fase de procesamiento entrante no envia, no consulta disponibilidad ni crea citas o pagos", () => {
  const files = [
    "../app/api/bot/whatsapp/webhook/route.js",
    "../app/lib/whatsapp/botInboundMessageProcessor.js",
    "../app/lib/whatsapp/metaInboundMessageExtractor.js",
    "../app/lib/whatsapp/botWebhookEventRepository.js",
    "../app/lib/whatsapp/botResponseDraftGenerator.js",
  ];

  const source = files
    .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
    .join("\n");

  assert.doesNotMatch(source, /META_WHATSAPP_ACCESS_TOKEN/);
  assert.doesNotMatch(source, /graph\.facebook\.com/);
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /botConversationEngine/);
  assert.doesNotMatch(source, /bookingAvailability/);
  assert.doesNotMatch(source, /createAppointmentFromConfirmedPreview/);
  assert.doesNotMatch(source, /create_appointment_transaction/);
  assert.doesNotMatch(source, /appointment_write_operations/);
  assert.doesNotMatch(source, /from\(["']appointments["']\)/);
  assert.doesNotMatch(source, /from\(["']payments["']\)/);
  assert.doesNotMatch(source, /console\.(log|warn|error)/);
});
