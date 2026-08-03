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

const BUSINESS_PROFILE = {
  name: "Alexandra Ruiz Salón",
  instagram: "@Alexandraruizsalon",
  mainServices: [
    "uñas manos y pies",
    "manicure",
    "pedicure",
    "pedicure medicado",
    "lifting de pestañas",
    "planchado y depilación de cejas",
    "extensiones de pestañas",
    "keratina",
    "botox capilar",
    "cirugía capilar",
  ],
};

const SENSITIVE_REQUEST_PATTERNS = [
  /\b(disponible|disponibilidad|horario|hora|espacio|agenda|agendar|cita|reservar|mañana|manana|hoy|sábado|sabado|fecha)\b/i,
  /\b(reagendar|mover|cambiar|cancelar|cancela)\b/i,
  /\b(pago|pagar|anticipo|deposito|depósito|transferencia|comprobante|tarjeta)\b/i,
];

const PRICE_PATTERNS = [
  /\b(precio|cuesta|costo|vale|sale|cuánto|cuanto)\b/i,
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
  "tardes",
  "vale",
]);

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

function buildControlledServiceAliases(service) {
  const name = normalizeText(service?.name);
  const category = normalizeText(service?.category);
  const group = normalizeText(service?.bot_service_group);
  const keywords = normalizeText(service?.bot_keywords);
  const text = `${name} ${category} ${group} ${keywords}`;
  const aliases = [
    service?.name,
    service?.category,
    ...splitAliases(service?.bot_keywords),
    ...splitAliases(service?.bot_service_group),
    ...splitAliases(service?.aliases),
  ];

  const mentionsGelSemi =
    text.includes("gelish") ||
    text.includes("gel semi") ||
    text.includes("semipermanente") ||
    text.includes("semi permanente");
  const isNaturalNail =
    text.includes("una natural") ||
    text.includes("uña natural") ||
    text.includes("servicios sobre una natural");

  if (mentionsGelSemi && isNaturalNail) {
    aliases.push(
      "gel en uña natural",
      "gel en una natural",
      "gel uña natural",
      "gel una natural",
      "gelish uña natural",
      "gelish una natural",
      "gel semipermanente uña natural",
      "gel semi permanente uña natural",
      "aplicación de gel uña natural",
      "aplicacion de gel una natural"
    );
  }

  return uniqueNormalizedList(aliases);
}

function normalizeServiceForDraftCatalog(service) {
  const price = Number(service?.base_price ?? service?.price ?? 0);

  return {
    id: cleanText(service?.id),
    name: cleanText(service?.name),
    category: cleanText(service?.category),
    price: Number.isFinite(price) ? price : null,
    active: service?.active !== false,
    bot_active: service?.bot_active !== false,
    aliases: buildControlledServiceAliases(service),
    searchText: serviceSearchText(service),
  };
}

function normalizeDraftServiceCatalog(services = []) {
  return safeArray(services)
    .map(normalizeServiceForDraftCatalog)
    .filter(
      (service) => service.name && service.active && service.bot_active
    );
}

