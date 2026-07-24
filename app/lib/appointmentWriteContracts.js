export const APPOINTMENT_WRITE_SOURCES = Object.freeze([
  "admin",
  "client_portal",
  "bot",
]);

export const APPOINTMENT_DEPOSIT_STATUSES = Object.freeze([
  "not_required",
  "required_pending",
  "proof_received",
  "verified",
  "rejected",
  "unknown",
]);

const APPOINTMENT_SOURCE_SET = new Set(APPOINTMENT_WRITE_SOURCES);
const DEPOSIT_STATUS_SET = new Set(APPOINTMENT_DEPOSIT_STATUSES);
const FORBIDDEN_WRITE_CONTROL_FIELDS = new Set([
  "writesEnabled",
  "allowRealWrite",
  "allow_real_write",
  "bypass",
]);
const DEFAULT_PREVIEW_TTL_MS = 15 * 60 * 1000;

export function cleanAppointmentValue(value) {
  return String(value || "").trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }
  return value ?? null;
}

function stableHash(value) {
  const text = JSON.stringify(canonicalize(value));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizedService(service, fallbackStaffId = "") {
  const price = numberOrNull(
    service?.price ?? service?.base_price ?? service?.unit_price
  );
  return {
    id: cleanAppointmentValue(service?.id || service?.service_id),
    name: cleanAppointmentValue(service?.name),
    staffId: cleanAppointmentValue(
      service?.staffId || service?.staff_id || fallbackStaffId
    ),
    participantId:
      cleanAppointmentValue(
        service?.participantId || service?.participant_id
      ) || "person_1",
    durationMinutes: Number(
      service?.durationMinutes ?? service?.duration_minutes ?? 0
    ),
    cleanupMinutes: Number(
      service?.cleanupMinutes ?? service?.cleanup_minutes ?? 0
    ),
    price,
    priceType:
      cleanAppointmentValue(service?.priceType) ||
      (service?.variable_pricing === true
        ? "variable"
        : price === null
        ? "hidden"
        : "fixed"),
    active: service?.active !== false,
    bookable:
      service?.bookable !== false &&
      service?.bot_bookable !== false &&
      service?.bookingMode !== "information_only",
    internal:
      service?.internal === true ||
      service?.visibility === "internal" ||
      (service?.service_type &&
        cleanAppointmentValue(service.service_type) !== "servicio"),
    requiresHumanReview:
      service?.requiresHumanReview === true ||
      service?.bookingMode === "requires_human_review",
  };
}

function normalizedExtra(extra, fallbackStaffId = "") {
  const quantity = numberOrNull(extra?.quantity) ?? 1;
  const unitPrice = numberOrNull(
    extra?.unitPrice ?? extra?.unit_price ?? extra?.price
  );
  return {
    id: cleanAppointmentValue(extra?.id || extra?.extraId || extra?.extra_id),
    name: cleanAppointmentValue(extra?.name),
    staffId: cleanAppointmentValue(
      extra?.staffId || extra?.staff_id || fallbackStaffId
    ),
    quantity,
    unitPrice,
    totalPrice:
      unitPrice === null ? null : Number((quantity * unitPrice).toFixed(2)),
    notes: cleanAppointmentValue(extra?.notes),
    active: extra?.active !== false,
  };
}

function normalizedParticipant(input) {
  const participant =
    input?.participant || input?.participants?.[0] || { id: "person_1" };
  return {
    id: cleanAppointmentValue(participant?.id) || "person_1",
    label:
      cleanAppointmentValue(participant?.label) ||
      cleanAppointmentValue(input?.client?.name) ||
      "clienta",
  };
}

export function hasForbiddenWriteControls(input) {
  if (!input || typeof input !== "object") return false;
  return Object.keys(input).some((key) =>
    FORBIDDEN_WRITE_CONTROL_FIELDS.has(key)
  );
}

export function normalizeAppointmentWriteContract(input = {}) {
  const source = cleanAppointmentValue(input.source);
  const staffId = cleanAppointmentValue(
    input.staffId || input.staff_id || input.staff?.id
  );
  const services = (input.services || []).map((service) =>
    normalizedService(service, staffId)
  );
  const extras = (input.extras || []).map((extra) =>
    normalizedExtra(extra, staffId)
  );
  const participant = normalizedParticipant(input);
  const expectedPrice =
    numberOrNull(input.expectedPrice) ??
    services.reduce((sum, service) => sum + Number(service.price || 0), 0) +
      extras.reduce(
        (sum, extra) => sum + Number(extra.totalPrice || 0),
        0
      );
  const depositStatus = DEPOSIT_STATUS_SET.has(input.depositStatus)
    ? input.depositStatus
    : "unknown";

  return {
    source,
    actorId: cleanAppointmentValue(input.actorId),
    eventId: cleanAppointmentValue(input.eventId),
    conversationId: cleanAppointmentValue(input.conversationId),
    client: {
      id: cleanAppointmentValue(input.client?.id),
      name: cleanAppointmentValue(
        input.client?.name || input.client?.full_name
      ),
      phone: cleanAppointmentValue(input.client?.phone),
    },
    participant,
    participantCount: Number(
      input.participantCount || input.participants?.length || 1
    ),
    services,
    extras,
    date: cleanAppointmentValue(input.date || input.appointment_date),
    startTime: cleanAppointmentValue(input.startTime || input.start_time),
    endTime: cleanAppointmentValue(input.endTime || input.end_time),
    staffId:
      staffId ||
      cleanAppointmentValue(services[0]?.staffId),
    previewId: cleanAppointmentValue(input.previewId),
    previewVersion: Number(input.previewVersion || input.version || 1),
    previewExpiresAt: cleanAppointmentValue(
      input.previewExpiresAt || input.expiresAt
    ),
    confirmationId: cleanAppointmentValue(input.confirmationId),
    requestHash: cleanAppointmentValue(
      input.requestHash || input.fingerprint
    ),
    confirmationFingerprint: cleanAppointmentValue(
      input.confirmationFingerprint
    ),
    expectedPrice,
    depositStatus,
    depositRequiredForWrite: input.depositRequiredForWrite === true,
    forceCreated: input.forceCreated === true,
    notes: cleanAppointmentValue(input.notes),
  };
}

export function appointmentContractFingerprint(input) {
  const contract = normalizeAppointmentWriteContract(input);
  return `aw_${stableHash({
    source: contract.source,
    actorId: contract.actorId,
    conversationId: contract.conversationId,
    clientId: contract.client.id,
    clientName: contract.client.name,
    clientPhone: contract.client.phone,
    participant: contract.participant,
    participantCount: contract.participantCount,
    services: contract.services,
    extras: contract.extras,
    date: contract.date,
    startTime: contract.startTime,
    endTime: contract.endTime,
    staffId: contract.staffId,
    previewVersion: contract.previewVersion,
    expectedPrice: contract.expectedPrice,
    depositStatus: contract.depositStatus,
    forceCreated: contract.forceCreated,
  })}`;
}

export function buildAppointmentIdempotencyKey(input) {
  const contract = normalizeAppointmentWriteContract(input);
  const identity =
    contract.source === "admin"
      ? contract.eventId || contract.confirmationId || contract.previewId
      : [
          contract.conversationId || contract.actorId,
          contract.previewId,
          contract.confirmationId,
        ]
          .filter(Boolean)
          .join(":");
  if (!contract.source || !identity) return "";
  return `${contract.source}:${identity}`;
}

export function validateAppointmentWriteContract(
  input,
  { transactional = true, now = new Date() } = {}
) {
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      code: "invalid_request",
      errors: ["contract_required"],
    };
  }
  if (hasForbiddenWriteControls(input)) {
    return {
      ok: false,
      code: "unsupported_write_control",
      errors: ["client_write_control_rejected"],
    };
  }

  const contract = normalizeAppointmentWriteContract(input);
  const errors = [];
  if (!APPOINTMENT_SOURCE_SET.has(contract.source)) {
    errors.push("invalid_source");
  }
  if (!contract.client.id && (!contract.client.name || !contract.client.phone)) {
    errors.push("client_incomplete");
  }
  if (
    contract.source === "client_portal" &&
    contract.client.phone.replace(/\D/g, "").length < 8
  ) {
    errors.push("client_phone_invalid");
  }
  if (contract.participantCount !== 1) errors.push("multiple_people");
  if (contract.services.length === 0) errors.push("services_required");
  if (!contract.date) errors.push("date_required");
  if (!contract.startTime || !contract.endTime) errors.push("time_required");
  if (!contract.staffId) errors.push("staff_required");
  if (!contract.previewId) errors.push("preview_required");
  if (!contract.confirmationId) errors.push("confirmation_required");
  if (!contract.requestHash) errors.push("request_hash_required");
  if (
    ["bot", "client_portal"].includes(contract.source) &&
    !contract.previewExpiresAt
  ) {
    errors.push("preview_expiry_required");
  }

  if (
    contract.previewExpiresAt &&
    new Date(contract.previewExpiresAt).getTime() <= new Date(now).getTime()
  ) {
    errors.push("preview_expired");
  }

  const currentFingerprint = appointmentContractFingerprint(contract);
  if (contract.requestHash && contract.requestHash !== currentFingerprint) {
    errors.push("preview_changed");
  }

  if (transactional) {
    const serviceStaffIds = new Set(
      contract.services.map((service) => service.staffId).filter(Boolean)
    );
    if (
      serviceStaffIds.size > 1 ||
      [...serviceStaffIds].some((id) => id !== contract.staffId)
    ) {
      errors.push("multiple_staff_requires_review");
    }
    for (const service of contract.services) {
      if (!service.id || !service.active || !service.bookable || service.internal) {
        errors.push("service_unavailable");
        break;
      }
      if (
        service.requiresHumanReview ||
        service.priceType !== "fixed" ||
        service.price === null
      ) {
        errors.push("service_requires_review");
        break;
      }
      if (service.durationMinutes + service.cleanupMinutes <= 0) {
        errors.push("service_duration_invalid");
        break;
      }
    }
    for (const extra of contract.extras) {
      if (
        contract.source !== "admin" ||
        !extra.id ||
        !extra.name ||
        !extra.active ||
        extra.quantity <= 0 ||
        extra.unitPrice === null ||
        extra.unitPrice < 0
      ) {
        errors.push("invalid_extra");
        break;
      }
    }
  }

  if (
    contract.depositRequiredForWrite &&
    contract.depositStatus !== "verified"
  ) {
    errors.push("deposit_not_verified");
  }

  const code = errors.includes("invalid_source")
    ? "invalid_source"
    : errors.includes("preview_expired")
    ? "preview_expired"
    : errors.includes("preview_changed")
    ? "preview_changed"
    : errors.includes("multiple_people") ||
      errors.includes("multiple_staff_requires_review") ||
      errors.includes("service_requires_review") ||
      errors.includes("deposit_not_verified")
    ? "human_review"
    : errors.includes("service_unavailable")
    ? "invalid_service"
    : errors.length
    ? "invalid_request"
    : "valid";

  return {
    ok: errors.length === 0,
    code,
    errors: [...new Set(errors)],
    contract,
  };
}

