import { NextResponse } from "next/server.js";
import { createAdminClient } from "../../../../lib/pushServer.js";
import { validateAppointmentDraft } from "../../../../lib/botAppointmentOrchestrator.js";
import { botAppointmentWritesEnabled } from "../../../../lib/botAppointmentProductionRepository.js";
import { authenticateInternalBotRequest } from "../../../../lib/botInternalRequestAuth.js";
import {
  createAppointmentFromBot,
  prepareBotAppointmentContract,
} from "../../../../lib/appointmentChannelAdapters.js";
import { createAppointmentTransactionalRepository } from "../../../../lib/appointmentTransactionalRepository.js";

const ALLOWED_BODY_KEYS = new Set([
  "conversationId",
  "previewId",
  "confirmationId",
  "requestHash",
]);
const CLIENT_WRITE_CONTROL_KEYS = new Set([
  "writesEnabled",
  "allowRealWrite",
  "allow_real_write",
  "bypass",
  "admin",
  "confirmed",
  "appointmentDraft",
  "draft",
]);

function clean(value) {
  return String(value || "").trim();
}

function json(body, status = 200) {
  return NextResponse.json(body, { status });
}

function safeError(status, code, message) {
  return json(
    {
      ok: false,
      status: "rejected",
      code,
      message,
    },
    status
  );
}

function validateRequestBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, code: "invalid_request" };
  }

  const keys = Object.keys(body);
  if (
    keys.some(
      (key) =>
        CLIENT_WRITE_CONTROL_KEYS.has(key) || !ALLOWED_BODY_KEYS.has(key)
    )
  ) {
    return { ok: false, code: "unsupported_request_fields" };
  }

  const normalized = {
    conversationId: clean(body.conversationId),
    previewId: clean(body.previewId),
    confirmationId: clean(body.confirmationId),
    requestHash: clean(body.requestHash),
  };
  if (Object.values(normalized).some((value) => !value)) {
    return { ok: false, code: "confirmation_identity_required" };
  }

  return { ok: true, body: normalized };
}

async function loadProductionContext(supabase, conversationId) {
  const [settingsResult, conversationResult] = await Promise.all([
    supabase.from("bot_settings").select("active").limit(1).maybeSingle(),
    supabase
      .from("bot_conversations")
      .select(
        "id, bot_enabled, handoff_to_human, conversation_context"
      )
      .eq("id", conversationId)
      .maybeSingle(),
  ]);

  if (settingsResult.error || conversationResult.error) {
    throw new Error("bot_context_unavailable");
  }

  return {
    settings: settingsResult.data || null,
    conversation: conversationResult.data || null,
  };
}

function validatePersistedConfirmation({ body, conversation, now }) {
  if (!conversation || clean(conversation.id) !== body.conversationId) {
    return { ok: false, code: "conversation_not_found" };
  }
  if (
    conversation.bot_enabled === false ||
    conversation.handoff_to_human === true
  ) {
    return { ok: false, code: "conversation_requires_review" };
  }

  const draft =
    conversation.conversation_context?.conversation_engine_state
      ?.appointmentDraft || null;
  if (!draft) return { ok: false, code: "preview_not_found" };

  if (
    clean(draft.conversationId) !== body.conversationId ||
    clean(draft.previewId) !== body.previewId ||
    clean(draft.confirmation?.id) !== body.confirmationId ||
    clean(draft.confirmation?.previewId) !== body.previewId ||
    clean(draft.fingerprint) !== body.requestHash ||
    clean(draft.confirmation?.fingerprint) !== body.requestHash
  ) {
    return { ok: false, code: "confirmation_mismatch" };
  }

  const validation = validateAppointmentDraft({ draft, now });
  if (!validation.ok) {
    return { ok: false, code: validation.code };
  }

  if (
    !["customer_confirmed", "ready_for_write"].includes(draft.status)
  ) {
    return { ok: false, code: "explicit_confirmation_required" };
  }

  return { ok: true, draft };
}

export async function handleBotAppointmentConfirmation(
  request,
  dependencies = {}
) {
  const env = dependencies.env || process.env;
  if (!botAppointmentWritesEnabled(env)) {
    return safeError(
      503,
      "write_disabled",
      "La creación automática de citas está desactivada."
    );
  }

  const authenticate =
    dependencies.authenticateRequest ||
    ((currentRequest) =>
      authenticateInternalBotRequest({
        request: currentRequest,
        verifier: dependencies.authVerifier,
      }));
  const authorization = await authenticate(request);
  if (authorization?.ok !== true) {
    return safeError(
      authorization?.status === 403 ? 403 : 401,
      "not_authorized",
      "La solicitud no está autorizada."
    );
  }

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return safeError(400, "invalid_request", "La solicitud no es válida.");
  }

  const parsed = validateRequestBody(rawBody);
  if (!parsed.ok) {
    return safeError(400, parsed.code, "La solicitud no es válida.");
  }

  const supabase =
    dependencies.supabase ||
    (dependencies.createSupabase || createAdminClient)();
  const loadContext = dependencies.loadContext || loadProductionContext;

  let context;
  try {
    context = await loadContext(supabase, parsed.body.conversationId);
  } catch {
    return safeError(
      503,
      "context_unavailable",
      "No se pudo revisar la solicitud en este momento."
    );
  }

  if (context?.settings?.active !== true) {
    return safeError(
      409,
      "bot_inactive",
      "El bot está desactivado. Esta conversación debe atenderse manualmente."
    );
  }

  const confirmation = validatePersistedConfirmation({
    body: parsed.body,
    conversation: context?.conversation,
    now: dependencies.now || new Date(),
  });
  if (!confirmation.ok) {
    return safeError(
      409,
      confirmation.code,
      "La vista previa debe revisarse y confirmarse nuevamente."
    );
  }

  const repositoryFactory =
    dependencies.createRepository ||
    ((options) => createAppointmentTransactionalRepository(options));
  const repository = repositoryFactory({ supabase, env });
  const result = await createAppointmentFromBot({
    input: prepareBotAppointmentContract(
      confirmation.draft,
      authorization?.actorId || authorization?.user?.id || ""
    ),
    env,
    transactionalRepository: repository,
    now: dependencies.now || new Date(),
  });

  if (!result.ok) {
    const status =
      result.status === "human_review" ||
      result.code === "availability_changed" ||
      result.status === "not_available"
        ? 409
        : 422;
    return safeError(
      status,
      result.code || "creation_failed",
      result.status === "human_review"
        ? "La solicitud requiere revisión del equipo."
        : "No se pudo crear la cita. Revisa los datos e inténtalo nuevamente."
    );
  }

  return json(
    {
      ok: true,
      status: "created",
      code: result.code,
      appointmentId: result.appointmentId,
      servicesCreated: Number(result.servicesCreated || 0),
      isReplay: result.isReplay === true,
    },
    result.isReplay ? 200 : 201
  );
}

export async function POST(request) {
  return handleBotAppointmentConfirmation(request);
}
