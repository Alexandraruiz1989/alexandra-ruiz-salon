import { appointmentBlocksAvailability } from "./clientPortalAppointmentStatus.js";

export const RETENTION_TIME_ZONE = "America/Merida";
export const FIVE_WEEK_RETENTION_DAYS = 35;
export const INACTIVE_CLIENT_DAYS = 90;
export const MAX_RETENTION_REPORT_DAYS = 1096;

const FAMILY_LABELS = {
  hands: "Manos",
  feet: "Pies",
  other: "Otros",
};

const INACTIVE_APPOINTMENT_STATUSES = new Set([
  "cancelada",
  "cancelado",
  "cancelled",
  "canceled",
  "cancelo",
  "rechazada",
  "rechazado",
  "vencida",
  "vencido",
  "eliminada",
  "eliminado",
  "deleted",
]);

const INACTIVE_SERVICE_STATUSES = new Set([
  "cancelada",
  "cancelado",
  "cancelled",
  "canceled",
  "cancelo",
  "rechazada",
  "rechazado",
  "vencida",
  "vencido",
  "eliminada",
  "eliminado",
  "deleted",
  "inactiva",
  "inactivo",
]);

const VALID_ATTENDANCE_STATUSES = new Set([
  "asistio",
  "asistió",
  "llego_retrasada",
  "llego retrasada",
  "llegó retrasada",
]);

const INVALID_ATTENDANCE_STATUSES = new Set([
  "cancelo",
  "cancelada",
  "cancelado",
  "no_asistio",
  "no asistio",
  "no asistió",
  "falta",
]);

const VALID_COMPLETED_STATUSES = new Set([
  "realizada",
  "realizado",
  "completada",
  "completado",
  "finalizada",
  "finalizado",
  "pagada",
  "pagado",
  "cobrada",
  "cobrado",
]);

const PORTAL_BOOKING_SOURCES = new Set(["cliente_portal", "client_portal"]);

function cleanText(value) {
  return String(value || "").trim();
}

