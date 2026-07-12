"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

function getMessageType(message) {
  const text = String(message || "").toLowerCase();

  const isError =
    text.includes("no se pudo") ||
    text.includes("error") ||
    text.includes("obligatorio") ||
    text.includes("denegado") ||
    text.includes("no compatible") ||
    text.includes("no permite") ||
    text.includes("faltan");

  const isSuccess =
    text.includes("correctamente") ||
    text.includes("activada") ||
    text.includes("activadas") ||
    text.includes("enviada") ||
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

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
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
  const [pushSupported, setPushSupported] = useState(null);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushPublicKey, setPushPublicKey] = useState("");
  const [pushPermission, setPushPermission] = useState("default");
  const [pushActive, setPushActive] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState("");

  useEffect(() => {
    const start = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        window.location.href = "/admin";
        return;
      }

      setLoadingSession(false);
      await loadData();
      await initializePushState();
    };

    start();
  }, []);

  const initializePushState = async () => {
    if (typeof window === "undefined") return;

    const isSupported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    setPushSupported(isSupported);

    if (!isSupported) {
      setPushMessage(
        "Este dispositivo o navegador no permite notificaciones push. Puedes revisar tus notificaciones dentro del sistema."
      );
      return;
    }

    setPushPermission(Notification.permission);

    try {
      const keyResponse = await fetch("/api/push/public-key");
      const keyResult = await keyResponse.json();

      setPushConfigured(Boolean(keyResult.configured && keyResult.publicKey));
      setPushPublicKey(keyResult.publicKey || "");

      const registration = await navigator.serviceWorker.ready;
      const existingSubscription =
        await registration.pushManager.getSubscription();

      setPushActive(Boolean(existingSubscription));

      if (!keyResult.configured) {
        setPushMessage(
          "Faltan llaves VAPID en el servidor. Agrega VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT para activar push."
        );
      }
    } catch (error) {
      console.error("No se pudo revisar estado push", error);
      setPushMessage(
        "No se pudo revisar el estado de notificaciones del dispositivo."
      );
    }
  };

  const getSessionAccessToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  };

  const activatePushNotifications = async () => {
    setPushLoading(true);
    setPushMessage("");

    try {
      if (!pushSupported) {
        setPushMessage(
          "Este dispositivo o navegador no permite notificaciones push. Puedes revisar tus notificaciones dentro del sistema."
        );
        return;
      }

      if (!pushConfigured || !pushPublicKey) {
        setPushMessage(
          "Faltan llaves VAPID en el servidor. Configúralas antes de activar notificaciones push."
        );
        return;
      }

      if (Notification.permission === "denied") {
        setPushPermission("denied");
        setPushMessage(
          "El permiso de notificaciones está denegado en este dispositivo. Actívalo desde la configuración del navegador."
        );
        return;
      }

      const permission = await Notification.requestPermission();
      setPushPermission(permission);

      if (permission !== "granted") {
        setPushMessage(
          "No se activaron las notificaciones porque el permiso no fue concedido."
        );
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(pushPublicKey),
        });
      }

      const token = await getSessionAccessToken();

      if (!token) {
        setPushMessage("Tu sesión expiró. Vuelve a iniciar sesión.");
        return;
      }

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          user_agent: navigator.userAgent,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error || "No se pudo registrar este dispositivo."
        );
      }

      setPushActive(true);
      setPushMessage("Notificaciones del dispositivo activadas correctamente ✨");
    } catch (error) {
      console.error("No se pudo activar push", error);
      setPushMessage(
        `No se pudo activar notificaciones push: ${error.message}`
      );
    } finally {
      setPushLoading(false);
    }
  };

  const sendTestPush = async () => {
    setPushLoading(true);
    setPushMessage("");

    try {
      const token = await getSessionAccessToken();

      if (!token) {
        setPushMessage("Tu sesión expiró. Vuelve a iniciar sesión.");
        return;
      }

      const response = await fetch("/api/push/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error || "No se pudo enviar la notificación de prueba."
        );
      }

      setPushMessage("Notificación de prueba enviada correctamente ✨");
    } catch (error) {
      console.error("No se pudo enviar push de prueba", error);
      setPushMessage(
        `No se pudo enviar notificación de prueba: ${error.message}`
      );
    } finally {
      setPushLoading(false);
    }
  };

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

        if (String(notification.notification_type || "").startsWith("cita_")) {
          result.appointments += 1;
        }

        return result;
      },
      {
        total: 0,
        unread: 0,
        read: 0,
        tasks: 0,
        appointments: 0,
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

  const pushStatusLabel =
    pushSupported === false
      ? "No compatible"
      : pushActive
      ? "Activadas"
      : pushPermission === "denied"
      ? "Permiso denegado"
      : "Desactivadas";
  const pushStatusClass = pushActive
    ? "bg-green-50 text-green-700"
    : pushPermission === "denied" || pushSupported === false
    ? "bg-red-50 text-red-700"
    : "bg-yellow-50 text-yellow-700";

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

        <div className="mb-8 rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.08)]">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
                Push móvil
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-light">
                  Notificaciones del dispositivo
                </h2>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${pushStatusClass}`}
                >
                  {pushStatusLabel}
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6d5a58]">
                Activa este dispositivo para recibir avisos del sistema aunque
                no tengas abierta la página. En iPhone funciona cuando la app
                está instalada en pantalla de inicio.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={activatePushNotifications}
                disabled={
                  pushLoading ||
                  pushSupported === false ||
                  pushPermission === "denied" ||
                  !pushConfigured
                }
                className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pushLoading ? "Procesando..." : "Activar notificaciones"}
              </button>

              <button
                type="button"
                onClick={sendTestPush}
                disabled={pushLoading || !pushActive}
                className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enviar prueba
              </button>
            </div>
          </div>

          {pushMessage && (
            <div
              className={`mt-5 rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(
                pushMessage
              )}`}
            >
              {pushMessage}
            </div>
          )}
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
              <option value="cita_nueva">Nueva cita</option>
              <option value="cita_actualizada">Cita actualizada</option>
              <option value="cita_estado">Estado de cita</option>
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
