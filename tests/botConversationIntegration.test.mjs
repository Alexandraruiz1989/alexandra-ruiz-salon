import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLastOfferedMenu,
  executeBotTurn,
} from "../app/lib/botConversationEngine.js";
import { prepareAppointmentDraft } from "../app/lib/botAppointmentOrchestrator.js";

const services = [
  { id: "pedi-basic", name: "Pedicure clásico", category: "Pies", base_price: 280, active: true },
  { id: "pedi-gel", name: "Pedicure con gel", category: "Pies", base_price: 390, active: true },
  { id: "pedi-med", name: "Pedicure medicado", category: "Pies", base_price: 0, active: true },
  { id: "gel-hands", name: "Gel semipermanente en manos", category: "Manos", base_price: 250, active: true },
  { id: "lash-lifting", name: "Lifting de pestañas", category: "Pestañas", base_price: 450, active: true },
  { id: "lash-classic", name: "Extensiones clásicas", category: "Pestañas", base_price: 650, active: true },
  { id: "lash-volume", name: "Extensiones volumen", category: "Pestañas", base_price: 800, active: true },
  { id: "sculpted", name: "Uñas esculturales acrílicas", category: "Uñas", base_price: 550, active: true },
  { id: "acrylic-tip", name: "Extensiones acrílicas con tip", category: "Uñas", base_price: 500, active: true },
  { id: "softgel", name: "Extensiones Softgel", category: "Uñas", base_price: 480, active: true },
  { id: "fill", name: "Relleno de acrílico", category: "Uñas", base_price: 0, active: true },
  { id: "repair", name: "Reparación de uña", category: "Uñas", base_price: 0, active: true },
  { id: "keratin", name: "Keratina", category: "Tratamientos capilares", base_price: 0, active: true },
];

const staff = [
  { id: "laura", full_name: "Laura Canul" },
  { id: "tania", full_name: "Tania Mendez" },
  { id: "alexandra", full_name: "Alexandra Ruiz" },
];

function createHarness(initialState = {}, executorOverrides = {}) {
  let state = initialState;
  let availabilityCalls = 0;
  let realWrites = 0;
  const defaultExecutors = {
    LEGACY_BUILD_LOCATION_RESPONSE: async () => ({
      response: "Ubicación validada del salón.",
    }),
    LEGACY_BUILD_BUSINESS_HOURS_RESPONSE: async () => ({
      response: "Horario validado del salón.",
    }),
    LEGACY_CHECK_AVAILABILITY: async () => {
      availabilityCalls += 1;
      return {
        response:
          "Encontré opciones de prueba. Ninguna cita fue creada ni reservada.",
        parsedDate: "2026-07-25",
        options: [
          {
            id: "slot-1",
            label: "09:00 con Alexandra Ruiz",
            value: "alexandra|2026-07-25|09:00",
          },
          {
            id: "slot-2",
            label: "10:30 con Alexandra Ruiz",
            value: "alexandra|2026-07-25|10:30",
          },
        ],
      };
    },
    ...executorOverrides,
  };

  return {
    async turn(message, interpretation, interpretationError = null) {
      const result = await executeBotTurn({
        conversationId: "integration-test",
        customerMessage: message,
        currentState: state,
        context: {
          services,
          staff,
          interpretation,
          interpretationError,
        },
        executors: defaultExecutors,
      });
      state = result.contract.nextState;
      return result;
    },
    setState(nextState) {
      state = nextState;
    },
    get state() {
      return state;
    },
    get availabilityCalls() {
      return availabilityCalls;
    },
    get realWrites() {
      return realWrites;
    },
  };
}

test("escenario 1: pedicure conserva menú, selección, fecha, horario y cualquiera", async () => {
  const chat = createHarness();
  const first = await chat.turn("Quiero pedicure");
  assert.equal(first.contract.action, "SHOW_SERVICE_OPTIONS");
  assert.equal(chat.state.lastOfferedMenu.type, "services");

  const second = await chat.turn("2");
  assert.equal(second.contract.action, "SELECT_MENU_OPTION");
  assert.equal(chat.state.selectedServices.length, 1);
  assert.equal(chat.state.selectedServices[0].id, "pedi-gel");
  assert.equal(chat.state.lastOfferedMenu, null);

  await chat.turn("El sábado");
  assert.equal(chat.state.datePreference, "sábado");
  assert.equal(chat.state.pendingStep, "time");

  await chat.turn("En la mañana");
  assert.deepEqual(chat.state.timeRange, { start: "08:00", end: "12:00" });
  assert.equal(chat.state.pendingStep, "staff");

  await chat.turn("Con cualquiera");
  assert.equal(chat.state.staffPreference.type, "any");
  assert.equal(chat.state.pendingStep, "availability");
  assert.equal(chat.availabilityCalls, 1);
  assert.equal(chat.realWrites, 0);
});

