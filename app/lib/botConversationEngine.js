import {
  confirmAppointmentPreview,
  formatAppointmentPreview,
  prepareAppointmentDraft,
} from "./botAppointmentOrchestrator.js";

const INTENTS = new Set([
  "greeting",
  "ask_services",
  "ask_price",
  "booking",
  "reschedule",
  "cancel",
  "deposit",
  "location",
  "business_hours",
  "human_help",
  "unknown",
]);

const ACTIONS = new Set([
  "SHOW_SERVICE_OPTIONS",
  "SHOW_SERVICE_PRICES",
  "ASK_SERVICE_DETAIL",
  "ASK_PEOPLE_COUNT",
  "ASK_DATE",
  "ASK_TIME_RANGE",
  "ASK_STAFF_PREFERENCE",
  "CHECK_AVAILABILITY",
  "PREPARE_APPOINTMENT_PREVIEW",
  "CONFIRM_APPOINTMENT_PREVIEW",
  "REQUEST_HUMAN_REVIEW",
  "ANSWER_INFORMATION",
  "CLARIFY_MESSAGE",
  "SELECT_MENU_OPTION",
  "SET_PEOPLE_COUNT",
  "CLARIFY_TIME_PERIOD",
  "VALIDATE_DEPOSIT",
]);

const LEGACY_ACTIONS = new Set([
  "LEGACY_CHECK_AVAILABILITY",
  "LEGACY_RECHECK_APPOINTMENT_DRAFT",
  "LEGACY_BUILD_LOCATION_RESPONSE",
  "LEGACY_BUILD_BUSINESS_HOURS_RESPONSE",
]);

const STEP_ALIASES = {
  esperando_servicios: "service",
  esperando_tipo_unas: "service_detail",
  esperando_seleccion_servicios: "service_detail",
  esperando_multipersona_servicio: "service_detail",
  esperando_multipersona_datos: "people_count",
  esperando_fecha: "date",
  esperando_fecha_pestanas: "date",
  esperando_hora: "time",
  esperando_rango_horario: "time",
  esperando_tecnica: "staff",
  esperando_opcion_horario: "availability",
  preview_cita: "confirmation",
  esperando_confirmacion: "confirmation",
  esperando_confirmacion_equipo: "human_review",
  esperando_confirmacion_solicitud_relleno: "human_review",
};

const MENU_TYPES_BY_STEP = {
  service: "services",
  service_detail: "services",
  staff: "staff",
  availability: "availability",
};

export function normalizeBotText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}#:+\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text, values) {
  return values.some((value) => text.includes(normalizeBotText(value)));
}

function serviceText(service) {
  return normalizeBotText(
    `${service?.name || ""} ${service?.category || ""} ${
      service?.bot_keywords || ""
    } ${service?.bot_service_group || ""}`
  );
}

export function adaptServiceForBot(service) {
  const text = serviceText(service);
  const internal =
    service?.active === false ||
    service?.bot_active === false ||
    text.includes("cliente frecuente") ||
    text.includes("ajuste administrativo") ||
    text.includes("descuento interno");
  const needsReview = includesAny(text, [
    "relleno",
    "retoque",
    "mantenimiento",
    "reparacion",
    "reparación",
    "correccion",
    "corrección",
    "medicado",
    "keratina",
    "botox capilar",
    "cirugia capilar",
    "cirugía capilar",
  ]);
  const price = Number(service?.base_price || 0);

  return {
    id: String(service?.id || ""),
    name: String(service?.name || ""),
    category: String(service?.category || ""),
    visibility: internal ? "internal" : "public",
    bookingMode: internal
      ? "information_only"
      : needsReview
      ? "requires_human_review"
      : service?.bot_bookable === false
      ? "information_only"
      : "direct",
    priceType: price > 0 ? "fixed" : needsReview ? "variable" : "hidden",
    price: price > 0 ? price : null,
    durationMinutes: Number(service?.duration_minutes || 0),
    cleanupMinutes: Number(service?.cleanup_minutes || 0),
    aliases: [
      service?.name,
      service?.category,
      service?.bot_keywords,
      service?.bot_service_group,
    ]
      .filter(Boolean)
      .map(normalizeBotText),
    active: service?.active !== false && service?.bot_active !== false,
    source: service,
  };
}

export function buildBotServiceCatalog(services = []) {
  return services
    .map(adaptServiceForBot)
    .filter((service) => service.id && service.name && service.active);
}

function isPedicure(service) {
  return includesAny(serviceText(service), ["pedicure", "pedicura", "pedi"]);
}

function isLashes(service) {
  return includesAny(serviceText(service), ["pestana", "pestaña", "lifting"]);
}

function isNaturalLashes(service) {
  const text = serviceText(service);
  return isLashes(service) && (text.includes("lifting") || text.includes("clasica"));
}

function isGelHands(service) {
  const text = serviceText(service);
  return (
    includesAny(text, ["gelish", "gel semi", "semipermanente"]) &&
    !includesAny(text, ["pie", "pies", "pedicure"])
  );
}

function isEsculturales(service) {
  return serviceText(service).includes("escultural");
}

function isHairTreatment(service, query) {
  const text = serviceText(service);
  return (
    (query.includes("keratina") && text.includes("keratina")) ||
    (query.includes("botox") && text.includes("botox")) ||
    (query.includes("cirugia") && text.includes("cirugia"))
  );
}

function uniqueServices(services) {
  return Array.from(
    new Map((services || []).filter((item) => item?.id).map((item) => [item.id, item])).values()
  );
}

