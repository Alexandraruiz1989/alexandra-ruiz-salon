"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import AdminShell from "../components/AdminShell";

const menuItems = [
  { key: "pendientes", label: "Citas por cobrar" },
  { key: "pagos", label: "Pagos recientes" },
  { key: "extras", label: "Extras / Decoraciones" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatTime(time) {
  if (!time) return "";
  return String(time).slice(0, 5);
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
    <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
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

function getAppointmentServicesText(appointment) {
  const services = appointment.appointment_services || [];

  if (services.length === 0) return "Sin servicios";

  return services
    .map((item) => item.services?.name || "Servicio")
    .join(", ");
}

function getAppointmentStaffText(appointment) {
  const services = appointment.appointment_services || [];
  const staffNames = services
    .map((item) => item.staff?.full_name)
    .filter(Boolean);

  const uniqueNames = [...new Set(staffNames)];

  if (uniqueNames.length === 0) return "Sin técnica";

  return uniqueNames.join(", ");
}

function getAppointmentTotal(appointment) {
  const services = appointment.appointment_services || [];

  if (appointment.estimated_total) {
    return Number(appointment.estimated_total || 0);
  }

  return services.reduce((sum, item) => {
    return sum + Number(item.total_price || item.price || 0);
  }, 0);
}

export default function CobrosPage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [activeSection, setActiveSection] = useState("pendientes");
  const [message, setMessage] = useState("");

  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [appointments, setAppointments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [extras, setExtras] = useState([]);
  const [paymentSettings, setPaymentSettings] = useState(null);
const [selectedAppointment, setSelectedAppointment] = useState(null);
const [showPaymentModal, setShowPaymentModal] = useState(false);
const [savingPayment, setSavingPayment] = useState(false);

const [paymentForm, setPaymentForm] = useState({
  discount_amount: 0,
  tip_amount: 0,
  payment_method: "Efectivo",
  notes: "",
});

const [extraLines, setExtraLines] = useState([]);
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
  }, [selectedDate]);

  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(() => {
      setMessage("");
    }, 15000);

    return () => clearTimeout(timer);
  }, [message]);

  const loadData = async () => {
    setLoadingData(true);
    setMessage("");

    const [appointmentsResult, paymentsResult, extrasResult, settingsResult] =
      await Promise.all([
        supabase
          .from("appointments")
          .select(
            `
            *,
            clients (
              id,
              full_name,
              phone
            ),
            appointment_services (
              id,
              service_id,
              staff_id,
              start_time,
              end_time,
              price,
              total_price,
              services (
                id,
                name,
                category
              ),
              staff (
                id,
                full_name
              )
            )
          `
          )
          .eq("appointment_date", selectedDate)
          .order("start_time", { ascending: true }),

        supabase
          .from("payments")
          .select(
            `
            *,
            clients (
              full_name,
              phone
            ),
            appointments (
              appointment_date,
              start_time
            )
          `
          )
          .order("created_at", { ascending: false })
          .limit(30),

        supabase
          .from("service_extras")
          .select("*")
          .eq("active", true)
          .order("category", { ascending: true })
          .order("name", { ascending: true }),

        supabase.from("payment_settings").select("*").limit(1).maybeSingle(),
      ]);

    if (appointmentsResult.error) {
      setMessage(`No se pudieron cargar citas: ${appointmentsResult.error.message}`);
    } else {
      setAppointments(appointmentsResult.data || []);
    }

    if (paymentsResult.error) {
      setMessage(`No se pudieron cargar pagos: ${paymentsResult.error.message}`);
    } else {
      setPayments(paymentsResult.data || []);
    }

    if (extrasResult.error) {
      setMessage(`No se pudieron cargar extras: ${extrasResult.error.message}`);
    } else {
      setExtras(extrasResult.data || []);
    }

    if (settingsResult.error) {
      setMessage(
        `No se pudo cargar configuración de cobros: ${settingsResult.error.message}`
      );
    } else {
      setPaymentSettings(settingsResult.data || null);
    }

    setLoadingData(false);
  };

  const paidAppointmentIds = useMemo(() => {
    return payments
      .map((payment) => payment.appointment_id)
      .filter(Boolean);
  }, [payments]);

  const pendingAppointments = useMemo(() => {
    return appointments.filter(
      (appointment) => !paidAppointmentIds.includes(appointment.id)
    );
  }, [appointments, paidAppointmentIds]);

  const totalPending = useMemo(() => {
    return pendingAppointments.reduce(
      (sum, appointment) => sum + getAppointmentTotal(appointment),
      0
    );
  }, [pendingAppointments]);

  const totalPaidToday = useMemo(() => {
    return payments
      .filter((payment) => payment.payment_date === selectedDate)
      .reduce((sum, payment) => sum + Number(payment.total_amount || 0), 0);
  }, [payments, selectedDate]);
