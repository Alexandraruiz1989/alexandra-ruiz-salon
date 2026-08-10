import {
  getReportCommissionAmount,
  getServiceCommissionPercent,
} from "./paymentEconomics.js";

const EXCEL_MAX_SHEET_NAME_LENGTH = 31;
const EXCEL_INVALID_SHEET_NAME_CHARS = /[\[\]:*?/\\]/g;

export const appointmentReportColumns = [
  { key: "fecha", label: "Fecha", width: 14, format: "yyyy-mm-dd" },
  { key: "hora", label: "Hora", width: 10, format: "hh:mm" },
  { key: "clienta", label: "Clienta", width: 28 },
  { key: "telefono", label: "Teléfono", width: 18 },
  { key: "staff", label: "Técnica / colaboradora", width: 28 },
  { key: "servicio", label: "Servicio", width: 34 },
  { key: "extras", label: "Extras", width: 30 },
  { key: "estado", label: "Estado de la cita", width: 22 },
  { key: "duracion", label: "Duración (min)", width: 15 },
  {
    key: "total",
    label: "Precio / total de la cita",
    width: 20,
    format: '"$"#,##0.00',
  },
  { key: "anticipo", label: "Anticipo", width: 14, format: '"$"#,##0.00' },
  {
    key: "pagado",
    label: "Total pagado",
    width: 16,
    format: '"$"#,##0.00',
  },
  { key: "propina", label: "Propina total", width: 15, format: '"$"#,##0.00' },
  { key: "formaPago", label: "Forma de pago", width: 20 },
  { key: "saldo", label: "Saldo", width: 14, format: '"$"#,##0.00' },
];

export const staffAppointmentReportColumns = [
  { key: "fecha", label: "Fecha", width: 14, format: "yyyy-mm-dd" },
  { key: "hora", label: "Hora", width: 10, format: "hh:mm" },
  { key: "clienta", label: "Clienta", width: 28 },
  { key: "servicio", label: "Servicios de la colaboradora", width: 36 },
  { key: "extras", label: "Extras de sus servicios", width: 34 },
  { key: "serviceTotal", label: "Servicios", width: 15, format: '"$"#,##0.00' },
  { key: "extrasTotal", label: "Extras", width: 15, format: '"$"#,##0.00' },
  { key: "commissionBase", label: "Base comisión", width: 18, format: '"$"#,##0.00' },
  { key: "commissionAmount", label: "Comisión", width: 15, format: '"$"#,##0.00' },
  { key: "tipAmount", label: "Propina", width: 15, format: '"$"#,##0.00' },
  { key: "staffTotal", label: "Servicios + extras + propina", width: 24, format: '"$"#,##0.00' },
  { key: "formaPago", label: "Forma de pago", width: 20 },
  { key: "estado", label: "Estado de la cita", width: 22 },
];

const statusLabels = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  confirmada_llamada: "Confirmada por llamada",
  confirmada_mensaje: "Confirmada por mensaje",
  asistio: "Asistió",
  llego_retrasada: "Llegó retrasada",
  cancelo: "Cancelada",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
  completada: "Completada",
  pagada: "Pagada",
};

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const parsed = toNumber(value, 0);
    if (parsed > 0) return parsed;
  }

  return 0;
}

function uniqueTexts(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function toLocalDate(dateString) {
  if (!dateString) return "";
  const [year, month, day] = String(dateString).split("-").map(Number);

  if (!year || !month || !day) return cleanText(dateString);

  return new Date(year, month - 1, day);
}

function timeToExcelDate(timeString) {
  const value = cleanText(timeString);
  const [hours, minutes] = value.split(":").map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return value;
  }

  return new Date(1899, 11, 30, hours, minutes, 0);
}

function formatTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function formatStatus(value) {
  const normalized = normalizeText(value || "pendiente");
  return statusLabels[normalized] || cleanText(value) || "Pendiente";
}

function getAppointmentServices(appointment) {
  return asArray(appointment?.appointment_services);
}

function getAppointmentExtras(appointment) {
  return asArray(appointment?.appointment_extra_items);
}

function getAppointmentPayments(appointment) {
  return asArray(appointment?.payments);
}

function getServiceName(serviceLine) {
  return (
    cleanText(serviceLine?.custom_name) ||
    cleanText(serviceLine?.services?.name) ||
    cleanText(serviceLine?.name) ||
    "Servicio"
  );
}

