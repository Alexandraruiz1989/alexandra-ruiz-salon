import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmAppointmentPreview,
  createAppointmentFromConfirmedPreview,
  prepareAppointmentDraft,
} from "../app/lib/botAppointmentOrchestrator.js";
import { createProductionBotAppointmentRepository } from "../app/lib/botAppointmentProductionRepository.js";

const now = new Date("2026-07-24T12:00:00.000Z");
const enabledEnv = {
  APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED: "true",
  BOT_APPOINTMENT_WRITES_ENABLED: "true",
};

function confirmedDraft(overrides = {}) {
  const draft = prepareAppointmentDraft({
    conversationId: "11111111-1111-4111-8111-111111111111",
    customer: { name: "Clienta de prueba", phone: "9991112233" },
    participants: [
      {
        id: "person_1",
        label: "clienta",
        services: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Gel en manos",
          },
        ],
      },
    ],
    services: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Gel en manos",
        durationMinutes: 50,
        cleanupMinutes: 10,
        price: 250,
        priceType: "fixed",
        participantId: "person_1",
      },
    ],
    date: "2026-07-25",
    startTime: "09:00",
    endTime: "10:00",
    staff: {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Alexandra Ruiz",
      preference: "specific",
    },
    expectedPrice: 250,
    depositStatus: "not_required",
    now,
    ...overrides,
  });
  const result = confirmAppointmentPreview({
    draft,
    pendingStep: "confirmation",
    previewId: draft.previewId,
    explicitConfirmation: true,
    now,
  });
  assert.equal(result.ok, true);
  return result.draft;
}

