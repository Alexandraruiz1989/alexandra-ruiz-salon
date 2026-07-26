function clean(value) {
  return String(value || "").trim();
}

function flagEnabled(env, serverName, publicName) {
  return env?.[serverName] === "true" || env?.[publicName] === "true";
}

export function adminTransactionalAppointmentWritesEnabled(env = {}) {
  return (
    flagEnabled(
      env,
      "APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED",
      "NEXT_PUBLIC_APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED"
    ) &&
    flagEnabled(
      env,
      "APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED",
      "NEXT_PUBLIC_APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED"
    )
  );
}

export function getAdminTransactionalCreateBlocker({
  form = {},
  serviceLines = [],
  appointmentExtras = [],
  designImageFile = null,
} = {}) {
  const staffIds = [
    ...new Set((serviceLines || []).map((line) => clean(line.staff_id)).filter(Boolean)),
  ];

  if (staffIds.length > 1) {
    return "El modo transaccional de prueba requiere una sola colaboradora por cita. Guarda esta cita con el flujo actual o separa los servicios.";
  }

  if (
    (serviceLines || []).some(
      (line) => Number(line.quantity || 1) !== 1
    )
  ) {
    return "El modo transaccional de prueba todavía no admite cantidades mayores a 1 en servicios.";
  }

  if (Number(form.deposit_amount || 0) > 0 || clean(form.deposit_payment_method)) {
    return "El modo transaccional de prueba todavía no admite anticipos desde Agenda. Guarda esta cita con el flujo actual.";
  }

  if (clean(form.design_image_url) || designImageFile) {
    return "El modo transaccional de prueba todavía no admite imagen de diseño desde Agenda. Guarda esta cita con el flujo actual.";
  }

  if ((appointmentExtras || []).some((extra) => !clean(extra.extra_id))) {
    return "El modo transaccional de prueba requiere que los extras existan en el catálogo. Los extras personalizados siguen disponibles en el flujo actual.";
  }

  return "";
}

export function buildAdminAppointmentCreatePayload({
  eventId,
  form = {},
  serviceLines = [],
  appointmentExtras = [],
  forceCreated = false,
} = {}) {
  const validLines = (serviceLines || []).filter((line) =>
    clean(line.service_id)
  );
  const firstLine = validLines[0] || {};

  return {
    eventId: clean(eventId),
    clientId: clean(form.client_id),
    serviceIds: [...new Set(validLines.map((line) => clean(line.service_id)))],
    date: clean(form.appointment_date),
    startTime: clean(firstLine.start_time),
    staffId: clean(firstLine.staff_id),
    extras: (appointmentExtras || [])
      .filter((extra) => clean(extra.extra_id))
      .map((extra) => ({
        extraId: clean(extra.extra_id),
        quantity: Number(extra.quantity || 1),
        staffId: clean(extra.staff_id),
        notes: clean(extra.notes),
      })),
    forceCreated: forceCreated === true,
    notes: clean(form.notes),
  };
}
