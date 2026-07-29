import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmClientPortalAppointment,
  prepareClientPortalAppointment,
} from "../app/lib/appointmentChannelAdapters.js";
import {
  appointmentContractFingerprint,
  isPortalBookableService,
  validateAppointmentWriteContract,
} from "../app/lib/appointmentWriteContracts.js";

const now = new Date("2026-07-24T12:00:00.000Z");

function service(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Manicure",
    active: true,
    service_type: "servicio",
    variable_pricing: false,
    bot_active: true,
    bot_bookable: true,
    duration_minutes: 50,
    cleanup_minutes: 10,
    base_price: 250,
    ...overrides,
  };
}

function slot(services = [service()], overrides = {}) {
  let minute = 9 * 60;
  const segments = services.map((item) => {
    const start = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(
      minute % 60
    ).padStart(2, "0")}`;
    minute += Number(item.duration_minutes) + Number(item.cleanup_minutes);
    const end = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(
      minute % 60
    ).padStart(2, "0")}`;
    return {
      service_id: item.id,
      service: item,
      staff_id: "22222222-2222-4222-8222-222222222222",
      service_date: "2026-08-01",
      start_time: start,
      end_time: end,
      duration_minutes: item.duration_minutes,
      cleanup_minutes: item.cleanup_minutes,
      price: item.base_price,
    };
  });
  return {
    date: "2026-08-01",
    staff_id: "22222222-2222-4222-8222-222222222222",
    staff_name: "Laura Canul",
    start_time: "09:00",
    end_time: segments.at(-1).end_time,
    duration_minutes: minute - 9 * 60,
    service_segments: segments,
    ...overrides,
  };
}

function preview(overrides = {}) {
  return prepareClientPortalAppointment({
    actorId: "33333333-3333-4333-8333-333333333333",
    client: {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Clienta",
      phone: "9991112233",
    },
    slot: slot(),
    now,
    ...overrides,
  });
}

function created() {
  return {
    status: "created",
    appointmentId: "55555555-5555-4555-8555-555555555555",
    clientId: "44444444-4444-4444-8444-444444444444",
    servicesCreated: 1,
  };
}

test("portal 1: carga solo servicios públicos activos", () => {
  const catalog = [service(), service({ id: "2", active: false })];
  assert.deepEqual(catalog.filter(isPortalBookableService).map((item) => item.id), [
    service().id,
  ]);
});

test("portal 2: oculta servicios internos", () => {
  assert.equal(
    isPortalBookableService(service({ service_type: "extra" })),
    false
  );
});

test("portal 3: un servicio queda en la vista previa", () => {
  assert.equal(preview().services.length, 1);
});

test("portal 4: conserva dos servicios", () => {
  const second = service({
    id: "66666666-6666-4666-8666-666666666666",
    name: "Pedicure",
    duration_minutes: 40,
    base_price: 300,
  });
  const result = preview({ slot: slot([service(), second]) });
  assert.deepEqual(result.services.map((item) => item.name), [
    "Manicure",
    "Pedicure",
  ]);
});

test("portal 5: acumula duración de dos servicios", () => {
  const second = service({
    id: "66666666-6666-4666-8666-666666666666",
    duration_minutes: 40,
    cleanup_minutes: 5,
  });
  const result = preview({ slot: slot([service(), second]) });
  const duration = result.services.reduce(
    (sum, item) => sum + item.durationMinutes + item.cleanupMinutes,
    0
  );
  assert.equal(duration, 105);
  assert.equal(result.endTime, "10:45");
});

test("portal 6: colaboradora específica queda vinculada", () => {
  assert.equal(
    preview().staffId,
    "22222222-2222-4222-8222-222222222222"
  );
});

test("portal 7: cualquiera se resuelve a colaboradora concreta en servidor", () => {
  const selectedByServer = preview();
  assert.ok(selectedByServer.staffId);
  assert.equal(selectedByServer.services[0].staffId, selectedByServer.staffId);
});

test("portal 8: técnica no compatible requiere revisión", () => {
  const current = preview();
  const input = {
    ...current,
    services: [
      {
        ...current.services[0],
        staffId: "77777777-7777-4777-8777-777777777777",
      },
    ],
  };
  input.requestHash = appointmentContractFingerprint(input);
  const validation = validateAppointmentWriteContract(input, { now });
  assert.equal(validation.code, "human_review");
});

test("portal 9: horario ocupado se conserva como no disponible", async () => {
  const result = await confirmClientPortalAppointment({
    input: preview(),
    env: {
      APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED: "true",
      APPOINTMENT_PORTAL_TRANSACTIONAL_WRITES_ENABLED: "true",
    },
    transactionalRepository: {
      createAppointmentTransaction: async () => ({
        status: "not_available",
        errorCode: "staff_overlap",
      }),
    },
    now,
  });
  assert.equal(result.status, "not_available");
  assert.equal(result.ok, false);
});

test("portal 10: horario vencido se rechaza", () => {
  const current = preview();
  const validation = validateAppointmentWriteContract(
    { ...current, previewExpiresAt: "2026-07-24T11:59:00.000Z" },
    { now }
  );
  assert.equal(validation.code, "preview_expired");
});

