import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  handleMetaWhatsappWebhookGet,
  handleMetaWhatsappWebhookPost,
} from "../app/api/bot/whatsapp/webhook/route.js";
import {
  signMetaWebhookBody,
  validateMetaWebhookSignature,
} from "../app/lib/whatsapp/verifyMetaWebhook.js";

const env = {
  META_WEBHOOK_VERIFY_TOKEN: "verify_token_de_prueba",
  META_APP_SECRET: "app_secret_de_prueba",
  BOT_WEBHOOK_RECEIVE_ENABLED: "true",
  BOT_WEBHOOK_MAX_BODY_BYTES: "200000",
};

const inboundPayload = {
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
              display_phone_number: "529991112233",
              phone_number_id: "phone_number_id_123",
            },
            contacts: [
              {
                profile: { name: "Nombre Personal" },
                wa_id: "529998887766",
              },
            ],
            messages: [
              {
                from: "529998887766",
                id: "wamid.HBgLMTIzNDU2",
                timestamp: "1720000000",
                text: { body: "Hola, quiero una cita" },
                type: "text",
              },
            ],
          },
        },
      ],
    },
  ],
};

const statusPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "entry_123",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "phone_number_id_123" },
            statuses: [
              {
                id: "wamid.status.123",
                recipient_id: "529998887766",
                status: "delivered",
                timestamp: "1720000010",
              },
            ],
          },
        },
      ],
    },
  ],
};

function signedPost(rawBody, overrides = {}) {
  return new Request("http://localhost/api/bot/whatsapp/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256":
        overrides.signature ||
        signMetaWebhookBody(rawBody, overrides.secret || env.META_APP_SECRET),
    },
    body: rawBody,
  });
}

function repositorySpy() {
  const calls = [];
  return {
    calls,
    repository: {
      async recordEvents(events) {
        calls.push(events);
        return {
          ok: true,
          received: events.length,
          duplicate: 0,
          events: events.map((event) => ({
            status: "received",
            eventType: event.eventType,
          })),
        };
      },
    },
  };
}

async function readJson(response) {
  return {
    status: response.status,
    body: await response.json(),
  };
}

test("whatsapp webhook GET valido devuelve challenge", async () => {
  const response = await handleMetaWhatsappWebhookGet(
    new Request(
      "http://localhost/api/bot/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify_token_de_prueba&hub.challenge=abc123"
    ),
    { env }
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "abc123");
});

test("whatsapp webhook GET con token incorrecto devuelve 403", async () => {
  const response = await handleMetaWhatsappWebhookGet(
    new Request(
      "http://localhost/api/bot/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=abc123"
    ),
    { env }
  );

  assert.equal(response.status, 403);
});

test("whatsapp webhook GET con parametros incompletos devuelve 400", async () => {
  const response = await handleMetaWhatsappWebhookGet(
    new Request("http://localhost/api/bot/whatsapp/webhook?hub.mode=subscribe"),
    { env }
  );

  assert.equal(response.status, 400);
});

test("whatsapp webhook POST sin firma se rechaza", async () => {
  const response = await handleMetaWhatsappWebhookPost(
    new Request("http://localhost/api/bot/whatsapp/webhook", {
      method: "POST",
      body: JSON.stringify(inboundPayload),
    }),
    { env }
  );
  const result = await readJson(response);

  assert.equal(result.status, 403);
  assert.equal(result.body.code, "missing_signature");
});

test("whatsapp webhook POST con firma malformada se rechaza", async () => {
  const response = await handleMetaWhatsappWebhookPost(
    signedPost(JSON.stringify(inboundPayload), { signature: "sha1=abc" }),
    { env }
  );
  const result = await readJson(response);

  assert.equal(result.status, 403);
  assert.equal(result.body.code, "malformed_signature");
});

test("whatsapp webhook POST con firma invalida se rechaza", async () => {
  const response = await handleMetaWhatsappWebhookPost(
    signedPost(JSON.stringify(inboundPayload), {
      signature:
        "sha256=0000000000000000000000000000000000000000000000000000000000000000",
    }),
    { env }
  );
  const result = await readJson(response);

  assert.equal(result.status, 403);
  assert.equal(result.body.code, "invalid_signature");
});

test("la firma se calcula sobre el body crudo exacto", () => {
  const compact = JSON.stringify(inboundPayload);
  const pretty = JSON.stringify(inboundPayload, null, 2);
  const validForCompact = signMetaWebhookBody(compact, env.META_APP_SECRET);

  assert.equal(
    validateMetaWebhookSignature({
      rawBody: compact,
      signatureHeader: validForCompact,
      appSecret: env.META_APP_SECRET,
    }).ok,
    true
  );
  assert.equal(
    validateMetaWebhookSignature({
      rawBody: pretty,
      signatureHeader: validForCompact,
      appSecret: env.META_APP_SECRET,
    }).ok,
    false
  );
});