export function normalizeRetentionText(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uniqueTexts(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

export function toISODate(value) {
  if (!value) return "";
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: RETENTION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateParts(dateString) {
  const value = toISODate(dateString);
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function dateToUtcDay(dateString) {
  const parts = dateParts(dateString);
  if (!parts) return null;
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

export function daysBetweenISO(startDate, endDate) {
  const start = dateToUtcDay(startDate);
  const end = dateToUtcDay(endDate);
  if (start === null || end === null) return 0;
  return Math.floor((end - start) / 86400000);
}

export function addDaysISO(dateString, days) {
  const parts = dateParts(dateString);
  if (!parts) return "";
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addMonthsISO(dateString, months) {
  const parts = dateParts(dateString);
  if (!parts) return "";
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function addYearsISO(dateString, years) {
  const parts = dateParts(dateString);
  if (!parts) return "";
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

export function getRetentionHistoryWindowStart(endDate = toISODate(new Date())) {
  return addYearsISO(endDate, -3);
}

export function isRetentionRangeAllowed(startDate, endDate) {
  const start = toISODate(startDate);
  const end = toISODate(endDate);

  if (!start || !end) {
    return {
      ok: false,
      message: "Selecciona una fecha inicial y final válidas.",
      days: 0,
    };
  }

  if (start > end) {
    return {
      ok: false,
      message: "La fecha inicial no puede ser posterior a la fecha final.",
      days: 0,
    };
  }

  const days = daysBetweenISO(start, end) + 1;

  if (days > MAX_RETENTION_REPORT_DAYS) {
    return {
      ok: false,
      message: "El rango máximo permitido por consulta es de 3 años.",
      days,
    };
  }

  return { ok: true, message: "", days };
}

function monthKey(dateString) {
  const value = toISODate(dateString);
  return value ? value.slice(0, 7) : "";
}

function addMonthsToKey(month, amount) {
  if (!month) return "";
  return addMonthsISO(`${month}-01`, amount).slice(0, 7);
}

function serviceLineDate(serviceLine, appointment) {
  return toISODate(serviceLine?.service_date || appointment?.appointment_date);
}

function getClientIdFromAppointment(appointment) {
  return cleanText(appointment?.client_id || appointment?.clients?.id);
}

function getClientInfo(appointment) {
  return {
    id: getClientIdFromAppointment(appointment),
    name: cleanText(appointment?.clients?.full_name) || "Clienta",
    phone: cleanText(appointment?.clients?.phone),
  };
}

function getServiceName(serviceLine) {
  return (
    cleanText(serviceLine?.custom_name) ||
    cleanText(serviceLine?.services?.name) ||
    cleanText(serviceLine?.name) ||
    "Servicio"
  );
}

function getServiceCategory(serviceLine) {
  return (
    cleanText(serviceLine?.services?.category) ||
    cleanText(serviceLine?.category) ||
    cleanText(serviceLine?.services?.bot_service_group) ||
    cleanText(serviceLine?.bot_service_group)
  );
}

export function getServiceFamily(serviceLine = {}) {
  const category = normalizeRetentionText(getServiceCategory(serviceLine));
  const name = normalizeRetentionText(getServiceName(serviceLine));
  const source = category || name;

  if (
    /\b(pies?|pedicure|pedicura|podolog|unas?\s+de\s+los\s+pies|una\s+de\s+pie|unas?\s+pies?)\b/.test(
      source
    )
  ) {
    return "feet";
  }

  if (
    /\b(manos?|manicure|manicura|unas?|gel|rubber|bano|bano|baño|acrilic|extension|retoque|mantenimiento)\b/.test(
      source
    )
  ) {
    return "hands";
  }

  return "other";
}

export function getServiceFamilyLabel(family) {
  return FAMILY_LABELS[family] || FAMILY_LABELS.other;
}

export function isAppointmentServiceActive(serviceLine = {}) {
  const status = normalizeRetentionText(serviceLine?.status || "agendado");
  return !INACTIVE_SERVICE_STATUSES.has(status);
}

function appointmentHasPaidEvidence(appointment = {}) {
  if (
    VALID_COMPLETED_STATUSES.has(
      normalizeRetentionText(appointment.payment_status)
    )
  ) {
    return true;
  }

  if (toNumber(appointment.paid_amount, 0) > 0) return true;

  return asArray(appointment.payments).some((payment) => {
    const status = normalizeRetentionText(payment?.payment_status);
    return (
      VALID_COMPLETED_STATUSES.has(status) ||
      toNumber(payment?.paid_amount, 0) > 0 ||
      toNumber(payment?.total_amount, 0) > 0 ||
      toNumber(payment?.total, 0) > 0
    );
  });
}

export function isAppointmentInactiveForRetention(appointment = {}) {
  const status = normalizeRetentionText(appointment?.status);
  const confirmation = normalizeRetentionText(appointment?.confirmation_status);
  const attendance = normalizeRetentionText(appointment?.attendance_status);

  return (
    INACTIVE_APPOINTMENT_STATUSES.has(status) ||
    INACTIVE_APPOINTMENT_STATUSES.has(confirmation) ||
    INVALID_ATTENDANCE_STATUSES.has(attendance)
  );
}

function isValidVisitAppointment(appointment = {}, { asOfDate } = {}) {
  const date = toISODate(appointment?.appointment_date);
  if (!date || (asOfDate && date > asOfDate)) return false;
  if (isAppointmentInactiveForRetention(appointment)) return false;

  const status = normalizeRetentionText(appointment?.status);
  const serviceStatus = asArray(appointment?.appointment_services).some(
    (serviceLine) =>
      VALID_COMPLETED_STATUSES.has(normalizeRetentionText(serviceLine?.status))
  );
  const attendance = normalizeRetentionText(appointment?.attendance_status);

  return (
    VALID_ATTENDANCE_STATUSES.has(attendance) ||
    VALID_COMPLETED_STATUSES.has(status) ||
    serviceStatus ||
    appointmentHasPaidEvidence(appointment)
  );
}

export function isValidVisitServiceLine(
  appointment = {},
  serviceLine = {},
  { asOfDate = toISODate(new Date()) } = {}
) {
  const date = serviceLineDate(serviceLine, appointment);
  if (!date || date > asOfDate) return false;
  if (!isAppointmentServiceActive(serviceLine)) return false;
  return isValidVisitAppointment(appointment, { asOfDate });
}

function appointmentServiceBlocksFuture(
  appointment,
  serviceLine,
  { asOfDate, now = new Date() } = {}
) {
  const date = serviceLineDate(serviceLine, appointment);
  if (!date || date < asOfDate) return false;
  if (!isAppointmentServiceActive(serviceLine)) return false;
  if (isAppointmentInactiveForRetention(appointment)) return false;

  return appointmentBlocksAvailability(appointment, { now });
}

function appointmentBlocksAnyFuture(appointment, { asOfDate, now } = {}) {
  const date = toISODate(appointment?.appointment_date);
  if (!date || date < asOfDate) return false;
  if (isAppointmentInactiveForRetention(appointment)) return false;
  if (!appointmentBlocksAvailability(appointment, { now })) return false;

  const serviceLines = asArray(appointment?.appointment_services);
  if (serviceLines.length === 0) return true;

  return serviceLines.some((serviceLine) =>
    appointmentServiceBlocksFuture(appointment, serviceLine, { asOfDate, now })
  );
}

function getVisitKey(visit) {
  return visit.appointmentServiceId || `${visit.appointmentId}:${visit.serviceId}:${visit.serviceName}`;
}

function collectRetentionFacts(appointments = [], options = {}) {
  const asOfDate = toISODate(options.asOfDate || options.today || new Date());
  const now = options.now || new Date(`${asOfDate}T12:00:00-06:00`);
  const clients = new Map();
  const validVisits = [];
  const upcomingByClientFamily = new Set();
  const upcomingByClient = new Set();
  const autoBookings = [];
  const historicalDates = {
    appointments: "",
    appointmentServices: "",
    payments: "",
    clients: "",
    followups: "",
  };

  asArray(options.followups).forEach((followup) => {
    const followupDate = toISODate(followup?.followup_date || followup?.created_at);
    if (!followupDate) return;
    historicalDates.followups =
      !historicalDates.followups || followupDate < historicalDates.followups
        ? followupDate
        : historicalDates.followups;
  });

  asArray(appointments).forEach((appointment) => {
    const appointmentDate = toISODate(appointment?.appointment_date);
    const client = getClientInfo(appointment);

    if (client.id) {
      const current = clients.get(client.id) || client;
      clients.set(client.id, {
        ...current,
        name: client.name || current.name,
        phone: client.phone || current.phone,
        firstSeenAt: current.firstSeenAt || toISODate(appointment?.clients?.created_at),
      });
    }

    if (appointmentDate) {
      historicalDates.appointments =
        !historicalDates.appointments || appointmentDate < historicalDates.appointments
          ? appointmentDate
          : historicalDates.appointments;
    }

    asArray(appointment?.payments).forEach((payment) => {
      const paymentDate = toISODate(payment?.payment_date || payment?.created_at);
      if (!paymentDate) return;
      historicalDates.payments =
        !historicalDates.payments || paymentDate < historicalDates.payments
          ? paymentDate
          : historicalDates.payments;
    });

    const clientCreatedAt = toISODate(appointment?.clients?.created_at);
    if (clientCreatedAt) {
      historicalDates.clients =
        !historicalDates.clients || clientCreatedAt < historicalDates.clients
          ? clientCreatedAt
          : historicalDates.clients;
    }

    if (PORTAL_BOOKING_SOURCES.has(normalizeRetentionText(appointment?.booking_source))) {
      autoBookings.push(appointment);
    }

    if (client.id && appointmentBlocksAnyFuture(appointment, { asOfDate, now })) {
      upcomingByClient.add(client.id);
    }

    const serviceLines = asArray(appointment?.appointment_services);

    serviceLines.forEach((serviceLine) => {
      const date = serviceLineDate(serviceLine, appointment);
      if (date) {
        historicalDates.appointmentServices =
          !historicalDates.appointmentServices || date < historicalDates.appointmentServices
            ? date
            : historicalDates.appointmentServices;
      }

      if (client.id && appointmentServiceBlocksFuture(appointment, serviceLine, { asOfDate, now })) {
        upcomingByClientFamily.add(`${client.id}:${getServiceFamily(serviceLine)}`);
      }

      if (!client.id || !isValidVisitServiceLine(appointment, serviceLine, { asOfDate })) {
        return;
      }

      const family = getServiceFamily(serviceLine);
      validVisits.push({
        id: getVisitKey({
          appointmentId: appointment.id,
          appointmentServiceId: serviceLine.id,
          serviceId: serviceLine.service_id || serviceLine.services?.id,
          serviceName: getServiceName(serviceLine),
        }),
        appointmentId: cleanText(appointment?.id),
        appointmentServiceId: cleanText(serviceLine?.id),
        clientId: client.id,
        clientName: client.name,
        phone: client.phone,
        date,
        serviceName: getServiceName(serviceLine),
        serviceId: cleanText(serviceLine?.service_id || serviceLine?.services?.id),
        family,
        familyLabel: getServiceFamilyLabel(family),
        appointment,
        serviceLine,
      });
    });

    if (
      client.id &&
      serviceLines.length === 0 &&
      isValidVisitAppointment(appointment, { asOfDate })
    ) {
      validVisits.push({
        id: cleanText(appointment?.id) || `${client.id}:${appointmentDate}`,
        appointmentId: cleanText(appointment?.id),
        appointmentServiceId: "",
        clientId: client.id,
        clientName: client.name,
        phone: client.phone,
        date: appointmentDate,
        serviceName: "Servicio sin detalle",
        serviceId: "",
        family: "other",
        familyLabel: getServiceFamilyLabel("other"),
        appointment,
        serviceLine: null,
      });
    }
  });

  return {
    asOfDate,
    clients,
    validVisits,
    upcomingByClientFamily,
    upcomingByClient,
    autoBookings,
    historicalDates,
  };
}

function replaceIfLatest(map, key, visit) {
  const current = map.get(key);
  if (!current || visit.date > current.date) {
    map.set(key, {
      ...visit,
      serviceNames: [visit.serviceName],
      totalVisits: 1,
      appointmentIds: new Set([visit.appointmentId]),
    });
    return;
  }

  if (visit.date === current.date) {
    current.serviceNames = uniqueTexts([...current.serviceNames, visit.serviceName]);
  }
}

function buildLatestMaps(validVisits) {
  const latestByClientFamily = new Map();
  const latestByClient = new Map();
  const totalVisitsByClient = new Map();
  const appointmentIdsByClient = new Map();
  const firstVisitByClient = new Map();

  validVisits.forEach((visit) => {
    replaceIfLatest(latestByClient, visit.clientId, visit);

    if (["hands", "feet"].includes(visit.family)) {
      replaceIfLatest(latestByClientFamily, `${visit.clientId}:${visit.family}`, visit);
    }

    const ids = appointmentIdsByClient.get(visit.clientId) || new Set();
    ids.add(visit.appointmentId || visit.id);
    appointmentIdsByClient.set(visit.clientId, ids);

    const first = firstVisitByClient.get(visit.clientId);
    if (!first || visit.date < first.date) firstVisitByClient.set(visit.clientId, visit);
  });

  appointmentIdsByClient.forEach((ids, clientId) => {
    totalVisitsByClient.set(clientId, ids.size);
  });

  return {
    latestByClient,
    latestByClientFamily,
    totalVisitsByClient,
    firstVisitByClient,
  };
}

function buildFiveWeekAlerts(facts) {
  const { latestByClientFamily } = buildLatestMaps(facts.validVisits);

  return [...latestByClientFamily.values()]
    .filter((visit) => ["hands", "feet"].includes(visit.family))
    .map((visit) => ({
      type: "five_weeks",
      clientId: visit.clientId,
      clientName: visit.clientName,
      phone: visit.phone,
      family: visit.family,
      familyLabel: visit.familyLabel,
      lastVisitDate: visit.date,
      lastServiceNames: visit.serviceNames || [visit.serviceName],
      daysSinceLastVisit: daysBetweenISO(visit.date, facts.asOfDate),
      weeksSinceLastVisit: Math.floor(daysBetweenISO(visit.date, facts.asOfDate) / 7),
      hasUpcomingAppointment: facts.upcomingByClientFamily.has(
        `${visit.clientId}:${visit.family}`
      ),
      nextAppointmentText: "ninguna",
      alertLabel: `${visit.familyLabel}: 5+ semanas sin regresar`,
    }))
    .filter(
      (alert) =>
        alert.daysSinceLastVisit >= FIVE_WEEK_RETENTION_DAYS &&
        !alert.hasUpcomingAppointment
    )
    .sort((a, b) => b.daysSinceLastVisit - a.daysSinceLastVisit);
}

function buildInactiveClientAlerts(facts) {
  const { latestByClient, totalVisitsByClient } = buildLatestMaps(facts.validVisits);

  return [...latestByClient.values()]
    .map((visit) => ({
      type: "inactive_90_days",
      clientId: visit.clientId,
      clientName: visit.clientName,
      phone: visit.phone,
      family: "all",
      familyLabel: "General",
      lastVisitDate: visit.date,
      lastServiceNames: visit.serviceNames || [visit.serviceName],
      daysSinceLastVisit: daysBetweenISO(visit.date, facts.asOfDate),
      monthsSinceLastVisit: Math.floor(daysBetweenISO(visit.date, facts.asOfDate) / 30),
      totalVisits: totalVisitsByClient.get(visit.clientId) || 0,
      hasUpcomingAppointment: facts.upcomingByClient.has(visit.clientId),
      nextAppointmentText: "ninguna",
      alertLabel: "3+ meses sin visitar",
    }))
    .filter(
      (alert) =>
        alert.daysSinceLastVisit >= INACTIVE_CLIENT_DAYS &&
        !alert.hasUpcomingAppointment &&
        alert.totalVisits > 0
    )
    .sort((a, b) => b.daysSinceLastVisit - a.daysSinceLastVisit);
}

function buildFrequentClients(facts) {
  const currentMonth = monthKey(facts.asOfDate);
  const visitsByClient = new Map();
  const appointmentIdsByClientMonth = new Map();

  facts.validVisits.forEach((visit) => {
    const clientVisits = visitsByClient.get(visit.clientId) || [];
    clientVisits.push(visit);
    visitsByClient.set(visit.clientId, clientVisits);

    const key = `${visit.clientId}:${monthKey(visit.date)}`;
    const ids = appointmentIdsByClientMonth.get(key) || new Set();
    ids.add(visit.appointmentId || visit.id);
    appointmentIdsByClientMonth.set(key, ids);
  });

  return [...visitsByClient.entries()]
    .map(([clientId, visits]) => {
      const months = new Set(visits.map((visit) => monthKey(visit.date)));
      const startMonth = months.has(currentMonth)
        ? currentMonth
        : addMonthsToKey(currentMonth, -1);
      const streakMonths = [];
      let cursor = startMonth;

      while (cursor && months.has(cursor)) {
        streakMonths.push(cursor);
        cursor = addMonthsToKey(cursor, -1);
      }

      if (streakMonths.length < 3) return null;

      const visitsInStreak = visits.filter((visit) =>
        streakMonths.includes(monthKey(visit.date))
      );
      const latestVisit = visitsInStreak
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      const appointmentIds = new Set(
        visitsInStreak.map((visit) => visit.appointmentId || visit.id)
      );
      const familyCounts = new Map();

      visitsInStreak.forEach((visit) => {
        const key = visit.familyLabel || getServiceFamilyLabel(visit.family);
        familyCounts.set(key, (familyCounts.get(key) || 0) + 1);
      });

      const frequentFamilies = [...familyCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
        .slice(0, 3)
        .map(([family]) => family);

      return {
        clientId,
        clientName: latestVisit.clientName,
        phone: latestVisit.phone,
        streakMonths: streakMonths.length,
        streakLabel: streakMonths.length >= 4 ? "4+ meses" : "3 meses",
        visitsInPeriod: appointmentIds.size,
        lastVisitDate: latestVisit.date,
        frequentFamilies,
        evaluationWindow: streakMonths,
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.streakMonths - a.streakMonths ||
        b.lastVisitDate.localeCompare(a.lastVisitDate)
    );
}

function withinRange(date, startDate, endDate) {
  const value = toISODate(date);
  if (!value) return false;
  if (startDate && value < startDate) return false;
  if (endDate && value > endDate) return false;
  return true;
}

function countUnique(values) {
  return new Set(values.filter(Boolean)).size;
}

function buildRetentionSummary(facts, { startDate, endDate }) {
  const rangeVisits = facts.validVisits.filter((visit) =>
    withinRange(visit.date, startDate, endDate)
  );
  const {
    firstVisitByClient,
  } = buildLatestMaps(facts.validVisits);

  const activeClientIds = new Set(rangeVisits.map((visit) => visit.clientId));
  const newClientIds = new Set();
  const recurringClientIds = new Set();

  activeClientIds.forEach((clientId) => {
    const firstVisit = firstVisitByClient.get(clientId);
    if (firstVisit && withinRange(firstVisit.date, startDate, endDate)) {
      newClientIds.add(clientId);
    } else {
      recurringClientIds.add(clientId);
    }
  });

  const autoBookingsInRange = facts.autoBookings.filter((appointment) =>
    withinRange(appointment.appointment_date, startDate, endDate)
  );

  const autoConfirmed = autoBookingsInRange.filter((appointment) => {
    const status = normalizeRetentionText(appointment?.status);
    const confirmation = normalizeRetentionText(appointment?.confirmation_status);
    return (
      status.includes("confirm") ||
      status === "agendada" ||
      confirmation.includes("confirm")
    );
  }).length;

  const autoCancelled = autoBookingsInRange.filter((appointment) =>
    isAppointmentInactiveForRetention({
      ...appointment,
      confirmation_status: normalizeRetentionText(appointment?.confirmation_status).includes("venc")
        ? appointment?.confirmation_status
        : normalizeRetentionText(appointment?.confirmation_status).includes("cancel") ||
            normalizeRetentionText(appointment?.status).includes("cancel")
          ? appointment?.confirmation_status || appointment?.status
          : "",
    })
  ).length;

  const autoExpired = autoBookingsInRange.filter(
    (appointment) =>
      normalizeRetentionText(appointment?.status).includes("venc") ||
      normalizeRetentionText(appointment?.confirmation_status).includes("venc")
  ).length;

  return {
    activeClients: activeClientIds.size,
    newClients: newClientIds.size,
    recurringClients: recurringClientIds.size,
    validVisits: countUnique(rangeVisits.map((visit) => visit.appointmentId || visit.id)),
    fiveWeekAlerts: buildFiveWeekAlerts(facts).length,
    inactiveClients: buildInactiveClientAlerts(facts).length,
    frequentThreeMonths: buildFrequentClients(facts).filter(
      (client) => client.streakMonths === 3
    ).length,
    frequentFourPlusMonths: buildFrequentClients(facts).filter(
      (client) => client.streakMonths >= 4
    ).length,
    autoBookingsConfirmed: autoConfirmed,
    autoBookingsCancelled: autoCancelled,
    autoBookingsExpired: autoExpired,
  };
}

export function buildClientRetentionReport({
  appointments = [],
  followups = [],
  startDate,
  endDate,
  asOfDate,
  now,
} = {}) {
  const cleanStartDate = toISODate(startDate);
  const cleanEndDate = toISODate(endDate || asOfDate || new Date());
  const cleanAsOfDate = toISODate(asOfDate || cleanEndDate || new Date());
  const facts = collectRetentionFacts(appointments, {
    asOfDate: cleanAsOfDate,
    now,
    followups,
  });
  const fiveWeekAlerts = buildFiveWeekAlerts(facts);
  const inactiveClients = buildInactiveClientAlerts(facts);
  const frequentClients = buildFrequentClients(facts);

  return {
    asOfDate: facts.asOfDate,
    startDate: cleanStartDate,
    endDate: cleanEndDate,
    historicalDates: facts.historicalDates,
    fiveWeekAlerts,
    inactiveClients,
    frequentClients,
    summary: buildRetentionSummary(facts, {
      startDate: cleanStartDate,
      endDate: cleanEndDate,
    }),
  };
}

export function buildFollowupSuppressionMap(appointments = [], options = {}) {
  const facts = collectRetentionFacts(appointments, options);
  const keys = new Set();

  facts.upcomingByClientFamily.forEach((key) => {
    keys.add(`family:${key}`);
  });

  asArray(appointments).forEach((appointment) => {
    const clientId = getClientIdFromAppointment(appointment);
    if (!clientId) return;

    asArray(appointment?.appointment_services).forEach((serviceLine) => {
      if (
        !appointmentServiceBlocksFuture(appointment, serviceLine, {
          asOfDate: facts.asOfDate,
        })
      ) {
        return;
      }

      const serviceId = cleanText(serviceLine?.service_id || serviceLine?.services?.id);
      if (serviceId) keys.add(`service:${clientId}:${serviceId}`);
    });
  });

  return keys;
}

export function shouldSuppressFollowupByUpcomingAppointment(
  followup,
  upcomingByClientFamily
) {
  const clientId = cleanText(followup?.client_id);
  const serviceId = cleanText(followup?.service_id || followup?.services?.id);
  const family = getServiceFamily({
    services: followup?.services,
    service_id: followup?.service_id,
  });

  if (!clientId) return false;
  if (serviceId && upcomingByClientFamily.has(`service:${clientId}:${serviceId}`)) {
    return true;
  }
  if (!["hands", "feet"].includes(family)) return false;

  return upcomingByClientFamily.has(`family:${clientId}:${family}`);
}

export function buildRetentionWhatsAppMessage(alert) {
  const firstName = cleanText(alert?.clientName).split(/\s+/)[0] || "hermosa";

  if (alert?.type === "inactive_90_days") {
    return `Hola ${firstName} 💕 Hace un tiempo que no te vemos por el salón y queríamos saludarte. Cuando gustes volver a consentirte, con mucho gusto te ayudamos a encontrar un espacio. ✨`;
  }

  return `Hola ${firstName} 💕 Hace algunas semanas que no te vemos para ${String(
    alert?.familyLabel || "tu servicio"
  ).toLowerCase()}. Queríamos saludarte e invitarte a consentirte nuevamente cuando gustes. ✨`;
}

export function formatRetentionDate(value) {
  const date = toISODate(value);
  if (!date) return "-";
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