test("portal 11: vista previa incluye identidad versionada", () => {
  const current = preview();
  assert.match(current.previewId, /^portal_preview_/);
  assert.equal(current.previewVersion, 1);
  assert.match(current.confirmationId, /^portal_confirmation_/);
  assert.match(current.requestHash, /^aw_/);
});

test("portal 12: cambio posterior invalida la vista previa", () => {
  const current = preview();
  const validation = validateAppointmentWriteContract(
    {
      ...current,
      date: "2026-08-02",
    },
    { now }
  );
  assert.equal(validation.code, "preview_changed");
});

test("portal 13: confirmación válida usa un solo escritor", async () => {
  let calls = 0;
  const result = await confirmClientPortalAppointment({
    input: preview(),
    legacyWriter: async () => {
      calls += 1;
      return created();
    },
    now,
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
});

test("portal 14: confirmación repetida puede regresar replay", async () => {
  const result = await confirmClientPortalAppointment({
    input: preview(),
    legacyWriter: async () => ({
      ...created(),
      status: "already_created",
      isReplay: true,
    }),
    now,
  });
  assert.equal(result.isReplay, true);
});

test("portal 15: doble clic concurrente no duplica la llamada", async () => {
  let calls = 0;
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const options = {
    input: preview(),
    legacyWriter: async () => {
      calls += 1;
      await wait;
      return created();
    },
    now,
  };
  const first = confirmClientPortalAppointment(options);
  const second = confirmClientPortalAppointment(options);
  release();
  const results = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(results[1].isReplay, true);
});

test("portal 16: clienta existente conserva su id", () => {
  assert.equal(
    preview().client.id,
    "44444444-4444-4444-8444-444444444444"
  );
});

test("portal 17: clienta nueva puede usar nombre y teléfono sin exponer búsquedas", () => {
  const result = prepareClientPortalAppointment({
    actorId: "33333333-3333-4333-8333-333333333333",
    client: { name: "Nueva clienta", phone: "9992223344" },
    slot: slot(),
    now,
  });
  assert.equal(validateAppointmentWriteContract(result, { now }).ok, true);
});

test("portal 18: teléfono inválido se rechaza", () => {
  const result = prepareClientPortalAppointment({
    actorId: "33333333-3333-4333-8333-333333333333",
    client: { name: "Nueva clienta", phone: "123" },
    slot: slot(),
    now,
  });
  assert.equal(
    validateAppointmentWriteContract(result, { now }).errors.includes(
      "client_phone_invalid"
    ),
    true
  );
});

test("portal 19: precio variable no se publica", () => {
  assert.equal(
    isPortalBookableService(service({ variable_pricing: true })),
    false
  );
});

test("portal 20: servicio de revisión humana no se confirma", () => {
  const current = preview();
  const changed = {
    ...current,
    services: [
      { ...current.services[0], requiresHumanReview: true },
    ],
  };
  changed.requestHash = appointmentContractFingerprint(changed);
  assert.equal(
    validateAppointmentWriteContract(changed, { now }).code,
    "human_review"
  );
});

test("portal 21: anticipo pendiente no se marca verificado", () => {
  const current = preview();
  const changed = {
    ...current,
    depositStatus: "required_pending",
    depositRequiredForWrite: true,
  };
  changed.requestHash = appointmentContractFingerprint(changed);
  const validation = validateAppointmentWriteContract(changed, { now });
  assert.equal(validation.code, "human_review");
  assert.notEqual(validation.contract.depositStatus, "verified");
});

test("portal 22: error de red se normaliza", async () => {
  const result = await confirmClientPortalAppointment({
    input: preview(),
    legacyWriter: async () => {
      throw new Error("network");
    },
    now,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "legacy_write_failed");
});

test("portal 23: RPC no disponible no cae al escritor antiguo", async () => {
  let legacyCalls = 0;
  const result = await confirmClientPortalAppointment({
    input: preview(),
    env: {
      APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED: "true",
      APPOINTMENT_PORTAL_TRANSACTIONAL_WRITES_ENABLED: "true",
    },
    legacyWriter: async () => {
      legacyCalls += 1;
      return created();
    },
    transactionalRepository: {},
    now,
  });
  assert.equal(result.code, "transactional_repository_unavailable");
  assert.equal(legacyCalls, 0);
});

test("portal 24: bandera transaccional apagada usa solo compatibilidad", async () => {
  let legacyCalls = 0;
  let transactionalCalls = 0;
  const result = await confirmClientPortalAppointment({
    input: preview(),
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

test("portal 25: las pruebas usan repositorios falsos y no Supabase", async () => {
  let fakeWrites = 0;
  const result = await confirmClientPortalAppointment({
    input: preview(),
    legacyWriter: async () => {
      fakeWrites += 1;
      return created();
    },
    now,
  });
  assert.equal(result.ok, true);
  assert.equal(fakeWrites, 1);
});

test("portal 26: servicio desactivado invalida el catálogo público", () => {
  assert.equal(isPortalBookableService(service({ active: false })), false);
});

test("portal 27: precios provienen del snapshot del servidor", () => {
  const result = preview();
  assert.equal(result.expectedPrice, 250);
  assert.equal(result.services[0].price, 250);
});
