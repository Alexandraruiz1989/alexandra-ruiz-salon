import { NextResponse } from "next/server.js";
import {
  createAppointmentFromAdmin,
  prepareAdminAppointmentContract,
} from "../../../../lib/appointmentChannelAdapters.js";
import { createAppointmentTransactionalRepository } from "../../../../lib/appointmentTransactionalRepository.js";
import { getAppointmentWriteMode } from "../../../../lib/appointmentWriteService.js";
import {
  addMinutesToTime,
  cleanText,
  getAvailability,
  getServiceDuration,
} from "../../../../lib/bookingAvailability.js";
import {
  createAdminClient,
  getSessionProfile,
  normalizeRole,
} from "../../../../lib/pushServer.js";
import { slotMeetsMinimumNotice } from "../../../../lib/appointmentWriteContracts.js";

export const runtime = "nodejs";

const APPOINTMENT_CREATE_ROLES = new Set([
  "admin",
  "encargada",
  "caja",
  "tecnica",
]);
const FORCE_CREATE_ROLES = new Set(["admin", "encargada"]);
const ALLOWED_BODY_FIELDS = new Set([
  "eventId",
  "clientId",
  "serviceIds",
  "date",
  "startTime",
  "staffId",
  "extras",
  "forceCreated",
  "notes",
]);
const ALLOWED_EXTRA_FIELDS = new Set([
  "extraId",
  "quantity",
  "staffId",
  "notes",
]);
const SERVER_CONTROL_FIELDS = new Set([
  "source",
  "actorId",
  "previewId",
  "previewVersion",
  "confirmationId",
  "requestHash",
  "confirmationFingerprint",
  "writesEnabled",
  "allowRealWrite",
  "allow_real_write",
  "bypass",
]);

function apiResponse(body, status = 200) {
  return NextResponse.json(body, { status });
}

function errorResponse(code, status, message) {
  return apiResponse(
    {
      success: false,
      code,
      error: message,
    },
    status
  );
}

function hasUnsupportedFields(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return true;
  return Object.keys(body).some(
    (key) => SERVER_CONTROL_FIELDS.has(key) || !ALLOWED_BODY_FIELDS.has(key)
  );
}

function normalizeRequestBody(body) {
  const extras = Array.isArray(body.extras) ? body.extras : [];
  if (
    extras.some(
      (extra) =>
        !extra ||
        typeof extra !== "object" ||
        Array.isArray(extra) ||
        Object.keys(extra).some((key) => !ALLOWED_EXTRA_FIELDS.has(key))
    )
  ) {
    return { error: "invalid_extras" };
  }

  const normalizedExtras = extras.map((extra) => ({
    extraId: cleanText(extra.extraId),
    staffId: cleanText(extra.staffId),
    quantity: Number(extra.quantity ?? 1),
    notes: cleanText(extra.notes),
  }));
  if (
    normalizedExtras.some(
      (extra) =>
        !extra.extraId ||
        !Number.isFinite(extra.quantity) ||
        extra.quantity <= 0
    )
  ) {
    return { error: "invalid_extras" };
  }

  const serviceIds = [
    ...new Set(
      (Array.isArray(body.serviceIds) ? body.serviceIds : [])
        .map(cleanText)
        .filter(Boolean)
    ),
  ];
  const value = {
    eventId: cleanText(body.eventId),
    clientId: cleanText(body.clientId),
    serviceIds,
    date: cleanText(body.date),
    startTime: cleanText(body.startTime).slice(0, 5),
    staffId: cleanText(body.staffId),
    extras: normalizedExtras,
    forceCreated: body.forceCreated === true,
    notes: cleanText(body.notes),
  };
  if (
    !value.eventId ||
    !value.clientId ||
    value.serviceIds.length === 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
    !/^\d{2}:\d{2}$/.test(value.startTime) ||
    !value.staffId
  ) {
    return { error: "invalid_request" };
  }
  return { value };
}

function queryError(result) {
  if (result?.error) throw result.error;
  return result?.data;
}

function buildForcedSegments(services, input) {
  let cursor = input.startTime;
  return services.map((service) => {
    const endTime = addMinutesToTime(cursor, getServiceDuration(service));
    const segment = {
      service_id: service.id,
      service,
      staff_id: input.staffId,
      service_date: input.date,
      start_time: cursor,
      end_time: endTime,
      duration_minutes: Number(service.duration_minutes || 0),
      cleanup_minutes: Number(service.cleanup_minutes || 0),
      price: Number(service.base_price || 0),
      quantity: 1,
    };
    cursor = endTime;
    return segment;
  });
}

