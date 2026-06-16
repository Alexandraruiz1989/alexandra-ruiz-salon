import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
const aiEnabled = process.env.BOT_AI_ENABLED !== "false";

const SALON_TIME_ZONE = "America/Mexico_City";
const STAFF_PRIORITY = ["laura canul", "tania mendez", "alexandra ruiz"];
const EXCLUDED_STAFF_FOR_BOT = ["junuen ruiz"];
const STAFF_LEAD_TIME_MINUTES = {
  "laura canul": 20,
  "tania mendez": 20,
  "alexandra ruiz": 60,
};

const BUSINESS_HOURS_MESSAGE = `Nuestro horario de atención es:

Martes a viernes: 9:00 am a 9:00 pm
Sábado: 9:00 am a 6:00 pm
Domingo: 9:00 am a 2:00 pm
Lunes: cerrado`;

const LOCATION_FALLBACK_MESSAGE = `Estamos en Calle 44 no. 491 x 25 y 27, Residencial Los Pinos, Mérida, Yucatán 💕

Te comparto la ubicación:
https://www.google.com/maps/search/?api=1&query=Alexandra%20Ruiz%20Salon%20Merida`;

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
  return t.includes("ubicacion") || t.includes("ubicación") || t.includes("direccion") || t.includes("dirección") || t.includes("maps") || t.includes("donde estan") || t.includes("dónde están") || t.includes("donde se ubican") || t.includes("dónde se ubican");
}

function asksBusinessHours(text) {
  const t = normalizeText(text);
  return t.includes("horario") || t.includes("a que hora abren") || t.includes("a qué hora abren") || t.includes("a que hora cierran") || t.includes("a qué hora cierran");
}

function isNearestAvailabilityRequest(message, ai = {}) {
  if (ai?.wants_nearest_availability === true) return true;

  const text = normalizeText(message);

  return (
    text.includes("cita mas proxima") ||
    text.includes("mas proxima") ||
    text.includes("mas pronto") ||
    text.includes("lo mas pronto") ||
    text.includes("lo antes posible") ||
    text.includes("primer espacio") ||
    text.includes("primer horario") ||
    text.includes("siguiente espacio") ||
    text.includes("proximo espacio") ||
    text.includes("cita mas cercana") ||
    text.includes("mas cercana") ||
    text.includes("algo hoy") ||
    text.includes("hoy lo mas pronto")
  );
}

function hasBookingServiceIntent(message, ai = {}) {
  const text = normalizeText(message);

  if (Array.isArray(ai.services_requested) && ai.services_requested.length > 0) {
    return true;
  }

  return (
    text.includes("pedi") ||
    text.includes("pedicure") ||
    text.includes("mani") ||
    text.includes("manicure") ||
    text.includes("unas") ||
    text.includes("uñas") ||
    text.includes("acril") ||
    text.includes("relleno") ||
    text.includes("mantenimiento") ||
    text.includes("rubber") ||
    text.includes("softgel") ||
    text.includes("polygel") ||
    text.includes("gel") ||
    text.includes("ceja") ||
    text.includes("pestana") ||
    text.includes("pestanas") ||
    text.includes("capilar") ||
    text.includes("keratina") ||
    text.includes("botox")
  );
}

function isContinuationMessage(message, ai = {}) {
  const text = normalizeText(message);

  if (ai.keep_context === true || ai.add_to_existing_services === true) return true;
  if (isNearestAvailabilityRequest(message, ai)) return true;

  return (
    text.includes("tambien") ||
    text.includes("ademas") ||
    text.includes("agrega") ||
    text.includes("sumale") ||
    text.includes("y el ") ||
    text.includes("y la ") ||
    text.includes("ese") ||
    text.includes("esa") ||
    /^\s*\d+(\s*,\s*\d+)*\s*$/.test(String(message || ""))
  );
}