export function normalizeServiceMentions({
  customerMessage,
  serviceCatalog = [],
  currentState = {},
}) {
  const originalText = String(customerMessage || "").trim();
  const query = normalizeBotText(originalText);
  const publicServices = serviceCatalog.filter(
    (service) => service.visibility === "public" && service.active
  );
  let candidates = [];
  let resolvedServices = [];
  let ambiguityReason = null;
  let humanReviewReason = null;
  const mentionsPedicure = includesAny(query, [
    "pedi",
    "pedicure",
    "pedicura",
  ]);
  const mentionsGelHands = includesAny(query, [
    "gelish",
    "gel semipermanente",
    "gel en manos",
  ]);
  const mentionsFeetAndBrows =
    includesAny(query, ["pie", "pies"]) &&
    includesAny(query, ["ceja", "cejas"]);

  if (query.includes("otro salon")) {
    candidates = publicServices.filter((service) =>
      includesAny(serviceText(service), [
        "relleno",
        "retoque",
        "mantenimiento",
        "reparacion",
        "correccion",
      ])
    );
    humanReviewReason = "external_work_requires_review";
  } else if (mentionsFeetAndBrows) {
    const feetCandidates = publicServices.filter(isPedicure);
    const browCandidates = publicServices.filter((service) =>
      includesAny(serviceText(service), [
        "ceja",
        "planchado",
        "laminado",
        "depilacion",
      ])
    );
    candidates = [...feetCandidates, ...browCandidates];
    resolvedServices = [
      ...(feetCandidates.length === 1 ? feetCandidates : []),
      ...(browCandidates.length === 1 ? browCandidates : []),
    ];
    ambiguityReason = "multiple_service_variants_required";
  } else if (mentionsPedicure && mentionsGelHands) {
    const pedicureCandidates = publicServices.filter(isPedicure);
    const gelCandidates = publicServices.filter(isGelHands);
    candidates = [...pedicureCandidates, ...gelCandidates];
    resolvedServices = [
      ...(pedicureCandidates.length === 1 ? pedicureCandidates : []),
      ...(gelCandidates.length === 1 ? gelCandidates : []),
    ];
    ambiguityReason = "multiple_service_variants_required";
  } else if (includesAny(query, ["pestanas naturales", "pestañas naturales", "sutil", "natural"])) {
    candidates = publicServices.filter(isNaturalLashes);
    ambiguityReason = "natural_lashes_choice";
  } else if (includesAny(query, ["pedi medico", "pedicure medicado"])) {
    candidates = publicServices.filter(
      (service) => isPedicure(service) && serviceText(service).includes("medicado")
    );
    humanReviewReason = "pedicure_medicado_requires_assessment";
  } else if (mentionsPedicure) {
    candidates = publicServices.filter(isPedicure);
    ambiguityReason = candidates.length > 1 ? "pedicure_variant_required" : null;
  } else if (
    (mentionsGelHands &&
      !includesAny(query, ["relleno", "retoque", "mantenimiento"])) ||
    /^(quiero\s+)?gel(?:\s+en\s+manos)?$/.test(query)
  ) {
    candidates = publicServices.filter(isGelHands);
  } else if (query.includes("escultural")) {
    candidates = publicServices.filter(isEsculturales);
  } else if (
    includesAny(query, ["relleno", "retoque", "mantenimiento", "trabajo de otro salon"])
  ) {
    const maintenanceCandidates = publicServices.filter((service) =>
      includesAny(serviceText(service), ["relleno", "retoque", "mantenimiento"])
    );
    candidates = includesAny(query, ["ruber", "rubber"])
      ? maintenanceCandidates.filter((service) =>
          serviceText(service).includes("rubber")
        )
      : maintenanceCandidates;
    humanReviewReason = query.includes("otro salon")
      ? "external_work_requires_review"
      : "maintenance_requires_details";
  } else if (
    includesAny(query, [
      "keratina",
      "botox de cabello",
      "botox capilar",
      "cirugia capilar",
    ]) ||
    query === "cirugia"
  ) {
    candidates = publicServices.filter((service) =>
      isHairTreatment(service, query)
    );
    humanReviewReason = "hair_treatment_requires_assessment";
  } else if (includesAny(query, ["pestana", "pestaña", "pestanas", "pestañas"])) {
    candidates = publicServices.filter(isLashes);
    ambiguityReason = candidates.length > 1 ? "lashes_variant_required" : null;
  } else if (
    includesAny(query, [
      "planchado de ceja",
      "planchado de cejas",
      "laminado de ceja",
      "laminado de cejas",
      "depilacion de ceja",
      "depilacion de cejas",
    ])
  ) {
    candidates = publicServices.filter((service) =>
      includesAny(serviceText(service), [
        "planchado",
        "laminado",
        "depilacion de ceja",
      ])
    );
    ambiguityReason = candidates.length > 1 ? "brow_variant_required" : null;
  } else if (includesAny(query, ["una natural", "uña natural"])) {
    candidates = publicServices.filter((service) =>
      includesAny(serviceText(service), [
        "gel",
        "rubber",
        "vitacare",
        "bano de gel",
      ])
    );
    ambiguityReason = "natural_nail_system_required";
  } else if (
    includesAny(query, ["unas acrilicas", "uñas acrílicas"]) &&
    !includesAny(query, ["relleno", "retoque", "mantenimiento"])
  ) {
    candidates = publicServices.filter(
      (service) =>
        serviceText(service).includes("acril") &&
        !includesAny(serviceText(service), [
          "relleno",
          "retoque",
          "mantenimiento",
        ])
    );
    ambiguityReason =
      candidates.length > 1 ? "acrylic_application_type_required" : null;
  } else if (/^(quiero\s+)?unas$/.test(query) || /^(quiero\s+)?uñas$/.test(originalText.toLowerCase())) {
    ambiguityReason = "nails_category_required";
  } else {
    const queryWords = query
      .split(" ")
      .filter(
        (word) =>
          word.length >= 4 &&
          !["quiero", "cita", "para", "prefiero", "mejor"].includes(word)
      );
    candidates = publicServices.filter((service) => {
      const text = `${normalizeBotText(service.name)} ${service.aliases.join(" ")}`;
      return queryWords.length > 0 && queryWords.every((word) => text.includes(word));
    });
  }

  const selectedFromState = Array.isArray(currentState.selectedServices)
    ? currentState.selectedServices
    : [];
  if (resolvedServices.length === 0 && candidates.length === 1) {
    resolvedServices = candidates;
  }

  return {
    originalText,
    normalizedQuery: query,
    candidates: uniqueServices(candidates),
    resolvedServices: uniqueServices(resolvedServices),
    existingServices: selectedFromState,
    ambiguityReason,
    humanReviewReason,
  };
}

function parsePeopleCount(text) {
  const normalized = normalizeBotText(text);
  const explicit = normalized.match(/\b(?:somos|para)\s+(\d+)\b/);
  if (explicit) return Number(explicit[1]);
  if (
    includesAny(normalized, [
      "mi mama y yo",
      "mi hermana y yo",
      "mi amiga y yo",
      "para mi mama y para mi",
      "para dos",
      "somos dos",
      "para ambas",
    ])
  ) {
    return 2;
  }
  return null;
}

function parseDatePreference(text) {
  const normalized = normalizeBotText(text);
  const morningOnly = includesAny(normalized, [
    "en la manana",
    "por la manana",
    "de la manana",
  ]);
  const tomorrowMentions = normalized.match(/\bmanana\b/g)?.length || 0;
  if (tomorrowMentions > 1 || (tomorrowMentions === 1 && !morningOnly)) {
    return "mañana";
  }
  if (normalized.includes("sabado")) return "sábado";
  const date = normalized.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  return date ? date[0] : null;
}

function parseTimeRange(text) {
  const normalized = normalizeBotText(text);
  const before = normalized.match(/antes de las?\s+(\d{1,2})/);
  const after = normalized.match(/(?:despues de las?|desde las?)\s+(\d{1,2})/);
  if (before) {
    return { preference: `antes de las ${before[1]}`, start: null, end: `${before[1].padStart(2, "0")}:00` };
  }
  if (after) {
    let hour = Number(after[1]);
    if (hour >= 1 && hour <= 8) hour += 12;
    return {
      preference: `después de las ${after[1]}`,
      start: `${String(hour).padStart(2, "0")}:00`,
      end: null,
    };
  }
  if (normalized.includes("manana")) {
    return { preference: "mañana", start: "08:00", end: "12:00" };
  }
  if (normalized.includes("tarde")) {
    return { preference: "tarde", start: "12:00", end: "18:31" };
  }
  if (normalized.includes("noche")) {
    return { preference: "noche", start: "18:31", end: null };
  }
  return null;
}

