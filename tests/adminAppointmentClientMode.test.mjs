import assert from "node:assert/strict";
import test from "node:test";

import {
  adminTransactionalAppointmentWritesEnabled,
  buildAdminAppointmentCreatePayload,
  getAdminTransactionalCreateBlocker,
} from "../app/lib/adminAppointmentClientMode.js";

const baseForm = {
  client_id: "client_1",
  appointment_date: "2026-08-01",
  deposit_amount: "",
  deposit_payment_method: "",
  design_image_url: "",
  notes: "Nota de prueba",
};
const baseLines = [
  {
    service_id: "service_1",
    staff_id: "staff_1",
    start_time: "09:00",
    end_time: "10:00",
    quantity: 1,
  },
  {
    service_id: "service_2",
    staff_id: "staff_1",
    start_time: "10:00",
    end_time: "10:30",
    quantity: 1,
  },
];

test("cliente admin 1: banderas apagadas mantienen flujo actual", () => {
  assert.equal(adminTransactionalAppointmentWritesEnabled({}), false);
});

test("cliente admin 2: requiere bandera compartida y bandera admin", () => {
  assert.equal(
    adminTransactionalAppointmentWritesEnabled({
      NEXT_PUBLIC_APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED: "true",
    }),
    false
  );
  assert.equal(
    adminTransactionalAppointmentWritesEnabled({
      NEXT_PUBLIC_APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED: "true",
      NEXT_PUBLIC_APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED: "true",
    }),
    true
  );
});

test("cliente admin 3: acepta nombres privados para pruebas de servidor", () => {
  assert.equal(
    adminTransactionalAppointmentWritesEnabled({
      APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED: "true",
      APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED: "true",
    }),
    true
  );
});

test("cliente admin 4: bloquea varios colaboradores sin fallback legacy", () => {
  const message = getAdminTransactionalCreateBlocker({
    form: baseForm,
    serviceLines: [
      baseLines[0],
      { ...baseLines[1], staff_id: "staff_2" },
    ],
  });
  assert.match(message, /una sola colaboradora/);
});

test("cliente admin 5: bloquea anticipo e imagen en modo transaccional piloto", () => {
  assert.match(
    getAdminTransactionalCreateBlocker({
      form: { ...baseForm, deposit_amount: "100" },
      serviceLines: baseLines,
    }),
    /anticipos/
  );
  assert.match(
    getAdminTransactionalCreateBlocker({
      form: { ...baseForm, design_image_url: "https://example.invalid/imagen.jpg" },
      serviceLines: baseLines,
    }),
    /imagen de diseño/
  );
});

test("cliente admin 6: bloquea extras personalizados en modo transaccional piloto", () => {
  const message = getAdminTransactionalCreateBlocker({
    form: baseForm,
    serviceLines: baseLines,
    appointmentExtras: [{ extra_id: "", name: "Extra personalizado" }],
  });
  assert.match(message, /extras existan en el catálogo/);
});

test("cliente admin 7: construye payload permitido por la API", () => {
  const payload = buildAdminAppointmentCreatePayload({
    eventId: "admin_event_test",
    form: baseForm,
    serviceLines: baseLines,
    appointmentExtras: [
      {
        extra_id: "extra_1",
        quantity: "2",
        staff_id: "staff_1",
        notes: "Detalle",
      },
    ],
    forceCreated: true,
  });

  assert.deepEqual(payload, {
    eventId: "admin_event_test",
    clientId: "client_1",
    serviceIds: ["service_1", "service_2"],
    date: "2026-08-01",
    startTime: "09:00",
    staffId: "staff_1",
    extras: [
      {
        extraId: "extra_1",
        quantity: 2,
        staffId: "staff_1",
        notes: "Detalle",
      },
    ],
    forceCreated: true,
    notes: "Nota de prueba",
  });
});
