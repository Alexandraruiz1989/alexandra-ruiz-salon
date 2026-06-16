"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import AdminShell from "../../components/AdminShell";
import { supabase } from "../../../lib/supabaseClient";

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatTime(value) {
  if (!value) return "-";
  return String(value).slice(0, 5);
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(`${value}T00:00:00`);

  return date.toLocaleDateString("es-MX", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-start">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-light">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-[#68777c]">{description}</p>
        )}
      </div>

      {action}
    </div>
  );
}

export default function ClientHistoryPage() {
  const params = useParams();
  const clientId = params?.id;

  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [message, setMessage] = useState("");
  const [activeSection, setActiveSection] = useState("historial");

  const [client, setClient] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [payments, setPayments] = useState([]);

  const menuItems = [
    { key: "historial", label: "Historial" },
    { key: "pagos", label: "Pagos" },
    { key: "resumen", label: "Resumen" },
  ];

  useEffect(() => {
    const start = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        window.location.href = "/admin";
        return;
      }

      setLoadingSession(false);
      await loadClientHistory();
    };

    start();
  }, [clientId]);

  const loadClientHistory = async () => {
    if (!clientId) return;

    setLoadingData(true);
    setMessage("");

    const [clientResult, appointmentsResult, paymentsResult] =
      await Promise.all([
        supabase.from("clients").select("*").eq("id", clientId).maybeSingle(),

        supabase
          .from("appointments")
          .select(
            `
            *,
            appointment_services (
              id,
              service_id,
              staff_id,
              start_time,
              end_time,
              price,
              total_price,
              notes,
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
          .eq("client_id", clientId)
          .order("appointment_date", { ascending: false })
          .order("start_time", { ascending: false }),

        supabase
          .from("payments")
          .select(
            `
            *,
            payment_service_items (
              id,
              name,
              staff_name,
              quantity,
              unit_price,
              total_price
            ),
            payment_extra_items (
              id,
              name,
              quantity,
              unit_price,
              total_price
            )
          `
          )
          .eq("client_id", clientId)
          .order("payment_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

    if (clientResult.error) {
      setMessage(`No se pudo cargar la clienta: ${clientResult.error.message}`);
    } else {
      setClient(clientResult.data || null);
    }

    if (appointmentsResult.error) {
      setMessage(
        `No se pudo cargar el historial de citas: ${appointmentsResult.error.message}`
      );
    } else {
      setAppointments(appointmentsResult.data || []);
    }

    if (paymentsResult.error) {
      setMessage(`No se pudieron cargar los pagos: ${paymentsResult.error.message}`);
    } else {
      setPayments(paymentsResult.data || []);
    }

    setLoadingData(false);
  };

  const totals = useMemo(() => {
    const totalAppointments = appointments.length;
    const completedAppointments = appointments.filter((appointment) =>
      ["realizada", "completada", "pagada"].includes(
        String(appointment.status || "").toLowerCase()
      )
    ).length;

    const totalPaid = payments.reduce(
      (sum, payment) => sum + Number(payment.total_amount || 0),
      0
    );

    const lastAppointment = appointments[0] || null;

    return {
      totalAppointments,
      completedAppointments,
      totalPaid,
      lastAppointment,
    };
  }, [appointments, payments]);

  if (loadingSession) {
    return (
      <main className="min-h-screen bg-[#eef1f3] px-6 py-10 text-[#263238]">
        <p>Cargando...</p>
      </main>
    );
  }

  return (
    <AdminShell
      title="Historial de clienta"
      subtitle="Consulta servicios realizados, pagos, extras y visitas anteriores."
      activeModule="clientas"
      menuItems={menuItems}
      activeSection={activeSection}
      setActiveSection={setActiveSection}
    >
      {message && (
        <div className="mb-6 rounded-2xl bg-red-600 px-5 py-4 text-sm font-medium text-white">
          {message}
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <a
          href="/admin/clientas"
          className="rounded-full border border-[#bd7b83] px-5 py-3 text-center text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
        >
          ← Volver a clientas
        </a>

        <button
          type="button"
          onClick={loadClientHistory}
          className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
        >
          Actualizar historial
        </button>
      </div>

      {loadingData ? (
        <Card>
          <p className="text-sm text-[#68777c]">Cargando historial...</p>
        </Card>
      ) : !client ? (
        <Card>
          <p className="text-sm text-[#68777c]">
            No encontramos esta clienta.
          </p>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <SectionHeader
              eyebrow="Clienta"
              title={client.full_name || "Sin nombre"}
              description="Información general registrada en el sistema."
            />

            <div className="grid gap-4 md:grid-cols-4">
              <InfoBox label="WhatsApp" value={client.phone || "-"} />
              <InfoBox label="Correo" value={client.email || "-"} />
              <InfoBox label="Cumpleaños" value={client.birthday || "-"} />
              <InfoBox label="Género" value={client.gender || "-"} />
            </div>

            {client.notes && (
              <div className="mt-5 rounded-2xl bg-[#f7f9fa] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                  Notas
                </p>
                <p className="mt-2 text-sm text-[#68777c]">{client.notes}</p>
              </div>
            )}
          </Card>

          {activeSection === "resumen" && (
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                  Citas registradas
                </p>
                <p className="mt-3 text-4xl font-light">
                  {totals.totalAppointments}
                </p>
              </Card>

              <Card>
                <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                  Citas completadas
                </p>
                <p className="mt-3 text-4xl font-light">
                  {totals.completedAppointments}
                </p>
              </Card>

              <Card>
                <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                  Total pagado
                </p>
                <p className="mt-3 text-4xl font-light">
                  {formatMoney(totals.totalPaid)}
                </p>
              </Card>

              <Card>
                <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                  Última visita
                </p>
                <p className="mt-3 text-xl font-light">
                  {totals.lastAppointment
                    ? formatDate(totals.lastAppointment.appointment_date)
                    : "-"}
                </p>
              </Card>
            </div>
          )}

          {activeSection === "historial" && (
            <Card>
              <SectionHeader
                eyebrow="Historial"
                title="Citas y servicios realizados"
                description="Listado de citas anteriores y servicios registrados."
              />

              {appointments.length === 0 ? (
                <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
                  Esta clienta todavía no tiene citas registradas.
                </div>
              ) : (
                <div className="space-y-4">
                  {appointments.map((appointment) => {
                    const services = appointment.appointment_services || [];

                    return (
                      <div
                        key={appointment.id}
                        className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5"
                      >
                        <div className="flex flex-col justify-between gap-4 md:flex-row">
                          <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                              {appointment.status || "agendada"}
                            </p>
                            <h3 className="mt-2 text-xl font-light">
                              {formatDate(appointment.appointment_date)}
                            </h3>
                            <p className="mt-1 text-sm text-[#68777c]">
                              {formatTime(appointment.start_time)} -{" "}
                              {formatTime(appointment.end_time)}
                            </p>
                          </div>

                          <div className="text-left md:text-right">
                            <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                              Total estimado
                            </p>
                            <p className="mt-2 text-2xl font-light">
                              {formatMoney(appointment.estimated_total)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 space-y-3">
                          {services.length === 0 ? (
                            <p className="rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
                              No hay servicios guardados en esta cita.
                            </p>
                          ) : (
                            services.map((service) => (
                              <div
                                key={service.id}
                                className="rounded-2xl bg-[#f7f9fa] p-4"
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
                                    {service.notes && (
                                      <p className="mt-2 text-sm text-[#68777c]">
                                        {service.notes}
                                      </p>
                                    )}
                                  </div>

                                  <p className="text-sm font-medium text-[#263238]">
                                    {formatMoney(
                                      service.total_price || service.price || 0
                                    )}
                                  </p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {appointment.notes && (
                          <div className="mt-4 rounded-2xl bg-[#fff6fb] p-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                              Notas de la cita
                            </p>
                            <p className="mt-2 text-sm text-[#68777c]">
                              {appointment.notes}
                            </p>
                          </div>
                        )}

                        {appointment.design_image_url && (
                          <div className="mt-4 rounded-2xl bg-[#fff6fb] p-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                              Diseño solicitado
                            </p>
                            <a
                              href={appointment.design_image_url}
                              target="_blank"
                              className="mt-3 inline-block rounded-full border border-[#bd7b83] px-5 py-2 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                            >
                              Ver foto del diseño
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {activeSection === "pagos" && (
            <Card>
              <SectionHeader
                eyebrow="Pagos"
                title="Pagos registrados"
                description="Cobros, servicios y extras pagados por esta clienta."
              />

              {payments.length === 0 ? (
                <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
                  Esta clienta todavía no tiene pagos registrados.
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
                          <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                            {payment.payment_status || "pagado"}
                          </p>
                          <h3 className="mt-2 text-xl font-light">
                            {formatDate(payment.payment_date)}
                          </h3>
                          <p className="mt-1 text-sm text-[#68777c]">
                            Método: {payment.payment_method || "-"}
                          </p>
                        </div>

                        <div className="text-left md:text-right">
                          <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                            Total pagado
                          </p>
                          <p className="mt-2 text-2xl font-light">
                            {formatMoney(payment.total_amount)}
                          </p>

                          <a
                            href={`/recibo/${payment.id}`}
                            target="_blank"
                            className="mt-3 inline-block rounded-full border border-[#bd7b83] px-5 py-2 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                          >
                            Ver recibo
                          </a>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl bg-[#f7f9fa] p-4">
                          <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                            Servicios pagados
                          </p>

                          <div className="mt-3 space-y-2">
                            {(payment.payment_service_items || []).length ===
                            0 ? (
                              <p className="text-sm text-[#68777c]">
                                Sin servicios registrados.
                              </p>
                            ) : (
                              payment.payment_service_items.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex justify-between gap-3 text-sm text-[#68777c]"
                                >
                                  <span>
                                    {item.name}
                                    {item.staff_name
                                      ? ` · ${item.staff_name}`
                                      : ""}
                                  </span>
                                  <span>{formatMoney(item.total_price)}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="rounded-2xl bg-[#f7f9fa] p-4">
                          <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                            Extras pagados
                          </p>

                          <div className="mt-3 space-y-2">
                            {(payment.payment_extra_items || []).length ===
                            0 ? (
                              <p className="text-sm text-[#68777c]">
                                Sin extras registrados.
                              </p>
                            ) : (
                              payment.payment_extra_items.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex justify-between gap-3 text-sm text-[#68777c]"
                                >
                                  <span>
                                    {item.name} x {item.quantity}
                                  </span>
                                  <span>{formatMoney(item.total_price)}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 rounded-2xl bg-[#fff6fb] p-4">
                        <div className="grid gap-3 text-sm md:grid-cols-5">
                          <InfoMini
                            label="Servicios"
                            value={formatMoney(payment.subtotal_services)}
                          />
                          <InfoMini
                            label="Extras"
                            value={formatMoney(payment.subtotal_extras)}
                          />
                          <InfoMini
                            label="Descuento"
                            value={`- ${formatMoney(payment.discount_amount)}`}
                          />
                          <InfoMini
                            label="Anticipo"
                            value={`- ${formatMoney(payment.deposit_amount)}`}
                          />
                          <InfoMini
                            label="Propina"
                            value={formatMoney(payment.tip_amount)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </AdminShell>
  );
}

function InfoBox({ label, value }) {
  return (
    <div className="rounded-2xl bg-[#f7f9fa] p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
        {label}
      </p>
      <p className="mt-2 text-sm text-[#263238]">{value}</p>
    </div>
  );
}

function InfoMini({ label, value }) {
  return (
    <div>
      <p className="text-[#8a969a]">{label}</p>
      <p className="font-medium text-[#263238]">{value}</p>
    </div>
  );
}