function getServiceTotal(serviceLine) {
  const quantity = firstPositiveNumber(serviceLine?.quantity, 1) || 1;
  const unitPrice = firstPositiveNumber(
    serviceLine?.unit_price,
    serviceLine?.price,
    serviceLine?.services?.base_price
  );

  return firstPositiveNumber(serviceLine?.total_price, unitPrice * quantity);
}

function getExtraName(extraLine) {
  return cleanText(extraLine?.name) || cleanText(extraLine?.service_extras?.name);
}

function getExtraTotal(extraLine) {
  const quantity = firstPositiveNumber(extraLine?.quantity, 1) || 1;
  const unitPrice = firstPositiveNumber(extraLine?.unit_price);

  return firstPositiveNumber(extraLine?.total_price, unitPrice * quantity);
}

function getPaymentTotal(payment) {
  return firstPositiveNumber(
    payment?.paid_amount,
    payment?.total_amount,
    payment?.total
  );
}

function getAppointmentPaidTotal(appointment) {
  return getAppointmentPayments(appointment).reduce(
    (sum, payment) => sum + getPaymentTotal(payment),
    0
  );
}

function getAppointmentTipTotal(appointment) {
  return getAppointmentPayments(appointment).reduce(
    (sum, payment) => sum + toNumber(payment?.tip_amount, 0),
    0
  );
}

function getAppointmentServicesTotal(appointment) {
  return getAppointmentServices(appointment).reduce(
    (sum, serviceLine) => sum + getServiceTotal(serviceLine),
    0
  );
}

function getAppointmentExtrasTotal(appointment) {
  return getAppointmentExtras(appointment).reduce(
    (sum, extraLine) => sum + getExtraTotal(extraLine),
    0
  );
}

function getAppointmentTotal(appointment) {
  return firstPositiveNumber(
    appointment?.total_amount,
    appointment?.estimated_total,
    appointment?.total,
    getAppointmentServicesTotal(appointment) + getAppointmentExtrasTotal(appointment)
  );
}

function getAppointmentDuration(appointment) {
  const serviceDuration = getAppointmentServices(appointment).reduce(
    (sum, serviceLine) => sum + toNumber(serviceLine?.duration_minutes, 0),
    0
  );

  if (serviceDuration > 0) return serviceDuration;

  const start = cleanText(appointment?.start_time);
  const end = cleanText(appointment?.end_time);
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);

  if (
    !Number.isFinite(startHour) ||
    !Number.isFinite(startMinute) ||
    !Number.isFinite(endHour) ||
    !Number.isFinite(endMinute)
  ) {
    return "";
  }

  return Math.max(endHour * 60 + endMinute - (startHour * 60 + startMinute), 0);
}

function getAppointmentStaffRefs(appointment) {
  const refs = [];

  getAppointmentServices(appointment).forEach((serviceLine) => {
    refs.push({
      id: cleanText(serviceLine?.staff_id || serviceLine?.staff?.id),
      name: cleanText(serviceLine?.staff?.full_name),
      person: serviceLine?.staff || null,
    });
  });

  if (appointment?.staff_id || appointment?.staff?.full_name) {
    refs.push({
      id: cleanText(appointment?.staff_id || appointment?.staff?.id),
      name: cleanText(appointment?.staff?.full_name),
      person: appointment?.staff || null,
    });
  }

  const seen = new Set();
  return refs
    .map((ref) => ({
      id: ref.id,
      name: ref.name || "Sin técnica registrada",
      key: ref.id || ref.name || "Sin técnica registrada",
      person: ref.person,
    }))
    .filter((ref) => {
      if (seen.has(ref.key)) return false;
      seen.add(ref.key);
      return true;
    });
}

function getAppointmentStaffNames(appointment) {
  return getAppointmentStaffRefs(appointment).map((ref) => ref.name);
}

function getAppointmentStateText(appointment) {
  const appointmentStatus = formatStatus(appointment?.status);
  const attendanceStatus = normalizeText(appointment?.attendance_status);

  if (!attendanceStatus || attendanceStatus === "pendiente") {
    return appointmentStatus;
  }

  return `${appointmentStatus} · Asistencia: ${formatStatus(attendanceStatus)}`;
}

