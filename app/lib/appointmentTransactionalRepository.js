import { exactServerFlagEnabled } from "./appointmentWriteService.js";

const RPC_NAME = "create_appointment_transaction";

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
  "write_disabled",
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

function safeFailure(code = "transaction_failed", idempotencyKey = "") {
  return {
    status: "failed",
    appointmentId: null,
    clientId: null,
    idempotencyKey: clean(idempotencyKey),
    isReplay: false,
    servicesCreated: 0,
    errorCode: code,
    errorMessage: "No se pudo completar la creación de la cita.",
  };
}

function normalizeRpcPayload(payload, expected) {
  const source = Array.isArray(payload) ? payload[0] : payload;
  if (!source || typeof source !== "object") {
    return safeFailure("invalid_rpc_response", expected.idempotencyKey);
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

  if (!["created", "already_created"].includes(status)) return normalized;

  const complete =
    Boolean(normalized.appointmentId) &&
    normalized.servicesCreated >= 1 &&
    normalized.idempotencyKey === expected.idempotencyKey &&
    normalized.date === expected.date &&
    sameTime(normalized.startTime, expected.startTime) &&
    sameTime(normalized.endTime, expected.endTime) &&
    normalized.staffId === expected.staffId;

  if (!complete) {
    return {
      ...safeFailure("incomplete_rpc_response", normalized.idempotencyKey),
      isReplay: normalized.isReplay,
    };
  }
  return normalized;
}

export function appointmentTransactionalWritesEnabled(env = process.env) {
  return exactServerFlagEnabled(
    "APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED",
    env
  );
}

export function createAppointmentTransactionalRepository({
  supabase,
  env = process.env,
}) {
  if (!supabase?.rpc) {
    throw new Error("A Supabase server client with RPC support is required.");
  }

  return {
    mode: "transactional_rpc",
    writesEnabled: appointmentTransactionalWritesEnabled(env),

    async createAppointmentTransaction({ contract, idempotencyKey }) {
      if (!appointmentTransactionalWritesEnabled(env)) {
        return {
          ...safeFailure("write_disabled", idempotencyKey),
          status: "write_disabled",
          errorMessage: "La creación real de citas está desactivada.",
        };
      }

      const expected = {
        idempotencyKey: clean(idempotencyKey),
        date: clean(contract?.date),
        startTime: clean(contract?.startTime),
        endTime: clean(contract?.endTime),
        staffId: clean(contract?.staffId),
      };
      const parameters = {
        p_source: clean(contract?.source),
        p_actor_id: clean(contract?.actorId) || null,
        p_idempotency_key: expected.idempotencyKey,
        p_conversation_id: clean(contract?.conversationId) || null,
        p_preview_id: clean(contract?.previewId),
        p_confirmation_id: clean(contract?.confirmationId),
        p_preview_version: Number(contract?.previewVersion || 0),
        p_preview_fingerprint:
          clean(contract?.confirmationFingerprint) ||
          clean(contract?.requestHash),
        p_client_id: clean(contract?.client?.id) || null,
        p_client_name: clean(contract?.client?.name) || null,
        p_client_phone: clean(contract?.client?.phone) || null,
        p_services: (contract?.services || []).map((service) => ({
          serviceId: clean(service?.id),
          participantId: clean(service?.participantId),
          durationMinutes: Number(service?.durationMinutes || 0),
          cleanupMinutes: Number(service?.cleanupMinutes || 0),
          price: Number(service?.price),
        })),
        p_extras: (contract?.extras || []).map((extra) => ({
          extraId: clean(extra?.id),
          name: clean(extra?.name),
          staffId: clean(extra?.staffId) || null,
          quantity: Number(extra?.quantity || 0),
          unitPrice: Number(extra?.unitPrice),
          totalPrice: Number(extra?.totalPrice),
          notes: clean(extra?.notes) || null,
        })),
        p_participant_id: clean(contract?.participant?.id),
        p_appointment_date: expected.date,
        p_start_time: expected.startTime,
        p_expected_end_time: expected.endTime,
        p_staff_id: expected.staffId,
        p_expected_price: Number(contract?.expectedPrice),
        p_deposit_status: clean(contract?.depositStatus) || "unknown",
        p_preview_expires_at: clean(contract?.previewExpiresAt) || null,
        p_force_created: contract?.forceCreated === true,
        p_notes: clean(contract?.notes) || null,
      };

      try {
        const { data, error } = await supabase.rpc(RPC_NAME, parameters);
        if (error) {
          return safeFailure("rpc_unavailable", expected.idempotencyKey);
        }
        return normalizeRpcPayload(data, expected);
      } catch {
        return safeFailure("rpc_unavailable", expected.idempotencyKey);
      }
    },
  };
}

export const APPOINTMENT_TRANSACTION_RPC_NAME = RPC_NAME;
