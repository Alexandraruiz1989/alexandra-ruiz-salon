export function normalizeClientAppointmentStatus(value) {
  return String(value || "").trim().toLowerCase();
}

export function isClientPortalSource(value) {
  const source = normalizeClientAppointmentStatus(value);
  return source === "cliente_portal" || source === "client_portal";
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

export function isClientPortalPendingDepositAppointment(appointment = {}) {
  const confirmation = normalizeClientAppointmentStatus(
    appointment.confirmation_status || "pendiente"
  );

  return (
    isClientPortalSource(appointment.booking_source) &&
    confirmation === "pendiente" &&
    !isCancelledAppointmentStatus(appointment)
  );
}

export function getClientAppointmentStatusLabel(appointment = {}) {
  const confirmation = normalizeClientAppointmentStatus(
    appointment.confirmation_status || appointment.status || "pendiente"
  );
  const status = normalizeClientAppointmentStatus(appointment.status);
  const attendance = normalizeClientAppointmentStatus(
    appointment.attendance_status
  );

  if (isCancelledAppointmentStatus(appointment)) return "Cancelada";
  if (attendance === "asistio" || status === "realizada") return "Realizada";
  if (confirmation.includes("confirm")) return "Confirmada";
  if (isClientPortalPendingDepositAppointment(appointment)) {
    return "Pendiente de anticipo";
  }

  return "Pendiente";
}