export function isPortalBookableService(service) {
  const normalized = normalizedService(service);
  const name = cleanAppointmentValue(service?.name).toLowerCase();
  const category = cleanAppointmentValue(service?.category).toLowerCase();
  const internalByName =
    name.includes("ajuste administrativo") ||
    name.includes("descuento interno") ||
    category.includes("intern");
  return (
    normalized.id &&
    normalized.name &&
    normalized.active &&
    normalized.bookable &&
    !normalized.internal &&
    !internalByName &&
    service?.bot_active !== false &&
    service?.variable_pricing !== true &&
    normalized.price !== null &&
    normalized.price > 0 &&
    normalized.durationMinutes + normalized.cleanupMinutes > 0
  );
}

export function minimumNoticeMinutesForStaff(staffName) {
  const name = cleanAppointmentValue(staffName).toLowerCase();
  if (name.includes("alexandra ruiz")) return 60;
  if (name.includes("laura canul") || name.includes("tania mendez")) return 20;
  return 20;
}

function mexicoCityLocalDate(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const value = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return new Date(
    `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}:00`
  );
}

export function slotMeetsMinimumNotice({
  date,
  startTime,
  staffName,
  now = new Date(),
}) {
  const slotDate = new Date(
    `${cleanAppointmentValue(date)}T${cleanAppointmentValue(startTime)}:00`
  );
  if (!Number.isFinite(slotDate.getTime())) return false;
  const differenceMinutes =
    (slotDate.getTime() - mexicoCityLocalDate(now).getTime()) / 60000;
  return differenceMinutes >= minimumNoticeMinutesForStaff(staffName);
}

