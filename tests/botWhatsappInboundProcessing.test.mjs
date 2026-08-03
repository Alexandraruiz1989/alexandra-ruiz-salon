import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createBotInboundMessageProcessor,
  isInboundProcessingEnabled,
} from "../app/lib/whatsapp/botInboundMessageProcessor.js";

const now = "2026-07-30T12:00:00.000Z";

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
    bot_webhook_events: [
      {
        id: "event_1",
        status: "received",
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
        ["bot_conversations", "bot_messages", "bot_webhook_events"].includes(
          table
        )
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

test("texto nuevo crea una conversacion y un mensaje entrante", async () => {
  const supabase = fakeSupabase();
  const result = await processMessage(supabase);

  assert.equal(result.processed, 1);
  assert.equal(supabase.store.bot_conversations.length, 1);
  assert.equal(supabase.store.bot_messages.length, 1);
  assert.equal(supabase.store.bot_messages[0].direction, "incoming");
  assert.equal(supabase.store.bot_messages[0].message_type, "text");
  assert.equal(supabase.store.bot_messages[0].created_at, now);
  assert.equal(
    supabase.store.bot_messages[0].received_at,
    "2026-07-30T12:00:00.000Z"
  );
  assert.equal(supabase.store.bot_webhook_events[0].status, "processed");
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
