import assert from "node:assert/strict";
import test from "node:test";

import { processBotMessage } from "../app/lib/botConversationEngine.js";

const services = [
  {
    id: "softgel",
    name: "Extensiones Softgel",
    category: "Uñas",
    base_price: 480,
    active: true,
  },
  {
    id: "rubber-fill",
    name: "Relleno Rubber",
    category: "Uñas",
    base_price: 0,
    active: true,
  },
  {
    id: "acrylic-fill",
    name: "Relleno de acrílico",
    category: "Uñas",
    base_price: 0,
    active: true,
  },
  {
    id: "gel-hands",
    name: "Gel semipermanente en manos",
    category: "Manos",
    base_price: 250,
    active: true,
  },
  {
    id: "lash-lifting",
    name: "Lifting de pestañas",
    category: "Pestañas",
    base_price: 450,
    active: true,
  },
  {
    id: "lash-classic",
    name: "Extensiones clásicas de pestañas",
    category: "Pestañas",
    base_price: 650,
    active: true,
  },
  {
    id: "lash-volume",
    name: "Extensiones volumen de pestañas",
    category: "Pestañas",
    base_price: 800,
    active: true,
  },
  {
    id: "pedi",
    name: "Pedicure clásico",
    category: "Pies",
    base_price: 300,
    active: true,
  },
  {
    id: "brows",
    name: "Planchado y depilación de cejas",
    category: "Cejas",
    base_price: 350,
    active: true,
  },
];
const staff = [
  { id: "alexandra", full_name: "Alexandra Ruiz", active: true },
  { id: "laura", full_name: "Laura Canul", active: true },
];

function run(message, currentState = {}) {
  return processBotMessage({
    conversationId: "regression",
    customerMessage: message,
    currentState,
    context: { services, staff },
  });
}

function assertNoConfirmation(result) {
  assert.notEqual(result.contract.nextState.appointmentDraft?.status, "created");
  assert.doesNotMatch(
    result.contract.response || "",
    /cita confirmada|ya quedó agendada|reservamos tu lugar/i
  );
}

test("regresión: Soft gel encuentra únicamente Softgel", () => {
  const result = run("Soft gel");
  assert.deepEqual(
    result.serviceMentions.candidates.map((service) => service.id),
    ["softgel"]
  );
  assertNoConfirmation(result);
});

test("regresión: Uñas soft encuentra Softgel", () => {
  const result = run("Uñas soft");
  assert.equal(result.serviceMentions.resolvedServices[0].id, "softgel");
  assertNoConfirmation(result);
});

test("regresión: Relleno Ruber usa Rubber real y requiere revisión", () => {
  const result = run("Relleno Ruber");
  assert.deepEqual(
    result.serviceMentions.candidates.map((service) => service.id),
    ["rubber-fill"]
  );
  assert.equal(result.action.type, "REQUEST_HUMAN_REVIEW");
  assertNoConfirmation(result);
});

test("regresión: Relleno de Gelish no se convierte en aplicación nueva", () => {
  const result = run("Relleno de Gelish");
  assert.equal(result.action.type, "REQUEST_HUMAN_REVIEW");
  assert.ok(
    result.serviceMentions.candidates.every(
      (service) => service.bookingMode === "requires_human_review"
    )
  );
  assert.ok(
    result.serviceMentions.candidates.every(
      (service) => service.id !== "gel-hands"
    )
  );
  assertNoConfirmation(result);
});

for (const phrase of ["Quiero retoque", "Quiero mantenimiento"]) {
  test(`regresión: ${phrase} conserva el flujo de mantenimiento`, () => {
    const result = run(phrase);
    assert.equal(result.action.type, "REQUEST_HUMAN_REVIEW");
    assert.ok(
      result.serviceMentions.candidates.every((service) =>
        service.name.toLowerCase().includes("relleno")
      )
    );
    assertNoConfirmation(result);
  });
}

test("regresión: Alejandra se valida como variante de Alexandra", () => {
  const result = run("Con Alejandra", {
    intent: "booking",
    selectedServices: [{ id: "gel-hands", name: "Gel semipermanente en manos" }],
    pendingStep: "date",
  });
  assert.equal(result.interpretation.staffPreference.staffId, "alexandra");
  assert.equal(result.state.staffPreference.staffName, "Alexandra Ruiz");
  assertNoConfirmation(result);
});

test("regresión: pestañas naturales ofrece solo alternativas válidas", () => {
  const result = run("Quiero algo natural en las pestañas");
  assert.deepEqual(
    result.serviceMentions.candidates.map((service) => service.id).sort(),
    ["lash-classic", "lash-lifting"]
  );
  assertNoConfirmation(result);
});

test("regresión: pies y cejas conserva ambos temas", () => {
  const result = run("Servicios para pies y cejas");
  const ids = result.serviceMentions.candidates.map((service) => service.id);
  assert.ok(ids.includes("pedi"));
  assert.ok(ids.includes("brows"));
  assertNoConfirmation(result);
});

test("regresión: ubicación no regresa al menú principal", () => {
  const result = run("¿Dónde se ubican?");
  assert.equal(result.action.type, "ANSWER_INFORMATION");
  assert.equal(
    result.contract.legacyAction,
    "LEGACY_BUILD_LOCATION_RESPONSE"
  );
  assert.notEqual(result.contract.nextState.pendingStep, "service");
  assertNoConfirmation(result);
});

test("regresión: reconstrucción inexistente no se ofrece", () => {
  const result = run("¿Manejan reconstrucción?");
  assert.equal(result.serviceMentions.candidates.length, 0);
  assert.equal(result.state.selectedServices.length, 0);
  assertNoConfirmation(result);
});

test("regresión: una promoción sin catálogo se envía a aclaración", () => {
  const result = run("Quiero agendar una promoción");
  assert.equal(result.serviceMentions.candidates.length, 0);
  assert.ok(
    ["ASK_SERVICE_DETAIL", "CLARIFY_MESSAGE"].includes(result.action.type)
  );
  assertNoConfirmation(result);
});
