const DRAFTS_TABLE = "bot_response_drafts";
const MESSAGES_TABLE = "bot_messages";
const EVENTS_TABLE = "bot_webhook_events";

const SAFE_PROVIDER = "meta_whatsapp";
const GENERATED_STATUS = "generated";
const FAILED_STATUS = "failed";
const MAX_DRAFT_BODY_LENGTH = 1200;
const MAX_METADATA_JSON_LENGTH = 800;
const SAFE_ERROR_CODES = new Set([
  "draft_generation_failed",
  "draft_context_failed",
  "draft_insert_failed",
  "invalid_inbound_message",
  "invalid_webhook_event",
  "draft_body_invalid",
  "draft_body_limit_exceeded",
  "draft_body_sensitive_content",
  "draft_metadata_limit_exceeded",
  "forced_draft_failure",
]);
const SENSITIVE_TEXT_PATTERN =
  /\b(bearer|access[_-]?token|app\s*secret|x-hub-signature|authorization|service[_-]?role|jwt|payload\s*crudo|raw\s*payload)\b/i;

const DEFAULT_BUSINESS_NAME = "el negocio";

const DRAFT_INTENTS = Object.freeze({
  GREETING: "greeting",
  SERVICE_INFORMATION: "service_information",
  SERVICE_PRICE: "service_price",
  SERVICE_COMPARISON: "service_comparison",
  AVAILABILITY: "availability",
  BOOKING: "booking",
  RESCHEDULE: "reschedule",
  CANCELLATION: "cancellation",
  PAYMENT: "payment",
  DEPOSIT: "deposit",
  PAYMENT_RECEIPT: "payment_receipt",
  PROMOTION: "promotion",
  POLICY: "policy",
  MULTIPLE_SERVICES: "multiple_services",
  UNSUPPORTED_MEDIA: "unsupported_media",
  AMBIGUOUS: "ambiguous",
  UNKNOWN: "unknown",
});

const SERVICE_RESOLUTION_STATUSES = Object.freeze({
  MATCHED: "matched",
  AMBIGUOUS: "ambiguous",
  NOT_FOUND: "not_found",
  INACTIVE: "inactive",
  INVALID_PRICE: "invalid_price",
});

const NO_AUTOMATIC_ACTION_INTENTS = new Set([
  DRAFT_INTENTS.AVAILABILITY,
  DRAFT_INTENTS.BOOKING,
  DRAFT_INTENTS.RESCHEDULE,
  DRAFT_INTENTS.CANCELLATION,
  DRAFT_INTENTS.SERVICE_COMPARISON,
  DRAFT_INTENTS.PAYMENT,
  DRAFT_INTENTS.DEPOSIT,
  DRAFT_INTENTS.PAYMENT_RECEIPT,
  DRAFT_INTENTS.PROMOTION,
  DRAFT_INTENTS.POLICY,
  DRAFT_INTENTS.MULTIPLE_SERVICES,
  DRAFT_INTENTS.AMBIGUOUS,
  DRAFT_INTENTS.UNKNOWN,
]);

const PRICE_PATTERNS = [
  /\b(precio|precios|costo|costos)\b/i,
  /\b(precio|costo)\s+(actual|vigente)\b/i,
  /\bcu[aá]nto\s+(cuesta|sale|vale)\b/i,
  /\bcu[aá]l\s+es\s+(el\s+)?(precio|costo)\b/i,
  /\bqu[eé]\s+(precio|costo)\s+tiene\b/i,
  /\bme\s+(confirmas|dices|puedes\s+confirmar|puedes\s+decir)\s+(el\s+)?(precio|costo)\b/i,
  /\bquisiera\s+saber\s+(el\s+)?(precio|costo)\b/i,
  /\bquiero\s+saber\s+(el\s+)?(precio|costo)\b/i,
];
const PRICE_QUERY_STOPWORDS = new Set([
  "buen",
  "buena",
  "buenas",
  "buenos",
  "cuanto",
  "cuesta",
  "costo",
  "decir",
  "del",
  "dias",
  "el",
  "en",
  "favor",
  "hola",
  "la",
  "las",
  "los",
  "me",
  "por",
  "precio",
  "puede",
  "pueden",
  "puedes",
  "que",
  "sale",
  "saber",
  "servicio",
  "servicios",
  "tardes",
  "vale",
]);
const SERVICE_QUERY_TRAILING_PATTERNS = [
  /\bpor\s+favor\b/g,
  /\bporfa\b/g,
  /\bgracias\b/g,
  /\bme\s+ayudas\b/g,
  /\bpuedes\s+ayudarme\b/g,
  /\bme\s+apoyas\b/g,
];
const PRICE_SERVICE_PREFIX_PATTERNS = [
  /^(?:hola|buenos dias|buenas tardes|buenas noches|buenas)\s*,?\s*/i,
  /^(?:me\s+podrias|me\s+podrian|me\s+puedes|me\s+pueden|podrias|podrian|puedes|pueden)\s+(?:confirmar|decir|dar|compartir)\s+(?:el\s+)?(?:precio|costo)(?:\s+(?:actual|vigente))?(?:\s+(?:de|del|para|por|sobre|en))?\s+/i,
  /^(?:me\s+confirmas|me\s+dices)\s+(?:el\s+)?(?:precio|costo)(?:\s+(?:actual|vigente))?(?:\s+(?:de|del|para|por|sobre|en))?\s+/i,
  /^(?:quisiera|quiero|queria|me\s+gustaria)\s+(?:saber|preguntar)\s+(?:el\s+)?(?:precio|costo)(?:\s+(?:actual|vigente))?(?:\s+(?:de|del|para|por|sobre|en))?\s+/i,
  /^(?:cual|cuál)\s+es\s+(?:el\s+)?(?:precio|costo)(?:\s+(?:actual|vigente))?(?:\s+(?:de|del|para|por|sobre|en))?\s+/i,
  /^(?:que|qué)\s+(?:precio|costo)\s+tiene(?:\s+(?:el|la|los|las|un|una|unos|unas))?\s+/i,
  /^(?:cuanto|cuánto)\s+(?:cuesta|sale|vale)(?:\s+(?:el|la|los|las|un|una|unos|unas))?\s+/i,
  /^(?:precio|precios|costo|costos)(?:\s+(?:actual|vigente))?(?:\s+(?:de|del|para|por|sobre|en))?\s+/i,
  /^(?:actual|vigente)(?:\s+(?:de|del|para|por|sobre|en))?\s+/i,
];
const SERVICE_INFORMATION_PREFIX_PATTERNS = [
  /^(?:hola|buenos dias|buenas tardes|buenas noches|buenas)\s*,?\s*/i,
  /^(?:que|qué)\s+(?:incluye|es)(?:\s+(?:el|la|los|las|un|una|unos|unas))?\s+/i,
  /^(?:cuanto|cuánto)\s+dura(?:\s+(?:el|la|los|las|un|una|unos|unas))?\s+/i,
  /^(?:me\s+podrias|me\s+podrian|me\s+puedes|me\s+pueden|podrias|podrian|puedes|pueden)\s+(?:explicar|contar|decir|dar|compartir)\s+(?:informacion\s+)?(?:de|del|sobre|acerca\s+de|para)?\s*/i,
  /^(?:quiero|quisiera|queria|me\s+gustaria)\s+(?:informacion|saber|preguntar)\s+(?:de|del|sobre|acerca\s+de|para)?\s*/i,
  /^(?:informacion|info|detalles)\s+(?:de|del|sobre|acerca\s+de|para)?\s*/i,
];
const LEADING_SERVICE_ARTICLES_PATTERN = /^(?:el|la|los|las|un|una|unos|unas)\s+/i;

