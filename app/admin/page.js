"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(time) {
  if (!time) return "";
  return time.slice(0, 5);
}

function timeToMinutes(time) {
  if (!time) return null;
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function timesOverlap(startA, endA, startB, endB) {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);

  if (aStart === null || aEnd === null || bStart === null || bEnd === null) {
    return false;
  }

  return aStart < bEnd && bStart < aEnd;
}

function generateTimeSlots() {
  const slots = [];

  for (let hour = 8; hour <= 21; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      if (hour === 21 && minute > 0) continue;

      const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(
        2,
        "0"
      )}`;

      slots.push(value);
    }
  }

  return slots;
}

function getWeekRange(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

function isBirthdayInWeek(birthday, weekStart, weekEnd) {
  if (!birthday) return false;

  const currentYear = new Date().getFullYear();
  const birthdayDate = new Date(`${currentYear}-${birthday.slice(5, 10)}T00:00:00`);
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(`${weekEnd}T23:59:59`);

  return birthdayDate >= start && birthdayDate <= end;
}

function getDayLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

const timeSlots = generateTimeSlots();

export default function AdminPage() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("alexandraruizsalon@gmail.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  const [message, setMessage] = useState("");
  const [activeSection, setActiveSection] = useState("agenda");

  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const [staff, setStaff] = useState([]);
  const [clients, setClients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [appointmentServicesWeek, setAppointmentServicesWeek] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [staffSchedules, setStaffSchedules] = useState([]);

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setLoading(false);

      if (data.session) {
        await loadDashboardData();
        await loadUnreadNotifications();
      }
    };

    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);

      if (newSession) {
        await loadDashboardData();
        await loadUnreadNotifications();
      } else {
        setUnreadNotifications(0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      loadDashboardData();
    }
  }, [selectedDate, session]);

  const weekRange = useMemo(() => getWeekRange(selectedDate), [selectedDate]);

  const loadUnreadNotifications = async () => {
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("is_read", false);

    if (!error) {
      setUnreadNotifications(count || 0);
    }
  };

  const loadDashboardData = async () => {
    setLoadingDashboard(true);
    setMessage("");

    const currentWeek = getWeekRange(selectedDate);

    const [
      staffResult,
      clientsResult,
      appointmentsResult,
      weekServicesResult,
      blocksResult,
      schedulesResult,
    ] = await Promise.all([
      supabase.from("staff").select("*").eq("active", true).order("full_name"),
      supabase.from("clients").select("*").order("created_at", { ascending: false }),
      supabase
        .from("appointments")
        .select(
          `
          *,
          clients (
            full_name,
            phone
          ),
          appointment_services (
            id,
            service_id,
            staff_id,
            service_date,
            start_time,
            end_time,
            duration_minutes,
            cleanup_minutes,
            total_price,
            price,
            status,
            services (
              name,
              category
            ),
            staff (
              full_name,
              color
            )
          )
        `
        )
        .eq("appointment_date", selectedDate)
        .order("start_time", { ascending: true }),
      supabase
        .from("appointment_services")
        .select(
          `
          *,
          services (
            name,
            category
          ),
          staff (
            full_name,
            color,
            service_commission_percentage,
            commission_percentage
          ),
          appointments (
            status,
            appointment_date,
            clients (
              full_name
            )
          )
        `
        )
        .gte("service_date", currentWeek.start)
        .lte("service_date", currentWeek.end),
      supabase
        .from("staff_time_blocks")
        .select("*, staff(full_name, color)")
        .eq("block_date", selectedDate)
        .order("start_time", { ascending: true }),
      supabase.from("staff_schedules").select("*"),
    ]);

    if (staffResult.error) {
      setMessage(`Error al cargar personal: ${staffResult.error.message}`);
    } else {
      setStaff(staffResult.data || []);
    }

    if (clientsResult.error) {
      setMessage(`Error al cargar clientas: ${clientsResult.error.message}`);
    } else {
      setClients(clientsResult.data || []);
    }

    if (appointmentsResult.error) {
      setMessage(`Error al cargar agenda: ${appointmentsResult.error.message}`);
    } else {
      setAppointments(appointmentsResult.data || []);
    }

    if (weekServicesResult.error) {
      setMessage(
        `Error al cargar servicios semanales: ${weekServicesResult.error.message}`
      );
    } else {
      setAppointmentServicesWeek(weekServicesResult.data || []);
    }

    if (blocksResult.error) {
      setMessage(`Error al cargar bloqueos: ${blocksResult.error.message}`);
    } else {
      setBlocks(blocksResult.data || []);
    }

    if (schedulesResult.error) {
      setMessage(`Error al cargar horarios: ${schedulesResult.error.message}`);
    } else {
      setStaffSchedules(schedulesResult.data || []);
    }

    setLoadingDashboard(false);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setMessage(`No se pudo iniciar sesión: ${error.message}`);
    } else {
      setMessage("Sesión iniciada correctamente.");
      await loadDashboardData();
      await loadUnreadNotifications();
    }

    setLoginLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUnreadNotifications(0);
  };

  const appointmentsByStaff = useMemo(() => {
    const result = {};

    staff.forEach((person) => {
      result[person.id] = [];
    });

    appointments.forEach((appointment) => {
      const services = appointment.appointment_services || [];

      services.forEach((service) => {
        if (!result[service.staff_id]) {
          result[service.staff_id] = [];
        }

        result[service.staff_id].push({
          ...service,
          appointment,
          isBlock: false,
        });
      });
    });

    blocks.forEach((block) => {
      if (!result[block.staff_id]) {
        result[block.staff_id] = [];
      }

      result[block.staff_id].push({
        id: `block-${block.id}`,
        isBlock: true,
        start_time: block.start_time,
        end_time: block.end_time,
        block,
      });
    });

    Object.keys(result).forEach((staffId) => {
      result[staffId].sort((a, b) =>
        String(a.start_time || "").localeCompare(String(b.start_time || ""))
      );
    });

    return result;
  }, [appointments, blocks, staff]);

  const dashboardStats = useMemo(() => {
    const activeServices = appointmentServicesWeek.filter((service) => {
      const status = service.appointments?.status || "";
      return status !== "cancelada" && status !== "cancelado";
    });

    const bookedMinutes = activeServices.reduce((sum, service) => {
      if (service.start_time && service.end_time) {
        return (
          sum +
          Math.max(
            0,
            timeToMinutes(service.end_time) - timeToMinutes(service.start_time)
          )
        );
      }

      return (
        sum +
        Number(service.duration_minutes || 0) +
        Number(service.cleanup_minutes || 0)
      );
    }, 0);

    const availableMinutes = staffSchedules
      .filter((schedule) => schedule.is_active && !schedule.is_day_off)
      .reduce((sum, schedule) => {
        const start = timeToMinutes(schedule.start_time);
        const end = timeToMinutes(schedule.end_time);

        if (start === null || end === null) return sum;

        let total = Math.max(0, end - start);

        if (schedule.has_break && schedule.break_start && schedule.break_end) {
          const breakStart = timeToMinutes(schedule.break_start);
          const breakEnd = timeToMinutes(schedule.break_end);

          if (breakStart !== null && breakEnd !== null) {
            total -= Math.max(0, breakEnd - breakStart);
          }
        }

        return sum + Math.max(0, total);
      }, 0);

    const occupancy =
      availableMinutes > 0
        ? Math.round((bookedMinutes / availableMinutes) * 100)
        : 0;

    const serviceCounter = {};

    activeServices.forEach((service) => {
      const serviceName = service.services?.name || "Servicio";
      serviceCounter[serviceName] = (serviceCounter[serviceName] || 0) + 1;
    });

    const topServices = Object.entries(serviceCounter)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const newClients = clients.filter((client) => {
      if (!client.created_at) return false;

      const createdAt = client.created_at.slice(0, 10);
      return createdAt >= weekRange.start && createdAt <= weekRange.end;
    });

    const birthdayClients = clients.filter((client) =>
      isBirthdayInWeek(client.birthday, weekRange.start, weekRange.end)
    );

    const weeklySales = activeServices.reduce((sum, service) => {
      return sum + Number(service.total_price || service.price || 0);
    }, 0);

    return {
      occupancy,
      bookedMinutes,
      availableMinutes,
      topServices,
      newClients,
      birthdayClients,
      weeklySales,
      activeServicesCount: activeServices.length,
    };
  }, [appointmentServicesWeek, staffSchedules, clients, weekRange]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#fdf8f6] px-6 py-10 text-[#352829]">
        <p>Cargando...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#fcf7f6] to-[#f6e9e6] px-6 py-10 text-[#352829]">
        <section className="mx-auto flex min-h-[80vh] max-w-md items-center">
          <div className="w-full rounded-[2rem] border border-[#ecd8d4] bg-white p-8 shadow-[0_25px_70px_rgba(189,123,131,0.15)]">
            <p className="text-xs uppercase tracking-[0.35em] text-[#bd7b83]">
              Alexandra Ruiz Salón
            </p>

            <h1 className="mt-4 text-4xl font-light">Acceso interno</h1>

            <p className="mt-3 text-sm leading-6 text-[#6d5a58]">
              Inicia sesión para entrar al sistema administrativo del salón.
            </p>

            <form onSubmit={handleLogin} className="mt-8 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Correo
                </label>
                <input
                  type="email"
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Contraseña
                </label>

                <input
                  type={showPassword ? "text" : "password"}
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />

                <label className="mt-3 flex items-center gap-2 text-sm text-[#6d5a58]">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(event) => setShowPassword(event.target.checked)}
                  />
                  Mostrar contraseña
                </label>
              </div>

              {message && (
                <p className="rounded-2xl bg-[#fcf0ef] px-4 py-3 text-sm text-[#8a5f63]">
                  {message}
                </p>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {loginLoading ? "Entrando..." : "Entrar"}
              </button>
            </form>

            <a
              href="/"
              className="mt-5 block text-center text-sm text-[#bd7b83]"
            >
              Volver a la web
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef1f3] text-[#263238]">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-[#dde3e6] bg-white p-6 lg:block">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              Alexandra Ruiz
            </p>
            <h1 className="mt-2 text-2xl font-light">Sistema interno</h1>
          </div>

          <nav className="space-y-2">
            <button
              type="button"
              onClick={() => setActiveSection("agenda")}
              className={`w-full rounded-2xl px-4 py-3 text-left text-sm transition ${
                activeSection === "agenda"
                  ? "bg-[#bd7b83] text-white"
                  : "text-[#536166] hover:bg-[#f7eeee]"
              }`}
            >
              Agenda diaria
            </button>

            <button
              type="button"
              onClick={() => setActiveSection("resumen")}
              className={`w-full rounded-2xl px-4 py-3 text-left text-sm transition ${
                activeSection === "resumen"
                  ? "bg-[#bd7b83] text-white"
                  : "text-[#536166] hover:bg-[#f7eeee]"
              }`}
            >
              Resumen semanal
            </button>

            <div className="my-4 border-t border-[#edf0f2]" />

            <a
              href="/admin/clientas"
              className="block rounded-2xl px-4 py-3 text-sm text-[#536166] transition hover:bg-[#f7eeee]"
            >
              Clientas
            </a>

            <a
              href="/admin/servicios"
              className="block rounded-2xl px-4 py-3 text-sm text-[#536166] transition hover:bg-[#f7eeee]"
            >
              Servicios
            </a>

            <a
              href="/admin/agenda"
              className="block rounded-2xl px-4 py-3 text-sm text-[#536166] transition hover:bg-[#f7eeee]"
            >
              Crear cita
            </a>

            <a
              href="/admin/tecnicas"
              className="block rounded-2xl px-4 py-3 text-sm text-[#536166] transition hover:bg-[#f7eeee]"
            >
              Técnicas / Personal
            </a>

            <a
              href="/admin/tareas"
              className="block rounded-2xl px-4 py-3 text-sm text-[#536166] transition hover:bg-[#f7eeee]"
            >
              Tareas
            </a>

            <a
              href="/admin/notificaciones"
              className="flex items-center justify-between rounded-2xl px-4 py-3 text-sm text-[#536166] transition hover:bg-[#f7eeee]"
            >
              <span>Notificaciones</span>
              {unreadNotifications > 0 && (
                <span className="rounded-full bg-[#d6007f] px-2 py-1 text-xs font-bold text-white">
                  {unreadNotifications}
                </span>
              )}
            </a>

            <div className="my-4 border-t border-[#edf0f2]" />

            <span className="block rounded-2xl px-4 py-3 text-sm text-[#9aa4a8]">
              Caja próximamente
            </span>

            <span className="block rounded-2xl px-4 py-3 text-sm text-[#9aa4a8]">
              Tienda próximamente
            </span>

            <span className="block rounded-2xl px-4 py-3 text-sm text-[#9aa4a8]">
              Reportes próximamente
            </span>
          </nav>
        </aside>

        <section className="flex-1">
          <header className="sticky top-0 z-30 border-b border-[#dde3e6] bg-white/95 px-4 py-4 backdrop-blur md:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
                  Panel administrativo
                </p>
                <h2 className="mt-1 text-3xl font-light">
                  {activeSection === "agenda"
                    ? "Agenda diaria"
                    : "Resumen semanal"}
                </h2>
                <p className="mt-1 text-sm text-[#68777c]">
                  Sesión activa: {session.user.email}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <a
                  href="/admin/notificaciones"
                  className={`relative flex h-12 w-12 items-center justify-center rounded-full border transition ${
                    unreadNotifications > 0
                      ? "animate-pulse border-[#d6007f] bg-[#d6007f] text-white shadow-[0_0_25px_rgba(214,0,127,0.45)]"
                      : "border-[#bd7b83] bg-white text-[#bd7b83] hover:bg-[#bd7b83] hover:text-white"
                  }`}
                  title="Notificaciones"
                >
                  <span className="text-xl">🔔</span>

                  {unreadNotifications > 0 && (
                    <span className="absolute -right-2 -top-2 flex min-h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-xs font-bold text-[#d6007f] shadow-md">
                      {unreadNotifications > 99
                        ? "99+"
                        : unreadNotifications}
                    </span>
                  )}
                </a>

                <button
                  onClick={handleLogout}
                  className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                >
                  Cerrar sesión
                </button>
              </div>
            </div>

            <div className="mt-4 flex gap-2 overflow-auto lg:hidden">
              <button
                type="button"
                onClick={() => setActiveSection("agenda")}
                className={`rounded-full px-4 py-2 text-sm ${
                  activeSection === "agenda"
                    ? "bg-[#bd7b83] text-white"
                    : "bg-[#f7eeee] text-[#8a5f63]"
                }`}
              >
                Agenda
              </button>

              <button
                type="button"
                onClick={() => setActiveSection("resumen")}
                className={`rounded-full px-4 py-2 text-sm ${
                  activeSection === "resumen"
                    ? "bg-[#bd7b83] text-white"
                    : "bg-[#f7eeee] text-[#8a5f63]"
                }`}
              >
                Resumen
              </button>

              <a
                href="/admin/tecnicas"
                className="rounded-full bg-[#f7eeee] px-4 py-2 text-sm text-[#8a5f63]"
              >
                Personal
              </a>

              <a
                href="/admin/tareas"
                className="rounded-full bg-[#f7eeee] px-4 py-2 text-sm text-[#8a5f63]"
              >
                Tareas
              </a>
            </div>
          </header>

          <div className="p-4 md:p-8">
            {message && (
              <div className="mb-6 rounded-2xl bg-red-600 px-5 py-4 text-sm font-medium text-white shadow-lg">
                {message}
              </div>
            )}

            {activeSection === "agenda" && (
              <AgendaDashboard
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                staff={staff}
                appointmentsByStaff={appointmentsByStaff}
                loadingDashboard={loadingDashboard}
              />
            )}

            {activeSection === "resumen" && (
              <ResumenDashboard
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                weekRange={weekRange}
                stats={dashboardStats}
                loadingDashboard={loadingDashboard}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function AgendaDashboard({
  selectedDate,
  setSelectedDate,
  staff,
  appointmentsByStaff,
  loadingDashboard,
}) {
  return (
    <div className="rounded-[1.5rem] bg-white p-5 shadow-sm">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
            Vista tipo tabla
          </p>
          <h3 className="mt-2 text-2xl font-light">
            {getDayLabel(selectedDate)}
          </h3>
          <p className="mt-1 text-sm text-[#68777c]">
            Filas por horario y columnas por técnica.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
          />

          <a
            href="/admin/agenda"
            className="rounded-full bg-[#bd7b83] px-6 py-3 text-center text-sm text-white transition hover:opacity-90"
          >
            Crear cita
          </a>
        </div>
      </div>

      {loadingDashboard ? (
        <p className="text-sm text-[#68777c]">Cargando agenda...</p>
      ) : staff.length === 0 ? (
        <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
          No hay técnicas activas registradas.
        </div>
      ) : (
        <div className="overflow-auto rounded-2xl border border-[#dde3e6]">
          <table className="min-w-[900px] w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#f7f9fa]">
                <th className="sticky left-0 z-10 border-b border-r border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 text-left font-medium">
                  Hora
                </th>

                {staff.map((person) => (
                  <th
                    key={person.id}
                    className="border-b border-r border-[#dde3e6] px-4 py-3 text-left font-medium"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{
                          backgroundColor: person.color || "#bd7b83",
                        }}
                      />
                      {person.full_name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {timeSlots.map((slot) => (
                <tr key={slot} className="hover:bg-[#fbf7f6]">
                  <td className="sticky left-0 z-10 border-b border-r border-[#dde3e6] bg-white px-4 py-3 font-medium text-[#68777c]">
                    {slot}
                  </td>

                  {staff.map((person) => {
                    const items = (appointmentsByStaff[person.id] || []).filter(
                      (item) =>
                        timesOverlap(
                          slot,
                          addMinutesVisual(slot, 30),
                          item.start_time,
                          item.end_time
                        )
                    );

                    return (
                      <td
                        key={`${person.id}-${slot}`}
                        className="h-20 min-w-56 border-b border-r border-[#dde3e6] px-3 py-2 align-top"
                      >
                        {items.length === 0 ? (
                          <span className="text-xs text-[#b0b8bb]">Libre</span>
                        ) : (
                          <div className="space-y-2">
                            {items.map((item) => {
                              if (item.isBlock) {
                                return (
                                  <div
                                    key={item.id}
                                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                                  >
                                    <p className="font-medium">
                                      {formatTime(item.start_time)} -{" "}
                                      {formatTime(item.end_time)}
                                    </p>
                                    <p>{item.block.title || "Bloqueo"}</p>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={item.id}
                                  className="rounded-xl px-3 py-2 text-xs text-white shadow-sm"
                                  style={{
                                    backgroundColor:
                                      item.staff?.color ||
                                      person.color ||
                                      "#bd7b83",
                                  }}
                                >
                                  <p className="font-medium">
                                    {formatTime(item.start_time)} -{" "}
                                    {formatTime(item.end_time)}
                                  </p>
                                  <p>
                                    {item.appointment?.clients?.full_name ||
                                      "Clienta"}
                                  </p>
                                  <p>{item.services?.name || "Servicio"}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function addMinutesVisual(time, minutes) {
  const [hours, mins] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours || 0);
  date.setMinutes((mins || 0) + minutes);

  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function ResumenDashboard({
  selectedDate,
  setSelectedDate,
  weekRange,
  stats,
  loadingDashboard,
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-[1.5rem] bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
              Resumen semanal
            </p>
            <h3 className="mt-2 text-2xl font-light">
              {weekRange.start} al {weekRange.end}
            </h3>
          </div>

          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
          />
        </div>
      </div>

      {loadingDashboard ? (
        <p className="text-sm text-[#68777c]">Cargando resumen...</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-[1.5rem] bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                Ocupación
              </p>
              <p className="mt-3 text-4xl font-light">{stats.occupancy}%</p>
              <p className="mt-2 text-sm text-[#68777c]">
                {Math.round(stats.bookedMinutes / 60)} h ocupadas de{" "}
                {Math.round(stats.availableMinutes / 60)} h disponibles.
              </p>
            </div>

            <div className="rounded-[1.5rem] bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                Servicios
              </p>
              <p className="mt-3 text-4xl font-light">
                {stats.activeServicesCount}
              </p>
              <p className="mt-2 text-sm text-[#68777c]">
                Servicios registrados esta semana.
              </p>
            </div>

            <div className="rounded-[1.5rem] bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                Clientas nuevas
              </p>
              <p className="mt-3 text-4xl font-light">
                {stats.newClients.length}
              </p>
              <p className="mt-2 text-sm text-[#68777c]">
                Agregadas a la lista esta semana.
              </p>
            </div>

            <div className="rounded-[1.5rem] bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                Venta estimada
              </p>
              <p className="mt-3 text-4xl font-light">${stats.weeklySales}</p>
              <p className="mt-2 text-sm text-[#68777c]">
                Según servicios agendados.
              </p>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <div className="rounded-[1.5rem] bg-white p-5 shadow-sm">
              <h4 className="text-xl font-light">Servicios más solicitados</h4>

              <div className="mt-5 space-y-3">
                {stats.topServices.length === 0 ? (
                  <p className="text-sm text-[#68777c]">
                    Todavía no hay servicios registrados esta semana.
                  </p>
                ) : (
                  stats.topServices.map((service, index) => (
                    <div
                      key={service.name}
                      className="flex items-center justify-between rounded-2xl bg-[#f7f9fa] px-4 py-3"
                    >
                      <span className="text-sm">
                        {index + 1}. {service.name}
                      </span>
                      <span className="rounded-full bg-[#bd7b83] px-3 py-1 text-xs text-white">
                        {service.count}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[1.5rem] bg-white p-5 shadow-sm">
              <h4 className="text-xl font-light">Clientas nuevas</h4>

              <div className="mt-5 space-y-3">
                {stats.newClients.length === 0 ? (
                  <p className="text-sm text-[#68777c]">
                    No se agregaron clientas nuevas esta semana.
                  </p>
                ) : (
                  stats.newClients.slice(0, 8).map((client) => (
                    <div
                      key={client.id}
                      className="rounded-2xl bg-[#f7f9fa] px-4 py-3"
                    >
                      <p className="text-sm font-medium">{client.full_name}</p>
                      <p className="text-xs text-[#68777c]">
                        {client.phone || "Sin teléfono"}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[1.5rem] bg-white p-5 shadow-sm">
              <h4 className="text-xl font-light">Cumpleaños de la semana</h4>

              <div className="mt-5 space-y-3">
                {stats.birthdayClients.length === 0 ? (
                  <p className="text-sm text-[#68777c]">
                    No hay cumpleaños registrados esta semana.
                  </p>
                ) : (
                  stats.birthdayClients.slice(0, 8).map((client) => (
                    <div
                      key={client.id}
                      className="rounded-2xl bg-[#fff6fb] px-4 py-3"
                    >
                      <p className="text-sm font-medium">{client.full_name}</p>
                      <p className="text-xs text-[#68777c]">
                        Cumpleaños: {client.birthday}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}