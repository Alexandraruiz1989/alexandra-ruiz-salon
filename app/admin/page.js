"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import AdminShell from "./components/AdminShell";

const emptyDashboard = {
  appointmentsToday: [],
  appointmentsWeek: [],
  paymentsToday: [],
  paymentsWeek: [],
  newClientsWeek: 0,
  popularServices: [],
  pendingFollowups: 0,
  overdueFollowups: 0,
  lowStockProducts: [],
  loading: true,
  message: "",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToISO(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getWeekRange(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);

  return {
    start: monday.toISOString().slice(0, 10),
    end: addDaysToISO(monday.toISOString().slice(0, 10), 6),
  };
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatTime(time) {
  if (!time) return "";
  return String(time).slice(0, 5);
}

function getAppointmentServices(appointment) {
  const services = appointment?.appointment_services || [];
  const names = services
    .map((item) => item.services?.name)
    .filter(Boolean);

  return names.length ? [...new Set(names)].join(" · ") : "Servicios por confirmar";
}

function sumPayments(payments) {
  return (payments || []).reduce(
    (sum, payment) => sum + Number(payment.total_amount || 0),
    0
  );
}

export default function AdminLoginPage() {
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("alexandraruizsalon@gmail.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session || null);
      setLoading(false);
    };

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();

    setMessage("");

    if (!email.trim()) {
      setMessage("Escribe tu correo.");
      return;
    }

    if (!password.trim()) {
      setMessage("Escribe tu contraseña.");
      return;
    }

    setLoginLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setMessage(`No se pudo iniciar sesión: ${error.message}`);
      setLoginLoading(false);
      return;
    }

    setSession(data.session || null);
    setLoginLoading(false);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef1f3] px-6 text-[#263238]">
        <div className="w-full max-w-md rounded-[1.5rem] bg-white p-8 shadow-sm">
          <p className="text-sm text-[#68777c]">Cargando sistema...</p>
        </div>
      </main>
    );
  }

  if (session) {
    return <AdminDashboard />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef1f3] px-6 text-[#263238]">
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
          Alexandra Ruiz
        </p>

        <h1 className="mt-2 text-3xl font-light">Sistema interno</h1>

        <p className="mt-3 text-sm leading-6 text-[#68777c]">
          Ingresa con tu correo y contraseña para acceder al panel del salón.
        </p>

        {message && (
          <div className="mt-5 rounded-2xl bg-red-600 px-4 py-3 text-sm font-medium text-white">
            {message}
          </div>
        )}

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm text-[#68777c]">
              Correo
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              placeholder="correo@ejemplo.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-[#68777c]">
              Contraseña
            </label>

            <div className="flex rounded-2xl border border-[#dde3e6] bg-[#f7f9fa]">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-w-0 flex-1 rounded-l-2xl bg-transparent px-4 py-3 outline-none"
                placeholder="Tu contraseña"
              />

              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="px-4 text-sm text-[#bd7b83]"
              >
                {showPassword ? "Ocultar" : "Ver"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loginLoading}
            className="w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {loginLoading ? "Entrando..." : "Entrar al sistema"}
          </button>
        </form>
      </div>
    </main>
  );
}