function parseStaffPreference(text, staff = []) {
  const normalized = normalizeBotText(text);
  if (
    includesAny(normalized, [
      "cualquiera",
      "con quien sea",
      "sin preferencia",
      "la disponible",
      "quien tenga espacio",
      "primera vez",
    ])
  ) {
    return { type: "any", staffId: null, staffName: null };
  }
  const person = staff.find((item) => {
    const fullName = normalizeBotText(item.full_name || item.name);
    const firstName = fullName.split(" ")[0];
    const firstNameAlias =
      firstName === "alexandra" ? "alejandra" : firstName;
    return (
      normalized.includes(fullName) ||
      (firstName.length >= 4 &&
        (new RegExp(`\\b${firstName}\\b`).test(normalized) ||
          new RegExp(`\\b${firstNameAlias}\\b`).test(normalized)))
    );
  });
  return person
    ? {
        type: "specific",
        staffId: person.id,
        staffName: person.full_name || person.name,
      }
    : { type: "unknown", staffId: null, staffName: null };
}

function createParticipants(count, message = "") {
  if (count <= 1) {
    return [
      {
        id: "person_1",
        label: "clienta",
        services: [],
        pendingServiceCandidates: [],
        assignmentComplete: false,
      },
    ];
  }

  const text = normalizeBotText(message);
  const secondLabel = text.includes("mama")
    ? "mamá"
    : text.includes("hermana")
    ? "hermana"
    : text.includes("amiga")
    ? "amiga"
    : "acompañante";

  return Array.from({ length: count }, (_, index) => ({
    id: `person_${index + 1}`,
    label:
      index === 0
        ? "clienta"
        : index === 1
        ? secondLabel
        : `persona ${index + 1}`,
    services: [],
    pendingServiceCandidates: [],
    assignmentComplete: false,
  }));
}

function ensureParticipants(participants, count, message) {
  const existing = Array.isArray(participants) ? participants : [];
  if (existing.length === count) {
    return existing.map((participant) => ({
      ...participant,
      services: Array.isArray(participant.services)
        ? participant.services
        : [],
      pendingServiceCandidates: Array.isArray(
        participant.pendingServiceCandidates
      )
        ? participant.pendingServiceCandidates
        : [],
    }));
  }
  return createParticipants(count, message);
}

function parseParticipantServiceAssignments({
  customerMessage,
  participants,
  serviceCatalog,
}) {
  const text = normalizeBotText(customerMessage);
  const patterns = [
    {
      regex: /para mi (.+?) y para mi mama (.+)$/,
      assignments: [
        { participantId: "person_1", group: 1 },
        { participantId: "person_2", group: 2 },
      ],
    },
    {
      regex: /para mi mama (.+?) y para mi (.+)$/,
      assignments: [
        { participantId: "person_2", group: 1 },
        { participantId: "person_1", group: 2 },
      ],
    },
  ];
  const pattern = patterns.find((item) => item.regex.test(text));
  if (!pattern) {
    return { participants, pendingParticipantId: null, recognized: false };
  }
  const match = text.match(pattern.regex);
  let pendingParticipantId = null;
  const nextParticipants = participants.map((participant) => {
    const assignment = pattern.assignments.find(
      (item) => item.participantId === participant.id
    );
    if (!assignment) return participant;
    const phrase = match?.[assignment.group] || "";
    const mention = normalizeServiceMentions({
      customerMessage: phrase,
      serviceCatalog,
      currentState: {},
    });
    const services = mention.resolvedServices.map((service) => ({
      id: service.id,
      name: service.name,
    }));
    const pendingServiceCandidates =
      mention.resolvedServices.length === 0
        ? mention.candidates.map((service) => service.id)
        : [];
    if (pendingServiceCandidates.length > 0) {
      pendingParticipantId = participant.id;
    }
    return {
      ...participant,
      services,
      pendingServiceCandidates,
      assignmentComplete:
        services.length > 0 && pendingServiceCandidates.length === 0,
    };
  });

  return {
    participants: nextParticipants,
    pendingParticipantId,
    recognized: true,
  };
}

export function normalizeConversationState(currentState = {}, context = {}) {
  const pendingStep =
    STEP_ALIASES[currentState.pendingStep] ||
    STEP_ALIASES[context.bookingStep] ||
    currentState.pendingStep ||
    null;
  const legacyMenu = context.lastOfferedMenu || currentState.lastOfferedMenu || null;

  return {
    intent: currentState.intent || null,
    selectedServices: Array.isArray(currentState.selectedServices)
      ? currentState.selectedServices
      : [],
    peopleCount: Number(currentState.peopleCount || 1),
    datePreference: currentState.datePreference || null,
    parsedDate: currentState.parsedDate || null,
    timePreference: currentState.timePreference || null,
    timeRange: currentState.timeRange || null,
    staffPreference: currentState.staffPreference || {
      type: "unknown",
      staffId: null,
      staffName: null,
    },
    pendingStep,
    lastOfferedMenu: legacyMenu,
    depositMentioned: currentState.depositMentioned === true,
    humanReviewRequired: currentState.humanReviewRequired === true,
    humanReviewReason: currentState.humanReviewReason || null,
    participants: ensureParticipants(
      currentState.participants,
      Number(currentState.peopleCount || 1),
      ""
    ),
    pendingParticipantId: currentState.pendingParticipantId || null,
    pendingData: Array.isArray(currentState.pendingData)
      ? currentState.pendingData
      : [],
    serviceRequests: Array.isArray(currentState.serviceRequests)
      ? currentState.serviceRequests
      : [],
    appointmentDraft: currentState.appointmentDraft || null,
    orchestratorResult: currentState.orchestratorResult || null,
  };
}

export function resolveNumericReply({ customerMessage, state }) {
  const match = String(customerMessage || "").trim().match(/^(\d+)$/);
  if (!match) return null;
  const value = Number(match[1]);
  const pendingStep = state.pendingStep;
  const expectedMenuType = MENU_TYPES_BY_STEP[pendingStep];
  const menu = state.lastOfferedMenu;
  const menuCreatedAt = menu?.createdAt
    ? new Date(menu.createdAt).getTime()
    : null;
  const menuExpired =
    Number.isFinite(menuCreatedAt) &&
    Date.now() - menuCreatedAt > 30 * 60 * 1000;

  if (pendingStep === "people_count") {
    return { value, meaning: "people_count", peopleCount: value };
  }
  if (pendingStep === "time") {
    return { value, meaning: "hour", hour: value, ambiguousPeriod: value <= 12 };
  }
  if (
    !expectedMenuType ||
    !menu ||
    menu.type !== expectedMenuType ||
    menuExpired
  ) {
    return { value, meaning: "unknown", reason: "no_current_menu" };
  }
  const option = menu.options?.[value - 1];
  if (!option) {
    return { value, meaning: "unknown", reason: "menu_option_out_of_range" };
  }
  return { value, meaning: "menu_option", menuType: menu.type, option };
}

