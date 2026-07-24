import {
  buildAppointmentIdempotencyKey,
  normalizeAppointmentWriteContract,
  validateAppointmentWriteContract,
} from "./appointmentWriteContracts.js";

const inFlightWrites = new Map();

export function exactServerFlagEnabled(name, env = process.env) {
  return env?.[name] === "true";
}

export function getAppointmentWriteMode(source, env = process.env) {
  const sharedEnabled = exactServerFlagEnabled(
    "APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED",
    env
  );
  const channelFlag =
    source === "admin"
      ? "APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED"
      : source === "client_portal"
      ? "APPOINTMENT_PORTAL_TRANSACTIONAL_WRITES_ENABLED"
      : source === "bot"
      ? "BOT_APPOINTMENT_WRITES_ENABLED"
      : "";
  const channelEnabled =
    Boolean(channelFlag) && exactServerFlagEnabled(channelFlag, env);
  if (sharedEnabled && channelEnabled) return "transactional";
  return source === "bot" ? "write_disabled" : "legacy";
}

function safeResult({
  ok = false,
  source,
  mode,
  status = "failed",
  code = "write_failed",
  appointmentId = null,
  clientId = null,
  servicesCreated = 0,
  isReplay = false,
  idempotencyKey = "",
  errorMessage = null,
}) {
  return {
    ok,
    source,
    mode,
    status,
    code,
    appointmentId,
    clientId,
    servicesCreated: Number(servicesCreated || 0),
    isReplay,
    idempotencyKey,
    errorMessage:
      errorMessage ||
      (ok ? null : "No se pudo completar la creación de la cita."),
  };
}

function normalizeWriterResult(result, context) {
  const status = String(result?.status || "failed");
  const created = ["created", "already_created"].includes(status);
  const appointmentId = String(result?.appointmentId || "").trim() || null;
  const servicesCreated = Number(result?.servicesCreated || 0);
  if (created && (!appointmentId || servicesCreated < 1)) {
    return safeResult({
      ...context,
      code: "incomplete_write_result",
      status: "failed",
    });
  }
  return safeResult({
    ...context,
    ok: created,
    status,
    code:
      result?.errorCode ||
      result?.code ||
      (status === "already_created"
        ? "idempotent_replay"
        : created
        ? "created_and_verified"
        : status),
    appointmentId,
    clientId: String(result?.clientId || "").trim() || null,
    servicesCreated,
    isReplay: status === "already_created" || result?.isReplay === true,
    errorMessage: created
      ? null
      : result?.errorMessage ||
        "No se pudo completar la creación de la cita.",
  });
}

async function executeOnce(idempotencyKey, operation) {
  const existing = inFlightWrites.get(idempotencyKey);
  if (existing) {
    const result = await existing;
    return {
      ...result,
      isReplay: true,
      code: result.ok ? "in_flight_replay" : result.code,
    };
  }
  const promise = operation();
  inFlightWrites.set(idempotencyKey, promise);
  try {
    return await promise;
  } finally {
    inFlightWrites.delete(idempotencyKey);
  }
}

export async function executeAppointmentWrite({
  input,
  env = process.env,
  transactionalRepository,
  legacyWriter,
  now = new Date(),
}) {
  const source = String(input?.source || "").trim();
  const mode = getAppointmentWriteMode(source, env);
  const validation = validateAppointmentWriteContract(input, {
    transactional: mode === "transactional",
    now,
  });
  if (!validation.ok) {
    return safeResult({
      source,
      mode,
      status: validation.code === "human_review" ? "human_review" : "failed",
      code: validation.code,
      errorMessage:
        validation.code === "human_review"
          ? "La solicitud requiere revisión del equipo."
          : "La solicitud de cita no es válida.",
    });
  }

  const contract = normalizeAppointmentWriteContract(validation.contract);
  const idempotencyKey = buildAppointmentIdempotencyKey(contract);
  if (!idempotencyKey) {
    return safeResult({
      source,
      mode,
      code: "idempotency_identity_required",
    });
  }

  if (mode === "write_disabled") {
    return safeResult({
      source,
      mode,
      status: "write_disabled",
      code: "write_disabled",
      idempotencyKey,
      errorMessage: "La creación automática de citas está desactivada.",
    });
  }

  if (mode === "transactional") {
    if (typeof transactionalRepository?.createAppointmentTransaction !== "function") {
      return safeResult({
        source,
        mode,
        code: "transactional_repository_unavailable",
        idempotencyKey,
      });
    }
    return executeOnce(idempotencyKey, async () => {
      try {
        const result =
          await transactionalRepository.createAppointmentTransaction({
            contract,
            idempotencyKey,
          });
        return normalizeWriterResult(result, {
          source,
          mode,
          idempotencyKey,
        });
      } catch {
        return safeResult({
          source,
          mode,
          code: "transactional_write_failed",
          idempotencyKey,
        });
      }
    });
  }

  if (source === "bot") {
    return safeResult({
      source,
      mode: "write_disabled",
      status: "write_disabled",
      code: "bot_legacy_writer_forbidden",
      idempotencyKey,
    });
  }
  if (typeof legacyWriter !== "function") {
    return safeResult({
      source,
      mode,
      code: "legacy_writer_unavailable",
      idempotencyKey,
    });
  }

  return executeOnce(idempotencyKey, async () => {
    try {
      const result = await legacyWriter({ contract, idempotencyKey });
      return normalizeWriterResult(result, {
        source,
        mode,
        idempotencyKey,
      });
    } catch {
      return safeResult({
        source,
        mode,
        code: "legacy_write_failed",
        idempotencyKey,
      });
    }
  });
}

export function clearAppointmentWriteInFlightForTests() {
  inFlightWrites.clear();
}