function serviceSearchText(service) {
  return normalizeText(
    [
      service?.name,
      service?.category,
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

function serviceMatchesPriceQuery(service, normalizedMessage, tokens) {
  if (!service?.searchText) return false;

  const name = normalizeText(service.name);
  if (name && normalizedMessage.includes(name)) return true;

  if (
    service.aliases.some(
      (alias) =>
        normalizedMessage.includes(alias) ||
        (alias.length >= 8 && alias.includes(normalizedMessage))
    )
  ) {
    return true;
  }

  if (tokens.length === 0) return false;
  return tokens.every((word) => service.searchText.includes(word));
}

function findMentionedServices(message, services = []) {
  const normalized = normalizeText(message);
  if (!normalized) return [];
  const tokens = relevantPriceQueryTokens(message);
  const catalog = normalizeDraftServiceCatalog(services);

  return uniqueServicesByIdOrName(
    catalog.filter((service) =>
      serviceMatchesPriceQuery(service, normalized, tokens)
    )
  );
}

function resolvePriceQuestionService(message, services = []) {
  const matches = findMentionedServices(message, services);

  if (matches.length === 0) {
    return { status: "none", service: null, matches };
  }

  if (matches.length > 1) {
    return { status: "ambiguous", service: null, matches };
  }

  const service = matches[0];
  const formattedPrice = money(service.price);

  return formattedPrice
    ? { status: "unique", service, formattedPrice, matches }
    : { status: "invalid_price", service, matches };
}

function shouldRequireHumanReviewForMessage(message) {
  return SENSITIVE_REQUEST_PATTERNS.some((pattern) => pattern.test(message));
}

function isPriceQuestion(message) {
  return PRICE_PATTERNS.some((pattern) => pattern.test(message));
}

function buildFallbackDraft() {
  return {
    body:
      "Gracias por escribir a Alexandra Ruiz Salón. Podemos ayudarte con información sobre servicios, precios configurados y dudas generales. Si deseas agendar o revisar disponibilidad, una persona del equipo debe confirmarlo antes.",
    requiresHumanReview: true,
    reason: "general_review_required",
  };
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
  const body = cleanText(inboundMessage.body);
  const messageType = cleanText(inboundMessage.message_type || inboundMessage.messageType);

  if (messageType && messageType !== "text") {
    return {
      body:
        "Se recibió un mensaje no textual. Requiere revisión humana antes de responder.",
      requiresHumanReview: true,
      reason: "non_textual_message",
    };
  }

  if (!body) {
    return {
      body:
        "Se recibió un mensaje sin texto claro. Requiere revisión humana antes de responder.",
      requiresHumanReview: true,
      reason: "empty_text",
    };
  }

  if (shouldRequireHumanReviewForMessage(body)) {
    return {
      body:
        "Puedo sugerir apoyo, pero esta solicitud requiere revisión humana. No debo confirmar disponibilidad, horarios, citas, pagos ni cambios desde un borrador.",
      requiresHumanReview: true,
      reason: "sensitive_or_booking_request",
    };
  }

  if (isPriceQuestion(body)) {
    const priceMatch = resolvePriceQuestionService(body, services);

    if (priceMatch.status === "unique") {
      return {
        body: `El precio configurado de ${priceMatch.service.name} es ${priceMatch.formattedPrice}. Si necesitas revisar detalles o combinarlo con otro servicio, una persona del equipo puede confirmarlo antes de agendar.`,
        requiresHumanReview: false,
        reason: "configured_service_price",
      };
    }

    if (priceMatch.status === "ambiguous") {
      return {
        body:
          "Encontré más de un servicio que podría coincidir. Para darte el precio correcto necesito que una persona del equipo confirme el servicio exacto antes de responder.",
        requiresHumanReview: true,
        reason: "price_ambiguous_service",
      };
    }

    return {
      body:
        "Para darte un precio correcto necesito que una persona del equipo revise el servicio exacto. No debo inventar precios ni confirmar importes no configurados.",
      requiresHumanReview: true,
      reason: "price_requires_review",
    };
  }

  const normalized = normalizeText(body);
  const matchedFaq = safeArray(faqs).find((faq) => {
    const haystack = normalizeText([faq.question, faq.keywords].filter(Boolean).join(" "));
    return haystack && normalized.includes(haystack);
  });

  if (matchedFaq?.answer) {
    return {
      body: cleanText(matchedFaq.answer).slice(0, 900),
      requiresHumanReview: false,
      reason: "matched_faq",
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
    };
  }

  if (/\b(instagram|ig|redes)\b/i.test(body)) {
    return {
      body: `Claro. En Instagram nos encuentras como ${BUSINESS_PROFILE.instagram}.`,
      requiresHumanReview: false,
      reason: "instagram_info",
    };
  }

  if (/\b(servicios|hacen|ofrecen)\b/i.test(body)) {
    return {
      body: `${BUSINESS_PROFILE.name} ofrece servicios de ${BUSINESS_PROFILE.mainServices.join(", ")}. Para precios o disponibilidad específicos, el equipo debe revisar el servicio exacto antes de confirmar.`,
      requiresHumanReview: false,
      reason: "services_info",
    };
  }

  if (settings?.fallback_message) {
    return {
      body: cleanText(settings.fallback_message).slice(0, 900),
      requiresHumanReview: true,
      reason: "configured_fallback",
    };
  }

  return buildFallbackDraft();
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