function fallbackInterpretation(customerMessage, serviceMentions, state, staff) {
  const text = normalizeBotText(customerMessage);
  const numericReply = resolveNumericReply({ customerMessage, state });
  const peopleCount = parsePeopleCount(text);
  const datePreference = parseDatePreference(text);
  const timeRange = parseTimeRange(text);
  const staffPreference = parseStaffPreference(text, staff);
  const depositMentioned = includesAny(text, [
    "ya pague",
    "ya transferi",
    "comprobante",
    "anticipo",
  ]);
  const asksPrice = includesAny(text, ["precio", "cuanto cuesta", "costo"]);
  const continuesBooking =
    state.intent === "booking" ||
    [
      "service",
      "service_detail",
      "people_count",
      "date",
      "time",
      "staff",
      "availability",
      "appointment_preview",
      "confirmation",
    ].includes(state.pendingStep);
  const intent = depositMentioned
    ? "deposit"
    : asksPrice
    ? "ask_price"
    : serviceMentions.candidates.length > 0 ||
      serviceMentions.ambiguityReason ||
      includesAny(text, ["cita", "agendar"]) ||
      (continuesBooking &&
        Boolean(
          datePreference ||
            timeRange ||
            peopleCount ||
            staffPreference.type !== "unknown" ||
            state.selectedServices.length
        ))
    ? "booking"
    : includesAny(text, [
        "ubicacion",
        "donde estan",
        "donde se ubican",
        "como llego",
      ])
    ? "location"
    : includesAny(text, ["horario", "a que hora"])
    ? "business_hours"
    : includesAny(text, ["hola", "buenas"])
    ? "greeting"
    : "unknown";

  return {
    intent,
    confidence: intent === "unknown" ? 0.3 : 0.8,
    topics: [],
    serviceMentions: [
      {
        originalText: serviceMentions.originalText,
        normalizedQuery: serviceMentions.normalizedQuery,
        possibleServiceIds: serviceMentions.candidates.map((item) => item.id),
        confidence: serviceMentions.candidates.length > 0 ? 0.8 : 0.4,
      },
    ],
    peopleCount,
    datePreference,
    timePreference: timeRange?.preference || null,
    timeRange: timeRange
      ? { start: timeRange.start, end: timeRange.end }
      : null,
    staffPreference,
    numericReply,
    depositMentioned,
    needsHumanReview: Boolean(serviceMentions.humanReviewReason),
    humanReviewReason: serviceMentions.humanReviewReason,
    confirmationMentioned:
      state.pendingStep === "confirmation" &&
      includesAny(text, ["si", "sí", "confirmo", "correcto"]),
    requestedAction: null,
  };
}

export function validateBotInterpretation({
  rawInterpretation,
  fallback,
  serviceCatalog = [],
}) {
  const errors = [];
  const parsed =
    rawInterpretation && typeof rawInterpretation === "object"
      ? rawInterpretation
      : fallback;
  if (parsed !== rawInterpretation) errors.push("invalid_structured_interpretation");
  const allowedIds = new Set(serviceCatalog.map((service) => service.id));
  const serviceMentions = Array.isArray(parsed.serviceMentions)
    ? parsed.serviceMentions.map((mention) => {
        const ids = Array.isArray(mention?.possibleServiceIds)
          ? mention.possibleServiceIds.filter((id) => allowedIds.has(id))
          : [];
        if (
          Array.isArray(mention?.possibleServiceIds) &&
          ids.length !== mention.possibleServiceIds.length
        ) {
          errors.push("unknown_service_id_rejected");
        }
        return {
          originalText: String(mention?.originalText || ""),
          normalizedQuery: normalizeBotText(mention?.normalizedQuery || ""),
          possibleServiceIds: ids,
          confidence: Math.max(0, Math.min(1, Number(mention?.confidence || 0))),
        };
      })
    : fallback.serviceMentions;
  const parsedIntent = INTENTS.has(parsed.intent)
    ? parsed.intent
    : fallback.intent;
  const intent =
    parsedIntent === "unknown" && fallback.intent !== "unknown"
      ? fallback.intent
      : parsedIntent;
  if (intent !== parsed.intent) errors.push("invalid_intent");
  const parsedConfidence = Number(parsed.confidence);
  const confidence = Number.isFinite(parsedConfidence)
    ? Math.max(0, Math.min(1, parsedConfidence))
    : fallback.confidence;
  if (!Number.isFinite(parsedConfidence) && parsed !== fallback) {
    errors.push("invalid_confidence");
  }

  return {
    interpretation: {
      ...fallback,
      ...parsed,
      intent,
      confidence,
      serviceMentions,
      peopleCount: parsed.peopleCount || fallback.peopleCount,
      datePreference:
        parsed.datePreference || fallback.datePreference,
      timePreference:
        parsed.timePreference || fallback.timePreference,
      timeRange: parsed.timeRange || fallback.timeRange,
      staffPreference: ["specific", "any", "unknown"].includes(
        parsed.staffPreference?.type
      )
        ? parsed.staffPreference
        : fallback.staffPreference,
      numericReply: parsed.numericReply || fallback.numericReply,
      depositMentioned:
        parsed.depositMentioned === true || fallback.depositMentioned,
      needsHumanReview:
        parsed.needsHumanReview === true || fallback.needsHumanReview,
      humanReviewReason:
        parsed.humanReviewReason || fallback.humanReviewReason,
      requestedAction: null,
    },
    validationErrors: [...new Set(errors)],
  };
}

