import assert from "node:assert/strict";
import test from "node:test";

import {
  appointmentContractFingerprint,
  normalizeAppointmentWriteContract,
} from "../app/lib/appointmentWriteContracts.js";
import {
  clearAppointmentWriteInFlightForTests,
  executeAppointmentWrite,
  exactServerFlagEnabled,
  getAppointmentWriteMode,
} from "../app/lib/appointmentWriteService.js";

const future = "2026-08-01T18:00:00.000Z";
const now = new Date("2026-07-24T12:00:00.000Z");

function contract(source = "admin", overrides = {}) {
  const base = normalizeAppointmentWriteContract({
    source,
    actorId: "11111111-1111-4111-8111-111111111111",
    eventId: source === "admin" ? "event_1" : "",
    conversationId: source === "bot" ? "conversation_1" : "",
    client: {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Clienta",
      phone: "9991112233",
    },
    participant: { id: "person_1", label: "clienta" },
    services: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Manicure",
        staffId: "44444444-4444-4444-8444-444444444444",
        participantId: "person_1",
        durationMinutes: 50,
        cleanupMinutes: 10,
        price: 250,
        priceType: "fixed",
        active: true,
        bookable: true,
      },
    ],
    date: "2026-08-01",
    startTime: "09:00",
    endTime: "10:00",
    staffId: "44444444-4444-4444-8444-444444444444",
    previewId: `${source}_preview_1`,
    confirmationId: `${source}_confirmation_1`,
    previewVersion: 1,
    previewExpiresAt: source === "admin" ? "" : future,
    expectedPrice: 250,
    depositStatus: "not_required",
    ...overrides,
  });
  return {
    ...base,
    requestHash:
      overrides.requestHash || appointmentContractFingerprint(base),
  };
}

function created(id = "55555555-5555-4555-8555-555555555555") {
  return {
    status: "created",
    appointmentId: id,
    clientId: "22222222-2222-4222-8222-222222222222",
    servicesCreated: 1,
  };
}

function transactionalEnv(source) {
  return {
    APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED: "true",
    ...(source === "admin"
      ? { APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED: "true" }
      : source === "client_portal"
      ? { APPOINTMENT_PORTAL_TRANSACTIONAL_WRITES_ENABLED: "true" }
      : { BOT_APPOINTMENT_WRITES_ENABLED: "true" }),
  };
}