const openPaymentModal = (appointment) => {
  setSelectedAppointment(appointment);
  setPaymentForm({
    discount_amount: 0,
    tip_amount: 0,
    payment_method: "Efectivo",
    notes: "",
  });
  setExtraLines([]);
  setShowPaymentModal(true);
};

const closePaymentModal = () => {
  setSelectedAppointment(null);
  setShowPaymentModal(false);
  setSavingPayment(false);
  setPaymentForm({
    discount_amount: 0,
    tip_amount: 0,
    payment_method: "Efectivo",
    notes: "",
  });
  setExtraLines([]);
};

const handlePaymentFormChange = (field, value) => {
  setPaymentForm((current) => ({
    ...current,
    [field]: value,
  }));
};

const addExtraLine = () => {
  setExtraLines((current) => [
    ...current,
    {
      extra_id: "",
      name: "",
      quantity: 1,
      unit_price: 0,
      total_price: 0,
      staff_id: "",
    },
  ]);
};

const removeExtraLine = (index) => {
  setExtraLines((current) => current.filter((_, itemIndex) => itemIndex !== index));
};

const handleExtraLineChange = (index, field, value) => {
  setExtraLines((current) =>
    current.map((line, itemIndex) => {
      if (itemIndex !== index) return line;

      const updatedLine = {
        ...line,
        [field]: value,
      };

      if (field === "extra_id") {
        const selectedExtra = extras.find((extra) => extra.id === value);

        if (selectedExtra) {
          updatedLine.name = selectedExtra.name;
          updatedLine.unit_price = Number(selectedExtra.price || 0);
          updatedLine.quantity = selectedExtra.pricing_type === "fixed" ? 1 : updatedLine.quantity || 1;
        }
      }

      const quantity = Number(updatedLine.quantity || 0);
      const unitPrice = Number(updatedLine.unit_price || 0);
      updatedLine.total_price = quantity * unitPrice;

      return updatedLine;
    })
  );
};

const getPaymentTotals = () => {
  const subtotalServices = selectedAppointment
    ? getAppointmentTotal(selectedAppointment)
    : 0;

  const subtotalExtras = extraLines.reduce(
    (sum, line) => sum + Number(line.total_price || 0),
    0
  );

  const depositAmount = Number(selectedAppointment?.deposit_amount || 0);
  const discountAmount = Number(paymentForm.discount_amount || 0);
  const tipAmount = Number(paymentForm.tip_amount || 0);

  const totalAmount =
    subtotalServices + subtotalExtras - discountAmount - depositAmount + tipAmount;

  return {
    subtotalServices,
    subtotalExtras,
    depositAmount,
    discountAmount,
    tipAmount,
    totalAmount: Math.max(totalAmount, 0),
  };
};
const getUniqueAppointmentStaff = (appointment) => {
  const services = appointment?.appointment_services || [];

  return [
    ...new Map(
      services
        .filter((item) => item.staff_id)
        .map((item) => [
          item.staff_id,
          {
            id: item.staff_id,
            full_name: item.staff?.full_name || "Técnica",
          },
        ])
    ).values(),
  ];
};

