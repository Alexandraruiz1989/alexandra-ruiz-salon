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
                        onClick={() =>
                          alert(
                            "En el siguiente paso activaremos el formulario completo para cobrar esta cita."
                          )
                        }
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
    </AdminShell>
  );
}