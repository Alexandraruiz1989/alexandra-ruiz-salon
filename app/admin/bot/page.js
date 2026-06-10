"use client";

import { useEffect, useState } from "react";
import AdminShell from "../components/AdminShell";
import { supabase } from "../../lib/supabaseClient";

const menuItems = [
  { key: "configuracion", label: "Configuración" },
  { key: "menu", label: "Menú del bot" },
  { key: "faqs", label: "Preguntas frecuentes" },
  { key: "solicitudes", label: "Solicitudes de cita" },
  { key: "conversaciones", label: "Conversaciones" },
];

function Card({ children }) {
  return <div className="rounded-[1.5rem] bg-white p-6 shadow-sm">{children}</div>;
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

function getToastStyle(message) {
  const text = String(message || "").toLowerCase();

  if (
    text.includes("no se pudo") ||
    text.includes("error") ||
    text.includes("obligatorio")
  ) {
    return "bg-red-600 text-white";
  }

  return "bg-green-600 text-white";
}

export default function BotPage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [activeSection, setActiveSection] = useState("configuracion");

  const [settings, setSettings] = useState(null);
  const [settingsForm, setSettingsForm] = useState({
    bot_name: "",
    welcome_message: "",
    fallback_message: "",
    human_help_message: "",
    appointment_deposit_message: "",
    active: true,
  });

  const [menuOptions, setMenuOptions] = useState([]);
  const [faqs, setFaqs] = useState([]);
  const [appointmentRequests, setAppointmentRequests] = useState([]);
  const [conversations, setConversations] = useState([]);

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

    const [
      settingsResult,
      menuResult,
      faqsResult,
      requestsResult,
      conversationsResult,
    ] = await Promise.all([
      supabase.from("bot_settings").select("*").limit(1).maybeSingle(),
      supabase
        .from("bot_menu_options")
        .select("*")
        .order("option_order", { ascending: true }),
      supabase
        .from("bot_faqs")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("bot_appointment_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("bot_conversations")
        .select("*")
        .order("last_message_at", { ascending: false })
        .limit(50),
    ]);

    if (settingsResult.error) {
      setMessage(`No se pudo cargar configuración: ${settingsResult.error.message}`);
    } else if (settingsResult.data) {
      setSettings(settingsResult.data);
      setSettingsForm({
        bot_name: settingsResult.data.bot_name || "",
        welcome_message: settingsResult.data.welcome_message || "",
        fallback_message: settingsResult.data.fallback_message || "",
        human_help_message: settingsResult.data.human_help_message || "",
        appointment_deposit_message:
          settingsResult.data.appointment_deposit_message || "",
        active: settingsResult.data.active !== false,
      });
    }

    if (menuResult.error) {
      setMessage(`No se pudo cargar menú: ${menuResult.error.message}`);
    } else {
      setMenuOptions(menuResult.data || []);
    }

    if (faqsResult.error) {
      setMessage(`No se pudieron cargar FAQs: ${faqsResult.error.message}`);
    } else {
      setFaqs(faqsResult.data || []);
    }

    if (requestsResult.error) {
      setMessage(`No se pudieron cargar solicitudes: ${requestsResult.error.message}`);
    } else {
      setAppointmentRequests(requestsResult.data || []);
    }

    if (conversationsResult.error) {
      setMessage(
        `No se pudieron cargar conversaciones: ${conversationsResult.error.message}`
      );
    } else {
      setConversations(conversationsResult.data || []);
    }

    setLoadingData(false);
  };

  const handleSettingsChange = (field, value) => {
    setSettingsForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveSettings = async () => {
    setSaving(true);
    setMessage("");

    if (!settingsForm.welcome_message.trim()) {
      setMessage("El mensaje de bienvenida es obligatorio.");
      setSaving(false);
      return;
    }

    const payload = {
      bot_name: settingsForm.bot_name.trim() || "Asistente Alexandra Ruiz",
      welcome_message: settingsForm.welcome_message.trim(),
      fallback_message: settingsForm.fallback_message.trim(),
      human_help_message: settingsForm.human_help_message.trim(),
      appointment_deposit_message:
        settingsForm.appointment_deposit_message.trim(),
      active: settingsForm.active,
      updated_at: new Date().toISOString(),
    };

    const query = settings?.id
      ? supabase.from("bot_settings").update(payload).eq("id", settings.id)
      : supabase.from("bot_settings").insert([payload]);

    const { error } = await query;

    if (error) {
      setMessage(`No se pudo guardar configuración: ${error.message}`);
      setSaving(false);
      return;
    }

    setMessage("Configuración del bot guardada correctamente ✨");
    setSaving(false);
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
      title="Bot / WhatsApp"
      subtitle="Configura el asistente virtual del salón."
      activeModule="bot"
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

      {activeSection === "configuracion" && (
        <Card>
          <SectionHeader
            eyebrow="Configuración"
            title="Mensajes principales del bot"
            description="Estos textos serán usados cuando conectemos WhatsApp API."
          />

          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm text-[#68777c]">
                Nombre del bot
              </label>
              <input
                value={settingsForm.bot_name}
                onChange={(event) =>
                  handleSettingsChange("bot_name", event.target.value)
                }
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              />
            </div>

            <TextAreaField
              label="Mensaje de bienvenida"
              value={settingsForm.welcome_message}
              onChange={(value) => handleSettingsChange("welcome_message", value)}
            />

            <TextAreaField
              label="Mensaje cuando no entiende"
              value={settingsForm.fallback_message}
              onChange={(value) => handleSettingsChange("fallback_message", value)}
            />

            <TextAreaField
              label="Mensaje para hablar con humano"
              value={settingsForm.human_help_message}
              onChange={(value) =>
                handleSettingsChange("human_help_message", value)
              }
            />

            <TextAreaField
              label="Mensaje de anticipo / comprobante"
              value={settingsForm.appointment_deposit_message}
              onChange={(value) =>
                handleSettingsChange("appointment_deposit_message", value)
              }
            />

            <label className="flex items-center gap-3 rounded-2xl bg-[#f7f9fa] px-4 py-3 text-sm text-[#68777c]">
              <input
                type="checkbox"
                checked={settingsForm.active}
                onChange={(event) =>
                  handleSettingsChange("active", event.target.checked)
                }
              />
              Bot activo
            </label>

            <button
              type="button"
              disabled={saving}
              onClick={saveSettings}
              className="rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar configuración"}
            </button>
          </div>
        </Card>
      )}

      {activeSection === "menu" && (
        <Card>
          <SectionHeader
            eyebrow="Menú"
            title="Opciones actuales del bot"
            description="Opciones configuradas en la base de datos."
          />

          {loadingData ? (
            <p className="text-sm text-[#68777c]">Cargando menú...</p>
          ) : menuOptions.length === 0 ? (
            <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
              Aún no hay opciones del menú.
            </div>
          ) : (
            <div className="space-y-3">
              {menuOptions.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-4"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                    {item.option_order} · {item.option_key}
                  </p>
                  <h4 className="mt-2 text-lg font-light">
                    {item.option_label}
                  </h4>
                  {item.response_message && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-[#68777c]">
                      {item.response_message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeSection === "faqs" && (
        <Card>
          <SectionHeader
            eyebrow="FAQs"
            title="Preguntas frecuentes"
            description="Preguntas que el bot podrá responder automáticamente."
          />

          {faqs.length === 0 ? (
            <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
              Aún no hay preguntas frecuentes.
            </div>
          ) : (
            <div className="space-y-3">
              {faqs.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-4"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                    {item.active ? "Activa" : "Inactiva"}
                  </p>
                  <h4 className="mt-2 text-lg font-light">{item.question}</h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[#68777c]">
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeSection === "solicitudes" && (
        <Card>
          <SectionHeader
            eyebrow="Solicitudes"
            title="Solicitudes de cita recibidas"
            description="Aquí aparecerán las solicitudes antes de convertirlas en cita."
          />

          {appointmentRequests.length === 0 ? (
            <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
              Aún no hay solicitudes de cita del bot.
            </div>
          ) : (
            <div className="space-y-3">
              {appointmentRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-4"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                    {request.status}
                  </p>
                  <h4 className="mt-2 text-lg font-light">
                    {request.client_name || "Cliente sin nombre"}
                  </h4>
                  <p className="mt-2 text-sm text-[#68777c]">
                    Servicio: {request.requested_service || "-"}
                  </p>
                  <p className="text-sm text-[#68777c]">
                    Fecha/hora: {request.requested_date || "-"} ·{" "}
                    {request.requested_time || "-"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeSection === "conversaciones" && (
        <Card>
          <SectionHeader
            eyebrow="Conversaciones"
            title="Conversaciones del bot"
            description="Historial general de contactos recibidos por WhatsApp."
          />

          {conversations.length === 0 ? (
            <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
              Aún no hay conversaciones del bot.
            </div>
          ) : (
            <div className="space-y-3">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-4"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                    {conversation.status} · {conversation.current_step}
                  </p>
                  <h4 className="mt-2 text-lg font-light">
                    {conversation.client_name || conversation.client_phone}
                  </h4>
                  {conversation.last_message && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-[#68777c]">
                      {conversation.last_message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </AdminShell>
  );
}

function TextAreaField({ label, value, onChange }) {
  return (
    <div>
      <label className="mb-2 block text-sm text-[#68777c]">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-28 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
      />
    </div>
  );
}