const calculateTipDistribution = (appointment, tipAmount) => {
  const amount = Number(tipAmount || 0);

  if (amount <= 0) return [];

  const rule = paymentSettings?.tip_rule || "appointment_staff";

  let selectedStaff = [];

  if (rule === "appointment_staff") {
    selectedStaff = getUniqueAppointmentStaff(appointment);
  }

  if (rule === "all_active_staff") {
    const allStaffFromAppointments = appointments.flatMap((item) =>
      getUniqueAppointmentStaff(item)
    );

    selectedStaff = [
      ...new Map(
        allStaffFromAppointments.map((person) => [person.id, person])
      ).values(),
    ];
  }

  if (rule === "selected_staff") {
    const selectedIds = paymentSettings?.selected_staff_ids || [];
    const allStaffFromAppointments = appointments.flatMap((item) =>
      getUniqueAppointmentStaff(item)
    );

    selectedStaff = [
      ...new Map(
        allStaffFromAppointments
          .filter((person) => selectedIds.includes(person.id))
          .map((person) => [person.id, person])
      ).values(),
    ];
  }

  if (selectedStaff.length === 0) {
    selectedStaff = getUniqueAppointmentStaff(appointment);
  }

  if (selectedStaff.length === 0) return [];

  const amountPerStaff = amount / selectedStaff.length;

  return selectedStaff.map((person) => ({
    staff_id: person.id,
    tip_amount: Number(amountPerStaff.toFixed(2)),
  }));
};

const calculateStaffTotals = (paymentId, appointment, tipDistribution) => {
  const services = appointment?.appointment_services || [];
  const result = {};

  services.forEach((item) => {
    if (!item.staff_id) return;

    if (!result[item.staff_id]) {
      result[item.staff_id] = {
        payment_id: paymentId,
        staff_id: item.staff_id,
        service_total: 0,
        extras_total: 0,
        commission_base: 0,
        commission_amount: 0,
        tip_amount: 0,
      };
    }

    const serviceAmount = Number(item.total_price || item.price || 0);

    result[item.staff_id].service_total += serviceAmount;
    result[item.staff_id].commission_base += serviceAmount;
  });

  extraLines.forEach((line) => {
    if (!line.staff_id) return;

    if (!result[line.staff_id]) {
      result[line.staff_id] = {
        payment_id: paymentId,
        staff_id: line.staff_id,
        service_total: 0,
        extras_total: 0,
        commission_base: 0,
        commission_amount: 0,
        tip_amount: 0,
      };
    }

    const extraAmount = Number(line.total_price || 0);

    result[line.staff_id].extras_total += extraAmount;
    result[line.staff_id].commission_base += extraAmount;
  });

  tipDistribution.forEach((item) => {
    if (!item.staff_id) return;

    if (!result[item.staff_id]) {
      result[item.staff_id] = {
        payment_id: paymentId,
        staff_id: item.staff_id,
        service_total: 0,
        extras_total: 0,
        commission_base: 0,
        commission_amount: 0,
        tip_amount: 0,
      };
    }

    result[item.staff_id].tip_amount += Number(item.tip_amount || 0);
  });

  return Object.values(result).map((item) => ({
    ...item,
    service_total: Number(item.service_total.toFixed(2)),
    extras_total: Number(item.extras_total.toFixed(2)),
    commission_base: Number(item.commission_base.toFixed(2)),
    commission_amount: Number(item.commission_amount.toFixed(2)),
    tip_amount: Number(item.tip_amount.toFixed(2)),
  }));
};

