export const INVALID_WHATSAPP_PHONE_MESSAGE =
  "Esta clienta no tiene un número de WhatsApp válido registrado.";

const WHATSAPP_BASE_URL = "https://wa.me";
const DEFAULT_BUSINESS_NAME = "Alexandra Ruiz Salón Spa";

export const DEFAULT_APPOINTMENT_REMINDER_TEMPLATE = `✨ ¡Hola, {client_first_name}!
Te recordamos tu próxima cita 💕

📅 Fecha: {appointment_date}
🕐 Hora: {appointment_time}

Servicios agendados:
{services_with_staff}

Nos dará mucho gusto recibirte. ✨

⏰ Te recordamos que contamos con una tolerancia máxima de 10 minutos. Después de este tiempo, la realización de tus servicios quedará sujeta a disponibilidad para no afectar las citas posteriores.

¡Te esperamos! 💕`;

const INACTIVE_APPOINTMENT_SERVICE_STATUSES = new Set([
  "cancelada",
  "cancelado",
  "cancelled",
  "canceled",
  "cancelo",
  "eliminada",
  "eliminado",
  "deleted",
  "inactiva",
  "inactivo",
]);

const REMINDER_TEMPLATE_KEYS = new Set([
  "appointment_reminder",
  "appointment-reminder",
  "appointment_reminder_manual",
  "recordatorio",
  "recordatorio_cita",
  "recordatorio-cita",
  "reminder",
]);

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function normalizeWhatsAppPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (!digits) return "";

  if (digits.startsWith("52") && digits.length >= 12) {
    return digits;
  }

  if (digits.length === 10) {
    return `52${digits}`;
  }

  if (digits.length >= 11) {
    return digits;
  }

  return "";
}

export function buildWhatsAppPhoneUrl(phone) {
  const cleanPhone = normalizeWhatsAppPhone(phone);
  return cleanPhone ? `${WHATSAPP_BASE_URL}/${cleanPhone}` : "";
}

export function buildWhatsAppUrl(phone, message) {
  const phoneUrl = buildWhatsAppPhoneUrl(phone);

  if (!phoneUrl) return "";

  return `${phoneUrl}?text=${encodeURIComponent(String(message || ""))}`;
}

export function openManualWhatsAppMessage({ phone, message, openWindow }) {
  const url = buildWhatsAppUrl(phone, message);

  if (!url) {
    return {
      ok: false,
      url: "",
      error: INVALID_WHATSAPP_PHONE_MESSAGE,
    };
  }

  if (typeof openWindow !== "function") {
    return {
      ok: false,
      url,
      error: "No se pudo abrir WhatsApp desde este navegador.",
    };
  }

  openWindow(url, "_blank");

  return {
    ok: true,
    url,
    error: "",
  };
}

export function getClientFirstName(fullName, fallback = "hermosa") {
  const firstName = String(fullName || "").trim().split(/\s+/)[0];
  return firstName || fallback;
}

export function buildFollowupWhatsAppMessage(followup) {
  const messageBody = String(followup?.message_body || "");

  if (messageBody.trim()) {
    return messageBody;
  }

  const firstName = getClientFirstName(followup?.clients?.full_name);

  return `Hola ${firstName} 💕 Esperamos que estés muy bien. Queríamos recordarte que ya es buen momento para agendar tu siguiente cita en Alexandra Ruiz Salón Spa. ¿Te gustaría que te ayudemos a encontrar un espacio? ✨`;
}

