"use client";

import { useEffect, useMemo, useState } from "react";
import ClientPortalShell, {
  PortalCard,
  PortalMessage,
} from "../components/ClientPortalShell";
import { portalFetch } from "../components/portalApi";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function statusLabel(appointment) {
  const confirmation = String(
    appointment.confirmation_status || appointment.status || "pendiente"
  ).toLowerCase();

  if (confirmation.includes("confirm")) return "Confirmada";
  if (confirmation.includes("cancel") || confirmation === "cancelo") {
    return "Cancelada";
  }
  if (confirmation === "asistio" || confirmation === "realizada") {
    return "Realizada";
  }
  return "Pendiente";
}

function AppointmentCard({
  appointment,
  onCancel,
  cancelling,
  pendingCancelId,
  setPendingCancelId,
}) {
  const isConfirmingCancel = pendingCancelId === appointment.id;

  return (
    <div className="rounded-3xl border border-[#ead8d4] bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xl font-light text-[#3b2b2d]">
            {appointment.appointment_date} · {appointment.start_time}
            {appointment.end_time ? ` - ${appointment.end_time}` : ""}
          </p>
          <p className="mt-1 text-sm text-[#765d5f]">
            {appointment.services.map((service) => service.name).join(", ")}
          </p>
        </div>
        <span className="w-fit rounded-full bg-[#fff3f1] px-3 py-1 text-sm text-[#9a6067]">
          {statusLabel(appointment)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-[#765d5f] sm:grid-cols-2">
        <div className="rounded-2xl bg-[#fff8f6] p-3">
          Total aprox. {appointment.total_estimate_text}
        </div>
        <div className="rounded-2xl bg-[#fff8f6] p-3">
          {appointment.public_notes || "Sin observaciones visibles."}
        </div>
      </div>

      {appointment.can_cancel && !isConfirmingCancel && (
        <button
          type="button"
          onClick={() => setPendingCancelId(appointment.id)}
          disabled={cancelling === appointment.id}
          className="mt-4 rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#fff3f1] disabled:opacity-60"
        >
          Cancelar solicitud/cita
        </button>
      )}

      {appointment.can_cancel && isConfirmingCancel && (
        <div className="mt-4 rounded-3xl bg-[#fff8f6] p-4">
          <p className="text-sm text-[#765d5f]">
            ¿Confirmas que quieres cancelar esta solicitud/cita?
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => onCancel(appointment.id)}
              disabled={cancelling === appointment.id}
              className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {cancelling === appointment.id ? "Cancelando..." : "Sí, cancelar"}
            </button>
            <button
              type="button"
              onClick={() => setPendingCancelId("")}
              className="rounded-full border border-[#d8b8b4] px-5 py-3 text-sm text-[#765d5f]"
            >
              Mantener cita
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClienteMisCitasPage() {
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);
  const [contact, setContact] = useState(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("info");
  const [cancelling, setCancelling] = useState("");
  const [pendingCancelId, setPendingCancelId] = useState("");

  const loadAppointments = async () => {
    setLoading(true);
    setMessage("");

    try {
      const data = await portalFetch("/api/client/appointments");
      setAppointments(data.appointments || []);
      setContact(data.contact || null);
    } catch (error) {
      setTone("error");
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppointments();
  }, []);

  const { upcoming, history } = useMemo(() => {
    const today = todayISO();
    const next = [];
    const past = [];

    appointments.forEach((appointment) => {
      const cancelled = statusLabel(appointment) === "Cancelada";

      if (appointment.appointment_date >= today && !cancelled) {
        next.push(appointment);
      } else {
        past.push(appointment);
      }
    });

    next.sort((a, b) =>
      `${a.appointment_date} ${a.start_time}`.localeCompare(
        `${b.appointment_date} ${b.start_time}`
      )
    );

    return { upcoming: next, history: past };
  }, [appointments]);

  const cancelAppointment = async (appointmentId) => {
    setCancelling(appointmentId);
    setMessage("");

    try {
      const data = await portalFetch("/api/client/appointments", {
        method: "PATCH",
        body: JSON.stringify({ appointment_id: appointmentId }),
      });
      setTone("success");
      setMessage(data.message || "Cita cancelada correctamente.");
      setPendingCancelId("");
      await loadAppointments();
    } catch (error) {
      setTone("error");
      setMessage(error.message);
    } finally {
      setCancelling("");
    }
  };

  return (
    <ClientPortalShell
      title="Mis citas"
      subtitle="Consulta tus próximas citas, solicitudes pendientes e historial visible."
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <div className="space-y-5">
          <PortalMessage message={message} tone={tone} />

          <PortalCard>
            <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
              Próximas
            </p>
            <h2 className="mt-2 text-2xl font-light">Tus próximas citas</h2>

            <div className="mt-5 space-y-3">
              {loading ? (
                <p className="text-sm text-[#765d5f]">Cargando citas...</p>
              ) : upcoming.length === 0 ? (
                <div className="rounded-3xl bg-[#fff8f6] p-5 text-sm text-[#765d5f]">
                  No tienes citas próximas. Puedes solicitar una desde Agendar.
                </div>
              ) : (
                upcoming.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    onCancel={cancelAppointment}
                    cancelling={cancelling}
                    pendingCancelId={pendingCancelId}
                    setPendingCancelId={setPendingCancelId}
                  />
                ))
              )}
            </div>
          </PortalCard>

          <PortalCard>
            <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
              Historial
            </p>
            <h2 className="mt-2 text-2xl font-light">Historial de citas</h2>

            <div className="mt-5 space-y-3">
              {history.length === 0 ? (
                <div className="rounded-3xl bg-[#fff8f6] p-5 text-sm text-[#765d5f]">
                  Aún no hay historial visible.
                </div>
              ) : (
                history.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    onCancel={cancelAppointment}
                    cancelling={cancelling}
                    pendingCancelId={pendingCancelId}
                    setPendingCancelId={setPendingCancelId}
                  />
                ))
              )}
            </div>
          </PortalCard>
        </div>

        <PortalCard className="h-fit">
          <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
            Ayuda
          </p>
          <h2 className="mt-2 text-2xl font-light">¿Necesitas escribirnos?</h2>
          <p className="mt-3 text-sm leading-6 text-[#765d5f]">
            Si quieres cambiar detalles de una cita confirmada, el equipo puede
            ayudarte por WhatsApp.
          </p>

          {contact?.whatsapp_url ? (
            <a
              href={contact.whatsapp_url}
              target="_blank"
              rel="noreferrer"
              className="mt-5 block rounded-full bg-[#25d366] px-6 py-4 text-center text-white transition hover:opacity-90"
            >
              Contactar por WhatsApp
            </a>
          ) : (
            <div className="mt-5 rounded-3xl bg-[#fff8f6] p-4 text-sm leading-6 text-[#765d5f]">
              El WhatsApp del salón aún no está configurado. Puedes revisar tus
              notificaciones dentro del sistema o pedir al equipo que lo agregue
              en Configuración.
            </div>
          )}
        </PortalCard>
      </div>
    </ClientPortalShell>
  );
}
