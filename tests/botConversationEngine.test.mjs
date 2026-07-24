import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBotServiceCatalog,
  buildLastOfferedMenu,
  processBotMessage,
} from "../app/lib/botConversationEngine.js";

const services = [
  {
    id: "pedi-basic",
    name: "Pedicure clásico",
    category: "Pies",
    base_price: 280,
    active: true,
  },
  {
    id: "pedi-gel",
    name: "Pedicure con gel",
    category: "Pies",
    base_price: 390,
    active: true,
  },
  {
    id: "pedi-med",
    name: "Pedicure medicado",
    category: "Pies",
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
    name: "Extensiones clásicas",
    category: "Pestañas",
    base_price: 650,
    active: true,
  },
  {
    id: "lash-volume",
    name: "Extensiones volumen",
    category: "Pestañas",
    base_price: 800,
    active: true,
  },
  {
    id: "sculpted",
    name: "Uñas esculturales",
    category: "Uñas",
    base_price: 550,
    active: true,
  },
  {
    id: "fill",
    name: "Relleno de acrílico",
    category: "Uñas",
    base_price: 0,
    active: true,
  },
  {
    id: "repair",
    name: "Reparación de uña",
    category: "Uñas",
    base_price: 0,
    active: true,
  },
  {
    id: "keratin",
    name: "Keratina",
    category: "Tratamientos capilares",
    base_price: 0,
    active: true,
  },
  {
    id: "internal-discount",
    name: "Descuento interno",
    category: "Ajuste administrativo",
    base_price: 100,
    active: true,
  },
];

const staff = [
  { id: "laura", full_name: "Laura Canul" },
  { id: "tania", full_name: "Tania Mendez" },
  { id: "alexandra", full_name: "Alexandra Ruiz" },
];

function run(customerMessage, currentState = {}, interpretation) {
  return processBotMessage({
    conversationId: "test-conversation",
    customerMessage,
    currentState,
    context: { services, staff, interpretation },
  });
}

test("1. Pedicure conserva variantes reales y precios del catálogo", () => {
  const result = run("Quiero pedicure");
  assert.equal(result.action.type, "SHOW_SERVICE_OPTIONS");
  assert.ok(result.serviceMentions.candidates.length >= 2);
  assert.deepEqual(
    result.serviceMentions.candidates
      .filter((item) => item.id === "pedi-basic" || item.id === "pedi-gel")
      .map((item) => item.price),
    [280, 390]
  );
});

test("2. Pestañas naturales limita las opciones a lifting y clásicas", () => {
  const result = run("Quiero pestañas naturales");
  assert.equal(result.action.type, "SHOW_SERVICE_OPTIONS");
  assert.deepEqual(
    result.serviceMentions.candidates.map((item) => item.id).sort(),
    ["lash-classic", "lash-lifting"]
  );
});

test("3. Relleno de acrílico requiere revisión humana", () => {
  const result = run("Necesito relleno de acrílico");
  assert.equal(result.action.type, "REQUEST_HUMAN_REVIEW");
  assert.equal(result.action.reason, "maintenance_requires_details");
});

test("4. Un 4 elige la cuarta opción del menú de servicios vigente", () => {
  const menu = buildLastOfferedMenu({
    type: "services",
    options: services.slice(0, 4),
  });
  const result = run("4", {
    pendingStep: "service_detail",
    lastOfferedMenu: menu,
  });
  assert.equal(result.action.type, "SELECT_MENU_OPTION");
  assert.equal(result.action.payload.option.id, "gel-hands");
});

test("5. Un 4 durante cantidad de personas significa cuatro personas", () => {
  const result = run("4", { pendingStep: "people_count" });
  assert.equal(result.action.type, "SET_PEOPLE_COUNT");
  assert.equal(result.action.payload.peopleCount, 4);
});

test("6. Un 4 durante hora pide aclarar mañana o tarde", () => {
  const result = run("4", { pendingStep: "time" });
  assert.equal(result.action.type, "CLARIFY_TIME_PERIOD");
  assert.equal(result.action.payload.hour, 4);
});