export function decideNextBotAction({ interpretation, state, serviceMentions }) {
  const numeric = interpretation.numericReply;
  if (numeric?.meaning === "menu_option") {
    return { type: "SELECT_MENU_OPTION", payload: numeric };
  }
  if (numeric?.meaning === "people_count") {
    return { type: "SET_PEOPLE_COUNT", payload: numeric };
  }
  if (numeric?.meaning === "hour" && numeric.ambiguousPeriod) {
    return { type: "CLARIFY_TIME_PERIOD", payload: numeric };
  }
  if (numeric?.meaning === "unknown") {
    return { type: "CLARIFY_MESSAGE", reason: numeric.reason };
  }
  if (
    state.pendingStep === "confirmation" &&
    interpretation.confirmationMentioned
  ) {
    return { type: "CONFIRM_APPOINTMENT_PREVIEW" };
  }
  if (interpretation.depositMentioned) {
    return { type: "VALIDATE_DEPOSIT" };
  }
  if (interpretation.needsHumanReview || serviceMentions.humanReviewReason) {
    return {
      type: "REQUEST_HUMAN_REVIEW",
      reason:
        interpretation.humanReviewReason ||
        serviceMentions.humanReviewReason,
    };
  }
  if (interpretation.confidence < 0.35) {
    return { type: "CLARIFY_MESSAGE", reason: "low_confidence" };
  }
  if (
    state.pendingStep === "service_detail" &&
    state.lastOfferedMenu?.type === "services" &&
    serviceMentions.candidates.length === 0
  ) {
    return {
      type: "CLARIFY_MESSAGE",
      reason: "service_selection_still_pending",
    };
  }
  if (interpretation.intent === "ask_price") {
    return serviceMentions.candidates.length > 0
      ? { type: "SHOW_SERVICE_PRICES" }
      : { type: "ASK_SERVICE_DETAIL" };
  }
  if (serviceMentions.ambiguityReason) {
    return {
      type: serviceMentions.candidates.length > 0
        ? "SHOW_SERVICE_OPTIONS"
        : "ASK_SERVICE_DETAIL",
      reason: serviceMentions.ambiguityReason,
    };
  }
  const services = uniqueServices([
    ...(state.selectedServices || []),
    ...(serviceMentions.resolvedServices || []),
  ]);
  if (interpretation.intent === "booking" && services.length === 0) {
    return { type: "ASK_SERVICE_DETAIL" };
  }
  if (
    interpretation.intent === "booking" &&
    !interpretation.datePreference &&
    !state.datePreference &&
    !state.parsedDate
  ) {
    return { type: "ASK_DATE" };
  }
  if (
    interpretation.intent === "booking" &&
    !interpretation.timeRange &&
    !state.timeRange
  ) {
    return { type: "ASK_TIME_RANGE" };
  }
  if (
    interpretation.intent === "booking" &&
    interpretation.staffPreference?.type === "unknown" &&
    state.staffPreference?.type === "unknown"
  ) {
    return { type: "ASK_STAFF_PREFERENCE" };
  }
  if (interpretation.intent === "booking" && services.length > 0) {
    return { type: "CHECK_AVAILABILITY" };
  }
  if (["location", "business_hours", "greeting", "ask_services"].includes(interpretation.intent)) {
    return { type: "ANSWER_INFORMATION" };
  }
  return { type: "CLARIFY_MESSAGE", reason: "low_confidence_or_unknown" };
}

export function processBotMessage({
  conversationId = null,
  customerMessage,
  currentState = {},
  context = {},
}) {
  const serviceCatalog = buildBotServiceCatalog(context.services || []);
  const state = normalizeConversationState(currentState, context);
  const catalogById = new Map(serviceCatalog.map((service) => [service.id, service]));
  state.selectedServices = uniqueServices(
    state.selectedServices
      .map((service) => catalogById.get(String(service?.id || service)))
      .filter(Boolean)
  );
  const serviceMentions = normalizeServiceMentions({
    customerMessage,
    serviceCatalog,
    currentState: state,
  });
  const fallback = fallbackInterpretation(
    customerMessage,
    serviceMentions,
    state,
    context.staff || []
  );
  const { interpretation, validationErrors } = validateBotInterpretation({
    rawInterpretation: context.interpretation,
    fallback,
    serviceCatalog,
  });
  if (context.interpretationError) {
    validationErrors.push("interpretation_provider_failed");
  }
  const action = decideNextBotAction({
    interpretation,
    state,
    serviceMentions,
  });
  if (!ACTIONS.has(action.type)) {
    throw new Error("Invalid bot action.");
  }

  const replacesService = includesAny(
    normalizeBotText(customerMessage),
    ["mejor quiero", "cambie de idea", "cambio por", "en lugar de"]
  );
  let selectedServices = uniqueServices([
    ...(replacesService ? [] : state.selectedServices),
    ...(serviceMentions.resolvedServices || []),
  ]);
  let participants = ensureParticipants(
    state.participants,
    interpretation.peopleCount || state.peopleCount,
    customerMessage
  );
  const participantAssignments = parseParticipantServiceAssignments({
    customerMessage,
    participants,
    serviceCatalog,
  });
  participants = participantAssignments.participants;

  if (
    action.type === "SELECT_MENU_OPTION" &&
    action.payload.menuType === "services"
  ) {
    const selected = catalogById.get(String(action.payload.option.id));
    if (selected) {
      selectedServices = uniqueServices([
        ...(replacesService ? [] : selectedServices),
        selected,
      ]);
      if (state.pendingParticipantId) {
        participants = participants.map((participant) =>
          participant.id === state.pendingParticipantId
            ? {
                ...participant,
                services: [{ id: selected.id, name: selected.name }],
                pendingServiceCandidates: [],
                assignmentComplete: true,
              }
            : participant
        );
      }
    }
  }
  const nextState = {
    ...state,
    intent: interpretation.intent,
    selectedServices,
    peopleCount: interpretation.peopleCount || state.peopleCount,
    datePreference: interpretation.datePreference || state.datePreference,
    timePreference: interpretation.timePreference || state.timePreference,
    timeRange: interpretation.timeRange || state.timeRange,
    staffPreference:
      interpretation.staffPreference?.type !== "unknown"
        ? interpretation.staffPreference
        : state.staffPreference,
    depositMentioned:
      state.depositMentioned || interpretation.depositMentioned,
    humanReviewRequired: action.type === "REQUEST_HUMAN_REVIEW",
    humanReviewReason:
      action.type === "REQUEST_HUMAN_REVIEW" ? action.reason : null,
    participants,
    pendingParticipantId:
      participantAssignments.pendingParticipantId ||
      (action.type === "SELECT_MENU_OPTION"
        ? null
        : state.pendingParticipantId),
    serviceRequests:
      serviceMentions.candidates.length > 0
        ? [
            ...(replacesService ? [] : state.serviceRequests || []),
            {
              originalText: serviceMentions.originalText,
              candidateServiceIds: serviceMentions.candidates.map(
                (service) => service.id
              ),
              resolvedServiceIds: serviceMentions.resolvedServices.map(
                (service) => service.id
              ),
            },
          ]
        : state.serviceRequests || [],
  };
  const contract = buildBotEngineContract({
    conversationId,
    action,
    interpretation,
    serviceMentions,
    serviceCatalog,
    state: nextState,
    customerMessage,
    validationErrors,
    context,
  });

  return {
    conversationId,
    interpretation,
    serviceCatalog,
    serviceMentions,
    action,
    state: contract.nextState,
    contract,
    validationErrors,
    debug: {
      previousPendingStep: state.pendingStep,
      intent: interpretation.intent,
      candidateServiceIds: serviceMentions.candidates.map((item) => item.id),
      action: action.type,
      humanReviewReason: nextState.humanReviewReason,
      delegatedAction: contract.legacyAction,
    },
  };
}

