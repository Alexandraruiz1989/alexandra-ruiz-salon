"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "../components/AdminShell";
import { supabase } from "../../lib/supabaseClient";

const menuItems = [
  { key: "comisiones", label: "Comisiones" },
  { key: "ajustes", label: "Faltas / Retardos / Vacaciones" },
  { key: "sueldos", label: "Sueldos semanales" },
  { key: "imprimible", label: "Recibo imprimible" },
];

const adjustmentTypes = [
  { value: "falta", label: "Falta" },
  { value: "retardo", label: "Retardo" },
  { value: "vacaciones", label: "Vacaciones" },
  { value: "descuento", label: "Descuento" },
  { value: "bono", label: "Bono" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getStartOfWeek(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function getEndOfWeek(dateString) {
  const date = new Date(`${getStartOfWeek(dateString)}T00:00:00`);
  date.setDate(date.getDate() + 6);
  return date.toISOString().slice(0, 10);
}

function getStartOfMonth(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Date(date.getFullYear(), date.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

function getEndOfMonth(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
}

function getDaysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const difference = end.getTime() - start.getTime();

  return Math.max(Math.floor(difference / (1000 * 60 * 60 * 24)) + 1, 1);
}

function getSalaryForPeriod(weeklySalary, startDate, endDate) {
  const days = getDaysBetween(startDate, endDate);
  const dailySalary = Number(weeklySalary || 0) / 7;

  return dailySalary * days;
}
function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-[1.5rem] bg-white p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-start print:hidden">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
          {eyebrow}
        </p>
        <h3 className="mt-2 text-2xl font-light">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-[#68777c]">{description}</p>
        )}
      </div>

      {action}
    </div>
  );
}

function getCommissionPercent(person) {
  const possibleFields = [
    "service_commission_percent",
    "services_commission_percent",
    "commission_service_percent",
    "commission_services_percent",
    "service_commission_percentage",
    "services_commission_percentage",
    "commission_percentage",
    "commission_percent",
    "commission",
  ];

  for (const field of possibleFields) {
    const value = Number(person?.[field] || 0);
    if (value > 0) return value;
  }

  return 0;
}

function getProductCommissionPercent(person) {
  const possibleFields = [
    "product_commission_percent",
    "products_commission_percent",
    "sales_commission_percent",
    "commission_products_percent",
    "product_commission_percentage",
    "products_commission_percentage",
  ];

  for (const field of possibleFields) {
    const value = Number(person?.[field] || 0);
    if (value > 0) return value;
  }

  return 0;
}

function normalizeAdjustmentType(type) {
  return String(type || "").toLowerCase();
}

export default function ReportesPage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [activeSection, setActiveSection] = useState("comisiones");
  const [message, setMessage] = useState("");
  const [salaryMessage, setSalaryMessage] = useState("");
const [activeSalaryMessageId, setActiveSalaryMessageId] = useState(null);

  const [rangeType, setRangeType] = useState("week");
  const [baseDate, setBaseDate] = useState(todayISO());
  const [startDate, setStartDate] = useState(getStartOfWeek(todayISO()));
  const [endDate, setEndDate] = useState(getEndOfWeek(todayISO()));

  const [staff, setStaff] = useState([]);
  const [payrollSettings, setPayrollSettings] = useState([]);
  const [paymentStaffTotals, setPaymentStaffTotals] = useState([]);
  const [adjustments, setAdjustments] = useState([]);

  const [salaryDrafts, setSalaryDrafts] = useState({});
  const [adjustmentForm, setAdjustmentForm] = useState({
    staff_id: "",
    adjustment_date: todayISO(),
    adjustment_type: "falta",
    amount: 0,
    notes: "",
  });

  useEffect(() => {
    const start = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        window.location.href = "/admin";
        return;
      }

      setLoadingSession(false);
      await loadData();
    };

    start();
  }, []);

  useEffect(() => {
    if (!loadingSession) {
      loadData();
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(() => {
      setMessage("");
    }, 15000);

    return () => clearTimeout(timer);
  }, [message]);

  const setQuickRange = (type) => {
    setRangeType(type);

    if (type === "day") {
      setStartDate(baseDate);
      setEndDate(baseDate);
    }

    if (type === "week") {
      setStartDate(getStartOfWeek(baseDate));
      setEndDate(getEndOfWeek(baseDate));
    }

    if (type === "month") {
      setStartDate(getStartOfMonth(baseDate));
      setEndDate(getEndOfMonth(baseDate));
    }
  };

  const handleBaseDateChange = (value) => {
    setBaseDate(value);

    if (rangeType === "day") {
      setStartDate(value);
      setEndDate(value);
    }

    if (rangeType === "week") {
      setStartDate(getStartOfWeek(value));
      setEndDate(getEndOfWeek(value));
    }

    if (rangeType === "month") {
      setStartDate(getStartOfMonth(value));
      setEndDate(getEndOfMonth(value));
    }
  };

  const loadData = async () => {
    setLoadingData(true);
    setMessage("");

    const [staffResult, settingsResult, totalsResult, adjustmentsResult] =
      await Promise.all([
        supabase.from("staff").select("*").order("full_name"),

        supabase.from("staff_payroll_settings").select("*"),

        supabase
          .from("payment_staff_totals")
          .select(
            `
            *,
            payments!inner (
              id,
              payment_date,
              total_amount,
              payment_method
            ),
            staff (
              id,
              full_name
            )
          `
          )
          .gte("payments.payment_date", startDate)
          .lte("payments.payment_date", endDate),

        supabase
          .from("payroll_adjustments")
          .select(
            `
            *,
            staff (
              id,
              full_name
            )
          `
          )
          .gte("adjustment_date", startDate)
          .lte("adjustment_date", endDate)
          .order("adjustment_date", { ascending: false }),
      ]);

    if (staffResult.error) {
      setMessage(`No se pudo cargar personal: ${staffResult.error.message}`);
    } else {
      setStaff(staffResult.data || []);
    }

    if (settingsResult.error) {
      setMessage(`No se pudieron cargar sueldos: ${settingsResult.error.message}`);
    } else {
      const rows = settingsResult.data || [];
      setPayrollSettings(rows);

      const drafts = {};
      rows.forEach((item) => {
        drafts[item.staff_id] = Number(item.weekly_salary || 0);
      });
      setSalaryDrafts(drafts);
    }

    if (totalsResult.error) {
      setMessage(
        `No se pudieron cargar comisiones: ${totalsResult.error.message}`
      );
    } else {
      setPaymentStaffTotals(totalsResult.data || []);
    }

    if (adjustmentsResult.error) {
      setMessage(
        `No se pudieron cargar ajustes: ${adjustmentsResult.error.message}`
      );
    } else {
      setAdjustments(adjustmentsResult.data || []);
    }

    setLoadingData(false);
  };

  const ensurePayrollSetting = async (staffId) => {
    const existing = payrollSettings.find((item) => item.staff_id === staffId);

    if (existing) return existing;

    const { data, error } = await supabase
      .from("staff_payroll_settings")
      .insert([
        {
          staff_id: staffId,
          weekly_salary: 0,
          active: true,
        },
      ])
      .select()
      .single();

    if (error) {
      setMessage(`No se pudo crear sueldo base: ${error.message}`);
      return null;
    }

    setPayrollSettings((current) => [...current, data]);

    return data;
  };

  const saveSalary = async (staffId) => {
  setMessage("");
  setSalaryMessage("");
  setActiveSalaryMessageId(staffId);

  const setting = await ensurePayrollSetting(staffId);
  if (!setting) return;

  const { error } = await supabase
    .from("staff_payroll_settings")
    .update({
      weekly_salary: Number(salaryDrafts[staffId] || 0),
      updated_at: new Date().toISOString(),
    })
    .eq("staff_id", staffId);

  if (error) {
    setSalaryMessage(`No se pudo guardar sueldo semanal: ${error.message}`);
    return;
  }

  setSalaryMessage("Sueldo semanal guardado correctamente ✨");
  await loadData();
};

  const saveAdjustment = async () => {
    setMessage("");

    if (!adjustmentForm.staff_id) {
      setMessage("Selecciona una técnica.");
      return;
    }

    if (!adjustmentForm.adjustment_date) {
      setMessage("Selecciona una fecha.");
      return;
    }

    const { error } = await supabase.from("payroll_adjustments").insert([
      {
        staff_id: adjustmentForm.staff_id,
        adjustment_date: adjustmentForm.adjustment_date,
        adjustment_type: adjustmentForm.adjustment_type,
        amount: Number(adjustmentForm.amount || 0),
        notes: adjustmentForm.notes?.trim() || null,
      },
    ]);

    if (error) {
      setMessage(`No se pudo guardar el ajuste: ${error.message}`);
      return;
    }

    setMessage("Ajuste guardado correctamente ✨");
    setAdjustmentForm({
      staff_id: "",
      adjustment_date: todayISO(),
      adjustment_type: "falta",
      amount: 0,
      notes: "",
    });
    await loadData();
  };

  const deleteAdjustment = async (id) => {
    const confirmed = window.confirm("¿Eliminar este ajuste?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("payroll_adjustments")
      .delete()
      .eq("id", id);

    if (error) {
      setMessage(`No se pudo eliminar ajuste: ${error.message}`);
      return;
    }

    setMessage("Ajuste eliminado correctamente.");
    await loadData();
  };

  const reportRows = useMemo(() => {
    return staff.map((person) => {
      const staffTotals = paymentStaffTotals.filter(
        (item) => item.staff_id === person.id
      );

      const serviceTotal = staffTotals.reduce(
        (sum, item) => sum + Number(item.service_total || 0),
        0
      );

      const extrasTotal = staffTotals.reduce(
        (sum, item) => sum + Number(item.extras_total || 0),
        0
      );

      const commissionBase = staffTotals.reduce(
        (sum, item) => sum + Number(item.commission_base || 0),
        0
      );

      const savedCommission = staffTotals.reduce(
        (sum, item) => sum + Number(item.commission_amount || 0),
        0
      );

      const tipTotal = staffTotals.reduce(
        (sum, item) => sum + Number(item.tip_amount || 0),
        0
      );

      const serviceCommissionPercent = getCommissionPercent(person);
      const productCommissionPercent = getProductCommissionPercent(person);

      const calculatedServiceCommission =
        savedCommission > 0
          ? savedCommission
          : commissionBase * (serviceCommissionPercent / 100);

      const productSalesTotal = 0;
      const productCommission =
        productSalesTotal * (productCommissionPercent / 100);

      const personAdjustments = adjustments.filter(
        (item) => item.staff_id === person.id
      );

      const absences = personAdjustments.filter(
        (item) => normalizeAdjustmentType(item.adjustment_type) === "falta"
      );

      const lateArrivals = personAdjustments.filter(
        (item) => normalizeAdjustmentType(item.adjustment_type) === "retardo"
      );

      const vacationDays = personAdjustments.filter(
        (item) => normalizeAdjustmentType(item.adjustment_type) === "vacaciones"
      );

      const discounts = personAdjustments.filter(
        (item) => normalizeAdjustmentType(item.adjustment_type) === "descuento"
      );

      const bonuses = personAdjustments.filter(
        (item) => normalizeAdjustmentType(item.adjustment_type) === "bono"
      );

      const absenceDiscount = absences.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );

      const lateDiscount = lateArrivals.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );

      const manualDiscount = discounts.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );

      const bonusTotal = bonuses.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );

      const payrollSetting = payrollSettings.find(
        (item) => item.staff_id === person.id
      );

      const weeklySalary = Number(payrollSetting?.weekly_salary || 0);
      const salaryForPeriod = getSalaryForPeriod(
  weeklySalary,
  startDate,
  endDate
);
      const totalDiscounts = absenceDiscount + lateDiscount + manualDiscount;

      const totalToPay =
  salaryForPeriod +
  calculatedServiceCommission +
  productCommission +
  tipTotal +
  bonusTotal -
  totalDiscounts;

      return {
        staff_id: person.id,
        full_name: person.full_name || "Técnica",
        serviceTotal,
        extrasTotal,
        commissionBase,
        serviceCommissionPercent,
        serviceCommission: calculatedServiceCommission,
        productSalesTotal,
        productCommissionPercent,
        productCommission,
        tipTotal,
        weeklySalary: salaryForPeriod,
weeklySalaryBase: weeklySalary,
periodDays: getDaysBetween(startDate, endDate),
        absencesCount: absences.length,
        lateArrivalsCount: lateArrivals.length,
        vacationDaysCount: vacationDays.length,
        absenceDiscount,
        lateDiscount,
        manualDiscount,
        bonusTotal,
        totalDiscounts,
        totalToPay,
      };
    });
  }, [staff, paymentStaffTotals, adjustments, payrollSettings]);

  const reportTotals = useMemo(() => {
    return reportRows.reduce(
      (result, row) => ({
        serviceTotal: result.serviceTotal + row.serviceTotal,
        extrasTotal: result.extrasTotal + row.extrasTotal,
        commissionBase: result.commissionBase + row.commissionBase,
        serviceCommission: result.serviceCommission + row.serviceCommission,
        productSalesTotal: result.productSalesTotal + row.productSalesTotal,
        productCommission: result.productCommission + row.productCommission,
        tipTotal: result.tipTotal + row.tipTotal,
        weeklySalary: result.weeklySalary + row.weeklySalary,
        totalDiscounts: result.totalDiscounts + row.totalDiscounts,
        bonusTotal: result.bonusTotal + row.bonusTotal,
        totalToPay: result.totalToPay + row.totalToPay,
      }),
      {
        serviceTotal: 0,
        extrasTotal: 0,
        commissionBase: 0,
        serviceCommission: 0,
        productSalesTotal: 0,
        productCommission: 0,
        tipTotal: 0,
        weeklySalary: 0,
        totalDiscounts: 0,
        bonusTotal: 0,
        totalToPay: 0,
      }
    );
  }, [reportRows]);

  if (loadingSession) {
    return (
      <main className="min-h-screen bg-[#eef1f3] px-6 py-10 text-[#263238]">
        <p>Cargando...</p>
      </main>
    );
  }

  return (
    <AdminShell
      title="Reportes"
      subtitle="Comisiones, sueldos, propinas, faltas, retardos y recibos imprimibles."
      activeModule="reportes"
      menuItems={menuItems}
      activeSection={activeSection}
      setActiveSection={setActiveSection}
    >
      <div className="print:hidden">
        {message && (
          <div className="mb-6 rounded-2xl bg-[#263238] px-5 py-4 text-sm font-medium text-white">
            {message}
          </div>
        )}

        <Card className="mb-6">
          <SectionHeader
            eyebrow="Periodo"
            title="Selecciona rango del reporte"
            description="Puedes sacar comisiones por día, semana, mes o rango personalizado."
          />

          <div className="grid gap-4 lg:grid-cols-[0.6fr_1fr_1fr_1fr]">
            <div>
              <label className="mb-2 block text-sm text-[#68777c]">
                Fecha base
              </label>
              <input
                type="date"
                value={baseDate}
                onChange={(event) => handleBaseDateChange(event.target.value)}
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              />
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={() => setQuickRange("day")}
                className={`rounded-full px-5 py-3 text-sm transition ${
                  rangeType === "day"
                    ? "bg-[#bd7b83] text-white"
                    : "border border-[#bd7b83] text-[#bd7b83]"
                }`}
              >
                Día
              </button>

              <button
                type="button"
                onClick={() => setQuickRange("week")}
                className={`rounded-full px-5 py-3 text-sm transition ${
                  rangeType === "week"
                    ? "bg-[#bd7b83] text-white"
                    : "border border-[#bd7b83] text-[#bd7b83]"
                }`}
              >
                Semana
              </button>

              <button
                type="button"
                onClick={() => setQuickRange("month")}
                className={`rounded-full px-5 py-3 text-sm transition ${
                  rangeType === "month"
                    ? "bg-[#bd7b83] text-white"
                    : "border border-[#bd7b83] text-[#bd7b83]"
                }`}
              >
                Mes
              </button>

              <button
                type="button"
                onClick={() => setRangeType("custom")}
                className={`rounded-full px-5 py-3 text-sm transition ${
                  rangeType === "custom"
                    ? "bg-[#bd7b83] text-white"
                    : "border border-[#bd7b83] text-[#bd7b83]"
                }`}
              >
                Personalizado
              </button>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#68777c]">
                Desde
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(event) => {
                  setRangeType("custom");
                  setStartDate(event.target.value);
                }}
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#68777c]">
                Hasta
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(event) => {
                  setRangeType("custom");
                  setEndDate(event.target.value);
                }}
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              />
            </div>
          </div>
        </Card>
      </div>

      {activeSection === "comisiones" && (
        <Card>
          <SectionHeader
            eyebrow="Comisiones"
            title="Resumen por técnica"
            description="Incluye servicios, extras, propinas, sueldo semanal, bonos y descuentos."
            action={
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-full bg-[#bd7b83] px-6 py-3 text-sm text-white transition hover:opacity-90"
              >
                Imprimir / Guardar PDF
              </button>
            }
          />

          <PrintableHeader startDate={startDate} endDate={endDate} />

          {loadingData ? (
            <p className="text-sm text-[#68777c]">Cargando reporte...</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full min-w-[1200px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#dde3e6] text-left text-xs uppercase tracking-[0.18em] text-[#bd7b83]">
                    <th className="py-3 pr-4">Técnica</th>
                    <th className="py-3 pr-4">Servicios</th>
                    <th className="py-3 pr-4">Extras</th>
                    <th className="py-3 pr-4">Base comisión</th>
                    <th className="py-3 pr-4">% Serv.</th>
                    <th className="py-3 pr-4">Comisión serv.</th>
                    <th className="py-3 pr-4">Ventas</th>
                    <th className="py-3 pr-4">Comisión ventas</th>
                    <th className="py-3 pr-4">Propinas</th>
                    <th className="py-3 pr-4">Sueldo</th>
                    <th className="py-3 pr-4">Bonos</th>
                    <th className="py-3 pr-4">Desc.</th>
                    <th className="py-3 pr-4">Total a pagar</th>
                  </tr>
                </thead>

                <tbody>
                  {reportRows.map((row) => (
                    <tr
                      key={row.staff_id}
                      className="border-b border-[#eef1f3] text-[#263238]"
                    >
                      <td className="py-4 pr-4 font-medium">
                        {row.full_name}
                        <div className="mt-1 text-xs text-[#68777c]">
                          Faltas: {row.absencesCount} · Retardos:{" "}
                          {row.lateArrivalsCount} · Vacaciones:{" "}
                          {row.vacationDaysCount}
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        {formatMoney(row.serviceTotal)}
                      </td>
                      <td className="py-4 pr-4">
                        {formatMoney(row.extrasTotal)}
                      </td>
                      <td className="py-4 pr-4">
                        {formatMoney(row.commissionBase)}
                      </td>
                      <td className="py-4 pr-4">
                        {row.serviceCommissionPercent}%
                      </td>
                      <td className="py-4 pr-4">
                        {formatMoney(row.serviceCommission)}
                      </td>
                      <td className="py-4 pr-4">
                        {formatMoney(row.productSalesTotal)}
                      </td>
                      <td className="py-4 pr-4">
                        {formatMoney(row.productCommission)}
                      </td>
                      <td className="py-4 pr-4">{formatMoney(row.tipTotal)}</td>
                      <td className="py-4 pr-4">
                        {formatMoney(row.weeklySalary)}
                      </td>
                      <td className="py-4 pr-4">{formatMoney(row.bonusTotal)}</td>
                      <td className="py-4 pr-4 text-red-600">
                        - {formatMoney(row.totalDiscounts)}
                      </td>
                      <td className="py-4 pr-4 text-lg font-medium">
                        {formatMoney(row.totalToPay)}
                      </td>
                    </tr>
                  ))}

                  <tr className="bg-[#fff6fb] font-medium text-[#263238]">
                    <td className="py-4 pr-4">Totales</td>
                    <td className="py-4 pr-4">
                      {formatMoney(reportTotals.serviceTotal)}
                    </td>
                    <td className="py-4 pr-4">
                      {formatMoney(reportTotals.extrasTotal)}
                    </td>
                    <td className="py-4 pr-4">
                      {formatMoney(reportTotals.commissionBase)}
                    </td>
                    <td className="py-4 pr-4">—</td>
                    <td className="py-4 pr-4">
                      {formatMoney(reportTotals.serviceCommission)}
                    </td>
                    <td className="py-4 pr-4">
                      {formatMoney(reportTotals.productSalesTotal)}
                    </td>
                    <td className="py-4 pr-4">
                      {formatMoney(reportTotals.productCommission)}
                    </td>
                    <td className="py-4 pr-4">
                      {formatMoney(reportTotals.tipTotal)}
                    </td>
                    <td className="py-4 pr-4">
                      {formatMoney(reportTotals.weeklySalary)}
                    </td>
                    <td className="py-4 pr-4">
                      {formatMoney(reportTotals.bonusTotal)}
                    </td>
                    <td className="py-4 pr-4 text-red-600">
                      - {formatMoney(reportTotals.totalDiscounts)}
                    </td>
                    <td className="py-4 pr-4 text-lg">
                      {formatMoney(reportTotals.totalToPay)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {activeSection === "ajustes" && (
        <Card>
          <SectionHeader
            eyebrow="Ajustes"
            title="Faltas, retardos, vacaciones, descuentos y bonos"
            description="Registra incidencias del periodo para que se reflejen en el pago."
          />

          <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
            <div className="rounded-2xl bg-[#f7f9fa] p-5">
              <h4 className="text-lg font-light">Nuevo ajuste</h4>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Técnica
                  </label>
                  <select
                    value={adjustmentForm.staff_id}
                    onChange={(event) =>
                      setAdjustmentForm((current) => ({
                        ...current,
                        staff_id: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                  >
                    <option value="">Seleccionar</option>
                    {staff.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={adjustmentForm.adjustment_date}
                    onChange={(event) =>
                      setAdjustmentForm((current) => ({
                        ...current,
                        adjustment_date: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Tipo
                  </label>
                  <select
                    value={adjustmentForm.adjustment_type}
                    onChange={(event) =>
                      setAdjustmentForm((current) => ({
                        ...current,
                        adjustment_type: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                  >
                    {adjustmentTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Monto
                  </label>
                  <input
                    type="number"
                    value={adjustmentForm.amount}
                    onChange={(event) =>
                      setAdjustmentForm((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                    placeholder="Ej. 100"
                  />
                </div>
              </div>

              <textarea
                value={adjustmentForm.notes}
                onChange={(event) =>
                  setAdjustmentForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                className="mt-4 min-h-24 w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                placeholder="Notas..."
              />

              <button
                type="button"
                onClick={saveAdjustment}
                className="mt-4 w-full rounded-full bg-[#bd7b83] px-6 py-3 text-sm text-white transition hover:opacity-90"
              >
                Guardar ajuste
              </button>
            </div>

            <div className="rounded-2xl bg-[#f7f9fa] p-5">
              <h4 className="text-lg font-light">Ajustes del periodo</h4>

              <div className="mt-4 space-y-3">
                {adjustments.length === 0 ? (
                  <p className="rounded-2xl bg-white p-4 text-sm text-[#68777c]">
                    No hay ajustes en este periodo.
                  </p>
                ) : (
                  adjustments.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl bg-white p-4 text-sm text-[#68777c]"
                    >
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="font-medium text-[#263238]">
                            {item.staff?.full_name || "Técnica"}
                          </p>
                          <p>
                            {item.adjustment_date} · {item.adjustment_type}
                          </p>
                          {item.notes && <p className="mt-1">{item.notes}</p>}
                        </div>

                        <div className="text-right">
                          <p className="font-medium text-[#263238]">
                            {formatMoney(item.amount)}
                          </p>
                          <button
                            type="button"
                            onClick={() => deleteAdjustment(item.id)}
                            className="mt-2 text-xs text-red-600"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {activeSection === "sueldos" && (
        <Card>
          <SectionHeader
            eyebrow="Sueldos"
            title="Sueldo semanal por técnica"
            description="Este sueldo se suma al reporte de pago. Puedes dejarlo en $0 si solo se paga comisión."
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {staff.map((person) => (
              <div
                key={person.id}
                className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5"
              >
                <p className="text-lg font-light text-[#263238]">
                  {person.full_name}
                </p>

                <p className="mt-1 text-sm text-[#68777c]">
                  Comisión servicios detectada: {getCommissionPercent(person)}%
                </p>

                <p className="text-sm text-[#68777c]">
                  Comisión ventas detectada: {getProductCommissionPercent(person)}%
                </p>

                <label className="mb-2 mt-4 block text-sm text-[#68777c]">
                  Sueldo semanal
                </label>
                <input
                  type="number"
                  value={salaryDrafts[person.id] || 0}
                  onChange={(event) =>
                    setSalaryDrafts((current) => ({
                      ...current,
                      [person.id]: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                />
<p className="mt-2 text-xs text-[#8a969a]">
  En reportes personalizados se calcula proporcional por día.
</p>

{salaryMessage && activeSalaryMessageId === person.id && (
  <div
    className={`mt-4 rounded-2xl px-4 py-3 text-sm font-medium ${
      salaryMessage.toLowerCase().includes("no se pudo")
        ? "bg-red-600 text-white"
        : "bg-green-600 text-white"
    }`}
  >
    {salaryMessage}
  </div>
)}
                <button
                  type="button"
                  onClick={() => saveSalary(person.id)}
                  className="mt-4 w-full rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
                >
                  Guardar sueldo
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {activeSection === "imprimible" && (
        <Card>
          <SectionHeader
            eyebrow="Imprimible"
            title="Reporte para firma de pagado"
            description="Este formato está pensado para imprimir, guardar PDF y firmar como recibido."
            action={
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-full bg-[#bd7b83] px-6 py-3 text-sm text-white transition hover:opacity-90"
              >
                Imprimir / Guardar PDF
              </button>
            }
          />

          <PrintablePayrollReport
            rows={reportRows}
            startDate={startDate}
            endDate={endDate}
          />
        </Card>
      )}

      <div className="hidden print:block">
        <PrintablePayrollReport
          rows={reportRows}
          startDate={startDate}
          endDate={endDate}
        />
      </div>
    </AdminShell>
  );
}

function PrintableHeader({ startDate, endDate }) {
  return (
    <div className="mb-6 hidden print:block">
      <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
        Alexandra Ruiz Salón Spa
      </p>
      <h1 className="mt-2 text-2xl font-light text-[#263238]">
        Reporte de comisiones y pago
      </h1>
      <p className="mt-1 text-sm text-[#68777c]">
        Periodo: {startDate} al {endDate}
      </p>
    </div>
  );
}

function PrintablePayrollReport({ rows, startDate, endDate }) {
  return (
    <div className="rounded-2xl bg-white print:rounded-none print:shadow-none">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
          Alexandra Ruiz Salón Spa
        </p>
        <h2 className="mt-2 text-2xl font-light text-[#263238]">
          Recibo de pago para firma
        </h2>
        <p className="mt-1 text-sm text-[#68777c]">
          Periodo: {startDate} al {endDate}
        </p>
      </div>

      <div className="space-y-6">
        {rows.map((row) => (
          <div
            key={row.staff_id}
            className="rounded-2xl border border-[#dde3e6] p-5 print:break-inside-avoid"
          >
            <div className="flex flex-col justify-between gap-4 md:flex-row">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                  Técnica
                </p>
                <h3 className="mt-2 text-xl font-light text-[#263238]">
                  {row.full_name}
                </h3>
              </div>

              <div className="text-right">
                <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                  Total a pagar
                </p>
                <p className="mt-2 text-3xl font-light text-[#263238]">
                  {formatMoney(row.totalToPay)}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 text-sm md:grid-cols-4">
              <PayrollBox label="Sueldo semanal base" value={row.weeklySalary} />
              <PayrollBox
                label="Comisión servicios"
                value={row.serviceCommission}
              />
              <PayrollBox label="Comisión ventas" value={row.productCommission} />
              <PayrollBox label="Propinas" value={row.tipTotal} />
              <PayrollBox label="Bonos" value={row.bonusTotal} />
              <PayrollBox label="Descuentos" value={row.totalDiscounts} negative />
              <PayrollBox label="Faltas" value={row.absencesCount} isCount />
              <PayrollBox label="Retardos" value={row.lateArrivalsCount} isCount />
              <PayrollBox
                label="Vacaciones usadas"
                value={row.vacationDaysCount}
                isCount
              />
            </div>

            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <div>
                <div className="border-b border-[#263238] pb-10"></div>
                <p className="mt-2 text-center text-xs uppercase tracking-[0.18em] text-[#68777c]">
                  Firma de recibido
                </p>
              </div>

              <div>
                <div className="border-b border-[#263238] pb-10"></div>
                <p className="mt-2 text-center text-xs uppercase tracking-[0.18em] text-[#68777c]">
                  Firma administración
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PayrollBox({ label, value, negative = false, isCount = false }) {
  return (
    <div className="rounded-2xl bg-[#f7f9fa] p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-[#bd7b83]">
        {label}
      </p>
      <p
        className={`mt-2 text-lg font-medium ${
          negative ? "text-red-600" : "text-[#263238]"
        }`}
      >
        {isCount ? value || 0 : `${negative ? "- " : ""}${formatMoney(value)}`}
      </p>
    </div>
  );
}