test("7. Entiende dos servicios, fecha, rango y colaboradora indistinta", () => {
  const result = run(
    "Quiero gel en manos y pedicure mañana antes de las 12 con cualquiera"
  );
  assert.equal(result.interpretation.datePreference, "mañana");
  assert.equal(result.interpretation.timeRange.end, "12:00");
  assert.equal(result.interpretation.staffPreference.type, "any");
  assert.ok(
    result.serviceMentions.candidates.some((item) => item.id === "gel-hands")
  );
  assert.ok(
    result.serviceMentions.candidates.some((item) => item.id === "pedi-basic")
  );
  assert.ok(result.state.selectedServices.some((item) => item.id === "gel-hands"));
});

test("8. Entiende dos personas, sábado y tarde", () => {
  const result = run("Somos dos para el sábado en la tarde");
  assert.equal(result.interpretation.peopleCount, 2);
  assert.equal(result.interpretation.datePreference, "sábado");
  assert.deepEqual(result.interpretation.timeRange, {
    start: "12:00",
    end: "18:31",
  });
});

test("9. Reparación de trabajo de otro salón requiere revisión", () => {
  const result = run(
    "Quiero arreglarme dos uñas que me hicieron en otro salón"
  );
  assert.equal(result.action.type, "REQUEST_HUMAN_REVIEW");
  assert.equal(result.action.reason, "external_work_requires_review");
});

test("10. Keratina requiere valoración y no inventa precio fijo", () => {
  const result = run("¿Cuánto cuesta la keratina?");
  assert.equal(result.action.type, "REQUEST_HUMAN_REVIEW");
  assert.equal(result.serviceMentions.candidates[0].price, null);
  assert.equal(result.serviceMentions.candidates[0].priceType, "variable");
});

test("11. Detecta que la clienta ya transfirió", () => {
  const result = run("Ya transferí, te mando comprobante");
  assert.equal(result.action.type, "VALIDATE_DEPOSIT");
  assert.equal(result.interpretation.depositMentioned, true);
});

test("12. Uñas sin detalle pide precisar el servicio", () => {
  const result = run("Quiero uñas");
  assert.equal(result.action.type, "ASK_SERVICE_DETAIL");
});

test("13. Esculturales con fecha, horario y Alexandra queda consultable", () => {
  const result = run(
    "Quiero esculturales mañana en la mañana con Alexandra"
  );
  assert.equal(result.action.type, "CHECK_AVAILABILITY");
  assert.equal(result.state.selectedServices[0].id, "sculpted");
  assert.equal(result.interpretation.staffPreference.staffId, "alexandra");
});

test("14. Salida nula de IA usa respaldo validado sin romper", () => {
  const result = run("Quiero pedicure", {}, null);
  assert.ok(result.validationErrors.includes("invalid_structured_interpretation"));
  assert.equal(result.action.type, "SHOW_SERVICE_OPTIONS");
});

test("15. Un identificador de servicio inventado por IA es rechazado", () => {
  const result = run("Quiero agendar", {}, {
    intent: "booking",
    serviceMentions: [
      {
        originalText: "servicio especial",
        normalizedQuery: "servicio especial",
        possibleServiceIds: ["inventado"],
        confidence: 1,
      },
    ],
    staffPreference: { type: "unknown", staffId: null, staffName: null },
  });
  assert.ok(result.validationErrors.includes("unknown_service_id_rejected"));
  assert.deepEqual(
    result.interpretation.serviceMentions[0].possibleServiceIds,
    []
  );
});

test("16. Un menú de tipo anterior no puede interpretar la respuesta numérica", () => {
  const result = run("1", {
    pendingStep: "staff",
    lastOfferedMenu: buildLastOfferedMenu({
      type: "services",
      options: services.slice(0, 2),
    }),
  });
  assert.equal(result.action.type, "CLARIFY_MESSAGE");
  assert.equal(result.action.reason, "no_current_menu");
});

test("el adaptador separa servicios internos del catálogo público", () => {
  const catalog = buildBotServiceCatalog(services);
  const internal = catalog.find((item) => item.id === "internal-discount");
  assert.equal(internal.visibility, "internal");
  assert.equal(internal.bookingMode, "information_only");
});
