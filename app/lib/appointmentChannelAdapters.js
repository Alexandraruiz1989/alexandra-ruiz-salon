import {
  appointmentContractFingerprint,
  buildClientPortalPreview,
  normalizeAppointmentWriteContract,
} from "./appointmentWriteContracts.js";
import { executeAppointmentWrite } from "./appointmentWriteService.js";

export function prepareAdminAppointmentContract({
  actorId,
  eventId,
  client,
  services,
  extras = [],
  date,
  startTime,
  endTime,
  staffId,
  expectedPrice,
  depositStatus = "unknown",
  forceCreated = false,
  notes = "",
}) {
  const base = normalizeAppointmentWriteContract({
    source: "admin",
    actorId,
    eventId,
    client,
    participant: { id: "person_1", label: client?.name || "clienta" },
    services,
    extras,
    date,
    startTime,
    endTime,
    staffId,
    expectedPrice,
    depositStatus,
    forceCreated,
    previewId: `admin_preview_${eventId}`,
    confirmationId: `admin_confirmation_${eventId}`,
    previewVersion: 1,
  });
  return {
    ...base,
    requestHash: appointmentContractFingerprint(base),
  };
}

export function prepareClientPortalAppointment(input) {
  return buildClientPortalPreview(input);
}

export function prepareBotAppointmentContract(draft, actorId = "") {
  const base = normalizeAppointmentWriteContract({
    source: "bot",
    actorId,
    conversationId: draft?.conversationId,
    client: {
      id: draft?.customer?.id,
      name: draft?.customer?.name,
      phone: draft?.customer?.phone,
    },
    participant: draft?.participants?.[0],
    participantCount: draft?.participants?.length || 1,
    services: (draft?.services || []).map((service) => ({
      ...service,
      staffId: draft?.staff?.id,
    })),
    date: draft?.date,
    startTime: draft?.startTime,
    endTime: draft?.endTime,
    staffId: draft?.staff?.id,
    previewId: draft?.previewId,
    previewVersion: draft?.version,
    previewExpiresAt: draft?.expiresAt,
    confirmationId: draft?.confirmation?.id,
    expectedPrice: draft?.expectedPrice,
    depositStatus: draft?.depositStatus,
  });
  return {
    ...base,
    requestHash: appointmentContractFingerprint(base),
    confirmationFingerprint: String(draft?.fingerprint || "").trim(),
  };
}

export async function createAppointmentFromAdmin(options) {
  return executeAppointmentWrite({
    ...options,
    input: { ...options.input, source: "admin" },
  });
}

export async function confirmClientPortalAppointment(options) {
  return executeAppointmentWrite({
    ...options,
    input: { ...options.input, source: "client_portal" },
  });
}

export async function createAppointmentFromBot(options) {
  return executeAppointmentWrite({
    ...options,
    legacyWriter: undefined,
    input: { ...options.input, source: "bot" },
  });
}