const INTENT_PATTERNS = Object.freeze({
  cancellation: /\b(cancelar|cancela|cancelacion|cancelación)\b/i,
  reschedule: /\b(reagendar|reagenda|mover|cambiar)\b.*\b(cita|horario|hora|fecha)\b|\b(cambiar|mover)\s+(mi\s+)?cita\b/i,
  booking: /\b(agendar|agenda|reservar|reserva|hacer\s+cita|programar\s+cita|quiero\s+cita|apartarme)\b/i,
  availability: /\b(disponible|disponibilidad|horario|horarios|hora|espacio|cupo|cupos|fecha|manana|mañana|hoy|sabado|sábado|domingo|lunes|martes|miercoles|miércoles|jueves|viernes)\b/i,
  paymentReceipt: /\b(comprobante|recibo|ticket|factura)\b/i,
  deposit: /\b(anticipo|deposito|depósito|apartado|sena|seña)\b/i,
  payment: /\b(pagar|pago|pagos|transferencia|tarjeta|efectivo|liquidar|saldo)\b/i,
  promotion: /\b(promo|promocion|promoción|promociones|descuento|descuentos|oferta|ofertas|paquete|paquetes)\b/i,
  policy: /\b(politica|política|garantia|garantía|reembolso|devolucion|devolución|tolerancia|terminos|términos|condiciones)\b/i,
  comparison: /\b(diferencia|comparar|comparacion|comparación|mejor|conviene|recomiendas|recomiendan)\b/i,
  serviceInfo: /\b(informacion|información|info|detalles|incluye|dura|duracion|duración|como\s+es|qué\s+es|que\s+es)\b/i,
});
const PRICE_MATCH_LEVELS = {
  NAME_EXACT: "name_exact",
  EXPLICIT_ALIAS_EXACT: "explicit_alias_exact",
  GENERATED_ALIAS_EXACT: "generated_alias_exact",
  STRUCTURED_SPECIFIC: "structured_specific",
  PARTIAL: "partial",
};

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isDuplicateError(error) {
  const code = cleanText(error?.code).toLowerCase();
  const message = cleanText(error?.message).toLowerCase();
  return code === "23505" || message.includes("duplicate key");
}

function safeErrorCode(value) {
  const normalized = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_:-]/g, "_")
    .slice(0, 60);

  return SAFE_ERROR_CODES.has(normalized)
    ? normalized
    : "draft_generation_failed";
}

function safeErrorMessage() {
  return "No se pudo generar el borrador interno de forma segura.";
}

function validateInboundMessageForDraft({ conversation, inboundMessage }) {
  if (!conversation?.id || !inboundMessage?.id) {
    return {
      ok: false,
      code: "invalid_inbound_message",
    };
  }

  if (inboundMessage.direction && inboundMessage.direction !== "incoming") {
    return {
      ok: false,
      code: "invalid_inbound_message",
    };
  }

  if (
    inboundMessage.conversation_id &&
    inboundMessage.conversation_id !== conversation.id
  ) {
    return {
      ok: false,
      code: "invalid_inbound_message",
    };
  }

  return { ok: true };
}

function validatePersistentInboundMessage({
  conversation,
  inboundMessage,
  persistedMessage,
  provider,
}) {
  if (!persistedMessage?.id) {
    return { ok: false, code: "invalid_inbound_message" };
  }

  if (persistedMessage.direction !== "incoming") {
    return { ok: false, code: "invalid_inbound_message" };
  }

  if (persistedMessage.provider !== provider) {
    return { ok: false, code: "invalid_inbound_message" };
  }

  if (persistedMessage.conversation_id !== conversation.id) {
    return { ok: false, code: "invalid_inbound_message" };
  }

  if (
    inboundMessage.provider_message_id &&
    persistedMessage.provider_message_id !== inboundMessage.provider_message_id
  ) {
    return { ok: false, code: "invalid_inbound_message" };
  }

  return { ok: true };
}

function validatePersistentWebhookEvent({ webhookEvent, inboundMessage, provider }) {
  if (!webhookEvent?.id) {
    return { ok: false, code: "invalid_webhook_event" };
  }

  if (webhookEvent.provider !== provider) {
    return { ok: false, code: "invalid_webhook_event" };
  }

  if (webhookEvent.event_type !== "message_inbound") {
    return { ok: false, code: "invalid_webhook_event" };
  }

  if (
    !webhookEvent.provider_message_id ||
    webhookEvent.provider_message_id !== inboundMessage.provider_message_id
  ) {
    return { ok: false, code: "invalid_webhook_event" };
  }

  return { ok: true };
}

