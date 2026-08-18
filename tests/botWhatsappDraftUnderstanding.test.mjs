import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  analyzeDraftRequest,
  generateSafeDraftReply,
} from "../app/lib/whatsapp/botResponseDraftGenerator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const productionCatalogCopyPath =
  process.env.BOT_TEST_SERVICE_CATALOG_PATH ||
  path.join(__dirname, "fixtures", "service-catalog-draft-understanding.json");

function service(overrides = {}) {
  return {
    id: overrides.id || `service_${Math.random().toString(36).slice(2)}`,
    name: overrides.name || "Servicio de prueba",
    category: overrides.category || "Categoría",
    base_price: overrides.base_price ?? 100,
    active: overrides.active ?? true,
    bot_active: overrides.bot_active ?? true,
    bot_keywords: overrides.bot_keywords || "",
    bot_service_group: overrides.bot_service_group || "",
    ...overrides,
  };
}

function catalog() {
  return [
    service({
      id: "gel_natural",
      name: "Aplicación de Gel Semi Permanente Manos",
      category: "Servicios sobre Uña Natural",
      base_price: 160,
      bot_keywords:
        "gel en uña natural, gel en una natural, gel semipermanente en uña natural, gelish uña natural",
      bot_service_group: "una_natural_gel_semipermanente",
    }),
    service({
      id: "gel_pies",
      name: "Gel Semi Permanente Pies",
      category: "Pedicure",
      base_price: 180,
      bot_keywords: "gel en pies, gelish pies, gel semipermanente pies, gel en uñas de los pies",
      bot_service_group: "pies_gel_semipermanente",
    }),
    service({
      id: "gel_construccion",
      name: "Gel de Construcción",
      category: "Uñas",
      base_price: 350,
      bot_keywords: "gel de construccion, gel de construcción",
    }),
    service({
      id: "bano_gel",
      name: "Baño de Gel",
      category: "Uñas",
      base_price: 220,
      bot_keywords: "baño de gel, bano de gel",
    }),
    service({
      id: "relleno_rubber",
      name: "Relleno de Rubber",
      category: "Uñas",
      base_price: 300,
      bot_keywords: "relleno de rubber",
    }),
    service({
      id: "cirugia_capilar",
      name: "Cirugía Capilar",
      category: "Cabello",
      base_price: 1200,
      bot_keywords: "cirugia capilar, cirugía capilar",
    }),
    service({
      id: "planchado_cejas",
      name: "Planchado de Cejas",
      category: "Cejas",
      base_price: 150,
      bot_keywords: "planchado de cejas",
    }),
    service({
      id: "pedicure_spa_gel",
      name: "Pedicure Spa con Gel",
      category: "Pedicure",
      base_price: 420,
      bot_keywords: "pedicure spa con gel",
    }),
  ];
}

function draftFor(body, services = catalog()) {
  return generateSafeDraftReply({
    inboundMessage: { body, message_type: "text" },
    services,
  });
}

function analysisFor(body, services = catalog()) {
  return analyzeDraftRequest({
    inboundMessage: { body, message_type: "text" },
    services,
  });
}

function assertGeneratedPrice({ body, serviceName, price, notPrices = [] }) {
  const draft = draftFor(body);
  const analysis = analysisFor(body);
  const formattedPrice = Number(price).toLocaleString("es-MX", {
    maximumFractionDigits: 0,
  });

  assert.equal(analysis.intent, "service_price");
  assert.equal(analysis.service_resolution.status, "matched");
  assert.equal(analysis.requires_human_review, false);
  assert.equal(draft.requiresHumanReview, false);
  assert.match(draft.body, new RegExp(serviceName, "i"));
  assert.match(draft.body, new RegExp(`\\$${formattedPrice} MXN`));
  assert.doesNotMatch(draft.body, /disponibilidad|horario|confirmo tu cita|cita confirmada/i);
  for (const notPrice of notPrices) {
    assert.doesNotMatch(draft.body, new RegExp(`\\$${notPrice} MXN`));
  }
}