export async function loadAdminAppointmentSelection({
  supabase,
  input,
  allowConflictOverride = false,
  now = new Date(),
}) {
  const extraIds = [...new Set(input.extras.map((extra) => extra.extraId))];
  const extraStaffIds = [
    ...new Set(input.extras.map((extra) => extra.staffId).filter(Boolean)),
  ];
  const [
    clientResult,
    staffResult,
    servicesResult,
    staffServicesResult,
    extrasResult,
    extraStaffResult,
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, full_name, phone")
      .eq("id", input.clientId)
      .maybeSingle(),
    supabase
      .from("staff")
      .select("id, full_name, active")
      .eq("id", input.staffId)
      .eq("active", true)
      .maybeSingle(),
    supabase
      .from("services")
      .select("*")
      .in("id", input.serviceIds)
      .eq("active", true),
    supabase
      .from("staff_services")
      .select("staff_id, service_id, active")
      .in("service_id", input.serviceIds)
      .eq("active", true),
    extraIds.length
      ? supabase
          .from("service_extras")
          .select("id, name, price, active")
          .in("id", extraIds)
          .eq("active", true)
      : Promise.resolve({ data: [], error: null }),
    extraStaffIds.length
      ? supabase
          .from("staff")
          .select("id, active")
          .in("id", extraStaffIds)
          .eq("active", true)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const client = queryError(clientResult);
  const staff = queryError(staffResult);
  const servicesRows = queryError(servicesResult) || [];
  const staffServices = queryError(staffServicesResult) || [];
  const extrasRows = queryError(extrasResult) || [];
  const extraStaffRows = queryError(extraStaffResult) || [];

  if (!client) return { ok: false, code: "invalid_client" };
  if (!staff) return { ok: false, code: "invalid_staff" };

  const servicesById = new Map(
    servicesRows.map((service) => [service.id, service])
  );
  const services = input.serviceIds
    .map((serviceId) => servicesById.get(serviceId))
    .filter(Boolean);
  if (services.length !== input.serviceIds.length) {
    return { ok: false, code: "invalid_service" };
  }

  const restrictedService = input.serviceIds.find((serviceId) => {
    const configured = staffServices.filter(
      (row) => row.service_id === serviceId && row.active !== false
    );
    return (
      configured.length > 0 &&
      !configured.some((row) => row.staff_id === input.staffId)
    );
  });
  if (restrictedService && !allowConflictOverride) {
    return { ok: false, code: "invalid_staff" };
  }

  const extrasById = new Map(extrasRows.map((extra) => [extra.id, extra]));
  const validExtraStaffIds = new Set(extraStaffRows.map((person) => person.id));
  if (
    extrasRows.length !== extraIds.length ||
    extraStaffIds.some((staffId) => !validExtraStaffIds.has(staffId))
  ) {
    return { ok: false, code: "invalid_extra" };
  }
  const extras = input.extras.map((requested) => {
    const extra = extrasById.get(requested.extraId);
    return {
      id: extra.id,
      name: extra.name,
      staffId: requested.staffId || input.staffId,
      quantity: requested.quantity,
      unitPrice: Number(extra.price || 0),
      active: extra.active !== false,
      notes: requested.notes,
    };
  });

  const availability = await getAvailability({
    adminSupabase: supabase,
    date: input.date,
    serviceIds: input.serviceIds,
    preferredStaffId: input.staffId,
    requestedStartTime: input.startTime,
    limit: 1,
  });
  let slot = availability.slots.find(
    (candidate) =>
      candidate.staff_id === input.staffId &&
      candidate.start_time === input.startTime
  );
  const noticeValid = slotMeetsMinimumNotice({
    date: input.date,
    startTime: input.startTime,
    staffName: staff.full_name,
    now,
  });
  if ((!slot || !noticeValid) && !allowConflictOverride) {
    return { ok: false, code: "not_available" };
  }
  if (!slot) {
    const segments = buildForcedSegments(services, input);
    slot = {
      date: input.date,
      staff_id: input.staffId,
      staff_name: staff.full_name,
      start_time: input.startTime,
      end_time: segments.at(-1)?.end_time || "",
      service_segments: segments,
    };
  }

  const authoritativeServices = slot.service_segments.map((segment) => ({
    id: segment.service_id,
    name: segment.service?.name,
    staffId: input.staffId,
    participantId: "person_1",
    durationMinutes: Number(segment.service?.duration_minutes || 0),
    cleanupMinutes: Number(segment.service?.cleanup_minutes || 0),
    price: Number(segment.service?.base_price || 0),
    priceType: segment.service?.variable_pricing ? "variable" : "fixed",
    active: segment.service?.active !== false,
    bookable: true,
    service_type: segment.service?.service_type || "servicio",
  }));
  const expectedPrice =
    authoritativeServices.reduce(
      (sum, service) => sum + Number(service.price || 0),
      0
    ) +
    extras.reduce(
      (sum, extra) =>
        sum + Number(extra.quantity || 0) * Number(extra.unitPrice || 0),
      0
    );

  return {
    ok: true,
    client: {
      id: client.id,
      name: client.full_name,
      phone: client.phone,
    },
    services: authoritativeServices,
    extras,
    date: input.date,
    startTime: slot.start_time,
    endTime: slot.end_time,
    staffId: input.staffId,
    expectedPrice,
  };
}

function resultStatus(result) {
  if (result.ok && result.status === "created") return 201;
  if (result.ok && result.status === "already_created") return 200;
  if (
    ["not_available", "human_review", "deposit_pending"].includes(result.status)
  ) {
    return 409;
  }
  if (
    [
      "transactional_repository_unavailable",
      "transactional_write_failed",
      "rpc_unavailable",
      "write_disabled",
    ].includes(result.code)
  ) {
    return 503;
  }
  if (
    ["incomplete_write_result", "incomplete_rpc_response", "invalid_rpc_response"].includes(
      result.code
    )
  ) {
    return 502;
  }
  return 400;
}

export async function handleAdminAppointmentCreate(request, dependencies = {}) {
  const env = dependencies.env || process.env;
  if (getAppointmentWriteMode("admin", env) !== "transactional") {
    return errorResponse(
      "write_disabled",
      503,
      "La creación transaccional de citas administrativas está desactivada."
    );
  }

  try {
    const supabase =
      dependencies.supabase ||
      (dependencies.createSupabase || createAdminClient)();
    const authenticateRequest =
      dependencies.authenticateRequest || getSessionProfile;
    const session = await authenticateRequest(request, supabase);
    if (session?.error || !session?.user || !session?.profile) {
      const status = session?.status === 403 ? 403 : 401;
      return errorResponse(
        status === 401 ? "unauthorized" : "forbidden",
        status,
        status === 401
          ? "Tu sesión no es válida. Vuelve a iniciar sesión."
          : "No tienes permiso para crear citas."
      );
    }

    const role = normalizeRole(session.profile.role);
    if (!APPOINTMENT_CREATE_ROLES.has(role)) {
      return errorResponse(
        "forbidden",
        403,
        "No tienes permiso para crear citas."
      );
    }

    const body = await request.json();
    if (hasUnsupportedFields(body)) {
      return errorResponse(
        "unsupported_request_fields",
        400,
        "La solicitud contiene campos que no se pueden aceptar."
      );
    }
    const normalized = normalizeRequestBody(body);
    if (normalized.error) {
      return errorResponse(
        normalized.error,
        400,
        normalized.error === "invalid_extras"
          ? "Revisa los extras seleccionados."
          : "Revisa los datos de la cita."
      );
    }
    if (
      normalized.value.forceCreated &&
      !FORCE_CREATE_ROLES.has(role)
    ) {
      return errorResponse(
        "force_forbidden",
        403,
        "Tu rol no permite forzar una cita."
      );
    }

    const loadSelection =
      dependencies.loadSelection || loadAdminAppointmentSelection;
    const selection = await loadSelection({
      supabase,
      input: normalized.value,
      allowConflictOverride: normalized.value.forceCreated,
      now: dependencies.now || new Date(),
    });
    if (!selection?.ok) {
      const code = selection?.code || "invalid_request";
      const status = code === "not_available" ? 409 : 400;
      const messages = {
        invalid_client: "La clienta seleccionada no está disponible.",
        invalid_service: "Uno de los servicios no está disponible.",
        invalid_staff: "La colaboradora no está disponible para esta cita.",
        invalid_extra: "Uno de los extras no está disponible.",
        not_available: "El horario ya no está disponible.",
      };
      return errorResponse(
        code,
        status,
        messages[code] || "Revisa los datos de la cita."
      );
    }

    const contract = prepareAdminAppointmentContract({
      actorId: session.user.id,
      eventId: normalized.value.eventId,
      client: selection.client,
      services: selection.services,
      extras: selection.extras,
      date: selection.date,
      startTime: selection.startTime,
      endTime: selection.endTime,
      staffId: selection.staffId,
      expectedPrice: selection.expectedPrice,
      depositStatus: "not_required",
      forceCreated: normalized.value.forceCreated,
      notes: normalized.value.notes,
    });
    const createRepository =
      dependencies.createRepository ||
      ((options) => createAppointmentTransactionalRepository(options));
    const transactionalRepository = createRepository({ supabase, env });
    const result = await createAppointmentFromAdmin({
      input: contract,
      env,
      transactionalRepository,
      now: dependencies.now || new Date(),
    });
    const status = resultStatus(result);
    return apiResponse(
      {
        success: result.ok,
        status: result.status,
        code: result.code,
        appointmentId: result.appointmentId,
        clientId: result.clientId,
        servicesCreated: result.servicesCreated,
        isReplay: result.isReplay,
        error: result.ok
          ? null
          : status === 409
          ? "La cita requiere revisión o el horario ya no está disponible."
          : status === 503
          ? "La creación de citas no está disponible en este momento."
          : "No se pudo crear la cita.",
      },
      status
    );
  } catch {
    return errorResponse(
      "request_failed",
      500,
      "No se pudo procesar la solicitud de cita."
    );
  }
}

export async function POST(request) {
  return handleAdminAppointmentCreate(request);
}