function draftError(code) {
  const error = new Error("draft_generation_blocked");
  error.code = code;
  return error;
}

function sanitizeDraftBody(value) {
  const body = cleanText(value);

  if (!body) {
    throw draftError("draft_body_invalid");
  }

  if (body.length > MAX_DRAFT_BODY_LENGTH) {
    throw draftError("draft_body_limit_exceeded");
  }

  if (SENSITIVE_TEXT_PATTERN.test(body)) {
    throw draftError("draft_body_sensitive_content");
  }

  return body;
}

function buildDraftMetadata({ reason = null, failed = false } = {}) {
  const metadata = failed
    ? {
        source: "meta_whatsapp_inbound_draft",
        failed_before_send: true,
        outbound_send_enabled: false,
      }
    : {
        source: "meta_whatsapp_inbound_draft",
        reason: cleanText(reason) || null,
        outbound_send_enabled: false,
      };

  const serialized = JSON.stringify(metadata);
  if (serialized.length > MAX_METADATA_JSON_LENGTH) {
    throw draftError("draft_metadata_limit_exceeded");
  }

  return metadata;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `$${amount.toLocaleString("es-MX", {
    maximumFractionDigits: 0,
  })} MXN`;
}

function splitAliases(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);

  return cleanText(value)
    .split(/[,;|\n]/)
    .map(cleanText)
    .filter(Boolean);
}

function uniqueNormalizedList(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function applyPrefixCleanup(value, patterns = []) {
  let next = normalizeText(value);
  let changed = true;
  let attempts = 0;

  while (changed && attempts < 8) {
    changed = false;
    attempts += 1;

    for (const pattern of patterns) {
      const cleaned = next.replace(pattern, "").trim();
      if (cleaned !== next) {
        next = cleaned;
        changed = true;
      }
    }
  }

  return next;
}

function stripServiceQueryTrailingNoise(value) {
  let next = normalizeText(value);

  for (const pattern of SERVICE_QUERY_TRAILING_PATTERNS) {
    next = next.replace(pattern, " ").replace(/\s+/g, " ").trim();
  }

  return next.replace(LEADING_SERVICE_ARTICLES_PATTERN, "").trim();
}

function extractServiceQueryForIntent(message, intent = DRAFT_INTENTS.SERVICE_PRICE) {
  const normalized = normalizeText(message);
  if (!normalized) return "";

  const patterns =
    intent === DRAFT_INTENTS.SERVICE_PRICE
      ? PRICE_SERVICE_PREFIX_PATTERNS
      : SERVICE_INFORMATION_PREFIX_PATTERNS;

  return stripServiceQueryTrailingNoise(applyPrefixCleanup(normalized, patterns));
}

function normalizePriceSubject(message) {
  return extractServiceQueryForIntent(message, DRAFT_INTENTS.SERVICE_PRICE);
}

function buildDerivedServiceAliases(service) {
  const category = normalizeText(service?.category);
  const group = normalizeText(service?.bot_service_group);
  const keywords = splitAliases(service?.bot_keywords);
  const existingAliases = safeArray(service?.derivedAliases);
  const aliases = [...existingAliases];

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword || normalizedKeyword.length < 3) continue;

    if (group) {
      aliases.push(
        `${normalizedKeyword} ${group}`,
        `${normalizedKeyword} en ${group}`,
        `${normalizedKeyword} de ${group}`
      );
    }

    if (category) {
      aliases.push(`${normalizedKeyword} ${category}`);
    }
  }

  return uniqueNormalizedList(aliases);
}

function buildExplicitServiceAliases(service) {
  return uniqueNormalizedList([
    ...safeArray(service?.explicitAliases),
    ...splitAliases(service?.bot_keywords),
    ...splitAliases(service?.aliases),
  ]);
}

function buildPartialServiceAliases(service) {
  return uniqueNormalizedList([
    ...safeArray(service?.partialAliases),
    service?.category,
    ...splitAliases(service?.bot_service_group),
  ]);
}

function normalizeServiceForDraftCatalog(service) {
  const price = Number(service?.base_price ?? service?.price ?? 0);

  return {
    id: cleanText(service?.id),
    name: cleanText(service?.name),
    category: cleanText(service?.category),
    bot_keywords: cleanText(service?.bot_keywords),
    bot_service_group: cleanText(service?.bot_service_group),
    price: Number.isFinite(price) ? price : null,
    active: service?.active !== false,
    bot_active: service?.bot_active !== false,
    explicitAliases: buildExplicitServiceAliases(service),
    derivedAliases: buildDerivedServiceAliases(service),
    partialAliases: buildPartialServiceAliases(service),
    searchText: normalizeText(service?.searchText) || serviceSearchText(service),
  };
}

function normalizeDraftServiceCatalog(services = []) {
  return safeArray(services)
    .map(normalizeServiceForDraftCatalog)
    .filter((service) => service.name);
}