export function buildLastOfferedMenu({
  type,
  options = [],
  createdAt = new Date().toISOString(),
}) {
  return {
    type,
    options: options.map((option, index) => {
      const value = String(option.value || option.id || index + 1);
      const valueParts = type === "availability" ? value.split("|") : [];
      return {
        id: String(option.id || `${type}-${index + 1}`),
        label: String(option.label || option.name || option.staff_name || ""),
        value,
        metadata:
          type === "availability"
            ? {
                date: String(option.date || valueParts[1] || ""),
                startTime: String(option.start_time || valueParts[2] || ""),
                endTime: String(option.end_time || ""),
                staffId: String(option.staff_id || valueParts[0] || ""),
                staffName: String(option.staff_name || ""),
                serviceSegments: Array.isArray(option.service_segments)
                  ? option.service_segments.map((segment) => ({
                      serviceId: segment.service_id,
                      startTime: segment.start_time,
                      endTime: segment.end_time,
                      durationMinutes: Number(segment.duration_minutes || 0),
                      cleanupMinutes: Number(segment.cleanup_minutes || 0),
                      price: Number(segment.price || 0),
                    }))
                  : [],
              }
            : null,
      };
    }),
    createdAt,
  };
}

function listServiceOptions(services) {
  return services
    .map((service, index) => {
      const price =
        service.priceType === "fixed" && service.price !== null
          ? ` — $${service.price}`
          : "";
      return `${index + 1}. ${service.name}${price}`;
    })
    .join("\n");
}

function getPendingData(state) {
  const pending = [];
  if ((state.selectedServices || []).length === 0) pending.push("services");
  if (state.peopleCount > 1) {
    const incomplete = (state.participants || []).some(
      (participant) => !participant.assignmentComplete
    );
    if (incomplete) pending.push("participant_services");
  }
  if (!state.datePreference && !state.parsedDate) pending.push("date");
  if (!state.timeRange) pending.push("time");
  if (state.staffPreference?.type === "unknown") pending.push("staff");
  if (state.humanReviewRequired) pending.push("human_review");
  return pending;
}

function getNextBookingPrompt(state) {
  const pendingData = getPendingData(state);
  if (pendingData.includes("participant_services")) {
    return {
      response:
        "Necesito confirmar qué servicio corresponde a cada persona antes de continuar.",
      pendingStep: "service_detail",
    };
  }
  if (pendingData.includes("date")) {
    return {
      response: "¿Qué día te gustaría venir?",
      pendingStep: "date",
    };
  }
  if (pendingData.includes("time")) {
    return {
      response:
        "¿En qué horario te gustaría venir? Puedes indicar mañana, tarde o un rango.",
      pendingStep: "time",
    };
  }
  if (pendingData.includes("staff")) {
    return {
      response:
        "¿Tienes preferencia por alguna colaboradora o deseas reservar con cualquiera?",
      pendingStep: "staff",
    };
  }
  return { response: null, pendingStep: null };
}

function safeSelectedServices(services) {
  return (services || []).map((service) => ({
    id: service.id,
    name: service.name,
    category: service.category,
    price:
      service.priceType === "fixed" && service.price !== null
        ? service.price
        : null,
    priceType: service.priceType,
    bookingMode: service.bookingMode,
    durationMinutes: Number(service.durationMinutes || 0),
    cleanupMinutes: Number(service.cleanupMinutes || 0),
  }));
}

function safeParticipants(participants) {
  return (participants || []).map((participant) => ({
    id: participant.id,
    label: participant.label,
    services: (participant.services || []).map((service) => ({
      id: service.id,
      name: service.name,
    })),
    pendingServiceCandidates: [
      ...(participant.pendingServiceCandidates || []),
    ],
    assignmentComplete: participant.assignmentComplete === true,
  }));
}

function buildSimulationPreview(state) {
  const participantLines =
    state.peopleCount > 1
      ? (state.participants || []).map((participant) => {
          const names = (participant.services || [])
            .map((service) => service.name)
            .join(" + ");
          return `- ${participant.label}: ${names || "servicio pendiente"}`;
        })
      : [];
  const serviceLines =
    state.peopleCount > 1
      ? participantLines
      : (state.selectedServices || []).map((service) => {
          const price =
            service.priceType === "fixed" && service.price !== null
              ? ` — $${service.price}`
              : "";
          return `- ${service.name}${price}`;
        });
  const timeText =
    state.selectedAvailability?.label ||
    state.timePreference ||
    (state.timeRange
      ? `${state.timeRange.start || "inicio abierto"} a ${
          state.timeRange.end || "fin abierto"
        }`
      : "pendiente");
  const staffText =
    state.staffPreference?.type === "specific"
      ? state.staffPreference.staffName
      : state.staffPreference?.type === "any"
      ? "cualquiera"
      : "pendiente";
  const pending = getPendingData(state);

  return [
    "Vista previa de simulación",
    "",
    `Personas: ${state.peopleCount || 1}`,
    "Servicios:",
    ...(serviceLines.length > 0 ? serviceLines : ["- pendiente"]),
    `Fecha: ${state.parsedDate || state.datePreference || "pendiente"}`,
    `Horario: ${timeText}`,
    `Colaboradora: ${staffText}`,
    `Datos pendientes: ${pending.length > 0 ? pending.join(", ") : "ninguno"}`,
    `Revisión humana: ${
      state.humanReviewRequired
        ? state.humanReviewReason || "requerida"
        : "no requerida"
    }`,
    "Estado: simulación; no se creó ni reservó ninguna cita.",
  ].join("\n");
}

function getInformationDelegation(intent) {
  if (intent === "location") return "LEGACY_BUILD_LOCATION_RESPONSE";
  if (intent === "business_hours") {
    return "LEGACY_BUILD_BUSINESS_HOURS_RESPONSE";
  }
  return null;
}