export function buildClientPortalPreview({
  actorId,
  client,
  services,
  slot,
  now = new Date(),
  ttlMs = DEFAULT_PREVIEW_TTL_MS,
}) {
  const createdAt = new Date(now).toISOString();
  const base = normalizeAppointmentWriteContract({
    source: "client_portal",
    actorId,
    client,
    participant: {
      id: "person_1",
      label: cleanAppointmentValue(client?.name || client?.full_name) || "clienta",
    },
    services: (slot?.service_segments || services || []).map((segment) => ({
      id: segment.service_id || segment.id,
      name: segment.service?.name || segment.name,
      staffId: slot?.staff_id || segment.staff_id,
      participantId: "person_1",
      durationMinutes:
        segment.duration_minutes ?? segment.durationMinutes,
      cleanupMinutes: segment.cleanup_minutes ?? segment.cleanupMinutes,
      price: segment.price ?? segment.base_price,
      priceType: "fixed",
      active: segment.service?.active ?? segment.active,
      service_type:
        segment.service?.service_type ?? segment.service_type ?? "servicio",
      bot_active: segment.service?.bot_active ?? segment.bot_active,
      bot_bookable:
        segment.service?.bot_bookable ?? segment.bot_bookable,
      variable_pricing:
        segment.service?.variable_pricing ?? segment.variable_pricing,
    })),
    date: slot?.date || slot?.service_segments?.[0]?.service_date,
    startTime: slot?.start_time,
    endTime: slot?.end_time,
    staffId: slot?.staff_id,
    previewVersion: 1,
    depositStatus: "unknown",
  });
  const requestHash = appointmentContractFingerprint(base);
  const previewId = `portal_preview_${requestHash.slice(3)}`;
  const confirmationId = `portal_confirmation_${requestHash.slice(3)}`;
  return {
    ...base,
    previewId,
    confirmationId,
    requestHash,
    previewCreatedAt: createdAt,
    previewExpiresAt: new Date(
      new Date(createdAt).getTime() + ttlMs
    ).toISOString(),
  };
}
