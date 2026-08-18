import { NextResponse } from "next/server";
import {
  createAdminClient,
  getSessionProfile,
  normalizeRole,
} from "../../../lib/pushServer";
import { getAvailability as getSafeAvailability } from "../../../lib/bookingAvailability";
import {
  executeBotTurn,
} from "../../../lib/botConversationEngine";
import {
  botAppointmentWritesEnabled,
  createAppointmentFromConfirmedPreview,
  maskIdempotencyKey,
} from "../../../lib/botAppointmentOrchestrator";
import { createReadOnlyBotAppointmentRepository } from "../../../lib/botAppointmentRepository";
import OpenAI from "openai";

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const aiEnabled = process.env.BOT_AI_ENABLED === "true";
const AI_RULES_FALLBACK_MESSAGE =
  "IA no conectada. El bot está funcionando con reglas básicas.";
let openaiClient = null;

function accessErrorResponse(status) {
  return NextResponse.json(
    {
      ok: false,
      error:
        status === 401
          ? "Tu sesión expiró. Vuelve a iniciar sesión."
          : "No tienes permiso para usar el probador del bot.",
    },
    { status }
  );
}

async function authorizeAdminRequest(request) {
  const supabase = createAdminClient();
  const session = await getSessionProfile(request, supabase);

  if (session.error) {
    return {
      response: accessErrorResponse(session.status === 401 ? 401 : 403),
    };
  }

  if (normalizeRole(session.profile?.role) !== "admin") {
    return { response: accessErrorResponse(403) };
  }

  return { supabase, session };
}

const SALON_TIME_ZONE = "America/Mexico_City";
const SALON_NAME = "Alexandra Ruiz Salón";
const APPOINTMENT_DEPOSIT_AMOUNT = 100;
const APPOINTMENT_DEPOSIT_MESSAGE =
  "Te comento que las citas se agendan con un anticipo de $100, que se descontará de tu total a pagar.";
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

