import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const aiEnabled = process.env.BOT_AI_ENABLED !== "false";
const AI_RULES_FALLBACK_MESSAGE =
  "IA no conectada. El bot está funcionando con reglas básicas.";
let openaiClient = null;

const SALON_TIME_ZONE = "America/Mexico_City";
const SALON_NAME = "Alexandra Ruiz Salón";
const STAFF_PRIORITY = ["laura canul", "tania mendez", "alexandra ruiz"];
const EXCLUDED_STAFF_FOR_BOT = ["junuen ruiz"];
const STAFF_LEAD_TIME_MINUTES = {
  "laura canul": 20,
  "tania mendez": 20,
  "alexandra ruiz": 60,
};
const LOCATION_ADDRESS_TEXT =
  "calle 44 #491, Los Pinos, cerca de Macroplaza";
const LOCATION_FALLBACK_URL =
  "https://www.google.com/maps/search/?api=1&query=Alexandra%20Ruiz%20Salon%20Calle%2044%20491%20Los%20Pinos%20Merida";

const BUSINESS_HOURS_MESSAGE = `Nuestro horario de atención es:

Martes a viernes: 9:00 am a 9:00 pm
Sábado: 9:00 am a 6:00 pm
Domingo: 9:00 am a 2:00 pm
Lunes: cerrado`;

function isOpenAIConfigured() {
  return Boolean(aiEnabled && openaiApiKey);
}

function isAutomaticBotDisabled(conversation) {
  return Boolean(
    conversation &&
      (conversation.bot_enabled === false ||
        conversation.handoff_to_human === true)
  );
}

function getOpenAIClient() {
  if (!isOpenAIConfigured()) return null;

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: openaiApiKey,
    });
  }

  return openaiClient;
}

function getReasoningEffortForModel(model) {
  const normalized = normalizeText(model);

  if (!normalized.startsWith("gpt-5") && !normalized.startsWith("o")) {
    return null;
  }

  if (normalized.includes("5.6") || normalized.includes("5.1")) {
    return "none";
  }

  return "low";
}

function extractOpenAIResponseText(response) {
  if (typeof response?.output_text === "string") {
    return response.output_text.trim();
  }

  return (response?.output || [])
    .flatMap((item) => item?.content || [])
    .map((content) => content?.text || content?.value || "")
    .join("")
    .trim();
}

