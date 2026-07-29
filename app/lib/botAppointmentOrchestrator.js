const DRAFT_STATUSES = new Set([
  "collecting",
  "ready_for_preview",
  "preview_shown",
  "customer_confirmed",
  "ready_for_write",
  "created",
  "expired",
  "cancelled",
  "human_review",
  "failed",
]);

export const BOT_DEPOSIT_STATUSES = new Set([
  "not_required",
  "required_pending",
  "proof_received",
  "verified",
  "rejected",
  "unknown",
]);

const DEFAULT_PREVIEW_TTL_MS = 15 * 60 * 1000;

function clean(value) {
  return String(value || "").trim();
}

function numberOrNull(value) {
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

function normalizeParticipant(participant, index) {
  return {
    id: clean(participant?.id) || `person_${index + 1}`,
    label: clean(participant?.label) || `persona ${index + 1}`,
    services: (participant?.services || []).map((service) => ({
      id: clean(service?.id || service),
      name: clean(service?.name),
    })),
  };
}

function normalizeService(service, participantId = "person_1") {
  const price =
    service?.priceType === "fixed" || service?.base_price !== undefined
      ? numberOrNull(service?.price ?? service?.base_price)
      : null;
  return {
    id: clean(service?.id),
    name: clean(service?.name),
    participantId: clean(service?.participantId) || participantId,
    durationMinutes: Number(
      service?.durationMinutes ?? service?.duration_minutes ?? 0
    ),
    cleanupMinutes: Number(
      service?.cleanupMinutes ?? service?.cleanup_minutes ?? 0
    ),
    price,
    priceType: clean(service?.priceType) || (price === null ? "hidden" : "fixed"),
  };
}

function normalizeStaff(staff = {}) {
  return {
    id: clean(staff?.id || staff?.staffId),
    name: clean(staff?.name || staff?.staffName || staff?.full_name),
    preference: clean(staff?.preference || staff?.type) || "unknown",
  };
}

function displayedDraftData(input) {
  return {
    conversationId: clean(input.conversationId),
    customer: {
      id: clean(input.customer?.id),
      name: clean(input.customer?.name),
      phone: clean(input.customer?.phone),
    },
    participants: (input.participants || []).map(normalizeParticipant),
    services: (input.services || []).map((service) =>
      normalizeService(service, clean(service?.participantId) || "person_1")
    ),
    date: clean(input.date),
    startTime: clean(input.startTime),
    endTime: clean(input.endTime),
    staff: normalizeStaff(input.staff),
    expectedPrice: numberOrNull(input.expectedPrice),
    depositStatus: BOT_DEPOSIT_STATUSES.has(input.depositStatus)
      ? input.depositStatus
      : "unknown",
    depositRequiredForWrite: input.depositRequiredForWrite === true,
  };
}

function fingerprintDisplayedData(input) {
  return `fp_${stableHash(displayedDraftData(input))}`;
}

function isoTime(now) {
  const date = now instanceof Date ? now : new Date(now || Date.now());
  return date.toISOString();
}

function addMilliseconds(iso, milliseconds) {
  return new Date(new Date(iso).getTime() + milliseconds).toISOString();
}

function isExpired(draft, now) {
  const expiration = new Date(draft?.expiresAt || 0).getTime();
  return !Number.isFinite(expiration) || expiration <= new Date(now).getTime();
}

function serviceSnapshotMatches(left, right) {
  return (
    clean(left?.id) === clean(right?.id) &&
    clean(left?.name) === clean(right?.name) &&
    Number(left?.durationMinutes || 0) ===
      Number(right?.durationMinutes ?? right?.duration_minutes ?? 0) &&
    Number(left?.cleanupMinutes || 0) ===
      Number(right?.cleanupMinutes ?? right?.cleanup_minutes ?? 0) &&
    numberOrNull(left?.price) ===
      numberOrNull(right?.price ?? right?.base_price)
  );
}

function serviceCanBeBooked(service) {
  const visibility = clean(service?.visibility);
  const bookingMode = clean(service?.bookingMode);
  return (
    Boolean(clean(service?.id)) &&
    service?.active !== false &&
    service?.bot_active !== false &&
    service?.bot_bookable !== false &&
    visibility !== "internal" &&
    bookingMode !== "information_only" &&
    bookingMode !== "requires_human_review"
  );
}

export function botAppointmentWritesEnabled(env = process.env) {
  return env?.BOT_APPOINTMENT_WRITES_ENABLED === "true";
}

export function prepareAppointmentDraft({
  existingDraft = null,
  now = new Date(),
  ttlMs = DEFAULT_PREVIEW_TTL_MS,
  ...input
}) {
  const displayed = displayedDraftData(input);
  const fingerprint = fingerprintDisplayedData(displayed);
  const samePreview =
    existingDraft?.fingerprint === fingerprint &&
    !isExpired(existingDraft, now);
  if (samePreview) return existingDraft;

  const version = Number(existingDraft?.version || 0) + 1;
  const createdAt = isoTime(now);
  const humanReviewReason =
    displayed.participants.length > 1
      ? "multiple_appointments_require_review"
      : clean(input.humanReviewReason);
  const missingData = [];
  if (!displayed.conversationId) missingData.push("conversation");
  if (!displayed.customer.name || !displayed.customer.phone) {
    missingData.push("customer");
  }
  if (displayed.services.length === 0) missingData.push("services");
  if (!displayed.date) missingData.push("date");
  if (!displayed.startTime || !displayed.endTime) missingData.push("time");
  if (!displayed.staff.id) missingData.push("staff");
  const status = humanReviewReason
    ? "human_review"
    : missingData.length > 0
    ? "collecting"
    : "preview_shown";
  const draftId =
    clean(existingDraft?.draftId) ||
    `draft_${stableHash(`${displayed.conversationId}|${createdAt}|${fingerprint}`)}`;
  const previewId =
    status === "preview_shown"
      ? `preview_${version}_${stableHash(`${draftId}|${fingerprint}`)}`
      : null;

  return {
    draftId,
    conversationId: displayed.conversationId,
    previewId,
    version,
    fingerprint,
    status,
    createdAt,
    expiresAt: addMilliseconds(createdAt, ttlMs),
    customer: displayed.customer,
    participants: displayed.participants,
    services: displayed.services,
    date: displayed.date,
    startTime: displayed.startTime,
    endTime: displayed.endTime,
    staff: displayed.staff,
    totalDurationMinutes: displayed.services.reduce(
      (sum, service) =>
        sum + service.durationMinutes + service.cleanupMinutes,
      0
    ),
    expectedPrice: displayed.expectedPrice,
    depositStatus: displayed.depositStatus,
    depositRequiredForWrite: displayed.depositRequiredForWrite,
    pendingData: missingData,
    humanReviewReason: humanReviewReason || null,
    confirmation: null,
    lastValidation: null,
    creationResult: null,
  };
}

export function validateAppointmentDraft({
  draft,
  catalogServices = null,
  staff = undefined,
  now = new Date(),
}) {
  const errors = [];
  if (!draft || typeof draft !== "object") {
    return { ok: false, code: "draft_missing", errors: ["draft_missing"] };
  }
  if (!DRAFT_STATUSES.has(draft.status)) errors.push("invalid_draft_status");
  if (!clean(draft.previewId)) errors.push("preview_id_missing");
  if (!clean(draft.conversationId)) errors.push("conversation_id_missing");
  if (isExpired(draft, now)) errors.push("preview_expired");
  if ((draft.pendingData || []).length > 0) errors.push("pending_data");
  if (draft.humanReviewReason) errors.push("human_review_required");
  if ((draft.participants || []).length > 1) errors.push("multiple_people");
  if (!BOT_DEPOSIT_STATUSES.has(draft.depositStatus)) {
    errors.push("invalid_deposit_status");
  }

  let currentServices = null;
  if (Array.isArray(catalogServices)) {
    const byId = new Map(catalogServices.map((service) => [clean(service?.id), service]));
    currentServices = (draft.services || []).map((service) => byId.get(service.id));
    if (currentServices.some((service) => !service || !serviceCanBeBooked(service))) {
      errors.push("service_unavailable");
    } else if (
      currentServices.some(
        (service, index) => !serviceSnapshotMatches(draft.services[index], service)
      )
    ) {
      errors.push("service_snapshot_changed");
    }
  }

  if (staff !== undefined) {
    if (
      !staff ||
      clean(staff?.id) !== clean(draft.staff?.id) ||
      staff?.active === false
    ) {
      errors.push("staff_unavailable");
    }
  }

  const fingerprint = fingerprintDisplayedData(draft);
  if (fingerprint !== draft.fingerprint) errors.push("preview_data_changed");

  const code = errors.includes("preview_expired")
    ? "preview_expired"
    : errors.includes("preview_id_missing")
    ? "preview_id_missing"
    : errors.includes("service_snapshot_changed") ||
      errors.includes("preview_data_changed")
    ? "preview_changed"
    : errors.includes("service_unavailable")
    ? "service_unavailable"
    : errors.includes("staff_unavailable")
    ? "staff_unavailable"
    : errors.includes("human_review_required") ||
      errors.includes("multiple_people")
    ? "human_review"
    : errors.length > 0
    ? "invalid_draft"
    : "valid";

  return {
    ok: errors.length === 0,
    code,
    errors,
    currentServices,
  };
}

export function confirmAppointmentPreview({
  draft,
  pendingStep,
  previewId,
  explicitConfirmation,
  now = new Date(),
}) {
  if (
    pendingStep !== "confirmation" ||
    explicitConfirmation !== true
  ) {
    return { ok: false, code: "confirmation_out_of_context", draft };
  }
  const validation = validateAppointmentDraft({ draft, now });
  if (!validation.ok) return { ...validation, draft };
  if (clean(previewId) !== clean(draft.previewId)) {
    return { ok: false, code: "preview_id_mismatch", draft };
  }
  if (
    draft.confirmation?.previewId === draft.previewId &&
    clean(draft.confirmation?.id)
  ) {
    return { ok: true, code: "already_confirmed", draft };
  }
  const confirmedAt = isoTime(now);
  const confirmationId = `confirmation_${stableHash(
    `${draft.conversationId}|${draft.previewId}|${confirmedAt}`
  )}`;
  const confirmation = {
    id: confirmationId,
    previewId: draft.previewId,
    fingerprint: draft.fingerprint,
    confirmedAt,
  };
  return {
    ok: true,
    code: "customer_confirmed",
    draft: {
      ...draft,
      status: "customer_confirmed",
      confirmation,
      lastValidation: {
        code: "customer_confirmed",
        checkedAt: confirmedAt,
      },
    },
  };
}

export function invalidateAppointmentConfirmation({
  draft,
  currentData,
  now = new Date(),
}) {
  if (!draft) return null;
  const currentFingerprint = fingerprintDisplayedData({
    ...draft,
    ...currentData,
  });
  if (currentFingerprint === draft.fingerprint) return draft;
  return {
    ...draft,
    status: "cancelled",
    confirmation: null,
    invalidatedAt: isoTime(now),
    invalidatedReason: "appointment_data_changed",
  };
}

export async function recheckAppointmentAvailability({
  draft,
  repository,
  now = new Date(),
}) {
  if (!repository) {
    return { ok: false, code: "repository_missing", draft };
  }
  const serviceIds = (draft?.services || []).map((service) => service.id);
  const [catalogServices, staff] = await Promise.all([
    repository.getServicesByIds(serviceIds),
    repository.getStaffById(draft?.staff?.id),
  ]);
  const validation = validateAppointmentDraft({
    draft,
    catalogServices,
    staff,
    now,
  });
  if (!validation.ok) {
    const refreshedDraft =
      validation.errors.includes("service_snapshot_changed") &&
      !validation.errors.includes("preview_data_changed")
        ? prepareAppointmentDraft({
            existingDraft: draft,
            conversationId: draft.conversationId,
            customer: draft.customer,
            participants: draft.participants,
            services: validation.currentServices.map((service, index) => ({
              id: service.id,
              name: service.name,
              participantId:
                draft.services[index]?.participantId || "person_1",
              durationMinutes: Number(service.duration_minutes || 0),
              cleanupMinutes: Number(service.cleanup_minutes || 0),
              price: numberOrNull(service.base_price),
              priceType:
                numberOrNull(service.base_price) === null ? "hidden" : "fixed",
            })),
            date: draft.date,
            startTime: draft.startTime,
            endTime: draft.endTime,
            staff: draft.staff,
            expectedPrice: validation.currentServices.reduce(
              (sum, service) => sum + Number(service.base_price || 0),
              0
            ),
            depositStatus: draft.depositStatus,
            depositRequiredForWrite: draft.depositRequiredForWrite,
            now,
          })
        : null;
    return {
      ...validation,
      draft: refreshedDraft
        ? {
            ...refreshedDraft,
            lastValidation: {
              code: validation.code,
              checkedAt: isoTime(now),
              errors: validation.errors,
            },
          }
        : {
            ...draft,
            status:
              validation.code === "human_review" ? "human_review" : "failed",
            confirmation:
              validation.code === "preview_changed" ? null : draft?.confirmation,
            lastValidation: {
              code: validation.code,
              checkedAt: isoTime(now),
              errors: validation.errors,
            },
          },
    };
  }
  const availability = await repository.checkAvailability({
    date: draft.date,
    startTime: draft.startTime,
    endTime: draft.endTime,
    staffId: draft.staff.id,
    serviceIds,
  });
  if (!availability?.available) {
    return {
      ok: false,
      code: "availability_changed",
      alternatives: availability?.alternatives || [],
      draft: {
        ...draft,
        status: "ready_for_preview",
        confirmation: null,
        lastValidation: {
          code: "availability_changed",
          checkedAt: isoTime(now),
        },
      },
    };
  }
  return {
    ok: true,
    code: "availability_confirmed",
    services: catalogServices,
    staff,
    slot: availability.slot,
    draft: {
      ...draft,
      lastValidation: {
        code: "availability_confirmed",
        checkedAt: isoTime(now),
      },
    },
  };
}

function buildIdempotencyKey(draft) {
  return [
    clean(draft?.conversationId),
    clean(draft?.previewId),
    clean(draft?.confirmation?.id),
  ].join(":");
}

export function maskIdempotencyKey(value) {
  const key = clean(value);
  if (key.length <= 12) return key ? `${key.slice(0, 3)}…` : "";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

function safeFailure(error, stage) {
  return {
    stage,
    code: clean(error?.code) || "operation_failed",
  };
}

async function createWithTransactionalRepository({
  draft,
  repository,
  writesEnabled,
  now,
  idempotencyKey,
}) {
  const validation = validateAppointmentDraft({ draft, now });
  if (!validation.ok) {
    return {
      ok: false,
      mode: writesEnabled ? "write" : "simulation",
      status: validation.code === "human_review" ? "human_review" : "failed",
      code: validation.code,
      draft: {
        ...draft,
        status:
          validation.code === "human_review" ? "human_review" : "failed",
        lastValidation: {
          code: validation.code,
          checkedAt: isoTime(now),
          errors: validation.errors,
        },
      },
      idempotencyKey,
    };
  }

  if (
    draft.depositRequiredForWrite === true &&
    draft.depositStatus !== "verified"
  ) {
    return {
      ok: false,
      mode: writesEnabled ? "write" : "simulation",
      status: "human_review",
      code: "deposit_not_verified",
      draft: {
        ...draft,
        status: "human_review",
        humanReviewReason: "deposit_not_verified",
      },
      idempotencyKey,
    };
  }

  if (!writesEnabled) {
    return {
      ok: true,
      mode: "simulation",
      status: "ready_for_write",
      code: "write_disabled",
      reason: "server_write_flag_disabled",
      draft: {
        ...draft,
        status: "ready_for_write",
        creationResult: {
          code: "write_disabled",
          checkedAt: isoTime(now),
        },
      },
      idempotencyKey,
    };
  }

  let transaction;
  try {
    transaction = await repository.createAppointmentTransaction({
      draft,
      idempotencyKey,
    });
  } catch {
    transaction = {
      status: "failed",
      errorCode: "transaction_failed",
      errorMessage: "No se pudo completar la creación de la cita.",
    };
  }

  if (["created", "already_created"].includes(transaction?.status)) {
    const creation = {
      appointment: {
        id: transaction.appointmentId,
        date: transaction.date,
        startTime: transaction.startTime,
        endTime: transaction.endTime,
        staffId: transaction.staffId,
      },
      clientId: transaction.clientId,
      servicesCreated: transaction.servicesCreated,
      isReplay:
        transaction.status === "already_created" ||
        transaction.isReplay === true,
    };
    return {
      ok: true,
      mode: "write",
      status: "created",
      code: creation.isReplay
        ? "idempotent_replay"
        : "created_and_verified",
      draft: {
        ...draft,
        status: "created",
        creationResult: creation,
      },
      idempotencyKey,
      creation,
      transaction,
    };
  }

  const requiresHumanReview = [
    "deposit_pending",
    "human_review",
  ].includes(transaction?.status);
  const availabilityChanged = transaction?.status === "not_available";
  const code =
    clean(transaction?.errorCode) ||
    clean(transaction?.status) ||
    "transaction_failed";

  return {
    ok: false,
    mode: "write",
    status: requiresHumanReview ? "human_review" : "failed",
    code,
    draft: {
      ...draft,
      status: requiresHumanReview
        ? "human_review"
        : availabilityChanged
        ? "ready_for_preview"
        : "failed",
      confirmation: availabilityChanged ? null : draft.confirmation,
      humanReviewReason: requiresHumanReview ? code : draft.humanReviewReason,
      creationResult: {
        status: transaction?.status || "failed",
        code,
        checkedAt: isoTime(now),
      },
    },
    idempotencyKey,
    transaction: {
      status: transaction?.status || "failed",
      errorCode: code,
      errorMessage:
        clean(transaction?.errorMessage) ||
        "No se pudo completar la creación de la cita.",
      isReplay: transaction?.isReplay === true,
    },
  };
}

export async function getAppointmentCreationResult({
  repository,
  appointmentId,
  idempotencyKey,
}) {
  if (!repository?.getAppointmentCreationResult) {
    return { ok: false, code: "verification_unavailable" };
  }
  const record = await repository.getAppointmentCreationResult({
    appointmentId,
    idempotencyKey,
  });
  const valid =
    Boolean(clean(record?.appointment?.id)) &&
    Array.isArray(record?.services) &&
    record.services.length > 0;
  return {
    ok: valid,
    code: valid ? "created_and_verified" : "creation_not_verified",
    record: valid ? record : null,
  };
}

export async function createAppointmentFromConfirmedPreview({
  draft,
  repository,
  writesEnabled = botAppointmentWritesEnabled(),
  now = new Date(),
}) {
  if (
    !draft?.confirmation ||
    draft.confirmation.previewId !== draft.previewId ||
    !["customer_confirmed", "ready_for_write", "created"].includes(
      draft.status
    )
  ) {
    return {
      ok: false,
      mode: "simulation",
      status: "failed",
      code: "explicit_confirmation_required",
      draft,
    };
  }
  const idempotencyKey = buildIdempotencyKey(draft);
  if (
    repository?.mode === "production_rpc" &&
    typeof repository.createAppointmentTransaction === "function"
  ) {
    return createWithTransactionalRepository({
      draft,
      repository,
      writesEnabled,
      now,
      idempotencyKey,
    });
  }

  const recheck = await recheckAppointmentAvailability({
    draft,
    repository,
    now,
  });
  if (!recheck.ok) {
    return {
      ok: false,
      mode: writesEnabled ? "write" : "simulation",
      status:
        recheck.code === "human_review" ? "human_review" : "failed",
      code: recheck.code,
      draft: recheck.draft,
      alternatives: recheck.alternatives || [],
      idempotencyKey,
    };
  }
  if (
    draft.depositRequiredForWrite === true &&
    draft.depositStatus !== "verified"
  ) {
    return {
      ok: false,
      mode: writesEnabled ? "write" : "simulation",
      status: "human_review",
      code: "deposit_not_verified",
      draft: {
        ...recheck.draft,
        status: "human_review",
        humanReviewReason: "deposit_not_verified",
      },
      idempotencyKey,
    };
  }
  if (!writesEnabled) {
    const readyDraft = {
      ...recheck.draft,
      status: "ready_for_write",
      creationResult: {
        code: "write_disabled",
        checkedAt: isoTime(now),
      },
    };
    return {
      ok: true,
      mode: "simulation",
      status: "ready_for_write",
      code: "write_disabled",
      reason: "server_write_flag_disabled",
      draft: readyDraft,
      idempotencyKey,
    };
  }

  const previous = await repository.findCreationByIdempotencyKey(
    idempotencyKey
  );
  if (previous) {
    return {
      ok: true,
      mode: "write",
      status: "created",
      code: "idempotent_replay",
      draft: {
        ...recheck.draft,
        status: "created",
        creationResult: previous,
      },
      idempotencyKey,
      creation: previous,
    };
  }

  let client = null;
  let appointment = null;
  const partialFailures = [];
  try {
    client = await repository.findOrCreateClient({
      customer: draft.customer,
      idempotencyKey,
    });
    appointment = await repository.createAppointment({
      draft,
      client,
      slot: recheck.slot,
      services: recheck.services,
      staff: recheck.staff,
      idempotencyKey,
    });
    await repository.createAppointmentServices({
      appointment,
      draft,
      slot: recheck.slot,
      services: recheck.services,
      staff: recheck.staff,
      idempotencyKey,
    });
  } catch (error) {
    partialFailures.push(
      safeFailure(error, appointment ? "appointment_services" : "appointment")
    );
    let compensated = false;
    if (appointment?.id && repository.compensateAppointment) {
      try {
        await repository.compensateAppointment(appointment.id);
        compensated = true;
      } catch (compensationError) {
        partialFailures.push(safeFailure(compensationError, "compensation"));
      }
    }
    return {
      ok: false,
      mode: "write",
      status: "failed",
      code: compensated ? "creation_compensated" : "partial_creation_failed",
      draft: {
        ...recheck.draft,
        status: "failed",
        partialFailures,
      },
      idempotencyKey,
      partialFailures,
      compensated,
    };
  }

  const verification = await getAppointmentCreationResult({
    repository,
    appointmentId: appointment.id,
    idempotencyKey,
  });
  if (!verification.ok) {
    return {
      ok: false,
      mode: "write",
      status: "failed",
      code: verification.code,
      draft: {
        ...recheck.draft,
        status: "failed",
        partialFailures: [safeFailure({}, "verification")],
      },
      idempotencyKey,
    };
  }
  const creation = {
    appointment: verification.record.appointment,
    services: verification.record.services,
  };
  if (repository.rememberIdempotencyResult) {
    await repository.rememberIdempotencyResult(idempotencyKey, creation);
  }
  return {
    ok: true,
    mode: "write",
    status: "created",
    code: "created_and_verified",
    draft: {
      ...recheck.draft,
      status: "created",
      creationResult: creation,
    },
    idempotencyKey,
    creation,
  };
}

export function formatAppointmentPreview(draft) {
  const services = (draft?.services || [])
    .map((service) => {
      const price =
        service.priceType === "fixed" && service.price !== null
          ? ` — $${service.price}`
          : "";
      return `- ${service.name}${price}`;
    })
    .join("\n");
  return [
    "Vista previa de simulación",
    "",
    `Servicios:\n${services || "- pendiente"}`,
    `Fecha: ${draft?.date || "pendiente"}`,
    `Horario: ${draft?.startTime || "pendiente"} a ${
      draft?.endTime || "pendiente"
    }`,
    `Colaboradora: ${draft?.staff?.name || "pendiente"}`,
    `Vista previa: ${draft?.previewId || "no disponible"}`,
    `Vigencia: ${draft?.expiresAt || "no disponible"}`,
    "Si los datos son correctos, responde “sí” para preparar la solicitud.",
    "No se creó ni reservó ninguna cita.",
  ].join("\n");
}
