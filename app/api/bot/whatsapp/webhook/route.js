import { NextResponse } from "next/server.js";
import { createAdminClient } from "../../../../lib/pushServer.js";
import { createBotWebhookEventRepository } from "../../../../lib/whatsapp/botWebhookEventRepository.js";
import { buildRedactedWebhookEvents } from "../../../../lib/whatsapp/redactWebhookPayload.js";
import {
  getConfiguredMaxBodyBytes,
  getRawBodyByteLength,
  validateMetaWebhookChallenge,
  validateMetaWebhookSignature,
} from "../../../../lib/whatsapp/verifyMetaWebhook.js";

export const runtime = "nodejs";

function json(body, status = 200) {
  return NextResponse.json(body, { status });
}

function safeError(status, code) {
  return json(
    {
      ok: false,
      code,
    },
    status
  );
}

function isReceiveEnabled(env = process.env) {
  return env.BOT_WEBHOOK_RECEIVE_ENABLED === "true";
}

function parseJson(rawBody) {
  try {
    return { ok: true, payload: JSON.parse(rawBody) };
  } catch {
    return { ok: false, code: "invalid_json" };
  }
}

export async function handleMetaWhatsappWebhookGet(request, dependencies = {}) {
  const env = dependencies.env || process.env;
  const verification = validateMetaWebhookChallenge({
    url: request.url,
    env,
  });

  if (!verification.ok) {
    return new Response(verification.code, {
      status: verification.status,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(verification.challenge, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function handleMetaWhatsappWebhookPost(
  request,
  dependencies = {}
) {
  const env = dependencies.env || process.env;
  const rawBody = await request.text();
  const maxBodyBytes = getConfiguredMaxBodyBytes(env);
  const bodyBytes = getRawBodyByteLength(rawBody);

  if (bodyBytes > maxBodyBytes) {
    return safeError(413, "payload_too_large");
  }

  const signature = validateMetaWebhookSignature({
    rawBody,
    signatureHeader: request.headers.get("x-hub-signature-256"),
    appSecret: env.META_APP_SECRET,
  });

  if (!signature.ok) {
    return safeError(signature.status || 403, signature.code);
  }

  if (!isReceiveEnabled(env)) {
    return json({
      ok: true,
      status: "ignored",
      code: "receive_disabled",
    });
  }

  const parsed = parseJson(rawBody);
  if (!parsed.ok) {
    return safeError(400, parsed.code);
  }

  const now =
    typeof dependencies.now === "function"
      ? dependencies.now()
      : dependencies.now || new Date().toISOString();
  const events = buildRedactedWebhookEvents({
    payload: parsed.payload,
    rawBody,
    appSecret: env.META_APP_SECRET,
    receivedAt: now,
  });

  const repository =
    dependencies.repository ||
    createBotWebhookEventRepository({
      supabase:
        dependencies.supabase ||
        (dependencies.createSupabase || createAdminClient)(),
    });

  try {
    const result = await repository.recordEvents(events, { now });
    return json({
      ok: true,
      status: "received",
      received: result.received,
      duplicate: result.duplicate,
      eventTypes: events.map((event) => event.eventType),
    });
  } catch {
    return safeError(503, "webhook_event_store_failed");
  }
}

export async function GET(request) {
  return handleMetaWhatsappWebhookGet(request);
}

export async function POST(request) {
  return handleMetaWhatsappWebhookPost(request);
}
