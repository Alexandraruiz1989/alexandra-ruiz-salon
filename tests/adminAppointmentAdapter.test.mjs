import assert from "node:assert/strict";
import test from "node:test";

import {
  createAppointmentFromAdmin,
  prepareAdminAppointmentContract,
} from "../app/lib/appointmentChannelAdapters.js";
import { clearAppointmentWriteInFlightForTests } from "../app/lib/appointmentWriteService.js";

const now = new Date("2026-07-24T12:00:00.000Z");
const enabledEnv = {
  APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED: "true",
  APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED: "true",
};

function service(id, overrides = {}) {
  return {
    id,
    name: "Manicure",
    staffId: "22222222-2222-4222-8222-222222222222",
    participantId: "person_1",
    durationMinutes: 50,
    cleanupMinutes: 10,
    price: 250,
    priceType: "fixed",
    active: true,
    bookable: true,
    ...overrides,
  };
}

function contract(overrides = {}) {
  return prepareAdminAppointmentContract({
    actorId: "11111111-1111-4111-8111-111111111111",
    eventId: "admin_event_1",
    client: {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Clienta",
      phone: "9991112233",
    },
    services: [service("44444444-4444-4444-8444-444444444444")],
    date: "2026-08-01",
    startTime: "09:00",
    endTime: "10:00",
    staffId: "22222222-2222-4222-8222-222222222222",
    expectedPrice: 250,
    depositStatus: "not_required",
    ...overrides,
  });
}

function created(servicesCreated = 1) {
  return {
    status: "created",
    appointmentId: "55555555-5555-4555-8555-555555555555",
    clientId: "33333333-3333-4333-8333-333333333333",
    servicesCreated,
  };
}

test("admin 1: adapta una cita con un servicio", () => {
  const result = contract();
  assert.equal(result.source, "admin");
  assert.equal(result.services.length, 1);
});

test("admin 2: conserva varios servicios", () => {
  const result = contract({
    services: [
      service("44444444-4444-4444-8444-444444444444"),
      service("66666666-6666-4666-8666-666666666666", {
        name: "Pedicure",
        durationMinutes: 40,
        price: 300,
      }),
    ],
    endTime: "10:50",
    expectedPrice: 550,
  });
  assert.equal(result.services.length, 2);
  assert.equal(result.expectedPrice, 550);
});

test("admin 3: conserva clienta existente", () => {
  assert.ok(contract().client.id);
});

test("admin 4: permite preparar clienta nueva con datos mínimos", () => {
  const result = contract({
    client: { name: "Nueva clienta", phone: "9992223344" },
  });
  assert.equal(result.client.id, "");
  assert.equal(result.client.name, "Nueva clienta");
});

test("admin 5: conserva técnica específica", () => {
  assert.equal(
    contract().staffId,
    "22222222-2222-4222-8222-222222222222"
  );
});

test("admin 6: traslape del repositorio no se anuncia como creado", async () => {
  const result = await createAppointmentFromAdmin({
    input: contract(),
    env: enabledEnv,
    transactionalRepository: {
      createAppointmentTransaction: async () => ({
        status: "not_available",
        errorCode: "staff_overlap",
      }),
    },
    now,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "not_available");
});

test("admin 7: doble clic en vuelo llama una vez", async () => {
  clearAppointmentWriteInFlightForTests();
  let calls = 0;
  let release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const options = {
    input: contract(),
    legacyWriter: async () => {
      calls += 1;
      await waiting;
      return created();
    },
    now,
  };
  const first = createAppointmentFromAdmin(options);
  const second = createAppointmentFromAdmin(options);
  release();
  const results = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(results[1].isReplay, true);
});

test("admin 8: confirmación repetida conserva la misma identidad", () => {
  const first = contract();
  const second = contract();
  assert.equal(first.requestHash, second.requestHash);
  assert.equal(first.confirmationId, second.confirmationId);
});

test("admin 9: fallo al crear servicios invalida el resultado", async () => {
  const result = await createAppointmentFromAdmin({
    input: contract(),
    legacyWriter: async () => ({
      status: "created",
      appointmentId: "55555555-5555-4555-8555-555555555555",
      servicesCreated: 0,
    }),
    now,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "incomplete_write_result");
});

test("admin 10: bandera apagada usa únicamente el flujo actual", async () => {
  let legacyCalls = 0;
  let transactionalCalls = 0;
  const result = await createAppointmentFromAdmin({
    input: contract(),
    env: {},
    legacyWriter: async () => {
      legacyCalls += 1;
      return created();
    },
    transactionalRepository: {
      createAppointmentTransaction: async () => {
        transactionalCalls += 1;
        return created();
      },
    },
    now,
  });
  assert.equal(result.mode, "legacy");
  assert.equal(legacyCalls, 1);
  assert.equal(transactionalCalls, 0);
});

test("admin 11: bandera futura usa únicamente el repositorio simulado", async () => {
  let legacyCalls = 0;
  let transactionalCalls = 0;
  const result = await createAppointmentFromAdmin({
    input: contract(),
    env: enabledEnv,
    legacyWriter: async () => {
      legacyCalls += 1;
      return created();
    },
    transactionalRepository: {
      createAppointmentTransaction: async () => {
        transactionalCalls += 1;
        return created();
      },
    },
    now,
  });
  assert.equal(result.mode, "transactional");
  assert.equal(legacyCalls, 0);
  assert.equal(transactionalCalls, 1);
});

test("admin 12: nunca usa ambos escritores", async () => {
  const calls = [];
  await createAppointmentFromAdmin({
    input: contract(),
    env: enabledEnv,
    legacyWriter: async () => {
      calls.push("legacy");
      return created();
    },
    transactionalRepository: {
      createAppointmentTransaction: async () => {
        calls.push("transactional");
        return created();
      },
    },
    now,
  });
  assert.deepEqual(calls, ["transactional"]);
});
