const RPC_NAME = "create_bot_appointment_transaction";

const ALLOWED_RPC_STATUSES = new Set([
  "created",
  "already_created",
  "not_available",
  "invalid_service",
  "invalid_staff",
  "invalid_request",
  "idempotency_conflict",
  "deposit_pending",
  "human_review",
  "failed",
]);

function clean(value) {
  return String(value || "").trim();
}

function timeToMinutes(value) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function sameTime(left, right) {
  const leftMinutes = timeToMinutes(left);
  const rightMinutes = timeToMinutes(right);
  return leftMinutes !== null && leftMinutes === rightMinutes;
}

function safeFailure(code = "transaction_failed") {
  return {
    status: "failed",
    appointmentId: null,
    clientId: null,
    idempotencyKey: "",
    isReplay: false,
    servicesCreated: 0,
    errorCode: code,
    errorMessage: "No se pudo completar la creación de la cita.",
  };
}

function normalizeRpcPayload(payload, expected) {
  const source = Array.isArray(payload) ? payload[0] : payload;
  if (!source || typeof source !== "object") {
    return safeFailure("invalid_rpc_response");
  }

  const status = ALLOWED_RPC_STATUSES.has(source.status)
    ? source.status
    : "failed";
  const normalized = {
    status,
    appointmentId: clean(source.appointmentId) || null,
    clientId: clean(source.clientId) || null,
    idempotencyKey: clean(source.idempotencyKey),
    requestHash: clean(source.requestHash) || null,
    isReplay: source.isReplay === true,
    servicesCreated: Number.isInteger(Number(source.servicesCreated))
      ? Number(source.servicesCreated)
      : 0,
    date: clean(source.date) || null,
    startTime: clean(source.startTime) || null,
    endTime: clean(source.endTime) || null,
    staffId: clean(source.staffId) || null,
    errorCode: clean(source.errorCode) || null,
    errorMessage:
      status === "created" || status === "already_created"
        ? null
        : clean(source.errorMessage) ||
          "No se pudo completar la creación de la cita.",
  };

  if (!["created", "already_created"].includes(status)) {
    return normalized;
  }

  const creationIsComplete =
    Boolean(normalized.appointmentId) &&
    normalized.servicesCreated >= 1 &&
    normalized.idempotencyKey === expected.idempotencyKey &&
    normalized.date === expected.date &&
    sameTime(normalized.startTime, expected.startTime) &&
    sameTime(normalized.endTime, expected.endTime) &&
    normalized.staffId === expected.staffId;

  if (!creationIsComplete) {
    return {
      ...safeFailure("incomplete_rpc_response"),
      idempotencyKey: normalized.idempotencyKey,
      isReplay: normalized.isReplay,
    };
  }

  return normalized;
}

export function botAppointmentWritesEnabled(env = process.env) {
  return env?.BOT_APPOINTMENT_WRITES_ENABLED === "true";
}

export function createProductionBotAppointmentRepository({
  supabase,
  env = process.env,
}) {
  if (!supabase?.rpc) {
    throw new Error("A Supabase server client with RPC support is required.");
  }

  return {
    mode: "production_rpc",
    writesEnabled: botAppointmentWritesEnabled(env),

    async createAppointmentTransaction({ draft, idempotencyKey }) {
      if (!botAppointmentWritesEnabled(env)) {
        return {
          ...safeFailure("write_disabled"),
          status: "write_disabled",
          idempotencyKey: clean(idempotencyKey),
          errorMessage: "La creación real de citas está desactivada.",
        };
      }

      const participantId = clean(draft?.participants?.[0]?.id);
      const expected = {
        idempotencyKey: clean(idempotencyKey),
        date: clean(draft?.date),
        startTime: clean(draft?.startTime),
        endTime: clean(draft?.endTime),
        staffId: clean(draft?.staff?.id),
      };
      const parameters = {
        p_idempotency_key: expected.idempotencyKey,
        p_conversation_id: clean(draft?.conversationId),
        p_preview_id: clean(draft?.previewId),
        p_confirmation_id: clean(draft?.confirmation?.id),
        p_preview_version: Number(draft?.version || 0),
        p_preview_fingerprint: clean(draft?.fingerprint),
        p_client_id: clean(draft?.customer?.id) || null,
        p_client_name: clean(draft?.customer?.name) || null,
        p_client_phone: clean(draft?.customer?.phone) || null,
        p_services: (draft?.services || []).map((service) => ({
          serviceId: clean(service?.id),
          participantId: clean(service?.participantId),
          durationMinutes: Number(service?.durationMinutes || 0),
          cleanupMinutes: Number(service?.cleanupMinutes || 0),
          price: Number(service?.price),
        })),
        p_participant_id: participantId,
        p_appointment_date: expected.date,
        p_start_time: expected.startTime,
        p_expected_end_time: expected.endTime,
        p_staff_id: expected.staffId,
        p_expected_price: Number(draft?.expectedPrice),
        p_deposit_status: clean(draft?.depositStatus) || "unknown",
        p_preview_expires_at: clean(draft?.expiresAt) || null,
      };

      try {
        const { data, error } = await supabase.rpc(RPC_NAME, parameters);
        if (error) return safeFailure("rpc_unavailable");
        return normalizeRpcPayload(data, expected);
      } catch {
        return safeFailure("rpc_unavailable");
      }
    },
  };
}

export const BOT_APPOINTMENT_RPC_NAME = RPC_NAME;