test("escenario 2: dos servicios y datos posteriores no se reemplazan ni repreguntan", async () => {
  const chat = createHarness();
  await chat.turn("Quiero gel en manos y pedicure");
  assert.ok(chat.state.selectedServices.some((item) => item.id === "gel-hands"));
  assert.ok(
    chat.state.serviceRequests.some((request) =>
      request.candidateServiceIds.includes("pedi-basic")
    )
  );

  await chat.turn("Mañana antes de las 12");
  assert.equal(chat.state.datePreference, "mañana");
  assert.equal(chat.state.timeRange.end, "12:00");
  assert.equal(chat.state.pendingStep, "service_detail");

  await chat.turn("Con cualquiera");
  assert.equal(chat.state.staffPreference.type, "any");
  assert.equal(chat.state.datePreference, "mañana");
  assert.equal(chat.state.timeRange.end, "12:00");
  assert.ok(chat.state.lastOfferedMenu);
  assert.equal(chat.availabilityCalls, 0);
  assert.equal(chat.realWrites, 0);
});

test("escenario 3: dos respuestas 4 cambian de significado al cambiar el paso", async () => {
  const serviceMenu = buildLastOfferedMenu({
    type: "services",
    options: services.slice(0, 4),
  });
  const chat = createHarness({
    intent: "booking",
    pendingStep: "service_detail",
    lastOfferedMenu: serviceMenu,
  });
  await chat.turn("4");
  assert.equal(chat.state.selectedServices[0].id, "gel-hands");
  assert.equal(chat.state.lastOfferedMenu, null);

  chat.setState({
    ...chat.state,
    pendingStep: "people_count",
    lastOfferedMenu: null,
  });
  const count = await chat.turn("4");
  assert.equal(count.contract.action, "SET_PEOPLE_COUNT");
  assert.equal(chat.state.peopleCount, 4);
  assert.equal(chat.state.selectedServices.length, 1);
});

test("escenario 4: hora ambigua no reutiliza menú de servicios", async () => {
  const chat = createHarness({
    intent: "booking",
    pendingStep: "time",
    lastOfferedMenu: buildLastOfferedMenu({
      type: "services",
      options: services.slice(0, 4),
    }),
  });
  const result = await chat.turn("4");
  assert.equal(result.contract.action, "CLARIFY_TIME_PERIOD");
  assert.match(result.contract.response, /mañana o de la tarde/i);
  assert.equal(chat.state.lastOfferedMenu, null);
});

test("escenario 5: relleno externo permanece en revisión sin precio ni disponibilidad", async () => {
  const chat = createHarness();
  await chat.turn("Quiero relleno de acrílico");
  assert.equal(chat.state.humanReviewRequired, true);
  assert.equal(chat.state.humanReviewReason, "maintenance_requires_details");

  await chat.turn("Me lo hicieron en otro salón hace cuatro semanas");
  assert.equal(chat.state.humanReviewReason, "external_work_requires_review");
  assert.equal(chat.state.selectedServices[0].id, "fill");
  assert.equal(chat.availabilityCalls, 0);
  assert.equal(chat.realWrites, 0);
});

test("escenario 6: pestañas naturales conserva menú ante duda y selecciona clásicas", async () => {
  const chat = createHarness();
  await chat.turn("Quiero pestañas naturales");
  const menuCreatedAt = chat.state.lastOfferedMenu.createdAt;

  const duration = await chat.turn("¿Cuál dura más?");
  assert.match(duration.contract.response, /no tengo una duración/i);
  assert.equal(chat.state.lastOfferedMenu.createdAt, menuCreatedAt);

  await chat.turn("Prefiero clásicas");
  assert.equal(chat.state.selectedServices[0].id, "lash-classic");
  assert.equal(chat.state.pendingStep, "date");
});

