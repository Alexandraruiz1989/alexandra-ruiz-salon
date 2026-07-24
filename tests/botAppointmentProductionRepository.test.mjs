import assert from "node:assert/strict";
import test from "node:test";

import {
  BOT_APPOINTMENT_RPC_NAME,
  botAppointmentWritesEnabled,
  createProductionBotAppointmentRepository,
} from "../app/lib/botAppointmentProductionRepository.js";

const draft = {
  conversationId: "11111111-1111-4111-8111-111111111111",
  previewId: "preview_1",
  version: 1,
  fingerprint: "fp_12345678",
  confirmation: { id: "confirmation_1" },
  customer: {
    id: "",
    name: "Clienta de prueba",
    phone: "999 111 2233",
  },
  participants: [{ id: "person_1" }],
  services: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      participantId: "person_1",
      durationMinutes: 50,
      cleanupMinutes: 10,
      price: 250,
    },
  ],
  date: "2026-07-25",
  startTime: "09:00",
  endTime: "10:00",
  staff: { id: "33333333-3333-4333-8333-333333333333" },
  expectedPrice: 250,
  depositStatus: "not_required",
  expiresAt: "2026-07-25T14:15:00.000Z",
};
const idempotencyKey = "conversation:preview:confirmation";

function createdPayload(overrides = {}) {
  return {
    status: "created",
    appointmentId: "44444444-4444-4444-8444-444444444444",
    clientId: "55555555-5555-4555-8555-555555555555",
    idempotencyKey,
    requestHash: "hash",
    isReplay: false,
    servicesCreated: 1,
    date: draft.date,
    startTime: draft.startTime,
    endTime: draft.endTime,
    staffId: draft.staff.id,
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

function createSupabase(result) {
  const calls = [];
  return {
    calls,
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      return typeof result === "function"
        ? result(name, parameters)
        : result;
    },
    from() {
      throw new Error("El repositorio de producción no debe usar from().");
    },
  };
}

test("repo 1: la bandera solo acepta true exacto", () => {
  assert.equal(botAppointmentWritesEnabled({}), false);
  assert.equal(
    botAppointmentWritesEnabled({ BOT_APPOINTMENT_WRITES_ENABLED: "TRUE" }),
    false
  );
  assert.equal(
    botAppointmentWritesEnabled({ BOT_APPOINTMENT_WRITES_ENABLED: "true" }),
    true
  );
});

test("repo 2: bandera inactiva no llama RPC", async () => {
  const supabase = createSupabase({ data: createdPayload(), error: null });
  const repository = createProductionBotAppointmentRepository({
    supabase,
    env: {},
  });
  const result = await repository.createAppointmentTransaction({
    draft,
    idempotencyKey,
  });
  assert.equal(result.status, "write_disabled");
  assert.equal(supabase.calls.length, 0);
});

test("repo 3: llama únicamente la RPC transaccional con snapshots", async () => {
  const supabase = createSupabase({ data: createdPayload(), error: null });
  const repository = createProductionBotAppointmentRepository({
    supabase,
    env: { BOT_APPOINTMENT_WRITES_ENABLED: "true" },
  });
  const result = await repository.createAppointmentTransaction({
    draft,
    idempotencyKey,
  });
  assert.equal(result.status, "created");
  assert.equal(supabase.calls.length, 1);
  assert.equal(supabase.calls[0].name, BOT_APPOINTMENT_RPC_NAME);
  assert.deepEqual(supabase.calls[0].parameters.p_services, [
    {
      serviceId: draft.services[0].id,
      participantId: "person_1",
      durationMinutes: 50,
      cleanupMinutes: 10,
      price: 250,
    },
  ]);
});

test("repo 4: nunca envía datos ni operaciones de pagos", async () => {
  const supabase = createSupabase({ data: createdPayload(), error: null });
  const repository = createProductionBotAppointmentRepository({
    supabase,
    env: { BOT_APPOINTMENT_WRITES_ENABLED: "true" },
  });
  await repository.createAppointmentTransaction({ draft, idempotencyKey });
  const serialized = JSON.stringify(supabase.calls[0]);
  assert.doesNotMatch(serialized, /payment|payments|deposit_amount/i);
});

test("repo 5: error del proveedor se normaliza sin detalle técnico", async () => {
  const supabase = createSupabase({
    data: null,
    error: { message: "relation does not exist", details: "secret detail" },
  });
  const repository = createProductionBotAppointmentRepository({
    supabase,
    env: { BOT_APPOINTMENT_WRITES_ENABLED: "true" },
  });
  const result = await repository.createAppointmentTransaction({
    draft,
    idempotencyKey,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "rpc_unavailable");
  assert.doesNotMatch(JSON.stringify(result), /relation|secret/i);
});

test("repo 6: excepción de red se normaliza de forma segura", async () => {
  const supabase = createSupabase(() => {
    throw new Error("network secret");
  });
  const repository = createProductionBotAppointmentRepository({
    supabase,
    env: { BOT_APPOINTMENT_WRITES_ENABLED: "true" },
  });
  const result = await repository.createAppointmentTransaction({
    draft,
    idempotencyKey,
  });
  assert.equal(result.errorCode, "rpc_unavailable");
  assert.doesNotMatch(JSON.stringify(result), /network secret/i);
});

test("repo 7: replay completo se acepta y conserva isReplay", async () => {
  const supabase = createSupabase({
    data: createdPayload({ status: "already_created", isReplay: true }),
    error: null,
  });
  const repository = createProductionBotAppointmentRepository({
    supabase,
    env: { BOT_APPOINTMENT_WRITES_ENABLED: "true" },
  });
  const result = await repository.createAppointmentTransaction({
    draft,
    idempotencyKey,
  });
  assert.equal(result.status, "already_created");
  assert.equal(result.isReplay, true);
});

test("repo 8: creación sin servicios verificados se rechaza", async () => {
  const supabase = createSupabase({
    data: createdPayload({ servicesCreated: 0 }),
    error: null,
  });
  const repository = createProductionBotAppointmentRepository({
    supabase,
    env: { BOT_APPOINTMENT_WRITES_ENABLED: "true" },
  });
  const result = await repository.createAppointmentTransaction({
    draft,
    idempotencyKey,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "incomplete_rpc_response");
});

test("repo 9: respuesta con otra identidad se rechaza", async () => {
  const supabase = createSupabase({
    data: createdPayload({ idempotencyKey: "otra-operacion" }),
    error: null,
  });
  const repository = createProductionBotAppointmentRepository({
    supabase,
    env: { BOT_APPOINTMENT_WRITES_ENABLED: "true" },
  });
  const result = await repository.createAppointmentTransaction({
    draft,
    idempotencyKey,
  });
  assert.equal(result.errorCode, "incomplete_rpc_response");
});

test("repo 10: respuesta con fecha, hora o colaboradora distinta se rechaza", async () => {
  for (const mismatch of [
    { date: "2026-07-26" },
    { startTime: "10:00" },
    { endTime: "10:30" },
    { staffId: "66666666-6666-4666-8666-666666666666" },
  ]) {
    const supabase = createSupabase({
      data: createdPayload(mismatch),
      error: null,
    });
    const repository = createProductionBotAppointmentRepository({
      supabase,
      env: { BOT_APPOINTMENT_WRITES_ENABLED: "true" },
    });
    const result = await repository.createAppointmentTransaction({
      draft,
      idempotencyKey,
    });
    assert.equal(result.errorCode, "incomplete_rpc_response");
  }
});

test("repo 11: estados desconocidos nunca se aceptan como creación", async () => {
  const supabase = createSupabase({
    data: createdPayload({ status: "success" }),
    error: null,
  });
  const repository = createProductionBotAppointmentRepository({
    supabase,
    env: { BOT_APPOINTMENT_WRITES_ENABLED: "true" },
  });
  const result = await repository.createAppointmentTransaction({
    draft,
    idempotencyKey,
  });
  assert.equal(result.status, "failed");
});

for (const [status, errorCode] of [
  ["idempotency_conflict", "idempotency_payload_mismatch"],
  ["not_available", "staff_overlap"],
  ["invalid_service", "service_unavailable"],
  ["invalid_staff", "staff_unavailable"],
  ["deposit_pending", "deposit_pending"],
]) {
  test(`repo: normaliza el estado ${status}`, async () => {
    const supabase = createSupabase({
      data: createdPayload({
        status,
        appointmentId: null,
        clientId: null,
        servicesCreated: 0,
        errorCode,
        errorMessage: "La solicitud no puede crearse.",
      }),
      error: null,
    });
    const repository = createProductionBotAppointmentRepository({
      supabase,
      env: { BOT_APPOINTMENT_WRITES_ENABLED: "true" },
    });
    const result = await repository.createAppointmentTransaction({
      draft,
      idempotencyKey,
    });
    assert.equal(result.status, status);
    assert.equal(result.errorCode, errorCode);
    assert.equal(result.appointmentId, null);
  });
}

test("repo 12: estado created sin appointmentId se rechaza", async () => {
  const supabase = createSupabase({
    data: createdPayload({ appointmentId: null }),
    error: null,
  });
  const repository = createProductionBotAppointmentRepository({
    supabase,
    env: { BOT_APPOINTMENT_WRITES_ENABLED: "true" },
  });
  const result = await repository.createAppointmentTransaction({
    draft,
    idempotencyKey,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "incomplete_rpc_response");
});
