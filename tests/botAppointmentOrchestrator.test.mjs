import assert from "node:assert/strict";
import test from "node:test";

import {
  botAppointmentWritesEnabled,
  confirmAppointmentPreview,
  createAppointmentFromConfirmedPreview,
  prepareAppointmentDraft,
} from "../app/lib/botAppointmentOrchestrator.js";

const baseNow = new Date("2026-07-24T12:00:00.000Z");
const services = [
  {
    id: "gel",
    name: "Gel en manos",
    active: true,
    base_price: 250,
    duration_minutes: 50,
    cleanup_minutes: 10,
  },
  {
    id: "pedi",
    name: "Pedicure clásico",
    active: true,
    base_price: 300,
    duration_minutes: 60,
    cleanup_minutes: 10,
  },
];
const staff = { id: "alexandra", full_name: "Alexandra Ruiz", active: true };

function makeDraft(overrides = {}) {
  return prepareAppointmentDraft({
    conversationId: "conversation-1",
    customer: { name: "Clienta de prueba", phone: "test:0000000000" },
    participants: [
      {
        id: "person_1",
        label: "clienta",
        services: services.map((service) => ({
          id: service.id,
          name: service.name,
        })),
      },
    ],
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      durationMinutes: service.duration_minutes,
      cleanupMinutes: service.cleanup_minutes,
      price: service.base_price,
      priceType: "fixed",
      participantId: "person_1",
    })),
    date: "2026-07-25",
    startTime: "09:00",
    endTime: "11:10",
    staff: {
      id: staff.id,
      name: staff.full_name,
      preference: "specific",
    },
    expectedPrice: 550,
    depositStatus: "not_required",
    now: baseNow,
    ...overrides,
  });
}