function getAppointmentRow(appointment) {
  const total = getAppointmentTotal(appointment);
  const paid = getAppointmentPaidTotal(appointment);
  const serviceNames = getAppointmentServices(appointment).map(getServiceName);
  const extraNames = getAppointmentExtras(appointment).map((extraLine) => {
    const name = getExtraName(extraLine);
    return extraLine?.appointment_service_id
      ? name
      : `${name || "Extra"} (Sin servicio identificado)`;
  });
  const paymentMethods = getAppointmentPayments(appointment).map(
    (payment) => payment?.payment_method
  );

  return {
    fecha: toLocalDate(appointment?.appointment_date),
    hora: timeToExcelDate(appointment?.start_time),
    clienta: cleanText(appointment?.clients?.full_name) || "Clienta",
    telefono: cleanText(appointment?.clients?.phone),
    staff: uniqueTexts(getAppointmentStaffNames(appointment)).join(", "),
    servicio: uniqueTexts(serviceNames).join(", "),
    extras: uniqueTexts(extraNames).join(", "),
    estado: getAppointmentStateText(appointment),
    duracion: getAppointmentDuration(appointment),
    total,
    anticipo: toNumber(appointment?.deposit_amount, 0),
    pagado: paid,
    propina: getAppointmentTipTotal(appointment),
    formaPago: uniqueTexts(paymentMethods).join(", "),
    saldo: Math.max(total - paid, 0),
  };
}

function appointmentMatchesDateRange(appointment, { startDate, endDate }) {
  const date = cleanText(appointment?.appointment_date);
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}

function appointmentMatchesStaff(appointment, staffId) {
  const cleanStaffId = cleanText(staffId);
  if (!cleanStaffId) return true;

  return getAppointmentStaffRefs(appointment).some((ref) => ref.id === cleanStaffId);
}

function appointmentMatchesService(appointment, serviceId) {
  const cleanServiceId = cleanText(serviceId);
  if (!cleanServiceId) return true;

  return getAppointmentServices(appointment).some(
    (serviceLine) => cleanText(serviceLine?.service_id || serviceLine?.services?.id) === cleanServiceId
  );
}

function appointmentMatchesStatus(appointment, status) {
  const cleanStatus = normalizeText(status);
  if (!cleanStatus) return true;

  return (
    normalizeText(appointment?.status) === cleanStatus ||
    normalizeText(appointment?.attendance_status) === cleanStatus
  );
}

function isCancelledAppointment(appointment) {
  const status = normalizeText(appointment?.status);
  const attendanceStatus = normalizeText(appointment?.attendance_status);

  return status.includes("cancel") || attendanceStatus === "cancelo";
}

export function filterReportAppointments(appointments = [], filters = {}) {
  return asArray(appointments).filter(
    (appointment) =>
      appointmentMatchesDateRange(appointment, filters) &&
      appointmentMatchesStaff(appointment, filters.staffId) &&
      appointmentMatchesService(appointment, filters.serviceId) &&
      appointmentMatchesStatus(appointment, filters.status)
  );
}

function createRowsForAppointments(appointments) {
  return appointments.map(getAppointmentRow);
}

function getPaymentStaffTotals(appointment, staffId) {
  return getAppointmentPayments(appointment).flatMap((payment) =>
    asArray(payment?.payment_staff_totals).filter(
      (total) => cleanText(total?.staff_id) === cleanText(staffId)
    )
  );
}