function serviceSearchText(service) {
  return normalizeText(
    [
      service?.name,
      service?.category,
      ...(Array.isArray(service?.explicitAliases) ? service.explicitAliases : []),
      ...(Array.isArray(service?.derivedAliases) ? service.derivedAliases : []),
      ...(Array.isArray(service?.partialAliases) ? service.partialAliases : []),
      service?.bot_keywords,
      service?.bot_service_group,
      service?.bot_description,
      service?.description,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function relevantPriceQueryTokens(message) {
  const normalized = normalizeText(message);
  if (!normalized) return [];

  return normalized
    .split(" ")
    .filter(
      (word) =>
        word.length >= 3 &&
        !PRICE_QUERY_STOPWORDS.has(word)
    );
}

function uniqueServicesByIdOrName(services = []) {
  return Array.from(
    new Map(
      services.map((service) => [
        service.id || `${service.name}|${service.category}|${service.price}`,
        service,
      ])
    ).values()
  );
}

function serviceHasValidBotOffer(service) {
  return service?.active && service?.bot_active;
}

function buildPriceMatchCandidate(service, level, evidence = null) {
  return {
    service,
    level,
    evidence,
  };
}

function candidateServices(candidates = []) {
  return uniqueServicesByIdOrName(candidates.map((candidate) => candidate.service));
}

function exactNameCandidates(catalog, subject) {
  return catalog
    .filter((service) => normalizeText(service.name) === subject)
    .map((service) =>
      buildPriceMatchCandidate(service, PRICE_MATCH_LEVELS.NAME_EXACT, service.name)
    );
}

function exactExplicitAliasCandidates(catalog, subject) {
  return catalog
    .filter((service) => service.explicitAliases.some((alias) => alias === subject))
    .map((service) =>
      buildPriceMatchCandidate(
        service,
        PRICE_MATCH_LEVELS.EXPLICIT_ALIAS_EXACT,
        subject
      )
    );
}

function exactDerivedAliasCandidates(catalog, subject) {
  return catalog
    .filter((service) => service.derivedAliases.some((alias) => alias === subject))
    .map((service) =>
      buildPriceMatchCandidate(
        service,
        PRICE_MATCH_LEVELS.GENERATED_ALIAS_EXACT,
        subject
      )
    );
}

function structuredSpecificCandidates(catalog, subject, tokens) {
  if (tokens.length < 2) return [];

  return catalog
    .filter((service) => {
      if (!service?.searchText) return false;
      const backedTokens = tokens.filter((word) => service.searchText.includes(word));
      const coreText = normalizeText([service.name, service.category].filter(Boolean).join(" "));
      const coreBackedTokens = tokens.filter((word) => coreText.includes(word));
      const hasSpecificAlias = [...service.explicitAliases, ...service.derivedAliases].some(
        (alias) => alias.length >= 8 && (subject.includes(alias) || alias.includes(subject))
      );

      return (
        backedTokens.length === tokens.length &&
        (hasSpecificAlias || coreBackedTokens.length === tokens.length)
      );
    })
    .map((service) =>
      buildPriceMatchCandidate(
        service,
        PRICE_MATCH_LEVELS.STRUCTURED_SPECIFIC,
        subject
      )
    );
}

function partialPriceCandidates(catalog, subject, tokens) {
  return catalog
    .filter((service) => {
      if (!service?.searchText) return false;

      const name = normalizeText(service.name);
      const aliases = [
        ...service.explicitAliases,
        ...service.derivedAliases,
        ...service.partialAliases,
      ];
      const partialAlias = aliases.some(
        (alias) =>
          (alias.length >= 4 && subject.includes(alias)) ||
          (alias.length >= 8 && alias.includes(subject))
      );
      const tokenOverlap =
        tokens.length > 0 && tokens.some((word) => service.searchText.includes(word));

      return (
        (name && (subject.includes(name) || name.includes(subject))) ||
        partialAlias ||
        tokenOverlap
      );
    })
    .map((service) =>
      buildPriceMatchCandidate(service, PRICE_MATCH_LEVELS.PARTIAL, subject)
    );
}

function splitOfferableCandidates(candidates = []) {
  return {
    offerable: candidates.filter((candidate) => serviceHasValidBotOffer(candidate.service)),
    inactive: candidates.filter((candidate) => !serviceHasValidBotOffer(candidate.service)),
  };
}

function resolveCandidateLevel(candidates = []) {
  const { offerable, inactive } = splitOfferableCandidates(candidates);
  const services = candidateServices(offerable);

  if (services.length === 1) {
    return {
      resolution: "unique",
      service: services[0],
      matches: services,
      level: offerable[0]?.level || null,
    };
  }

  if (services.length > 1) {
    return {
      resolution: "ambiguous",
      service: null,
      matches: services,
      level: offerable[0]?.level || null,
    };
  }

  if (inactive.length > 0) {
    return {
      resolution: "inactive_exact_match",
      service: null,
      matches: candidateServices(inactive),
      level: inactive[0]?.level || null,
    };
  }

  return null;
}

function findMentionedServices(message, services = []) {
  const resolution = resolvePriceQuestionService(message, services);
  return resolution.matches || [];
}

function buildServiceMatchResolution(serviceQuery, services = []) {
  const subject = stripServiceQueryTrailingNoise(serviceQuery);
  if (!subject) {
    return { resolution: "none", service: null, matches: [], level: null };
  }

  const tokens = relevantPriceQueryTokens(subject);
  const catalog = normalizeDraftServiceCatalog(services);
  const levels = [
    exactNameCandidates(catalog, subject),
    exactExplicitAliasCandidates(catalog, subject),
    exactDerivedAliasCandidates(catalog, subject),
    structuredSpecificCandidates(catalog, subject, tokens),
  ];

  for (const levelCandidates of levels) {
    if (levelCandidates.length === 0) continue;
    const levelResolution = resolveCandidateLevel(levelCandidates);
    if (levelResolution) return levelResolution;
  }

  const partialMatches = candidateServices(
    partialPriceCandidates(
      catalog.filter(serviceHasValidBotOffer),
      subject,
      tokens
    )
  );

  if (partialMatches.length > 0) {
    return {
      resolution: "partial",
      service: null,
      matches: partialMatches,
      level: PRICE_MATCH_LEVELS.PARTIAL,
    };
  }

  return { resolution: "none", service: null, matches: [], level: null };
}

function buildPriceMatchResolution(message, services = []) {
  return buildServiceMatchResolution(normalizePriceSubject(message), services);
}

function resolvePriceQuestionService(message, services = []) {
  const resolution = buildPriceMatchResolution(message, services);
  const matches = resolution.matches || [];

  if (resolution.resolution === "none") {
    return { status: "none", service: null, matches };
  }

  if (
    resolution.resolution === "ambiguous" ||
    resolution.resolution === "partial" ||
    resolution.resolution === "inactive_exact_match"
  ) {
    return { status: "ambiguous", service: null, matches };
  }

  const service = resolution.service;
  const formattedPrice = money(service.price);

  return formattedPrice
    ? { status: "unique", service, formattedPrice, matches }
    : { status: "invalid_price", service, matches };
}

function mapServiceResolution({ serviceQuery, services = [], needsPrice = false }) {
  const resolution = buildServiceMatchResolution(serviceQuery, services);
  const matches = resolution.matches || [];

  if (resolution.resolution === "none") {
    return {
      status: SERVICE_RESOLUTION_STATUSES.NOT_FOUND,
      service: null,
      matches,
      level: resolution.level || null,
    };
  }

  if (
    resolution.resolution === "ambiguous" ||
    resolution.resolution === "partial"
  ) {
    return {
      status: SERVICE_RESOLUTION_STATUSES.AMBIGUOUS,
      service: null,
      matches,
      level: resolution.level || null,
    };
  }

  if (resolution.resolution === "inactive_exact_match") {
    return {
      status: SERVICE_RESOLUTION_STATUSES.INACTIVE,
      service: null,
      matches,
      level: resolution.level || null,
    };
  }

  const service = resolution.service;
  const formattedPrice = money(service?.price);

  if (needsPrice && !formattedPrice) {
    return {
      status: SERVICE_RESOLUTION_STATUSES.INVALID_PRICE,
      service,
      matches,
      level: resolution.level || null,
      formattedPrice: null,
    };
  }

  return {
    status: SERVICE_RESOLUTION_STATUSES.MATCHED,
    service,
    matches,
    level: resolution.level || null,
    formattedPrice,
  };
}

function isPriceQuestion(message) {
  return PRICE_PATTERNS.some((pattern) => pattern.test(message));
}

function buildFallbackDraft() {
  return {
    body:
      "Gracias por escribir. Podemos ayudarte con información sobre servicios, precios configurados y dudas generales. Si deseas agendar o revisar disponibilidad, una persona del equipo debe confirmarlo antes.",
    requiresHumanReview: true,
    reason: "general_review_required",
  };
}

function hasPattern(pattern, value) {
  return pattern.test(value);
}

function isGreetingOnly(normalized) {
  if (!normalized) return false;
  return /^(hola|buenos dias|buenas tardes|buenas noches|buenas|hello|hi)(\s+(gracias|que tal|como estan|como estas))*$/.test(
    normalized
  );
}

function detectDraftIntent(body) {
  const normalized = normalizeText(body);
  if (!normalized) return DRAFT_INTENTS.UNKNOWN;

  const hasPrice = isPriceQuestion(body);
  const hasBooking =
    hasPattern(INTENT_PATTERNS.booking, body) ||
    hasPattern(INTENT_PATTERNS.availability, body);

  if (hasPrice && hasBooking) return DRAFT_INTENTS.AMBIGUOUS;
  if (hasPattern(INTENT_PATTERNS.cancellation, body)) return DRAFT_INTENTS.CANCELLATION;
  if (hasPattern(INTENT_PATTERNS.reschedule, body)) return DRAFT_INTENTS.RESCHEDULE;
  if (hasPattern(INTENT_PATTERNS.paymentReceipt, body)) return DRAFT_INTENTS.PAYMENT_RECEIPT;
  if (hasPattern(INTENT_PATTERNS.deposit, body)) return DRAFT_INTENTS.DEPOSIT;
  if (hasPattern(INTENT_PATTERNS.payment, body)) return DRAFT_INTENTS.PAYMENT;
  if (hasPattern(INTENT_PATTERNS.promotion, body)) return DRAFT_INTENTS.PROMOTION;
  if (hasPattern(INTENT_PATTERNS.policy, body)) return DRAFT_INTENTS.POLICY;
  if (hasPattern(INTENT_PATTERNS.comparison, body)) return DRAFT_INTENTS.SERVICE_COMPARISON;
  if (hasPrice) return DRAFT_INTENTS.SERVICE_PRICE;
  if (hasPattern(INTENT_PATTERNS.booking, body)) return DRAFT_INTENTS.BOOKING;
  if (hasPattern(INTENT_PATTERNS.availability, body)) return DRAFT_INTENTS.AVAILABILITY;
  if (hasPattern(INTENT_PATTERNS.serviceInfo, body)) return DRAFT_INTENTS.SERVICE_INFORMATION;
  if (isGreetingOnly(normalized)) return DRAFT_INTENTS.GREETING;

  return DRAFT_INTENTS.UNKNOWN;
}

function shouldResolveService(intent) {
  return [
    DRAFT_INTENTS.SERVICE_PRICE,
    DRAFT_INTENTS.SERVICE_INFORMATION,
    DRAFT_INTENTS.SERVICE_COMPARISON,
  ].includes(intent);
}

function hasMultipleServiceMarkers(serviceQuery) {
  return /\b(y|tambien|también|ademas|además|con|mas|más)\b/i.test(
    serviceQuery
  );
}

function publicServiceResolution(resolution) {
  return {
    status: resolution.status,
    level: resolution.level || null,
    matches_count: safeArray(resolution.matches).length,
    service:
      resolution.service?.name
        ? {
            name: resolution.service.name,
            category: resolution.service.category || null,
            price: resolution.service.price ?? null,
          }
        : null,
  };
}

function determineReviewReason({ intent, serviceResolution }) {
  if (NO_AUTOMATIC_ACTION_INTENTS.has(intent)) {
    return "intent_requires_human_review";
  }

  if (intent === DRAFT_INTENTS.SERVICE_PRICE) {
    if (serviceResolution.status === SERVICE_RESOLUTION_STATUSES.MATCHED) {
      return "configured_service_price";
    }
    if (serviceResolution.status === SERVICE_RESOLUTION_STATUSES.AMBIGUOUS) {
      return "price_ambiguous_service";
    }
    if (serviceResolution.status === SERVICE_RESOLUTION_STATUSES.INACTIVE) {
      return "price_inactive_service";
    }
    if (serviceResolution.status === SERVICE_RESOLUTION_STATUSES.INVALID_PRICE) {
      return "price_invalid_service";
    }
    return "price_service_not_found";
  }

  if (intent === DRAFT_INTENTS.UNSUPPORTED_MEDIA) return "non_textual_message";
  if (intent === DRAFT_INTENTS.UNKNOWN) return "general_review_required";
  return "safe_information_request";
}

export function analyzeDraftRequest({
  inboundMessage = {},
  services = [],
} = {}) {
  const body = cleanText(inboundMessage.body);
  const messageType = cleanText(inboundMessage.message_type || inboundMessage.messageType);

  if (messageType && messageType !== "text") {
    return {
      intent: DRAFT_INTENTS.UNSUPPORTED_MEDIA,
      normalized_query: normalizeText(body),
      service_query: "",
      service_resolution: {
        status: SERVICE_RESOLUTION_STATUSES.NOT_FOUND,
        service: null,
        matches_count: 0,
        level: null,
      },
      confidence: "high",
      requires_human_review: true,
      reason: "non_textual_message",
      response_data: {},
    };
  }

  if (!body) {
    return {
      intent: DRAFT_INTENTS.UNKNOWN,
      normalized_query: "",
      service_query: "",
      service_resolution: {
        status: SERVICE_RESOLUTION_STATUSES.NOT_FOUND,
        service: null,
        matches_count: 0,
        level: null,
      },
      confidence: "low",
      requires_human_review: true,
      reason: "empty_text",
      response_data: {},
    };
  }

  const normalizedQuery = normalizeText(body);
  let intent = detectDraftIntent(body);
  let serviceQuery = "";
  let serviceResolution = {
    status: SERVICE_RESOLUTION_STATUSES.NOT_FOUND,
    service: null,
    matches: [],
    level: null,
    formattedPrice: null,
  };

  if (shouldResolveService(intent)) {
    serviceQuery = extractServiceQueryForIntent(body, intent);
    serviceResolution = mapServiceResolution({
      serviceQuery,
      services,
      needsPrice: intent === DRAFT_INTENTS.SERVICE_PRICE,
    });

    if (
      intent === DRAFT_INTENTS.SERVICE_PRICE &&
      serviceResolution.status === SERVICE_RESOLUTION_STATUSES.AMBIGUOUS &&
      hasMultipleServiceMarkers(serviceQuery)
    ) {
      intent = DRAFT_INTENTS.MULTIPLE_SERVICES;
    }
  }

  const requiresHumanReview =
    NO_AUTOMATIC_ACTION_INTENTS.has(intent) ||
    (intent === DRAFT_INTENTS.SERVICE_PRICE &&
      serviceResolution.status !== SERVICE_RESOLUTION_STATUSES.MATCHED) ||
    intent === DRAFT_INTENTS.UNSUPPORTED_MEDIA ||
    intent === DRAFT_INTENTS.UNKNOWN;
  const reason = determineReviewReason({ intent, serviceResolution });
  const responseData =
    serviceResolution.status === SERVICE_RESOLUTION_STATUSES.MATCHED
      ? {
          service_name: serviceResolution.service.name,
          service_category: serviceResolution.service.category || null,
          base_price: serviceResolution.service.price ?? null,
          formatted_price: serviceResolution.formattedPrice || null,
        }
      : {};

  return {
    intent,
    normalized_query: normalizedQuery,
    service_query: serviceQuery,
    service_resolution: publicServiceResolution(serviceResolution),
    confidence: requiresHumanReview ? "medium" : "high",
    requires_human_review: requiresHumanReview,
    reason,
    response_data: responseData,
  };
}

function configuredServicesSummary(services = []) {
  const catalog = normalizeDraftServiceCatalog(services).filter(serviceHasValidBotOffer);
  const names = uniqueNormalizedList(catalog.map((service) => service.name))
    .map((name) => catalog.find((service) => normalizeText(service.name) === name)?.name)
    .filter(Boolean)
    .slice(0, 6);

  if (names.length === 0) return "";
  return names.join(", ");
}

function buildDraftFromAnalysis({ analysis, settings = {}, faqs = [], knowledgeItems = [], inboundBody = "" }) {
  if (analysis.intent === DRAFT_INTENTS.UNSUPPORTED_MEDIA) {
    return {
      body:
        "Se recibió un mensaje no textual. Requiere revisión humana antes de responder.",
      requiresHumanReview: true,
      reason: analysis.reason,
    };
  }

  if (analysis.reason === "empty_text") {
    return {
      body:
        "Se recibió un mensaje sin texto claro. Requiere revisión humana antes de responder.",
      requiresHumanReview: true,
      reason: analysis.reason,
    };
  }

  if (
    analysis.intent === DRAFT_INTENTS.SERVICE_PRICE &&
    analysis.service_resolution.status === SERVICE_RESOLUTION_STATUSES.MATCHED
  ) {
    return {
      body: `El precio configurado de ${analysis.response_data.service_name} es ${analysis.response_data.formatted_price}. Si necesitas revisar detalles o combinarlo con otro servicio, una persona del equipo puede confirmarlo.`,
      requiresHumanReview: false,
      reason: analysis.reason,
      analysis,
    };
  }

  if (
    analysis.intent === DRAFT_INTENTS.SERVICE_PRICE &&
    analysis.service_resolution.status === SERVICE_RESOLUTION_STATUSES.AMBIGUOUS
  ) {
    return {
      body:
        "Encontré más de un servicio que podría coincidir. Para darte el precio correcto necesito que una persona del equipo confirme el servicio exacto antes de responder.",
      requiresHumanReview: true,
      reason: analysis.reason,
      analysis,
    };
  }

  if (analysis.intent === DRAFT_INTENTS.SERVICE_PRICE) {
    return {
      body:
        "Para darte un precio correcto necesito que una persona del equipo revise el servicio exacto. No debo inventar precios ni confirmar importes no configurados.",
      requiresHumanReview: true,
      reason: analysis.reason,
      analysis,
    };
  }

  if (NO_AUTOMATIC_ACTION_INTENTS.has(analysis.intent)) {
    return {
      body:
        "Puedo sugerir apoyo, pero esta solicitud requiere revisión humana. No debo confirmar disponibilidad, horarios, citas, pagos ni cambios desde un borrador.",
      requiresHumanReview: true,
      reason: analysis.reason,
      analysis,
    };
  }

  const normalized = normalizeText(inboundBody);
  const matchedFaq = safeArray(faqs).find((faq) => {
    const haystack = normalizeText([faq.question, faq.keywords].filter(Boolean).join(" "));
    return haystack && normalized.includes(haystack);
  });

  if (matchedFaq?.answer) {
    return {
      body: cleanText(matchedFaq.answer).slice(0, 900),
      requiresHumanReview: false,
      reason: "matched_faq",
      analysis,
    };
  }

  const matchedKnowledge = safeArray(knowledgeItems).find((item) => {
    const haystack = normalizeText([item.title, item.keywords].filter(Boolean).join(" "));
    return haystack && normalized.includes(haystack);
  });

  if (matchedKnowledge?.content) {
    return {
      body: cleanText(matchedKnowledge.content).slice(0, 900),
      requiresHumanReview: false,
      reason: "matched_knowledge",
      analysis,
    };
  }

  if (/\b(instagram|ig|redes)\b/i.test(inboundBody)) {
    const instagram = getConfiguredInstagram(settings);
    if (!instagram) {
      return {
        body:
          "Una persona del equipo puede confirmarte las redes oficiales antes de responder.",
        requiresHumanReview: true,
        reason: "instagram_requires_review",
        analysis,
      };
    }

    return {
      body: `Claro. En Instagram nos encuentras como ${instagram}.`,
      requiresHumanReview: false,
      reason: "instagram_info",
      analysis,
    };
  }

  if (/\b(servicios|hacen|ofrecen)\b/i.test(inboundBody)) {
    const businessName = getConfiguredBusinessName(settings) || DEFAULT_BUSINESS_NAME;
    const summary = configuredServicesSummary(analysis.catalogServices || []);
    return {
      body: summary
        ? `${businessName} tiene servicios configurados como ${summary}. Para precios o detalles específicos, el equipo debe revisar el servicio exacto antes de confirmar.`
        : `Una persona del equipo puede confirmarte los servicios disponibles de ${businessName}.`,
      requiresHumanReview: !summary,
      reason: summary ? "services_info" : "services_info_requires_review",
      analysis,
    };
  }

  if (analysis.intent === DRAFT_INTENTS.GREETING) {
    return {
      body:
        "Gracias por escribir. Con gusto podemos ayudarte con información general del negocio.",
      requiresHumanReview: false,
      reason: "greeting",
      analysis,
    };
  }

  if (settings?.fallback_message) {
    return {
      body: cleanText(settings.fallback_message).slice(0, 900),
      requiresHumanReview: true,
      reason: "configured_fallback",
      analysis,
    };
  }

  return { ...buildFallbackDraft(), analysis };
}

function getConfiguredInstagram(settings = {}) {
  return cleanText(
    settings.instagram ||
      settings.instagram_url ||
      settings.social_instagram ||
      settings.social_instagram_url ||
      ""
  );
}

function getConfiguredBusinessName(settings = {}) {
  return cleanText(
    settings.business_name ||
      settings.salon_name ||
      settings.name ||
      settings.display_name ||
      ""
  );
}

export function isDraftGenerationEnabled(env = process.env) {
  return env.BOT_DRAFT_GENERATION_ENABLED === "true";
}

export function isOutboundSendEnabled(env = process.env) {
  return env.BOT_OUTBOUND_SEND_ENABLED === "true";
}

export function generateSafeDraftReply({
  inboundMessage = {},
  services = [],
  settings = {},
  faqs = [],
  knowledgeItems = [],
} = {}) {
  const analysis = analyzeDraftRequest({ inboundMessage, services });
  return buildDraftFromAnalysis({
    analysis: { ...analysis, catalogServices: services },
    settings,
    faqs,
    knowledgeItems,
    inboundBody: inboundMessage.body,
  });
}

async function selectMaybeSingle(query) {
  if (typeof query.maybeSingle === "function") {
    return query.maybeSingle();
  }

  const result = await query.limit(1);
  return {
    data: Array.isArray(result?.data) ? result.data[0] || null : result?.data || null,
    error: result?.error || null,
  };
}

export async function loadBotDraftContext({ supabase, conversationId } = {}) {
  if (!supabase?.from) {
    throw new Error("bot_draft_context_requires_supabase");
  }

  const [
    messagesResult,
    servicesResult,
    settingsResult,
    faqsResult,
    knowledgeResult,
  ] = await Promise.all([
    supabase
      .from("bot_messages")
      .select("id,direction,message_type,body,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("services")
      .select(
        "id,name,category,base_price,bot_keywords,bot_service_group,active,bot_active"
      )
      .eq("active", true)
      .limit(80),
    selectMaybeSingle(
      supabase.from("bot_settings").select("*").limit(1)
    ),
    supabase
      .from("bot_faqs")
      .select("question,answer,keywords,active")
      .eq("active", true)
      .limit(40),
    supabase
      .from("bot_knowledge_base")
      .select("title,content,keywords,active")
      .eq("active", true)
      .limit(40),
  ]);

  for (const result of [
    messagesResult,
    servicesResult,
    settingsResult,
    faqsResult,
    knowledgeResult,
  ]) {
    if (result?.error) throw result.error;
  }

  return {
    recentMessages: safeArray(messagesResult.data).reverse(),
    services: normalizeDraftServiceCatalog(servicesResult.data),
    settings: settingsResult.data || {},
    faqs: safeArray(faqsResult.data).filter((faq) => faq.active !== false),
    knowledgeItems: safeArray(knowledgeResult.data).filter(
      (item) => item.active !== false
    ),
  };
}

export function createBotResponseDraftRepository({ supabase } = {}) {
  if (!supabase?.from) {
    throw new Error("bot_response_draft_repository_requires_supabase");
  }

  return {
    async findByInboundMessageId(inboundMessageId) {
      const { data, error } = await supabase
        .from(DRAFTS_TABLE)
        .select("id,status")
        .eq("inbound_message_id", inboundMessageId)
        .limit(1);

      if (error) throw error;
      return data?.[0] || null;
    },

    async findInboundMessageById(inboundMessageId) {
      const { data, error } = await supabase
        .from(MESSAGES_TABLE)
        .select("id,conversation_id,direction,provider,provider_message_id")
        .eq("id", inboundMessageId)
        .limit(1);

      if (error) throw error;
      return data?.[0] || null;
    },

    async findWebhookEventById(webhookEventId) {
      if (!webhookEventId) return null;

      const { data, error } = await supabase
        .from(EVENTS_TABLE)
        .select("id,provider,provider_message_id,event_type")
        .eq("id", webhookEventId)
        .limit(1);

      if (error) throw error;
      return data?.[0] || null;
    },

    async insertDraft(payload) {
      const { data, error } = await supabase
        .from(DRAFTS_TABLE)
        .insert([payload])
        .select("id,status")
        .single();

      if (error) {
        if (isDuplicateError(error)) {
          return { duplicate: true, data: null };
        }
        throw error;
      }

      return { duplicate: false, data };
    },
  };
}

function sanitizeError(error) {
  return {
    code: safeErrorCode(error?.code || error?.name),
    message: safeErrorMessage(),
  };
}

export function createBotResponseDraftOrchestrator({
  supabase,
  env = process.env,
  repository,
  contextProvider,
  replyGenerator = generateSafeDraftReply,
} = {}) {
  const draftRepository =
    repository || createBotResponseDraftRepository({ supabase });
  const loadContext =
    contextProvider ||
    ((params) => loadBotDraftContext({ supabase, ...params }));

  return {
    async maybeGenerateDraft({
      conversation,
      inboundMessage,
      webhookEventId = null,
      provider = SAFE_PROVIDER,
      now = new Date().toISOString(),
    } = {}) {
      if (!isDraftGenerationEnabled(env)) {
        return { ok: true, enabled: false, generated: 0, skipped: 1 };
      }

      if (isOutboundSendEnabled(env)) {
        return {
          ok: true,
          enabled: true,
          generated: 0,
          skipped: 1,
          code: "outbound_send_disabled_for_drafts",
        };
      }

      const validation = validateInboundMessageForDraft({
        conversation,
        inboundMessage,
      });
      if (!validation.ok) {
        return {
          ok: false,
          enabled: true,
          generated: 0,
          failed: 1,
          code: validation.code,
        };
      }

      const persistedMessage = await draftRepository.findInboundMessageById(
        inboundMessage.id
      );
      const persistedValidation = validatePersistentInboundMessage({
        conversation,
        inboundMessage,
        persistedMessage,
        provider,
      });
      if (!persistedValidation.ok) {
        return {
          ok: false,
          enabled: true,
          generated: 0,
          failed: 1,
          code: persistedValidation.code,
        };
      }

      if (webhookEventId) {
        const webhookEvent = await draftRepository.findWebhookEventById(
          webhookEventId
        );
        const webhookValidation = validatePersistentWebhookEvent({
          webhookEvent,
          inboundMessage,
          provider,
        });
        if (!webhookValidation.ok) {
          return {
            ok: false,
            enabled: true,
            generated: 0,
            failed: 1,
            code: webhookValidation.code,
          };
        }
      }

      const existing = await draftRepository.findByInboundMessageId(
        inboundMessage.id
      );
      if (existing) {
        return {
          ok: true,
          enabled: true,
          generated: 0,
          duplicate: 1,
          draftId: existing.id,
          status: existing.status,
        };
      }

      try {
        const context = await loadContext({
          conversationId: conversation.id,
          inboundMessage,
        });
        const draft = await replyGenerator({
          inboundMessage,
          conversation,
          recentMessages: context.recentMessages,
          services: context.services,
          settings: context.settings,
          faqs: context.faqs,
          knowledgeItems: context.knowledgeItems,
        });
        const draftBody = sanitizeDraftBody(draft.body);
        const metadata = buildDraftMetadata({
          reason: draft.reason,
          failed: false,
        });

        const insertResult = await draftRepository.insertDraft({
          conversation_id: conversation.id,
          inbound_message_id: inboundMessage.id,
          webhook_event_id: webhookEventId,
          provider,
          status: GENERATED_STATUS,
          body: draftBody,
          requires_human_review: Boolean(draft.requiresHumanReview),
          error_code: null,
          error_message: null,
          metadata,
          created_at: now,
          updated_at: now,
        });

        if (insertResult.duplicate) {
          return { ok: true, enabled: true, generated: 0, duplicate: 1 };
        }

        return {
          ok: true,
          enabled: true,
          generated: 1,
          duplicate: 0,
          draftId: insertResult.data?.id || null,
          requiresHumanReview: Boolean(draft.requiresHumanReview),
        };
      } catch (error) {
        const safeError = sanitizeError(error);
        const metadata = buildDraftMetadata({ failed: true });
        const insertResult = await draftRepository.insertDraft({
          conversation_id: conversation.id,
          inbound_message_id: inboundMessage.id,
          webhook_event_id: webhookEventId,
          provider,
          status: FAILED_STATUS,
          body: null,
          requires_human_review: true,
          error_code: safeError.code,
          error_message: safeError.message,
          metadata,
          created_at: now,
          updated_at: now,
        });

        if (insertResult.duplicate) {
          return { ok: false, enabled: true, failed: 0, duplicate: 1 };
        }

        return {
          ok: false,
          enabled: true,
          generated: 0,
          failed: 1,
          errorCode: safeError.code,
        };
      }
    },
  };
}