const priceVariants = [
  "Hola, ¿cuál es el precio actual del gel en uña natural?",
  "PRECIO   vigente   del GEL en UÑA natural!!!",
  "Me confirmas el precio del gel en uña natural",
  "Me dices el costo actual del gel en uña natural por favor",
  "¿Cuánto cuesta el gel en uña natural?",
  "¿Cuánto sale gel en una natural?",
  "¿Qué precio tiene el gel en uña natural?",
  "Quisiera saber el costo de gel en uña natural",
  "Quiero saber precio gel en una natural",
  "Buenas tardes, precio actual del gel en uña natural gracias",
];

for (const body of priceVariants) {
  test(`entiende variante de precio: ${body}`, () => {
    const analysis = analysisFor(body);
    assert.equal(analysis.service_query, "gel en una natural");
    assertGeneratedPrice({
      body,
      serviceName: "Aplicación de Gel Semi Permanente Manos",
      price: 160,
      notPrices: [180, 350],
    });
  });
}

const contextualServices = [
  {
    body: "¿Precio de gel de construcción?",
    name: "Gel de Construcción",
    price: 350,
  },
  {
    body: "Me confirmas costo del baño de gel",
    name: "Baño de Gel",
    price: 220,
  },
  {
    body: "Cuánto cuesta gel en uñas de los pies",
    name: "Gel Semi Permanente Pies",
    price: 180,
  },
  {
    body: "Precio de relleno de rubber",
    name: "Relleno de Rubber",
    price: 300,
  },
  {
    body: "Costo actual de cirugía capilar",
    name: "Cirugía Capilar",
    price: 1200,
  },
  {
    body: "Precio del planchado de cejas",
    name: "Planchado de Cejas",
    price: 150,
  },
];

for (const scenario of contextualServices) {
  test(`conserva conectores internos del servicio: ${scenario.name}`, () => {
    assertGeneratedPrice({
      body: scenario.body,
      serviceName: scenario.name,
      price: scenario.price,
    });
  });
}

test("pedicure específico se resuelve y gel genérico queda ambiguo sin precio definitivo", () => {
  assertGeneratedPrice({
    body: "Precio de pedicure spa con gel.",
    serviceName: "Pedicure Spa con Gel",
    price: 420,
    notPrices: [160, 180, 350],
  });

  const draft = draftFor("¿Cuánto cuesta el gel?");
  const analysis = analysisFor("¿Cuánto cuesta el gel?");

  assert.equal(analysis.intent, "service_price");
  assert.equal(analysis.service_resolution.status, "ambiguous");
  assert.equal(draft.requiresHumanReview, true);
  assert.doesNotMatch(draft.body, /\$\d+/);
});

test("servicio inexistente requiere revisión y no inventa precio", () => {
  const draft = draftFor("Precio de servicio lunar premium");
  const analysis = analysisFor("Precio de servicio lunar premium");

  assert.equal(analysis.service_resolution.status, "not_found");
  assert.equal(draft.requiresHumanReview, true);
  assert.doesNotMatch(draft.body, /\$\d+/);
});

test("servicio inactivo no se ofrece aunque el nombre coincida", () => {
  const services = [
    service({
      name: "Servicio Inactivo Exacto",
      base_price: 999,
      active: false,
      bot_keywords: "servicio inactivo exacto",
    }),
  ];
  const draft = draftFor("Precio de servicio inactivo exacto", services);
  const analysis = analysisFor("Precio de servicio inactivo exacto", services);

  assert.equal(analysis.service_resolution.status, "inactive");
  assert.equal(draft.requiresHumanReview, true);
  assert.doesNotMatch(draft.body, /\$999/);
});

test("precio inválido requiere revisión sin fallback a otro servicio", () => {
  const services = [
    service({
      name: "Servicio Sin Precio",
      base_price: 0,
      bot_keywords: "servicio sin precio",
    }),
    service({
      name: "Servicio Parcial",
      base_price: 888,
      bot_keywords: "servicio",
    }),
  ];
  const draft = draftFor("Precio de servicio sin precio", services);
  const analysis = analysisFor("Precio de servicio sin precio", services);

  assert.equal(analysis.service_resolution.status, "invalid_price");
  assert.equal(draft.requiresHumanReview, true);
  assert.doesNotMatch(draft.body, /\$888/);
});