test("escenario 7: dos personas conservan asignación individual segura", async () => {
  const chat = createHarness();
  await chat.turn("Quiero cita para mi mamá y para mí");
  assert.equal(chat.state.peopleCount, 2);
  assert.equal(chat.state.participants.length, 2);

  await chat.turn("Para mí gel y para mi mamá pedicure");
  const client = chat.state.participants.find((item) => item.id === "person_1");
  const mother = chat.state.participants.find((item) => item.id === "person_2");
  assert.equal(client.services[0].id, "gel-hands");
  assert.equal(mother.label, "mamá");
  assert.ok(mother.pendingServiceCandidates.includes("pedi-basic"));

  await chat.turn("El sábado en la tarde");
  await chat.turn("Con cualquiera");
  assert.equal(chat.state.datePreference, "sábado");
  assert.equal(chat.state.timeRange.start, "12:00");
  assert.equal(chat.state.staffPreference.type, "any");
  assert.equal(chat.state.pendingStep, "service_detail");
  assert.equal(chat.realWrites, 0);
});

test("escenario 8: cambiar acrílicas por softgel reemplaza solo el servicio", async () => {
  const chat = createHarness();
  await chat.turn("Quiero acrílicas");
  await chat.turn("Mejor quiero softgel");
  assert.deepEqual(
    chat.state.selectedServices.map((service) => service.id),
    ["softgel"]
  );
  assert.equal(chat.state.pendingStep, "date");
});

test("escenario 9: corregir fecha reemplaza la anterior y conserva lo demás", async () => {
  const chat = createHarness({
    intent: "booking",
    selectedServices: [{ id: "gel-hands", name: "Gel semipermanente en manos" }],
    peopleCount: 1,
    datePreference: "mañana",
    parsedDate: "2026-07-24",
    timePreference: "tarde",
    timeRange: { start: "12:00", end: "18:31" },
    staffPreference: { type: "any", staffId: null, staffName: null },
    pendingStep: "availability",
  });
  await chat.turn("Perdón, mejor el sábado");
  assert.equal(chat.state.datePreference, "2026-07-25");
  assert.equal(chat.state.selectedServices[0].id, "gel-hands");
  assert.equal(chat.state.staffPreference.type, "any");
  assert.equal(chat.availabilityCalls, 1);
});

test("escenario 10: anticipo permanece sin confirmar y no escribe pagos", async () => {
  const chat = createHarness();
  const paid = await chat.turn("Ya pagué el anticipo");
  assert.match(paid.contract.response, /aún no está confirmado/i);
  await chat.turn("Te mando el comprobante");
  assert.equal(chat.state.depositMentioned, true);
  assert.equal(chat.state.humanReviewReason, "deposit_requires_verification");
  assert.equal(chat.realWrites, 0);
});

test("escenario 11: menú expirado no selecciona opciones antiguas", async () => {
  const chat = createHarness({
    intent: "booking",
    pendingStep: "service_detail",
    lastOfferedMenu: buildLastOfferedMenu({
      type: "services",
      options: services.slice(0, 4),
      createdAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    }),
  });
  const result = await chat.turn("3");
  assert.equal(result.contract.action, "CLARIFY_MESSAGE");
  assert.equal(chat.state.selectedServices.length, 0);
  assert.equal(chat.state.lastOfferedMenu, null);
});

test("escenario 12: fallos intermedios conservan estado y responden seguro", async () => {
  const chat = createHarness();
  await chat.turn("Quiero gel");
  const previousService = chat.state.selectedServices[0].id;

  const invalidJson = await chat.turn("El sábado", null);
  assert.equal(chat.state.selectedServices[0].id, previousService);
  assert.ok(
    invalidJson.contract.validationErrors.includes(
      "invalid_structured_interpretation"
    )
  );

  const empty = await chat.turn("En la mañana", "");
  assert.equal(empty.contract.nextState.selectedServices[0].id, previousService);

  const providerTimeout = await chat.turn(
    "Necesito continuar",
    undefined,
    "timeout"
  );
  assert.ok(
    providerTimeout.contract.validationErrors.includes(
      "interpretation_provider_failed"
    )
  );
  assert.equal(chat.state.selectedServices[0].id, previousService);

  const invented = await chat.turn("Con cualquiera", {
    intent: "booking",
    confidence: 1,
    serviceMentions: [
      {
        originalText: "inventado",
        normalizedQuery: "inventado",
        possibleServiceIds: ["not-real"],
        confidence: 1,
      },
    ],
    staffPreference: { type: "any", staffId: null, staffName: null },
  });
  assert.ok(
    invented.contract.validationErrors.includes("unknown_service_id_rejected")
  );
  assert.equal(chat.state.selectedServices[0].id, previousService);

  const timeoutChat = createHarness({
    ...chat.state,
    datePreference: "sábado",
    parsedDate: "2026-07-25",
    timePreference: "mañana",
    timeRange: { start: "08:00", end: "12:00" },
    staffPreference: { type: "any", staffId: null, staffName: null },
    pendingStep: "staff",
  }, {
    LEGACY_CHECK_AVAILABILITY: async () => {
      throw new Error("timeout");
    },
  });
  const timeout = await timeoutChat.turn("Con cualquiera");
  assert.match(timeout.contract.response, /conservé tus datos/i);
  assert.equal(timeoutChat.state.selectedServices[0].id, previousService);
  assert.equal(timeoutChat.realWrites, 0);
});