function confirmDraft(draft = makeDraft(), now = baseNow) {
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

function createFakeRepository(options = {}) {
  const state = {
    services: (options.services || services).map((service) => ({ ...service })),
    staff: options.staff === undefined ? { ...staff } : options.staff,
    available: options.available !== false,
    failServices: options.failServices === true,
    appointments: [],
    appointmentServices: [],
    idempotency: new Map(),
    calls: {
      clients: 0,
      appointments: 0,
      services: 0,
      payments: 0,
      compensation: 0,
    },
  };
  const repository = {
    state,
    async getServicesByIds(ids) {
      return ids
        .map((id) => state.services.find((service) => service.id === id))
        .filter(Boolean);
    },
    async getStaffById(id) {
      return state.staff?.id === id ? state.staff : null;
    },
    async checkAvailability({ date, startTime, endTime, staffId }) {
      return {
        available: state.available,
        slot: state.available
          ? {
              date,
              start_time: startTime,
              end_time: endTime,
              staff_id: staffId,
              service_segments: state.services.map((service, index) => ({
                service_id: service.id,
                start_time: index === 0 ? "09:00" : "10:00",
                end_time: index === 0 ? "10:00" : "11:10",
              })),
            }
          : null,
        alternatives: state.available ? [] : [{ start_time: "12:00" }],
      };
    },
    async findCreationByIdempotencyKey(key) {
      return state.idempotency.get(key) || null;
    },
    async findOrCreateClient() {
      state.calls.clients += 1;
      return { id: "client-1" };
    },
    async createAppointment() {
      state.calls.appointments += 1;
      const appointment = {
        id: `appointment-${state.calls.appointments}`,
        appointment_date: "2026-07-25",
        start_time: "09:00",
        end_time: "11:10",
        staff_id: "alexandra",
        status: "agendada",
      };
      state.appointments.push(appointment);
      return appointment;
    },
    async createAppointmentServices({ appointment, services: current }) {
      state.calls.services += 1;
      if (state.failServices) {
        const error = new Error("service insert failed");
        error.code = "service_insert_failed";
        throw error;
      }
      state.appointmentServices = current.map((service, index) => ({
        id: `appointment-service-${index + 1}`,
        appointment_id: appointment.id,
        service_id: service.id,
      }));
      return state.appointmentServices;
    },
    async compensateAppointment(appointmentId) {
      state.calls.compensation += 1;
      state.appointments = state.appointments.filter(
        (appointment) => appointment.id !== appointmentId
      );
      state.appointmentServices = [];
    },
    async getAppointmentCreationResult({ appointmentId }) {
      const appointment = state.appointments.find(
        (item) => item.id === appointmentId
      );
      return appointment
        ? { appointment, services: state.appointmentServices }
        : null;
    },
    async rememberIdempotencyResult(key, result) {
      state.idempotency.set(key, result);
    },
  };
  return repository;
}

test("1. escritura deshabilitada revalida y no inserta", async () => {
  const repository = createFakeRepository();
  const result = await createAppointmentFromConfirmedPreview({
    draft: confirmDraft(),
    repository,
    writesEnabled: false,
    now: baseNow,
  });
  assert.equal(result.code, "write_disabled");
  assert.equal(result.status, "ready_for_write");
  assert.deepEqual(repository.state.calls, {
    clients: 0,
    appointments: 0,
    services: 0,
    payments: 0,
    compensation: 0,
  });
});

test("2. repositorio falso crea una cita con todos los servicios y sin pagos", async () => {
  const repository = createFakeRepository();
  const result = await createAppointmentFromConfirmedPreview({
    draft: confirmDraft(),
    repository,
    writesEnabled: true,
    now: baseNow,
  });
  assert.equal(result.code, "created_and_verified");
  assert.equal(repository.state.appointments.length, 1);
  assert.equal(repository.state.appointmentServices.length, 2);
  assert.equal(repository.state.calls.payments, 0);
});

test("3. una confirmación duplicada devuelve la misma creación", async () => {
  const repository = createFakeRepository();
  const confirmed = confirmDraft();
  const first = await createAppointmentFromConfirmedPreview({
    draft: confirmed,
    repository,
    writesEnabled: true,
    now: baseNow,
  });
  const second = await createAppointmentFromConfirmedPreview({
    draft: first.draft,
    repository,
    writesEnabled: true,
    now: baseNow,
  });
  assert.equal(second.code, "idempotent_replay");
  assert.equal(second.creation.appointment.id, first.creation.appointment.id);
  assert.equal(repository.state.calls.appointments, 1);
  assert.equal(repository.state.calls.clients, 1);
});

test("4. una vista previa expirada no escribe", async () => {
  const repository = createFakeRepository();
  const result = await createAppointmentFromConfirmedPreview({
    draft: confirmDraft(),
    repository,
    writesEnabled: true,
    now: new Date("2026-07-24T12:16:00.000Z"),
  });
  assert.equal(result.code, "preview_expired");
  assert.equal(repository.state.calls.appointments, 0);
});

test("5. modificar la fecha invalida la vista previa exacta", () => {
  const draft = makeDraft();
  const result = confirmAppointmentPreview({
    draft: { ...draft, date: "2026-07-26" },
    pendingStep: "confirmation",
    previewId: draft.previewId,
    explicitConfirmation: true,
    now: baseNow,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "preview_changed");
});

test("6. un horario ocupado durante la revalidación no escribe", async () => {
  const repository = createFakeRepository({ available: false });
  const result = await createAppointmentFromConfirmedPreview({
    draft: confirmDraft(),
    repository,
    writesEnabled: true,
    now: baseNow,
  });
  assert.equal(result.code, "availability_changed");
  assert.equal(repository.state.calls.appointments, 0);
  assert.equal(result.alternatives.length, 1);
});

test("7. un servicio desactivado se rechaza antes de insertar", async () => {
  const repository = createFakeRepository({
    services: [{ ...services[0], active: false }, services[1]],
  });
  const result = await createAppointmentFromConfirmedPreview({
    draft: confirmDraft(),
    repository,
    writesEnabled: true,
    now: baseNow,
  });
  assert.equal(result.code, "service_unavailable");
  assert.equal(repository.state.calls.appointments, 0);
});

test("8. una colaboradora inválida regresa de forma segura", async () => {
  const repository = createFakeRepository({ staff: null });
  const result = await createAppointmentFromConfirmedPreview({
    draft: confirmDraft(),
    repository,
    writesEnabled: true,
    now: baseNow,
  });
  assert.equal(result.code, "staff_unavailable");
  assert.equal(repository.state.calls.appointments, 0);
});

test("9. un cambio de precio o duración exige una vista previa nueva", async () => {
  const repository = createFakeRepository({
    services: [{ ...services[0], base_price: 275 }, services[1]],
  });
  const result = await createAppointmentFromConfirmedPreview({
    draft: confirmDraft(),
    repository,
    writesEnabled: true,
    now: baseNow,
  });
  assert.equal(result.code, "preview_changed");
  assert.equal(result.draft.confirmation, null);
  assert.equal(repository.state.calls.appointments, 0);
});

test("10. un fallo en servicios asociados compensa la cita y no confirma", async () => {
  const repository = createFakeRepository({ failServices: true });
  const result = await createAppointmentFromConfirmedPreview({
    draft: confirmDraft(),
    repository,
    writesEnabled: true,
    now: baseNow,
  });
  assert.equal(result.code, "creation_compensated");
  assert.equal(result.ok, false);
  assert.equal(repository.state.appointments.length, 0);
  assert.equal(repository.state.calls.compensation, 1);
  assert.equal(result.partialFailures[0].stage, "appointment_services");
});

test("11. varias personas conservan asignaciones y pasan a revisión", () => {
  const draft = makeDraft({
    participants: [
      {
        id: "person_1",
        label: "clienta",
        services: [{ id: "gel", name: "Gel en manos" }],
      },
      {
        id: "person_2",
        label: "acompañante",
        services: [{ id: "pedi", name: "Pedicure clásico" }],
      },
    ],
  });
  assert.equal(draft.status, "human_review");
  assert.equal(draft.participants[1].services[0].id, "pedi");
  assert.equal(draft.previewId, null);
});

test("12. anticipo mencionado no se marca verificado ni escribe pagos", async () => {
  const repository = createFakeRepository();
  const draft = makeDraft({ depositStatus: "unknown" });
  const result = await createAppointmentFromConfirmedPreview({
    draft: confirmDraft(draft),
    repository,
    writesEnabled: true,
    now: baseNow,
  });
  assert.equal(result.code, "created_and_verified");
  assert.equal(result.draft.depositStatus, "unknown");
  assert.equal(repository.state.calls.payments, 0);
});

test("13. sí fuera del paso de confirmación no confirma ni crea", () => {
  const draft = makeDraft();
  const result = confirmAppointmentPreview({
    draft,
    pendingStep: "date",
    previewId: draft.previewId,
    explicitConfirmation: true,
    now: baseNow,
  });
  assert.equal(result.code, "confirmation_out_of_context");
  assert.equal(result.draft.status, "preview_shown");
});

test("14. una vista previa sin previewId falla de forma segura", () => {
  const draft = makeDraft();
  const result = confirmAppointmentPreview({
    draft: { ...draft, previewId: null },
    pendingStep: "confirmation",
    previewId: null,
    explicitConfirmation: true,
    now: baseNow,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "preview_id_missing");
});

test("15. un identificador de servicio inexistente no llega a escritura", async () => {
  const repository = createFakeRepository();
  const draft = makeDraft({
    services: [
      {
        id: "inventado",
        name: "Servicio inventado",
        durationMinutes: 60,
        cleanupMinutes: 0,
        price: 1,
        priceType: "fixed",
      },
    ],
    expectedPrice: 1,
  });
  const result = await createAppointmentFromConfirmedPreview({
    draft: confirmDraft(draft),
    repository,
    writesEnabled: true,
    now: baseNow,
  });
  assert.equal(result.code, "service_unavailable");
  assert.equal(repository.state.calls.appointments, 0);
});

test("la bandera de servidor solo acepta el valor exacto true", () => {
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