function rpcPayload(draft, status = "created", overrides = {}) {
  return {
    status,
    appointmentId: "44444444-4444-4444-8444-444444444444",
    clientId: "55555555-5555-4555-8555-555555555555",
    idempotencyKey: [
      draft.conversationId,
      draft.previewId,
      draft.confirmation.id,
    ].join(":"),
    requestHash: "sha256",
    isReplay: status === "already_created",
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

function harness(responder, env = enabledEnv) {
  const calls = [];
  const supabase = {
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      const result = await responder(calls.length, parameters);
      return { data: result, error: null };
    },
    from() {
      throw new Error("No se permiten escrituras directas.");
    },
  };
  return {
    calls,
    repository: createProductionBotAppointmentRepository({
      supabase,
      env,
    }),
  };
}

test("integración 1: flujo confirmado crea por una sola RPC", async () => {
  const draft = confirmedDraft();
  const current = harness(async () => rpcPayload(draft));
  const result = await createAppointmentFromConfirmedPreview({
    draft,
    repository: current.repository,
    writesEnabled: true,
    now,
  });
  assert.equal(result.code, "created_and_verified");
  assert.equal(result.creation.servicesCreated, 1);
  assert.equal(current.calls.length, 1);
});

test("integración 2: replay persistente conserva la misma cita", async () => {
  const draft = confirmedDraft();
  const current = harness(async (call) =>
    rpcPayload(draft, call === 1 ? "created" : "already_created")
  );
  const first = await createAppointmentFromConfirmedPreview({
    draft,
    repository: current.repository,
    writesEnabled: true,
    now,
  });
  const second = await createAppointmentFromConfirmedPreview({
    draft: first.draft,
    repository: current.repository,
    writesEnabled: true,
    now,
  });
  assert.equal(first.creation.appointment.id, second.creation.appointment.id);
  assert.equal(second.code, "idempotent_replay");
  assert.equal(current.calls.length, 2);
});

test("integración 3: bandera desactivada impide toda RPC", async () => {
  const draft = confirmedDraft();
  const current = harness(async () => rpcPayload(draft), {});
  const result = await createAppointmentFromConfirmedPreview({
    draft,
    repository: current.repository,
    writesEnabled: false,
    now,
  });
  assert.equal(result.code, "write_disabled");
  assert.equal(current.calls.length, 0);
});

test("integración 4: preview expirada no alcanza la RPC", async () => {
  const draft = confirmedDraft();
  const current = harness(async () => rpcPayload(draft));
  const result = await createAppointmentFromConfirmedPreview({
    draft,
    repository: current.repository,
    writesEnabled: true,
    now: new Date("2026-07-24T12:16:00.000Z"),
  });
  assert.equal(result.code, "preview_expired");
  assert.equal(current.calls.length, 0);
});

test("integración 5: fingerprint modificado no alcanza la RPC", async () => {
  const draft = confirmedDraft();
  const current = harness(async () => rpcPayload(draft));
  const result = await createAppointmentFromConfirmedPreview({
    draft: { ...draft, date: "2026-07-26" },
    repository: current.repository,
    writesEnabled: true,
    now,
  });
  assert.equal(result.code, "preview_changed");
  assert.equal(current.calls.length, 0);
});

test("integración 6: anticipo requerido no verificado pasa a revisión", async () => {
  const draft = confirmedDraft({
    depositRequiredForWrite: true,
    depositStatus: "required_pending",
  });
  const current = harness(async () => rpcPayload(draft));
  const result = await createAppointmentFromConfirmedPreview({
    draft,
    repository: current.repository,
    writesEnabled: true,
    now,
  });
  assert.equal(result.code, "deposit_not_verified");
  assert.equal(result.status, "human_review");
  assert.equal(current.calls.length, 0);
});

test("integración 7: slot ocupado por la RPC invalida la confirmación", async () => {
  const draft = confirmedDraft();
  const current = harness(async () =>
    rpcPayload(draft, "not_available", {
      appointmentId: null,
      clientId: null,
      servicesCreated: 0,
      errorCode: "staff_overlap",
      errorMessage: "El horario fue ocupado.",
    })
  );
  const result = await createAppointmentFromConfirmedPreview({
    draft,
    repository: current.repository,
    writesEnabled: true,
    now,
  });
  assert.equal(result.code, "staff_overlap");
  assert.equal(result.draft.status, "ready_for_preview");
  assert.equal(result.draft.confirmation, null);
});

test("integración 8: servicio inválido nunca se reporta como cita creada", async () => {
  const draft = confirmedDraft();
  const current = harness(async () =>
    rpcPayload(draft, "invalid_service", {
      appointmentId: null,
      clientId: null,
      servicesCreated: 0,
      errorCode: "service_unavailable",
    })
  );
  const result = await createAppointmentFromConfirmedPreview({
    draft,
    repository: current.repository,
    writesEnabled: true,
    now,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
});

test("integración 9: revisión humana se conserva sin afirmar creación", async () => {
  const draft = confirmedDraft();
  const current = harness(async () =>
    rpcPayload(draft, "human_review", {
      appointmentId: null,
      clientId: null,
      servicesCreated: 0,
      errorCode: "variable_price_requires_review",
    })
  );
  const result = await createAppointmentFromConfirmedPreview({
    draft,
    repository: current.repository,
    writesEnabled: true,
    now,
  });
  assert.equal(result.status, "human_review");
  assert.equal(result.draft.status, "human_review");
});

test("integración 10: conflicto idempotente se reporta como fallo seguro", async () => {
  const draft = confirmedDraft();
  const current = harness(async () =>
    rpcPayload(draft, "idempotency_conflict", {
      appointmentId: null,
      clientId: null,
      servicesCreated: 0,
      errorCode: "idempotency_payload_mismatch",
    })
  );
  const result = await createAppointmentFromConfirmedPreview({
    draft,
    repository: current.repository,
    writesEnabled: true,
    now,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "idempotency_payload_mismatch");
});

test("integración 11: respuesta incompleta no confirma la cita", async () => {
  const draft = confirmedDraft();
  const current = harness(async () =>
    rpcPayload(draft, "created", { servicesCreated: 0 })
  );
  const result = await createAppointmentFromConfirmedPreview({
    draft,
    repository: current.repository,
    writesEnabled: true,
    now,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "incomplete_rpc_response");
});

test("integración 12: fallo de la RPC no anuncia una cita creada", async () => {
  const draft = confirmedDraft();
  let calls = 0;
  const repository = createProductionBotAppointmentRepository({
    env: enabledEnv,
    supabase: {
      async rpc() {
        calls += 1;
        return {
          data: null,
          error: { message: "fallo simulado" },
        };
      },
    },
  });
  const result = await createAppointmentFromConfirmedPreview({
    draft,
    repository,
    writesEnabled: true,
    now,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "rpc_unavailable");
  assert.equal(result.status, "failed");
  assert.equal(calls, 1);
});

test("integración 13: varias personas se detienen antes de preview y RPC", () => {
  const draft = prepareAppointmentDraft({
    conversationId: "11111111-1111-4111-8111-111111111111",
    customer: { name: "Clienta de prueba", phone: "9991112233" },
    participants: [
      {
        id: "person_1",
        label: "clienta",
        services: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Gel en manos",
          },
        ],
      },
      {
        id: "person_2",
        label: "acompañante",
        services: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            name: "Pedicure",
          },
        ],
      },
    ],
    services: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Gel en manos",
        participantId: "person_1",
        durationMinutes: 60,
        cleanupMinutes: 0,
        price: 250,
        priceType: "fixed",
      },
      {
        id: "77777777-7777-4777-8777-777777777777",
        name: "Pedicure",
        participantId: "person_2",
        durationMinutes: 60,
        cleanupMinutes: 0,
        price: 300,
        priceType: "fixed",
      },
    ],
    date: "2026-07-25",
    startTime: "09:00",
    endTime: "11:00",
    staff: {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Alexandra Ruiz",
    },
    expectedPrice: 550,
    depositStatus: "not_required",
    now,
  });
  assert.equal(draft.status, "human_review");
  assert.equal(draft.previewId, null);
  assert.equal(draft.humanReviewReason, "multiple_appointments_require_review");
});
