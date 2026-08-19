import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildAppointmentManualWhatsAppMessages,
  buildFollowupWhatsAppMessage,
  buildWhatsAppUrl,
  isAppointmentEligibleForManualWhatsApp,
  normalizeWhatsAppPhone,
  openManualWhatsAppMessage,
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
        services: {
          name: "Gel en uña natural",
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
  assert.match(reminder, /28\/08\/2026/);
  assert.match(reminder, /10:30/);
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