test("escenario 13: disponibilidad usa ejecutor mock y nunca escribe agenda", async () => {
  const chat = createHarness();
  const result = await chat.turn(
    "Quiero esculturales mañana en la mañana con Alexandra"
  );
  assert.equal(result.contract.execution.legacyAction, "LEGACY_CHECK_AVAILABILITY");
  assert.equal(chat.availabilityCalls, 1);
  assert.equal(chat.state.pendingStep, "availability");
  assert.equal(chat.state.lastOfferedMenu.type, "availability");
  assert.equal(chat.realWrites, 0);
});

test("escenario 14: confirmar vista previa sigue siendo simulación", async () => {
  const draft = prepareAppointmentDraft({
    conversationId: "integration-test",
    customer: { name: "Clienta de prueba", phone: "test:0000000000" },
    participants: [
      {
        id: "person_1",
        label: "clienta",
        services: [{ id: "gel-hands", name: "Gel semipermanente en manos" }],
      },
    ],
    services: [
      {
        id: "gel-hands",
        name: "Gel semipermanente en manos",
        durationMinutes: 60,
        cleanupMinutes: 0,
        price: 250,
        priceType: "fixed",
      },
    ],
    date: "2026-07-25",
    startTime: "09:00",
    endTime: "10:00",
    staff: {
      id: "alexandra",
      name: "Alexandra Ruiz",
      preference: "any",
    },
    expectedPrice: 250,
    depositStatus: "not_required",
  });
  const chat = createHarness({
    intent: "booking",
    selectedServices: [{ id: "gel-hands", name: "Gel semipermanente en manos" }],
    peopleCount: 1,
    datePreference: "sábado",
    parsedDate: "2026-07-25",
    timePreference: "mañana",
    timeRange: { start: "08:00", end: "12:00" },
    staffPreference: { type: "any", staffId: null, staffName: null },
    pendingStep: "confirmation",
    appointmentDraft: draft,
  }, {
    LEGACY_RECHECK_APPOINTMENT_DRAFT: async (validatedData) => ({
      response:
        "La solicitud quedó preparada correctamente en el modo de prueba. Todavía no se creó una cita real.",
      appointmentDraft: {
        ...validatedData.appointmentDraft,
        status: "ready_for_write",
      },
      orchestratorResult: {
        ok: true,
        mode: "simulation",
        status: "ready_for_write",
        code: "write_disabled",
      },
    }),
  });
  const result = await chat.turn("Sí");
  assert.equal(result.contract.action, "CONFIRM_APPOINTMENT_PREVIEW");
  assert.match(result.contract.response, /modo de prueba/i);
  assert.doesNotMatch(result.contract.response, /cita confirmada|ya quedó agendada/i);
  assert.equal(chat.state.appointmentDraft.status, "ready_for_write");
  assert.equal(chat.realWrites, 0);
});

test("escenario 15: colaboradora fuera del paso se conserva y se sigue pidiendo fecha", async () => {
  const chat = createHarness({
    intent: "booking",
    selectedServices: [{ id: "gel-hands", name: "Gel semipermanente en manos" }],
    peopleCount: 1,
    staffPreference: { type: "unknown", staffId: null, staffName: null },
    pendingStep: "date",
  });
  const result = await chat.turn("Laura");
  assert.equal(result.contract.action, "ASK_DATE");
  assert.equal(chat.state.staffPreference.staffId, "laura");
  assert.equal(chat.state.pendingStep, "date");
  assert.match(result.contract.response, /qué día/i);
});
