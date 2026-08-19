export function normalizeClientAppointmentStatus(value) {
  return String(value || "").trim().toLowerCase();
}

export const CLIENT_PORTAL_CONFIRMATION_TIME_ZONE = "America/Merida";
export const CLIENT_PORTAL_DAY_START_HOUR = 5;
export const CLIENT_PORTAL_NIGHT_START_HOUR = 22;
export const CLIENT_PORTAL_DAY_CONFIRMATION_HOURS = 3;
export const CLIENT_PORTAL_NIGHT_CONFIRMATION_HOURS = 10;
export const CLIENT_PORTAL_EXPIRED_CONFIRMATION_STATUS = "vencida";

const PORTAL_BOOKING_SOURCES = ["cliente_portal", "client_portal"];

export function isClientPortalSource(value) {
  const source = normalizeClientAppointmentStatus(value);
  return PORTAL_BOOKING_SOURCES.includes(source);
}

function dateOrNull(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function zonedParts(value, timeZone = CLIENT_PORTAL_CONFIRMATION_TIME_ZONE) {
  const date = dateOrNull(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

function localDateKey(value, timeZone = CLIENT_PORTAL_CONFIRMATION_TIME_ZONE) {
  const parts = zonedParts(value, timeZone);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getClientPortalConfirmationWindowHours(
  createdAt = new Date(),
  { timeZone = CLIENT_PORTAL_CONFIRMATION_TIME_ZONE } = {}
) {
  const parts = zonedParts(createdAt, timeZone);
  if (!parts) return CLIENT_PORTAL_DAY_CONFIRMATION_HOURS;

  const hour = Number(parts.hour);
  return hour >= CLIENT_PORTAL_DAY_START_HOUR &&
    hour < CLIENT_PORTAL_NIGHT_START_HOUR
    ? CLIENT_PORTAL_DAY_CONFIRMATION_HOURS
    : CLIENT_PORTAL_NIGHT_CONFIRMATION_HOURS;
}

export function calculateClientPortalConfirmationDeadline(
  createdAt = new Date(),
  options = {}
) {
  const created = dateOrNull(createdAt) || new Date();
  const hours = getClientPortalConfirmationWindowHours(created, options);
  return new Date(created.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function isClientPortalAppointmentExpired(
  appointment = {},
  { now = new Date() } = {}
) {
  if (!isClientPortalSource(appointment.booking_source)) return false;
  if (isCancelledAppointmentStatus(appointment)) return false;

  const confirmation = normalizeClientAppointmentStatus(
    appointment.confirmation_status || "pendiente"
  );
  if (confirmation === CLIENT_PORTAL_EXPIRED_CONFIRMATION_STATUS) return true;
  if (confirmation !== "pendiente") return false;

  const deadline = dateOrNull(appointment.confirmation_deadline_at);
  const current = dateOrNull(now) || new Date();

  return Boolean(deadline) && current.getTime() >= deadline.getTime();
}

export function getEffectiveClientAppointmentConfirmationStatus(
  appointment = {},
  options = {}
) {
  if (isClientPortalAppointmentExpired(appointment, options)) {
    return CLIENT_PORTAL_EXPIRED_CONFIRMATION_STATUS;
  }

  return normalizeClientAppointmentStatus(
    appointment.confirmation_status || appointment.status || "pendiente"
  );
}

export function appointmentBlocksAvailability(appointment = {}, options = {}) {
  if (isCancelledAppointmentStatus(appointment)) return false;

  const status = normalizeClientAppointmentStatus(appointment.status);
  const confirmation = getEffectiveClientAppointmentConfirmationStatus(
    appointment,
    options
  );

  if (
    status === CLIENT_PORTAL_EXPIRED_CONFIRMATION_STATUS ||
    confirmation === CLIENT_PORTAL_EXPIRED_CONFIRMATION_STATUS
  ) {
    return false;
  }

  return true;
}

export function formatClientPortalConfirmationDeadline(
  deadlineAt,
  {
    now = new Date(),
    timeZone = CLIENT_PORTAL_CONFIRMATION_TIME_ZONE,
    includeDate,
  } = {}
) {
  const deadline = dateOrNull(deadlineAt);
  if (!deadline) return "";

  const sameLocalDay =
    localDateKey(deadline, timeZone) === localDateKey(now, timeZone);
  const shouldIncludeDate =
    typeof includeDate === "boolean" ? includeDate : !sameLocalDay;
  const formatted = new Intl.DateTimeFormat("es-MX", {
    timeZone,
    ...(shouldIncludeDate
      ? { day: "numeric", month: "long", year: "numeric" }
      : {}),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(deadline);

  return formatted
    .replace(/\s*a\.?\s*m\.?/i, " AM")
    .replace(/\s*p\.?\s*m\.?/i, " PM");
}

export function buildClientPortalDeadlineMessage(deadlineAt, options = {}) {
  const formattedDeadline = formatClientPortalConfirmationDeadline(
    deadlineAt,
    options
  );
  if (!formattedDeadline) return "";
  return `Tu horario está apartado hasta las ${formattedDeadline} mientras validamos tu anticipo.`;
}

export async function reconcileExpiredClientPortalAppointments(
  supabase,
  { now = new Date() } = {}
) {
  const current = dateOrNull(now) || new Date();
  if (!supabase?.from) {
    throw new Error("Se requiere un cliente de Supabase para reconciliar citas.");
  }

  return supabase
    .from("appointments")
    .update({
      confirmation_status: CLIENT_PORTAL_EXPIRED_CONFIRMATION_STATUS,
      updated_at: current.toISOString(),
    })
    .in("booking_source", PORTAL_BOOKING_SOURCES)
    .eq("confirmation_status", "pendiente")
    .not("confirmation_deadline_at", "is", null)
    .lte("confirmation_deadline_at", current.toISOString());
}

export function isCancelledAppointmentStatus(appointment = {}) {
  const status = normalizeClientAppointmentStatus(appointment.status);
  const confirmation = normalizeClientAppointmentStatus(
    appointment.confirmation_status
  );
  const attendance = normalizeClientAppointmentStatus(
    appointment.attendance_status
  );

  return (
    status.includes("cancel") ||
    confirmation.includes("cancel") ||
    confirmation === "rechazada" ||
    attendance === "cancelo"
  );
}

export function isClientPortalPendingDepositAppointment(
  appointment = {},
  options = {}
) {
  const confirmation = getEffectiveClientAppointmentConfirmationStatus(
    appointment,
    options
  );

  return (
    isClientPortalSource(appointment.booking_source) &&
    confirmation === "pendiente" &&
    !isCancelledAppointmentStatus(appointment)
  );
}

export function getClientAppointmentStatusLabel(appointment = {}, options = {}) {
  const confirmation = getEffectiveClientAppointmentConfirmationStatus(
    appointment,
    options
  );
  const status = normalizeClientAppointmentStatus(appointment.status);
  const attendance = normalizeClientAppointmentStatus(
    appointment.attendance_status
  );

  if (isCancelledAppointmentStatus(appointment)) return "Cancelada";
  if (attendance === "asistio" || status === "realizada") return "Realizada";
  if (confirmation === CLIENT_PORTAL_EXPIRED_CONFIRMATION_STATUS) {
    return "Vencida";
  }
  if (confirmation.includes("confirm")) return "Confirmada";
  if (isClientPortalPendingDepositAppointment(appointment, options)) {
    return "Pendiente de anticipo";
  }

  return "Pendiente";
}

