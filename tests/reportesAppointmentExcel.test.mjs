import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as XLSX from "xlsx";

import {
  appointmentReportColumns,
  staffAppointmentReportColumns,
  buildAppointmentReportWorkbook,
  createAppointmentReportFileName,
  filterReportAppointments,
  sanitizeWorksheetName,
} from "../app/lib/reportesAppointmentExcel.js";

const staffAlexandraId = "staff-alexandra";
const staffLauraId = "staff-laura";
const staffTaniaId = "staff-tania";
const serviceGelId = "service-gel";
const servicePediId = "service-pedicure";

function appointment(overrides = {}) {
  return {
    id: "appointment-1",
    appointment_date: "2026-08-01",
    start_time: "10:00:00",
    end_time: "11:00:00",
    status: "confirmada",
    attendance_status: "asistio",
    estimated_total: 160,
    deposit_amount: 50,
    clients: {
      full_name: "Clienta de prueba",
      phone: "9990000000",
    },
    appointment_services: [
      {
        id: "appointment-service-1",
        service_id: serviceGelId,
        staff_id: staffAlexandraId,
        unit_price: 160,
        total_price: 160,
        duration_minutes: 60,
        services: {
          id: serviceGelId,
          name: "Gel en uña natural",
          base_price: 160,
        },
        staff: {
          id: staffAlexandraId,
          full_name: "Alexandra",
        },
      },
    ],
    appointment_extra_items: [],
    payments: [
      {
        payment_method: "Efectivo",
        paid_amount: 160,
        total_amount: 160,
        tip_amount: 0,
        payment_staff_totals: [
          {
            staff_id: staffAlexandraId,
            service_total: 160,
            extras_total: 0,
            commission_base: 160,
            commission_amount: 16,
            tip_amount: 0,
            commission_snapshot_complete: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function sampleAppointments() {
  return [
    appointment(),
    appointment({
      id: "appointment-2",
      appointment_date: "2026-08-02",
      start_time: "12:00:00",
      end_time: "13:30:00",
      status: "pendiente",
      attendance_status: "cancelo",
      estimated_total: 250,
      deposit_amount: 0,
      clients: {
        full_name: "Otra clienta",
        phone: "9991111111",
      },
      appointment_services: [
        {
          id: "appointment-service-2",
          service_id: servicePediId,
          staff_id: staffLauraId,
          unit_price: 250,
          total_price: 250,
          duration_minutes: 90,
          services: {
            id: servicePediId,
            name: "Pedicure spa con gel",
            base_price: 250,
          },
          staff: {
            id: staffLauraId,
            full_name: "Laura/Color:Test*Name?VeryLongSheetNameForExcel",
          },
        },
      ],
      appointment_extra_items: [
        {
          name: "Decoración",
          quantity: 1,
          unit_price: 40,
          total_price: 40,
          staff_id: staffLauraId,
          staff: {
            id: staffLauraId,
            full_name: "Laura/Color:Test*Name?VeryLongSheetNameForExcel",
          },
        },
      ],
      payments: [],
    }),
    appointment({
      id: "appointment-3",
      appointment_date: "2026-08-03",
      start_time: "16:00:00",
      end_time: "17:00:00",
      status: "confirmada",
      attendance_status: "pendiente",
      estimated_total: 300,
      deposit_amount: 100,
      clients: {
        full_name: "Tercera clienta",
        phone: "9992222222",
      },
      appointment_services: [
        {
          id: "appointment-service-3",
          service_id: serviceGelId,
          staff_id: staffTaniaId,
          unit_price: 160,
          total_price: 160,
          duration_minutes: 60,
          services: {
            id: serviceGelId,
            name: "Gel en uña natural",
            base_price: 160,
          },
          staff: {
            id: staffTaniaId,
            full_name: "Tania",
          },
        },
        {
          id: "appointment-service-4",
          service_id: servicePediId,
          staff_id: staffTaniaId,
          unit_price: 140,
          total_price: 140,
          duration_minutes: 30,
          services: {
            id: servicePediId,
            name: "Retiro",
            base_price: 140,
          },
          staff: {
            id: staffTaniaId,
            full_name: "Tania",
          },
        },
      ],
      appointment_extra_items: [
        {
          name: "Diseño",
          quantity: 2,
          unit_price: 25,
          total_price: 50,
          staff_id: staffTaniaId,
          staff: {
            id: staffTaniaId,
            full_name: "Tania",
          },
        },
      ],
      payments: [
        {
          payment_method: "Transferencia",
          paid_amount: 150,
          total_amount: 150,
          tip_amount: 0,
          payment_staff_totals: [
            {
              staff_id: staffTaniaId,
              service_total: 300,
              extras_total: 50,
              commission_base: 350,
              commission_amount: 35,
              tip_amount: 0,
              commission_snapshot_complete: true,
            },
          ],
        },
      ],
    }),
    appointment({
      id: "appointment-outside-range",
      appointment_date: "2026-09-15",
      start_time: "09:00:00",
      attendance_status: "pendiente",
    }),
  ];
}

function sheetRows(workbook, sheetName) {
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
  });
}

function multiStaffAppointment() {
  return appointment({
    id: "appointment-multi-staff",
    appointment_date: "2026-08-04",
    estimated_total: 790,
    deposit_amount: 0,
    clients: { full_name: "Clienta multitécnica", phone: "9993333333" },
    appointment_services: [
      {
        id: "appointment-service-hands",
        service_id: serviceGelId,
        staff_id: staffLauraId,
        unit_price: 350,
        total_price: 350,
        duration_minutes: 60,
        services: { id: serviceGelId, name: "Manos", base_price: 350 },
        staff: { id: staffLauraId, full_name: "Laura" },
      },
      {
        id: "appointment-service-pedicure",
        service_id: servicePediId,
        staff_id: staffTaniaId,
        unit_price: 380,
        total_price: 380,
        duration_minutes: 60,
        services: { id: servicePediId, name: "Pedicure", base_price: 380 },
        staff: { id: staffTaniaId, full_name: "Tania" },
      },
    ],
    appointment_extra_items: [
      {
        id: "appointment-extra-french",
        appointment_service_id: "appointment-service-hands",
        name: "Francés",
        quantity: 1,
        unit_price: 60,
        total_price: 60,
        staff_id: staffLauraId,
        staff: { id: staffLauraId, full_name: "Laura" },
      },
    ],
    payments: [
      {
        payment_method: "Efectivo",
        paid_amount: 870,
        total_amount: 870,
        tip_amount: 80,
        payment_staff_totals: [
          {
            staff_id: staffLauraId,
            service_total: 350,
            extras_total: 60,
            commission_base: 410,
            commission_amount: 41,
            tip_amount: 30,
            commission_snapshot_complete: true,
          },
          {
            staff_id: staffTaniaId,
            service_total: 380,
            extras_total: 0,
            commission_base: 380,
            commission_amount: 38,
            tip_amount: 50,
            commission_snapshot_complete: true,
          },
        ],
      },
    ],
  });
}

test("filtra por rango de fechas y excluye citas fuera del periodo", () => {
  const result = filterReportAppointments(sampleAppointments(), {
    startDate: "2026-08-01",
    endDate: "2026-08-31",
  });

  assert.deepEqual(
    result.map((item) => item.id),
    ["appointment-1", "appointment-2", "appointment-3"]
  );
});

test("filtra por colaboradora sin modificar las citas originales", () => {
  const appointments = sampleAppointments();
  const before = JSON.stringify(appointments);
  const result = filterReportAppointments(appointments, {
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    staffId: staffLauraId,
  });

  assert.deepEqual(
    result.map((item) => item.id),
    ["appointment-2"]
  );
  assert.equal(JSON.stringify(appointments), before);
});

test("filtra por estado real de asistencia o cita", () => {
  const result = filterReportAppointments(sampleAppointments(), {
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    status: "cancelo",
  });

  assert.deepEqual(
    result.map((item) => item.id),
    ["appointment-2"]
  );
});

test("crea workbook XLSX válido con hojas Resumen, Citas y colaboradoras", () => {
  const workbook = buildAppointmentReportWorkbook(XLSX, {
    appointments: sampleAppointments(),
    filters: {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    },
  });
  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
    cellDates: true,
  });
  const parsed = XLSX.read(buffer, { type: "buffer", cellDates: true });

  assert.ok(buffer.length > 0);
  assert.ok(parsed.SheetNames.includes("Resumen"));
  assert.ok(parsed.SheetNames.includes("Citas"));
  assert.ok(parsed.SheetNames.includes("Alexandra"));
  assert.ok(parsed.SheetNames.includes("Tania"));
  assert.ok(
    parsed.SheetNames.some((name) => name.startsWith("Laura Color Test Name"))
  );
});

test("la hoja Citas contiene columnas esperadas y una fila por cita filtrada", () => {
  const workbook = buildAppointmentReportWorkbook(XLSX, {
    appointments: sampleAppointments(),
    filters: {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    },
  });
  const rows = sheetRows(workbook, "Citas");

  assert.deepEqual(rows[0], appointmentReportColumns.map((column) => column.label));
  assert.equal(rows.length, 4);
  assert.equal(rows[1][2], "Clienta de prueba");
  assert.equal(rows[1][5], "Gel en uña natural");
  assert.equal(rows[1][10], 50);
  assert.equal(rows[1][11], 160);
  assert.equal(rows[1][12], 0);
  assert.equal(rows[1][13], "Efectivo");
});

test("la hoja Resumen refleja filtros, totales, estados y colaboradoras", () => {
  const workbook = buildAppointmentReportWorkbook(XLSX, {
    appointments: sampleAppointments(),
    filters: {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      staffName: "Todas",
      serviceName: "Todos",
      statusLabel: "Todos",
    },
  });
  const rows = sheetRows(workbook, "Resumen");

  assert.deepEqual(rows[4], ["Total de citas", 3, "", "", "", ""]);
  assert.deepEqual(rows[5], ["Citas canceladas", 1, "", "", "", ""]);
  assert.deepEqual(rows[6], ["Citas completadas", 1, "", "", "", ""]);
  assert.ok(rows.some((row) => row[0] === "Alexandra" && row[1] === 1));
  assert.ok(
    rows.some(
      (row) =>
        String(row[0]).startsWith("Laura/Color") && row[1] === 1 && row[2] === 0
    )
  );
  assert.ok(
    rows.some(
      (row) =>
        row[0] === "Tania" && row[1] === 1 && row[2] === 300 && row[3] === 50
    )
  );
  assert.ok(rows.some((row) => row[0] === "Cancelada" && row[1] === 1));
  assert.ok(rows.some((row) => row[0] === "Asistió" && row[1] === 1));
});

test("cada hoja por colaboradora contiene solo sus citas y no crea hojas vacías", () => {
  const workbook = buildAppointmentReportWorkbook(XLSX, {
    appointments: sampleAppointments(),
    filters: {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    },
  });
  const alexandraRows = sheetRows(workbook, "Alexandra");
  const taniaRows = sheetRows(workbook, "Tania");
  const lauraSheetName = workbook.SheetNames.find((name) =>
    name.startsWith("Laura Color Test Name")
  );
  const lauraRows = sheetRows(workbook, lauraSheetName);

  assert.equal(alexandraRows.length, 2);
  assert.equal(alexandraRows[1][2], "Clienta de prueba");
  assert.equal(taniaRows.length, 2);
  assert.equal(taniaRows[1][2], "Tercera clienta");
  assert.equal(lauraRows.length, 2);
  assert.equal(lauraRows[1][2], "Otra clienta");
  assert.equal(workbook.SheetNames.includes("Sin citas"), false);
});

test("hojas multi-colaboradora conservan solo servicios, extras, propina y comisión propios", () => {
  const workbook = buildAppointmentReportWorkbook(XLSX, {
    appointments: [multiStaffAppointment()],
    filters: { startDate: "2026-08-04", endDate: "2026-08-04" },
  });
  const lauraRows = sheetRows(workbook, "Laura");
  const taniaRows = sheetRows(workbook, "Tania");
  const headers = staffAppointmentReportColumns.map((column) => column.label);
  const index = Object.fromEntries(headers.map((header, column) => [header, column]));

  assert.deepEqual(lauraRows[0], headers);
  assert.deepEqual(taniaRows[0], headers);
  assert.equal(lauraRows[1][index["Servicios"]], 350);
  assert.equal(lauraRows[1][index["Extras"]], 60);
  assert.equal(lauraRows[1][index["Base comisión"]], 410);
  assert.equal(lauraRows[1][index["Comisión"]], 41);
  assert.equal(lauraRows[1][index["Propina"]], 30);
  assert.equal(lauraRows[1][index["Servicios + extras + propina"]], 440);
  assert.match(lauraRows[1][index["Servicios de la colaboradora"]], /Manos/);
  assert.doesNotMatch(
    lauraRows[1][index["Servicios de la colaboradora"]],
    /Pedicure/
  );

  assert.equal(taniaRows[1][index["Servicios"]], 380);
  assert.equal(taniaRows[1][index["Extras"]], 0);
  assert.equal(taniaRows[1][index["Base comisión"]], 380);
  assert.equal(taniaRows[1][index["Comisión"]], 38);
  assert.equal(taniaRows[1][index["Propina"]], 50);
  assert.equal(taniaRows[1][index["Servicios + extras + propina"]], 430);
  assert.match(taniaRows[1][index["Servicios de la colaboradora"]], /Pedicure/);
  assert.doesNotMatch(
    taniaRows[1][index["Servicios de la colaboradora"]],
    /Manos/
  );

  assert.equal(
    lauraRows[1][index["Base comisión"]] + taniaRows[1][index["Base comisión"]],
    790
  );
  assert.equal(
    lauraRows[1][index["Servicios + extras + propina"]] +
      taniaRows[1][index["Servicios + extras + propina"]],
    870
  );
  assert.equal(lauraRows[1].includes(870), false);
  assert.equal(taniaRows[1].includes(870), false);
});

test("extra histórico sin appointment_service_id se identifica sin inventar servicio", () => {
  const historical = appointment({
    appointment_extra_items: [
      {
        id: "historical-extra",
        appointment_service_id: null,
        name: "Decoración histórica",
        quantity: 1,
        unit_price: 20,
        total_price: 20,
        staff_id: staffAlexandraId,
        staff: { id: staffAlexandraId, full_name: "Alexandra" },
      },
    ],
  });
  const workbook = buildAppointmentReportWorkbook(XLSX, {
    appointments: [historical],
    filters: { startDate: "2026-08-01", endDate: "2026-08-01" },
  });
  const generalRows = sheetRows(workbook, "Citas");
  const staffRows = sheetRows(workbook, "Alexandra");

  assert.match(generalRows[1][6], /Sin servicio identificado/);
  assert.match(staffRows[1][4], /Sin servicio identificado/);
});

test("una cita con varios servicios, extras o pagos no se duplica en la hoja Citas", () => {
  const workbook = buildAppointmentReportWorkbook(XLSX, {
    appointments: sampleAppointments(),
    filters: {
      startDate: "2026-08-03",
      endDate: "2026-08-03",
    },
  });
  const rows = sheetRows(workbook, "Citas");

  assert.equal(rows.length, 2);
  assert.equal(rows[1][2], "Tercera clienta");
  assert.match(rows[1][5], /Gel en uña natural/);
  assert.match(rows[1][5], /Retiro/);
  assert.equal(rows[1][9], 300);
  assert.equal(rows[1][10], 100);
  assert.equal(rows[1][11], 150);
  assert.equal(rows[1][12], 0);
  assert.equal(rows[1][13], "Transferencia");
  assert.equal(rows[1][14], 150);
});

test("aplica formato legible en fechas, horas, importes, encabezados y anchos", () => {
  const workbook = buildAppointmentReportWorkbook(XLSX, {
    appointments: sampleAppointments(),
    filters: {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    },
  });
  const worksheet = workbook.Sheets.Citas;

  assert.ok(worksheet["!cols"].every((column) => column.wch >= 10));
  assert.deepEqual(sheetRows(workbook, "Citas")[0], appointmentReportColumns.map((column) => column.label));
  assert.equal(worksheet.A2.z, "yyyy-mm-dd");
  assert.equal(worksheet.B2.z, "hh:mm");
  assert.equal(worksheet.J2.z, '"$"#,##0.00');
  assert.equal(worksheet.K2.z, '"$"#,##0.00');
  assert.equal(worksheet.L2.z, '"$"#,##0.00');
  assert.equal(worksheet.M2.z, '"$"#,##0.00');
  assert.equal(worksheet.O2.z, '"$"#,##0.00');
  assert.ok(worksheet["!autofilter"]);
  assert.deepEqual(worksheet["!freeze"], { xSplit: 0, ySplit: 1 });
});

test("sanitiza nombres de hojas y evita duplicados", () => {
  const used = new Set(["Resumen", "Citas"]);
  const first = sanitizeWorksheetName("Laura/Color:Test*Name?VeryLongSheetNameForExcel", used);
  const second = sanitizeWorksheetName("Laura/Color:Test*Name?VeryLongSheetNameForExcel", used);

  assert.equal(first.length <= 31, true);
  assert.equal(second.length <= 31, true);
  assert.notEqual(first, second);
  assert.doesNotMatch(first, /[\[\]:*?/\\]/);
});

test("el nombre de archivo usa el rango seleccionado", () => {
  assert.equal(
    createAppointmentReportFileName("2026-08-01", "2026-08-31"),
    "reporte-citas-2026-08-01-a-2026-08-31.xlsx"
  );
});

test("la exportación no crea endpoint público ni usa escrituras remotas", () => {
  const pageSource = readFileSync(
    new URL("../app/admin/reportes/page.js", import.meta.url),
    "utf8"
  );
  const helperSource = readFileSync(
    new URL("../app/lib/reportesAppointmentExcel.js", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(helperSource, /from\(["'][a-z_]+["']\)/);
  assert.doesNotMatch(helperSource, /insert|update|delete|upsert/i);
  assert.doesNotMatch(`${pageSource}\n${helperSource}`, /export async function GET/);
  assert.doesNotMatch(`${pageSource}\n${helperSource}`, /service_role/i);
  assert.doesNotMatch(`${pageSource}\n${helperSource}`, /\/register\b/);
  assert.doesNotMatch(`${pageSource}\n${helperSource}`, /\/messages\b/);
});
