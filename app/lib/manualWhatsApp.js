export const INVALID_WHATSAPP_PHONE_MESSAGE =
  "Esta clienta no tiene un número de WhatsApp válido registrado.";

const WHATSAPP_BASE_URL = "https://wa.me";

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

  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatAppointmentTimeForWhatsApp(timeString) {
  return String(timeString || "").slice(0, 5) || "la hora programada";
}

function getAppointmentServicesTextForWhatsApp(appointment) {
  const services = appointment?.appointment_services || [];

  if (services.length === 0) {
    return "tu servicio";
  }

  return services
    .map((service) => service?.services?.name || service?.name || "servicio")
    .join(", ");
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
  { reviewBaseUrl = "" } = {}
) {
  const firstName = getClientFirstName(appointment?.clients?.full_name);
  const date = formatAppointmentDateForWhatsApp(appointment?.appointment_date);
  const time = formatAppointmentTimeForWhatsApp(appointment?.start_time);
  const servicesText = getAppointmentServicesTextForWhatsApp(appointment);
  const reviewLink =
    reviewBaseUrl && appointment?.id
      ? `${String(reviewBaseUrl).replace(/\/$/, "")}/calificar/${appointment.id}`
      : "";

  const messages = [
    {
      key: "reminder",
      label: "Recordatorio por WhatsApp",
      message: `Hola ${firstName} 💕 Te recordamos con mucho gusto tu cita en Alexandra Ruiz Salón Spa para el ${date} a las ${time}. Te esperamos para consentirte ✨`,
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
      message: `Hola ${firstName} 💕 Muchas gracias por visitarnos y confiar en Alexandra Ruiz Salón Spa. Esperamos que hayas disfrutado tu servicio de ${servicesText}. Fue un gusto atenderte, te esperamos pronto ✨`,
    },
  ];

  if (reviewLink) {
    messages.push({
      key: "review",
      label: "Solicitar calificación",
      message: `Hola ${firstName} 💕 Gracias por visitarnos. Nos encantaría conocer tu opinión sobre tu experiencia en Alexandra Ruiz Salón Spa. Tu calificación nos ayuda muchísimo a seguir mejorando ✨

Puedes calificarnos aquí:
${reviewLink}`,
    });
  }

  return messages;
}