test("shared 1: origen admin válido usa compatibilidad", async () => {
  const result = await executeAppointmentWrite({
    input: contract("admin"),
    legacyWriter: async () => created(),
    now,
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, "admin");
  assert.equal(result.mode, "legacy");
});

test("shared 2: origen portal válido usa compatibilidad", async () => {
  const result = await executeAppointmentWrite({
    input: contract("client_portal"),
    legacyWriter: async () => created(),
    now,
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, "client_portal");
});

test("shared 3: origen bot válido exige las dos banderas", async () => {
  const result = await executeAppointmentWrite({
    input: contract("bot"),
    env: transactionalEnv("bot"),
    transactionalRepository: {
      createAppointmentTransaction: async () => created(),
    },
    now,
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "transactional");
});

test("shared 4: origen desconocido se rechaza", async () => {
  const result = await executeAppointmentWrite({
    input: contract("unknown"),
    legacyWriter: async () => created(),
    now,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_source");
});

test("shared 5: banderas ausentes, TRUE y 1 permanecen apagadas", () => {
  assert.equal(exactServerFlagEnabled("FLAG", {}), false);
  assert.equal(exactServerFlagEnabled("FLAG", { FLAG: "TRUE" }), false);
  assert.equal(exactServerFlagEnabled("FLAG", { FLAG: "1" }), false);
  assert.equal(exactServerFlagEnabled("FLAG", { FLAG: "true" }), true);
});

test("shared 6: el navegador no puede enviar writesEnabled", async () => {
  const result = await executeAppointmentWrite({
    input: { ...contract("admin"), writesEnabled: true },
    legacyWriter: async () => created(),
    now,
  });
  assert.equal(result.code, "unsupported_write_control");
});

test("shared 7: nunca ejecuta escritor antiguo y transaccional juntos", async () => {
  let legacyCalls = 0;
  let transactionalCalls = 0;
  const result = await executeAppointmentWrite({
    input: contract("admin"),
    env: transactionalEnv("admin"),
    legacyWriter: async () => {
      legacyCalls += 1;
      return created();
    },
    transactionalRepository: {
      async createAppointmentTransaction() {
        transactionalCalls += 1;
        return created();
      },
    },
    now,
  });
  assert.equal(result.ok, true);
  assert.equal(legacyCalls, 0);
  assert.equal(transactionalCalls, 1);
});

test("shared 8: bot nunca utiliza el escritor secuencial", async () => {
  let legacyCalls = 0;
  const result = await executeAppointmentWrite({
    input: contract("bot"),
    legacyWriter: async () => {
      legacyCalls += 1;
      return created();
    },
    now,
  });
  assert.equal(result.code, "write_disabled");
  assert.equal(legacyCalls, 0);
});

test("shared 9: resultado transaccional incompleto se rechaza", async () => {
  const result = await executeAppointmentWrite({
    input: contract("admin"),
    env: transactionalEnv("admin"),
    transactionalRepository: {
      createAppointmentTransaction: async () => ({
        status: "created",
        appointmentId: "",
        servicesCreated: 0,
      }),
    },
    now,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "incomplete_write_result");
});

test("shared 10: doble confirmación concurrente ejecuta una sola vez", async () => {
  clearAppointmentWriteInFlightForTests();
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const options = {
    input: contract("admin"),
    legacyWriter: async () => {
      calls += 1;
      await pending;
      return created();
    },
    now,
  };
  const first = executeAppointmentWrite(options);
  const second = executeAppointmentWrite(options);
  release();
  const [left, right] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(left.appointmentId, right.appointmentId);
  assert.equal(right.isReplay, true);
});

test("shared 11: cambio de hash invalida la confirmación", async () => {
  const result = await executeAppointmentWrite({
    input: { ...contract("admin"), requestHash: "aw_changed" },
    legacyWriter: async () => created(),
    now,
  });
  assert.equal(result.code, "preview_changed");
});

test("shared 12: servicio desactivado se rechaza", async () => {
  const original = contract("admin");
  const changed = contract("admin", {
    services: [{ ...original.services[0], active: false }],
  });
  const result = await executeAppointmentWrite({
    input: changed,
    env: transactionalEnv("admin"),
    transactionalRepository: {
      createAppointmentTransaction: async () => created(),
    },
    now,
  });
  assert.equal(result.code, "invalid_service");
});

test("shared 13: varias técnicas requieren revisión", async () => {
  const original = contract("admin");
  const changed = contract("admin", {
    services: [
      original.services[0],
      {
        ...original.services[0],
        id: "66666666-6666-4666-8666-666666666666",
        staffId: "77777777-7777-4777-8777-777777777777",
      },
    ],
  });
  const result = await executeAppointmentWrite({
    input: changed,
    env: transactionalEnv("admin"),
    transactionalRepository: {
      createAppointmentTransaction: async () => created(),
    },
    now,
  });
  assert.equal(result.status, "human_review");
});

test("shared 14: horario con vista previa expirada se rechaza", async () => {
  const result = await executeAppointmentWrite({
    input: contract("client_portal", {
      previewExpiresAt: "2026-07-24T11:00:00.000Z",
    }),
    legacyWriter: async () => created(),
    now,
  });
  assert.equal(result.code, "preview_expired");
});

test("shared 15: precio actualizado invalida la vista previa", async () => {
  const original = contract("client_portal");
  const result = await executeAppointmentWrite({
    input: {
      ...original,
      services: [{ ...original.services[0], price: 300 }],
    },
    legacyWriter: async () => created(),
    now,
  });
  assert.equal(result.code, "preview_changed");
});

test("shared 16: duración actualizada invalida la vista previa", async () => {
  const original = contract("client_portal");
  const result = await executeAppointmentWrite({
    input: {
      ...original,
      services: [{ ...original.services[0], durationMinutes: 60 }],
    },
    legacyWriter: async () => created(),
    now,
  });
  assert.equal(result.code, "preview_changed");
});

test("shared 17: el modo por canal requiere bandera compartida", () => {
  assert.equal(
    getAppointmentWriteMode("admin", {
      APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED: "true",
    }),
    "legacy"
  );
  assert.equal(
    getAppointmentWriteMode("bot", {
      BOT_APPOINTMENT_WRITES_ENABLED: "true",
    }),
    "write_disabled"
  );
});