test("catálogo ya normalizado conserva aliases y searchText en una segunda normalización", () => {
  const normalizedLikeCatalog = [
    {
      id: "normalized_gel",
      name: "Aplicación de Gel Semi Permanente Manos",
      category: "Servicios sobre Uña Natural",
      price: 160,
      active: true,
      bot_active: true,
      explicitAliases: ["gel en una natural"],
      derivedAliases: [],
      partialAliases: ["una natural"],
      searchText: "aplicacion de gel semi permanente manos servicios sobre una natural gel en una natural",
    },
  ];

  const draft = draftFor("Me confirmas precio actual del gel en uña natural", normalizedLikeCatalog);
  const analysis = analysisFor(
    "Me confirmas precio actual del gel en uña natural",
    normalizedLikeCatalog
  );

  assert.equal(analysis.service_resolution.status, "matched");
  assert.equal(draft.requiresHumanReview, false);
  assert.match(draft.body, /\$160 MXN/);
});

const humanReviewScenarios = [
  { body: "¿Tienen horario disponible mañana?", intent: "availability" },
  { body: "Quiero agendar cita para gel en uña natural", intent: "booking" },
  { body: "Necesito cancelar mi cita", intent: "cancellation" },
  { body: "Quiero reagendar mi cita", intent: "reschedule" },
  { body: "¿Puedo pagar con tarjeta?", intent: "payment" },
  { body: "¿Cuánto anticipo debo dar?", intent: "deposit" },
  { body: "Te mando mi comprobante", intent: "payment_receipt" },
  { body: "¿Tienen promociones?", intent: "promotion" },
  { body: "¿Cuál es su política de cancelación?", intent: "cancellation" },
  { body: "¿Precio del gel y cita para mañana?", intent: "ambiguous" },
];

for (const scenario of humanReviewScenarios) {
  test(`intención restringida requiere revisión: ${scenario.intent}`, () => {
    const draft = draftFor(scenario.body);
    const analysis = analysisFor(scenario.body);

    assert.equal(analysis.intent, scenario.intent);
    assert.equal(analysis.requires_human_review, true);
    assert.equal(draft.requiresHumanReview, true);
    assert.doesNotMatch(draft.body, /\$\d+/);
  });
}

test("clasifica intenciones no cubiertas por respuestas definitivas", () => {
  const analysis = analyzeDraftRequest({
    inboundMessage: { body: "", message_type: "image" },
    services: catalog(),
  });
  const draft = generateSafeDraftReply({
    inboundMessage: { body: "", message_type: "image" },
    services: catalog(),
  });

  assert.equal(analysis.intent, "unsupported_media");
  assert.equal(analysis.requires_human_review, true);
  assert.equal(draft.requiresHumanReview, true);

  const greeting = analysisFor("Hola");
  assert.equal(greeting.intent, "greeting");
  assert.equal(greeting.requires_human_review, false);

  const serviceInfo = analysisFor("¿Qué incluye el baño de gel?");
  assert.equal(serviceInfo.intent, "service_information");
  assert.equal(serviceInfo.service_resolution.status, "matched");

  const comparison = analysisFor("¿Qué diferencia hay entre baño de gel y gel de construcción?");
  assert.equal(comparison.intent, "service_comparison");
  assert.equal(comparison.requires_human_review, true);

  const multiple = analysisFor("Precio de gel en uña natural y gel en pies");
  assert.equal(multiple.intent, "multiple_services");
  assert.equal(multiple.requires_human_review, true);

  const unknown = analysisFor("Tengo una duda rara");
  assert.equal(unknown.intent, "unknown");
  assert.equal(unknown.requires_human_review, true);
});

test("copia local de catálogo productivo resuelve gel en uña natural sin modificarla", {
  skip: !existsSync(productionCatalogCopyPath),
}, () => {
  const raw = JSON.parse(readFileSync(productionCatalogCopyPath, "utf8"));
  const productionServices = Array.isArray(raw) ? raw : raw.services || [];
  const before = readFileSync(productionCatalogCopyPath, "utf8");
  const draft = generateSafeDraftReply({
    inboundMessage: {
      body: "Hola, ¿me confirmas el precio actual del gel en uña natural?",
      message_type: "text",
    },
    services: productionServices,
  });
  const after = readFileSync(productionCatalogCopyPath, "utf8");

  assert.equal(before, after);
  assert.equal(draft.requiresHumanReview, false);
  assert.match(draft.body, /\$160 MXN/);
  assert.doesNotMatch(draft.body, /\$180 MXN|\$350 MXN/);
});