function removeInternalReplyLines(reply) {
  return String(reply || "")
    .split("\n")
    .filter((line) => {
      const text = normalizeText(line).replace(/^[-*•]\s*/, "");

      return !(
        text.startsWith("nota:") ||
        text.startsWith("notas:") ||
        text.startsWith("nombres:") ||
        text.startsWith("resumen:") ||
        text.startsWith("reservas separadas") ||
        text.startsWith("cita para dos personas:") ||
        text.startsWith("el mensaje actual selecciona")
      );
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeBotReply(reply) {
  return removeInternalReplyLines(reply)
    .replace(/Alexandra Ruiz Sal[oó]n Spa/gi, SALON_NAME)
    .replace(/Alexandra Ruiz Salon Spa/gi, "Alexandra Ruiz Salon")
    .replace(/Alexandra Ruiz Sal[oó]n\s+&\s+Spa/gi, SALON_NAME)
    .replace(/(?:💕|✨|🔗|🖼️)/gu, "")
    .trim();
}

function startsNewBookingConversation(message) {
  const text = normalizeText(message);
  const startsWithGreeting =
    text.startsWith("hola") ||
    text.startsWith("buen dia") ||
    text.startsWith("buenas");
  const hasNewBookingIntent =
    text.includes("quiero cita") ||
    text.includes("quisiera cita") ||
    text.includes("nueva cita") ||
    text.includes("quiero agendar") ||
    text.includes("quisiera agendar") ||
    text.includes("tienen espacio") ||
    text.includes("hay espacio");
  const hasNewServiceInquiry =
    (text.includes("hacen") ||
      text.includes("manejan") ||
      asksCatalogOrPrice(text)) &&
    (mentionsPedicureTopic(text) ||
      mentionsLashesTopic(text) ||
      mentionsGelishTopic(text) ||
      text.includes("escultural") ||
      text.includes("acril"));

  return startsWithGreeting && (hasNewBookingIntent || hasNewServiceInquiry);
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

function parseRequestedDate(rawText) {
  const text = normalizeText(rawText);
  const textWithoutMorningPeriod = text.replace(
    /\b(?:en|por|de) la manana\b/g,
    ""
  );
  const today = todayISO();
  if (!text) return null;

  if (text.includes("pasado manana") || text.includes("pasado mañana")) return addDaysISO(today, 2);
  if (text.includes("hoy")) return today;
  if (
    textWithoutMorningPeriod.includes("manana") ||
    textWithoutMorningPeriod.includes("mañana")
  ) {
    return addDaysISO(today, 1);
  }

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
    text.match(/(?:a las|alas|para las|antes de las|despues de las|después de las|desde las|a partir de las)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/) ||
    text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);

  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const suffix = match[3];

  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  const explicitlyMorning =
    text.includes("de la mañana") ||
    text.includes("de la manana") ||
    text.includes("en la mañana") ||
    text.includes("en la manana") ||
    text.includes("por la mañana") ||
    text.includes("por la manana");
  if (!suffix && hour >= 1 && hour <= 8 && !explicitlyMorning) hour += 12;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function parseTimePreference(rawText) {
  // Regresión manual del probador:
  // - Uñas y pedi mañana antes de las 12 con cualquiera.
  // - Lifting y ceja el sábado en la tarde.
  // - Cita con Alexandra a las 4.
  // - Primera vez con pedicure.
  // - Lo más temprano para retoque.
  // - Ya transferí el anticipo.
  const text = normalizeText(rawText);
  const explicit = parseExplicitTime(text);
  const wantsEarliest =
    text.includes("lo mas temprano") || text.includes("lo más temprano");

  if (text.includes("antes de las") && explicit !== null) {
    return { mode: "before", minutes: null, maximumMinutes: explicit };
  }

  if (text.includes("despues") || text.includes("después") || text.includes("desde") || text.includes("a partir")) {
    if (explicit !== null) return { mode: "after", minutes: explicit };
  }

  if (explicit !== null) return { mode: "exact", minutes: explicit };

  if (text.includes("noche")) {
    return {
      mode: wantsEarliest ? "earliest" : "night",
      minutes: 18 * 60 + 31,
      maximumMinutes: null,
    };
  }

  if (text.includes("tarde")) {
    return {
      mode: wantsEarliest ? "earliest" : "afternoon",
      minutes: 12 * 60,
      maximumMinutes: 18 * 60 + 31,
    };
  }

  if (
    text.includes("en la mañana") ||
    text.includes("en la manana") ||
    text.includes("por la mañana") ||
    text.includes("por la manana") ||
    text.includes("temprano")
  ) {
    return {
      mode: wantsEarliest ? "earliest" : "morning",
      minutes: 8 * 60,
      maximumMinutes: 12 * 60,
    };
  }

  if (wantsEarliest) {
    return { mode: "earliest", minutes: null, maximumMinutes: null };
  }

  return { mode: "any", minutes: null, maximumMinutes: null };
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

function asksAvailability(text) {
  const value = normalizeText(text);

  return (
    value.includes("tienen espacio") ||
    value.includes("hay espacio") ||
    value.includes("tienen disponibilidad") ||
    value.includes("hay disponibilidad") ||
    value.includes("pueden atender")
  );
}

function asksPaymentProof(text) {
  const t = normalizeText(text);
  return t.includes("ya pague") || t.includes("ya pagué") || t.includes("ya transferi") || t.includes("ya transferí") || t.includes("comprobante") || t.includes("anticipo enviado") || t.includes("te mande el pago") || t.includes("te mandé el pago");
}

function isAffirmativeReply(text) {
  const value = normalizeText(text);

  return (
    value === "si" ||
    value === "ok" ||
    value === "okay" ||
    value === "va" ||
    value === "claro" ||
    value === "de acuerdo" ||
    value === "por favor"
  );
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
    t.includes("quitan") ||
    t.includes("retira") ||
    t.includes("retiran") ||
    t.includes("uñero") ||
    t.includes("unero") ||
    t.includes("encarnada") ||
    t.includes("enterrada") ||
    t.includes("me duele") ||
    t.includes("cuanto cuesta ese") ||
    /^ese\b/.test(t) ||
    t.includes("ese servicio")
  );
}

function hasNormalizedWord(value, word) {
  const text = normalizeText(value);
  const normalizedWord = normalizeText(word);

  if (!text || !normalizedWord) return false;

  return new RegExp(`(^|\\s)${normalizedWord}(\\s|$)`).test(text);
}

function mentionsPedicureTopic(value) {
  const text = normalizeText(value);

  return (
    hasNormalizedWord(text, "pedi") ||
    text.includes("pedicure") ||
    text.includes("pedicura") ||
    text.includes("acripie") ||
    text.includes("pies") ||
    hasNormalizedWord(text, "pie")
  );
}

function mentionsGelishTopic(value) {
  const text = normalizeText(value);

  return (
    text.includes("gelish") ||
    text.includes("gel semi") ||
    text.includes("gel semipermanente") ||
    text.includes("semi permanente") ||
    text.includes("semipermanente") ||
    text.includes("solo gel") ||
    text.includes("aplicacion de gel") ||
    text.includes("aplicación de gel") ||
    (text.includes("gel") && text.includes("sin manicure"))
  );
}

function mentionsLashesTopic(value) {
  const text = normalizeText(value);

  return (
    text.includes("pestana") ||
    text.includes("pestaña") ||
    text.includes("pestanas") ||
    text.includes("pestañas") ||
    text.includes("lifting") ||
    text.includes("hawaiano") ||
    text.includes("volumen 4d")
  );
}

function hasLashesConversationContext(context = {}) {
  return mentionsLashesTopic(
    `${context.active_topic || ""} ${context.active_service_focus || ""}`
  );
}

function asksCatalogOrPrice(value) {
  const text = normalizeText(value);

  return (
    text.includes("precio") ||
    text.includes("cuanto cuesta") ||
    text.includes("cuánto cuesta") ||
    text.includes("costo") ||
    text.includes("cuestan") ||
    text.includes("cuales tienen") ||
    text.includes("cuáles tienen") ||
    text.includes("opciones")
  );
}

function asksNaturalLashes(value) {
  const text = normalizeText(value);
  return (
    text === "natural" ||
    text === "sutil" ||
    text.includes("pestanas naturales") ||
    text.includes("pestañas naturales") ||
    text.includes("efecto natural") ||
    text.includes("algo sutil")
  );
}

function buildPedicurePriceCatalog() {
  return `Claro. Manejamos varias opciones de pedicure:

1. Pedicure seco — $180
2. Pedicure seco con gel — $225
3. Pedicure clásico — $300
4. Pedicure clásico con gel — $380
5. Pedicure spa — $399
6. Pedicure spa con gel — $445
7. Pedicure medicado — $500

Si el pedicure medicado requiere atención por una uña adicional, el costo es +$70.

¿Buscas algo express, spa o medicado?`;
}

function buildLashesPriceCatalog() {
  return `Estas son nuestras opciones de pestañas:

1. Lifting de pestañas con tinte — $370
2. Extensiones clásicas — $650
3. Extensiones efecto hawaiano — $750
4. Extensiones volumen 4D — $850

Si buscas un resultado natural o sutil, puedo ayudarte a elegir entre lifting y extensiones clásicas.`;
}

function buildNaturalLashesRecommendation() {
  return `Para un resultado natural o sutil te recomiendo:

1. Lifting de pestañas con tinte — $370, si quieres realzar tu pestaña natural.
2. Extensiones clásicas — $650, si quieres un efecto natural con más longitud y volumen.

¿Cuál de las dos opciones prefieres?`;
}

function getLashesCatalogChoice(value) {
  const text = normalizeText(value);
  const choices = [
    {
      number: "1",
      name: "Lifting de pestañas con tinte",
      price: 370,
      matches: ["lifting"],
    },
    {
      number: "2",
      name: "Extensiones clásicas",
      price: 650,
      matches: ["clasica", "clasicas", "clásica", "clásicas"],
    },
    {
      number: "3",
      name: "Extensiones efecto hawaiano",
      price: 750,
      matches: ["hawaiano"],
    },
    {
      number: "4",
      name: "Extensiones volumen 4D",
      price: 850,
      matches: ["4d", "volumen"],
    },
  ];

  return (
    choices.find((choice) => text === choice.number) ||
    choices.find((choice) =>
      choice.matches.some((match) => text.includes(normalizeText(match)))
    ) ||
    null
  );
}

function asksStandaloneGelishHands(message) {
  const text = normalizeText(message);

  if (asksGelishRemovalQuestion(message)) return false;

  const clearlyStandalone =
    text.includes("solo gelish") ||
    text.includes("solo gel") ||
    text.includes("sin manicure") ||
    text.includes("solo aplicacion") ||
    text.includes("solo aplicación") ||
    text.includes("aplicacion de gelish") ||
    text.includes("aplicación de gelish") ||
    text.includes("gel semi") ||
    text.includes("semipermanente");

  return mentionsGelishTopic(text) && clearlyStandalone;
}

function asksGelishRemovalQuestion(message) {
  const text = normalizeText(message);

  const mentionsRemoval =
    text.includes("retiro") ||
    text.includes("retirar") ||
    text.includes("retiran") ||
    text.includes("retira") ||
    text.includes("quitar") ||
    text.includes("quitan") ||
    text.includes("quita");

  const asksCost =
    text.includes("costo") ||
    text.includes("cuesta") ||
    text.includes("precio") ||
    text.includes("cobran") ||
    text.includes("tiene costo");

  return mentionsGelishTopic(text) && (mentionsRemoval || asksCost);
}

function asksPedicureIngrownNailQuestion(message, context = {}, recentMessages = []) {
  const text = normalizeText(message);
  const recentText = normalizeText(
    `${context?.active_topic || ""} ${context?.active_service_focus || ""} ${
      (recentMessages || []).map((item) => item.body || "").join(" ")
    }`
  );

  const mentionsUnero =
    text.includes("uñero") ||
    text.includes("unero") ||
    text.includes("encarnada") ||
    text.includes("enterrada") ||
    text.includes("enterrado") ||
    text.includes("molestia") ||
    text.includes("me duele") ||
    text.includes("duele") ||
    text.includes("dolor");

  if (!mentionsUnero) return false;

  return (
    mentionsPedicureTopic(text) ||
    mentionsPedicureTopic(recentText) ||
    recentText.includes("pedicure") ||
    recentText.includes("pedicure en seco")
  );
}

function buildPedicureIngrownNailReply() {
  return "No, el pedicure en seco es un servicio express y no incluye retiro de uñeros profundos ni atención de uñas encarnadas. Si tienes molestia, uñero o algo enterrado, lo ideal es valoración o pedicure medicado según el caso.\n\n¿Te gustaría que te ayude a elegir la mejor opción?";
}

function findMentionedServiceForExplanation(message, options, services) {
  const text = normalizeText(message);
  const candidates = [...(options || []), ...(services || [])];
  const unique = Array.from(
    new Map(candidates.filter((service) => service?.id).map((service) => [service.id, service])).values()
  );
  const scopedUnique = mentionsPedicureTopic(text)
    ? unique.filter(isPedicureService)
    : unique;

  const aliases = [
    { keys: ["acripie"], match: (service) => normalizeServiceText(service).includes("acripie") },
    { keys: ["medicado"], match: (service) => normalizeServiceText(service).includes("medicado") },
    { keys: ["en seco", "seco"], match: (service) => normalizeServiceText(service).includes("seco") },
    { keys: ["spa"], match: (service) => normalizeServiceText(service).includes("spa") },
    { keys: ["clasico", "clásico"], match: (service) => normalizeServiceText(service).includes("clasico") },
  ];

  for (const alias of aliases) {
    if (alias.keys.some((key) => text.includes(normalizeText(key)))) {
      const matches = scopedUnique.filter(alias.match);
      if (matches.length > 0) return matches[0];
    }
  }

  return scopedUnique.find((service) => {
    const name = normalizeText(service.name);
    return name && text.includes(name);
  });
}

function buildServiceExplanationReply(message, service) {
  const text = normalizeText(message);
  const serviceText = normalizeServiceText(service);
  const price = Number(service?.base_price || 0);

  if (asksPedicureIngrownNailQuestion(message)) {
    return buildPedicureIngrownNailReply();
  }

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
  if (asksGelishRemovalQuestion(text)) return "retiro gelish";
  if (mentionsGelishTopic(text)) return "gelish manos";
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

function hasConfiguredPrice(service) {
  return Number(service?.base_price || 0) > 0;
}

function isActiveServiceRecord(service) {
  return service?.active !== false;
}

function getGelishHandsServiceScore(service) {
  if (!isActiveServiceRecord(service) || isPromotionService(service)) return -999;

  const name = normalizeText(service?.name);
  const category = normalizeText(service?.category);
  const keywords = normalizeText(service?.bot_keywords);
  const text = `${name} ${category} ${keywords}`;

  if (name.includes("retiro")) return -999;
  if (name.includes("pedicure") || name.includes("pedi") || name.includes("pies")) return -999;
  if (name.includes("manicure")) return -999;

  const hasGel =
    text.includes("gelish") ||
    text.includes("gel semi") ||
    text.includes("semipermanente") ||
    text.includes("semi permanente");

  if (!hasGel) return -999;

  let score = 0;

  if (name.includes("aplicacion") || name.includes("aplicación")) score += 80;
  if (name.includes("gel semi permanente") || name.includes("gel semipermanente")) score += 160;
  if (name.includes("gelish")) score += 150;
  if (name.includes("manos") || name.includes("mano")) score += 140;
  if (category.includes("manos") || category.includes("uñas")) score += 30;
  if (hasConfiguredPrice(service)) score += 25;

  return score;
}

function findGelishHandsService(services = []) {
  const candidates = services
    .map((service) => ({
      service,
      score: getGelishHandsServiceScore(service),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.service || null;
}

function findGelishRemovalServices(services = []) {
  return services
    .filter((service) => {
      if (!isActiveServiceRecord(service) || isPromotionService(service)) return false;

      const name = normalizeText(service?.name);
      const category = normalizeText(service?.category);
      const keywords = normalizeText(service?.bot_keywords);
      const description = normalizeText(service?.description);
      const text = `${name} ${category} ${keywords} ${description}`;

      const mentionsRemoval =
        text.includes("retiro") ||
        text.includes("retirar") ||
        text.includes("remocion") ||
        text.includes("remoción");

      const mentionsGel =
        text.includes("gelish") ||
        text.includes("gel semi") ||
        text.includes("semipermanente") ||
        text.includes("semi permanente") ||
        hasNormalizedWord(text, "gel");

      return mentionsRemoval && mentionsGel;
    })
    .sort((a, b) => {
      const aText = normalizeServiceText(a);
      const bText = normalizeServiceText(b);
      const aScore =
        (aText.includes("gelish") ? 20 : 0) +
        (aText.includes("externo") ? 10 : 0) +
        (hasConfiguredPrice(a) ? 5 : 0);
      const bScore =
        (bText.includes("gelish") ? 20 : 0) +
        (bText.includes("externo") ? 10 : 0) +
        (hasConfiguredPrice(b) ? 5 : 0);

      return bScore - aScore;
    });
}

function hasSelectedPedicureClassicForSecondPerson(context) {
  const selectedServices = Array.isArray(context?.selected_services)
    ? context.selected_services
    : [];
  const hasClassicPedicure = selectedServices.some((service) => {
    const text = normalizeServiceText(service);
    return text.includes("pedicure") && text.includes("clasico");
  });

  const multiPersonRequests = Array.isArray(context?.multi_person_requests)
    ? context.multi_person_requests
    : [];
  const mentionsSecondPerson = multiPersonRequests.some((request) => {
    const text = normalizeText(`${request?.person || ""} ${request?.label || ""}`);
    return (
      text.includes("mama") ||
      text.includes("mamá") ||
      text.includes("hija") ||
      text.includes("otra")
    );
  });

  return hasClassicPedicure && mentionsSecondPerson;
}

function buildGelishHandsReply(service, context = {}) {
  if (!service || !hasConfiguredPrice(service)) {
    return "Sí, manejamos solo aplicación de Gel Semi Permanente en manos. Permíteme confirmar el precio exacto con el equipo. No incluye manicure en seco ni manicure clásico.";
  }

  const followUp = hasSelectedPedicureClassicForSecondPerson(context)
    ? "\n\n¿Deseas agendarlo junto con el Pedicure Clásico de tu mamá?"
    : "\n\n¿Deseas que te ayude a agendarlo?";

  return `Sí, manejamos solo aplicación de Gel Semi Permanente en manos. Tiene costo de ${getServicePriceText(
    service
  )}. No incluye manicure en seco ni manicure clásico.${followUp}`;
}

function buildGelishRemovalReply(services = []) {
  const removalServices = findGelishRemovalServices(services);

  if (removalServices.length === 1) {
    const [service] = removalServices;

    if (hasConfiguredPrice(service)) {
      return `${service.name} tiene costo de ${getServicePriceText(
        service
      )}.\n\nPuede depender de si el gel fue realizado con nosotras o viene de otro lugar. Si gustas, te ayudo a confirmarlo con el equipo.`;
    }

    return `Sí manejamos ${service.name}, pero no veo el precio exacto configurado. Permíteme confirmarlo con el equipo.`;
  }

  if (removalServices.length > 1) {
    const options = removalServices
      .slice(0, 5)
      .map((service) => {
        const price = hasConfiguredPrice(service)
          ? ` — ${getServicePriceText(service)}`
          : " — precio por confirmar";

        return `• ${service.name}${price}`;
      })
      .join("\n");

    return `Tenemos estas opciones de retiro relacionadas con Gelish/gel:\n\n${options}\n\nPuede depender de si el gel fue realizado con nosotras o viene de otro lugar. Te ayudo a confirmarlo con el equipo si lo necesitas.`;
  }

  return "Puede depender de si el gel fue realizado con nosotras o viene de otro lugar. Te ayudo a confirmarlo con el equipo.";
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
  allServices = services,
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

  if (asksPedicureIngrownNailQuestion(incomingMessage, context, recentMessages)) {
    return {
      reply: buildPedicureIngrownNailReply(),
      topic: "pedicure",
      serviceFocus: "pedicure en seco / pedicure medicado",
    };
  }

  if (mentionsPedicureTopic(text) && asksCatalogOrPrice(text)) {
    return {
      reply: buildPedicurePriceCatalog(),
      topic: "pedicure",
      serviceFocus: "pedicure",
    };
  }

  if (
    mentionsLashesTopic(text) ||
    (hasLashesConversationContext(context) && asksCatalogOrPrice(text))
  ) {
    const shouldShowCatalog =
      asksCatalogOrPrice(text) || hasLashesConversationContext(context);

    return {
      reply: asksNaturalLashes(text)
        ? buildNaturalLashesRecommendation()
        : shouldShowCatalog
        ? buildLashesPriceCatalog()
        : "Sí, manejamos lifting y extensiones de pestañas. ¿Te gustaría conocer las opciones y precios?",
      topic: "pestañas",
      serviceFocus: asksNaturalLashes(text)
        ? "pestañas naturales"
        : "pestañas",
    };
  }

  if (asksGelishRemovalQuestion(incomingMessage)) {
    return {
      reply: buildGelishRemovalReply(allServices),
      topic: "retiro gelish",
      serviceFocus: "retiro gelish",
    };
  }

  if (asksStandaloneGelishHands(incomingMessage)) {
    const gelishService = findGelishHandsService(allServices);

    return {
      reply: buildGelishHandsReply(gelishService, context),
      topic: "gelish manos",
      serviceFocus: "Aplicación de Gel Semi Permanente Manos",
      selectedService: gelishService,
    };
  }

  if (text.includes("escultural")) {
    const esculturalService = (services || []).find((service) => {
      const serviceText = normalizeServiceText(service);
      return serviceText.includes("escultural") && isServiceBookable(service);
    });
    const priceText = `$${getEsculturalesAcrylicPrice(services)}`;

    if (text.includes("cuanto cuesta") || text.includes("cuánto cuesta") || text.includes("precio")) {
      return {
        reply: `Las esculturales de acrílico tienen costo de ${priceText} en largo base #2. El largo extra tiene costo adicional de +$50 y el diseño se cotiza según lo que elijas.\n\n¿Te gustaría agendarlas?`,
        topic: "extensiones",
        serviceFocus: "esculturales",
        selectedService: esculturalService,
      };
    }

    return {
      reply: `Sí, manejamos uñas esculturales. Las esculturales de acrílico tienen costo de ${priceText} en largo base #2. Si deseas largo mayor o diseño, puede tener costo adicional.\n\n¿Te gustaría agendarlas?`,
      topic: "extensiones",
      serviceFocus: "esculturales",
      selectedService: esculturalService,
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
  if (!service) return false;

  const group = normalizeText(service?.bot_service_group);
  const name = normalizeText(service?.name);
  const category = normalizeText(service?.category);
  const keywords = normalizeText(service?.bot_keywords);
  const focusedText = `${name} ${category} ${keywords}`;

  return (
    group === "pedicure" ||
    name.includes("pedicure") ||
    name.includes("pedicura") ||
    name.includes("acripie") ||
    category.includes("pedicure") ||
    category.includes("pedicura") ||
    keywords.includes("pedicure") ||
    keywords.includes("pedicura") ||
    focusedText.includes("uñas de los pies") ||
    focusedText.includes("unas de los pies") ||
    focusedText.includes("uña para pie") ||
    focusedText.includes("una para pie") ||
    hasNormalizedWord(focusedText, "pies") ||
    hasNormalizedWord(focusedText, "pie")
  );
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

function isPromotionService(service) {
  const text = normalizeServiceText(service);

  return (
    text.includes("promo") ||
    text.includes("promocion") ||
    text.includes("promoción") ||
    text.includes("paquete")
  );
}

function isHandsNailService(service) {
  if (!service || isHairService(service) || isFeetService(service) || isBrowsOrLashesService(service) || isDesignOrExtraService(service) || isPromotionService(service)) {
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
  if (!service || isHairService(service) || isBrowsOrLashesService(service) || isDesignOrExtraService(service) || isPromotionService(service)) {
    return false;
  }

  const group = normalizeText(service?.bot_service_group);
  const text = normalizeServiceText(service);
  const name = normalizeText(service?.name);
  const category = normalizeText(service?.category);

  if (
    [
      "manicure",
      "manos",
      "mano",
      "depilacion",
      "depilación",
      "patilla",
      "patillas",
      "ceja",
      "cejas",
      "pestana",
      "pestaña",
      "pestanas",
      "pestañas",
      "cabello",
      "nanoplastia",
      "promo",
      "promocion",
      "promoción",
      "paquete",
    ].some((keyword) => text.includes(normalizeText(keyword)))
  ) {
    return false;
  }

  if (
    name.includes("pedicure") ||
    name.includes("pedicura") ||
    name.includes("acripie") ||
    category.includes("pedicure") ||
    category.includes("pedicura")
  ) {
    return true;
  }

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
  if (isPromotionService(service)) return false;
  if (text.includes("retiro")) return false;
  if (isDesignOrExtraService(service)) return false;
  if (text.includes("uña para pie") || text.includes("una para pie") || text.includes("reconstruccion estetica de una para pie")) return false;
  return true;
}

function isPublicBotService(service) {
  if (!service || service.bot_active === false) return false;

  const name = normalizeText(service.name);

  // Este servicio permanece disponible para la agenda interna, pero nunca se
  // muestra ni se selecciona desde conversaciones de clientas.
  if (
    name.includes("relleno") &&
    name.includes("acril") &&
    name.includes("cliente frecuente")
  ) {
    return false;
  }

  return true;
}

function asksAcrylicFillReview(message) {
  const text = normalizeText(message);

  return (
    text.includes("relleno") &&
    (text.includes("acril") || text.includes("uñas acril") || text.includes("unas acril"))
  );
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

function getGelishHandsOptions(services) {
  const service = findGelishHandsService(services);
  return service ? [service] : [];
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
    } else if (mentionsGelishTopic(query)) {
      options = getGelishHandsOptions(services);
    } else if (
      query === "unas acrilicas" ||
      query === "uñas acrilicas" ||
      query === "acrilicas" ||
      query === "acrílicas"
    ) {
      options = getAcrylicOptions(services);
    }

    if (options.length === 1) {
      const [option] = options;

      if (!seenSelected.has(option.id)) {
        selected.push(option);
        seenSelected.add(option.id);
      }
      continue;
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

function detectsSecondPersonRequest(message) {
  const text = normalizeText(message);

  return (
    text.includes("otra cita") ||
    text.includes("dos personas") ||
    text.includes("para dos") ||
    text.includes("somos dos") ||
    text.includes("para mi mama y para mi") ||
    text.includes("para mi y mi mama") ||
    text.includes("para mi mama") ||
    text.includes("para mi mamá") ||
    text.includes("para mi hija") ||
    text.includes("para mi hermana") ||
    text.includes("para mi amiga") ||
    text.includes("mi mama y yo") ||
    text.includes("mi hermana y yo") ||
    text.includes("mi amiga y yo")
  );
}

function detectsTwoPersonGelHandsRequest(message) {
  const text = normalizeText(message);
  const explicitlyTwo =
    text.includes("dos personas") ||
    text.includes("para dos") ||
    text.includes("somos dos") ||
    ((text.includes("mi mama") || text.includes("mi mamá")) &&
      (text.includes("y para mi") ||
        text.includes("y para mí") ||
        text.includes("y yo") ||
        text.includes("las dos")));

  return (
    explicitlyTwo &&
    mentionsGelishTopic(text) &&
    !mentionsPedicureTopic(text)
  );
}

function detectsMultiPersonGelPedicureRequest(message) {
  const text = normalizeText(message);

  return (
    detectsSecondPersonRequest(text) &&
    text.includes("gel") &&
    mentionsPedicureTopic(text)
  );
}

function getInitialMultiPersonRequests(message) {
  if (detectsTwoPersonGelHandsRequest(message)) {
    return [
      {
        key: "person_1",
        label: "Primera persona",
        service_query: "gelish manos",
        status: "needs_arrangement",
      },
      {
        key: "person_2",
        label: "Segunda persona",
        service_query: "gelish manos",
        status: "needs_arrangement",
      },
    ];
  }

  if (detectsMultiPersonGelPedicureRequest(message)) {
    return [
      {
        key: "clienta",
        label: "Para ti",
        person: "clienta",
        service_query: "gel",
        status: "needs_service_detail",
      },
      {
        key: "mama",
        label: "Para tu mamá",
        person: "mamá",
        service_query: "pedicure",
        status: "needs_service_detail",
      },
    ];
  }

  if (!detectsSecondPersonRequest(message)) return [];

  return [
    {
      key: "person_1",
      label: "Primera persona",
      service_query: "",
      status: "needs_service",
    },
    {
      key: "person_2",
      label: "Segunda persona",
      service_query: "",
      status: "needs_service",
    },
  ];
}

function mergeMultiPersonRequests(existing = [], incoming = []) {
  const byKey = new Map();

  for (const request of [...existing, ...incoming]) {
    if (!request?.key) continue;
    byKey.set(request.key, {
      ...(byKey.get(request.key) || {}),
      ...request,
    });
  }

  return Array.from(byKey.values());
}

function updateMultiPersonRequestsWithSelectedServices(context, selectedServices = []) {
  const requests = Array.isArray(context?.multi_person_requests)
    ? context.multi_person_requests
    : [];

  if (requests.length === 0 || selectedServices.length === 0) {
    return requests;
  }

  return requests.map((request) => {
    const requestText = normalizeText(
      `${request?.service_query || ""} ${request?.service_name || ""}`
    );
    const isMamaPedicure =
      (request?.key === "mama" || requestText.includes("pedicure")) &&
      selectedServices.some(isPedicureService);
    const selectedPedicure = selectedServices.find(isPedicureService);
    const isClientGel =
      request?.key === "clienta" &&
      selectedServices.some((service) =>
        normalizeServiceText(service).includes("gel semi")
      );
    const selectedGelish = selectedServices.find((service) =>
      normalizeServiceText(service).includes("gel semi")
    );

    if (isMamaPedicure && selectedPedicure) {
      return {
        ...request,
        service_id: selectedPedicure.id,
        service_name: selectedPedicure.name,
        status: "service_selected",
      };
    }

    if (isClientGel && selectedGelish) {
      return {
        ...request,
        service_id: selectedGelish.id,
        service_name: selectedGelish.name,
        status: "service_selected",
      };
    }

    if (
      (request?.key === "person_1" || request?.key === "person_2") &&
      selectedServices.length > 0
    ) {
      return {
        ...request,
        service_ids: selectedServices.map((service) => service.id),
        service_names: selectedServices.map((service) => service.name),
        status: "service_selected",
      };
    }

    return request;
  });
}

function hasPendingClientGelRequest(context) {
  const requests = Array.isArray(context?.multi_person_requests)
    ? context.multi_person_requests
    : [];

  return requests.some((request) => {
    const text = normalizeText(`${request?.key || ""} ${request?.service_query || ""}`);
    return (
      request?.key === "clienta" &&
      text.includes("gel") &&
      !request?.service_id &&
      request?.status !== "service_selected"
    );
  });
}

function buildMultiPersonGelPedicureReply(services = []) {
  const pedicureOptions = getPedicureOptions(services);
  const optionsText = pedicureOptions.length
    ? `\n\nPara el pedicure de tu mamá, elige una opción:\n\n${pedicureOptions
        .map((service, index) => serviceLine(service, index + 1))
        .join("\n")}`
    : "\n\nPara el pedicure de tu mamá, dime si buscas Clásico, Spa, en Seco o Medicado.";

  return `Perfecto 💕 Revisamos dos citas:\n\n• Para ti: gel en manos. Necesito confirmar si deseas solo Gelish/Gel Semi Permanente o manicure con gel.\n• Para tu mamá: pedicure.${optionsText}\n\nPuedes responder con el número o el nombre del pedicure para tu mamá.`;
}

function buildPendingGelClarificationReply(context, requestedDate) {
  const selectedServices = Array.isArray(context?.selected_services)
    ? context.selected_services
    : [];
  const selectedPedicure = selectedServices.find(isPedicureService);
  const dateLine = requestedDate ? ` para ${formatDate(requestedDate)}` : "";

  return `Perfecto, revisamos${dateLine}:\n\n• Para ti: pendiente confirmar si deseas solo Gelish/Gel Semi Permanente en manos o manicure con gel.\n• Para tu mamá: ${
    selectedPedicure?.name || "pedicure"
  }.\n\nPara poder buscar espacios correctamente, ¿para ti sería solo Gelish sin manicure?`;
}

function extractBookingNotes(message, aiNotes = "") {
  const notes = [];
  const largo = String(message || "").match(/largo\s*#?\s*(\d+)/i);

  if (largo) notes.push(`Solicita largo #${largo[1]}.`);
  if (aiNotes && /^solicita largo #?\d+\.?$/i.test(aiNotes.trim())) {
    notes.push(aiNotes.trim());
  }

  return notes.join(" ").trim();
}

function mergeBookingNotes(existingNotes, newNotes) {
  const largoNotes = `${existingNotes || ""} ${newNotes || ""}`.match(
    /Solicita largo #?\d+\./gi
  );
  const uniqueNotes = Array.from(new Set(largoNotes || []));

  return uniqueNotes.join(" ");
}

function buildSelectedServicesMessage(services) {
  return `Perfecto 💕 Revisamos disponibilidad para:\n\n${services
    .map((service) => `• ${service.name}`)
    .join(
      "\n"
    )}\n\n¿Tienes técnica de preferencia?\n\n1. Laura Canul\n2. Tania Mendez\n3. Alexandra Ruiz\n4. La colaboradora disponible`;
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
  const tokens = t.split(/\s+/).filter(Boolean);
  const selectsAvailableOption =
    tokens.includes("4") &&
    tokens.every((token) => token === "4" || token === "opcion" || token === "la");

  if (!t) return null;

  if (
    selectsAvailableOption ||
    t === "any" ||
    t.includes("disponible") ||
    t.includes("cualquiera") ||
    t.includes("cualquier") ||
    t.includes("chica") ||
    t.includes("colaboradora") ||
    t.includes("quien sea") ||
    t.includes("quien tenga espacio") ||
    t.includes("sin preferencia") ||
    t.includes("prim") ||
    t.includes("primera vez") ||
    t.includes("la disponible")
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
function getLeadTimeForStaff(person) {
  const name = normalizeText(person.full_name);

  const match = Object.entries(STAFF_LEAD_TIME_MINUTES).find(([staffName]) =>
    name.includes(staffName)
  );

  return match ? match[1] : 20;
}

function getEstimatedTotal(services) {
  return (services || []).reduce((total, service) => {
    return total + Number(service.base_price || 0);
  }, 0);
}

function getTimeRangeLabel(timeMode) {
  if (timeMode === "morning") return "por la mañana";
  if (timeMode === "afternoon") return "por la tarde";
  if (timeMode === "night") return "por la noche";
  if (timeMode === "before") return "antes de la hora indicada";
  if (timeMode === "after") return "después de la hora indicada";
  return "";
}

function buildSlotsMessage(slots, selectedServices, dateString, preferredStaffName = "") {
  const servicesText = selectedServices.map((service) => service.name).join(" + ");
  const staffText = preferredStaffName ? ` con ${preferredStaffName}` : "";
  const rangeLabel = getTimeRangeLabel(slots?.timeMode);

  if (slots?.availabilityError) {
    return `No pude confirmar horarios exactos para ${servicesText}${staffText} el ${formatDate(
      dateString
    )}. ¿Prefieres que revise por la mañana, tarde o noche, o quieres intentar con otro día?`;
  }

  if (slots?.exactUnavailable) {
    const requestedTime = formatTime12(slots.requestedStartTime);

    if (slots.length === 0) {
      return `A las ${requestedTime} no tengo espacio disponible para ${servicesText}${staffText} el ${formatDate(
        dateString
      )}. Puedes indicarme otro horario para revisar más opciones.`;
    }

    const nearbyOptions = slots
      .map(
        (slot, index) =>
          `${index + 1}. ${formatTime12(slot.start_time)} con ${slot.staff_name}`
      )
      .join("\n");

    return `A las ${requestedTime} no tengo espacio disponible para ${servicesText}${staffText}, pero puedo ofrecerte estas opciones cercanas:\n\n${nearbyOptions}\n\nResponde con el número de la opción que prefieras.`;
  }

  if (!slots || slots.length === 0) {
    if (rangeLabel) {
      return `${rangeLabel.charAt(0).toUpperCase() + rangeLabel.slice(1)} no encontré espacios disponibles para ${servicesText}${staffText}. Puedo revisar otro rango u otro día.`;
    }

    return `Por el momento no encontré espacios disponibles para ${servicesText}${staffText} el ${formatDate(
      dateString
    )}. Puedes decirme otro día, otro horario o elegir la colaboradora disponible para revisar más opciones.`;
  }

  const optionsText = slots
    .map(
      (slot, index) =>
        `${index + 1}. ${formatTime12(slot.start_time)} con ${slot.staff_name}`
    )
    .join("\n");

  const rangeText = rangeLabel ? ` ${rangeLabel}` : "";

  return `Para el ${formatDate(dateString)}${rangeText} encontré estos espacios para ${servicesText}:\n\n${optionsText}\n\n¿Cuál prefieres?`;
}

function isTwoPersonGelHandsRequests(requests = []) {
  return (
    requests.length === 2 &&
    requests.every(
      (request) => normalizeText(request.service_query) === "gelish manos"
    )
  );
}

function isGenericTwoPersonRequest(requests = []) {
  return (
    requests.length === 2 &&
    requests.every((request) => !normalizeText(request.service_query))
  );
}

function buildTwoPersonGelHandsReply() {
  return "Claro, serían 2 citas de gel en manos. ¿Les gustaría venir juntas en horarios seguidos o solo revisar espacios disponibles para ambas?";
}

function getAvailabilityFeedback(slots) {
  if (slots?.availabilityError) {
    return {
      reason: "No fue posible revisar la disponibilidad en este momento.",
      alternatives: [],
    };
  }

  if (slots?.exactUnavailable) {
    return {
      reason: `La hora solicitada (${formatTime12(
        slots.requestedStartTime
      )}) no está disponible.`,
      alternatives: [...slots],
    };
  }

  if (!Array.isArray(slots) || slots.length === 0) {
    return {
      reason: "No hay horarios válidos para los datos solicitados.",
      alternatives: [],
    };
  }

  return { reason: null, alternatives: [] };
}

function buildAppointmentSummary({ services, slot, depositAmount }) {
  const servicesText = services.map((service) => `• ${service.name}`).join("\n");

  return `Perfecto 💕 Tengo estos datos para tu cita:\n\nServicios:\n${servicesText}\n\nFecha: ${formatDate(
    slot.date
  )}\nHora: ${formatTime12(slot.start_time)}\nColaboradora: ${
    slot.staff_name
  }\n\n${APPOINTMENT_DEPOSIT_MESSAGE}\nAnticipo requerido: $${depositAmount}.`;
}

function buildAppointmentPreview({ fullName, phone, birthday, services, slot, notes }) {
  const depositAmount = APPOINTMENT_DEPOSIT_AMOUNT;
  const estimatedTotal = getEstimatedTotal(services);

  return {
    client: {
      full_name: fullName,
      phone: onlyDigits(phone),
      birthday: birthday || null,
    },
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      price: Number(service.base_price || 0),
      duration_minutes: Number(service.duration_minutes || 0),
      cleanup_minutes: Number(service.cleanup_minutes || 0),
    })),
    slot: {
      date: slot.date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      staff_id: slot.staff_id,
      staff_name: slot.staff_name,
    },
    estimated_total: estimatedTotal,
    deposit_amount: depositAmount,
    notes: notes || "",
    status: "pending_review",
  };
}

function takeDepositMessage(context) {
  if (context.deposit_message_sent) return "";

  context.deposit_message_sent = true;
  return APPOINTMENT_DEPOSIT_MESSAGE;
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
    .map(
      (message) =>
        `${message.direction || ""}: ${removeInternalReplyLines(
          message.body || ""
        )}`
    )
    .filter((line) => !/:\s*$/.test(line))
    .join("\n");
}

function getConversationContextForAI(context = {}) {
  const selectedServices = Array.isArray(context.selected_services)
    ? context.selected_services.map((service) => ({
        id: service.id,
        name: service.name,
      }))
    : [];
  const multiPersonBooking = context.multi_person_booking
    ? {
        person_count: context.multi_person_booking.person_count,
        requires_separate_appointments:
          context.multi_person_booking.requires_separate_appointments === true,
        arrangement: context.multi_person_booking.arrangement || null,
        status: context.multi_person_booking.status || null,
      }
    : null;

  return {
    active_topic: context.active_topic || null,
    active_service_focus: context.active_service_focus || null,
    selected_services: selectedServices,
    requested_date: context.requested_date || null,
    time_mode: context.time_mode || "any",
    preferred_staff_mode: context.preferred_staff_mode || null,
    preferred_staff_name: context.preferred_staff_name || null,
    requires_service_confirmation:
      context.requires_service_confirmation === true,
    requested_lash_service: context.requested_lash_service || null,
    multi_person_booking: multiPersonBooking,
    deposit_message_sent: context.deposit_message_sent === true,
  };
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
- No uses emojis decorativos.
- No muestres etiquetas internas, nombres de intents, fuentes técnicas ni debug.
- Sé breve y útil. Si falta un dato, pregunta solo lo necesario.

Reglas de negocio:
- No inventes precios, promociones, direcciones, horarios ni disponibilidad.
- Cuando hables de servicios o precios, usa solo el catálogo provisto abajo. Si no hay precio exacto, di que se puede cotizar con más detalle.
- Usa primero FAQs/base de conocimiento cuando resuelva la pregunta.
- Si no sabes algo con certeza, ofrece pasar con una persona del equipo.
- No confirmes citas como registradas; solo ayuda a recopilar datos o guiar la conversación.
- Si la clienta quiere una persona, responde que una persona del equipo dará seguimiento.
- Si el tema actual es pedicure/pies, no cambies a esculturales, acrílico en manos, cabello ni otros servicios a menos que la clienta lo pida explícitamente.
- Solo hables de esculturales si el mensaje actual menciona "esculturales" o "uñas esculturales".
`.trim();

  const input = `
Mensaje actual:
${incomingMessage}

¿Es primer mensaje de la conversación?: ${isFirstMessage ? "sí" : "no"}

Últimos mensajes:
${formatRecentMessagesForSearch(recentMessages)}

Contexto interno resumido:
${truncateForAI(JSON.stringify(getConversationContextForAI(context), null, 2), 1600)}

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
  if (mentionsGelishTopic(text)) services.push("gelish manos");

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

function shouldUseLocalInterpretationBeforeAI(message) {
  const text = normalizeText(message);

  return (
    isGeneralPedicureRequest(message) ||
    asksPedicureIngrownNailQuestion(message) ||
    asksStandaloneGelishHands(message) ||
    asksGelishRemovalQuestion(message) ||
    detectsMultiPersonGelPedicureRequest(message) ||
    isServiceQuestionMessage(message) ||
    isGeneralNailOnly(text)
  );
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
- No redactes avisos ni recordatorios de anticipo. La ruta los agrega una sola vez cuando prepara o registra la cita.
- Si context.deposit_message_sent es true, no vuelvas a mencionar la política de anticipo.
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
- No respondas ni interpretes esculturales a menos que el mensaje actual mencione explícitamente "esculturales" o "uñas esculturales".
- Si pregunta por uñeros, uñas encarnadas, uñas enterradas o molestias en pedicure, conserva el tema pedicure y no lo mezcles con esculturales.
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
      input: `Devuelve únicamente un objeto JSON válido con la estructura indicada.\n\nContexto previo:\n${JSON.stringify(
        getConversationContextForAI(context),
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
    text.includes("lo mas temprano") ||
    text.includes("mas temprano") ||
    text.includes("lo antes posible") ||
    text.includes("primer espacio") ||
    text.includes("primer horario") ||
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
  maximumStartMinutes = null,
  timeMode = "any",
  maxDays = 21,
  allowMissingTimeBlocks = false,
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
      maximumStartMinutes,
      timeMode,
      allowMissingTimeBlocks,
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
function addSlotMetadata(slots, metadata = {}) {
  Object.assign(slots, metadata);
  return slots;
}

function normalizeSafeSlots(slots, dateString) {
  return (slots || [])
    .filter((slot) => {
      const staffName = normalizeText(slot.staff_name);
      return !EXCLUDED_STAFF_FOR_BOT.some((excluded) =>
        staffName.includes(excluded)
      );
    })
    .map((slot) => ({
      staff_id: slot.staff_id,
      staff_name: slot.staff_name,
      date: dateString,
      start_time: slot.start_time,
      end_time: slot.end_time,
    }));
}

function applyBotAvailabilityRules({
  slots,
  dateString,
  minimumStartMinutes,
  maximumStartMinutes,
  applyRequestedRange = true,
}) {
  const isToday = dateString === todayISO();
  const nowMinutes = getSalonNowMinutes();

  return slots.filter((slot) => {
    const startMinutes = timeToMinutes(slot.start_time);
    if (startMinutes === null) return false;

    if (isToday) {
      const leadTime = getLeadTimeForStaff({ full_name: slot.staff_name });
      if (startMinutes < nowMinutes + leadTime) return false;
    }

    if (
      applyRequestedRange &&
      minimumStartMinutes !== null &&
      minimumStartMinutes !== undefined &&
      startMinutes < minimumStartMinutes
    ) {
      return false;
    }

    if (
      applyRequestedRange &&
      maximumStartMinutes !== null &&
      maximumStartMinutes !== undefined &&
      startMinutes >= maximumStartMinutes
    ) {
      return false;
    }

    return true;
  });
}

async function loadSafeBotSlots({
  supabase,
  selectedServices,
  dateString,
  preferredStaffMode,
  preferredStaffId,
  requestedStartTime = "",
  allowMissingTimeBlocks = false,
}) {
  try {
    const result = await getSafeAvailability({
      adminSupabase: supabase,
      date: dateString,
      serviceIds: selectedServices.map((service) => service.id),
      preferredStaffId:
        preferredStaffMode === "specific" ? preferredStaffId || "" : "",
      requestedStartTime,
      limit: 240,
      allowMissingTimeBlocks,
    });

    if (
      result.warnings?.some(
        (warning) => warning.code === "staff_time_blocks_permission_denied"
      )
    ) {
      console.warn("Bot availability recovered without staff time blocks.", {
        code: "staff_time_blocks_permission_denied",
        date: dateString,
        serviceCount: selectedServices.length,
      });
    }

    return normalizeSafeSlots(result.slots, dateString);
  } catch (error) {
    console.warn("Bot availability lookup failed.", {
      code: String(error?.code || "availability_lookup_failed"),
      message: String(error?.message || "Unknown availability error"),
      date: dateString,
      serviceCount: selectedServices.length,
    });
    return addSlotMetadata([], { availabilityError: true });
  }
}

async function getAvailableSlots({
  supabase,
  selectedServices,
  dateString,
  preferredStaffMode,
  preferredStaffId,
  minimumStartMinutes = null,
  maximumStartMinutes = null,
  timeMode = "any",
  allowMissingTimeBlocks = false,
}) {
  const exactRequested =
    timeMode === "exact" &&
    minimumStartMinutes !== null &&
    minimumStartMinutes !== undefined;

  if (exactRequested) {
    const requestedStartTime = minutesToTime(minimumStartMinutes);
    const exactCandidates = await loadSafeBotSlots({
      supabase,
      selectedServices,
      dateString,
      preferredStaffMode,
      preferredStaffId,
      requestedStartTime,
      allowMissingTimeBlocks,
    });
    if (exactCandidates.availabilityError) {
      return addSlotMetadata([], {
        availabilityError: true,
        requestedStartTime,
        timeMode,
      });
    }
    const exactSlots = applyBotAvailabilityRules({
      slots: exactCandidates,
      dateString,
      minimumStartMinutes,
      maximumStartMinutes: null,
      applyRequestedRange: true,
    })
      .slice(0, 8)
      .map((slot, index) => ({ ...slot, option_number: index + 1 }));

    if (exactSlots.length > 0) {
      return addSlotMetadata(exactSlots, {
        requestedStartTime,
        exactUnavailable: false,
      });
    }

    const allCandidates = await loadSafeBotSlots({
      supabase,
      selectedServices,
      dateString,
      preferredStaffMode,
      preferredStaffId,
      allowMissingTimeBlocks,
    });
    if (allCandidates.availabilityError) {
      return addSlotMetadata([], {
        availabilityError: true,
        requestedStartTime,
        timeMode,
      });
    }
    const nearbySlots = applyBotAvailabilityRules({
      slots: allCandidates,
      dateString,
      minimumStartMinutes: null,
      maximumStartMinutes: null,
      applyRequestedRange: false,
    })
      .sort((a, b) => {
        const distanceA = Math.abs(
          timeToMinutes(a.start_time) - minimumStartMinutes
        );
        const distanceB = Math.abs(
          timeToMinutes(b.start_time) - minimumStartMinutes
        );

        if (distanceA !== distanceB) return distanceA - distanceB;
        return a.start_time.localeCompare(b.start_time);
      })
      .slice(0, 8)
      .map((slot, index) => ({ ...slot, option_number: index + 1 }));

    return addSlotMetadata(nearbySlots, {
      requestedStartTime,
      exactUnavailable: true,
    });
  }

  const safeSlots = await loadSafeBotSlots({
    supabase,
    selectedServices,
    dateString,
    preferredStaffMode,
    preferredStaffId,
    allowMissingTimeBlocks,
  });
  if (safeSlots.availabilityError) {
    return addSlotMetadata([], { availabilityError: true, timeMode });
  }
  const filteredSlots = applyBotAvailabilityRules({
    slots: safeSlots,
    dateString,
    minimumStartMinutes,
    maximumStartMinutes,
    applyRequestedRange: true,
  });

  const limitedSlots =
    timeMode === "earliest" ? filteredSlots.slice(0, 1) : filteredSlots.slice(0, 8);

  return addSlotMetadata(
    limitedSlots.map((slot, index) => ({
      ...slot,
      option_number: index + 1,
    })),
    {
      timeMode,
      minimumStartMinutes,
      maximumStartMinutes,
    }
  );
}

async function revalidateSelectedSlot({
  supabase,
  selectedServices,
  selectedSlot,
  allowMissingTimeBlocks = false,
}) {
  const options = await getAvailableSlots({
    supabase,
    selectedServices,
    dateString: selectedSlot.date,
    preferredStaffMode: "specific",
    preferredStaffId: selectedSlot.staff_id,
    minimumStartMinutes: timeToMinutes(selectedSlot.start_time),
    maximumStartMinutes: null,
    timeMode: "exact",
    allowMissingTimeBlocks,
  });
  const slot = options.find(
    (option) =>
      option.staff_id === selectedSlot.staff_id &&
      option.start_time === selectedSlot.start_time
  );

  return { slot: slot || null, options };
}

function mapLegacyIntentForEngine(intent) {
  const mapping = {
    book_appointment: "booking",
    ask_services: "ask_services",
    ask_location: "location",
    ask_business_hours: "business_hours",
    payment_proof: "deposit",
    human_help: "human_help",
    greeting: "greeting",
    reschedule: "reschedule",
    cancel: "cancel",
    unknown: "unknown",
  };

  return mapping[intent] || "unknown";
}

function buildEngineStateFromLegacy({ context, bookingStep }) {
  const stored = context.conversation_engine_state || {};

  return {
    ...stored,
    intent: stored.intent || context.intent || null,
    selectedServices:
      stored.selectedServices || context.selected_services || [],
    peopleCount:
      stored.peopleCount ||
      context.multi_person_booking?.person_count ||
      1,
    datePreference: stored.datePreference || context.requested_date || null,
    parsedDate: stored.parsedDate || context.requested_date || null,
    timePreference: stored.timePreference || context.time_mode || null,
    timeRange:
      stored.timeRange ||
      (context.minimum_start_minutes !== null &&
      context.minimum_start_minutes !== undefined
        ? {
            start: minutesToTime(context.minimum_start_minutes),
            end:
              context.maximum_start_minutes !== null &&
              context.maximum_start_minutes !== undefined
                ? minutesToTime(context.maximum_start_minutes)
                : null,
          }
        : null),
    staffPreference:
      stored.staffPreference ||
      (context.preferred_staff_mode
        ? {
            type:
              context.preferred_staff_mode === "specific"
                ? "specific"
                : "any",
            staffId: context.preferred_staff_id || null,
            staffName: context.preferred_staff_name || null,
          }
        : undefined),
    pendingStep: stored.pendingStep || bookingStep || null,
    lastOfferedMenu: stored.lastOfferedMenu || null,
    depositMentioned:
      stored.depositMentioned || context.deposit_message_sent === true,
    humanReviewRequired:
      stored.humanReviewRequired ||
      context.requires_service_confirmation === true,
    humanReviewReason:
      stored.humanReviewReason ||
      (context.requires_service_confirmation
        ? "legacy_service_confirmation_required"
        : null),
    participants: stored.participants || [],
    pendingParticipantId: stored.pendingParticipantId || null,
    pendingData: stored.pendingData || [],
  };
}

function mapEngineStepToLegacy(step) {
  const mapping = {
    service: "esperando_servicios",
    service_detail: "esperando_seleccion_servicios",
    people_count: "esperando_multipersona_datos",
    date: "esperando_fecha",
    time: "esperando_hora",
    staff: "esperando_tecnica",
    availability: "esperando_opcion_horario",
    appointment_preview: "preview_cita",
    confirmation: "esperando_confirmacion",
    human_review: "esperando_confirmacion_equipo",
  };
  return mapping[step] || null;
}

function serializeEngineState(state) {
  return {
    ...state,
    selectedServices: (state.selectedServices || []).map((service) => ({
      id: service.id,
      name: service.name,
    })),
    participants: (state.participants || []).map((participant) => ({
      ...participant,
      services: (participant.services || []).map((service) => ({
        id: service.id,
        name: service.name,
      })),
    })),
  };
}

function applyEngineStateToLegacyContext({
  context,
  state,
  allServices,
  execution,
}) {
  const selectedIds = new Set(
    (state.selectedServices || []).map((service) => service.id)
  );
  const selectedServices = allServices.filter((service) =>
    selectedIds.has(service.id)
  );
  const legacyContext = {
    ...context,
    selected_services: selectedServices,
    pending_service_options:
      state.lastOfferedMenu?.type === "services"
        ? state.lastOfferedMenu.options
            .map((option) =>
              allServices.find((service) => service.id === option.id)
            )
            .filter(Boolean)
        : [],
    available_options:
      state.lastOfferedMenu?.type === "availability"
        ? execution?.options || []
        : [],
    requested_date: state.parsedDate || context.requested_date || null,
    minimum_start_minutes: state.timeRange?.start
      ? timeToMinutes(state.timeRange.start)
      : null,
    maximum_start_minutes: state.timeRange?.end
      ? timeToMinutes(state.timeRange.end)
      : null,
    time_mode: state.timePreference || context.time_mode || "any",
    preferred_staff_mode:
      state.staffPreference?.type === "specific"
        ? "specific"
        : state.staffPreference?.type === "any"
        ? "available_priority"
        : null,
    preferred_staff_id: state.staffPreference?.staffId || null,
    preferred_staff_name: state.staffPreference?.staffName || null,
    requires_service_confirmation: state.humanReviewRequired === true,
    human_review_reason: state.humanReviewReason || null,
    multi_person_booking: {
      ...(context.multi_person_booking || {}),
      person_count: state.peopleCount || 1,
      requires_separate_appointments: Number(state.peopleCount || 1) > 1,
      participants: state.participants || [],
    },
    conversation_engine_state: serializeEngineState(state),
  };
  return legacyContext;
}

export async function GET(request) {
  try {
    const authorization = await authorizeAdminRequest(request);

    if (authorization.response) return authorization.response;

    const configured = isOpenAIConfigured();

    return NextResponse.json({
      ok: true,
      aiConfigured: configured,
      aiProvider: configured ? "openai" : "rules",
      model: configured ? openaiModel : null,
      repositoryMode: "test_read_only",
      productionWritesEnabled: botAppointmentWritesEnabled(),
      testWritesEnabled: false,
      whatsappConnected: false,
      message: configured
        ? `IA conectada en servidor con ${openaiModel}.`
        : AI_RULES_FALLBACK_MESSAGE,
    });
  } catch (error) {
    console.error("Bot test status error:", error);
    return NextResponse.json(
      { ok: false, error: "No se pudo revisar el estado del bot." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const authorization = await authorizeAdminRequest(request);

    if (authorization.response) return authorization.response;

    const supabase = authorization.supabase;

    const body = await request.json();
    const incomingMessage = String(body.message || "").trim();
    const clientNameFromTest = String(body.clientName || "").trim();
    const requestedTestPhone = String(body.clientPhone || "anonymous").trim();
    const clientPhoneFromTest = `test:${requestedTestPhone || "anonymous"}`;
    const realWriteRequested = false;
    // La creación real permanece bloqueada hasta que el flujo tenga una
    // confirmación explícita y verificable de la vista previa.
    const allowRealWrite = false;
    const allowInactiveTest = body.allowInactiveTest === true;
    // reset conversation final clean
    if (body.resetConversation === true || body.reset === true) {
      const { error: conversationDeleteError } = await supabase
        .from("bot_conversations")
        .delete()
        .eq("client_phone", clientPhoneFromTest);

      try {
        await supabase
          .from("bot_messages")
          .delete()
          .eq("client_phone", clientPhoneFromTest);
      } catch (messageResetError) {
        // Ignore if bot_messages is not available in this project.
      }

      if (conversationDeleteError) {
        console.error("Bot test reset error:", conversationDeleteError);
        return NextResponse.json(
          { error: "No se pudo reiniciar la conversación." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        reset: true,
        reply:
          "Conversación reiniciada. Ya no tomaré en cuenta el contexto anterior.",
      });
    }

    if (!incomingMessage) {
      return NextResponse.json(
        { error: "El mensaje es obligatorio." },
        { status: 400 }
      );
    }

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

    const storedRecentMessages = await getRecentBotMessages(
      supabase,
      conversation?.id,
      clientPhoneFromTest
    );
    const resetStateForNewBooking = startsNewBookingConversation(incomingMessage);
    const conversationStartedAt = resetStateForNewBooking
      ? new Date().toISOString()
      : existingContext.conversation_started_at || null;
    const recentMessages = resetStateForNewBooking
      ? []
      : conversationStartedAt
      ? storedRecentMessages.filter(
          (message) =>
            !message.created_at ||
            new Date(message.created_at).getTime() >=
              new Date(conversationStartedAt).getTime()
        )
      : storedRecentMessages;
    const context = {
      ...(resetStateForNewBooking ? {} : existingContext),
      conversation_started_at: conversationStartedAt,
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

    if (settings?.active === false && !allowInactiveTest) {
      return NextResponse.json({
        ok: true,
        reply:
          "El bot está desactivado. Puedes atender esta conversación manualmente.",
        message:
          "El bot está desactivado. Puedes atender esta conversación manualmente.",
        bot_disabled: true,
        botInactive: true,
        intent: "human_handoff",
        matchedSource: "bot_settings_inactive",
        step: "humano",
        dryRun: !allowRealWrite,
      });
    }

    const menuOptions = menuResult.data || [];
    const faqs = faqResult.data || [];
    const knowledgeItems = [
      ...(knowledgeResult.data || []),
      ...getDefaultKnowledgeItems(),
    ];
    const allServices = (servicesResult.data || []).filter(isPublicBotService);
    const services = allServices
      .filter(isServiceBookable);
    const staff = staffResult.data || [];
    const mediaAssets = mediaResult.data || [];
    const isServiceQuestion = isServiceQuestionMessage(incomingMessage);

    const ai = shouldUseLocalInterpretationBeforeAI(incomingMessage)
      ? fallbackInterpret(incomingMessage)
      : await interpretWithAI(incomingMessage, context);

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

    if (asksAvailability(incomingMessage)) {
      ai.intent = "book_appointment";
    }

    if (
      context.multi_person_booking?.requires_separate_appointments &&
      normalizeText(incomingMessage).includes("para ambas") &&
      mentionsGelishTopic(incomingMessage)
    ) {
      ai.intent = "book_appointment";
      ai.services_requested = ["gelish manos"];
    }

    const bookingStepAtStart = resetStateForNewBooking
      ? null
      : conversation?.booking_step || null;
    const legacyAIStaffPreference = detectStaffPreference(
      ai.staff_preference || "",
      staff
    );
    const engineResult = await executeBotTurn({
      conversationId: conversation?.id || null,
      customerMessage: incomingMessage,
      currentState: buildEngineStateFromLegacy({
        context,
        bookingStep: bookingStepAtStart,
      }),
      context: {
        services: allServices,
        staff,
        bookingStep: bookingStepAtStart,
        appointmentCustomer: {
          name: clientNameFromTest,
          phone: clientPhoneFromTest,
        },
        interpretation: {
          intent: mapLegacyIntentForEngine(ai.intent),
          confidence: ai.confidence,
          staffPreference: legacyAIStaffPreference
            ? {
                type:
                  legacyAIStaffPreference.mode === "specific"
                    ? "specific"
                    : "any",
                staffId: legacyAIStaffPreference.staffId,
                staffName: legacyAIStaffPreference.staffName,
              }
            : { type: "unknown", staffId: null, staffName: null },
          depositMentioned: ai.says_paid === true,
          needsHumanReview: false,
          humanReviewReason: null,
        },
      },
      executors: {
        LEGACY_BUILD_LOCATION_RESPONSE: async () => ({
          response: buildLocationResponse({
            settings,
            faqs,
            knowledgeItems,
            mediaAssets,
            isFirstMessage: false,
          }),
        }),
        LEGACY_BUILD_BUSINESS_HOURS_RESPONSE: async () => ({
          response: BUSINESS_HOURS_MESSAGE,
        }),
        LEGACY_CHECK_AVAILABILITY: async (validatedData) => {
          const selectedIds = new Set(
            validatedData.selectedServices.map((service) => service.id)
          );
          const selectedServices = allServices.filter((service) =>
            selectedIds.has(service.id)
          );
          const targetDate = parseRequestedDate(
            validatedData.parsedDate ||
              validatedData.datePreference ||
              incomingMessage
          );
          if (!targetDate || selectedServices.length === 0) {
            return {
              response:
                "Necesito confirmar el servicio y la fecha antes de revisar disponibilidad.",
              options: [],
              reason: "missing_validated_availability_data",
            };
          }
          const preferredStaffMode =
            validatedData.staffPreference?.type === "specific"
              ? "specific"
              : "available_priority";
          const preferredStaffId =
            validatedData.staffPreference?.staffId || null;
          const preferredStaffName =
            validatedData.staffPreference?.staffName || "";
          const slots = await getAvailableSlots({
            supabase,
            selectedServices,
            dateString: targetDate,
            preferredStaffMode,
            preferredStaffId,
            minimumStartMinutes: validatedData.timeRange?.start
              ? timeToMinutes(validatedData.timeRange.start)
              : null,
            maximumStartMinutes: validatedData.timeRange?.end
              ? timeToMinutes(validatedData.timeRange.end)
              : null,
            timeMode: validatedData.timePreference || "any",
            allowMissingTimeBlocks: true,
          });
          const feedback = getAvailabilityFeedback(slots);
          return {
            response: buildSlotsMessage(
              slots,
              selectedServices,
              targetDate,
              preferredStaffMode === "specific" ? preferredStaffName : ""
            ),
            options: slots,
            parsedDate: targetDate,
            reason: feedback.reason,
            alternatives: feedback.alternatives,
          };
        },
        LEGACY_RECHECK_APPOINTMENT_DRAFT: async (validatedData) => {
          const result = await createAppointmentFromConfirmedPreview({
            draft: validatedData.appointmentDraft,
            repository: createReadOnlyBotAppointmentRepository({ supabase }),
            writesEnabled: false,
          });
          const response =
            result.code === "write_disabled"
              ? "La solicitud quedó preparada correctamente en el modo de prueba. Todavía no se creó una cita real."
              : result.code === "availability_changed"
              ? "Ese horario ya no está disponible. Puedo volver a consultar otras opciones."
              : result.code === "preview_expired"
              ? "La vista previa venció. Necesito consultar nuevamente la disponibilidad."
              : result.code === "preview_changed"
              ? "Los datos del servicio cambiaron. Preparé una vista previa nueva para que la revises antes de confirmar."
              : result.code === "service_unavailable"
              ? "Uno de los servicios ya no está disponible. Revisemos las opciones vigentes."
              : result.code === "staff_unavailable"
              ? "La colaboradora seleccionada ya no está disponible. Revisemos otra opción."
              : result.status === "human_review"
              ? "El equipo necesita revisar esta solicitud antes de continuar. No se creó ninguna cita."
              : "No pude preparar la solicitud de forma segura. No se creó ninguna cita.";
          return {
            response,
            reason: result.code,
            alternatives: result.alternatives || [],
            appointmentDraft: result.draft,
            orchestratorResult: {
              ok: result.ok,
              mode: result.mode,
              status: result.status,
              code: result.code,
              reason: result.reason || null,
              idempotencyKeyMasked: maskIdempotencyKey(
                result.idempotencyKey
              ),
              transactionStatus:
                result.transaction?.status || result.status || null,
              appointmentId:
                result.creation?.appointment?.id || null,
              isReplay: result.creation?.isReplay === true,
              safeErrorCode: result.ok ? null : result.code,
              partialFailures: result.partialFailures || [],
            },
          };
        },
      },
    });
    if (
      engineResult.contract.handled !== true ||
      !engineResult.contract.response
    ) {
      throw new Error("Bot engine did not produce one final response.");
    }
    console.info("Bot engine decision.", {
      messageLength: incomingMessage.length,
      previousPendingStep: engineResult.debug.previousPendingStep,
      intent: engineResult.debug.intent,
      candidateCount: engineResult.debug.candidateServiceIds.length,
      action: engineResult.debug.action,
      delegatedAction: engineResult.contract.legacyAction,
      humanReviewReason: engineResult.debug.humanReviewReason,
      validationErrors: engineResult.contract.validationErrors,
    });

    if (
      ai.intent === "unknown" &&
      engineResult.interpretation.intent === "booking"
    ) {
      ai.intent = "book_appointment";
    }

    const isNumberedOptionReply =
      isPureNumberSelection(incomingMessage) &&
      (bookingStepAtStart === "esperando_seleccion_servicios" ||
        bookingStepAtStart === "esperando_tecnica" ||
        bookingStepAtStart === "esperando_opcion_horario");

    const requestedDate = parseRequestedDate(
      `${incomingMessage} ${ai.date_text || ""}`
    );

    const timePreference = isNumberedOptionReply
      ? { mode: "any", minutes: null, maximumMinutes: null }
      : parseTimePreference(
          `${incomingMessage} ${ai.time_text || ""} ${
            ai.time_preference || ""
          }`
        );
    const hasNewTimePreference = timePreference.mode !== "any";

    const staffPreference = isServiceQuestion
      ? null
      : detectStaffPreference(incomingMessage, staff) ||
        detectStaffPreference(ai.staff_preference || "", staff);

    const selectedServicesFromContext = Array.isArray(context.selected_services)
      ? context.selected_services.filter(isPublicBotService)
      : [];

    const bookingNotes = mergeBookingNotes(
      context.booking_notes,
      extractBookingNotes(incomingMessage)
    );

    let reply = engineResult.contract.response;
    let matchedSource = engineResult.contract.legacyAction
      ? engineResult.contract.legacyAction.toLowerCase()
      : `engine_${engineResult.contract.action.toLowerCase()}`;
    let appointmentPreview = null;
    let availabilityReason = null;
    let availabilityAlternatives =
      engineResult.contract.execution?.alternatives || [];

    let nextContext = {
      ...context,
      selected_services: selectedServicesFromContext,
      pending_service_options: Array.isArray(context.pending_service_options)
        ? context.pending_service_options.filter(isPublicBotService)
        : [],
      active_topic:
        detectActiveConversationTopic(incomingMessage, context, recentMessages) ||
        context.active_topic ||
        null,
      booking_notes: bookingNotes,
      requested_date: requestedDate || context.requested_date || null,
      minimum_start_minutes:
        hasNewTimePreference
          ? timePreference.minutes ?? null
          : context.minimum_start_minutes ?? null,
      maximum_start_minutes:
        hasNewTimePreference
          ? timePreference.maximumMinutes ?? null
          : context.maximum_start_minutes ?? null,
      time_mode: hasNewTimePreference
        ? timePreference.mode
        : context.time_mode || "any",
    };
    const parsedEngineDate =
      engineResult.contract.nextState.parsedDate ||
      parseRequestedDate(
        engineResult.contract.nextState.datePreference || incomingMessage
      );
    if (parsedEngineDate) {
      engineResult.contract.nextState.parsedDate = parsedEngineDate;
      engineResult.state.parsedDate = parsedEngineDate;
    }
    nextContext = applyEngineStateToLegacyContext({
      context: nextContext,
      state: engineResult.contract.nextState,
      allServices,
      execution: engineResult.contract.execution,
    });
    let nextStep = mapEngineStepToLegacy(
      engineResult.contract.nextState.pendingStep
    );
    availabilityReason = engineResult.contract.execution?.reason || null;

    const incomingMultiPersonRequests =
      getInitialMultiPersonRequests(incomingMessage);

    if (!engineResult.contract.handled && incomingMultiPersonRequests.length > 0) {
      nextContext.multi_person_requests = mergeMultiPersonRequests(
        nextContext.multi_person_requests || [],
        incomingMultiPersonRequests
      );
    }

    const pendingOptions = Array.isArray(nextContext.pending_service_options)
      ? nextContext.pending_service_options
      : [];
    const isFirstMessage =
      resetStateForNewBooking ||
      isFirstConversationMessage(conversation, recentMessages);
    const matchedKnowledge = findBestKnowledgeAnswer({
      incomingMessage,
      recentMessages,
      faqs,
      knowledgeItems,
    });

    // Compatibilidad conservada para migración progresiva. El coordinador
    // exige un contrato resuelto, por lo que este bloque no reinterpreta
    // mensajes manejados por el motor. Las únicas delegaciones activas son
    // los ejecutores explícitos definidos al invocar executeBotTurn().
    if (!engineResult.contract.handled) {
    if (!reply && ai.says_paid) {
      const anticipoAsset = getAssetByKey(mediaAssets, "datos_anticipo");

      reply = `Perfecto 💕 Por favor envíame tu comprobante de anticipo por este chat para que podamos validarlo y confirmar tu cita.\n\n${mediaText(
        anticipoAsset
      )}`;

      matchedSource = "payment_proof";
      nextStep = "esperando_comprobante";
    }

    if (!reply && incomingMultiPersonRequests.length > 0) {
      if (isTwoPersonGelHandsRequests(incomingMultiPersonRequests)) {
        nextContext.multi_person_booking = {
          person_count: 2,
          service_query: "gelish manos",
          requires_separate_appointments: true,
          status: "needs_arrangement",
        };
        nextContext.selected_services = [];
        nextContext.pending_service_options = [];
        nextContext.available_options = [];
        nextContext.active_topic = "gelish manos para dos personas";
        nextContext.active_service_focus = "gelish manos";

        reply = buildTwoPersonGelHandsReply();
        matchedSource = "multi_person_gel_hands";
        nextStep = "esperando_multipersona_modalidad";
      } else if (isGenericTwoPersonRequest(incomingMultiPersonRequests)) {
        nextContext.multi_person_booking = {
          person_count: 2,
          requires_separate_appointments: true,
          status: "needs_service_and_arrangement",
        };
        nextContext.selected_services = [];
        nextContext.pending_service_options = [];
        nextContext.available_options = [];
        nextContext.active_topic = "cita para dos personas";
        nextContext.active_service_focus = null;

        reply =
          "Claro, serían dos citas. ¿Quieren horarios seguidos? También dime qué servicio desean.";
        matchedSource = "multi_person_generic";
        nextStep = "esperando_multipersona_servicio";
      } else {
        const pedicureOptions = getPedicureOptions(services);

        nextContext.pending_service_options = pedicureOptions;
        nextContext.adding_service_mode = false;
        nextContext.active_topic = "pedicure";
        nextContext.active_service_focus = "gelish manos y pedicure";

        reply = buildMultiPersonGelPedicureReply(services);
        matchedSource = "multi_person_services";
        nextStep = "esperando_seleccion_servicios";
      }
    }

    if (!reply && nextStep === "esperando_multipersona_modalidad") {
      const preference = normalizeText(incomingMessage);
      const together =
        preference.includes("junta") ||
        preference.includes("seguido") ||
        preference.includes("mismo dia");
      const reviewBoth =
        preference.includes("ambas") ||
        preference.includes("para las dos") ||
        preference.includes("revisar espacio");

      if (together || reviewBoth) {
        nextContext.multi_person_booking = {
          ...(nextContext.multi_person_booking || {}),
          arrangement: together ? "consecutive" : "review_both",
          status: "needs_names_and_schedule",
        };
        reply =
          "Perfecto. Para preparar las dos solicitudes necesito los nombres de ambas y el día que prefieren. No crearé una sola cita mezclada.";
        matchedSource = "multi_person_arrangement_selected";
        nextStep = "esperando_multipersona_datos";
      } else {
        reply = buildTwoPersonGelHandsReply();
        matchedSource = "multi_person_arrangement_retry";
      }
    }

    if (
      !reply &&
      context.requires_service_confirmation === true &&
      !asksAcrylicFillReview(incomingMessage)
    ) {
      if (
        nextStep === "esperando_confirmacion_solicitud_relleno" &&
        isAffirmativeReply(incomingMessage)
      ) {
        reply =
          "Perfecto. Para preparar la solicitud de revisión, dime tu nombre y qué día te gustaría venir.";
        matchedSource = "acrylic_fill_request_details";
        nextStep = "esperando_datos_revision_relleno";
      } else if (isAffirmativeReply(incomingMessage)) {
        reply =
          "¿Quieres que prepare la solicitud para que el equipo te confirme el servicio y la disponibilidad?";
        matchedSource = "acrylic_fill_review_confirmation";
        nextStep = "esperando_confirmacion_solicitud_relleno";
      } else {
        reply =
          "El relleno de acrílico necesita revisión del equipo. ¿Quieres que prepare la solicitud para confirmar el servicio correcto?";
        matchedSource = "acrylic_fill_review_pending";
        nextStep = "esperando_confirmacion_solicitud_relleno";
      }
    }

    if (!reply && asksAcrylicFillReview(incomingMessage)) {
      reply =
        "Para relleno de acrílico lo revisamos según el trabajo que traigas y el tiempo desde tu última aplicación. Puedo pasar tu solicitud al equipo para confirmar el servicio correcto.";
      matchedSource = "acrylic_fill_requires_team_review";
      nextContext.active_topic = "relleno de acrílico";
      nextContext.active_service_focus = "relleno de acrílico";
      nextContext.requires_service_confirmation = true;
      nextContext.selected_services = [];
      nextContext.pending_service_options = [];
      nextStep = "esperando_confirmacion_equipo";
    }

    if (!reply && asksGelishRemovalQuestion(incomingMessage)) {
      reply = buildGelishRemovalReply(allServices);
      matchedSource = "gelish_removal";
      nextContext.active_topic = "retiro gelish";
      nextContext.active_service_focus = "retiro gelish";
    }

    if (!reply && asksStandaloneGelishHands(incomingMessage)) {
      const gelishService = findGelishHandsService(allServices);

      reply = buildGelishHandsReply(gelishService, nextContext);
      matchedSource = "gelish_hands_price";
      nextContext.active_topic = "gelish manos";
      nextContext.active_service_focus =
        gelishService?.name || "Aplicación de Gel Semi Permanente Manos";

      if (gelishService) {
        nextContext.selected_services = mergeServices(
          nextContext.selected_services || selectedServicesFromContext,
          [gelishService]
        );
        nextContext.multi_person_requests =
          updateMultiPersonRequestsWithSelectedServices(nextContext, [
            gelishService,
          ]);
      }
    }

    if (!reply && isServiceQuestion) {
      const contextualServiceReply = buildContextualServiceInquiryReply({
        incomingMessage,
        context: nextContext,
        recentMessages,
        services,
        allServices,
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
        if (contextualServiceReply.topic === "pestañas") {
          nextStep = "esperando_tipo_pestanas";
        }
        if (contextualServiceReply.selectedService) {
          nextContext.selected_services = mergeServices(
            nextContext.selected_services || selectedServicesFromContext,
            [contextualServiceReply.selectedService]
          );
          nextContext.multi_person_requests =
            updateMultiPersonRequestsWithSelectedServices(nextContext, [
              contextualServiceReply.selectedService,
            ]);
        }
      }
    }

    const lashesCatalogChoice =
      nextStep === "esperando_tipo_pestanas"
        ? getLashesCatalogChoice(incomingMessage)
        : null;

    if (!reply && lashesCatalogChoice) {
      nextContext.requested_lash_service = {
        name: lashesCatalogChoice.name,
        price: lashesCatalogChoice.price,
      };
      nextContext.active_topic = "pestañas";
      nextContext.active_service_focus = lashesCatalogChoice.name;
      reply = nextContext.requested_date
        ? `Perfecto. Tomaré ${lashesCatalogChoice.name} — $${lashesCatalogChoice.price} para revisar disponibilidad el ${formatDate(
            nextContext.requested_date
          )}. Prepararé la solicitud para confirmación del equipo.`
        : `Perfecto. Tomaré ${lashesCatalogChoice.name} — $${lashesCatalogChoice.price}. ¿Qué día te gustaría venir?`;
      matchedSource = "lashes_catalog_choice";
      nextStep = nextContext.requested_date
        ? "revision_equipo_pestanas"
        : "esperando_fecha_pestanas";
    }

    if (
      !reply &&
      hasLashesConversationContext(nextContext) &&
      asksNaturalLashes(incomingMessage)
    ) {
      reply = buildNaturalLashesRecommendation();
      matchedSource = "lashes_natural_recommendation";
      nextContext.active_topic = "pestañas";
      nextContext.active_service_focus = "pestañas naturales";
      nextStep = "esperando_tipo_pestanas";
    }

    if (
      !reply &&
      hasLashesConversationContext(nextContext) &&
      isAffirmativeReply(incomingMessage)
    ) {
      reply = buildLashesPriceCatalog();
      matchedSource = "lashes_catalog_followup";
      nextContext.active_topic = "pestañas";
      nextContext.active_service_focus = "pestañas";
      nextStep = "esperando_tipo_pestanas";
    }

    if (
      !reply &&
      hasLashesConversationContext(nextContext) &&
      nextContext.requested_lash_service &&
      requestedDate
    ) {
      nextContext.requested_date = requestedDate;
      reply = `Perfecto. Conservo ${formatDate(
        requestedDate
      )} para ${nextContext.requested_lash_service.name}. Prepararé la solicitud para que el equipo confirme disponibilidad.`;
      matchedSource = "lashes_selected_date";
      nextStep = "revision_equipo_pestanas";
    }

    if (
      !reply &&
      hasLashesConversationContext(nextContext) &&
      requestedDate &&
      selectedServicesFromContext.length === 0
    ) {
      nextContext.requested_date = requestedDate;
      reply = `Conservo ${formatDate(
        requestedDate
      )} como el día que prefieres.\n\n${buildNaturalLashesRecommendation()}`;
      matchedSource = "lashes_date_needs_type";
      nextStep = "esperando_tipo_pestanas";
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

      if (nextContext.multi_person_booking?.requires_separate_appointments) {
        reply =
          "Para dos personas prepararé solicitudes separadas. Antes necesito confirmar los nombres de ambas y si buscan horarios seguidos.";
        matchedSource = "multi_person_real_write_blocked";
        nextStep = "esperando_multipersona_datos";
      } else if (!selectedSlot || selectedServices.length === 0) {
        reply =
          "Me faltó un dato de la cita para registrarla. Escribe “agendar” y lo revisamos de nuevo, por favor 💕";

        matchedSource = "missing_booking_data";
        nextStep = null;
      } else {
        const revalidation = await revalidateSelectedSlot({
          supabase,
          selectedServices,
          selectedSlot,
          allowMissingTimeBlocks: !allowRealWrite,
        });
        const revalidatedOptions = revalidation.options;
        const revalidatedSlot = revalidation.slot;

        if (!revalidatedSlot) {
          availabilityReason =
            "El horario seleccionado ya no está disponible.";
          availabilityAlternatives = revalidatedOptions;
          nextContext.available_options = revalidatedOptions;
          delete nextContext.selected_slot;
          delete nextContext.appointment_preview;
          delete nextContext.created_appointment_id;
          delete nextContext.created_payment_id;

          reply = buildSlotsMessage(
            revalidatedOptions,
            selectedServices,
            selectedSlot.date,
            selectedSlot.staff_name
          );
          matchedSource = "appointment_slot_revalidation_failed";
          nextStep =
            revalidatedOptions.length > 0
              ? "esperando_opcion_horario"
              : "esperando_fecha";
        } else {
          nextContext.selected_slot = revalidatedSlot;
          appointmentPreview = buildAppointmentPreview({
            fullName,
            phone,
            birthday: nextContext.client_birthday,
            services: selectedServices,
            slot: revalidatedSlot,
            notes: nextContext.booking_notes || "",
          });

          nextContext.appointment_preview = appointmentPreview;
          delete nextContext.created_appointment_id;
          delete nextContext.created_payment_id;

          const servicesText = selectedServices
            .map((service) => service.name)
            .join(" + ");
          const depositMessage = takeDepositMessage(nextContext);
          const depositText = depositMessage ? `\n\n${depositMessage}` : "";

          reply = `Puedo preparar esta cita para revisión.\n\nServicios: ${servicesText}\nFecha: ${formatDate(
            revalidatedSlot.date
          )}\nHora: ${formatTime12(revalidatedSlot.start_time)}\nTécnica: ${
            revalidatedSlot.staff_name
          }${depositText}\n\nNo se creó ninguna cita, cliente ni pago real.`;
          matchedSource = "appointment_preview";
          nextStep = "preview_cita";
        }
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
        nextContext.multi_person_requests =
          updateMultiPersonRequestsWithSelectedServices(nextContext, selected);

        reply = buildSelectedServicesMessage(merged);
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
        nextStep === "esperando_multipersona_servicio" ||
        nextStep === "esperando_tecnica" ||
        nextStep === "esperando_fecha" ||
        nextStep === "esperando_opcion_horario")
    ) {
      if (
        serviceQueries.length === 0 &&
        selectedServicesFromContext.length === 0 &&
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
          nextContext.multi_person_requests =
            updateMultiPersonRequestsWithSelectedServices(
              nextContext,
              resolved.selected
            );

          const targetDate = requestedDate || nextContext.requested_date;
          const targetStaff = staffPreference;

          if (asksNearestAvailabilityBot(incomingMessage)) {
            const nearestStaffMode =
              targetStaff?.mode ||
              nextContext.preferred_staff_mode ||
              "available_priority";
            const nearestStaffId =
              targetStaff?.staffId || nextContext.preferred_staff_id || null;
            const nearestStaffName =
              targetStaff?.staffName || nextContext.preferred_staff_name || "";
            const nearest = await findNextAvailableSlotsBot({
              supabase,
              selectedServices: mergedServices,
              preferredStaffMode: nearestStaffMode,
              preferredStaffId: nearestStaffId,
              minimumStartMinutes: nextContext.minimum_start_minutes,
              maximumStartMinutes: nextContext.maximum_start_minutes,
              timeMode: "earliest",
              allowMissingTimeBlocks: !allowRealWrite,
            });

            nextContext.preferred_staff_mode = nearestStaffMode;
            nextContext.preferred_staff_id = nearestStaffId;
            nextContext.preferred_staff_name = nearestStaffName;
            nextContext.requested_date = nearest.dateString;
            nextContext.available_options = nearest.slots;
            const nearestFeedback = getAvailabilityFeedback(nearest.slots);
            availabilityReason = nearestFeedback.reason;
            availabilityAlternatives = nearestFeedback.alternatives;

            reply = buildNearestSlotsMessageBot(
              nearest,
              mergedServices,
              nearestStaffMode === "specific" ? nearestStaffName : ""
            );
            matchedSource = "nearest_safe_availability";
            nextStep =
              nearest.slots.length > 0
                ? "esperando_opcion_horario"
                : "esperando_fecha";
          } else if (targetDate) {
            const targetStaffMode =
              targetStaff?.mode ||
              nextContext.preferred_staff_mode ||
              "available_priority";
            const targetStaffId =
              targetStaff?.staffId || nextContext.preferred_staff_id || null;
            const targetStaffName =
              targetStaff?.staffName || nextContext.preferred_staff_name || "";
            const slots = await getAvailableSlots({
              supabase,
              selectedServices: mergedServices,
              dateString: targetDate,
              preferredStaffMode: targetStaffMode,
              preferredStaffId: targetStaffId,
              minimumStartMinutes: nextContext.minimum_start_minutes,
              maximumStartMinutes: nextContext.maximum_start_minutes,
              timeMode: nextContext.time_mode,
              allowMissingTimeBlocks: !allowRealWrite,
            });

            nextContext.preferred_staff_mode = targetStaffMode;
            nextContext.preferred_staff_id = targetStaffId;
            nextContext.preferred_staff_name = targetStaffName;
            nextContext.requested_date = targetDate;
            nextContext.available_options = slots;
            const slotFeedback = getAvailabilityFeedback(slots);
            availabilityReason = slotFeedback.reason;
            availabilityAlternatives = slotFeedback.alternatives;

            const slotsReply = buildSlotsMessage(
              slots,
              mergedServices,
              targetDate,
              targetStaffMode === "specific" ? targetStaffName : ""
            );
            reply = nextContext.multi_person_booking
              ?.requires_separate_appointments
              ? `Para preparar las dos citas por separado, estos son espacios iniciales para revisar:\n\n${slotsReply}\n\nDime si prefieren horarios seguidos y confirmaré cada cita por separado.`
              : slotsReply;

            matchedSource = "services_staff_date_availability";
            nextStep =
              slots.length > 0 ? "esperando_opcion_horario" : "esperando_fecha";
          } else {
            reply = buildSelectedServicesMessage(mergedServices);
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

    if (
      !reply &&
      requestedDate &&
      hasPendingClientGelRequest(nextContext) &&
      selectedServicesNow.some(isPedicureService)
    ) {
      nextContext.requested_date = requestedDate;
      reply = buildPendingGelClarificationReply(nextContext, requestedDate);
      matchedSource = "multi_person_pending_gel";
      nextStep = "esperando_servicios";
    }

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
          maximumStartMinutes: nextContext.maximum_start_minutes,
          timeMode: nextContext.time_mode,
          allowMissingTimeBlocks: !allowRealWrite,
        });

        nextContext.requested_date = targetDate;
        nextContext.available_options = slots;
        const slotFeedback = getAvailabilityFeedback(slots);
        availabilityReason = slotFeedback.reason;
        availabilityAlternatives = slotFeedback.alternatives;

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

    const availabilityDate =
      requestedDate ||
      (hasNewTimePreference ? nextContext.requested_date || null : null);

    if (
      !reply &&
      availabilityDate &&
      selectedServicesNow.length > 0 &&
      !nextContext.multi_person_booking?.requires_separate_appointments
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
        dateString: availabilityDate,
        preferredStaffMode,
        preferredStaffId,
        minimumStartMinutes: nextContext.minimum_start_minutes,
        maximumStartMinutes: nextContext.maximum_start_minutes,
        timeMode: nextContext.time_mode,
        allowMissingTimeBlocks: !allowRealWrite,
      });

      nextContext.preferred_staff_mode = preferredStaffMode;
      nextContext.preferred_staff_id = preferredStaffId;
      nextContext.preferred_staff_name = preferredStaffName;
      nextContext.requested_date = availabilityDate;
      nextContext.available_options = slots;
      const slotFeedback = getAvailabilityFeedback(slots);
      availabilityReason = slotFeedback.reason;
      availabilityAlternatives = slotFeedback.alternatives;

      reply = buildSlotsMessage(
        slots,
        selectedServicesNow,
        availabilityDate,
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
      reply = buildSelectedServicesMessage(selectedServicesNow);
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
    }

    reply = sanitizeBotReply(reply);
    delete nextContext.recent_messages;
    nextContext = applyEngineStateToLegacyContext({
      context: nextContext,
      state: engineResult.contract.nextState,
      allServices,
      execution: engineResult.contract.execution,
    });
    nextContext.conversation_engine_state = serializeEngineState(
      engineResult.contract.nextState
    );
    nextStep = mapEngineStepToLegacy(
      engineResult.contract.nextState.pendingStep
    );

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
            ? APPOINTMENT_DEPOSIT_AMOUNT
            : null,
        conversation_context: nextContext,
      }
    );

    const appointmentRequestSaved = false;

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
      dryRun: !allowRealWrite,
      realWriteEnabled: allowRealWrite,
      realWriteRequested,
      appointmentPreview,
      availabilityReason,
      availabilityAlternatives,
      appointmentRequestSaved: Boolean(appointmentRequestSaved),
      engineDebug: {
        action: engineResult.contract.action,
        pendingStep: engineResult.contract.nextState.pendingStep,
        lastOfferedMenu:
          engineResult.contract.nextState.lastOfferedMenu || null,
        selectedServices:
          engineResult.contract.validatedData.selectedServices,
        participants: engineResult.contract.nextState.participants || [],
        pendingData: engineResult.contract.nextState.pendingData || [],
        humanReviewReason:
          engineResult.contract.nextState.humanReviewReason || null,
        delegatedAction:
          engineResult.contract.execution?.legacyAction || null,
        validationErrors: engineResult.contract.validationErrors,
        appointmentDraft:
          engineResult.contract.nextState.appointmentDraft || null,
        draftStatus:
          engineResult.contract.nextState.appointmentDraft?.status || null,
        previewId:
          engineResult.contract.nextState.appointmentDraft?.previewId || null,
        previewExpiresAt:
          engineResult.contract.nextState.appointmentDraft?.expiresAt || null,
        confirmation:
          engineResult.contract.nextState.appointmentDraft?.confirmation ||
          null,
        writeMode: "simulation",
        repositoryMode: "test_read_only",
        productionWritesEnabled: botAppointmentWritesEnabled(),
        testWritesEnabled: false,
        whatsappConnected: false,
        revalidation:
          engineResult.contract.nextState.appointmentDraft?.lastValidation ||
          null,
        orchestratorResult:
          engineResult.contract.nextState.orchestratorResult || null,
      },
    });
  } catch (error) {
    console.error("Bot test request error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "No se pudo completar la prueba del bot.",
      },
      { status: 500 }
    );
  }
}
