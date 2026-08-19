import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import * as XLSX from "xlsx";
import {
  buildClientRetentionReport,
  buildFollowupSuppressionMap,
  daysBetweenISO,
  getRetentionHistoryWindowStart,
  isRetentionRangeAllowed,
  shouldSuppressFollowupByUpcomingAppointment,
  toISODate,
} from "../app/lib/clientRetentionReports.js";
import {
  buildRetentionReportWorkbook,
  createRetentionReportFileName,
} from "../app/lib/reportesAppointmentExcel.js";

const TODAY = "2026-08-19";
const NOW = new Date("2026-08-19T12:00:00-06:00");

function service({
  id,
  serviceId = id || "service-hands",
  name = "Gel en uña natural",
  category = "Manos",
  date,
  startTime = "10:00",
  status = "agendado",
} = {}) {
  return {
    id: id || `${serviceId}-${date || "line"}`,
    service_id: serviceId,
    service_date: date,
    start_time: startTime,
    status,
    services: {
      id: serviceId,
      name,
      category,
      bot_service_group: category,
    },
  };
}

function appointment({
  id,
  clientId = "client-1",
  clientName = "Ana Prueba",
  phone = "9991112233",
  date,
  status = "realizada",
  attendance = "asistio",
  confirmation = "confirmada",
  bookingSource = "admin",
  confirmationDeadlineAt = null,
  services = [service({ date })],
  payments = [],
} = {}) {
  return {
    id: id || `appointment-${date}-${clientId}`,
    client_id: clientId,
    appointment_date: date,
    start_time: services[0]?.start_time || "10:00",
    status,
    attendance_status: attendance,
    confirmation_status: confirmation,
    booking_source: bookingSource,
    confirmation_deadline_at: confirmationDeadlineAt,
    clients: {
      id: clientId,
      full_name: clientName,
      phone,
      created_at: "2026-01-01T10:00:00-06:00",
    },
    appointment_services: services,
    payments,
  };
}

function report(appointments, options = {}) {
  return buildClientRetentionReport({
    appointments,
    startDate: options.startDate || "2026-05-01",
    endDate: options.endDate || TODAY,
    asOfDate: options.asOfDate || TODAY,
    now: options.now || NOW,
  });
}

test("1: futura cita de manos suprime alerta de manos", () => {
  const result = report([
    appointment({
      date: "2026-07-15",
      services: [service({ date: "2026-07-15", category: "Manos" })],
    }),
    appointment({
      id: "future-hands",
      date: "2026-08-25",
      status: "pendiente",
      attendance: "pendiente",
      confirmation: "confirmada",
      services: [service({ id: "future-hands-line", date: "2026-08-25", category: "Manos" })],
    }),
  ]);

  assert.equal(result.fiveWeekAlerts.length, 0);
});

test("2: futura cita de pestañas no suprime seguimiento de manos", () => {
  const result = report([
    appointment({
      date: "2026-07-15",
      services: [service({ date: "2026-07-15", category: "Manos" })],
    }),
    appointment({
      id: "future-lashes",
      date: "2026-08-25",
      status: "pendiente",
      attendance: "pendiente",
      confirmation: "confirmada",
      services: [
        service({
          id: "future-lashes-line",
          serviceId: "service-lashes",
          date: "2026-08-25",
          name: "Lifting de pestañas",
          category: "Pestañas",
        }),
      ],
    }),
  ]);

  assert.equal(result.fiveWeekAlerts.length, 1);
  assert.equal(result.fiveWeekAlerts[0].familyLabel, "Manos");
});

test("3: manos y pies se calculan independientemente", () => {
  const result = report([
    appointment({
      date: "2026-07-15",
      services: [
        service({ id: "hands-past", date: "2026-07-15", category: "Manos" }),
        service({
          id: "feet-past",
          serviceId: "service-feet",
          date: "2026-07-15",
          name: "Pedicure spa",
          category: "Pies",
        }),
      ],
    }),
    appointment({
      id: "future-hands-only",
      date: "2026-08-26",
      status: "pendiente",
      attendance: "pendiente",
      confirmation: "confirmada",
      services: [service({ id: "future-hands-only-line", date: "2026-08-26", category: "Manos" })],
    }),
  ]);

  assert.deepEqual(
    result.fiveWeekAlerts.map((item) => item.familyLabel),
    ["Pies"]
  );
});