test("whatsapp webhook POST con JSON invalido y firma valida devuelve 400", async () => {
  const rawBody = "{ no es json";
  const response = await handleMetaWhatsappWebhookPost(signedPost(rawBody), {
    env,
  });
  const result = await readJson(response);

  assert.equal(result.status, 400);
  assert.equal(result.body.code, "invalid_json");
});

test("whatsapp webhook POST con payload demasiado grande devuelve 413", async () => {
  const rawBody = JSON.stringify(inboundPayload);
  const response = await handleMetaWhatsappWebhookPost(signedPost(rawBody), {
    env: { ...env, BOT_WEBHOOK_MAX_BODY_BYTES: "5" },
  });
  const result = await readJson(response);

  assert.equal(result.status, 413);
  assert.equal(result.body.code, "payload_too_large");
});

test("whatsapp webhook POST con recepcion apagada responde 200 sin guardar", async () => {
  const rawBody = JSON.stringify(inboundPayload);
  const spy = repositorySpy();
  const response = await handleMetaWhatsappWebhookPost(signedPost(rawBody), {
    env: { ...env, BOT_WEBHOOK_RECEIVE_ENABLED: "false" },
    repository: spy.repository,
  });
  const result = await readJson(response);

  assert.equal(result.status, 200);
  assert.equal(result.body.code, "receive_disabled");
  assert.equal(spy.calls.length, 0);
});

test("whatsapp webhook POST registra mensaje entrante sin contenido sensible", async () => {
  const rawBody = JSON.stringify(inboundPayload);
  const spy = repositorySpy();
  const response = await handleMetaWhatsappWebhookPost(signedPost(rawBody), {
    env,
    repository: spy.repository,
    now: "2026-07-29T12:00:00.000Z",
  });
  const result = await readJson(response);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.eventTypes, ["message_inbound"]);
  assert.equal(spy.calls.length, 1);
  assert.equal(spy.calls[0][0].providerMessageId, "wamid.HBgLMTIzNDU2");

  const serialized = JSON.stringify(spy.calls);
  assert.doesNotMatch(serialized, /Hola, quiero una cita/);
  assert.doesNotMatch(serialized, /529998887766/);
  assert.doesNotMatch(serialized, /529991112233/);
  assert.doesNotMatch(serialized, /Nombre Personal/);
  assert.doesNotMatch(serialized, /app_secret_de_prueba/);
});

test("whatsapp webhook POST clasifica status de entrega", async () => {
  const rawBody = JSON.stringify(statusPayload);
  const spy = repositorySpy();
  const response = await handleMetaWhatsappWebhookPost(signedPost(rawBody), {
    env,
    repository: spy.repository,
  });
  const result = await readJson(response);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.eventTypes, ["message_status"]);
  assert.equal(spy.calls[0][0].providerMessageId, null);
});

test("whatsapp webhook POST clasifica evento sin mensajes", async () => {
  const rawBody = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "entry_1", changes: [{ field: "account_update", value: {} }] }],
  });
  const spy = repositorySpy();
  const response = await handleMetaWhatsappWebhookPost(signedPost(rawBody), {
    env,
    repository: spy.repository,
  });
  const result = await readJson(response);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.eventTypes, ["event_without_messages"]);
});

test("whatsapp webhook POST clasifica evento desconocido valido", async () => {
  const rawBody = JSON.stringify({ object: "whatsapp_business_account" });
  const spy = repositorySpy();
  const response = await handleMetaWhatsappWebhookPost(signedPost(rawBody), {
    env,
    repository: spy.repository,
  });
  const result = await readJson(response);

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.eventTypes, ["unknown"]);
});

test("la fase local no envia mensajes, no conversa, no consulta disponibilidad ni crea citas", () => {
  const files = [
    "../app/api/bot/whatsapp/webhook/route.js",
    "../app/lib/whatsapp/verifyMetaWebhook.js",
    "../app/lib/whatsapp/parseMetaWebhookEvent.js",
    "../app/lib/whatsapp/redactWebhookPayload.js",
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
  assert.doesNotMatch(source, /appointment_write_operations/);
  assert.doesNotMatch(source, /payments/);
  assert.doesNotMatch(source, /console\.(log|warn|error)/);
});

