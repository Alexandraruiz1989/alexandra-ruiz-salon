import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildAppointmentManualWhatsAppMessages,
  buildFollowupWhatsAppMessage,
  buildServicesWithStaffForWhatsApp,
  buildWhatsAppUrl,
  DEFAULT_APPOINTMENT_REMINDER_TEMPLATE,
  formatAppointmentDateForWhatsApp,
  getAppointmentReminderTimeForWhatsApp,
  isAppointmentEligibleForManualWhatsApp,
  normalizeWhatsAppPhone,
  openManualWhatsAppMessage,
  renderAppointmentMessageTemplate,
} from "../app/lib/manualWhatsApp.js";

function appointment(overrides = {}) {
  return {
    id: "appointment_test",
    status: "agendada",
    attendance_status: "pendiente",
    appointment_date: "2026-08-28",
    start_time: "10:30:00",
    clients: {
      full_name: "Clienta Demo",
      phone: "999 111 2233",
    },
    appointment_services: [
      {
        id: "service-line-1",
        created_at: "2026-08-01T12:00:00Z",
        start_time: "10:30:00",
        status: "agendado",
        services: {
          name: "Gel en uña natural",
        },
        staff: {
          full_name: "Laura Pérez",
        },
      },
    ],
    ...overrides,
  };
}

function decodeMessage(url) {
  return new URL(url).searchParams.get("text");
}

test("seguimientos: mensaje original abre correctamente", () => {
  const followup = {
    message_body: "Hola Ana 💕\nTe esperamos para tu seguimiento.",
    clients: { full_name: "Ana Prueba", phone: "999-111-2233" },
  };
  const message = buildFollowupWhatsAppMessage(followup);
  const url = buildWhatsAppUrl(followup.clients.phone, message);

  assert.match(url, /^https:\/\/wa\.me\/529991112233\?text=/);
  assert.equal(decodeMessage(url), message);
});

test("seguimientos: mensaje editado reemplaza al original al abrir WhatsApp", () => {
  const followup = {
    message_body: "Mensaje original",
    clients: { full_name: "Ana Prueba", phone: "9991112233" },
  };
  const editedMessage = "Mensaje editado por la administradora";
  const url = buildWhatsAppUrl(followup.clients.phone, editedMessage);

  assert.equal(decodeMessage(url), editedMessage);
  assert.notEqual(decodeMessage(url), buildFollowupWhatsAppMessage(followup));
});

test("seguimientos: saltos de línea, emojis y acentos se conservan codificados", () => {
  const editedMessage = "Hola María 💕\n¿Confirmas tu cita?\nGracias ✨";
  const url = buildWhatsAppUrl("9991112233", editedMessage);

  assert.equal(decodeMessage(url), editedMessage);
});

test("seguimientos: editar no modifica la plantilla global del seguimiento", () => {
  const followup = {
    message_body: "Plantilla original",
    clients: { full_name: "Ana Prueba", phone: "9991112233" },
  };
  const original = buildFollowupWhatsAppMessage(followup);
  const editedMessage = "Mensaje editado solo para este envío";

  buildWhatsAppUrl(followup.clients.phone, editedMessage);

  assert.equal(followup.message_body, "Plantilla original");
  assert.equal(buildFollowupWhatsAppMessage(followup), original);
});

test("seguimientos: teléfono inválido no crea enlace válido", () => {
  assert.equal(buildWhatsAppUrl("abc", "Hola"), "");
  assert.equal(buildWhatsAppUrl("123", "Hola"), "");
});

test("helper: no devuelve falso negativo para teléfonos mexicanos válidos", () => {
  assert.equal(normalizeWhatsAppPhone("999 111 2233"), "529991112233");
  assert.equal(normalizeWhatsAppPhone("(999) 111-2233"), "529991112233");
  assert.equal(normalizeWhatsAppPhone("+52 999 111 2233"), "529991112233");
});

test("recordatorios: usa teléfono correcto de la cita", () => {
  const messages = buildAppointmentManualWhatsAppMessages(appointment(), {
    reviewBaseUrl: "https://example.test",
  });
  const url = buildWhatsAppUrl(
    appointment().clients.phone,
    messages.find((item) => item.key === "reminder").message
  );

  assert.match(url, /^https:\/\/wa\.me\/529991112233\?text=/);
});

test("recordatorios: usa el mensaje editable actual", () => {
  const editedMessage = "Mensaje final editado\ncon detalles actualizados ✨";
  const url = buildWhatsAppUrl("9991112233", editedMessage);

  assert.equal(decodeMessage(url), editedMessage);
});