const savePayment = async () => {
  if (!selectedAppointment) return;

  setSavingPayment(true);
  setMessage("");

  const totals = getPaymentTotals();

  const paymentPayload = {
    appointment_id: selectedAppointment.id,
    client_id: selectedAppointment.client_id,
    payment_date: selectedDate,
    subtotal_services: totals.subtotalServices,
    subtotal_extras: totals.subtotalExtras,
    discount_amount: totals.discountAmount,
    deposit_amount: totals.depositAmount,
    tip_amount: totals.tipAmount,
    total_amount: totals.totalAmount,
    payment_method: paymentForm.payment_method,
    payment_status: "pagado",
    notes: paymentForm.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert([paymentPayload])
    .select()
    .single();

  if (paymentError) {
    setMessage(`No se pudo guardar el pago: ${paymentError.message}`);
    setSavingPayment(false);
    return;
  }

  const validExtras = extraLines.filter(
    (line) => line.extra_id && Number(line.total_price || 0) > 0
  );

  if (validExtras.length > 0) {
    const extraRows = validExtras.map((line) => ({
      payment_id: payment.id,
      extra_id: line.extra_id,
      name: line.name,
      quantity: Number(line.quantity || 0),
      unit_price: Number(line.unit_price || 0),
      total_price: Number(line.total_price || 0),
      staff_id: line.staff_id || null,
    }));

    const { error: extrasError } = await supabase
      .from("payment_extra_items")
      .insert(extraRows);

    if (extrasError) {
      setMessage(
        `El pago se guardó, pero no se pudieron guardar los extras: ${extrasError.message}`
      );
      setSavingPayment(false);
      return;
    }
  }

  const tipDistribution = calculateTipDistribution(
    selectedAppointment,
    totals.tipAmount
  );

  const staffTotals = calculateStaffTotals(
    payment.id,
    selectedAppointment,
    tipDistribution
  );

  if (staffTotals.length > 0) {
    const { error: staffTotalsError } = await supabase
      .from("payment_staff_totals")
      .insert(staffTotals);

    if (staffTotalsError) {
      setMessage(
        `El pago se guardó, pero no se pudieron guardar los totales por técnica: ${staffTotalsError.message}`
      );
      setSavingPayment(false);
      return;
    }
  }

  const { error: cashError } = await supabase.from("cash_movements").insert([
    {
      movement_date: selectedDate,
      movement_type: "ingreso",
      amount: totals.totalAmount,
      payment_method: paymentForm.payment_method,
      concept: `Cobro de cita - ${
        selectedAppointment.clients?.full_name || "Clienta"
      }`,
      notes: paymentForm.notes?.trim() || null,
      payment_id: payment.id,
    },
  ]);

  if (cashError) {
    setMessage(
      `El pago se guardó, pero no se pudo registrar en caja: ${cashError.message}`
    );
    setSavingPayment(false);
    return;
  }

  setMessage("Pago guardado correctamente ✨");
  closePaymentModal();
  await loadData();
};
  if (loadingSession) {
    return (
      <main className="min-h-screen bg-[#eef1f3] px-6 py-10 text-[#263238]">
        <p>Cargando...</p>
      </main>
    );
  }

  return (
    <AdminShell
      title="Cobros"
      subtitle="Registra pagos, extras, propinas y movimientos de caja."
      activeModule="cobros"
      menuItems={menuItems}
      activeSection={activeSection}
      setActiveSection={setActiveSection}
    >
      {message && (
        <div className="mb-6 rounded-2xl bg-red-600 px-5 py-4 text-sm font-medium text-white">
          {message}
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Fecha
          </p>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="mt-3 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
          />
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Por cobrar
          </p>
          <p className="mt-3 text-4xl font-light">
            {pendingAppointments.length}
          </p>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Estimado pendiente
          </p>
          <p className="mt-3 text-4xl font-light">{formatMoney(totalPending)}</p>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Cobrado hoy
          </p>
          <p className="mt-3 text-4xl font-light">
            {formatMoney(totalPaidToday)}
          </p>
        </Card>
      </div>

      {activeSection === "pendientes" && (
        <Card>
          <SectionHeader
            eyebrow="Citas por cobrar"
            title="Pendientes de cobro"
            description="Aquí aparecerán las citas del día que todavía no tienen pago registrado."
            action={
              <button
                type="button"
                onClick={loadData}
                className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
              >
                Actualizar
              </button>
            }
          />

          {loadingData ? (
            <p className="text-sm text-[#68777c]">Cargando citas...</p>
          ) : pendingAppointments.length === 0 ? (
            <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
              No hay citas pendientes de cobro para esta fecha.
            </div>
          ) : (
            <div className="space-y-4">
              {pendingAppointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5"
                >
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                        {formatTime(appointment.start_time)}
                      </p>

                      <h3 className="mt-2 text-xl font-light">
                        {appointment.clients?.full_name || "Clienta"}
                      </h3>

                      <p className="mt-2 text-sm text-[#68777c]">
                        Servicios: {getAppointmentServicesText(appointment)}
                      </p>

                      <p className="text-sm text-[#68777c]">
                        Técnica(s): {getAppointmentStaffText(appointment)}
                      </p>

                      {appointment.deposit_amount > 0 && (
                        <p className="mt-2 text-sm text-[#68777c]">
                          Anticipo registrado:{" "}
                          {formatMoney(appointment.deposit_amount)}
                        </p>
                      )}
                    </div>

                    <div className="min-w-52">
                      <p className="text-right text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                        Total estimado
                      </p>
                      <p className="mt-2 text-right text-3xl font-light">
                        {formatMoney(getAppointmentTotal(appointment))}
                      </p>

                     <button
  type="button"
  className="mt-4 w-full rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
  onClick={() => openPaymentModal(appointment)}
>
  Cobrar cita
</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeSection === "pagos" && (
        <Card>
          <SectionHeader
            eyebrow="Pagos"
            title="Pagos recientes"
            description="Historial inicial de pagos registrados."
          />

          {loadingData ? (
            <p className="text-sm text-[#68777c]">Cargando pagos...</p>
          ) : payments.length === 0 ? (
            <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
              Aún no hay pagos registrados.
            </div>
          ) : (
            <div className="space-y-4">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5"
                >
                  <div className="flex flex-col justify-between gap-4 md:flex-row">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                        {payment.payment_date}
                      </p>

                      <h3 className="mt-2 text-xl font-light">
                        {payment.clients?.full_name || "Clienta / Venta"}
                      </h3>

                      <p className="mt-2 text-sm text-[#68777c]">
                        Método: {payment.payment_method || "Efectivo"}
                      </p>

                      {payment.tip_amount > 0 && (
                        <p className="text-sm text-[#68777c]">
                          Propina: {formatMoney(payment.tip_amount)}
                        </p>
                      )}

                      {payment.notes && (
                        <p className="mt-3 rounded-xl bg-[#f7f9fa] p-3 text-sm text-[#68777c]">
                          {payment.notes}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                        Total
                      </p>
                      <p className="mt-2 text-3xl font-light">
                        {formatMoney(payment.total_amount)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeSection === "extras" && (
        <Card>
          <SectionHeader
            eyebrow="Extras"
            title="Decoraciones y cargos adicionales"
            description="Estos extras se podrán agregar al momento de cobrar una cita."
          />

          {extras.length === 0 ? (
            <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
              Aún no hay extras registrados.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {extras.map((extra) => (
                <div
                  key={extra.id}
                  className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5"
                >
                  <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                    {extra.category}
                  </p>

                  <h3 className="mt-2 text-lg font-light">{extra.name}</h3>

                  <p className="mt-2 text-sm text-[#68777c]">
                    Tipo:{" "}
                    {extra.pricing_type === "per_nail"
                      ? "Por uña"
                      : extra.pricing_type === "per_piece"
                      ? "Por pieza"
                      : "Fijo"}
                  </p>

                  <p className="mt-3 text-2xl font-light">
                    {formatMoney(extra.price)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
     {showPaymentModal && selectedAppointment && (
  <PaymentModal
    appointment={selectedAppointment}
    extras={extras}
    paymentSettings={paymentSettings}
    paymentForm={paymentForm}
    extraLines={extraLines}
    savingPayment={savingPayment}
    handlePaymentFormChange={handlePaymentFormChange}
    addExtraLine={addExtraLine}
    removeExtraLine={removeExtraLine}
    handleExtraLineChange={handleExtraLineChange}
    getPaymentTotals={getPaymentTotals}
    savePayment={savePayment}
    onClose={closePaymentModal}
  />
)} 
    </AdminShell>
  );
}
function PaymentModal({
  appointment,
  extras,
  paymentSettings,
  paymentForm,
  extraLines,
  savingPayment,
  handlePaymentFormChange,
  addExtraLine,
  removeExtraLine,
  handleExtraLineChange,
  getPaymentTotals,
  savePayment,
  onClose,
}) {
  const totals = getPaymentTotals();

  const services = appointment.appointment_services || [];

  const staffFromAppointment = [
    ...new Map(
      services
        .filter((item) => item.staff?.id)
        .map((item) => [item.staff.id, item.staff])
    ).values(),
  ];

  const tipRuleLabel = {
    appointment_staff: "Técnica(s) que atendieron la cita",
    all_active_staff: "Todos los colaboradores activos",
    selected_staff: "Colaboradores seleccionados",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-[1.5rem] bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
              Cobrar cita
            </p>
            <h3 className="mt-2 text-2xl font-light">
              {appointment.clients?.full_name || "Clienta"}
            </h3>
            <p className="mt-1 text-sm text-[#68777c]">
              {appointment.appointment_date} · {formatTime(appointment.start_time)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f9fa] text-[#68777c] transition hover:bg-[#edf0f2]"
            title="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_0.45fr]">
          <div className="space-y-6">
            <div className="rounded-2xl bg-[#f7f9fa] p-5">
              <h4 className="text-lg font-light">Servicios de la cita</h4>

              <div className="mt-4 space-y-3">
                {services.length === 0 ? (
                  <p className="text-sm text-[#68777c]">
                    Esta cita no tiene servicios registrados.
                  </p>
                ) : (
                  services.map((service) => (
                    <div
                      key={service.id}
                      className="rounded-2xl border border-[#dde3e6] bg-white p-4"
                    >
                      <div className="flex flex-col justify-between gap-3 sm:flex-row">
                        <div>
                          <p className="font-medium text-[#263238]">
                            {service.services?.name || "Servicio"}
                          </p>
                          <p className="text-sm text-[#68777c]">
                            {service.staff?.full_name || "Técnica"} ·{" "}
                            {formatTime(service.start_time)} -{" "}
                            {formatTime(service.end_time)}
                          </p>
                        </div>

                        <p className="text-sm font-medium text-[#263238]">
                          {formatMoney(service.total_price || service.price || 0)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-[#f7f9fa] p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h4 className="text-lg font-light">Extras / Decoraciones</h4>
                  <p className="mt-1 text-sm text-[#68777c]">
                    Agrega diseños, retiros, cristales u otros cargos adicionales.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={addExtraLine}
                  className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
                >
                  Agregar extra
                </button>
              </div>

              <div className="mt-4 space-y-4">
                {extraLines.length === 0 ? (
                  <div className="rounded-2xl bg-white p-4 text-sm text-[#68777c]">
                    No hay extras agregados.
                  </div>
                ) : (
                  extraLines.map((line, index) => (
                    <div
                      key={index}
                      className="rounded-2xl border border-[#dde3e6] bg-white p-4"
                    >
                      <div className="grid gap-4 lg:grid-cols-[1fr_0.4fr_0.4fr_0.4fr_auto]">
                        <div>
                          <label className="mb-2 block text-sm text-[#68777c]">
                            Extra
                          </label>
                          <select
                            value={line.extra_id}
                            onChange={(event) =>
                              handleExtraLineChange(
                                index,
                                "extra_id",
                                event.target.value
                              )
                            }
                            className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                          >
                            <option value="">Seleccionar extra</option>
                            {extras.map((extra) => (
                              <option key={extra.id} value={extra.id}>
                                {extra.name} · {formatMoney(extra.price)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-[#68777c]">
                            Cantidad
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={line.quantity}
                            onChange={(event) =>
                              handleExtraLineChange(
                                index,
                                "quantity",
                                event.target.value
                              )
                            }
                            className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-[#68777c]">
                            Precio
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={line.unit_price}
                            onChange={(event) =>
                              handleExtraLineChange(
                                index,
                                "unit_price",
                                event.target.value
                              )
                            }
                            className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-[#68777c]">
                            Total
                          </label>
                          <div className="rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 text-sm text-[#263238]">
                            {formatMoney(line.total_price)}
                          </div>
                        </div>

                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => removeExtraLine(index)}
                            className="rounded-full border border-[#bd7b83] px-4 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                          >
                            Quitar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-[#f7f9fa] p-5">
              <h4 className="text-lg font-light">Pago</h4>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Descuento
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={paymentForm.discount_amount}
                    onChange={(event) =>
                      handlePaymentFormChange(
                        "discount_amount",
                        event.target.value
                      )
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Propina
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={paymentForm.tip_amount}
                    onChange={(event) =>
                      handlePaymentFormChange("tip_amount", event.target.value)
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                  />
                  <p className="mt-2 text-xs text-[#8a969a]">
                    Regla actual:{" "}
                    {tipRuleLabel[paymentSettings?.tip_rule] ||
                      "Técnica(s) que atendieron la cita"}
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Método de pago
                  </label>
                  <select
                    value={paymentForm.payment_method}
                    onChange={(event) =>
                      handlePaymentFormChange("payment_method", event.target.value)
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Tarjeta">Tarjeta</option>
                    <option value="Mixto">Mixto</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Técnicas de la cita
                  </label>
                  <div className="rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 text-sm text-[#263238]">
                    {staffFromAppointment.length === 0
                      ? "Sin técnicas"
                      : staffFromAppointment
                          .map((person) => person.full_name)
                          .join(", ")}
                  </div>
                </div>
              </div>

              <textarea
                value={paymentForm.notes}
                onChange={(event) =>
                  handlePaymentFormChange("notes", event.target.value)
                }
                className="mt-4 min-h-24 w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                placeholder="Notas del pago..."
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl bg-[#f7f9fa] p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                Resumen
              </p>

              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-[#68777c]">Servicios</span>
                  <span>{formatMoney(totals.subtotalServices)}</span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-[#68777c]">Extras</span>
                  <span>{formatMoney(totals.subtotalExtras)}</span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-[#68777c]">Descuento</span>
                  <span>- {formatMoney(totals.discountAmount)}</span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-[#68777c]">Anticipo</span>
                  <span>- {formatMoney(totals.depositAmount)}</span>
                </div>

                <div className="flex justify-between gap-3">
                  <span className="text-[#68777c]">Propina</span>
                  <span>{formatMoney(totals.tipAmount)}</span>
                </div>

                <div className="border-t border-[#dde3e6] pt-4">
                  <div className="flex justify-between gap-3">
                    <span className="text-lg font-medium text-[#263238]">
                      Total a cobrar
                    </span>
                    <span className="text-2xl font-light text-[#263238]">
                      {formatMoney(totals.totalAmount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={savingPayment}
              className="w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
             onClick={savePayment}
            >
              {savingPayment ? "Guardando..." : "Guardar pago"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-full border border-[#bd7b83] px-6 py-4 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}