"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildFollowupWhatsAppMessage,
  buildWhatsAppUrl,
} from "../../lib/manualWhatsApp";
import { supabase } from "../../lib/supabaseClient";
import AdminShell from "../components/AdminShell";

const menuItems = [
  { key: "pendientes", label: "Pendientes" },
  { key: "vencidos", label: "Vencidos" },
  { key: "enviados", label: "Enviados" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getToastStyle(message) {
  const text = String(message || "").toLowerCase();

  if (
    text.includes("no se pudo") ||
    text.includes("error") ||
    text.includes("obligatorio")
  ) {
    return "bg-red-600 text-white shadow-[0_18px_45px_rgba(220,38,38,0.28)]";
  }

  return "bg-green-600 text-white shadow-[0_18px_45px_rgba(22,163,74,0.25)]";
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-[1.5rem] bg-white p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ eyebrow, title, description }) {
  return (
    <div className="mb-6">
      <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
        {eyebrow}
      </p>
      <h3 className="mt-2 text-2xl font-light">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-[#68777c]">{description}</p>
      )}
    </div>
  );
}

export default function SeguimientosPage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [activeSection, setActiveSection] = useState("pendientes");
  const [message, setMessage] = useState("");

  const [followups, setFollowups] = useState([]);
  const [editableMessages, setEditableMessages] = useState({});

  useEffect(() => {
    const start = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        window.location.href = "/admin";
        return;
      }

      setLoadingSession(false);
      await loadFollowups();
    };

    start();
  }, []);

  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(() => {
      setMessage("");
    }, 15000);

    return () => clearTimeout(timer);
  }, [message]);

  const loadFollowups = async () => {
    setLoadingData(true);
    setMessage("");

    const { data, error } = await supabase
      .from("appointment_followups")
      .select(
        `
        *,
        clients (
          full_name,
          phone
        ),
        services (
          name,
          category
        ),
        staff (
          full_name
        ),
        appointments (
          appointment_date,
          start_time
        )
      `
      )
      .order("followup_date", { ascending: true });

    if (error) {
      setMessage(`No se pudieron cargar seguimientos: ${error.message}`);
    } else {
      const nextFollowups = data || [];
      setFollowups(nextFollowups);
      setEditableMessages((current) => {
        const nextMessages = { ...current };

        for (const followup of nextFollowups) {
          if (nextMessages[followup.id] === undefined) {
            nextMessages[followup.id] = buildFollowupWhatsAppMessage(followup);
          }
        }

        return nextMessages;
      });
    }

    setLoadingData(false);
  };

  const pendingFollowups = useMemo(() => {
    return followups.filter((item) => item.followup_status === "pendiente");
  }, [followups]);

  const expiredFollowups = useMemo(() => {
    const today = todayISO();

    return followups.filter(
      (item) =>
        item.followup_status === "pendiente" && item.followup_date < today
    );
  }, [followups]);

  const sentFollowups = useMemo(() => {
    return followups.filter((item) => item.followup_status === "enviado");
  }, [followups]);

  const visibleFollowups = useMemo(() => {
    if (activeSection === "vencidos") return expiredFollowups;
    if (activeSection === "enviados") return sentFollowups;
    return pendingFollowups;
  }, [activeSection, pendingFollowups, expiredFollowups, sentFollowups]);

  const markAsSent = async (followup) => {
    setMessage("Marcando seguimiento como enviado...");

    const { error } = await supabase
      .from("appointment_followups")
      .update({
        followup_status: "enviado",
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", followup.id);

    if (error) {
      setMessage(`No se pudo marcar como enviado: ${error.message}`);
      return;
    }

    await loadFollowups();
    setMessage("Seguimiento marcado como enviado correctamente ✨");
  };

  const updateEditableMessage = (followupId, value) => {
    setEditableMessages((current) => ({
      ...current,
      [followupId]: value,
    }));
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
      title="Seguimientos"
      subtitle="Recordatorios para reagendar clientas después de sus servicios."
      activeModule="seguimientos"
      menuItems={menuItems}
      activeSection={activeSection}
      setActiveSection={setActiveSection}
    >
      {message && (
        <div
          className={`mb-6 rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(
            message
          )}`}
        >
          {message}
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Pendientes
          </p>
          <p className="mt-3 text-4xl font-light">{pendingFollowups.length}</p>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Vencidos
          </p>
          <p className="mt-3 text-4xl font-light">{expiredFollowups.length}</p>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Enviados
          </p>
          <p className="mt-3 text-4xl font-light">{sentFollowups.length}</p>
        </Card>
      </div>

      <Card>
        <SectionHeader
          eyebrow="Reagendado"
          title={
            activeSection === "vencidos"
              ? "Seguimientos vencidos"
              : activeSection === "enviados"
              ? "Seguimientos enviados"
              : "Seguimientos pendientes"
          }
          description="Inicialmente estos recordatorios se envían de forma manual por WhatsApp. Más adelante los automatizamos."
        />

        {loadingData ? (
          <p className="text-sm text-[#68777c]">Cargando seguimientos...</p>
        ) : visibleFollowups.length === 0 ? (
          <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
            No hay seguimientos en esta sección.
          </div>
        ) : (
          <div className="space-y-4">
            {visibleFollowups.map((followup) => {
              const isExpired =
                followup.followup_status === "pendiente" &&
                followup.followup_date < todayISO();
              const currentWhatsAppMessage =
                editableMessages[followup.id] ??
                buildFollowupWhatsAppMessage(followup);
              const whatsappUrl = currentWhatsAppMessage.trim()
                ? buildWhatsAppUrl(
                    followup.clients?.phone,
                    currentWhatsAppMessage
                  )
                : "";
              const canOpenWhatsApp = Boolean(whatsappUrl);
              const whatsappUnavailableMessage = !currentWhatsAppMessage.trim()
                ? "Escribe un mensaje antes de abrir WhatsApp."
                : "Esta clienta no tiene un número de WhatsApp válido registrado.";

              return (
                <div
                  key={followup.id}
                  className={`rounded-2xl border p-5 ${
                    isExpired
                      ? "border-red-200 bg-red-50"
                      : "border-[#dde3e6] bg-[#fdfefe]"
                  }`}
                >
                  <div className="flex flex-col justify-between gap-4 lg:flex-row">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                        {followup.followup_type || "reagendar"}
                      </p>

                      <h3 className="mt-2 text-xl font-light">
                        {followup.clients?.full_name || "Clienta"}
                      </h3>

                      <p className="mt-2 text-sm text-[#68777c]">
                        Seguimiento: {followup.followup_date}
                      </p>

                      <p className="text-sm text-[#68777c]">
                        Servicio: {followup.services?.name || "Servicio"}
                      </p>

                      <p className="text-sm text-[#68777c]">
                        Técnica: {followup.staff?.full_name || "Sin técnica"}
                      </p>

                      {followup.appointments?.appointment_date && (
                        <p className="text-sm text-[#68777c]">
                          Cita original: {followup.appointments.appointment_date}
                        </p>
                      )}

                      <label className="mt-4 block text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                        Mensaje para WhatsApp
                      </label>

                      <textarea
                        value={currentWhatsAppMessage}
                        onChange={(event) =>
                          updateEditableMessage(followup.id, event.target.value)
                        }
                        rows={5}
                        className="mt-2 w-full rounded-2xl border border-[#dde3e6] bg-white/80 px-4 py-3 text-sm leading-6 text-[#263238] outline-none transition focus:border-[#bd7b83] focus:ring-2 focus:ring-[#f2d6db]"
                      />

                      {followup.notes && (
                        <p className="mt-3 text-sm text-[#68777c]">
                          Notas: {followup.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex min-w-52 flex-col gap-2">
                      {canOpenWhatsApp ? (
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setMessage("")}
                          className="inline-flex cursor-pointer items-center justify-center rounded-full bg-[#25D366] px-5 py-3 text-sm text-white transition hover:opacity-90"
                        >
                          Enviar WhatsApp
                        </a>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled
                            className="rounded-full bg-[#25D366]/40 px-5 py-3 text-sm text-white disabled:cursor-not-allowed"
                          >
                            Enviar WhatsApp
                          </button>
                          <p className="text-xs leading-5 text-[#68777c]">
                            {whatsappUnavailableMessage}
                          </p>
                        </>
                      )}

                      {followup.followup_status !== "enviado" && (
                        <button
                          type="button"
                          onClick={() => markAsSent(followup)}
                          className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                        >
                          Marcar como enviado
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