test("4: cita futura vencida del portal no suprime seguimiento", () => {
  const result = report([
    appointment({ date: "2026-07-15" }),
    appointment({
      id: "future-expired-portal",
      date: "2026-08-26",
      status: "pendiente",
      attendance: "pendiente",
      confirmation: "pendiente",
      bookingSource: "client_portal",
      confirmationDeadlineAt: "2026-08-18T09:00:00-06:00",
      services: [service({ id: "future-expired-line", date: "2026-08-26" })],
    }),
  ]);

  assert.equal(result.fiveWeekAlerts.length, 1);
});

test("5: cita futura cancelada no suprime seguimiento", () => {
  const result = report([
    appointment({ date: "2026-07-15" }),
    appointment({
      id: "future-cancelled",
      date: "2026-08-26",
      status: "cancelada",
      attendance: "pendiente",
      confirmation: "cancelada",
      services: [service({ id: "future-cancelled-line", date: "2026-08-26" })],
    }),
  ]);

  assert.equal(result.fiveWeekAlerts.length, 1);
});

test("6 y 7: 34 días no alerta; 35 días sí alerta", () => {
  assert.equal(report([appointment({ date: "2026-07-16" })]).fiveWeekAlerts.length, 0);
  assert.equal(report([appointment({ date: "2026-07-15" })]).fiveWeekAlerts.length, 1);
});

test("8: próxima cita de manos elimina alerta de manos", () => {
  const result = report([
    appointment({ date: "2026-07-15" }),
    appointment({
      id: "future-same-hands",
      date: "2026-09-01",
      status: "pendiente",
      attendance: "pendiente",
      confirmation: "confirmada",
      services: [service({ id: "future-same-hands-line", date: "2026-09-01" })],
    }),
  ]);

  assert.equal(result.fiveWeekAlerts.length, 0);
});

test("9 y 10: 90 días sin visitar alerta; próxima cita activa elimina inactividad", () => {
  assert.equal(report([appointment({ date: "2026-05-21" })]).inactiveClients.length, 1);
  assert.equal(
    report([
      appointment({ date: "2026-05-21" }),
      appointment({
        id: "future-any",
        date: "2026-08-30",
        status: "pendiente",
        attendance: "pendiente",
        confirmation: "confirmada",
      }),
    ]).inactiveClients.length,
    0
  );
});

test("11 y 12: prospectos, canceladas y no-show no cuentan como visita válida", () => {
  const result = report([
    appointment({
      id: "prospect",
      clientId: "prospect",
      date: "2026-07-10",
      status: "pendiente",
      attendance: "pendiente",
      confirmation: "pendiente",
    }),
    appointment({
      id: "cancelled",
      clientId: "cancelled",
      date: "2026-04-01",
      status: "cancelada",
      attendance: "cancelo",
      confirmation: "cancelada",
    }),
    appointment({
      id: "no-show",
      clientId: "no-show",
      date: "2026-04-01",
      status: "realizada",
      attendance: "no_asistio",
      confirmation: "confirmada",
    }),
  ]);

  assert.equal(result.inactiveClients.length, 0);
  assert.equal(result.fiveWeekAlerts.length, 0);
});

test("13 y 14: detecta rachas de 3 y 4 meses calendario", () => {
  const result = report([
    appointment({ id: "ana-may", clientId: "ana", date: "2026-05-10" }),
    appointment({ id: "ana-jun", clientId: "ana", date: "2026-06-10" }),
    appointment({ id: "ana-jul", clientId: "ana", date: "2026-07-10" }),
    appointment({ id: "luz-apr", clientId: "luz", clientName: "Luz", date: "2026-04-10" }),
    appointment({ id: "luz-may", clientId: "luz", clientName: "Luz", date: "2026-05-10" }),
    appointment({ id: "luz-jun", clientId: "luz", clientName: "Luz", date: "2026-06-10" }),
    appointment({ id: "luz-jul", clientId: "luz", clientName: "Luz", date: "2026-07-10" }),
  ]);

  const byClient = new Map(result.frequentClients.map((item) => [item.clientId, item]));
  assert.equal(byClient.get("ana").streakLabel, "3 meses");
  assert.equal(byClient.get("luz").streakLabel, "4+ meses");
});