async function createOpenAITextResponse({
  instructions,
  input,
  textFormat = { type: "text" },
  maxOutputTokens = 500,
  verbosity = "low",
}) {
  const client = getOpenAIClient();

  if (!client) return "";

  const payload = {
    model: openaiModel,
    instructions,
    input,
    max_output_tokens: maxOutputTokens,
    text: {
      format: textFormat,
      verbosity,
    },
    truncation: "auto",
  };

  const reasoningEffort = getReasoningEffortForModel(openaiModel);

  if (reasoningEffort) {
    payload.reasoning = { effort: reasoningEffort };
  }

  const response = await client.responses.create(payload);
  return extractOpenAIResponseText(response);
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function sanitizeBotReply(reply) {
  return String(reply || "")
    .replace(/Alexandra Ruiz Sal[oó]n Spa/gi, SALON_NAME)
    .replace(/Alexandra Ruiz Salon Spa/gi, "Alexandra Ruiz Salon")
    .replace(/Alexandra Ruiz Sal[oó]n\s+&\s+Spa/gi, SALON_NAME)
    .trim();
}

function getFirstName(name) {
  return String(name || "").trim().split(" ")[0] || "";
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function getSalonTodayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SALON_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function todayISO() {
  return getSalonTodayISO();
}

function isoToUTCDate(isoDate) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysISO(isoDate, days) {
  const date = isoToUTCDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getWeekdayFromISO(isoDate) {
  return isoToUTCDate(isoDate).getUTCDay();
}

function formatDate(dateString) {
  if (!dateString) return "";
  return isoToUTCDate(dateString).toLocaleDateString("es-MX", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function timeToMinutes(time) {
  if (!time) return null;
  const [hours, minutes] = String(time).slice(0, 5).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function formatTime12(time) {
  const minutes = typeof time === "number" ? time : timeToMinutes(time);
  if (minutes === null) return "";
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours24 >= 12 ? "pm" : "am";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

function getSalonNowMinutes() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SALON_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function overlaps(startA, endA, startB, endB) {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false;
  return aStart < bEnd && bStart < aEnd;
}

function parseRequestedDate(rawText) {
  const text = normalizeText(rawText);
  const today = todayISO();
  if (!text) return null;

  if (text.includes("pasado manana") || text.includes("pasado mañana")) return addDaysISO(today, 2);
  if (text.includes("hoy")) return today;
  if (text.includes("manana") || text.includes("mañana")) return addDaysISO(today, 1);

  const weekMatch = text.match(/(?:en|dentro de)\s+(\d+)\s+semana/);
  if (weekMatch) return addDaysISO(today, Number(weekMatch[1]) * 7);

  const dayMatch = text.match(/(?:en|dentro de)\s+(\d+)\s+d[ií]as?/);
  if (dayMatch) return addDaysISO(today, Number(dayMatch[1]));

  const isoMatch = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return isoMatch[0];

  const slashMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    const year = slashMatch[3]
      ? Number(String(slashMatch[3]).length === 2 ? `20${slashMatch[3]}` : slashMatch[3])
      : Number(today.slice(0, 4));
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const weekdays = [
    { keys: ["domingo"], day: 0 },
    { keys: ["lunes"], day: 1 },
    { keys: ["martes"], day: 2 },
    { keys: ["miercoles", "miércoles"], day: 3 },
    { keys: ["jueves"], day: 4 },
    { keys: ["viernes"], day: 5 },
    { keys: ["sabado", "sábado"], day: 6 },
  ];
  const found = weekdays.find((item) => item.keys.some((key) => text.includes(normalizeText(key))));
  if (found) {
    const currentDay = getWeekdayFromISO(today);
    let diff = found.day - currentDay;
    if (diff < 0) diff += 7;
    if (diff === 0 && (text.includes("proximo") || text.includes("proxima") || text.includes("próximo") || text.includes("próxima"))) diff = 7;
    return addDaysISO(today, diff);
  }

  return null;
}

function parseBirthday(rawText) {
  const text = normalizeText(rawText);
  if (!text || text.includes("omitir")) return null;

  const iso = parseRequestedDate(text);
  if (iso && /\d/.test(text)) return iso;

  const months = {
    enero: "01",
    febrero: "02",
    marzo: "03",
    abril: "04",
    mayo: "05",
    junio: "06",
    julio: "07",
    agosto: "08",
    septiembre: "09",
    setiembre: "09",
    octubre: "10",
    noviembre: "11",
    diciembre: "12",
  };

  const monthName = Object.keys(months).find((month) => text.includes(month));
  const dayMatch = text.match(/\b(\d{1,2})\b/);
  if (monthName && dayMatch) {
    const day = Number(dayMatch[1]);
    if (day >= 1 && day <= 31) return `2000-${months[monthName]}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

function parseExplicitTime(rawText) {
  const text = normalizeText(rawText);
  if (!text) return null;

  const match =
    text.match(/(?:a las|alas|para las|despues de las|después de las|desde las|a partir de las)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/) ||
    text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);

  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const suffix = match[3];

  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (!suffix && hour >= 1 && hour <= 8 && !text.includes("mañana") && !text.includes("manana")) hour += 12;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function parseTimePreference(rawText) {
  const text = normalizeText(rawText);
  const explicit = parseExplicitTime(text);
  if (text.includes("despues") || text.includes("después") || text.includes("desde") || text.includes("a partir")) {
    if (explicit !== null) return { mode: "after", minutes: explicit };
  }
  if (explicit !== null) return { mode: "around", minutes: explicit };
  if (text.includes("tarde") || text.includes("noche")) return { mode: "after", minutes: 15 * 60 };
  if (text.includes("temprano") || text.includes("mañana") || text.includes("manana")) return { mode: "early", minutes: null };
  return { mode: "any", minutes: null };
}

function asksLocation(text) {
  const t = normalizeText(text);
  return (
    t.includes("ubicacion") ||
    t.includes("direccion") ||
    t.includes("maps") ||
    t.includes("donde estan") ||
    t.includes("donde se ubican") ||
    t.includes("me pasas la ubicacion") ||
    t.includes("como llego") ||
    t.includes("llegar")
  );
}

function asksBusinessHours(text) {
  const t = normalizeText(text);
  return t.includes("horario") || t.includes("a que hora abren") || t.includes("a qué hora abren") || t.includes("a que hora cierran") || t.includes("a qué hora cierran");
}

function asksPaymentProof(text) {
  const t = normalizeText(text);
  return t.includes("ya pague") || t.includes("ya pagué") || t.includes("ya transferi") || t.includes("ya transferí") || t.includes("comprobante") || t.includes("anticipo enviado") || t.includes("te mande el pago") || t.includes("te mandé el pago");
}

function asksGreetingOrInfo(text) {
  const t = normalizeText(text);
  return (
    t === "hola" ||
    t === "buenas" ||
    t.includes("hola") ||
    t.includes("buenas") ||
    t.includes("informacion") ||
    t.includes("información")
  );
}

function asksPromotions(text) {
  const t = normalizeText(text);
  return (
    t.includes("promo") ||
    t.includes("promocion") ||
    t.includes("promoción") ||
    t.includes("descuento") ||
    t.includes("oferta")
  );
}

function asksHumanHelp(text) {
  const t = normalizeText(text);
  return (
    t.includes("persona") ||
    t.includes("humano") ||
    t.includes("asesor") ||
    t.includes("alguien") ||
    t.includes("equipo") ||
    t.includes("hablar con")
  );
}

function wantsExplanation(text) {
  const t = normalizeText(text);
  return (
    t.includes("incluye") ||
    t.includes("que trae") ||
    t.includes("trae") ||
    t.includes("es lo mismo") ||
    t.includes("diferencia") ||
    t.includes("cual es") ||
    t.includes("cual me conviene") ||
    t.includes("que es") ||
    t.includes("explica") ||
    t.includes("explicame") ||
    t.includes("recomiendas") ||
    t.includes("quita") ||
    t.includes("cuanto cuesta ese") ||
    /^ese\b/.test(t) ||
    t.includes("ese servicio")
  );
}

function findMentionedServiceForExplanation(message, options, services) {
  const text = normalizeText(message);
  const candidates = [...(options || []), ...(services || [])];
  const unique = Array.from(
    new Map(candidates.filter((service) => service?.id).map((service) => [service.id, service])).values()
  );

  const aliases = [
    { keys: ["acripie"], match: (service) => normalizeServiceText(service).includes("acripie") },
    { keys: ["medicado"], match: (service) => normalizeServiceText(service).includes("medicado") },
    { keys: ["en seco", "seco"], match: (service) => normalizeServiceText(service).includes("seco") },
    { keys: ["spa"], match: (service) => normalizeServiceText(service).includes("spa") },
    { keys: ["clasico", "clásico"], match: (service) => normalizeServiceText(service).includes("clasico") },
  ];

  for (const alias of aliases) {
    if (alias.keys.some((key) => text.includes(normalizeText(key)))) {
      const matches = unique.filter(alias.match);
      if (matches.length > 0) return matches[0];
    }
  }

  return unique.find((service) => {
    const name = normalizeText(service.name);
    return name && text.includes(name);
  });
}

function buildServiceExplanationReply(message, service) {
  const text = normalizeText(message);
  const serviceText = normalizeServiceText(service);
  const price = Number(service?.base_price || 0);

  if (serviceText.includes("acripie") || text.includes("acripie")) {
    return "Sí, el Acripie incluye pedicure en seco de cortesía porque es un servicio de uñas en pies. Lo que no incluye es un pedicure más profundo como Clásico, Spa o Medicado. Si deseas una limpieza más completa, hidratación o atención de molestias/uñeros, podemos agregar un pedicure más completo.\n\n¿Te gustaría que te ayude a elegir la mejor opción?";
  }

  if (serviceText.includes("medicado") || text.includes("medicado")) {
    return "El pedicure medicado requiere valoración. Es el servicio indicado cuando hay molestias, uñeros, uñas encarnadas leves o reconstrucción estética, según el caso.\n\n¿Quieres que te ayude a revisar si este servicio es el más adecuado?";
  }

  if (serviceText.includes("seco") || text.includes("en seco")) {
    return "El Pedicure en Seco es un servicio más express. No incluye retiro de uñeros profundos ni atención de uñas encarnadas. Si hay molestias, uñeros o uñas encarnadas, recomendamos valoración o pedicure medicado.\n\n¿Quieres que te ayude a elegir entre Pedicure en Seco y Pedicure Medicado?";
  }

  if (serviceText.includes("spa") || text.includes("spa")) {
    const includesGel = serviceText.includes("gel");
    return `El Pedicure Spa está enfocado en una experiencia más completa de cuidado e hidratación.${
      includesGel
        ? " Esta opción sí incluye gel."
        : " Si deseas gel, debes elegir la opción Pedicure Spa con Gel."
    }\n\n¿Quieres que te ayude a elegir la opción correcta?`;
  }

  if (service) {
    const description =
      service.bot_description ||
      service.description ||
      "Es un servicio disponible en el salón. Podemos ayudarte a confirmar qué incluye según lo que necesitas.";

    return `${description}${price > 0 ? `\n\nPrecio desde: $${price}.` : ""}\n\n¿Quieres que te ayude a elegir o agendar este servicio?`;
  }

  return "Claro. Para responderte con precisión, dime el nombre o el número del servicio sobre el que tienes duda. No lo seleccionaré hasta que me confirmes cuál deseas agendar.";
}

function isServiceQuestionMessage(message) {
  const text = normalizeText(message);

  if (!text) return false;

  return (
    text.includes("?") ||
    text.startsWith("hacen") ||
    text.includes(" hacen ") ||
    text.startsWith("manejan") ||
    text.includes(" manejan ") ||
    text.startsWith("tienen") ||
    text.includes(" tienen ") ||
    text.includes("tambien hacen") ||
    text.includes("también hacen") ||
    text.includes("cuanto cuesta") ||
    text.includes("cuánto cuesta") ||
    text.includes("precio") ||
    text.startsWith("y con ") ||
    text.includes(" con gel") ||
    wantsExplanation(text)
  );
}

function detectConversationTopicFromText(value) {
  const text = normalizeText(value);

  if (!text) return "";
  if (asksLocation(text)) return "ubicación";
  if (asksBusinessHours(text)) return "horarios";
  if (text.includes("pedicure") || text.includes("pedi") || text.includes("acripie")) return "pedicure";
  if (text.includes("escultural") || text.includes("extension") || text.includes("extensión") || text.includes("softgel")) return "extensiones";
  if (text.includes("acril")) return "acrílico";
  if (text.includes("manicure") || text.includes("mani")) return "manicure";
  if (text.includes("ceja") || text.includes("pestana") || text.includes("pestaña")) return "cejas/pestañas";
  if (text.includes("cabello") || text.includes("pelo")) return "cabello";
  if (text.includes("una") || text.includes("uña")) return "uñas";
  if (text.includes("cita") || text.includes("agendar") || text.includes("agenda")) return "agendar";

  return "";
}

function detectActiveConversationTopic(message, context, recentMessages) {
  const directTopic = detectConversationTopicFromText(message);
  if (directTopic) return directTopic;

  if (context?.active_topic) return context.active_topic;

  const recentTopic = [...(recentMessages || [])]
    .reverse()
    .map((item) => detectConversationTopicFromText(item.body))
    .find(Boolean);

  return recentTopic || "";
}

function getServicePriceText(service, fallbackPrice = null) {
  const price = Number(service?.base_price || 0) || fallbackPrice;
  return price ? `$${price}` : "te lo podemos cotizar con más detalle";
}

function getEsculturalesAcrylicPrice(services) {
  const esculturalService = (services || []).find((service) => {
    const text = normalizeServiceText(service);
    const price = Number(service?.base_price || 0);

    return (
      isServiceBookable(service) &&
      isHandsNailService(service) &&
      !isDesignOrExtraService(service) &&
      text.includes("escultural") &&
      text.includes("acril") &&
      price >= 300
    );
  });

  return Number(esculturalService?.base_price || 0) >= 300
    ? Number(esculturalService.base_price)
    : 410;
}

function findServiceByKeywords(services, requiredKeywords = [], optionalKeywords = []) {
  const required = requiredKeywords.map(normalizeText).filter(Boolean);
  const optional = optionalKeywords.map(normalizeText).filter(Boolean);

  return (services || []).find((service) => {
    const text = normalizeServiceText(service);
    const hasRequired = required.every((keyword) => text.includes(keyword));
    const hasOptional =
      optional.length === 0 || optional.some((keyword) => text.includes(keyword));

    return hasRequired && hasOptional;
  });
}

function buildContextualServiceInquiryReply({
  incomingMessage,
  context,
  recentMessages,
  services,
}) {
  if (!isServiceQuestionMessage(incomingMessage)) return null;

  const text = normalizeText(incomingMessage);
  const recentText = normalizeText(
    `${(recentMessages || []).map((item) => item.body || "").join(" ")} ${
      context?.active_service_focus || ""
    }`
  );
  const activeTopic = detectActiveConversationTopic(
    incomingMessage,
    context,
    recentMessages
  );

  if (text.includes("escultural") || recentText.includes("escultural")) {
    const priceText = `$${getEsculturalesAcrylicPrice(services)}`;

    if (text.includes("cuanto cuesta") || text.includes("cuánto cuesta") || text.includes("precio")) {
      return {
        reply: `Las esculturales de acrílico tienen costo de ${priceText} en largo base #2. El largo extra tiene costo adicional de +$50 y el diseño se cotiza según lo que elijas.\n\n¿Te gustaría agendarlas?`,
        topic: "extensiones",
        serviceFocus: "esculturales",
      };
    }

    return {
      reply: `Sí, manejamos uñas esculturales. Las esculturales de acrílico tienen costo de ${priceText} en largo base #2. Si deseas largo mayor o diseño, puede tener costo adicional.\n\n¿Te gustaría agendarlas?`,
      topic: "extensiones",
      serviceFocus: "esculturales",
    };
  }

  if (
    (text.includes("con gel") || text === "y con gel" || text.includes(" gel")) &&
    activeTopic === "pedicure"
  ) {
    const pedicureConGel =
      findServiceByKeywords(services, ["pedicure", "gel"], ["clasico"]) ||
      findServiceByKeywords(services, ["pedicure", "gel"]);
    const priceText = getServicePriceText(pedicureConGel);
    const priceLine =
      pedicureConGel && Number(pedicureConGel.base_price || 0) > 0
        ? ` Su precio es ${priceText}.`
        : "";

    return {
      reply: `Sí, también tenemos opciones de pedicure con gel.${priceLine} Si venías viendo Pedicure Clásico, puedes elegir la versión con gel para agregar color semipermanente.\n\n¿Quieres que te muestre las opciones de pedicure con gel o prefieres agendar una?`,
      topic: "pedicure",
      serviceFocus: "pedicure con gel",
    };
  }

  if (
    text.includes("tambien hacen unas") ||
    text.includes("también hacen uñas") ||
    text.includes("hacen unas") ||
    text.includes("hacen uñas") ||
    (text.includes("unas") && (text.includes("hacen") || text.includes("manejan")))
  ) {
    return {
      reply:
        "Sí, también manejamos servicios de uñas en manos: extensiones, rellenos/mantenimientos, gel sobre uña natural, rubber, baños de gel/acrílico/polygel y manicure.\n\n¿Qué te gustaría realizarte?",
      topic: "uñas",
      serviceFocus: "uñas",
    };
  }

  if (
    (text.includes("cuanto cuesta") || text.includes("cuánto cuesta") || text.includes("precio")) &&
    context?.active_service_focus
  ) {
    const matches = findMatches(context.active_service_focus, services, 170);
    const service = matches[0]?.service;

    if (service) {
      return {
        reply: `${service.name} tiene precio desde ${getServicePriceText(service)}. Puede variar si agregas diseño, largo, retiro o algún adicional.\n\n¿Te gustaría agendarlo o prefieres que te comparta opciones similares?`,
        topic: activeTopic || getServiceGroup(service),
        serviceFocus: context.active_service_focus,
      };
    }
  }

  return null;
}

function isDecorationService(service) {
  const text = normalizeServiceText(service);
  return text.includes("decor") || text.includes("diseno") || text.includes("diseño") || text.includes("frances") || text.includes("francés") || text.includes("ojo de gato") || text.includes("cristal") || text.includes("charm") || text.includes("sticker") || text.includes("mano alzada");
}

function hasAnyServiceText(service, keywords = []) {
  const text = normalizeServiceText(service);
  return keywords.some((keyword) => text.includes(normalizeText(keyword)));
}

function isHairService(service) {
  return hasAnyServiceText(service, [
    "cabello",
    "pelo",
    "capilar",
    "keratina",
    "botox",
    "cirugia capilar",
    "cirugía capilar",
    "nanoplastia",
    "pulgada",
    "pulgadas",
  ]);
}

function isFeetService(service) {
  return hasAnyServiceText(service, [
    "pedicure",
    "pedi",
    "pie",
    "pies",
    "acripie",
    "uña para pie",
    "una para pie",
    "uñas de los pies",
    "unas de los pies",
  ]);
}

function isBrowsOrLashesService(service) {
  return hasAnyServiceText(service, [
    "ceja",
    "cejas",
    "pestana",
    "pestaña",
    "pestanas",
    "pestañas",
  ]);
}

function isDesignOrExtraService(service) {
  const group = normalizeText(service?.bot_service_group);
  const category = normalizeText(service?.category);

  return (
    group === "decoracion" ||
    group === "extras" ||
    category.includes("extra") ||
    isDecorationService(service) ||
    hasAnyServiceText(service, ["adicional", "diseño", "diseno"])
  );
}

function isHandsNailService(service) {
  if (!service || isHairService(service) || isFeetService(service) || isBrowsOrLashesService(service) || isDesignOrExtraService(service)) {
    return false;
  }

  return hasAnyServiceText(service, [
    "mano",
    "manos",
    "uña",
    "una",
    "uñas",
    "unas",
    "manicure",
    "acril",
    "softgel",
    "polygel",
    "rubber",
    "vitacare",
    "gel semi",
    "gelish",
    "construccion",
    "construcción",
    "extension",
    "extensión",
    "escultural",
    "relleno",
    "mantenimiento",
  ]);
}

function isPedicureService(service) {
  if (!service || isHairService(service) || isBrowsOrLashesService(service) || isDesignOrExtraService(service)) {
    return false;
  }

  const group = normalizeText(service?.bot_service_group);
  return group === "pedicure" || isFeetService(service);
}

function isNaturalNailHandService(service) {
  if (!isHandsNailService(service)) return false;

  const group = normalizeText(service?.bot_service_group);
  const text = normalizeServiceText(service);

  if (text.includes("relleno") || text.includes("mantenimiento")) return false;
  if (text.includes("extension") || text.includes("extensión") || text.includes("softgel") || text.includes("escultural")) return false;

  return (
    group === "una_natural_refuerzo" ||
    text.includes("gel semi permanente manos") ||
    (text.includes("gel semi") && text.includes("manos")) ||
    text.includes("rubber") ||
    text.includes("vitacare") ||
    text.includes("baño en gel") ||
    text.includes("bano en gel") ||
    text.includes("baño acril") ||
    text.includes("bano acril") ||
    text.includes("gel de construccion") ||
    text.includes("gel de construcción") ||
    text.includes("baño polygel") ||
    text.includes("bano polygel") ||
    text.includes("polygel liquido") ||
    text.includes("polygel líquido")
  );
}

function isExtensionNailHandService(service) {
  if (!isHandsNailService(service)) return false;

  const group = normalizeText(service?.bot_service_group);
  const text = normalizeServiceText(service);

  if (text.includes("relleno") || text.includes("mantenimiento")) return false;

  return (
    group === "extension_unas" ||
    text.includes("extension") ||
    text.includes("extensión") ||
    text.includes("softgel") ||
    text.includes("escultural") ||
    text.includes("aplicacion acril") ||
    text.includes("aplicación acril") ||
    text.includes("polygel")
  );
}

function isFillMaintenanceNailHandService(service) {
  return (
    isHandsNailService(service) &&
    hasAnyServiceText(service, ["relleno", "mantenimiento"])
  );
}

function isManicureService(service) {
  return (
    isHandsNailService(service) &&
    hasAnyServiceText(service, ["manicure", "mani"]) &&
    !isPedicureService(service)
  );
}

function isServiceBookable(service) {
  if (service.bot_bookable === false) return false;
  const group = normalizeText(service.bot_service_group);
  const text = normalizeServiceText(service);
  if (["retiro", "decoracion", "pestanas", "extras"].includes(group)) return false;
  if (text.includes("retiro")) return false;
  if (isDesignOrExtraService(service)) return false;
  if (text.includes("uña para pie") || text.includes("una para pie") || text.includes("reconstruccion estetica de una para pie")) return false;
  return true;
}

function normalizeServiceText(service) {
  return normalizeText(`${service?.name || ""} ${service?.category || ""} ${service?.description || ""} ${service?.bot_keywords || ""} ${service?.bot_service_group || ""}`);
}

function getServiceGroup(service) {
  const group = normalizeText(service.bot_service_group);
  const text = normalizeServiceText(service);
  if (isPedicureService(service)) return "pedicure";
  if (isHairService(service)) return "cabello";
  if (isManicureService(service) || group === "manicure") return "manicure";
  if (isFillMaintenanceNailHandService(service) || group === "relleno_mantenimiento") return "rellenos / mantenimientos";
  if (isNaturalNailHandService(service)) return "uña natural / refuerzo";
  if (isExtensionNailHandService(service) || group === "extension_unas") return "extensiones de uñas";
  return "otros";
}

function serviceLine(service, index = null) {
  const price = Number(service.base_price || 0);
  const duration = Number(service.duration_minutes || 0);
  const prefix = index ? `${index}. ` : "• ";
  return `${prefix}${service.name}${price > 0 ? ` — $${price}` : ""}${duration > 0 ? ` · ${duration} min aprox.` : ""}`;
}

function buildServiceOptionsMessage(options, selectedServices = []) {
  const grouped = options.reduce((acc, service, index) => {
    const group = getServiceGroup(service);
    if (!acc[group]) acc[group] = [];
    acc[group].push({ service, number: index + 1 });
    return acc;
  }, {});

  const selectedText = selectedServices.length
    ? `Ya tengo seleccionado:\n${selectedServices.map((service) => `• ${service.name}`).join("\n")}\n\n`
    : "";

  const body = Object.entries(grouped)
    .map(([group, items]) => {
      const title = group.charAt(0).toUpperCase() + group.slice(1);
      return `${title}:\n${items.map(({ service, number }) => serviceLine(service, number)).join("\n")}`;
    })
    .join("\n\n");

  return `${selectedText}Claro 💕 Para agendarlo bien, ayúdame a elegir el servicio exacto:\n\n${body}\n\nPuedes responder con los números separados por coma, por ejemplo: 1, 4.\nTambién puedes escribir el nombre del servicio.`;
}
function buildNailClarifyingQuestion() {
  return `Claro 💕 Para ayudarte mejor, ¿qué buscas para tus uñas?\n\n1. Extensión nueva\n2. Relleno / mantenimiento\n3. Gel o refuerzo sobre tu uña natural\n4. Manicure\n\nResponde con el número o con la opción que prefieras.`;
}

function cleanServiceQuery(query) {
  return normalizeText(query)
    .replace(/\bhola\b/g, " ")
    .replace(/\bquiero\b/g, " ")
    .replace(/\bcita\b/g, " ")
    .replace(/\bagendar\b/g, " ")
    .replace(/\bservicio(s)?\b/g, " ")
    .replace(/\bpara\b/g, " ")
    .replace(/\bhacerme\b/g, " ")
    .replace(/\btambien\b/g, " ")
    .replace(/\btambién\b/g, " ")
    .replace(/\bagrega\b/g, " ")
    .replace(/\bpor\s*favor\b/g, " ")
    .replace(/\bporfa(vor)?\b/g, " ")
    .replace(/\blargo\s*#?\s*\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGeneralPedicureQuery(value) {
  const text = cleanServiceQuery(value);

  return text === "pedi" || text === "pedicure" || text === "pedicura";
}

function isGeneralPedicureRequest(value) {
  const text = cleanServiceQuery(value);

  if (!/(^|\s)(pedi|pedicure|pedicura)(\s|$)/.test(text)) return false;

  return ![
    "clasico",
    "spa",
    "medicado",
    "seco",
    "acripie",
    "uñero",
    "unero",
    "encarnada",
  ].some((keyword) => text.includes(keyword));
}

function isPedicureRequestedServiceQuery(value) {
  const text = normalizeText(value);

  return (
    text.includes("pedi") ||
    text.includes("pedicura") ||
    text.includes("acripie")
  );
}

function findExplicitServiceSelections(text, options) {
  if (isGeneralPedicureQuery(text)) return [];

  const raw = normalizeText(text);
  const clean = cleanServiceQuery(text);
  const exactMatches = [];
  const partialMatches = [];

  for (const service of options || []) {
    const name = normalizeText(service?.name);

    if (!name) continue;

    if (raw.includes(name) || clean === name) {
      exactMatches.push(service);
      continue;
    }

    if (clean.length >= 4 && name.includes(clean)) {
      partialMatches.push(service);
    }
  }

  if (exactMatches.length > 0) return exactMatches;
  if (partialMatches.length === 1) return partialMatches;

  return [];
}

function serviceScore(query, service) {
  if (!isServiceBookable(service)) return -999;

  const raw = normalizeText(query);
  const clean = cleanServiceQuery(query);
  const name = normalizeText(service.name);
  const full = normalizeServiceText(service);

  let score = 0;

  if (name && clean.includes(name)) score += 350;
  if (name && name.includes(clean) && clean.length >= 4) score += 180;

  const words = clean
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !["pero", "quiero", "cita"].includes(word));

  for (const word of words) {
    if (name.includes(word)) score += 100;
    else if (full.includes(word)) score += 50;
  }

  if (raw.includes("relleno") && full.includes("relleno")) score += 120;
  if (raw.includes("rubber") && full.includes("rubber")) score += 140;
  if ((raw.includes("pedi") || raw.includes("pedicure")) && getServiceGroup(service) === "pedicure") score += 140;
  if (raw.includes("acril") && full.includes("acril")) score += 130;
  if (raw.includes("escultural") && full.includes("escultural")) score += 150;
  if (raw.includes("softgel") && full.includes("softgel")) score += 170;
  if (raw.includes("polygel") && full.includes("polygel")) score += 150;
  if (raw.includes("gel construccion") && full.includes("construccion")) score += 150;

  if (!raw.includes("decor") && isDecorationService(service)) score -= 500;

  return score;
}

function findMatches(query, services, minimumScore = 150) {
  return services
    .map((service) => ({ service, score: serviceScore(query, service) }))
    .filter((item) => item.score >= minimumScore)
    .sort((a, b) => b.score - a.score);
}

function getRubberOptions(services) {
  return services.filter((service) => normalizeServiceText(service).includes("rubber"));
}

function getPedicureOptions(services) {
  return services.filter(isPedicureService);
}

function includesAnyKeyword(value, keywords = []) {
  const text = normalizeText(value);

  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    return normalizedKeyword && text.includes(normalizedKeyword);
  });
}
function getAcrylicOptions(services) {
  return services.filter(
    (service) => isHandsNailService(service) && normalizeServiceText(service).includes("acril")
  );
}

function getNailSubcategoryOptions(input, services) {
  const text = normalizeText(input);
  let group = "";

  if (
    text === "1" ||
    text.includes("extension") ||
    text.includes("extensión") ||
    text.includes("nueva") ||
    text.includes("largas")
  ) {
    group = "extensiones de uñas";
  }

  if (text === "2" || text.includes("relleno") || text.includes("mantenimiento")) {
    group = "rellenos / mantenimientos";
  }

  if (
    text === "3" ||
    text.includes("gel") ||
    text.includes("refuerzo") ||
    text.includes("natural") ||
    text.includes("rubber") ||
    text.includes("vitacare")
  ) {
    group = "uña natural / refuerzo";
  }

  if (text === "4" || text.includes("mani")) {
    group = "manicure";
  }

  if (!group) return [];

  const filters = {
    "extensiones de uñas": isExtensionNailHandService,
    "rellenos / mantenimientos": isFillMaintenanceNailHandService,
    "uña natural / refuerzo": isNaturalNailHandService,
    manicure: isManicureService,
  };

  return services.filter(filters[group] || (() => false)).slice(0, 14);
}

function isGeneralNailOnly(text) {
  const t = normalizeText(text);

  return (
    t === "uñas" ||
    t === "unas" ||
    t === "uña" ||
    t === "uñas en manos" ||
    t === "unas en manos" ||
    t === "uñas manos" ||
    t === "unas manos" ||
    t === "uñas de manos" ||
    t === "unas de manos" ||
    t === "manos" ||
    t === "quiero uñas" ||
    t === "quiero unas" ||
    t === "quiero uñas en manos" ||
    t === "quiero unas en manos" ||
    t === "extension" ||
    t === "extensión" ||
    t === "extensiones"
  );
}

function isPureNumberSelection(text) {
  return /^\s*\d+(\s*,\s*\d+)*\s*$/.test(String(text || ""));
}

function parseSelectionFromOptions(text, options) {
  if (isPureNumberSelection(text)) {
    const numbers = normalizeText(text).match(/\d+/g) || [];

    return numbers
      .map((num) => Number(num))
      .filter((num) => num >= 1 && num <= options.length)
      .map((num) => options[num - 1]);
  }

  const explicitMatches = findExplicitServiceSelections(text, options);

  if (explicitMatches.length > 0) return explicitMatches;

  const matches = findMatches(text, options, 220);
  const [best, second] = matches;

  if (best && (!second || best.score >= second.score + 120)) {
    return [best.service];
  }

  return [];
}

function resolveRequestedServices(serviceQueries, services) {
  const selected = [];
  const ambiguous = [];
  const unresolved = [];
  const seenSelected = new Set();
  const seenOptions = new Set();

  for (const rawQuery of serviceQueries || []) {
    const query = cleanServiceQuery(rawQuery);

    if (!query) continue;

    if (isGeneralNailOnly(query)) {
      unresolved.push("tipo_unas");
      continue;
    }

    let options = [];

    if (query === "rubber") {
      options = getRubberOptions(services);
    } else if (isGeneralPedicureQuery(query)) {
      options = getPedicureOptions(services);
    } else if (
      query === "unas acrilicas" ||
      query === "uñas acrilicas" ||
      query === "acrilicas" ||
      query === "acrílicas"
    ) {
      options = getAcrylicOptions(services);
    }

    if (options.length > 1) {
      for (const option of options) {
        if (!seenOptions.has(option.id)) {
          ambiguous.push(option);
          seenOptions.add(option.id);
        }
      }
      continue;
    }

    const matches = findMatches(query, services, 170);

    if (matches.length === 0) {
      unresolved.push(rawQuery);
      continue;
    }

    const best = matches[0];
    const second = matches[1];

    if (second && best.score < second.score + 100) {
      for (const item of matches.slice(0, 8)) {
        if (!seenOptions.has(item.service.id)) {
          ambiguous.push(item.service);
          seenOptions.add(item.service.id);
        }
      }
      continue;
    }

    if (!seenSelected.has(best.service.id)) {
      selected.push(best.service);
      seenSelected.add(best.service.id);
    }
  }

  return { selected, ambiguous, unresolved };
}

function mergeServices(existing, incoming) {
  const merged = [];
  const seen = new Set();

  for (const service of [...(existing || []), ...(incoming || [])]) {
    if (!service?.id || seen.has(service.id)) continue;
    seen.add(service.id);
    merged.push(service);
  }

  return merged;
}

function extractBookingNotes(message, aiNotes = "") {
  const notes = [];
  const largo = String(message || "").match(/largo\s*#?\s*(\d+)/i);

  if (largo) notes.push(`Solicita largo #${largo[1]}.`);
  if (aiNotes) notes.push(aiNotes);

  return notes.join(" ").trim();
}

function buildSelectedServicesMessage(services, notes = "") {
  const noteText = notes ? `\n\nNota: ${notes}` : "";

  return `Perfecto 💕 Revisamos disponibilidad para:\n\n${services
    .map((service) => `• ${service.name}`)
    .join(
      "\n"
    )}${noteText}\n\n¿Tienes técnica de preferencia?\n\n1. Laura Canul\n2. Tania Mendez\n3. Alexandra Ruiz\n4. La colaboradora disponible`;
}

function buildSelectedServicePricesMessage(services) {
  const lines = (services || [])
    .map((service) => {
      const price = Number(service.base_price || service.price || 0);
      return `• ${service.name}${price > 0 ? `: $${price}` : ": te ayudamos a cotizarlo con más detalles"}`;
    })
    .join("\n");

  return `Claro 💕 Sobre el servicio que estábamos revisando:\n\n${lines}\n\nEl precio puede variar si agregas diseño, largo, retiro o algún adicional.`;
}

function detectStaffPreference(text, staff) {
  const t = normalizeText(text);

  if (!t) return null;

  if (
    t.includes("disponible") ||
    t.includes("cualquiera") ||
    t.includes("cualquier") ||
    t.includes("chica") ||
    t.includes("colaboradora") ||
    t.includes("quien sea") ||
    t.includes("sin preferencia") ||
    t.includes("primera vez") ||
    t === "4"
  ) {
    return {
      mode: "available_priority",
      staffId: null,
      staffName: "la colaboradora disponible",
    };
  }

  const aliasMap = [
    { keys: ["tania", "tania mendez", "tanía"], name: "tania mendez" },
    { keys: ["laura", "laura canul"], name: "laura canul" },
    { keys: ["ale", "alexandra", "alexandra ruiz"], name: "alexandra ruiz" },
  ];

  for (const alias of aliasMap) {
    if (alias.keys.some((key) => t.includes(normalizeText(key)))) {
      const found = staff.find((person) =>
        normalizeText(person.full_name).includes(alias.name)
      );

      if (found) {
        return {
          mode: "specific",
          staffId: found.id,
          staffName: found.full_name,
        };
      }
    }
  }

  if (t === "1") {
    const found = staff.find((person) =>
      normalizeText(person.full_name).includes("laura canul")
    );

    if (found) {
      return {
        mode: "specific",
        staffId: found.id,
        staffName: found.full_name,
      };
    }
  }

  if (t === "2") {
    const found = staff.find((person) =>
      normalizeText(person.full_name).includes("tania mendez")
    );

    if (found) {
      return {
        mode: "specific",
        staffId: found.id,
        staffName: found.full_name,
      };
    }
  }

  if (t === "3") {
    const found = staff.find((person) =>
      normalizeText(person.full_name).includes("alexandra ruiz")
    );

    if (found) {
      return {
        mode: "specific",
        staffId: found.id,
        staffName: found.full_name,
      };
    }
  }

  return null;
}
function sortStaffByPriority(staff, mode, preferredStaffId) {
  const cleanStaff = (staff || []).filter((person) => {
    const name = normalizeText(person.full_name);
    return !EXCLUDED_STAFF_FOR_BOT.some((excluded) => name.includes(excluded));
  });

  if (mode === "specific" && preferredStaffId) {
    return cleanStaff.filter((person) => person.id === preferredStaffId);
  }

  return [...cleanStaff].sort((a, b) => {
    const aName = normalizeText(a.full_name);
    const bName = normalizeText(b.full_name);

    const aIndex = STAFF_PRIORITY.findIndex((name) => aName.includes(name));
    const bIndex = STAFF_PRIORITY.findIndex((name) => bName.includes(name));

    const safeA = aIndex === -1 ? 999 : aIndex;
    const safeB = bIndex === -1 ? 999 : bIndex;

    return safeA - safeB;
  });
}

function getLeadTimeForStaff(person) {
  const name = normalizeText(person.full_name);

  const match = Object.entries(STAFF_LEAD_TIME_MINUTES).find(([staffName]) =>
    name.includes(staffName)
  );

  return match ? match[1] : 20;
}

function getTotalDuration(services) {
  return (services || []).reduce((total, service) => {
    const duration = Number(service.duration_minutes || 0);
    const cleanup = Number(service.cleanup_minutes || 0);
    return total + (duration || 60) + cleanup;
  }, 0);
}

function getEstimatedTotal(services) {
  return (services || []).reduce((total, service) => {
    return total + Number(service.base_price || 0);
  }, 0);
}

function getScheduleForStaff(staffSchedules, staffId, dateString) {
  const dayOfWeek = getWeekdayFromISO(dateString);

  const schedule = (staffSchedules || []).find(
    (item) =>
      item.staff_id === staffId &&
      Number(item.day_of_week) === Number(dayOfWeek) &&
      item.is_active !== false &&
      item.is_day_off !== true
  );

  return schedule || null;
}

function buildSlotsMessage(slots, selectedServices, dateString, preferredStaffName = "") {
  const servicesText = selectedServices.map((service) => service.name).join(" + ");

  if (!slots || slots.length === 0) {
    const staffText = preferredStaffName ? ` con ${preferredStaffName}` : "";

    return `Por el momento no encontré espacios disponibles para ${servicesText}${staffText} el ${formatDate(
      dateString
    )}. 💕 Puedes decirme otro día, otro horario o elegir la colaboradora disponible para revisar más opciones.`;
  }

  const optionsText = slots
    .map(
      (slot, index) =>
        `${index + 1}. ${formatTime12(slot.start_time)} con ${slot.staff_name}`
    )
    .join("\n");

  return `Tengo estos espacios disponibles para ${servicesText} el ${formatDate(
    dateString
  )}:\n\n${optionsText}\n\nResponde con el número de la opción que prefieras.`;
}

function buildAppointmentSummary({ services, slot, depositAmount, notes }) {
  const servicesText = services.map((service) => `• ${service.name}`).join("\n");
  const notesText = notes ? `\n\nNota: ${notes}` : "";

  return `Perfecto 💕 Tengo estos datos para tu cita:\n\nServicios:\n${servicesText}${notesText}\n\nFecha: ${formatDate(
    slot.date
  )}\nHora: ${formatTime12(slot.start_time)}\nColaboradora: ${
    slot.staff_name
  }\n\nPara confirmar tu cita solicitamos anticipo de $100 por servicio.\nAnticipo requerido: $${depositAmount}.\nEse anticipo se descuenta del total a pagar el día de tu cita.`;
}

function mediaText(asset, fallback = "") {
  if (!asset || asset.active === false) return fallback;

  const urlText = asset.media_url
    ? `\n${asset.media_type === "link" ? "🔗" : "🖼️"} ${asset.media_url}`
    : "\n🖼️ Imagen pendiente de configurar en Multimedia del bot.";

  return `${asset.message || asset.title}${urlText}`;
}

function getAssetByKey(mediaAssets, key) {
  return (mediaAssets || []).find(
    (asset) => asset.asset_key === key && asset.active !== false
  );
}

function extractFirstUrl(value) {
  const match = String(value || "").match(/https?:\/\/[^\s<>"')]+/i);
  return match ? match[0].replace(/[.,;!?]+$/, "") : "";
}

function hasLocationKeywords(value) {
  const text = normalizeText(value);

  return (
    text.includes("ubicacion") ||
    text.includes("direccion") ||
    text.includes("maps") ||
    text.includes("google") ||
    text.includes("calle 44") ||
    text.includes("los pinos") ||
    text.includes("macroplaza") ||
    text.includes("como llegar")
  );
}

function getConfiguredLocationUrl({ settings, faqs, knowledgeItems, mediaAssets }) {
  const settingKeys = [
    "location_url",
    "location_link",
    "google_maps_url",
    "google_maps_link",
    "maps_url",
    "maps_link",
    "ubicacion_url",
    "ubicacion_link",
    "direccion_url",
    "address_url",
  ];

  for (const key of settingKeys) {
    const url = extractFirstUrl(settings?.[key]);
    if (url) return url;
  }

  const configuredKnowledge = [
    ...(faqs || []).map((item) => ({
      active: item.active,
      text: `${item.question || ""} ${item.answer || ""} ${item.keywords || ""}`,
    })),
    ...(knowledgeItems || []).map((item) => ({
      active: item.active,
      text: `${item.title || ""} ${item.category || ""} ${item.content || ""} ${item.keywords || ""}`,
    })),
  ];

  for (const item of configuredKnowledge) {
    if (item.active === false || !hasLocationKeywords(item.text)) continue;

    const url = extractFirstUrl(item.text);
    if (url) return url;
  }

  const locationAsset = getAssetByKey(mediaAssets, "ubicacion_maps");
  const assetUrl =
    extractFirstUrl(locationAsset?.media_url) ||
    extractFirstUrl(locationAsset?.message) ||
    extractFirstUrl(locationAsset?.title);

  return assetUrl || LOCATION_FALLBACK_URL;
}

function buildLocationResponse({
  settings,
  faqs,
  knowledgeItems,
  mediaAssets,
  isFirstMessage,
}) {
  const locationUrl = getConfiguredLocationUrl({
    settings,
    faqs,
    knowledgeItems,
    mediaAssets,
  });

  if (isFirstMessage) {
    return `¡Hola! Claro 💕 Nos encontramos en ${SALON_NAME}, en ${LOCATION_ADDRESS_TEXT}.

Te comparto también nuestra ubicación para que puedas orientarte mejor:
${locationUrl}

¿Te gustaría que también te comparta horarios o disponibilidad para agendar?`;
  }

  return `Claro 💕 Nos encontramos en ${LOCATION_ADDRESS_TEXT}.

Te comparto nuestra ubicación para que puedas orientarte mejor:
${locationUrl}`;
}

function isFirstConversationMessage(conversation, recentMessages) {
  return !conversation?.id || ((recentMessages || []).length === 0 && !conversation?.last_message_at);
}

function buildMenuResponse(settings, menuOptions) {
  const welcome =
    settings?.welcome_message ||
    `Hola 💕 Bienvenida/o a ${SALON_NAME}. Soy el asistente virtual del salón, ¿en qué puedo ayudarte?`;

  const welcomeAlreadyHasMenu =
    welcome.includes("1.") && welcome.includes("2.") && welcome.includes("3.");

  if (welcomeAlreadyHasMenu) return welcome;

  const activeOptions = (menuOptions || [])
    .filter((item) => item.active !== false)
    .sort((a, b) => Number(a.option_order || 0) - Number(b.option_order || 0));

  if (activeOptions.length === 0) {
    return `${welcome}\n\n1. Agendar cita\n2. Ver servicios / precios\n3. Promociones\n4. Ubicación\n5. Horarios\n6. Hablar con una persona`;
  }

  const optionsText = activeOptions
    .map((item) => `${item.option_order}. ${item.option_label}`)
    .join("\n");

  return `${welcome}\n\n${optionsText}`;
}

function buildServicesCatalogResponse(services) {
  const categories = [
    { label: "Uñas", filter: isHandsNailService },
    { label: "Manicure", filter: isManicureService },
    { label: "Pedicure", filter: isPedicureService },
    { label: "Cejas y pestañas", filter: isBrowsOrLashesService },
    { label: "Cabello", filter: isHairService },
  ];

  const lines = categories.map((category) => {
    const matches = (services || [])
      .filter(category.filter)
      .slice(0, 5);

    if (matches.length === 0) {
      return `• ${category.label}: podemos ayudarte a cotizar si nos das más detalles.`;
    }

    return `• ${category.label}:\n${matches.map((service) => `  - ${serviceLine(service)}`).join("\n")}`;
  });

  return `Claro 💕 Estas son las categorías principales:\n\n${lines.join(
    "\n\n"
  )}\n\nSi no ves el precio exacto, dime qué tienes en mente y te ayudo a cotizarlo.`;
}

function buildPromotionsResponse(settings, knowledgeItems, menuOptions, mediaAssets) {
  const configured =
    settings?.promotions_message ||
    settings?.promotion_message ||
    settings?.promociones_message ||
    "";

  if (configured) return configured;

  const promoAsset = getAssetByKey(mediaAssets, "promociones");
  if (promoAsset) return mediaText(promoAsset);

  const promoKnowledge = (knowledgeItems || []).find((item) => {
    const text = normalizeText(`${item.title || ""} ${item.category || ""} ${item.keywords || ""}`);
    return item.active !== false && (text.includes("promo") || text.includes("descuento") || text.includes("oferta"));
  });

  if (promoKnowledge?.content) return promoKnowledge.content;

  const promoMenu = (menuOptions || []).find((item) => {
    const text = normalizeText(`${item.option_key || ""} ${item.option_label || ""}`);
    return item.active !== false && (text.includes("promo") || text.includes("descuento") || text.includes("oferta"));
  });

  if (promoMenu?.response_message) return promoMenu.response_message;

  return "Por ahora no tengo promociones activas configuradas 💕 Puedo ayudarte a revisar servicios, precios o disponibilidad para agendar.";
}

function getDefaultKnowledgeItems() {
  return [
    {
      title: "Esmalte tradicional y gel",
      category: "Servicios",
      content:
        "No usamos esmalte tradicional; trabajamos con gel para lograr mejor duración y acabado.",
      keywords: "esmalte normal, esmalte tradicional, gel, gelish",
      active: true,
    },
    {
      title: "Pedicure en seco y uñeros",
      category: "Pedicure",
      content:
        "Los servicios en seco son más express y no incluyen retiro de uñeros profundos ni atención de uñas encarnadas. Para molestias, uñeros o uñas encarnadas se recomienda valoración o pedicure medicado.",
      keywords: "pedicure en seco, uñeros, uneros, uñas encarnadas, encarnadas, pedicure medicado",
      active: true,
    },
    {
      title: "Cortesía en servicios de uñas",
      category: "Servicios",
      content:
        "Todos los servicios de uñas incluyen manicure en seco o pedicure en seco de cortesía según corresponda, excepto aplicación de gel semipermanente/Gelish. Acripie incluye pedicure en seco de cortesía, pero no sustituye un pedicure clásico, spa o medicado.",
      keywords: "manicure en seco, pedicure en seco, cortesia, gelish, gel semipermanente, acripie incluye pedicure",
      active: true,
    },
    {
      title: "Acripie",
      category: "Pedicure",
      content:
        "Acripie incluye pedicure en seco de cortesía porque es un servicio de uñas en pies. No incluye un pedicure más profundo como Pedicure Clásico, Pedicure Spa o Pedicure Medicado. Si la clienta desea limpieza más completa, hidratación profunda, atención de molestias, uñeros o un servicio más relajante, se puede ofrecer agregar un pedicure más completo.",
      keywords: "acripie, incluye pedi, incluye pedicure, pedicure en seco de cortesia, reconstrucción estética, uñas de los pies",
      active: true,
    },
    {
      title: "Pedicure medicado",
      category: "Pedicure",
      content:
        "El pedicure medicado requiere valoración. Es el servicio indicado cuando hay molestias, uñeros, uñas encarnadas leves o reconstrucción estética, según el caso.",
      keywords: "pedicure medicado, medicado, uñeros, uñas encarnadas, reconstrucción estética",
      active: true,
    },
    {
      title: "Uñas encarnadas",
      category: "Pedicure",
      content:
        "Las uñas encarnadas requieren valoración. El equipo puede revisar el caso en cita y canalizar al servicio adecuado, como pedicure medicado si aplica.",
      keywords: "uñas encarnadas, unas encarnadas, uñeros, uneros, valoración, pedicure medicado",
      active: true,
    },
    {
      title: "Rellenos de acrílico",
      category: "Uñas",
      content:
        "El relleno de acrílico suele hacerse aproximadamente cada 3 semanas. Después de 2 rellenos posteriores a una aplicación, recomendamos retiro y nueva aplicación para cuidar la estructura.",
      keywords: "relleno acrílico, relleno acrilico, cada cuanto, retiro, nueva aplicación",
      active: true,
    },
    {
      title: "Servicios de cejas",
      category: "Cejas y pestañas",
      content:
        "Sí, puedes agregar servicios de cejas a tu cita si hay disponibilidad. Podemos revisar horarios junto con tus otros servicios.",
      keywords: "cejas, diseño de cejas, depilación, agregar cejas",
      active: true,
    },
    {
      title: "Valoración profesional",
      category: "General",
      content:
        "Cuando el caso requiere valoración, podemos revisarlo en cita o pasarlo con una persona del equipo para orientarte mejor.",
      keywords: "valoración, valoracion, revisar, caso especial, duda",
      active: true,
    },
  ].map((item) => ({ ...item, _default_bot_knowledge: true }));
}

function tokenizeText(value) {
  return normalizeText(value)
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(
      (word) =>
        word.length >= 4 &&
        ![
          "para",
          "como",
          "este",
          "esta",
          "esos",
          "esas",
          "tienen",
          "quiero",
          "puedo",
          "puede",
          "incluye",
        ].includes(word)
    );
}

function scoreKnowledgeText(searchText, itemText, keywords = "") {
  const normalizedSearch = normalizeText(searchText);
  const normalizedItem = normalizeText(itemText);
  const normalizedKeywords = normalizeText(keywords);
  const words = tokenizeText(normalizedSearch);

  let score = 0;

  if (
    (normalizedItem.includes("acripie") || normalizedKeywords.includes("acripie")) &&
    !normalizedSearch.includes("acripie")
  ) {
    return 0;
  }

  for (const word of words) {
    if (normalizedKeywords.includes(word)) score += 8;
    if (normalizedItem.includes(word)) score += 5;
  }

  if (normalizedSearch.includes("unero") || normalizedSearch.includes("uneros")) {
    if (normalizedItem.includes("unero") || normalizedItem.includes("uneros")) score += 30;
  }

  if (normalizedSearch.includes("encarnad")) {
    if (normalizedItem.includes("encarnad") || normalizedItem.includes("medicado")) score += 30;
  }

  if (normalizedSearch.includes("esmalte")) {
    if (normalizedItem.includes("esmalte") || normalizedItem.includes("gel")) score += 30;
  }

  if (normalizedSearch.includes("relleno") || normalizedSearch.includes("retiro")) {
    if (normalizedItem.includes("relleno") || normalizedItem.includes("retiro")) score += 20;
  }

  if (normalizedSearch.includes("acril")) {
    if (normalizedItem.includes("acril")) score += 25;
  }

  if (normalizedSearch.includes("pedicure") || normalizedSearch.includes("pedi")) {
    if (normalizedItem.includes("pedicure") || normalizedItem.includes("pedi")) score += 20;
  }

  if (asksLocation(normalizedSearch)) {
    if (hasLocationKeywords(`${normalizedItem} ${normalizedKeywords}`)) score += 45;
  }

  if (asksBusinessHours(normalizedSearch)) {
    if (
      normalizedItem.includes("horario") ||
      normalizedKeywords.includes("horario") ||
      normalizedItem.includes("abren") ||
      normalizedItem.includes("cierran")
    ) {
      score += 40;
    }
  }

  if (asksPromotions(normalizedSearch)) {
    if (
      normalizedItem.includes("promo") ||
      normalizedKeywords.includes("promo") ||
      normalizedItem.includes("descuento") ||
      normalizedItem.includes("oferta")
    ) {
      score += 40;
    }
  }

  if (normalizedSearch.includes("servicio") || normalizedSearch.includes("precio")) {
    if (
      normalizedItem.includes("servicio") ||
      normalizedKeywords.includes("servicio") ||
      normalizedItem.includes("precio") ||
      normalizedKeywords.includes("precio")
    ) {
      score += 20;
    }
  }

  return score;
}

function formatRecentMessagesForSearch(messages) {
  return (messages || [])
    .slice(-6)
    .map((message) => `${message.direction || ""}: ${message.body || ""}`)
    .join("\n");
}

function isContextFollowUp(message) {
  const text = normalizeText(message);
  return (
    text.includes("ese") ||
    text.includes("esa") ||
    text.includes("eso") ||
    text.includes("este") ||
    text.includes("esta") ||
    text.includes("tambien") ||
    text.includes("también") ||
    text.startsWith("y ") ||
    text.startsWith("¿y ") ||
    text.includes("cuanto cuesta") ||
    text.includes("cuánto cuesta")
  );
}

function findBestKnowledgeAnswer({ incomingMessage, recentMessages, faqs, knowledgeItems }) {
  const recentText = formatRecentMessagesForSearch(recentMessages);
  const searchText = isContextFollowUp(incomingMessage)
    ? `${recentText}\n${incomingMessage}`
    : incomingMessage;

  const faqCandidates = (faqs || [])
    .filter((faq) => faq.active !== false)
    .map((faq) => ({
      type: "faq",
      title: faq.question,
      content: faq.answer,
      isConfigured: true,
      score: scoreKnowledgeText(
        searchText,
        `${faq.question || ""} ${faq.answer || ""}`,
        faq.keywords || ""
      ),
    }));

  const knowledgeCandidates = (knowledgeItems || [])
    .filter((item) => item.active !== false)
    .map((item) => ({
      type: "knowledge_base",
      title: item.title,
      content: item.content,
      isConfigured: !item._default_bot_knowledge,
      score: scoreKnowledgeText(
        searchText,
        `${item.title || ""} ${item.category || ""} ${item.content || ""}`,
        item.keywords || ""
      ),
    }));

  const best = [...faqCandidates, ...knowledgeCandidates].sort(
    (a, b) =>
      b.score - a.score ||
      Number(Boolean(b.isConfigured)) - Number(Boolean(a.isConfigured))
  )[0];

  return best && best.score >= 18 ? best : null;
}

function shouldUseKnowledgeBeforeFixed({ incomingMessage, ai }) {
  const text = normalizeText(incomingMessage);

  if (!text || isPureNumberSelection(text)) return false;
  if (asksPaymentProof(text) || ai.says_paid) return false;
  if (asksNearestAvailabilityBot(text)) return false;

  const isInformational =
    ai.wants_location ||
    asksLocation(text) ||
    ai.wants_business_hours ||
    asksBusinessHours(text) ||
    asksPromotions(text) ||
    ai.wants_prices_or_menu ||
    ai.wants_explanation ||
    wantsExplanation(text) ||
    ai.intent === "ask_services" ||
    ai.intent === "ask_location" ||
    ai.intent === "ask_business_hours" ||
    text.includes("?") ||
    text.includes("politica") ||
    text.includes("politicas") ||
    text.includes("esmalte") ||
    text.includes("gelish");

  if (!isInformational) return false;

  const isClearBookingOnly =
    ai.intent === "book_appointment" &&
    !ai.wants_location &&
    !ai.wants_business_hours &&
    !ai.wants_prices_or_menu &&
    !ai.wants_explanation &&
    !asksLocation(text) &&
    !asksBusinessHours(text) &&
    !asksPromotions(text) &&
    !wantsExplanation(text);

  return !isClearBookingOnly;
}

async function generateKnowledgeReplyWithAI({
  incomingMessage,
  recentMessages,
  matchedKnowledge,
}) {
  if (!isOpenAIConfigured() || !matchedKnowledge?.content) {
    return matchedKnowledge?.content || "";
  }

  try {
    const text = await createOpenAITextResponse({
      instructions:
        `Responde como el bot interno de ${SALON_NAME}. Tono profesional, cálido, claro y elegante. Sé breve. No uses "hermosa" por defecto. Usa solo la información proporcionada; si no alcanza, ofrece pasar con una persona del equipo. No inventes precios ni disponibilidad. No uses etiquetas internas ni el nombre anterior del salón con la palabra Spa.`,
      input: `Últimos mensajes:\n${formatRecentMessagesForSearch(
        recentMessages
      )}\n\nInformación configurada:\nTítulo: ${
        matchedKnowledge.title || "Información"
      }\nContenido: ${
        matchedKnowledge.content
      }\n\nPregunta actual:\n${incomingMessage}`,
      maxOutputTokens: 420,
      verbosity: "low",
    });

    return text || matchedKnowledge.content;
  } catch (error) {
    console.error("Knowledge AI reply error:", error);
    return matchedKnowledge.content;
  }
}

function getRequestedServicesText(context, ai) {
  const selectedServices = Array.isArray(context.selected_services)
    ? context.selected_services
    : [];

  if (selectedServices.length > 0) {
    return selectedServices.map((service) => service.name).join(" + ");
  }

  if (Array.isArray(ai.services_requested) && ai.services_requested.length > 0) {
    return ai.services_requested.join(" + ");
  }

  return "";
}

function truncateForAI(value, maxLength = 700) {
  const text = String(value || "").trim();

  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function formatServicesCatalogForAI(services = []) {
  const grouped = services.reduce((acc, service) => {
    const group = getServiceGroup(service);

    if (!acc[group]) acc[group] = [];

    const price = Number(service?.base_price || 0);
    const duration = Number(service?.duration_minutes || 0);
    const description =
      service?.bot_description || service?.description || service?.bot_keywords || "";

    acc[group].push(
      [
        service?.name || "Servicio",
        price > 0 ? `precio: $${price}` : "precio: no configurado",
        duration > 0 ? `duración aprox.: ${duration} min` : "",
        description ? `nota: ${truncateForAI(description, 160)}` : "",
      ]
        .filter(Boolean)
        .join(" | ")
    );

    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([group, items]) => {
      const title = group.charAt(0).toUpperCase() + group.slice(1);
      return `${title}:\n${items.slice(0, 18).map((item) => `- ${item}`).join("\n")}`;
    })
    .join("\n\n");
}

function formatKnowledgeForAI({ faqs = [], knowledgeItems = [], matchedKnowledge }) {
  const priorityItems = [];

  if (matchedKnowledge?.content) {
    priorityItems.push({
      title: matchedKnowledge.title || "Información relacionada",
      content: matchedKnowledge.content,
    });
  }

  const faqItems = faqs.slice(0, 18).map((faq) => ({
    title: faq.question || faq.title || "FAQ",
    content: faq.answer || faq.response || faq.content || "",
  }));

  const knowledge = knowledgeItems.slice(0, 24).map((item) => ({
    title: item.title || item.category || "Base de conocimiento",
    content: item.content || item.answer || item.response || "",
  }));

  const unique = [...priorityItems, ...faqItems, ...knowledge].filter(
    (item, index, all) => {
      const key = normalizeText(`${item.title} ${item.content}`);
      return key && all.findIndex((candidate) => normalizeText(`${candidate.title} ${candidate.content}`) === key) === index;
    }
  );

  return unique
    .slice(0, 30)
    .map((item) => `- ${truncateForAI(item.title, 120)}: ${truncateForAI(item.content, 520)}`)
    .join("\n");
}

function formatMenuOptionsForAI(menuOptions = []) {
  return menuOptions
    .slice(0, 10)
    .map(
      (option) =>
        `${option.option_order || ""}. ${option.option_label || option.option_key || "Opción"}`
    )
    .join("\n");
}

async function generateAssistantReplyWithAI({
  incomingMessage,
  recentMessages,
  settings,
  faqs,
  knowledgeItems,
  services,
  menuOptions,
  mediaAssets,
  context,
  ai,
  matchedKnowledge,
  isFirstMessage,
}) {
  if (!isOpenAIConfigured()) return "";

  const locationUrl = getConfiguredLocationUrl({
    settings,
    faqs,
    knowledgeItems,
    mediaAssets,
  });

  const instructions = `
Eres el asistente interno de ${SALON_NAME} para el probador del módulo Bot / WhatsApp.

Reglas de estilo:
- Responde en español mexicano, con tono cálido, profesional, claro y elegante.
- No uses "hermosa" por defecto.
- No uses ni menciones "${SALON_NAME} Spa"; el nombre correcto es "${SALON_NAME}".
- No muestres etiquetas internas, nombres de intents, fuentes técnicas ni debug.
- Sé breve y útil. Si falta un dato, pregunta solo lo necesario.

Reglas de negocio:
- No inventes precios, promociones, direcciones, horarios ni disponibilidad.
- Cuando hables de servicios o precios, usa solo el catálogo provisto abajo. Si no hay precio exacto, di que se puede cotizar con más detalle.
- Usa primero FAQs/base de conocimiento cuando resuelva la pregunta.
- Si no sabes algo con certeza, ofrece pasar con una persona del equipo.
- No confirmes citas como registradas; solo ayuda a recopilar datos o guiar la conversación.
- Si la clienta quiere una persona, responde que una persona del equipo dará seguimiento.
`.trim();

  const input = `
Mensaje actual:
${incomingMessage}

¿Es primer mensaje de la conversación?: ${isFirstMessage ? "sí" : "no"}

Últimos mensajes:
${formatRecentMessagesForSearch(recentMessages)}

Contexto interno resumido:
${truncateForAI(JSON.stringify(context || {}, null, 2), 1600)}

Interpretación automática:
${truncateForAI(JSON.stringify(ai || {}, null, 2), 900)}

Configuración visible del bot:
- Bot: ${settings?.bot_name || SALON_NAME}
- Ubicación conocida: ${LOCATION_ADDRESS_TEXT}
- Link de ubicación: ${locationUrl}
- Mensaje de ayuda humana: ${settings?.human_help_message || "Una persona del equipo dará seguimiento."}

Opciones principales configuradas:
${formatMenuOptionsForAI(menuOptions) || "Sin opciones configuradas."}

FAQs y base de conocimiento activas:
${formatKnowledgeForAI({ faqs, knowledgeItems, matchedKnowledge }) || "Sin conocimiento configurado."}

Catálogo de servicios activo:
${formatServicesCatalogForAI(services) || "Sin catálogo activo disponible."}

Redacta la mejor respuesta final para la clienta.
`.trim();

  try {
    const reply = await createOpenAITextResponse({
      instructions,
      input,
      maxOutputTokens: 520,
      verbosity: "low",
    });

    return sanitizeBotReply(reply);
  } catch (error) {
    console.error("OpenAI assistant reply error:", error);
    return "";
  }
}

async function saveAppointmentRequest(supabase, { conversationId, clientPhone, clientName, context, ai, incomingMessage }) {
  const requestedService = getRequestedServicesText(context, ai);
  const hasClearBookingIntent =
    ai.intent === "book_appointment" ||
    requestedService ||
    context.requested_date ||
    context.selected_slot ||
    context.preferred_staff_name;

  if (!hasClearBookingIntent) return null;

  const requestedTime =
    context.selected_slot?.start_time ||
    (context.minimum_start_minutes !== null && context.minimum_start_minutes !== undefined
      ? minutesToTime(context.minimum_start_minutes)
      : null);

  const notes = [
    `Resumen: ${incomingMessage}`,
    context.preferred_staff_name ? `Técnica preferida: ${context.preferred_staff_name}.` : "",
    context.booking_notes ? `Notas: ${context.booking_notes}` : "",
    conversationId ? `Conversación: ${conversationId}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const payload = {
    client_name: context.client_full_name || clientName || null,
    client_phone: clientPhone,
    requested_service: requestedService || null,
    requested_date: context.requested_date || context.selected_slot?.date || null,
    requested_time: requestedTime || null,
    status: "pendiente",
    notes,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("bot_appointment_requests")
    .select("id")
    .eq("client_phone", clientPhone)
    .eq("status", "pendiente")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const query = existing?.id
    ? supabase.from("bot_appointment_requests").update(payload).eq("id", existing.id)
    : supabase.from("bot_appointment_requests").insert([payload]);

  const { error } = await query;
  if (error) throw error;

  return true;
}

function normalizeAIParsed(parsed) {
  return {
    intent: parsed?.intent || "unknown",
    confidence: Number(parsed?.confidence || 0),
    services_requested: Array.isArray(parsed?.services_requested)
      ? parsed.services_requested
      : [],
    service_details: parsed?.service_details || "",
    date_text: parsed?.date_text || "",
    time_text: parsed?.time_text || "",
    time_preference: parsed?.time_preference || "",
    staff_preference: parsed?.staff_preference || "",
    client_full_name: parsed?.client_full_name || "",
    client_phone: parsed?.client_phone || "",
    client_birthday: parsed?.client_birthday || "",
    wants_location: Boolean(parsed?.wants_location),
    wants_business_hours: Boolean(parsed?.wants_business_hours),
    says_paid: Boolean(parsed?.says_paid),
    wants_human: Boolean(parsed?.wants_human),
    wants_prices_or_menu: Boolean(parsed?.wants_prices_or_menu),
    wants_explanation: Boolean(parsed?.wants_explanation),
    add_to_existing_services: Boolean(parsed?.add_to_existing_services),
    notes: parsed?.notes || "",
    missing_info: Array.isArray(parsed?.missing_info) ? parsed.missing_info : [],
  };
}

function fallbackInterpret(message) {
  const text = normalizeText(message);

  const services = [];

  if (text.includes("relleno") && text.includes("rubber")) services.push("relleno de rubber");
  else if (text.includes("rubber")) services.push("rubber");

  if (text.includes("pedi") || text.includes("pedicure")) services.push("pedicure");

  if (text.includes("softgel")) services.push("softgel");
  if (text.includes("acril")) services.push("uñas acrílicas");
  if (text.includes("polygel")) services.push("polygel");
  if (text.includes("ceja")) services.push("cejas");
  if (text.includes("pestana") || text.includes("pestaña")) services.push("pestañas");
  if (text.includes("cabello") || text.includes("pelo")) services.push("cabello");
  if (
    (text.includes("unas") || text.includes("uñas")) &&
    !services.some((service) => normalizeText(service).includes("una"))
  ) {
    services.push("unas");
  }

  return normalizeAIParsed({
    intent:
      asksPaymentProof(message)
        ? "payment_proof"
        : asksHumanHelp(message)
        ? "human_help"
        : asksLocation(message)
        ? "ask_location"
        : asksBusinessHours(message)
        ? "ask_business_hours"
        : asksPromotions(message)
        ? "ask_services"
        : text.includes("cita") || text.includes("agendar") || services.length > 0
        ? "book_appointment"
        : asksGreetingOrInfo(message)
        ? "greeting"
        : "unknown",
    confidence: 0.4,
    services_requested: services,
    date_text: message,
    time_text: message,
    time_preference: message,
    staff_preference: message,
    wants_location: asksLocation(message),
    wants_business_hours: asksBusinessHours(message),
    says_paid: asksPaymentProof(message),
    wants_human: asksHumanHelp(message),
    wants_prices_or_menu:
      text.includes("precio") ||
      text.includes("precios") ||
      text.includes("menu") ||
      text.includes("menú") ||
      text.includes("servicios"),
    wants_explanation: wantsExplanation(message),
    add_to_existing_services:
      text.includes("tambien") ||
      text.includes("también") ||
      text.includes("agrega"),
    notes: extractBookingNotes(message),
  });
}

async function interpretWithAI(message, context) {
  if (!isOpenAIConfigured()) {
    return fallbackInterpret(message);
  }

  const today = todayISO();

const systemPrompt = `
Eres el intérprete de mensajes para el bot de WhatsApp de ${SALON_NAME}.

Tu única tarea es convertir el mensaje de la clienta a JSON estructurado.
No respondas como bot final.
No inventes horarios, precios, disponibilidad ni servicios exactos.
No confirmes citas.
Solo interpreta intención y datos.

Contexto:
- Servicios principales: uñas, extensiones, rellenos, mantenimiento, rubber, softgel, acrílico, polygel, gel de construcción, gel semipermanente, manicure, pedicure, cejas, pestañas y tratamientos capilares.
- Si la clienta dice "uñas" de forma general, no asumas el sistema exacto.
- Si dice "rubber", puede referirse a Rubber Base o Relleno de Rubber.
- Si dice "relleno de rubber", es específico.
- Si dice "pedi" o "pedicure" de forma general, significa categoría pedicure; NO elijas varios servicios exactos. Usa services_requested: ["pedicure"] para que el bot muestre opciones y pida elegir una.
- Si dice "también quiero", "agrega", "también", quiere sumar un servicio a lo ya elegido.
- Si dice "ya pagué", "ya transferí", "te mando comprobante", la intención es comprobante de anticipo.
- Si dice "Ale", se refiere a Alexandra Ruiz.
- Si dice "cualquier chica", "la que esté disponible", "es mi primera vez", no tiene técnica de preferencia.
- Si menciona largo #3, largo 3 o largo extra, guárdalo en notes, no lo trates como número de opción.
- Si pregunta ubicación, marca wants_location.
- Si pregunta horario de trabajo, marca wants_business_hours.
- Si pregunta por la cita mas proxima, lo mas pronto, primer espacio o disponibilidad mas cercana, NO marques wants_business_hours; usa intent book_appointment y conserva los servicios previos si existen.
- Si pide pedi y unas en el mismo mensaje, pon ambos en services_requested: ["pedicure", "unas"].
- Si pide menú, precios o servicios, marca wants_prices_or_menu.
- Si pregunta "incluye", "qué trae", "qué es", "explícame", "diferencia", "cuál me conviene" o "cuánto cuesta ese", marca wants_explanation.
- Una pregunta explicativa sobre un servicio NO es una selección. Conserva el contexto y no agregues servicios hasta recibir una confirmación clara o números de opción.
- Acripie incluye pedicure en seco de cortesía, pero no sustituye un pedicure clásico, spa o medicado.

Fecha actual en Mérida, México: ${today}

Devuelve SOLO JSON válido con esta estructura:
{
  "intent": "book_appointment | reschedule | cancel | ask_services | ask_location | ask_business_hours | payment_proof | human_help | greeting | unknown",
  "confidence": 0.0,
  "services_requested": ["string"],
  "service_details": "string",
  "date_text": "string",
  "time_text": "string",
  "time_preference": "string",
  "staff_preference": "string",
  "client_full_name": "string",
  "client_phone": "string",
  "client_birthday": "string",
  "wants_location": false,
  "wants_business_hours": false,
  "says_paid": false,
  "wants_human": false,
  "wants_prices_or_menu": false,
  "wants_explanation": false,
  "add_to_existing_services": false,
  "notes": "string",
  "missing_info": ["string"]
}

Reglas:
- Si pide dos servicios, pon los dos.
- "relleno de rubber y pedi" => ["relleno de rubber", "pedicure"].
- "pedicure clásico con gel y uñas softgel" => ["pedicure clásico con gel", "softgel"].
- "hola quiero cita..." NO es greeting, es book_appointment.
- "el sábado a las 4 con Tania" => date_text="sábado", time_text="4:00 pm", staff_preference="Tania Mendez".
- "después de las 3" => time_preference="después de las 3:00 pm".
- "en 2 semanas" => date_text="en 2 semanas".
`;

  try {
    const raw = await createOpenAITextResponse({
      instructions: systemPrompt,
      input: `Contexto previo:\n${JSON.stringify(
        context || {},
        null,
        2
      )}\n\nMensaje de la clienta:\n${message}`,
      textFormat: { type: "json_object" },
      maxOutputTokens: 700,
      verbosity: "low",
    });

    return normalizeAIParsed(JSON.parse(raw));
  } catch (error) {
    console.error("AI interpret error:", error);
    return fallbackInterpret(message);
  }
}

async function getConversation(supabase, clientPhone) {
  const { data, error } = await supabase
    .from("bot_conversations")
    .select("*")
    .eq("client_phone", clientPhone)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getRecentBotMessages(supabase, conversationId, clientPhone) {
  try {
    let query = supabase
      .from("bot_messages")
      .select("direction, body, created_at")
      .order("created_at", { ascending: false })
      .limit(12);

    if (conversationId) {
      query = query.eq("conversation_id", conversationId);
    } else {
      query = query.eq("client_phone", clientPhone);
    }

    const { data, error } = await query;

    if (error) return [];

    return [...(data || [])].reverse();
  } catch (error) {
    return [];
  }
}

async function saveConversation(supabase, clientPhone, clientName, updates) {
  const payload = {
    client_phone: clientPhone,
    client_name: clientName || null,
    status: "abierta",
    updated_at: new Date().toISOString(),
    last_message_at: new Date().toISOString(),
    ...updates,
  };

  const { data, error } = await supabase
    .from("bot_conversations")
    .upsert([payload], { onConflict: "client_phone" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function saveBotMessages(
  supabase,
  conversationId,
  clientPhone,
  incomingMessage,
  reply,
  body,
  meta
) {
  if (!conversationId) return;

  await supabase.from("bot_messages").insert([
    {
      conversation_id: conversationId,
      client_phone: clientPhone,
      direction: "incoming",
      message_type: "text",
      body: incomingMessage,
      raw_payload: body,
    },
    {
      conversation_id: conversationId,
      client_phone: clientPhone,
      direction: "outgoing",
      message_type: "text",
      body: reply,
      raw_payload: meta,
    },
  ]);
}

async function saveIncomingBotMessage(
  supabase,
  conversationId,
  clientPhone,
  incomingMessage,
  rawPayload
) {
  if (!conversationId) return;

  await supabase.from("bot_messages").insert([
    {
      conversation_id: conversationId,
      client_phone: clientPhone,
      direction: "incoming",
      message_type: "text",
      body: incomingMessage,
      raw_payload: rawPayload,
    },
  ]);
}
function asksNearestAvailabilityBot(message) {
  const text = normalizeText(message);

  return (
    text.includes("cita mas proxima") ||
    text.includes("mas proxima") ||
    text.includes("mas pronto") ||
    text.includes("lo mas pronto") ||
    text.includes("lo antes posible") ||
    text.includes("primer espacio") ||
    text.includes("proximo espacio") ||
    text.includes("siguiente espacio") ||
    text.includes("cita mas cercana") ||
    text.includes("mas cercana")
  );
}

function addDaysFromTodayBot(daysToAdd) {
  return addDaysISO(todayISO(), daysToAdd);
}

async function findNextAvailableSlotsBot({
  supabase,
  selectedServices,
  preferredStaffMode = "available_priority",
  preferredStaffId = null,
  minimumStartMinutes = null,
  timeMode = "any",
  maxDays = 21,
}) {
  for (let dayOffset = 0; dayOffset <= maxDays; dayOffset += 1) {
    const dateString = addDaysFromTodayBot(dayOffset);

    const slots = await getAvailableSlots({
      supabase,
      selectedServices,
      dateString,
      preferredStaffMode,
      preferredStaffId,
      minimumStartMinutes,
      timeMode,
    });

    if (Array.isArray(slots) && slots.length > 0) {
      return { dateString, slots };
    }
  }

  return { dateString: null, slots: [] };
}

function buildNearestSlotsMessageBot(result, selectedServices, preferredStaffName = "") {
  const servicesText = selectedServices.map((service) => service.name).join(" + ");
  const staffText = preferredStaffName ? ` con ${preferredStaffName}` : "";

  if (!result || !Array.isArray(result.slots) || result.slots.length === 0) {
    return `Por el momento no encontre espacios proximos para ${servicesText}${staffText}. Puedes decirme otro dia u otro horario para revisar mas opciones.`;
  }

  const optionsText = result.slots
    .slice(0, 8)
    .map(
      (slot, index) =>
        `${index + 1}. ${formatDate(result.dateString)} a las ${formatTime12(slot.start_time)} con ${slot.staff_name}`
    )
    .join("\n");

  return `El espacio mas proximo que encontre para ${servicesText}${staffText} es:\n\n${optionsText}\n\nResponde con el numero de la opcion que prefieras.`;
}

function isFreshServiceRequestBot(message, ai) {
  const text = normalizeText(message);
  const hasServices = Array.isArray(ai.services_requested) && ai.services_requested.length > 0;

  if (!hasServices) return false;
  if (ai.add_to_existing_services) return false;

  const isContinuation =
    text.includes("tambien") ||
    text.includes("ademas") ||
    text.includes("agrega") ||
    text.includes("sumale") ||
    text.includes("y el ") ||
    text.includes("y la ");

  if (isContinuation) return false;

  return (
    text.includes("hola") ||
    text.includes("quiero") ||
    text.includes("quisiera") ||
    text.includes("me gustaria") ||
    text.includes("tienen cita") ||
    text.includes("tienes cita") ||
    text.includes("tienen espacio") ||
    text.includes("hay espacio") ||
    text.includes("cita para") ||
    text.includes("agendar")
  );
}
async function getAvailableSlots({
  supabase,
  selectedServices,
  dateString,
  preferredStaffMode,
  preferredStaffId,
  minimumStartMinutes,
  timeMode,
}) {
  const totalDuration = getTotalDuration(selectedServices);

  const [staffResult, busyResult, schedulesResult] = await Promise.all([
    supabase
      .from("staff")
      .select("id, full_name, active")
      .eq("active", true)
      .order("full_name"),
    supabase
      .from("appointment_services")
      .select("id, staff_id, service_date, start_time, end_time, status")
      .eq("service_date", dateString)
      .not("status", "eq", "cancelada"),
    supabase.from("staff_schedules").select("*"),
  ]);

  if (staffResult.error) throw staffResult.error;
  if (busyResult.error) throw busyResult.error;
  if (schedulesResult.error) throw schedulesResult.error;

  const staff = sortStaffByPriority(
    staffResult.data || [],
    preferredStaffMode,
    preferredStaffId
  );

  const schedules = schedulesResult.data || [];
  const busy = busyResult.data || [];
  const isToday = dateString === todayISO();
  const nowMinutes = getSalonNowMinutes();

  let slots = [];

  for (const person of staff) {
    const schedule = getScheduleForStaff(schedules, person.id, dateString);

    if (!schedule) continue;

    const startMinutes = timeToMinutes(schedule.start_time);
    const endMinutes = timeToMinutes(schedule.end_time);

    if (startMinutes === null || endMinutes === null) continue;

    const leadTime = getLeadTimeForStaff(person);
    const earliestForStaff = isToday ? nowMinutes + leadTime : startMinutes;

    for (
      let minute = startMinutes;
      minute + totalDuration <= endMinutes;
      minute += 30
    ) {
      if (minute < earliestForStaff) continue;

      if (
        minimumStartMinutes !== null &&
        minimumStartMinutes !== undefined &&
        minute < minimumStartMinutes
      ) {
        continue;
      }

      const startTime = minutesToTime(minute);
      const endTime = minutesToTime(minute + totalDuration);

      const isBusy = busy.some(
        (item) =>
          item.staff_id === person.id &&
          overlaps(startTime, endTime, item.start_time, item.end_time)
      );

      if (!isBusy) {
        slots.push({
          option_number: slots.length + 1,
          staff_id: person.id,
          staff_name: person.full_name,
          date: dateString,
          start_time: startTime,
          end_time: endTime,
        });
      }
    }
  }

  if (timeMode === "early") {
    slots = slots.filter((slot) => timeToMinutes(slot.start_time) <= 13 * 60);
  }

  return slots.slice(0, 8).map((slot, index) => ({
    ...slot,
    option_number: index + 1,
  }));
}

async function upsertClient({ supabase, fullName, phone, birthday }) {
  const cleanPhone = onlyDigits(phone);

  const { data: existingClient, error: findError } = await supabase
    .from("clients")
    .select("*")
    .eq("phone", cleanPhone)
    .maybeSingle();

  if (findError) throw findError;

  const payload = {
    full_name: fullName,
    phone: cleanPhone,
    birthday: birthday || null,
    updated_at: new Date().toISOString(),
  };

  if (existingClient?.id) {
    const { data, error } = await supabase
      .from("clients")
      .update(payload)
      .eq("id", existingClient.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("clients")
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function createAppointmentWithPayment({
  supabase,
  client,
  selectedServices,
  selectedSlot,
  bookingNotes,
}) {
  const estimatedTotal = getEstimatedTotal(selectedServices);
  const depositAmount = selectedServices.length * 100;
  const now = new Date().toISOString();

  const appointmentPayload = {
    client_id: client.id,
    staff_id: selectedSlot.staff_id,
    appointment_date: selectedSlot.date,
    start_time: selectedSlot.start_time,
    end_time: selectedSlot.end_time,
    status: "pendiente_anticipo",
    estimated_total: estimatedTotal,
    deposit_amount: depositAmount,
    deposit_payment_method: "transferencia",
    force_created: false,
    notes: bookingNotes || null,
    updated_at: now,
  };

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .insert([appointmentPayload])
    .select()
    .single();

  if (appointmentError) throw appointmentError;

  let cursor = timeToMinutes(selectedSlot.start_time);

  const serviceRows = selectedServices.map((service) => {
    const duration = Number(service.duration_minutes || 0) || 60;
    const cleanup = Number(service.cleanup_minutes || 0) || 0;
    const start = minutesToTime(cursor);
    const end = minutesToTime(cursor + duration + cleanup);
    cursor += duration + cleanup;

    const price = Number(service.base_price || 0);

    return {
      appointment_id: appointment.id,
      service_id: service.id,
      custom_name: service.name,
      quantity: 1,
      unit_price: price,
      total_price: price,
      price,
      staff_id: selectedSlot.staff_id,
      service_date: selectedSlot.date,
      start_time: start,
      end_time: end,
      duration_minutes: duration,
      cleanup_minutes: cleanup,
      status: "pendiente_anticipo",
      notes: bookingNotes || null,
    };
  });

  const { error: servicesError } = await supabase
    .from("appointment_services")
    .insert(serviceRows);

  if (servicesError) throw servicesError;

  const paymentPayload = {
    appointment_id: appointment.id,
    client_id: client.id,
    payment_method: "transferencia",
    subtotal: estimatedTotal,
    subtotal_services: estimatedTotal,
    subtotal_extras: 0,
    discount_amount: 0,
    total: estimatedTotal,
    total_amount: estimatedTotal,
    paid_amount: 0,
    balance_due: estimatedTotal,
    deposit_amount: depositAmount,
    payment_status: "pendiente_anticipo",
    payment_date: todayISO(),
    notes: `Anticipo solicitado por bot: $${depositAmount}. Pendiente de comprobante/validación.`,
    updated_at: now,
  };

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert([paymentPayload])
    .select()
    .single();

  if (paymentError) throw paymentError;

  return {
    appointment,
    payment,
    depositAmount,
    estimatedTotal,
  };
}

export async function GET() {
  const configured = isOpenAIConfigured();

  return NextResponse.json({
    ok: true,
    aiConfigured: configured,
    aiProvider: configured ? "openai" : "rules",
    model: configured ? openaiModel : null,
    message: configured
      ? `IA conectada en servidor con ${openaiModel}.`
      : AI_RULES_FALLBACK_MESSAGE,
  });
}

export async function POST(request) {
  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Faltan variables de Supabase." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const incomingMessage = String(body.message || "").trim();
    const clientNameFromTest = String(body.clientName || "").trim();
    const clientPhoneFromTest = String(body.clientPhone || "test").trim();
    // reset conversation final clean
    if (body.resetConversation === true || body.reset === true) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const rawPhone = String(clientPhoneFromTest || "test").trim();
      const digitsOnly = rawPhone.replace(/\D/g, "");
      const last10 = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;

      const phoneVariants = Array.from(
        new Set(
          [
            rawPhone,
            digitsOnly,
            last10,
            digitsOnly ? `52${last10}` : "",
            digitsOnly ? `+52${last10}` : "",
            "test",
          ].filter(Boolean)
        )
      );

      const { error: conversationDeleteError } = await supabase
        .from("bot_conversations")
        .delete()
        .in("client_phone", phoneVariants);

      try {
        await supabase
          .from("bot_messages")
          .delete()
          .in("client_phone", phoneVariants);
      } catch (messageResetError) {
        // Ignore if bot_messages is not available in this project.
      }

      if (conversationDeleteError) {
        return NextResponse.json(
          { error: `No se pudo reiniciar la conversacion: ${conversationDeleteError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        reset: true,
        reply: "Conversacion reiniciada. Ya no tomare en cuenta el contexto anterior.",
        phoneVariants,
      });
    }

    if (!incomingMessage) {
      return NextResponse.json(
        { error: "El mensaje es obligatorio." },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const conversation = await getConversation(supabase, clientPhoneFromTest);
    const existingContext = conversation?.conversation_context || {};

    if (isAutomaticBotDisabled(conversation)) {
      const savedConversation = await saveConversation(
        supabase,
        clientPhoneFromTest,
        clientNameFromTest,
        {
          bot_enabled: false,
          handoff_to_human: true,
          status: "human",
          last_message: incomingMessage,
          intent: "human_handoff",
          current_step: "humano",
          booking_step: "humano",
          conversation_context: existingContext,
          unread_count: Number(conversation.unread_count || 0) + 1,
        }
      );

      await saveIncomingBotMessage(
        supabase,
        savedConversation.id,
        clientPhoneFromTest,
        incomingMessage,
        {
          ...body,
          bot_disabled: true,
          automatic_reply_skipped: true,
        }
      );

      return NextResponse.json({
        ok: true,
        reply: null,
        message: null,
        bot_disabled: true,
        botMuted: true,
        intent: "human_handoff",
        matchedSource: "bot_disabled",
        step: "humano",
      });
    }

    const recentMessages = await getRecentBotMessages(
      supabase,
      conversation?.id,
      clientPhoneFromTest
    );
    const context = {
      ...existingContext,
      recent_messages: recentMessages,
    };

    const [
      settingsResult,
      menuResult,
      faqResult,
      knowledgeResult,
      servicesResult,
      staffResult,
      mediaResult,
    ] = await Promise.all([
      supabase.from("bot_settings").select("*").limit(1).maybeSingle(),
      supabase
        .from("bot_menu_options")
        .select("*")
        .eq("active", true)
        .order("option_order", { ascending: true }),
      supabase
        .from("bot_faqs")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("bot_knowledge_base")
        .select("*")
        .eq("active", true)
        .order("category", { ascending: true }),
      supabase
        .from("services")
        .select(
          "id, category, name, base_price, duration_minutes, cleanup_minutes, active, description, bot_active, bot_keywords, bot_description, bot_service_group, bot_bookable"
        )
        .eq("active", true)
        .eq("bot_active", true)
        .order("category")
        .order("name"),
      supabase
        .from("staff")
        .select("id, full_name, active")
        .eq("active", true)
        .order("full_name"),
      supabase.from("bot_media_assets").select("*").eq("active", true),
    ]);

    for (const result of [
      settingsResult,
      menuResult,
      faqResult,
      knowledgeResult,
      servicesResult,
      staffResult,
      mediaResult,
    ]) {
      if (result.error) throw result.error;
    }

    const settings = settingsResult.data;
    const menuOptions = menuResult.data || [];
    const faqs = faqResult.data || [];
    const knowledgeItems = [
      ...(knowledgeResult.data || []),
      ...getDefaultKnowledgeItems(),
    ];
    const services = (servicesResult.data || []).filter(isServiceBookable);
    const staff = staffResult.data || [];
    const mediaAssets = mediaResult.data || [];
    const isServiceQuestion = isServiceQuestionMessage(incomingMessage);

    const ai = await interpretWithAI(incomingMessage, context);

    ai.wants_location = ai.wants_location || asksLocation(incomingMessage);
    ai.wants_business_hours =
      ai.wants_business_hours || asksBusinessHours(incomingMessage);
    ai.says_paid = ai.says_paid || asksPaymentProof(incomingMessage);
    ai.wants_human = ai.wants_human || asksHumanHelp(incomingMessage);
    ai.wants_explanation =
      ai.wants_explanation || wantsExplanation(incomingMessage);
    ai.wants_prices_or_menu =
      ai.wants_prices_or_menu ||
      normalizeText(incomingMessage).includes("servicios") ||
      normalizeText(incomingMessage).includes("precio") ||
      normalizeText(incomingMessage).includes("precios") ||
      normalizeText(incomingMessage).includes("menu") ||
      normalizeText(incomingMessage).includes("menú");

    if (!ai.wants_explanation && isGeneralPedicureRequest(incomingMessage)) {
      const nonPedicureRequests = (Array.isArray(ai.services_requested)
        ? ai.services_requested
        : []
      ).filter((query) => !isPedicureRequestedServiceQuery(query));

      ai.services_requested = ["pedicure", ...nonPedicureRequests];
    }

    if (asksGreetingOrInfo(incomingMessage) && ai.intent === "unknown") {
      ai.intent = "greeting";
    }

    if (asksHumanHelp(incomingMessage)) {
      ai.intent = "human_help";
    }

    if (asksPaymentProof(incomingMessage)) {
      ai.intent = "payment_proof";
    }

    const requestedDate = parseRequestedDate(
      `${incomingMessage} ${ai.date_text || ""}`
    );

    const timePreference = parseTimePreference(
      `${incomingMessage} ${ai.time_text || ""} ${ai.time_preference || ""}`
    );

    const staffPreference = isServiceQuestion
      ? null
      : detectStaffPreference(
          `${incomingMessage} ${ai.staff_preference || ""}`,
          staff
        );

    const selectedServicesFromContext = Array.isArray(context.selected_services)
      ? context.selected_services
      : [];

    const bookingNotes = [
      context.booking_notes,
      extractBookingNotes(incomingMessage, ai.notes),
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    let reply = "";
    let matchedSource = "fallback";

    let nextContext = {
      ...context,
      active_topic:
        detectActiveConversationTopic(incomingMessage, context, recentMessages) ||
        context.active_topic ||
        null,
      booking_notes: bookingNotes,
      requested_date: requestedDate || context.requested_date || null,
      minimum_start_minutes:
        timePreference.minutes ?? context.minimum_start_minutes ?? null,
      time_mode: timePreference.mode || context.time_mode || "any",
    };

    let nextStep = conversation?.booking_step || null;
    const pendingOptions = Array.isArray(nextContext.pending_service_options)
      ? nextContext.pending_service_options
      : [];
    const isFirstMessage = isFirstConversationMessage(
      conversation,
      recentMessages
    );
    const matchedKnowledge = findBestKnowledgeAnswer({
      incomingMessage,
      recentMessages,
      faqs,
      knowledgeItems,
    });

    if (!reply && ai.says_paid) {
      const anticipoAsset = getAssetByKey(mediaAssets, "datos_anticipo");

      reply = `Perfecto 💕 Por favor envíame tu comprobante de anticipo por este chat para que podamos validarlo y confirmar tu cita.\n\n${mediaText(
        anticipoAsset
      )}`;

      matchedSource = "payment_proof";
      nextStep = "esperando_comprobante";
    }

    if (!reply && isServiceQuestion) {
      const contextualServiceReply = buildContextualServiceInquiryReply({
        incomingMessage,
        context: nextContext,
        recentMessages,
        services,
      });

      if (contextualServiceReply?.reply) {
        reply = contextualServiceReply.reply;
        matchedSource = "contextual_service_inquiry";
        nextContext.active_topic =
          contextualServiceReply.topic || nextContext.active_topic;
        nextContext.active_service_focus =
          contextualServiceReply.serviceFocus ||
          nextContext.active_service_focus ||
          null;
      }
    }

    if (
      !reply &&
      matchedKnowledge &&
      shouldUseKnowledgeBeforeFixed({ incomingMessage, ai })
    ) {
      reply = await generateKnowledgeReplyWithAI({
        incomingMessage,
        recentMessages,
        matchedKnowledge,
      });
      matchedSource = matchedKnowledge.type;

      if (
        asksLocation(incomingMessage) &&
        reply
      ) {
        if (
          isFirstMessage &&
          !normalizeText(reply).startsWith("hola") &&
          !normalizeText(reply).startsWith("buenas")
        ) {
          reply = `¡Hola! Claro 💕 ${reply}`;
        }

        const locationUrl = getConfiguredLocationUrl({
          settings,
          faqs,
          knowledgeItems,
          mediaAssets,
        });

        if (!extractFirstUrl(reply)) {
          reply = `${reply}\n\n${
            isFirstMessage
              ? "Te comparto también nuestra ubicación para que puedas orientarte mejor:"
              : "Te comparto nuestra ubicación para que puedas orientarte mejor:"
          }\n${locationUrl}`;
        }
      }
    }

    if (!reply && (ai.wants_location || asksLocation(incomingMessage))) {
      reply = buildLocationResponse({
        settings,
        faqs,
        knowledgeItems,
        mediaAssets,
        isFirstMessage,
      });

      matchedSource = "location";
    }

    if (!reply && !asksNearestAvailabilityBot(incomingMessage) && (ai.wants_business_hours || asksBusinessHours(incomingMessage))) {
      reply = BUSINESS_HOURS_MESSAGE;
      matchedSource = "business_hours";
    }

    if (!reply && asksPromotions(incomingMessage)) {
      reply = buildPromotionsResponse(
        settings,
        knowledgeItems,
        menuOptions,
        mediaAssets
      );

      matchedSource = "promotions";
    }

    if (!reply && ai.wants_explanation) {
      const mentionedService = findMentionedServiceForExplanation(
        incomingMessage,
        pendingOptions,
        services
      );

      reply = buildServiceExplanationReply(
        incomingMessage,
        mentionedService
      );
      matchedSource = "service_explanation";
    }

    if (
      !reply &&
      ai.wants_prices_or_menu &&
      isContextFollowUp(incomingMessage) &&
      selectedServicesFromContext.length > 0
    ) {
      reply = buildSelectedServicePricesMessage(selectedServicesFromContext);
      matchedSource = "context_service_price";
    }

    if (
      !reply &&
      ai.wants_prices_or_menu &&
      ai.intent !== "book_appointment" &&
      !asksNearestAvailabilityBot(incomingMessage)
    ) {
      reply = buildServicesCatalogResponse(services);
      matchedSource = "services_catalog";
      nextStep = "esperando_servicios";
    }

    if (!reply && nextStep === "esperando_nombre") {
      nextContext.client_full_name = ai.client_full_name || incomingMessage.trim();

      reply = `Gracias, ${getFirstName(
        nextContext.client_full_name
      )} 💕 ¿Este WhatsApp es correcto para tu registro?\n\n${clientPhoneFromTest}\n\nResponde “sí” o escribe el número correcto.`;

      matchedSource = "request_client_phone";
      nextStep = "esperando_telefono";
    } else if (!reply && nextStep === "esperando_telefono") {
      const text = normalizeText(incomingMessage);
      const digits = onlyDigits(incomingMessage);

      nextContext.client_phone_confirmed =
        text === "si" || text === "sí" || text.includes("correcto")
          ? clientPhoneFromTest
          : digits.length >= 8
          ? digits
          : clientPhoneFromTest;

      reply =
        "Perfecto 💕 ¿Cuál es tu fecha de cumpleaños?\n\nPuedes escribirla como 25/06/1995. Si prefieres no compartirla, responde “omitir”.";

      matchedSource = "request_client_birthday";
      nextStep = "esperando_cumple";
    } else if (!reply && nextStep === "esperando_cumple") {
      nextContext.client_birthday = normalizeText(incomingMessage).includes(
        "omitir"
      )
        ? null
        : parseBirthday(incomingMessage);

      const fullName =
        nextContext.client_full_name || clientNameFromTest || "Cliente";

      const phone = nextContext.client_phone_confirmed || clientPhoneFromTest;
      const selectedSlot = nextContext.selected_slot;
      const selectedServices = nextContext.selected_services || [];

      if (!selectedSlot || selectedServices.length === 0) {
        reply =
          "Me faltó un dato de la cita para registrarla. Escribe “agendar” y lo revisamos de nuevo, por favor 💕";

        matchedSource = "missing_booking_data";
        nextStep = null;
      } else {
        const client = await upsertClient({
          supabase,
          fullName,
          phone,
          birthday: nextContext.client_birthday,
        });

        const created = await createAppointmentWithPayment({
          supabase,
          client,
          selectedServices,
          selectedSlot,
          bookingNotes: nextContext.booking_notes || "",
        });

        nextContext.created_appointment_id = created.appointment.id;
        nextContext.created_payment_id = created.payment.id;

        const servicesText = selectedServices
          .map((service) => service.name)
          .join(" + ");

        const notesText = nextContext.booking_notes
          ? `\nNota: ${nextContext.booking_notes}`
          : "";

        reply = `Listo ${getFirstName(
          fullName
        )} 💕 Tu cita quedó registrada como pendiente de anticipo para:\n\n${servicesText}${notesText}\n\nFecha: ${formatDate(
          selectedSlot.date
        )}\nHora: ${formatTime12(selectedSlot.start_time)}\nTécnica: ${
          selectedSlot.staff_name
        }\n\nPara confirmar tu cita solicitamos anticipo de $100 por servicio.\nTotal de anticipo requerido: $${
          created.depositAmount
        }.\nEse anticipo se descuenta del total a pagar el día de tu cita.\n\n${mediaText(
          getAssetByKey(mediaAssets, "datos_anticipo")
        )}\n\n${mediaText(
          getAssetByKey(mediaAssets, "politicas_salon")
        )}\n\n${mediaText(
          getAssetByKey(mediaAssets, "ubicacion_maps"),
          buildLocationResponse({
            settings,
            faqs,
            knowledgeItems,
            mediaAssets,
            isFirstMessage: false,
          })
        )}`;

        matchedSource = "appointment_created_with_payment";
        nextStep = "esperando_comprobante";
      }
    }

    if (
      !reply &&
      !ai.wants_explanation &&
      !isServiceQuestion &&
      pendingOptions.length > 0 &&
      (nextStep === "esperando_seleccion_servicios" ||
        nextStep === "esperando_servicios")
    ) {
      const selected = parseSelectionFromOptions(incomingMessage, pendingOptions);

      if (selected.length > 0) {
        const merged = mergeServices(
          nextContext.adding_service_mode ? selectedServicesFromContext : [],
          selected
        );

        nextContext.selected_services = merged;
        nextContext.pending_service_options = [];
        nextContext.adding_service_mode = false;

        reply = buildSelectedServicesMessage(merged, bookingNotes);
        matchedSource = "service_options_selected";
        nextStep = "esperando_tecnica";
      }
    }

    if (!reply && nextStep === "esperando_tipo_unas") {
      const options = getNailSubcategoryOptions(incomingMessage, services);

      if (options.length > 0) {
        nextContext.pending_service_options = options;

        reply = buildServiceOptionsMessage(options, selectedServicesFromContext);
        matchedSource = "nail_subcategory_options";
        nextStep = "esperando_seleccion_servicios";
      } else {
        reply = buildNailClarifyingQuestion();
        matchedSource = "nail_clarify_retry";
      }
    }
        const availableOptions = Array.isArray(nextContext.available_options)
      ? nextContext.available_options
      : [];

    const selectedOptionNumber = Number(normalizeText(incomingMessage));

    if (
      !reply &&
      isPureNumberSelection(incomingMessage) &&
      selectedOptionNumber > 0 &&
      availableOptions.length > 0
    ) {
      const selectedSlot = availableOptions[selectedOptionNumber - 1];

      if (selectedSlot) {
        nextContext.selected_slot = selectedSlot;
        nextContext.available_options = [];

        reply =
          "Perfecto 💕 Para registrar tu cita necesito tus datos.\n\n¿Cuál es tu nombre completo?";

        matchedSource = "slot_selected_request_name";
        nextStep = "esperando_nombre";
      }
    }

    const serviceQueries = Array.isArray(ai.services_requested)
      ? ai.services_requested
      : [];

    const isAddingService =
      ai.add_to_existing_services ||
      normalizeText(incomingMessage).includes("tambien") ||
      normalizeText(incomingMessage).includes("también") ||
      normalizeText(incomingMessage).includes("agrega");

    if (
      !reply &&
      !isServiceQuestion &&
      (ai.intent === "book_appointment" ||
        ai.intent === "ask_services" ||
        nextStep === "esperando_servicios" ||
        nextStep === "esperando_tecnica" ||
        nextStep === "esperando_fecha" ||
        nextStep === "esperando_opcion_horario")
    ) {
      if (
        serviceQueries.length === 0 &&
        !asksNearestAvailabilityBot(incomingMessage) &&
        (ai.intent === "book_appointment" || nextStep === "esperando_servicios")
      ) {
        reply = "Perfecto 💕 ¿Qué servicio o servicios te gustaría agendar?";
        matchedSource = "ask_service";
        nextStep = "esperando_servicios";
      }

      if (!reply && serviceQueries.some((query) => isGeneralNailOnly(query))) {
        reply = buildNailClarifyingQuestion();
        matchedSource = "nail_clarifying_question";
        nextStep = "esperando_tipo_unas";
        nextContext.pending_service_options = [];
      }

      if (!reply && serviceQueries.length > 0) {
        const resolved = resolveRequestedServices(serviceQueries, services);

        if (resolved.ambiguous.length > 0) {
          const keepExistingServices = selectedServicesFromContext.length > 0 && isAddingService;

          nextContext.pending_service_options = resolved.ambiguous;
          nextContext.adding_service_mode = keepExistingServices;

          reply = buildServiceOptionsMessage(
            resolved.ambiguous,
            keepExistingServices ? selectedServicesFromContext : []
          );

          matchedSource = "ambiguous_services_options";
          nextStep = "esperando_seleccion_servicios";
        } else if (resolved.selected.length > 0) {
          const mergedServices =
            selectedServicesFromContext.length > 0 &&
            (isAddingService ||
              nextStep === "esperando_tecnica" ||
              nextStep === "esperando_fecha" ||
              nextStep === "esperando_opcion_horario")
              ? mergeServices(selectedServicesFromContext, resolved.selected)
              : resolved.selected;

          nextContext.selected_services = mergedServices;
          nextContext.pending_service_options = [];
          nextContext.adding_service_mode = false;

          const targetDate = requestedDate || nextContext.requested_date;
          const targetStaff = staffPreference;

          if (targetStaff && targetDate) {
            const slots = await getAvailableSlots({
              supabase,
              selectedServices: mergedServices,
              dateString: targetDate,
              preferredStaffMode: targetStaff.mode,
              preferredStaffId: targetStaff.staffId,
              minimumStartMinutes: nextContext.minimum_start_minutes,
              timeMode: nextContext.time_mode,
            });

            nextContext.preferred_staff_mode = targetStaff.mode;
            nextContext.preferred_staff_id = targetStaff.staffId;
            nextContext.preferred_staff_name = targetStaff.staffName;
            nextContext.requested_date = targetDate;
            nextContext.available_options = slots;

            reply = buildSlotsMessage(
              slots,
              mergedServices,
              targetDate,
              targetStaff.mode === "specific" ? targetStaff.staffName : ""
            );

            matchedSource = "services_staff_date_availability";
            nextStep =
              slots.length > 0 ? "esperando_opcion_horario" : "esperando_fecha";
          } else {
            reply = buildSelectedServicesMessage(mergedServices, bookingNotes);
            matchedSource = "services_selected";
            nextStep = "esperando_tecnica";
          }
        } else if (resolved.unresolved.length > 0) {
          reply =
            "Claro 💕 Para agendarlo bien, ¿me puedes decir el nombre del servicio exacto o elegirlo desde nuestro menú?";
          matchedSource = "unresolved_service";
          nextStep = "esperando_servicios";
        }
      }
    }

    const selectedServicesNow = Array.isArray(nextContext.selected_services)
      ? nextContext.selected_services
      : selectedServicesFromContext;

    if (!reply && staffPreference && selectedServicesNow.length === 0) {
      nextContext.preferred_staff_mode = staffPreference.mode;
      nextContext.preferred_staff_id = staffPreference.staffId;
      nextContext.preferred_staff_name = staffPreference.staffName;

      reply =
        staffPreference.mode === "available_priority"
          ? "Perfecto 💕 Lo tomaré como sin técnica preferida y buscaremos con la colaboradora disponible.\n\n¿Qué servicio o servicios te gustaría agendar?"
          : `Perfecto 💕 Buscaré con ${staffPreference.staffName}.\n\n¿Qué servicio o servicios te gustaría agendar?`;

      matchedSource = "staff_preference_before_service";
      nextStep = "esperando_servicios";
    }

    if (
      !reply &&
      staffPreference &&
      selectedServicesNow.length > 0 &&
      (nextStep === "esperando_tecnica" ||
        nextStep === "esperando_fecha" ||
        nextStep === "esperando_opcion_horario")
    ) {
      nextContext.preferred_staff_mode = staffPreference.mode;
      nextContext.preferred_staff_id = staffPreference.staffId;
      nextContext.preferred_staff_name = staffPreference.staffName;

      const targetDate = requestedDate || nextContext.requested_date;

      if (targetDate) {
        const slots = await getAvailableSlots({
          supabase,
          selectedServices: selectedServicesNow,
          dateString: targetDate,
          preferredStaffMode: staffPreference.mode,
          preferredStaffId: staffPreference.staffId,
          minimumStartMinutes: nextContext.minimum_start_minutes,
          timeMode: nextContext.time_mode,
        });

        nextContext.requested_date = targetDate;
        nextContext.available_options = slots;

        reply = buildSlotsMessage(
          slots,
          selectedServicesNow,
          targetDate,
          staffPreference.mode === "specific" ? staffPreference.staffName : ""
        );

        matchedSource = "staff_selected_availability";
        nextStep =
          slots.length > 0 ? "esperando_opcion_horario" : "esperando_fecha";
      } else {
        reply =
          staffPreference.mode === "available_priority"
            ? "Perfecto 💕 Buscaré espacios con la colaboradora disponible.\n\n¿Qué día te gustaría venir? Puedes responder “mañana”, “sábado”, “en 1 semana” o una fecha como 25/06."
            : `Perfecto 💕 Buscaré espacios con ${staffPreference.staffName}.\n\n¿Qué día te gustaría venir? Puedes responder “mañana”, “sábado”, “en 1 semana” o una fecha como 25/06.`;

        matchedSource = "staff_selected_request_date";
        nextStep = "esperando_fecha";
      }
    }

    if (
      !reply &&
      requestedDate &&
      selectedServicesNow.length > 0 &&
      (nextStep === "esperando_fecha" ||
        nextStep === "esperando_opcion_horario" ||
        context.preferred_staff_mode)
    ) {
      const preferredStaffMode =
        nextContext.preferred_staff_mode ||
        context.preferred_staff_mode ||
        "available_priority";

      const preferredStaffId =
        nextContext.preferred_staff_id || context.preferred_staff_id || null;

      const preferredStaffName =
        nextContext.preferred_staff_name || context.preferred_staff_name || "";

      const slots = await getAvailableSlots({
        supabase,
        selectedServices: selectedServicesNow,
        dateString: requestedDate,
        preferredStaffMode,
        preferredStaffId,
        minimumStartMinutes: nextContext.minimum_start_minutes,
        timeMode: nextContext.time_mode,
      });

      nextContext.requested_date = requestedDate;
      nextContext.available_options = slots;

      reply = buildSlotsMessage(
        slots,
        selectedServicesNow,
        requestedDate,
        preferredStaffMode === "specific" ? preferredStaffName : ""
      );

      matchedSource = "date_selected_availability";
      nextStep =
        slots.length > 0 ? "esperando_opcion_horario" : "esperando_fecha";
    }

    if (
      !reply &&
      selectedServicesNow.length > 0 &&
      !nextContext.preferred_staff_mode &&
      nextStep !== "esperando_seleccion_servicios"
    ) {
      reply = buildSelectedServicesMessage(selectedServicesNow, bookingNotes);
      matchedSource = "request_staff_preference";
      nextStep = "esperando_tecnica";
    }

    if (!reply && ai.wants_prices_or_menu) {
      const menuAsset = getAssetByKey(mediaAssets, "menu_servicios");

      reply = `${mediaText(
        menuAsset,
        "Claro 💕 Te comparto nuestro menú de servicios. Aún falta configurar la imagen del menú en Multimedia del bot."
      )}\n\n¿Qué servicio o servicios te interesan?`;

      matchedSource = "menu_services";
      nextStep = "esperando_servicios";
    }

    if (!reply) {
      const text = normalizeText(incomingMessage);

      const menuOption = menuOptions.find((item) => {
        return (
          text === String(item.option_order || "") ||
          text === normalizeText(item.option_key) ||
          text === normalizeText(item.option_label)
        );
      });

      if (menuOption) {
        reply = menuOption.response_message || `Elegiste: ${menuOption.option_label}`;
        matchedSource = "menu_option";

        if (menuOption.option_key === "agendar") {
          reply = "Perfecto 💕 ¿Qué servicio o servicios te gustaría agendar?";
          nextStep = "esperando_servicios";
          nextContext.selected_services = [];
          nextContext.pending_service_options = [];
          nextContext.available_options = [];
        } else if (menuOption.option_key === "servicios") {
          const menuAsset = getAssetByKey(mediaAssets, "menu_servicios");

          reply = `${mediaText(
            menuAsset,
            "Claro 💕 Te comparto nuestro menú de servicios. Aún falta configurar la imagen del menú en Multimedia del bot."
          )}\n\n¿Qué servicio o servicios te interesan?`;

          nextStep = "esperando_servicios";
        }
      }

      if (!reply) {
        if (text === "1") {
          reply = "Perfecto 💕 ¿Qué servicio o servicios te gustaría agendar?";
          matchedSource = "default_menu_appointment";
          nextStep = "esperando_servicios";
          nextContext.selected_services = [];
          nextContext.pending_service_options = [];
          nextContext.available_options = [];
        } else if (text === "2") {
          reply = buildServicesCatalogResponse(services);
          matchedSource = "default_menu_services";
          nextStep = "esperando_servicios";
        } else if (text === "3") {
          reply = buildPromotionsResponse(
            settings,
            knowledgeItems,
            menuOptions,
            mediaAssets
          );
          matchedSource = "default_menu_promotions";
        } else if (text === "4") {
          reply = buildLocationResponse({
            settings,
            faqs,
            knowledgeItems,
            mediaAssets,
            isFirstMessage: false,
          });
          matchedSource = "default_menu_location";
        } else if (text === "5") {
          reply = BUSINESS_HOURS_MESSAGE;
          matchedSource = "default_menu_hours";
        } else if (text === "6") {
          reply =
            settings?.human_help_message ||
            "Claro 💕 Una persona del equipo dará seguimiento a tu conversación.";
          matchedSource = "default_menu_human_help";
          nextStep = "humano";
        }
      }
    }

    if (!reply && ai.intent === "human_help") {
      reply =
        settings?.human_help_message ||
        "Claro 💕 Te voy a comunicar con una persona del salón para que pueda apoyarte.";
      matchedSource = "human_help";
      nextStep = "humano";
    }

    if (!reply && ai.intent === "greeting") {
      reply = buildMenuResponse(settings, menuOptions);
      matchedSource = "menu";
      nextStep = null;
    }

    if (!reply) {
      if (matchedKnowledge) {
        reply = await generateKnowledgeReplyWithAI({
          incomingMessage,
          recentMessages,
          matchedKnowledge,
        });
        matchedSource = matchedKnowledge.type;
      }
    }

    if (!reply) {
      const aiReply = await generateAssistantReplyWithAI({
        incomingMessage,
        recentMessages,
        settings,
        faqs,
        knowledgeItems,
        services,
        menuOptions,
        mediaAssets,
        context: nextContext,
        ai,
        matchedKnowledge,
        isFirstMessage,
      });

      if (aiReply) {
        reply = aiReply;
        matchedSource = "openai_assistant";
      }
    }

    if (!reply) {
      reply =
        settings?.fallback_message ||
        "Disculpa, no logré entenderte bien. Puedes escribir “menú” para ver las opciones disponibles.";
      matchedSource = "fallback";
    }

    reply = sanitizeBotReply(reply);

    const savedConversation = await saveConversation(
      supabase,
      clientPhoneFromTest,
      clientNameFromTest,
      {
        status: nextStep === "humano" ? "pendiente" : "abierta",
        last_message: incomingMessage,
        intent: ai.intent,
        current_step: nextStep,
        booking_step: nextStep,
        selected_services: nextContext.selected_services || [],
        requested_date: nextContext.requested_date || null,
        requested_time: nextContext.selected_slot?.start_time || null,
        preferred_staff_id: nextContext.preferred_staff_id || null,
        preferred_staff_mode: nextContext.preferred_staff_mode || null,
        deposit_required:
          Array.isArray(nextContext.selected_services) &&
          nextContext.selected_services.length > 0
            ? nextContext.selected_services.length * 100
            : null,
        conversation_context: nextContext,
      }
    );

    const appointmentRequestSaved = await saveAppointmentRequest(supabase, {
      conversationId: savedConversation.id,
      clientPhone: clientPhoneFromTest,
      clientName: clientNameFromTest,
      context: nextContext,
      ai,
      incomingMessage,
    });

    await saveBotMessages(
      supabase,
      savedConversation.id,
      clientPhoneFromTest,
      incomingMessage,
      reply,
      body,
      {
        matchedSource,
        ai,
        nextStep,
      }
    );

    return NextResponse.json({
      ok: true,
      reply,
      intent: ai.intent,
      matchedSource,
      ai,
      step: nextStep,
      appointmentRequestSaved: Boolean(appointmentRequestSaved),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Error inesperado al probar el bot.",
      },
      { status: 500 }
    );
  }
}