function getStaffAppointmentRow(appointment, staffRef) {
  const staffId = cleanText(staffRef?.id);
  const serviceLines = getAppointmentServices(appointment).filter(
    (serviceLine) =>
      cleanText(serviceLine?.staff_id || serviceLine?.staff?.id) === staffId
  );
  const serviceIds = new Set(serviceLines.map((serviceLine) => serviceLine.id));
  const extraLines = getAppointmentExtras(appointment).filter((extraLine) => {
    const appointmentServiceId = cleanText(extraLine?.appointment_service_id);
    if (appointmentServiceId) return serviceIds.has(appointmentServiceId);
    return cleanText(extraLine?.staff_id || extraLine?.staff?.id) === staffId;
  });
  const savedTotals = getPaymentStaffTotals(appointment, staffId);
  const fallbackPercent = getServiceCommissionPercent(staffRef?.person);
  const cancelled = isCancelledAppointment(appointment);

  const fallbackServiceTotal = serviceLines.reduce(
    (sum, serviceLine) => sum + getServiceTotal(serviceLine),
    0
  );
  const fallbackExtrasTotal = extraLines.reduce(
    (sum, extraLine) => sum + getExtraTotal(extraLine),
    0
  );

  const serviceTotal = cancelled
    ? 0
    : savedTotals.length > 0
      ? savedTotals.reduce((sum, total) => sum + toNumber(total.service_total), 0)
      : fallbackServiceTotal;
  const extrasTotal = cancelled
    ? 0
    : savedTotals.length > 0
      ? savedTotals.reduce((sum, total) => sum + toNumber(total.extras_total), 0)
      : fallbackExtrasTotal;
  const commissionBase = cancelled
    ? 0
    : savedTotals.length > 0
      ? savedTotals.reduce((sum, total) => sum + toNumber(total.commission_base), 0)
      : serviceTotal + extrasTotal;
  const commissionAmount = cancelled
    ? 0
    : savedTotals.length > 0
      ? savedTotals.reduce(
          (sum, total) => sum + getReportCommissionAmount(total, fallbackPercent),
          0
        )
      : (commissionBase * fallbackPercent) / 100;
  const tipAmount = cancelled
    ? 0
    : savedTotals.reduce((sum, total) => sum + toNumber(total.tip_amount), 0);
  const paymentMethods = getAppointmentPayments(appointment).map(
    (payment) => payment?.payment_method
  );
  const extraNames = extraLines.map((extraLine) => {
    const name = getExtraName(extraLine) || "Extra";
    return extraLine?.appointment_service_id
      ? name
      : `${name} (Sin servicio identificado)`;
  });

  return {
    fecha: toLocalDate(appointment?.appointment_date),
    hora: timeToExcelDate(appointment?.start_time),
    clienta: cleanText(appointment?.clients?.full_name) || "Clienta",
    servicio: uniqueTexts(serviceLines.map(getServiceName)).join(", "),
    extras: uniqueTexts(extraNames).join(", "),
    serviceTotal,
    extrasTotal,
    commissionBase,
    commissionAmount,
    tipAmount,
    staffTotal: serviceTotal + extrasTotal + tipAmount,
    formaPago: uniqueTexts(paymentMethods).join(", "),
    estado: getAppointmentStateText(appointment),
  };
}

export function sanitizeWorksheetName(name, usedNames = new Set()) {
  const cleaned =
    cleanText(name).replace(EXCEL_INVALID_SHEET_NAME_CHARS, " ").replace(/\s+/g, " ") ||
    "Hoja";
  const base = cleaned.slice(0, EXCEL_MAX_SHEET_NAME_LENGTH);
  let candidate = base;
  let index = 2;

  while (usedNames.has(candidate)) {
    const suffix = ` ${index}`;
    candidate = `${base.slice(0, EXCEL_MAX_SHEET_NAME_LENGTH - suffix.length)}${suffix}`;
    index += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function appendSheet(XLSX, workbook, sheetName, rows, columns = appointmentReportColumns) {
  const headers = columns.map((column) => column.label);
  const data = rows.map((row) => columns.map((column) => row[column.key]));
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data], {
    cellDates: true,
  });
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");

  worksheet["!cols"] = columns.map((column) => ({ wch: column.width || 16 }));
  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(range.e.r, 0), c: range.e.c },
    }),
  };
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };

  for (let rowIndex = 1; rowIndex <= range.e.r; rowIndex += 1) {
    columns.forEach((column, columnIndex) => {
      if (!column.format) return;

      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      if (worksheet[address]) {
        worksheet[address].z = column.format;
      }
    });
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
}