test("15: cuatro citas en un solo mes no cuentan como cuatro meses consecutivos", () => {
  const result = report([
    appointment({ id: "one", date: "2026-07-01" }),
    appointment({ id: "two", date: "2026-07-08" }),
    appointment({ id: "three", date: "2026-07-15" }),
    appointment({ id: "four", date: "2026-07-22" }),
  ]);

  assert.equal(result.frequentClients.length, 0);
});

test("16: fechas locales de Mérida no se desplazan por zona horaria", () => {
  assert.equal(toISODate("2026-08-19T00:30:00-06:00"), "2026-08-19");
  assert.equal(daysBetweenISO("2026-07-15", "2026-08-19"), 35);
});

test("17: reportes aceptan rango de hasta 3 años y rechazan más", () => {
  assert.equal(isRetentionRangeAllowed("2023-08-20", "2026-08-19").ok, true);
  assert.equal(isRetentionRangeAllowed("2023-08-19", "2026-08-19").ok, false);
  assert.equal(getRetentionHistoryWindowStart("2026-08-19"), "2023-08-19");
});

test("18: no genera histórico anterior a los datos cargados", () => {
  const result = report([
    appointment({ date: "2026-06-01" }),
    appointment({ date: "2026-07-01" }),
  ]);

  assert.equal(result.historicalDates.appointments, "2026-06-01");
  assert.equal(result.historicalDates.appointmentServices, "2026-06-01");
});

test("19: filtros y Excel de retención conservan datos correctos", () => {
  const retentionReport = report([
    appointment({ date: "2026-07-15" }),
    appointment({ id: "inactive", clientId: "inactive", date: "2026-05-21" }),
    appointment({ id: "r-may", clientId: "racha", date: "2026-05-01" }),
    appointment({ id: "r-jun", clientId: "racha", date: "2026-06-01" }),
    appointment({ id: "r-jul", clientId: "racha", date: "2026-07-01" }),
  ]);
  const workbook = buildRetentionReportWorkbook(XLSX, {
    retentionReport,
    filters: { startDate: "2026-05-01", endDate: TODAY },
  });

  assert.deepEqual(workbook.SheetNames, [
    "Resumen",
    "5+ semanas",
    "3+ meses",
    "Frecuentes",
  ]);
  assert.equal(
    createRetentionReportFileName("2026-05-01", TODAY),
    "reporte-retencion-2026-05-01-a-2026-08-19.xlsx"
  );
});

test("20, 21 y 22: no envía bot, no expone proveedor ni portal cliente", async () => {
  const helperSource = await readFile(
    new URL("../app/lib/clientRetentionReports.js", import.meta.url),
    "utf8"
  );
  const followupsSource = await readFile(
    new URL("../app/admin/seguimientos/page.js", import.meta.url),
    "utf8"
  );
  const reportsSource = await readFile(
    new URL("../app/admin/reportes/page.js", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(helperSource, /fetch\(|\/messages|create_appointment_transaction|BOT_/);
  assert.doesNotMatch(`${followupsSource}\n${reportsSource}`, /\/api\/bot|\/messages|service_role/);
  assert.match(followupsSource, /AdminShell/);
  assert.match(reportsSource, /activeModule="reportes"/);
});

test("seguimientos existentes: suppress por service_id y no por otra familia", () => {
  const suppression = buildFollowupSuppressionMap(
    [
      appointment({
        id: "future-hands",
        date: "2026-08-30",
        status: "pendiente",
        attendance: "pendiente",
        confirmation: "confirmada",
        services: [service({ serviceId: "service-hands", date: "2026-08-30" })],
      }),
    ],
    { asOfDate: TODAY, now: NOW }
  );

  assert.equal(
    shouldSuppressFollowupByUpcomingAppointment(
      {
        client_id: "client-1",
        service_id: "service-hands",
        services: { category: "Manos", name: "Gel" },
      },
      suppression
    ),
    true
  );
  assert.equal(
    shouldSuppressFollowupByUpcomingAppointment(
      {
        client_id: "client-1",
        service_id: "service-lashes",
        services: { category: "Pestañas", name: "Lifting" },
      },
      suppression
    ),
    false
  );
});