function shouldStartNewBookingContext(message, ai = {}, context = {}) {
  if (ai.reset_context === true) return true;
  if (isContinuationMessage(message, ai)) return false;

  const text = normalizeText(message);
  const hasPreviousServices = Array.isArray(context?.selected_services) && context.selected_services.length > 0;

  if (!hasPreviousServices) return false;

  const looksLikeNewBooking =
    ai.action === "new_booking" ||
    ai.intent === "book_appointment" ||
    text.includes("hola") ||
    text.includes("quiero") ||
    text.includes("quisiera") ||
    text.includes("me gustaria") ||
    text.includes("tienen cita") ||
    text.includes("tienes cita") ||
    text.includes("tienen espacio") ||
    text.includes("hay espacio") ||
    text.includes("cita para") ||
    text.includes("agendar");

  if (looksLikeNewBooking) return true;
  if (!hasBookingServiceIntent(message, ai)) return false;

  return true;
}

function isAmbiguousAcrylicRequest(query) {
  const text = normalizeText(query);
  if (!text.includes("acril")) return false;

  const isClearlyRefill = text.includes("relleno") || text.includes("mantenimiento");
  const isClearlyNew =
    text.includes("extension") ||
    text.includes("extensión") ||
    text.includes("nueva") ||
    text.includes("aplicacion") ||
    text.includes("aplicación") ||
    text.includes("tip") ||
    text.includes("escultural");

  return !isClearlyRefill && !isClearlyNew;
}

function parseAcrylicNewOrRefillChoice(message) {
  const text = normalizeText(message);

  if (text === "1" || text.includes("nueva") || text.includes("aplicacion") || text.includes("aplicación") || text.includes("extension") || text.includes("extensión")) {
    return "new";
  }

  if (text === "2" || text.includes("relleno") || text.includes("mantenimiento")) {
    return "refill";
  }

  return null;
}

function getAcrylicNewOrRefillOptions(choice, services) {
  const targetGroup = choice === "refill" ? "rellenos / mantenimientos" : "extensiones de uñas";

  return (services || []).filter((service) => {
    const text = normalizeServiceText(service);
    return getServiceGroup(service) === targetGroup && text.includes("acril");
  });
}

function asksPaymentProof(text) {
  const t = normalizeText(text);
  return t.includes("ya pague") || t.includes("ya pagué") || t.includes("ya transferi") || t.includes("ya transferí") || t.includes("comprobante") || t.includes("anticipo enviado") || t.includes("te mande el pago") || t.includes("te mandé el pago");
}

function wantsExplanation(text) {
  const t = normalizeText(text);
  return t.includes("que es") || t.includes("qué es") || t.includes("explica") || t.includes("explicame") || t.includes("explícame") || t.includes("diferencia") || t.includes("recomiendas");
}

function isDecorationService(service) {
  const text = normalizeServiceText(service);
  return text.includes("decor") || text.includes("diseno") || text.includes("diseño") || text.includes("frances") || text.includes("francés") || text.includes("ojo de gato") || text.includes("cristal") || text.includes("charm") || text.includes("sticker") || text.includes("mano alzada");
}

function isServiceBookable(service) {
  if (service.bot_bookable === false) return false;
  const group = normalizeText(service.bot_service_group);
  const text = normalizeServiceText(service);
  if (["retiro", "decoracion", "pestanas"].includes(group)) return false;
  if (text.includes("retiro")) return false;
  if (text.includes("pestana") || text.includes("pestaña")) return false;
  if (text.includes("uña para pie") || text.includes("una para pie") || text.includes("reconstruccion estetica de una para pie")) return false;
  return true;
}

function normalizeServiceText(service) {
  return normalizeText(`${service?.name || ""} ${service?.category || ""} ${service?.description || ""} ${service?.bot_keywords || ""} ${service?.bot_service_group || ""}`);
}