function createSummaryRows(appointments, filters) {
  const rows = createRowsForAppointments(appointments);
  const byStaff = new Map();
  const statusCounts = new Map();

  appointments.forEach((appointment) => {
    const staffRefs = getAppointmentStaffRefs(appointment);
    const status = normalizeText(appointment?.attendance_status || appointment?.status || "pendiente");

    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);

    if (staffRefs.length === 0) {
      staffRefs.push({ id: "", name: "Sin técnica registrada", key: "Sin técnica registrada" });
    }

    staffRefs.forEach((staffRef) => {
      const key = staffRef.key;
      const current = byStaff.get(key) || {
        name: staffRef.name,
        citas: 0,
        serviceTotal: 0,
        extrasTotal: 0,
        tipAmount: 0,
        commissionAmount: 0,
      };
      const staffRow = getStaffAppointmentRow(appointment, staffRef);

      current.citas += 1;
      current.serviceTotal += staffRow.serviceTotal;
      current.extrasTotal += staffRow.extrasTotal;
      current.tipAmount += staffRow.tipAmount;
      current.commissionAmount += staffRow.commissionAmount;
      byStaff.set(key, current);
    });
  });

  const cancelled = appointments.filter(isCancelledAppointment).length;

  const completed = appointments.filter((appointment) => {
    const status = normalizeText(appointment?.status);
    const attendanceStatus = normalizeText(appointment?.attendance_status);
    return ["completada", "pagada"].includes(status) || attendanceStatus === "asistio";
  }).length;

  const summaryRows = [
    ["Métrica", "Valor"],
    ["Fecha inicial seleccionada", toLocalDate(filters.startDate)],
    ["Fecha final seleccionada", toLocalDate(filters.endDate)],
    [
      "Filtros aplicados",
      [
        `Rango: ${filters.startDate || "sin inicio"} a ${filters.endDate || "sin fin"}`,
        `Colaboradora: ${filters.staffName || "Todas"}`,
        `Servicio: ${filters.serviceName || "Todos"}`,
        `Estado: ${filters.statusLabel || filters.status || "Todos"}`,
      ].join("; "),
    ],
    ["Total de citas", rows.length],
    ["Citas canceladas", cancelled],
    ["Citas completadas", completed],
    [],
    [
      "Citas por colaboradora",
      "Total citas",
      "Servicios",
      "Extras",
      "Propinas",
      "Comisión almacenada/fallback histórico",
    ],
    ...[...byStaff.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((item) => [
        item.name,
        item.citas,
        item.serviceTotal,
        item.extrasTotal,
        item.tipAmount,
        item.commissionAmount,
      ]),
    [],
    ["Estados del periodo", "Total"],
    ...[...statusCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "es"))
      .map(([status, count]) => [formatStatus(status), count]),
  ];

  return summaryRows;
}

function appendSummarySheet(XLSX, workbook, appointments, filters) {
  const worksheet = XLSX.utils.aoa_to_sheet(createSummaryRows(appointments, filters), {
    cellDates: true,
  });
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");

  worksheet["!cols"] = [
    { wch: 34 },
    { wch: 28 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 24 },
  ];
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };

  for (let rowIndex = 1; rowIndex <= range.e.r; rowIndex += 1) {
    const valueAddress = XLSX.utils.encode_cell({ r: rowIndex, c: 1 });

    if (worksheet[valueAddress]?.v instanceof Date) {
      worksheet[valueAddress].z = "yyyy-mm-dd";
    }

    for (let columnIndex = 2; columnIndex <= 5; columnIndex += 1) {
      const moneyAddress = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      if (worksheet[moneyAddress] && typeof worksheet[moneyAddress].v === "number") {
        worksheet[moneyAddress].z = '"$"#,##0.00';
      }
    }
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, "Resumen");
}

function groupAppointmentsByStaff(appointments) {
  const groups = new Map();

  appointments.forEach((appointment) => {
    const refs = getAppointmentStaffRefs(appointment);
    const groupRefs =
      refs.length > 0
        ? refs
        : [{ key: "Sin técnica registrada", name: "Sin técnica registrada" }];

    groupRefs.forEach((ref) => {
      const group = groups.get(ref.key) || {
        name: ref.name,
        staffRef: ref,
        appointments: [],
      };

      group.appointments.push(appointment);
      groups.set(ref.key, group);
    });
  });

  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function buildAppointmentReportWorkbook(XLSX, { appointments = [], filters = {} } = {}) {
  if (!XLSX?.utils?.book_new) {
    throw new Error("xlsx_unavailable");
  }

  const filteredAppointments = filterReportAppointments(appointments, filters);
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set(["Resumen", "Citas"]);

  appendSummarySheet(XLSX, workbook, filteredAppointments, filters);
  appendSheet(XLSX, workbook, "Citas", createRowsForAppointments(filteredAppointments));

  groupAppointmentsByStaff(filteredAppointments).forEach((group) => {
    if (group.appointments.length === 0) return;

    appendSheet(
      XLSX,
      workbook,
      sanitizeWorksheetName(group.name, usedNames),
      group.appointments.map((appointment) =>
        getStaffAppointmentRow(appointment, group.staffRef)
      ),
      staffAppointmentReportColumns
    );
  });

  return workbook;
}

export function createAppointmentReportFileName(startDate, endDate) {
  const cleanStart = cleanText(startDate) || "sin-inicio";
  const cleanEnd = cleanText(endDate) || cleanStart;
  return `reporte-citas-${cleanStart}-a-${cleanEnd}.xlsx`;
}