test("recordatorios: cita sin teléfono no abre WhatsApp", () => {
  let opened = false;
  const result = openManualWhatsAppMessage({
    phone: "",
    message: "Hola",
    openWindow: () => {
      opened = true;
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.url, "");
  assert.equal(opened, false);
});

test("recordatorios: cita cancelada o no aplicable no ofrece envío", () => {
  assert.equal(
    isAppointmentEligibleForManualWhatsApp(
      appointment({ status: "cancelada" })
    ),
    false
  );
  assert.equal(
    isAppointmentEligibleForManualWhatsApp(
      appointment({ attendance_status: "no_asistio" })
    ),
    false
  );
});

test("recordatorios: abrir WhatsApp no marca automáticamente como enviado", () => {
  const writes = [];
  const result = openManualWhatsAppMessage({
    phone: "9991112233",
    message: "Hola",
    openWindow: () => {},
  });

  assert.equal(result.ok, true);
  assert.deepEqual(writes, []);
});

test("recordatorios: el mensaje incluye datos de la cita", () => {
  const messages = buildAppointmentManualWhatsAppMessages(appointment(), {
    reviewBaseUrl: "https://example.test",
  });
  const reminder = messages.find((item) => item.key === "reminder").message;

  assert.match(reminder, /Clienta/);
  assert.match(reminder, /28 de agosto de 2026/);
  assert.match(reminder, /10:30/);
});

test("plantillas: reemplaza appointment_date sin exponer ISO crudo", () => {
  const message = renderAppointmentMessageTemplate(
    "Fecha: {appointment_date}",
    appointment(),
    { businessName: "Alexandra Ruiz Salón Spa" }
  );

  assert.equal(message, "Fecha: 28 de agosto de 2026");
  assert.doesNotMatch(message, /2026-08-28|T00:00|GMT|UTC/);
});

test("plantillas: un servicio con técnica genera una línea", () => {
  assert.equal(
    buildServicesWithStaffForWhatsApp(appointment()),
    "• Gel en uña natural — con Laura"
  );
});

test("plantillas: tres servicios generan tres líneas con su técnica real", () => {
  const services = buildServicesWithStaffForWhatsApp(
    appointment({
      appointment_services: [
        {
          start_time: "10:00:00",
          status: "agendado",
          services: { name: "Gel manos" },
          staff: { full_name: "Laura Pérez" },
        },
        {
          start_time: "11:00:00",
          status: "agendado",
          services: { name: "Pedicure" },
          staff: { full_name: "Tania López" },
        },
        {
          start_time: "12:30:00",
          status: "agendado",
          services: { name: "Lifting" },
          staff: { full_name: "Alexandra Ruiz" },
        },
      ],
    })
  );

  assert.equal(
    services,
    [
      "• Gel manos — con Laura",
      "• Pedicure — con Tania",
      "• Lifting — con Alexandra",
    ].join("\n")
  );
});

test("plantillas: cada servicio usa su técnica y omite técnica faltante", () => {
  const services = buildServicesWithStaffForWhatsApp(
    appointment({
      appointment_services: [
        {
          start_time: "10:00:00",
          status: "agendado",
          services: { name: "Gel manos" },
          staff: { full_name: "Laura Pérez" },
        },
        {
          start_time: "11:00:00",
          status: "agendado",
          services: { name: "Pedicure Spa" },
          staff: null,
        },
      ],
    })
  );

  assert.equal(
    services,
    ["• Gel manos — con Laura", "• Pedicure Spa"].join("\n")
  );
  assert.doesNotMatch(services, /undefined|null|con\s*$/);
});

test("appointment_time: un servicio usa su hora individual", () => {
  assert.equal(getAppointmentReminderTimeForWhatsApp(appointment()), "10:30");
});

test("appointment_time: varios servicios usan la hora más temprana", () => {
  assert.equal(
    getAppointmentReminderTimeForWhatsApp(
      appointment({
        appointment_services: [
          { start_time: "10:00:00", status: "agendado" },
          { start_time: "11:00:00", status: "agendado" },
          { start_time: "12:30:00", status: "agendado" },
        ],
      })
    ),
    "10:00"
  );
});

test("appointment_time: servicios fuera de orden siguen devolviendo la hora más temprana", () => {
  assert.equal(
    getAppointmentReminderTimeForWhatsApp(
      appointment({
        appointment_services: [
          { start_time: "12:30:00", status: "agendado" },
          { start_time: "10:00:00", status: "agendado" },
          { start_time: "11:00:00", status: "agendado" },
        ],
      })
    ),
    "10:00"
  );
});

test("appointment_time: el servicio posterior creado primero en DB no afecta el resultado", () => {
  assert.equal(
    getAppointmentReminderTimeForWhatsApp(
      appointment({
        appointment_services: [
          {
            created_at: "2026-08-01T09:00:00Z",
            start_time: "12:30:00",
            status: "agendado",
          },
          {
            created_at: "2026-08-01T10:00:00Z",
            start_time: "10:00:00",
            status: "agendado",
          },
        ],
      })
    ),
    "10:00"
  );
});

test("appointment_time: servicio cancelado más temprano no se usa", () => {
  assert.equal(
    getAppointmentReminderTimeForWhatsApp(
      appointment({
        appointment_services: [
          { start_time: "09:00:00", status: "cancelado" },
          { start_time: "10:00:00", status: "agendado" },
          { start_time: "11:00:00", status: "agendado" },
        ],
      })
    ),
    "10:00"
  );
});

test("appointment_time: sin horarios individuales usa hora general como fallback", () => {
  assert.equal(
    getAppointmentReminderTimeForWhatsApp(
      appointment({
        start_time: "15:30:00",
        appointment_services: [
          { start_time: null, status: "agendado", services: { name: "Servicio" } },
        ],
      })
    ),
    "15:30"
  );
});

test("appointment_time: no hay desplazamiento por zona horaria", () => {
  assert.equal(formatAppointmentDateForWhatsApp("2026-08-28"), "28 de agosto de 2026");
  assert.equal(getAppointmentReminderTimeForWhatsApp(appointment()), "10:30");
});

test("plantillas: conserva client_first_name, business_name, services y variables desconocidas", () => {
  const message = renderAppointmentMessageTemplate(
    "{client_first_name} · {business_name} · {appointment_time} · {services} · {variable_futura}",
    appointment({ clients: { full_name: "Junuen Ruiz", phone: "9991112233" } }),
    { businessName: "Alexandra Ruiz Salón Spa" }
  );

  assert.match(message, /^Junuen · Alexandra Ruiz Salón Spa · 10:30 · Gel en uña natural · \{variable_futura\}$/);
});

test("plantillas: default de recordatorio conserva emojis, saltos y servicios con staff", () => {
  const message = renderAppointmentMessageTemplate(
    DEFAULT_APPOINTMENT_REMINDER_TEMPLATE,
    appointment(),
    { businessName: "Alexandra Ruiz Salón Spa" }
  );

  assert.match(message, /^✨ ¡Hola, Clienta!/);
  assert.match(message, /📅 Fecha: 28 de agosto de 2026/);
  assert.match(message, /🕐 Hora: 10:30/);
  assert.match(message, /• Gel en uña natural — con Laura/);
  assert.match(message, /tolerancia máxima de 10 minutos/);
});

test("plantillas: una plantilla guardada de recordatorio tiene prioridad sin sobrescribirse", () => {
  const messages = buildAppointmentManualWhatsAppMessages(appointment(), {
    businessName: "Alexandra Ruiz Salón Spa",
    templates: [
      {
        template_key: "recordatorio",
        title: "Recordatorio de cita",
        is_active: true,
        message_body:
          "Hola {client_first_name}\nServicios:\n{services_with_staff}\nHora: {appointment_time}",
      },
    ],
  });

  const reminder = messages.find((item) => item.key === "reminder").message;

  assert.equal(
    reminder,
    "Hola Clienta\nServicios:\n• Gel en uña natural — con Laura\nHora: 10:30"
  );
});

test("recordatorios manuales: no existe envío programático ni Cloud API", () => {
  const helperSource = readFileSync(
    new URL("../app/lib/manualWhatsApp.js", import.meta.url),
    "utf8"
  );
  const agendaSource = readFileSync(
    new URL("../app/admin/agenda/page.js", import.meta.url),
    "utf8"
  );
  const followupsSource = readFileSync(
    new URL("../app/admin/seguimientos/page.js", import.meta.url),
    "utf8"
  );
  const source = `${helperSource}\n${agendaSource}\n${followupsSource}`;

  assert.doesNotMatch(source, /\/messages\b|graph\.facebook\.com/i);
  assert.doesNotMatch(source, /fetch\([^)]*whatsapp/i);
  assert.doesNotMatch(helperSource, /fetch\(|supabase|followup_status|sent_at|\.from\(/i);
});

test("botones reales: Agenda y Seguimientos usan href nativo y onClick funcional", () => {
  const agendaSource = readFileSync(
    new URL("../app/admin/agenda/page.js", import.meta.url),
    "utf8"
  );
  const followupsSource = readFileSync(
    new URL("../app/admin/seguimientos/page.js", import.meta.url),
    "utf8"
  );

  assert.match(agendaSource, /href=\{manualWhatsAppUrl\}/);
  assert.match(agendaSource, /onClick=\{handleManualWhatsAppClick\}/);
  assert.match(followupsSource, /href=\{whatsappUrl\}/);
  assert.match(followupsSource, /onClick=\{\(\) => setMessage\(""\)\}/);
  assert.doesNotMatch(`${agendaSource}\n${followupsSource}`, /window\.open|openManualWhatsAppMessage/);
});