function getServiceGroup(service) {
  const group = normalizeText(service.bot_service_group);
  const text = normalizeServiceText(service);
  if (group === "pedicure") return "pedicure";
  if (group === "extension_unas") return "extensiones de uñas";
  if (group === "relleno_mantenimiento") return "rellenos / mantenimientos";
  if (group === "una_natural_refuerzo") return "uña natural / refuerzo";
  if (group === "manicure") return "manicure";
  if (text.includes("pedi")) return "pedicure";
  if (text.includes("relleno") || text.includes("mantenimiento")) return "rellenos / mantenimientos";
  if (text.includes("softgel") || text.includes("acril") || text.includes("polygel") || text.includes("extension") || text.includes("escultural")) return "extensiones de uñas";
  if (text.includes("rubber") || text.includes("gel semi") || text.includes("gelish") || text.includes("vitacare") || text.includes("construccion")) return "uña natural / refuerzo";
  if (text.includes("mani")) return "manicure";
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
    .replace(/\blargo\s*#?\s*\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  return services.filter((service) => getServiceGroup(service) === "pedicure");
}

function includesAnyKeyword(value, keywords = []) {
  const text = normalizeText(value);

  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    return normalizedKeyword && text.includes(normalizedKeyword);
  });
}
function getAcrylicOptions(services) {
  return services.filter((service) => normalizeServiceText(service).includes("acril"));
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

  return services.filter((service) => getServiceGroup(service) === group).slice(0, 14);
}