function buildBotEngineContract({
  conversationId,
  action,
  interpretation,
  serviceMentions,
  serviceCatalog,
  state,
  customerMessage,
  validationErrors,
  context,
}) {
  const nextState = {
    ...state,
    selectedServices: [...(state.selectedServices || [])],
    participants: safeParticipants(state.participants),
  };
  let response = null;
  let delegateToLegacy = false;
  let legacyAction = null;
  let reason = action.reason || null;
  const query = normalizeBotText(customerMessage);

  if (action.type === "SHOW_SERVICE_OPTIONS") {
    const selectedIds = new Set(
      nextState.selectedServices.map((service) => service.id)
    );
    const options = serviceMentions.candidates.filter(
      (service) => !selectedIds.has(service.id)
    );
    const menuOptions = options.length > 0 ? options : serviceMentions.candidates;
    nextState.pendingStep = "service_detail";
    nextState.lastOfferedMenu = buildLastOfferedMenu({
      type: "services",
      options: menuOptions,
    });
    response = `Estas son las opciones disponibles:\n\n${listServiceOptions(
      menuOptions
    )}\n\nResponde con el número o nombre de la opción que prefieras.`;
  } else if (action.type === "SHOW_SERVICE_PRICES") {
    response = `Precios configurados actualmente:\n\n${listServiceOptions(
      serviceMentions.candidates
    )}`;
  } else if (action.type === "ASK_SERVICE_DETAIL") {
    nextState.pendingStep = "service_detail";
    nextState.lastOfferedMenu = null;
    response =
      nextState.peopleCount > 1
        ? "¿Qué servicio necesita cada persona? Puedes responder, por ejemplo: para mí gel y para mi acompañante pedicure."
        : action.reason === "nails_category_required"
        ? "¿Buscas trabajar sobre tu uña natural, aplicar extensiones o realizar manicure?"
        : "¿Qué servicio necesitas exactamente?";
  } else if (action.type === "SET_PEOPLE_COUNT") {
    nextState.peopleCount = action.payload.peopleCount;
    nextState.participants = createParticipants(
      action.payload.peopleCount,
      customerMessage
    );
    nextState.pendingStep = "service_detail";
    nextState.lastOfferedMenu = null;
    response =
      action.payload.peopleCount > 1
        ? `Serían ${action.payload.peopleCount} personas. ¿Qué servicio necesita cada una?`
        : "¿Qué servicio te gustaría agendar?";
  } else if (action.type === "CLARIFY_TIME_PERIOD") {
    nextState.pendingStep = "time";
    nextState.lastOfferedMenu = null;
    response = `¿Te refieres a las ${action.payload.hour}:00 de la mañana o de la tarde?`;
  } else if (action.type === "SELECT_MENU_OPTION") {
    nextState.lastOfferedMenu = null;
    if (action.payload.menuType === "availability") {
      nextState.selectedAvailability = action.payload.option;
      const metadata = action.payload.option.metadata || {};
      const participantId = nextState.participants?.[0]?.id || "person_1";
      const draft = prepareAppointmentDraft({
        existingDraft: nextState.appointmentDraft,
        conversationId,
        customer: context?.appointmentCustomer || {},
        participants:
          nextState.peopleCount > 1
            ? nextState.participants
            : [
                {
                  id: participantId,
                  label: nextState.participants?.[0]?.label || "clienta",
                  services: nextState.selectedServices,
                },
              ],
        services: nextState.selectedServices.map((service) => ({
          ...service,
          participantId,
        })),
        date: metadata.date || nextState.parsedDate || nextState.datePreference,
        startTime: metadata.startTime,
        endTime: metadata.endTime,
        staff: {
          id: metadata.staffId || nextState.staffPreference?.staffId,
          name:
            metadata.staffName ||
            nextState.staffPreference?.staffName ||
            action.payload.option.label,
          preference: nextState.staffPreference?.type,
        },
        expectedPrice: nextState.selectedServices.every(
          (service) => service.priceType === "fixed"
        )
          ? nextState.selectedServices.reduce(
              (sum, service) => sum + Number(service.price || 0),
              0
            )
          : null,
        depositStatus: nextState.depositMentioned
          ? "unknown"
          : "not_required",
        now: context?.now || new Date(),
      });
      nextState.appointmentDraft = draft;
      nextState.pendingStep =
        draft.status === "preview_shown" ? "confirmation" : "human_review";
      response =
        draft.status === "preview_shown"
          ? formatAppointmentPreview(draft)
          : buildSimulationPreview(nextState);
    } else {
      const prompt = getNextBookingPrompt(nextState);
      nextState.pendingStep = prompt.pendingStep;
      response = prompt.response;
      if (!response) {
        delegateToLegacy = true;
        legacyAction = "LEGACY_CHECK_AVAILABILITY";
      }
    }
  } else if (action.type === "ASK_DATE") {
    nextState.pendingStep = "date";
    nextState.lastOfferedMenu = null;
    response = "¿Qué día te gustaría venir?";
  } else if (action.type === "ASK_TIME_RANGE") {
    nextState.pendingStep = "time";
    nextState.lastOfferedMenu = null;
    response =
      "¿En qué horario te gustaría venir? Puedes indicar mañana, tarde o un rango.";
  } else if (action.type === "ASK_STAFF_PREFERENCE") {
    nextState.pendingStep = "staff";
    nextState.lastOfferedMenu = null;
    response =
      "¿Tienes preferencia por alguna colaboradora o deseas reservar con cualquiera?";
  } else if (action.type === "CHECK_AVAILABILITY") {
    if (
      nextState.peopleCount > 1 &&
      getPendingData(nextState).includes("participant_services")
    ) {
      nextState.pendingStep = "service_detail";
      response =
        "Antes de revisar horarios necesito confirmar qué servicio corresponde a cada persona.";
    } else if (nextState.peopleCount > 1) {
      nextState.pendingStep = "human_review";
      nextState.humanReviewRequired = true;
      nextState.humanReviewReason = "multiple_appointments_require_review";
      response =
        "Ya separé los servicios por persona. El equipo debe revisar los horarios de cada cita; no se creó ninguna cita.";
      reason = "multiple_appointments_require_review";
    } else {
      delegateToLegacy = true;
      legacyAction = "LEGACY_CHECK_AVAILABILITY";
    }
  } else if (action.type === "REQUEST_HUMAN_REVIEW") {
    nextState.pendingStep = "human_review";
    nextState.lastOfferedMenu = null;
    nextState.humanReviewRequired = true;
    nextState.humanReviewReason = action.reason;
    response =
      action.reason === "external_work_requires_review"
        ? "Como es un trabajo realizado en otro salón, el equipo necesita revisar el material y el estado actual antes de confirmar servicio, precio o disponibilidad."
        : action.reason === "hair_treatment_requires_assessment"
        ? "Ese tratamiento requiere valorar largo, volumen y condición del cabello antes de confirmar el precio."
        : "Necesitamos revisar los detalles del trabajo actual antes de confirmar servicio, precio o disponibilidad.";
  } else if (action.type === "VALIDATE_DEPOSIT") {
    nextState.pendingStep = "human_review";
    nextState.lastOfferedMenu = null;
    nextState.depositMentioned = true;
    nextState.humanReviewRequired = true;
    nextState.humanReviewReason = "deposit_requires_verification";
    response =
      "Gracias. El comprobante debe ser revisado por el equipo; el anticipo aún no está confirmado y no se creó ninguna cita.";
    reason = "deposit_requires_verification";
  } else if (action.type === "ANSWER_INFORMATION") {
    legacyAction = getInformationDelegation(interpretation.intent);
    if (legacyAction) {
      delegateToLegacy = true;
    } else if (interpretation.intent === "greeting") {
      response =
        "Hola, soy el asistente de Alexandra Ruiz Salón. Puedo ayudarte con servicios, precios y preparación de citas.";
    } else {
      const publicServices = serviceCatalog.filter(
        (service) => service.visibility === "public"
      );
      response = `Servicios disponibles:\n\n${publicServices
        .map((service) => `- ${service.name}`)
        .join("\n")}`;
      nextState.pendingStep = "service";
    }
  } else if (action.type === "PREPARE_APPOINTMENT_PREVIEW") {
    nextState.pendingStep = "confirmation";
    response = nextState.appointmentDraft
      ? formatAppointmentPreview(nextState.appointmentDraft)
      : buildSimulationPreview(nextState);
  } else if (action.type === "CONFIRM_APPOINTMENT_PREVIEW") {
    const confirmation = confirmAppointmentPreview({
      draft: nextState.appointmentDraft,
      pendingStep: state.pendingStep,
      previewId: nextState.appointmentDraft?.previewId,
      explicitConfirmation: true,
      now: context?.now || new Date(),
    });
    nextState.appointmentDraft = confirmation.draft;
    nextState.pendingStep = "confirmation";
    if (confirmation.ok) {
      delegateToLegacy = true;
      legacyAction = "LEGACY_RECHECK_APPOINTMENT_DRAFT";
      response = null;
      reason = confirmation.code;
    } else {
      response =
        confirmation.code === "preview_expired"
          ? "La vista previa venció. Necesito consultar nuevamente la disponibilidad."
          : "No pude confirmar esa vista previa. Revisemos nuevamente los datos.";
      reason = confirmation.code;
    }
  } else {
    const asksDuration =
      includesAny(query, ["cual dura mas", "cuanto dura", "duracion"]) &&
      nextState.lastOfferedMenu?.type === "services";
    if (asksDuration) {
      response =
        "No tengo una duración comparativa oficial configurada. Puedo conservar estas opciones mientras eliges, sin inventar ese dato.";
      nextState.pendingStep = "service_detail";
    } else if (action.reason === "service_selection_still_pending") {
      response =
        "Conservé los demás datos, pero todavía necesito que elijas una de las opciones de servicio vigentes.";
      nextState.pendingStep = "service_detail";
    } else {
      response =
        "No pude interpretar ese dato con seguridad. Dime brevemente si te refieres a un servicio, fecha, horario o colaboradora.";
      nextState.lastOfferedMenu =
        action.reason === "no_current_menu"
          ? null
          : nextState.lastOfferedMenu;
    }
  }

  if (legacyAction && !LEGACY_ACTIONS.has(legacyAction)) {
    throw new Error("Unauthorized legacy bot action.");
  }

  nextState.pendingData = getPendingData(nextState);
  const validatedData = {
    intent: interpretation.intent,
    selectedServices: safeSelectedServices(nextState.selectedServices),
    peopleCount: nextState.peopleCount,
    participants: safeParticipants(nextState.participants),
    datePreference: nextState.datePreference,
    parsedDate: nextState.parsedDate,
    timePreference: nextState.timePreference,
    timeRange: nextState.timeRange,
    staffPreference: nextState.staffPreference,
    pendingData: nextState.pendingData,
    menuSelection: interpretation.numericReply || null,
    depositMentioned: nextState.depositMentioned,
    serviceRequests: [...(nextState.serviceRequests || [])],
    appointmentDraft: nextState.appointmentDraft || null,
  };

  return {
    handled: !delegateToLegacy,
    action: action.type,
    response,
    nextState,
    validatedData,
    delegateToLegacy,
    legacyAction,
    reason,
    validationErrors: [...validationErrors],
  };
}