export function formatAppointmentDateForWhatsApp(dateString) {
  const value = String(dateString || "").trim();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return value || "la fecha programada";

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  return date.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatAppointmentTimeForWhatsApp(timeString) {
  return normalizeAppointmentTimeForWhatsApp(timeString) || "la hora programada";
}

function normalizeAppointmentTimeForWhatsApp(timeString) {
  const value = String(timeString || "").trim();
  const match = value.match(/(?:T)?(\d{1,2}):(\d{2})(?::\d{2})?/);

  if (!match) return "";

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  if (hour === 0 && minute === 0) return "";

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function appointmentTimeToMinutes(timeString) {
  const normalized = normalizeAppointmentTimeForWhatsApp(timeString);

  if (!normalized) return Number.POSITIVE_INFINITY;

  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

function isActiveAppointmentService(service) {
  const status = normalizeText(service?.status || "agendado");
  return !INACTIVE_APPOINTMENT_SERVICE_STATUSES.has(status);
}

function getServiceDisplayNameForWhatsApp(service) {
  return (
    String(
      service?.services?.name ||
        service?.custom_name ||
        service?.name ||
        "Servicio"
    ).trim() || "Servicio"
  );
}

function getStaffDisplayNameForWhatsApp(service) {
  const fullName = String(
    service?.staff?.full_name || service?.staff_name || service?.staff?.name || ""
  ).trim();

  if (!fullName || /^[0-9a-f-]{24,}$/i.test(fullName)) return "";

  return fullName.split(/\s+/)[0] || "";
}

function getOrderedActiveAppointmentServices(appointment) {
  return (appointment?.appointment_services || [])
    .map((service, index) => ({
      service,
      index,
      startMinutes: appointmentTimeToMinutes(service?.start_time),
    }))
    .filter(({ service }) => isActiveAppointmentService(service))
    .sort((a, b) => {
      if (a.startMinutes !== b.startMinutes) {
        return a.startMinutes - b.startMinutes;
      }

      return a.index - b.index;
    })
    .map(({ service }) => service);
}

function getAppointmentServicesTextForWhatsApp(appointment) {
  const services = getOrderedActiveAppointmentServices(appointment);

  if (services.length === 0) {
    return "tu servicio";
  }

  return services
    .map((service) => getServiceDisplayNameForWhatsApp(service))
    .join(", ");
}

export function getAppointmentReminderTimeForWhatsApp(appointment) {
  const earliestService = getOrderedActiveAppointmentServices(appointment).find(
    (service) => normalizeAppointmentTimeForWhatsApp(service?.start_time)
  );

  return formatAppointmentTimeForWhatsApp(
    earliestService?.start_time || appointment?.start_time
  );
}

export function buildServicesWithStaffForWhatsApp(appointment) {
  const services = getOrderedActiveAppointmentServices(appointment);

  if (services.length === 0) {
    return "• Servicio por confirmar";
  }

  return services
    .map((service) => {
      const serviceName = getServiceDisplayNameForWhatsApp(service);
      const staffName = getStaffDisplayNameForWhatsApp(service);

      return staffName ? `• ${serviceName} — con ${staffName}` : `• ${serviceName}`;
    })
    .join("\n");
}

function getAppointmentReminderTemplate(templates = []) {
  if (!Array.isArray(templates) || templates.length === 0) return "";

  const activeTemplates = templates.filter(
    (template) => template?.is_active !== false
  );

  const matchingTemplate = activeTemplates.find((template) => {
    const key = normalizeText(template?.template_key);
    const title = normalizeText(template?.title);

    return (
      REMINDER_TEMPLATE_KEYS.has(key) ||
      title.includes("recordatorio") ||
      title.includes("reminder")
    );
  });

  return String(matchingTemplate?.message_body || "").trim();
}

export function renderAppointmentMessageTemplate(
  template,
  appointment,
  { businessName = DEFAULT_BUSINESS_NAME } = {}
) {
  const replacements = {
    client_first_name: getClientFirstName(appointment?.clients?.full_name),
    business_name: String(businessName || DEFAULT_BUSINESS_NAME).trim(),
    appointment_date: formatAppointmentDateForWhatsApp(
      appointment?.appointment_date
    ),
    appointment_time: getAppointmentReminderTimeForWhatsApp(appointment),
    services: getAppointmentServicesTextForWhatsApp(appointment),
    services_with_staff: buildServicesWithStaffForWhatsApp(appointment),
  };

  return String(template || "").replace(
    /\{(client_first_name|business_name|appointment_date|appointment_time|services|services_with_staff)\}/g,
    (match, key) => replacements[key] || match
  );
}

export function isAppointmentEligibleForManualWhatsApp(appointment) {
  const status = normalizeText(appointment?.status);
  const attendanceStatus = normalizeText(appointment?.attendance_status);
  const inactiveStatuses = new Set([
    "cancelada",
    "cancelado",
    "cancelled",
    "canceled",
    "cancelo",
    "no asistio",
    "no_asistio",
  ]);

  return !inactiveStatuses.has(status) && !inactiveStatuses.has(attendanceStatus);
}

export function buildAppointmentManualWhatsAppMessages(
  appointment,
  { reviewBaseUrl = "", businessName = DEFAULT_BUSINESS_NAME, templates = [] } = {}
) {
  const firstName = getClientFirstName(appointment?.clients?.full_name);
  const time = getAppointmentReminderTimeForWhatsApp(appointment);
  const servicesText = getAppointmentServicesTextForWhatsApp(appointment);
  const businessDisplayName = String(businessName || DEFAULT_BUSINESS_NAME).trim();
  const reminderTemplate =
    getAppointmentReminderTemplate(templates) || DEFAULT_APPOINTMENT_REMINDER_TEMPLATE;
  const reviewLink =
    reviewBaseUrl && appointment?.id
      ? `${String(reviewBaseUrl).replace(/\/$/, "")}/calificar/${appointment.id}`
      : "";

  const messages = [
    {
      key: "reminder",
      label: "Recordatorio por WhatsApp",
      message: renderAppointmentMessageTemplate(reminderTemplate, appointment, {
        businessName: businessDisplayName,
      }),
    },
    {
      key: "on_the_way",
      label: "¿Viene en camino?",
      message: `Hola ${firstName} 💕 Solo queremos confirmar si vienes en camino a tu cita de las ${time}. Te esperamos ✨`,
    },
    {
      key: "late",
      label: "Preguntar si viene retrasada",
      message: `Hola ${firstName} 💕 Notamos que tu cita era a las ${time}. ¿Nos confirmas si vienes en camino o si tuviste algún retraso?`,
    },
    {
      key: "thank_you",
      label: "Enviar agradecimiento",
      message: `Hola ${firstName} 💕 Muchas gracias por visitarnos y confiar en ${businessDisplayName}. Esperamos que hayas disfrutado tu servicio de ${servicesText}. Fue un gusto atenderte, te esperamos pronto ✨`,
    },
  ];

  if (reviewLink) {
    messages.push({
      key: "review",
      label: "Solicitar calificación",
      message: `Hola ${firstName} 💕 Gracias por visitarnos. Nos encantaría conocer tu opinión sobre tu experiencia en ${businessDisplayName}. Tu calificación nos ayuda muchísimo a seguir mejorando ✨

Puedes calificarnos aquí:
${reviewLink}`,
    });
  }

  return messages;
}