function isGeneralNailOnly(text) {
  const t = normalizeText(text);

  return (
    t === "uñas" ||
    t === "unas" ||
    t === "uña" ||
    t === "quiero uñas" ||
    t === "quiero unas" ||
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

  const matches = findMatches(text, options, 190).map((item) => item.service);
  return matches.slice(0, 4);
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
    } else if (query === "pedi" || query === "pedicure") {
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


async function findNextAvailableSlots({
  supabase,
  selectedServices,
  preferredStaffMode = "available_priority",
  preferredStaffId = null,
  minimumStartMinutes = null,
  timeMode = "any",
  maxDays = 21,
}) {
  const startDate = todayISO();

  for (let dayOffset = 0; dayOffset <= maxDays; dayOffset += 1) {
    const dateString = addDaysISO(startDate, dayOffset);

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

function buildNearestSlotsMessage(result, selectedServices, preferredStaffName = "") {
  const servicesText = selectedServices.map((service) => service.name).join(" + ");
  const staffText = preferredStaffName ? ` con ${preferredStaffName}` : "";

  if (!result?.slots || result.slots.length === 0) {
    return `Por el momento no encontre espacios proximos para ${servicesText}${staffText}. Puedes decirme otro dia, otro horario o elegir otra colaboradora para revisar mas opciones.`;
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

function buildMenuResponse(settings, menuOptions) {
  const welcome =
    settings?.welcome_message ||
    "Hola 💕 Bienvenida/o a Alexandra Ruiz Salón Spa. Soy el asistente virtual del salón, ¿en qué puedo ayudarte?";

  const welcomeAlreadyHasMenu =
    welcome.includes("1.") && welcome.includes("2.") && welcome.includes("3.");

  if (welcomeAlreadyHasMenu) return welcome;

  const activeOptions = (menuOptions || [])
    .filter((item) => item.active !== false)
    .sort((a, b) => Number(a.option_order || 0) - Number(b.option_order || 0));

  if (activeOptions.length === 0) return welcome;

  const optionsText = activeOptions
    .map((item) => `${item.option_order}. ${item.option_label}`)
    .join("\n");

  return `${welcome}\n\n${optionsText}`;
}

function normalizeAIParsed(parsed) {
  return {
    intent: parsed?.intent || "unknown",
    action: parsed?.action || "",
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
    wants_nearest_availability: Boolean(parsed?.wants_nearest_availability),
    add_to_existing_services: Boolean(parsed?.add_to_existing_services),
    reset_context: Boolean(parsed?.reset_context),
    keep_context: Boolean(parsed?.keep_context),
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

  return normalizeAIParsed({
    intent:
      asksPaymentProof(message)
        ? "payment_proof"
        : asksLocation(message)
        ? "ask_location"
        : asksBusinessHours(message)
        ? "ask_business_hours"
        : text.includes("cita") || text.includes("agendar") || services.length > 0
        ? "book_appointment"
        : text === "hola"
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
    wants_human: text.includes("persona") || text.includes("humano"),
    wants_prices_or_menu:
      text.includes("precio") ||
      text.includes("precios") ||
      text.includes("menu") ||
      text.includes("menú"),
    wants_explanation: wantsExplanation(message),
    wants_nearest_availability: isNearestAvailabilityRequest(message),
    add_to_existing_services:
      text.includes("tambien") ||
      text.includes("también") ||
      text.includes("agrega") ||
      text.includes("ademas"),
    reset_context:
      (text.includes("hola") || text.includes("quiero") || text.includes("cita para")) &&
      services.length > 0 &&
      !text.includes("tambien") &&
      !text.includes("también") &&
      !text.includes("agrega"),
    keep_context: isNearestAvailabilityRequest(message) || isPureNumberSelection(message),
    notes: extractBookingNotes(message),
  });
}

async function interpretWithAI(message, context) {
  if (!aiEnabled || !openaiApiKey) {
    return fallbackInterpret(message);
  }

  const openai = new OpenAI({
    apiKey: openaiApiKey,
  });

  const today = todayISO();

  const systemPrompt = `
Eres el intérprete de mensajes para el bot de WhatsApp de Alexandra Ruiz Salón Spa.

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
- Si dice "pedi", significa pedicure, pero puede faltar el tipo de pedicure.
- Si dice "también quiero", "agrega", "también", quiere sumar un servicio a lo ya elegido.
- Si dice "ya pagué", "ya transferí", "te mando comprobante", la intención es comprobante de anticipo.
- Si dice "Ale", se refiere a Alexandra Ruiz.
- Si dice "cualquier chica", "la que esté disponible", "es mi primera vez", no tiene técnica de preferencia.
- Si menciona largo #3, largo 3 o largo extra, guárdalo en notes, no lo trates como número de opción.
- Si pregunta ubicación, marca wants_location.
- Si pregunta horario de trabajo, marca wants_business_hours.
- Si pide menú, precios o servicios, marca wants_prices_or_menu.
- Si pregunta "qué es", "explícame", "diferencia", marca wants_explanation.

Fecha actual en Mérida, México: ${today}

Devuelve SOLO JSON válido con esta estructura:
{
  "intent": "book_appointment | reschedule | cancel | ask_services | ask_location | ask_business_hours | payment_proof | human_help | greeting | unknown",
  "action": "new_booking | continue_booking | add_service | clarify_service | search_availability | search_nearest_availability | select_option | ask_info | answer_question | reset_conversation | unknown",
  "confidence": 0.0,
  "reset_context": false,
  "keep_context": false,
  "wants_nearest_availability": false,
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

Reglas de flujo:
- Usa action para explicar que debe hacer el sistema.
- Si el mensaje inicia una cita nueva con un servicio claro, usa action="new_booking" y reset_context=true.
- Si el mensaje continua una cita ya iniciada, usa action="continue_booking" y keep_context=true.
- Si pide sumar otro servicio, usa action="add_service", add_to_existing_services=true y keep_context=true.
- Si pregunta por "la cita mas proxima", "lo mas pronto", "primer espacio", "el espacio mas cercano" o cualquier forma parecida, usa action="search_nearest_availability", wants_nearest_availability=true, keep_context=true y wants_business_hours=false.
- Una pregunta por cita mas proxima NO es pregunta de horario del salon.
- Si responde solo un numero, usa action="select_option" y keep_context=true.
- Si responde solo un dia, una fecha o una tecnica dentro de una cita, usa action="continue_booking" y keep_context=true.
- Si dice "pedi y uñas", conserva ambos servicios en services_requested: ["pedicure", "uñas"].

Reglas de servicios:
- Si pide dos servicios, pon los dos.
- "relleno de rubber y pedi" => ["relleno de rubber", "pedicure"].
- "pedicure clásico con gel y uñas softgel" => ["pedicure clásico con gel", "softgel"].
- "hola quiero cita..." NO es greeting, es book_appointment.
- "el sábado a las 4 con Tania" => date_text="sábado", time_text="4:00 pm", staff_preference="Tania Mendez".
- "después de las 3" => time_preference="después de las 3:00 pm".
- "en 2 semanas" => date_text="en 2 semanas".
`;

  try {
    const completion = await openai.chat.completions.create({
      model: openaiModel,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `Contexto previo:\n${JSON.stringify(
            context || {},
            null,
            2
          )}\n\nMensaje de la clienta:\n${message}`,
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
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
    // reset conversation stable final
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
        // Some projects do not use bot_messages. Ignore this safely.
      }

      if (conversationDeleteError) {
        return NextResponse.json(
          {
            error: `No se pudo reiniciar la conversacion: ${conversationDeleteError.message}`,
          },
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
    const context = conversation?.conversation_context || {};

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
    const knowledgeItems = knowledgeResult.data || [];
    const services = (servicesResult.data || []).filter(isServiceBookable);
    const staff = staffResult.data || [];
    const mediaAssets = mediaResult.data || [];

    const ai = await interpretWithAI(incomingMessage, context);

    const requestedDate = parseRequestedDate(
      `${incomingMessage} ${ai.date_text || ""}`
    );

    const timePreference = parseTimePreference(
      `${incomingMessage} ${ai.time_text || ""} ${ai.time_preference || ""}`
    );

    const staffPreference = detectStaffPreference(
      `${incomingMessage} ${ai.staff_preference || ""}`,
      staff
    );

    const startsNewBooking = shouldStartNewBookingContext(incomingMessage, ai, context);
    const baseContext = startsNewBooking ? {} : context;

    const selectedServicesFromContext = Array.isArray(baseContext.selected_services)
      ? baseContext.selected_services
      : [];

    const bookingNotes = [
      baseContext.booking_notes,
      extractBookingNotes(incomingMessage, ai.notes),
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    let reply = "";
    let matchedSource = "fallback";

    let nextContext = {
      ...baseContext,
      booking_notes: bookingNotes,
      requested_date: requestedDate || baseContext.requested_date || null,
      minimum_start_minutes:
        timePreference.minutes ?? baseContext.minimum_start_minutes ?? null,
      time_mode: timePreference.mode || baseContext.time_mode || "any",
    };

    let nextStep = startsNewBooking ? null : conversation?.booking_step || null;

    if (!reply && ai.says_paid) {
      const anticipoAsset = getAssetByKey(mediaAssets, "datos_anticipo");

      reply = `Perfecto 💕 Por favor envíame tu comprobante de anticipo por este chat para que podamos validarlo y confirmar tu cita.\n\n${mediaText(
        anticipoAsset
      )}`;

      matchedSource = "payment_proof";
      nextStep = "esperando_comprobante";
    }

    if (!reply && (ai.wants_location || asksLocation(incomingMessage))) {
      reply = mediaText(
        getAssetByKey(mediaAssets, "ubicacion_maps"),
        LOCATION_FALLBACK_MESSAGE
      );

      matchedSource = "location";
    }

    if (!reply && !isNearestAvailabilityRequest(incomingMessage, ai) && (ai.wants_business_hours || asksBusinessHours(incomingMessage))) {
      reply = BUSINESS_HOURS_MESSAGE;
      matchedSource = "business_hours";
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
          LOCATION_FALLBACK_MESSAGE
        )}`;

        matchedSource = "appointment_created_with_payment";
        nextStep = "esperando_comprobante";
      }
    }

    const pendingOptions = Array.isArray(nextContext.pending_service_options)
      ? nextContext.pending_service_options
      : [];

    if (!reply && nextStep === "esperando_acrilico_tipo") {
      const acrylicChoice = parseAcrylicNewOrRefillChoice(incomingMessage);

      if (!acrylicChoice) {
        reply = "Claro 💕 Para tus uñas acrilicas, dime que necesitas:

1. Aplicacion nueva de acrilico
2. Relleno o mantenimiento de acrilico

Responde 1 o 2.";
        matchedSource = "acrylic_new_or_refill_retry";
      } else {
        const acrylicOptions = getAcrylicNewOrRefillOptions(acrylicChoice, services);

        if (acrylicOptions.length === 1) {
          const merged = mergeServices(selectedServicesFromContext, acrylicOptions);
          nextContext.selected_services = merged;
          reply = buildSelectedServicesMessage(merged, bookingNotes);
          matchedSource = "acrylic_new_or_refill_selected";
          nextStep = "esperando_tecnica";
        } else if (acrylicOptions.length > 1) {
          nextContext.pending_service_options = acrylicOptions;
          nextContext.adding_service_mode = selectedServicesFromContext.length > 0;
          reply = buildServiceOptionsMessage(acrylicOptions, selectedServicesFromContext);
          matchedSource = "acrylic_new_or_refill_options";
          nextStep = "esperando_seleccion_servicios";
        } else {
          reply = "Por ahora no encontre ese servicio de acrilico en el catalogo del bot. Te comunicare con una persona del salon para revisarlo 💕";
          matchedSource = "acrylic_service_not_found";
          nextStep = null;
        }
      }
    }

    if (
      !reply &&
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

        const pendingAfterNailQueries = Array.isArray(nextContext.pending_after_nail_queries)
          ? nextContext.pending_after_nail_queries
          : [];

        if (pendingAfterNailQueries.length > 0) {
          const pendingResolved = resolveRequestedServices(pendingAfterNailQueries, services);
          nextContext.pending_after_nail_queries = [];

          if (pendingResolved.ambiguous.length > 0) {
            nextContext.pending_service_options = pendingResolved.ambiguous;
            nextContext.adding_service_mode = true;
            reply = buildServiceOptionsMessage(pendingResolved.ambiguous, merged);
            matchedSource = "pending_services_after_nail_options";
            nextStep = "esperando_seleccion_servicios";
          } else if (pendingResolved.selected.length > 0) {
            const mergedWithPending = mergeServices(merged, pendingResolved.selected);
            nextContext.selected_services = mergedWithPending;
            reply = buildSelectedServicesMessage(mergedWithPending, bookingNotes);
            matchedSource = "service_options_selected_with_pending";
            nextStep = "esperando_tecnica";
          } else {
            reply = buildSelectedServicesMessage(merged, bookingNotes);
            matchedSource = "service_options_selected";
            nextStep = "esperando_tecnica";
          }
        } else {
          reply = buildSelectedServicesMessage(merged, bookingNotes);
          matchedSource = "service_options_selected";
          nextStep = "esperando_tecnica";
        }
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
      normalizeText(incomingMessage).includes("ademas") ||
      normalizeText(incomingMessage).includes("agrega");

    if (!reply && isNearestAvailabilityRequest(incomingMessage, ai)) {
      const servicesForNearest = Array.isArray(nextContext.selected_services) && nextContext.selected_services.length > 0
        ? nextContext.selected_services
        : selectedServicesFromContext;

      if (servicesForNearest.length > 0) {
        const preferredStaffMode =
          nextContext.preferred_staff_mode ||
          baseContext.preferred_staff_mode ||
          "available_priority";

        const preferredStaffId =
          nextContext.preferred_staff_id || baseContext.preferred_staff_id || null;

        const preferredStaffName =
          nextContext.preferred_staff_name || baseContext.preferred_staff_name || "";

        const nearestResult = await findNextAvailableSlots({
          supabase,
          selectedServices: servicesForNearest,
          preferredStaffMode,
          preferredStaffId,
          minimumStartMinutes: nextContext.minimum_start_minutes,
          timeMode: nextContext.time_mode,
        });

        nextContext.selected_services = servicesForNearest;
        nextContext.requested_date = nearestResult.dateString;
        nextContext.available_options = nearestResult.slots;

        reply = buildNearestSlotsMessage(
          nearestResult,
          servicesForNearest,
          preferredStaffMode === "specific" ? preferredStaffName : ""
        );

        matchedSource = "nearest_availability";
        nextStep = nearestResult.slots.length > 0 ? "esperando_opcion_horario" : "esperando_fecha";
      } else {
        reply = "Claro 💕 ¿Que servicio o servicios te gustaria agendar para buscarte la cita mas proxima?";
        matchedSource = "nearest_request_missing_service";
        nextStep = "esperando_servicios";
      }
    }

    if (
      !reply &&
      (ai.intent === "book_appointment" ||
        ai.intent === "ask_services" ||
        nextStep === "esperando_servicios" ||
        nextStep === "esperando_tecnica" ||
        nextStep === "esperando_fecha" ||
        nextStep === "esperando_opcion_horario")
    ) {
      if (
        serviceQueries.length === 0 &&
        (ai.intent === "book_appointment" || nextStep === "esperando_servicios")
      ) {
        reply = "Perfecto 💕 ¿Qué servicio o servicios te gustaría agendar?";
        matchedSource = "ask_service";
        nextStep = "esperando_servicios";
      }

      if (!reply && serviceQueries.some((query) => isAmbiguousAcrylicRequest(query))) {
        const pendingAfterAcrylicQueries = serviceQueries.filter(
          (query) => !isAmbiguousAcrylicRequest(query)
        );

        if (pendingAfterAcrylicQueries.length > 0) {
          nextContext.pending_after_nail_queries = pendingAfterAcrylicQueries;
        }

        reply = "Claro 💕 Para tus uñas acrilicas, dime que necesitas:

1. Aplicacion nueva de acrilico
2. Relleno o mantenimiento de acrilico

Responde 1 o 2.";
        matchedSource = "ambiguous_acrylic_new_or_refill";
        nextStep = "esperando_acrilico_tipo";
        nextContext.pending_service_options = [];
      }

      if (!reply && serviceQueries.some((query) => isGeneralNailOnly(query))) {
        const pendingAfterNailQueries = serviceQueries.filter(
          (query) => !isGeneralNailOnly(query)
        );

        if (pendingAfterNailQueries.length > 0) {
          nextContext.pending_after_nail_queries = pendingAfterNailQueries;
        }

        reply = buildNailClarifyingQuestion();
        matchedSource = "nail_clarifying_question";
        nextStep = "esperando_tipo_unas";
        nextContext.pending_service_options = [];
      }

      if (!reply && serviceQueries.length > 0) {
        const resolved = resolveRequestedServices(serviceQueries, services);

        if (resolved.ambiguous.length > 0) {
          nextContext.pending_service_options = resolved.ambiguous;
          nextContext.adding_service_mode =
            selectedServicesFromContext.length > 0 || isAddingService;

          reply = buildServiceOptionsMessage(
            resolved.ambiguous,
            selectedServicesFromContext
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

    if (!reply && ai.wants_explanation) {
      const query = ai.services_requested?.[0] || incomingMessage;
      const match = findMatches(query, services, 150)[0]?.service;

      if (match) {
        const price = Number(match.base_price || 0);
        const duration = Number(match.duration_minutes || 0);

        reply = `Claro 💕 Te cuento sobre ${match.name}:\n\n${
          match.bot_description ||
          match.description ||
          "Es un servicio del salón. Podemos revisar disponibilidad para agendarlo."
        }${price > 0 ? `\nPrecio desde: $${price}.` : ""}${
          duration > 0 ? `\nDuración aproximada: ${duration} minutos.` : ""
        }\n\n¿Te gustaría que revise disponibilidad para este servicio?`;

        matchedSource = "service_explanation";
      }
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
      const matchedFaq = faqs.find((faq) => {
        if (faq.active === false) return false;
        const text = normalizeText(incomingMessage);
        const question = normalizeText(faq.question);

        return (
          (faq.keywords && includesAnyKeyword(incomingMessage, faq.keywords)) ||
          text.includes(question) ||
          question.includes(text)
        );
      });

      if (matchedFaq) {
        reply = matchedFaq.answer;
        matchedSource = "faq";
      }
    }

    if (!reply) {
      const matchedKnowledge = knowledgeItems.find((item) => {
        if (item.active === false) return false;
        const text = normalizeText(incomingMessage);
        const title = normalizeText(item.title);
        const category = normalizeText(item.category);

        return (
          (item.keywords && includesAnyKeyword(incomingMessage, item.keywords)) ||
          text.includes(title) ||
          text.includes(category)
        );
      });

      if (matchedKnowledge) {
        reply = matchedKnowledge.content;
        matchedSource = "knowledge_base";
      }
    }

    if (!reply) {
      reply =
        settings?.fallback_message ||
        "Disculpa, no logré entenderte bien. Puedes escribir “menú” para ver las opciones disponibles.";
      matchedSource = "fallback";
    }

    const savedConversation = await saveConversation(
      supabase,
      clientPhoneFromTest,
      clientNameFromTest,
      {
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