function AdminDashboard() {
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const today = todayISO();
  const weekRange = getWeekRange(today);

  useEffect(() => {
    const loadDashboard = async () => {
      setDashboard((current) => ({ ...current, loading: true, message: "" }));

      const [
        appointmentsResult,
        paymentsResult,
        clientsResult,
        servicesResult,
        followupsResult,
        stockResult,
      ] = await Promise.all([
        supabase
          .from("appointments")
          .select(
            `
            id,
            appointment_date,
            start_time,
            status,
            clients (
              full_name
            ),
            appointment_services (
              id,
              start_time,
              end_time,
              services (
                name
              ),
              staff (
                full_name
              )
            )
          `
          )
          .gte("appointment_date", weekRange.start)
          .lte("appointment_date", weekRange.end)
          .order("appointment_date", { ascending: true })
          .order("start_time", { ascending: true }),
        supabase
          .from("payments")
          .select("id, appointment_id, total_amount, payment_date, created_at")
          .gte("payment_date", weekRange.start)
          .lte("payment_date", weekRange.end),
        supabase
          .from("clients")
          .select("id", { count: "exact", head: true })
          .gte("created_at", weekRange.start),
        supabase
          .from("appointment_services")
          .select("id, service_date, services(name)")
          .gte("service_date", weekRange.start)
          .lte("service_date", weekRange.end),
        supabase
          .from("appointment_followups")
          .select("id, followup_date, followup_status")
          .eq("followup_status", "pendiente"),
        supabase
          .from("store_products")
          .select("id, name, current_stock, min_stock, active")
          .eq("active", true),
      ]);

      const appointmentsWeek = appointmentsResult.error
        ? []
        : appointmentsResult.data || [];
      const paymentsWeek = paymentsResult.error ? [] : paymentsResult.data || [];
      const serviceCounts = {};

      if (!servicesResult.error) {
        (servicesResult.data || []).forEach((item) => {
          const name = item.services?.name || "Servicio";
          serviceCounts[name] = (serviceCounts[name] || 0) + 1;
        });
      }

      const pendingFollowups = followupsResult.error
        ? []
        : followupsResult.data || [];

      setDashboard({
        appointmentsToday: appointmentsWeek.filter(
          (appointment) => appointment.appointment_date === today
        ),
        appointmentsWeek,
        paymentsToday: paymentsWeek.filter(
          (payment) => payment.payment_date === today
        ),
        paymentsWeek,
        newClientsWeek: clientsResult.error ? 0 : clientsResult.count || 0,
        popularServices: Object.entries(serviceCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
        pendingFollowups: pendingFollowups.length,
        overdueFollowups: pendingFollowups.filter(
          (followup) => followup.followup_date && followup.followup_date < today
        ).length,
        lowStockProducts: stockResult.error
          ? []
          : (stockResult.data || [])
              .filter(
                (product) =>
                  Number(product.current_stock || 0) <=
                  Number(product.min_stock || 0)
              )
              .slice(0, 6),
        loading: false,
        message: appointmentsResult.error
          ? `No se pudo cargar todo el resumen: ${appointmentsResult.error.message}`
          : "",
      });
    };

    loadDashboard();
  }, [today, weekRange.start, weekRange.end]);

  const paymentsByAppointment = useMemo(() => {
    const ids = new Set();
    dashboard.paymentsWeek.forEach((payment) => {
      if (payment.appointment_id) ids.add(payment.appointment_id);
    });
    return ids;
  }, [dashboard.paymentsWeek]);

  const pendingPayments = dashboard.appointmentsWeek.filter(
    (appointment) => !paymentsByAppointment.has(appointment.id)
  );

  const weeklyFill = Math.min(
    100,
    Math.round((dashboard.appointmentsWeek.length / 70) * 100)
  );

  return (
    <AdminShell
      title="Inicio"
      subtitle="Resumen operativo del salón para revisar la semana de un vistazo."
      activeModule="inicio"
    >
      {dashboard.message && (
        <div className="mb-5 rounded-2xl bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          {dashboard.message}
        </div>
      )}

      {dashboard.loading ? (
        <div className="rounded-[1.5rem] bg-white p-6 text-sm text-[#68777c] shadow-sm">
          Cargando resumen...
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <DashboardCard
              eyebrow="Hoy"
              title={dashboard.appointmentsToday.length}
              description="Citas agendadas"
            />
            <DashboardCard
              eyebrow="Semana"
              title={dashboard.appointmentsWeek.length}
              description={`Ocupación estimada ${weeklyFill}%`}
            />
            <DashboardCard
              eyebrow="Ingresos hoy"
              title={formatMoney(sumPayments(dashboard.paymentsToday))}
              description="Cobros registrados"
            />
            <DashboardCard
              eyebrow="Ingresos semana"
              title={formatMoney(sumPayments(dashboard.paymentsWeek))}
              description={`${dashboard.newClientsWeek} clientas nuevas`}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <DashboardPanel
              eyebrow="Agenda"
              title="Próximas citas"
              description="Primeras citas pendientes del día y la semana."
            >
              <div className="space-y-3">
                {dashboard.appointmentsWeek.slice(0, 8).map((appointment) => (
                  <div
                    key={appointment.id}
                    className="rounded-2xl border border-[#edf0f2] bg-[#fdfefe] p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium text-[#263238]">
                          {appointment.clients?.full_name || "Clienta"}
                        </p>
                        <p className="mt-1 text-sm text-[#68777c]">
                          {appointment.appointment_date} ·{" "}
                          {formatTime(appointment.start_time)}
                        </p>
                        <p className="mt-1 text-sm text-[#68777c]">
                          {getAppointmentServices(appointment)}
                        </p>
                      </div>

                      <span className="rounded-full bg-[#f7eeee] px-3 py-1 text-xs text-[#8a5f63]">
                        {appointment.status || "agendada"}
                      </span>
                    </div>
                  </div>
                ))}

                {dashboard.appointmentsWeek.length === 0 && (
                  <p className="rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
                    No hay citas registradas esta semana.
                  </p>
                )}
              </div>
            </DashboardPanel>

            <div className="space-y-6">
              <DashboardPanel
                eyebrow="Cobros"
                title="Pendientes de cobro"
                description={`${pendingPayments.length} cita${
                  pendingPayments.length === 1 ? "" : "s"
                } sin pago registrado en la semana.`}
              >
                <div className="space-y-2">
                  {pendingPayments.slice(0, 5).map((appointment) => (
                    <p
                      key={appointment.id}
                      className="rounded-2xl bg-[#fff8f7] px-4 py-3 text-sm text-[#68777c]"
                    >
                      {appointment.appointment_date} ·{" "}
                      {appointment.clients?.full_name || "Clienta"}
                    </p>
                  ))}

                  {pendingPayments.length === 0 && (
                    <p className="rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
                      No hay pendientes visibles.
                    </p>
                  )}
                </div>
              </DashboardPanel>

              <DashboardPanel
                eyebrow="Alertas"
                title="Seguimientos y stock"
                description="Puntos que conviene revisar."
              >
                <div className="grid gap-3">
                  <div className="rounded-2xl bg-[#f7f9fa] p-4">
                    <p className="text-2xl font-light">
                      {dashboard.pendingFollowups}
                    </p>
                    <p className="text-sm text-[#68777c]">
                      Seguimientos pendientes · {dashboard.overdueFollowups} vencidos
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[#f7f9fa] p-4">
                    <p className="text-2xl font-light">
                      {dashboard.lowStockProducts.length}
                    </p>
                    <p className="text-sm text-[#68777c]">
                      Productos en bajo stock
                    </p>
                  </div>
                </div>
              </DashboardPanel>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <DashboardPanel
              eyebrow="Servicios"
              title="Más agendados"
              description="Basado en las citas de esta semana."
            >
              <div className="space-y-3">
                {dashboard.popularServices.map((service) => (
                  <div
                    key={service.name}
                    className="flex items-center justify-between rounded-2xl bg-[#f7f9fa] px-4 py-3 text-sm"
                  >
                    <span>{service.name}</span>
                    <span className="font-medium text-[#bd7b83]">
                      {service.count}
                    </span>
                  </div>
                ))}

                {dashboard.popularServices.length === 0 && (
                  <p className="rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
                    Aún no hay suficientes servicios esta semana.
                  </p>
                )}
              </div>
            </DashboardPanel>

            <DashboardPanel
              eyebrow="Tienda"
              title="Bajo stock"
              description="Productos activos que llegaron al mínimo configurado."
            >
              <div className="space-y-3">
                {dashboard.lowStockProducts.map((product) => (
                  <div
                    key={product.id}
                    className="rounded-2xl bg-[#fff8f7] px-4 py-3 text-sm text-[#68777c]"
                  >
                    <p className="font-medium text-[#263238]">{product.name}</p>
                    <p>
                      Stock {product.current_stock || 0} · Mínimo{" "}
                      {product.min_stock || 0}
                    </p>
                  </div>
                ))}

                {dashboard.lowStockProducts.length === 0 && (
                  <p className="rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
                    No hay productos en bajo stock.
                  </p>
                )}
              </div>
            </DashboardPanel>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function DashboardCard({ eyebrow, title, description }) {
  return (
    <div className="rounded-[1.5rem] bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
        {eyebrow}
      </p>
      <p className="mt-3 text-3xl font-light text-[#263238]">{title}</p>
      <p className="mt-2 text-sm text-[#68777c]">{description}</p>
    </div>
  );
}

function DashboardPanel({ eyebrow, title, description, children }) {
  return (
    <section className="rounded-[1.5rem] bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
        {eyebrow}
      </p>
      <h3 className="mt-2 text-2xl font-light">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-[#68777c]">{description}</p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}
