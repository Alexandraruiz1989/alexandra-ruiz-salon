"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

function getMessageType(message) {
  const text = String(message || "").toLowerCase();

  const isError =
    text.includes("no se pudo") ||
    text.includes("error") ||
    text.includes("obligatorio");

  const isSuccess =
    text.includes("correctamente") ||
    text.includes("leída") ||
    text.includes("leídas") ||
    text.includes("eliminada");

  if (isError) return "error";
  if (isSuccess) return "success";
  return "info";
}

function getToastStyle(message) {
  const type = getMessageType(message);

  if (type === "error") {
    return "bg-red-600 text-white shadow-[0_18px_45px_rgba(220,38,38,0.28)]";
  }

  if (type === "success") {
    return "bg-green-600 text-white shadow-[0_18px_45px_rgba(22,163,74,0.25)]";
  }

  return "bg-[#8a5f63] text-white shadow-[0_18px_45px_rgba(138,95,99,0.25)]";
}

function formatDateTime(value) {
  if (!value) return "";

  const date = new Date(value);

  return date.toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function NotificacionesPage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);

  const [message, setMessage] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [staff, setStaff] = useState([]);

  const [statusFilter, setStatusFilter] = useState("no_leidas");
  const [staffFilter, setStaffFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

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

  const loadData = async () => {
    setLoadingData(true);
    setMessage("");

    const [notificationsResult, staffResult] = await Promise.all([
      supabase
        .from("notifications")
        .select("*, staff(full_name)")
        .order("created_at", { ascending: false }),
      supabase.from("staff").select("*").order("full_name"),
    ]);

    if (notificationsResult.error) {
      setMessage(
        `Error al cargar notificaciones: ${notificationsResult.error.message}`
      );
    } else {
      setNotifications(notificationsResult.data || []);
    }

    if (staffResult.error) {
      setMessage(`Error al cargar personal: ${staffResult.error.message}`);
    } else {
      setStaff(staffResult.data || []);
    }

    setLoadingData(false);
  };

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      const matchesStatus =
        statusFilter === "todas" ||
        (statusFilter === "leidas" && notification.is_read) ||
        (statusFilter === "no_leidas" && !notification.is_read);

      const matchesStaff =
        !staffFilter || notification.staff_id === staffFilter;

      const matchesType =
        !typeFilter || notification.notification_type === typeFilter;

      return matchesStatus && matchesStaff && matchesType;
    });
  }, [notifications, statusFilter, staffFilter, typeFilter]);

  const summary = useMemo(() => {
    return notifications.reduce(
      (result, notification) => {
        result.total += 1;

        if (notification.is_read) {
          result.read += 1;
        } else {
          result.unread += 1;
        }

        if (notification.notification_type === "tarea") {
          result.tasks += 1;
        }

        return result;
      },
      {
        total: 0,
        unread: 0,
        read: 0,
        tasks: 0,
      }
    );
  }, [notifications]);

  const markAsRead = async (notification) => {
    setMessage("Marcando como leída...");

    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("id", notification.id);

    if (error) {
      setMessage(`No se pudo marcar como leída: ${error.message}`);
      return;
    }

    await loadData();
    setMessage("Notificación marcada como leída correctamente ✨");
  };

  const markAsUnread = async (notification) => {
    setMessage("Marcando como no leída...");

    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: false,
        read_at: null,
      })
      .eq("id", notification.id);

    if (error) {
      setMessage(`No se pudo marcar como no leída: ${error.message}`);
      return;
    }

    await loadData();
    setMessage("Notificación marcada como no leída correctamente ✨");
  };

  const markAllAsRead = async () => {
    setMessage("Marcando todas como leídas...");

    const unreadIds = notifications
      .filter((notification) => !notification.is_read)
      .map((notification) => notification.id);

    if (unreadIds.length === 0) {
      setMessage("No hay notificaciones pendientes por marcar.");
      return;
    }

    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .in("id", unreadIds);

    if (error) {
      setMessage(`No se pudieron marcar todas como leídas: ${error.message}`);
      return;
    }

    await loadData();
    setMessage("Todas las notificaciones fueron marcadas como leídas ✨");
  };

  const deleteNotification = async (notification) => {
    setMessage("Eliminando notificación...");

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", notification.id);

    if (error) {
      setMessage(`No se pudo eliminar la notificación: ${error.message}`);
      return;
    }

    await loadData();
    setMessage("Notificación eliminada correctamente.");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/admin";
  };

  if (loadingSession) {
    return (
      <main className="min-h-screen bg-[#fdf8f6] px-6 py-10 text-[#352829]">
        <p>Cargando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#fcf7f6] to-[#f6e9e6] px-4 py-8 text-[#352829] md:px-8">
      <section className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.08)] md:flex-row md:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[#bd7b83]">
              Sistema interno
            </p>
            <h1 className="mt-3 text-4xl font-light">Notificaciones</h1>
            <p className="mt-2 text-sm text-[#6d5a58]">
              Avisos internos generados por tareas y movimientos del sistema.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href="/admin"
              className="rounded-full border border-[#bd7b83] px-6 py-3 text-center text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
            >
              Volver al panel
            </a>

            <button
              onClick={handleLogout}
              className="rounded-full bg-[#f2e4e1] px-6 py-3 text-[#8a5f63] transition hover:bg-[#edd8d4]"
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
              Total
            </p>
            <p className="mt-2 text-3xl font-light">{summary.total}</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
              No leídas
            </p>
            <p className="mt-2 text-3xl font-light">{summary.unread}</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
              Leídas
            </p>
            <p className="mt-2 text-3xl font-light">{summary.read}</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
              Tareas
            </p>
            <p className="mt-2 text-3xl font-light">{summary.tasks}</p>
          </div>
        </div>

        <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.10)]">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
                Centro de avisos
              </p>
              <h2 className="mt-3 text-2xl font-light">
                Notificaciones registradas
              </h2>
              <p className="mt-2 text-sm text-[#6d5a58]">
                Mostrando: {filteredNotifications.length}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={markAllAsRead}
                className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
              >
                Marcar todas como leídas
              </button>

              <button
                type="button"
                onClick={loadData}
                className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
              >
                Actualizar
              </button>
            </div>
          </div>

          {message && (
            <div
              className={`mt-5 rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(
                message
              )}`}
            >
              {message}
            </div>
          )}

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
            >
              <option value="no_leidas">No leídas</option>
              <option value="leidas">Leídas</option>
              <option value="todas">Todas</option>
            </select>

            <select
              value={staffFilter}
              onChange={(event) => setStaffFilter(event.target.value)}
              className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
            >
              <option value="">Todo el personal</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                </option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
            >
              <option value="">Todos los tipos</option>
              <option value="tarea">Tareas</option>
            </select>
          </div>

          <div className="mt-6 space-y-4">
            {loadingData ? (
              <p className="text-sm text-[#6d5a58]">
                Cargando notificaciones...
              </p>
            ) : filteredNotifications.length === 0 ? (
              <div className="rounded-2xl bg-[#fcf7f6] p-5 text-sm text-[#6d5a58]">
                No hay notificaciones con esos filtros.
              </div>
            ) : (
              filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`rounded-2xl border p-5 ${
                    notification.is_read
                      ? "border-[#ead2cf] bg-[#fdf8f6] opacity-75"
                      : "border-[#d9a6ad] bg-white shadow-sm"
                  }`}
                >
                  <div className="flex flex-col justify-between gap-4 md:flex-row">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs ${
                            notification.is_read
                              ? "bg-[#f2e4e1] text-[#8a5f63]"
                              : "bg-green-50 text-green-700"
                          }`}
                        >
                          {notification.is_read ? "Leída" : "Nueva"}
                        </span>

                        <span className="rounded-full bg-[#fcf0ef] px-3 py-1 text-xs text-[#8a5f63]">
                          {notification.notification_type || "notificación"}
                        </span>
                      </div>

                      <h3 className="mt-3 text-xl font-light">
                        {notification.title}
                      </h3>

                      {notification.message && (
                        <p className="mt-2 text-sm leading-6 text-[#6d5a58]">
                          {notification.message}
                        </p>
                      )}

                      <div className="mt-3 space-y-1 text-xs text-[#8a5f63]">
                        <p>
                          Para:{" "}
                          {notification.staff?.full_name ||
                            "Sin colaborador asignado"}
                        </p>
                        <p>Creada: {formatDateTime(notification.created_at)}</p>
                        {notification.read_at && (
                          <p>Leída: {formatDateTime(notification.read_at)}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex min-w-44 flex-col gap-2">
                      {notification.is_read ? (
                        <button
                          type="button"
                          onClick={() => markAsUnread(notification)}
                          className="rounded-full border border-[#bd7b83] px-4 py-2 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                        >
                          Marcar no leída
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => markAsRead(notification)}
                          className="rounded-full bg-green-50 px-4 py-2 text-sm text-green-700 transition hover:bg-green-100"
                        >
                          Marcar leída
                        </button>
                      )}

                      {notification.related_table === "staff_tasks" && (
                        <a
                          href="/admin/tareas"
                          className="rounded-full bg-[#f2e4e1] px-4 py-2 text-center text-sm text-[#8a5f63] transition hover:bg-[#edd8d4]"
                        >
                          Ver tareas
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => deleteNotification(notification)}
                        className="rounded-full bg-red-50 px-4 py-2 text-sm text-red-600 transition hover:bg-red-100"
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
      </section>
    </main>
  );
}