export async function executeBotTurn({
  conversationId = null,
  customerMessage,
  currentState = {},
  context = {},
  executors = {},
}) {
  const result = processBotMessage({
    conversationId,
    customerMessage,
    currentState,
    context,
  });
  const contract = result.contract;
  if (!contract.delegateToLegacy) return result;

  const executor = executors[contract.legacyAction];
  if (typeof executor !== "function") {
    const nextContract = {
      ...contract,
      handled: true,
      response:
        "No pude completar esa consulta de forma segura. Indica otro dato o solicita apoyo del equipo.",
      delegateToLegacy: false,
      legacyAction: null,
      reason: "authorized_executor_unavailable",
      validationErrors: [
        ...contract.validationErrors,
        "authorized_executor_unavailable",
      ],
    };
    return {
      ...result,
      state: nextContract.nextState,
      contract: nextContract,
    };
  }

  try {
    const execution = await executor(contract.validatedData);
    if (!execution || typeof execution.response !== "string") {
      throw new Error("Invalid delegated bot result.");
    }
    const nextState = {
      ...contract.nextState,
      parsedDate:
        execution.parsedDate || contract.nextState.parsedDate || null,
      datePreference:
        execution.parsedDate ||
        contract.nextState.datePreference ||
        null,
      appointmentDraft:
        execution.appointmentDraft ||
        contract.nextState.appointmentDraft ||
        null,
      orchestratorResult:
        execution.orchestratorResult ||
        contract.nextState.orchestratorResult ||
        null,
    };
    if (contract.legacyAction === "LEGACY_CHECK_AVAILABILITY") {
      const options = Array.isArray(execution.options)
        ? execution.options
        : [];
      nextState.pendingStep =
        options.length > 0 ? "availability" : "date";
      nextState.lastOfferedMenu =
        options.length > 0
          ? buildLastOfferedMenu({
              type: "availability",
              options,
            })
          : null;
      nextState.pendingData = getPendingData(nextState);
    } else if (
      contract.legacyAction === "LEGACY_RECHECK_APPOINTMENT_DRAFT"
    ) {
      const status = execution.orchestratorResult?.status;
      nextState.pendingStep =
        execution.orchestratorResult?.code === "availability_changed"
          ? "availability"
          : status === "human_review"
          ? "human_review"
          : "confirmation";
      nextState.pendingData = getPendingData(nextState);
    }
    const nextContract = {
      ...contract,
      handled: true,
      response: execution.response,
      nextState,
      delegateToLegacy: true,
      reason: execution.reason || contract.reason,
      execution: {
        legacyAction: contract.legacyAction,
        optionCount: Array.isArray(execution.options)
          ? execution.options.length
          : 0,
        options: Array.isArray(execution.options) ? execution.options : [],
        alternatives: execution.alternatives || [],
        orchestratorResult: execution.orchestratorResult || null,
      },
    };
    return {
      ...result,
      state: nextState,
      contract: nextContract,
    };
  } catch (error) {
    const nextContract = {
      ...contract,
      handled: true,
      response:
        "No pude completar esa consulta en este momento. Conservé tus datos para que puedas intentarlo de nuevo.",
      delegateToLegacy: false,
      legacyAction: null,
      reason: "authorized_executor_failed",
      validationErrors: [
        ...contract.validationErrors,
        "authorized_executor_failed",
      ],
    };
    return {
      ...result,
      state: nextContract.nextState,
      contract: nextContract,
    };
  }
}
