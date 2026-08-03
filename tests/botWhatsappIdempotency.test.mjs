import assert from "node:assert/strict";
import test from "node:test";

import { createBotWebhookEventRepository } from "../app/lib/whatsapp/botWebhookEventRepository.js";

function makeEvent(overrides = {}) {
  return {
    provider: "meta_whatsapp",
    providerEventId: "entry:messages:message:wamid.1",
    providerMessageId: "wamid.1",
    phoneNumberIdHash: "hash_phone",
    waIdHash: "hash_wa",
    eventType: "message_inbound",
    payloadHash: "hash_payload",
    payloadRedacted: { message_count: 1 },
    receivedAt: "2026-07-29T12:00:00.000Z",
    ...overrides,
  };
}

class FakeQuery {
  constructor(store) {
    this.store = store;
    this.criteria = {};
    this.mode = "select";
    this.payload = null;
    this.forceDuplicate = store.forceDuplicate;
  }

  select() {
    return this;
  }

  match(criteria) {
    this.criteria = criteria || {};
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

  single() {
    return this;
  }

  then(resolve, reject) {
    try {
      if (this.mode === "insert") {
        const row = { ...this.payload[0], id: `row_${this.store.rows.length + 1}` };

        if (this.forceDuplicate) {
          resolve({
            data: null,
            error: { code: "23505", message: "duplicate key value" },
          });
          return;
        }

        const duplicate = this.store.rows.find((existing) => {
          if (
            row.provider_message_id &&
            existing.provider === row.provider &&
            existing.provider_message_id === row.provider_message_id
          ) {
            return true;
          }
          if (
            row.provider_event_id &&
            existing.provider === row.provider &&
            existing.provider_event_id === row.provider_event_id
          ) {
            return true;
          }
          return (
            !row.provider_event_id &&
            !row.provider_message_id &&
            existing.provider === row.provider &&
            existing.payload_hash === row.payload_hash
          );
        });

        if (duplicate) {
          resolve({
            data: null,
            error: { code: "23505", message: "duplicate key value" },
          });
          return;
        }

        this.store.rows.push(row);
        resolve({ data: { id: row.id, status: row.status }, error: null });
        return;
      }

      const data = this.store.rows.filter((row) =>
        Object.entries(this.criteria).every(([key, value]) => row[key] === value)
      );
      resolve({ data, error: null });
    } catch (error) {
      reject(error);
    }
  }
}

function fakeSupabase(options = {}) {
  const store = {
    rows: [],
    forceDuplicate: options.forceDuplicate || false,
  };

  return {
    store,
    from(table) {
      assert.equal(table, "bot_webhook_events");
      return new FakeQuery(store);
    },
  };
}

test("idempotencia: mensaje duplicado no crea una segunda fila", async () => {
  const supabase = fakeSupabase();
  const repository = createBotWebhookEventRepository({ supabase });

  const first = await repository.recordEvents([makeEvent()]);
  const second = await repository.recordEvents([makeEvent()]);

  assert.equal(first.received, 1);
  assert.equal(first.duplicate, 0);
  assert.equal(second.received, 0);
  assert.equal(second.duplicate, 1);
  assert.equal(first.events[0].created, true);
  assert.equal(second.events[0].created, false);
  assert.equal(second.events[0].id, null);
  assert.equal(supabase.store.rows.length, 1);
});

test("idempotencia: evento duplicado por provider_event_id no crea una segunda fila", async () => {
  const supabase = fakeSupabase();
  const repository = createBotWebhookEventRepository({ supabase });
  const event = makeEvent({
    providerEventId: "entry:messages:status:wamid.1:delivered:1720",
    providerMessageId: null,
    eventType: "message_status",
  });

  const first = await repository.recordEvents([event]);
  const second = await repository.recordEvents([event]);

  assert.equal(first.received, 1);
  assert.equal(second.duplicate, 1);
  assert.equal(second.events[0].created, false);
  assert.equal(second.events[0].id, null);
  assert.equal(supabase.store.rows.length, 1);
});

test("idempotencia: hash deterministico es respaldo cuando no hay ids", async () => {
  const supabase = fakeSupabase();
  const repository = createBotWebhookEventRepository({ supabase });
  const event = makeEvent({
    providerEventId: null,
    providerMessageId: null,
    eventType: "unknown",
    payloadHash: "fallback_payload_hash",
  });

  await repository.recordEvents([event]);
  const replay = await repository.recordEvents([event]);

  assert.equal(replay.received, 0);
  assert.equal(replay.duplicate, 1);
  assert.equal(replay.events[0].created, false);
  assert.equal(replay.events[0].id, null);
  assert.equal(supabase.store.rows.length, 1);
});

test("idempotencia: una violacion unique por carrera se trata como duplicado", async () => {
  const supabase = fakeSupabase({ forceDuplicate: true });
  const repository = createBotWebhookEventRepository({ supabase });

  const result = await repository.recordEvents([makeEvent()]);

  assert.equal(result.received, 0);
  assert.equal(result.duplicate, 1);
  assert.equal(result.events[0].created, false);
  assert.equal(result.events[0].id, null);
  assert.equal(supabase.store.rows.length, 0);
});

test("idempotencia: duplicado con payload distinto no recupera ni expone fila historica", async () => {
  const supabase = fakeSupabase();
  const repository = createBotWebhookEventRepository({ supabase });

  await repository.recordEvents([makeEvent({ payloadHash: "hash_payload_1" })]);
  const replay = await repository.recordEvents([
    makeEvent({ payloadHash: "hash_payload_2" }),
  ]);

  assert.equal(replay.received, 0);
  assert.equal(replay.duplicate, 1);
  assert.equal(replay.events[0].created, false);
  assert.equal(replay.events[0].id, null);
  assert.equal(replay.events[0].payloadHash, "hash_payload_2");
  assert.equal(supabase.store.rows.length, 1);
});
