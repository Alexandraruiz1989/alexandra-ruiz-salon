"use client";

import { useEffect, useRef, useState } from "react";
import AdminShell from "../components/AdminShell";
import { supabase } from "../../lib/supabaseClient";

const menuItems = [
  { key: "configuracion", label: "Configuración" },
  { key: "conocimiento", label: "Base de conocimiento" },
  { key: "menu", label: "Menú del bot" },
  { key: "faqs", label: "Preguntas frecuentes" },
  { key: "probar", label: "Probar bot" },
  { key: "solicitudes", label: "Solicitudes de cita" },
  { key: "conversaciones", label: "Conversaciones" },
];

const emptyKnowledgeForm = {
  title: "",
  category: "General",
  content: "",
  keywords: "",
  active: true,
};

const emptyMenuForm = {
  option_order: 1,
  option_key: "",
  option_label: "",
  response_message: "",
  active: true,
};

const emptyFaqForm = {
  question: "",
  answer: "",
  keywords: "",
  active: true,
};

function Card({ children }) {
  return (
    <div className="rounded-[1.5rem] bg-white p-6 shadow-sm">
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

  const [knowledgeItems, setKnowledgeItems] = useState([]);
  const [knowledgeForm, setKnowledgeForm] = useState(emptyKnowledgeForm);
  const [editingKnowledgeId, setEditingKnowledgeId] = useState(null);

  const [menuOptions, setMenuOptions] = useState([]);
  const [menuForm, setMenuForm] = useState(emptyMenuForm);
  const [editingMenuId, setEditingMenuId] = useState(null);

  const [faqs, setFaqs] = useState([]);
  const [faqForm, setFaqForm] = useState(emptyFaqForm);
  const [editingFaqId, setEditingFaqId] = useState(null);

  const [appointmentRequests, setAppointmentRequests] = useState([]);
  const [conversations, setConversations] = useState([]);

  const [testClientName, setTestClientName] = useState("Ana López");
  const [testClientPhone, setTestClientPhone] = useState("9991112233");
  const [testMessage, setTestMessage] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testChatMessages, setTestChatMessages] = useState([]);
  const testChatScrollRef = useRef(null);

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
    if (!message) return;

    const timer = setTimeout(() => {
      setMessage("");
    }, 15000);

    return () => clearTimeout(timer);
  }, [message]);

 useEffect(() => {
  if (!testChatScrollRef.current) return;

  testChatScrollRef.current.scrollTo({
    top: testChatScrollRef.current.scrollHeight,
    behavior: "smooth",
  });
}, [testChatMessages, testLoading]);

  const loadData = async () => {
    setLoadingData(true);
    setMessage("");

    const [
      settingsResult,
      knowledgeResult,
      menuResult,
      faqsResult,
      requestsResult,
      conversationsResult,
    ] = await Promise.all([
      supabase.from("bot_settings").select("*").limit(1).maybeSingle(),
      supabase
        .from("bot_knowledge_base")
        .select("*")
        .order("category", { ascending: true })
        .order("title", { ascending: true }),
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

    if (knowledgeResult.error) {
      setMessage(
        `No se pudo cargar base de conocimiento: ${knowledgeResult.error.message}`
      );
    } else {
      setKnowledgeItems(knowledgeResult.data || []);
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

  const resetKnowledgeForm = () => {
    setKnowledgeForm(emptyKnowledgeForm);
    setEditingKnowledgeId(null);
  };

  const handleKnowledgeChange = (field, value) => {
    setKnowledgeForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const editKnowledge = (item) => {
    setEditingKnowledgeId(item.id);
    setKnowledgeForm({
      title: item.title || "",
      category: item.category || "General",
      content: item.content || "",
      keywords: item.keywords || "",
      active: item.active !== false,
    });
    setMessage("");
  };

  const saveKnowledge = async () => {
    setSaving(true);
    setMessage("");

    if (!knowledgeForm.title.trim() || !knowledgeForm.content.trim()) {
      setMessage("El título y el contenido son obligatorios.");
      setSaving(false);
      return;
    }

    const payload = {
      title: knowledgeForm.title.trim(),
      category: knowledgeForm.category.trim() || "General",
      content: knowledgeForm.content.trim(),
      keywords: knowledgeForm.keywords.trim() || null,
      active: knowledgeForm.active,
      updated_at: new Date().toISOString(),
    };

    const query = editingKnowledgeId
      ? supabase
          .from("bot_knowledge_base")
          .update(payload)
          .eq("id", editingKnowledgeId)
      : supabase.from("bot_knowledge_base").insert([payload]);

    const { error } = await query;

    if (error) {
      setMessage(`No se pudo guardar conocimiento: ${error.message}`);
      setSaving(false);
      return;
    }

    setMessage("Base de conocimiento guardada correctamente ✨");
    resetKnowledgeForm();
    setSaving(false);
    await loadData();
  };

  const toggleKnowledgeStatus = async (item) => {
    setMessage("");

    const { error } = await supabase
      .from("bot_knowledge_base")
      .update({
        active: !item.active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      setMessage(`No se pudo cambiar el estado: ${error.message}`);
      return;
    }

    setMessage(item.active ? "Información desactivada." : "Información activada ✨");
    await loadData();
  };

  const resetMenuForm = () => {
    setMenuForm(emptyMenuForm);
    setEditingMenuId(null);
  };

  const handleMenuChange = (field, value) => {
    setMenuForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const editMenuOption = (item) => {
    setEditingMenuId(item.id);
    setMenuForm({
      option_order: item.option_order || 1,
      option_key: item.option_key || "",
      option_label: item.option_label || "",
      response_message: item.response_message || "",
      active: item.active !== false,
    });
    setMessage("");
  };

  const saveMenuOption = async () => {
    setSaving(true);
    setMessage("");

    if (!menuForm.option_key.trim() || !menuForm.option_label.trim()) {
      setMessage("La clave interna y el texto de la opción son obligatorios.");
      setSaving(false);
      return;
    }

    const payload = {
      option_order: Number(menuForm.option_order || 1),
      option_key: menuForm.option_key.trim(),
      option_label: menuForm.option_label.trim(),
      response_message: menuForm.response_message.trim() || null,
      active: menuForm.active,
      updated_at: new Date().toISOString(),
    };

    const query = editingMenuId
      ? supabase
          .from("bot_menu_options")
          .update(payload)
          .eq("id", editingMenuId)
      : supabase.from("bot_menu_options").insert([payload]);

    const { error } = await query;

    if (error) {
      setMessage(`No se pudo guardar opción del menú: ${error.message}`);
      setSaving(false);
      return;
    }

    setMessage("Opción del menú guardada correctamente ✨");
    resetMenuForm();
    setSaving(false);
    await loadData();
  };

  const toggleMenuStatus = async (item) => {
    setMessage("");

    const { error } = await supabase
      .from("bot_menu_options")
      .update({
        active: !item.active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      setMessage(`No se pudo cambiar el estado: ${error.message}`);
      return;
    }

    setMessage(item.active ? "Opción desactivada." : "Opción activada ✨");
    await loadData();
  };

  const resetFaqForm = () => {
    setFaqForm(emptyFaqForm);
    setEditingFaqId(null);
  };

  const handleFaqChange = (field, value) => {
    setFaqForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const editFaq = (item) => {
    setEditingFaqId(item.id);
    setFaqForm({
      question: item.question || "",
      answer: item.answer || "",
      keywords: item.keywords || "",
      active: item.active !== false,
    });
    setMessage("");
  };

  const saveFaq = async () => {
    setSaving(true);
    setMessage("");

    if (!faqForm.question.trim() || !faqForm.answer.trim()) {
      setMessage("La pregunta y la respuesta son obligatorias.");
      setSaving(false);
      return;
    }

    const payload = {
      question: faqForm.question.trim(),
      answer: faqForm.answer.trim(),
      keywords: faqForm.keywords.trim() || null,
      active: faqForm.active,
      updated_at: new Date().toISOString(),
    };

    const query = editingFaqId
      ? supabase.from("bot_faqs").update(payload).eq("id", editingFaqId)
      : supabase.from("bot_faqs").insert([payload]);

    const { error } = await query;

    if (error) {
      setMessage(`No se pudo guardar pregunta frecuente: ${error.message}`);
      setSaving(false);
      return;
    }

    setMessage("Pregunta frecuente guardada correctamente ✨");
    resetFaqForm();
    setSaving(false);
    await loadData();
  };

  const toggleFaqStatus = async (item) => {
    setMessage("");

    const { error } = await supabase
      .from("bot_faqs")
      .update({
        active: !item.active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      setMessage(`No se pudo cambiar el estado: ${error.message}`);
      return;
    }

    setMessage(item.active ? "Pregunta desactivada." : "Pregunta activada ✨");
    await loadData();
  };

  const testBot = async () => {
    setMessage("");
    setTestResult(null);

    const cleanMessage = testMessage.trim();

    if (!cleanMessage) {
      setMessage("Escribe un mensaje para probar el bot.");
      return;
    }

    const userBubble = {
      id: `user-${Date.now()}`,
      direction: "user",
      body: cleanMessage,
      created_at: new Date().toISOString(),
    };

    setTestChatMessages((current) => [...current, userBubble]);
    setTestMessage("");
    setTestLoading(true);

    try {
      const response = await fetch("/api/bot/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: cleanMessage,
          clientName: testClientName.trim(),
          clientPhone: testClientPhone.trim() || "test",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorBubble = {
          id: `bot-error-${Date.now()}`,
          direction: "bot",
          body: data.error || "No se pudo probar el bot.",
          created_at: new Date().toISOString(),
          isError: true,
        };

        setTestChatMessages((current) => [...current, errorBubble]);
        setMessage(data.error || "No se pudo probar el bot.");
        setTestLoading(false);
        return;
      }

      const botBubble = {
        id: `bot-${Date.now()}`,
        direction: "bot",
        body: data.reply,
        created_at: new Date().toISOString(),
        intent: data.intent,
        matchedSource: data.matchedSource,
      };

      setTestResult(data);
      setTestChatMessages((current) => [...current, botBubble]);
      setTestLoading(false);
      await loadData();
    } catch (error) {
      const errorBubble = {
        id: `bot-error-${Date.now()}`,
        direction: "bot",
        body: error.message || "Error al probar el bot.",
        created_at: new Date().toISOString(),
        isError: true,
      };

      setTestChatMessages((current) => [...current, errorBubble]);
      setMessage(error.message || "Error al probar el bot.");
      setTestLoading(false);
    }
  };

  const resetTestChat = () => {
    setTestMessage("");
    setTestResult(null);
    setTestChatMessages([]);
  };

  const updateRequestStatus = async (requestId, status) => {
    setMessage("");

    const { error } = await supabase
      .from("bot_appointment_requests")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (error) {
      setMessage(`No se pudo actualizar solicitud: ${error.message}`);
      return;
    }

    setMessage("Solicitud actualizada correctamente ✨");
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

          <div className="space-y-5">
            <InputField
              label="Nombre del bot"
              value={settingsForm.bot_name}
              onChange={(value) => handleSettingsChange("bot_name", value)}
            />

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

            <CheckField
              label="Bot activo"
              checked={settingsForm.active}
              onChange={(value) => handleSettingsChange("active", value)}
            />

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

      {activeSection === "conocimiento" && (
        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <Card>
            <SectionHeader
              eyebrow={editingKnowledgeId ? "Editar" : "Nueva información"}
              title={
                editingKnowledgeId
                  ? "Editar base de conocimiento"
                  : "Agregar información al bot"
              }
              description="Aquí puedes escribir información general para que el bot la use al responder."
            />

            <div className="space-y-4">
              <InputField
                label="Título *"
                value={knowledgeForm.title}
                onChange={(value) => handleKnowledgeChange("title", value)}
                placeholder="Ej. Política de anticipos"
              />

              <InputField
                label="Categoría"
                value={knowledgeForm.category}
                onChange={(value) => handleKnowledgeChange("category", value)}
                placeholder="General, Servicios, Políticas, Promociones..."
              />

              <TextAreaField
                label="Contenido *"
                value={knowledgeForm.content}
                onChange={(value) => handleKnowledgeChange("content", value)}
                placeholder="Escribe aquí toda la información que quieres que el bot sepa sobre este tema..."
              />

              <InputField
                label="Palabras clave"
                value={knowledgeForm.keywords}
                onChange={(value) => handleKnowledgeChange("keywords", value)}
                placeholder="anticipo, pago, cita, comprobante..."
              />

              <CheckField
                label="Información activa"
                checked={knowledgeForm.active}
                onChange={(value) => handleKnowledgeChange("active", value)}
              />

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveKnowledge}
                  className="flex-1 rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Guardar información"}
                </button>

                {editingKnowledgeId && (
                  <button
                    type="button"
                    onClick={resetKnowledgeForm}
                    className="rounded-full border border-[#bd7b83] px-6 py-4 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                  >
                    Cancelar edición
                  </button>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <SectionHeader
              eyebrow="Información guardada"
              title="Base de conocimiento"
              description="Esta información alimentará las respuestas inteligentes del bot."
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

            {knowledgeItems.length === 0 ? (
              <EmptyState text="Aún no hay información en la base de conocimiento." />
            ) : (
              <div className="space-y-4">
                {knowledgeItems.map((item) => (
                  <InfoCard
                    key={item.id}
                    eyebrow={`${item.category || "General"} · ${
                      item.active ? "Activa" : "Inactiva"
                    }`}
                    title={item.title}
                    content={item.content}
                    keywords={item.keywords}
                    onEdit={() => editKnowledge(item)}
                    onToggle={() => toggleKnowledgeStatus(item)}
                    active={item.active}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {activeSection === "menu" && (
        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <Card>
            <SectionHeader
              eyebrow={editingMenuId ? "Editar opción" : "Nueva opción"}
              title={
                editingMenuId
                  ? "Editar opción del menú"
                  : "Agregar opción al menú"
              }
              description="Estas son las opciones principales que verá la clienta en WhatsApp."
            />

            <div className="space-y-4">
              <InputField
                label="Orden"
                type="number"
                value={menuForm.option_order}
                onChange={(value) => handleMenuChange("option_order", value)}
              />

              <InputField
                label="Clave interna *"
                value={menuForm.option_key}
                onChange={(value) => handleMenuChange("option_key", value)}
                placeholder="agendar, servicios, promociones..."
              />

              <InputField
                label="Texto de la opción *"
                value={menuForm.option_label}
                onChange={(value) => handleMenuChange("option_label", value)}
                placeholder="Agendar cita"
              />

              <TextAreaField
                label="Respuesta automática"
                value={menuForm.response_message}
                onChange={(value) => handleMenuChange("response_message", value)}
                placeholder="Mensaje que responderá el bot al elegir esta opción..."
              />

              <CheckField
                label="Opción activa"
                checked={menuForm.active}
                onChange={(value) => handleMenuChange("active", value)}
              />

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveMenuOption}
                  className="flex-1 rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Guardar opción"}
                </button>

                {editingMenuId && (
                  <button
                    type="button"
                    onClick={resetMenuForm}
                    className="rounded-full border border-[#bd7b83] px-6 py-4 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                  >
                    Cancelar edición
                  </button>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <SectionHeader
              eyebrow="Menú"
              title="Opciones actuales del bot"
              description="Puedes editar, activar o desactivar opciones."
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

            {menuOptions.length === 0 ? (
              <EmptyState text="Aún no hay opciones del menú." />
            ) : (
              <div className="space-y-4">
                {menuOptions.map((item) => (
                  <InfoCard
                    key={item.id}
                    eyebrow={`${item.option_order} · ${item.option_key} · ${
                      item.active ? "Activa" : "Inactiva"
                    }`}
                    title={item.option_label}
                    content={item.response_message || "Sin respuesta configurada."}
                    onEdit={() => editMenuOption(item)}
                    onToggle={() => toggleMenuStatus(item)}
                    active={item.active}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {activeSection === "faqs" && (
        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <Card>
            <SectionHeader
              eyebrow={editingFaqId ? "Editar pregunta" : "Nueva pregunta"}
              title={
                editingFaqId
                  ? "Editar pregunta frecuente"
                  : "Agregar pregunta frecuente"
              }
              description="Estas respuestas serán usadas por el bot cuando detecte preguntas comunes."
            />

            <div className="space-y-4">
              <TextAreaField
                label="Pregunta *"
                value={faqForm.question}
                onChange={(value) => handleFaqChange("question", value)}
                placeholder="Ej. ¿Dónde están ubicadas?"
              />

              <TextAreaField
                label="Respuesta *"
                value={faqForm.answer}
                onChange={(value) => handleFaqChange("answer", value)}
                placeholder="Respuesta que dará el bot..."
              />

              <InputField
                label="Palabras clave"
                value={faqForm.keywords}
                onChange={(value) => handleFaqChange("keywords", value)}
                placeholder="ubicación, dirección, maps..."
              />

              <CheckField
                label="Pregunta activa"
                checked={faqForm.active}
                onChange={(value) => handleFaqChange("active", value)}
              />

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveFaq}
                  className="flex-1 rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Guardar pregunta"}
                </button>

                {editingFaqId && (
                  <button
                    type="button"
                    onClick={resetFaqForm}
                    className="rounded-full border border-[#bd7b83] px-6 py-4 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                  >
                    Cancelar edición
                  </button>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <SectionHeader
              eyebrow="FAQs"
              title="Preguntas frecuentes"
              description="Puedes editar, activar o desactivar preguntas."
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

            {faqs.length === 0 ? (
              <EmptyState text="Aún no hay preguntas frecuentes." />
            ) : (
              <div className="space-y-4">
                {faqs.map((item) => (
                  <InfoCard
                    key={item.id}
                    eyebrow={item.active ? "Activa" : "Inactiva"}
                    title={item.question}
                    content={item.answer}
                    keywords={item.keywords}
                    onEdit={() => editFaq(item)}
                    onToggle={() => toggleFaqStatus(item)}
                    active={item.active}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {activeSection === "probar" && (
        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <SectionHeader
              eyebrow="Prueba interna"
              title="Datos de prueba"
              description="Esto no envía WhatsApp real. Solo simula la conversación con el bot."
            />

            <div className="space-y-4">
              <InputField
                label="Nombre de prueba"
                value={testClientName}
                onChange={setTestClientName}
                placeholder="Ana López"
              />

              <InputField
                label="WhatsApp de prueba"
                value={testClientPhone}
                onChange={setTestClientPhone}
                placeholder="9991112233"
              />

              <button
                type="button"
                onClick={resetTestChat}
                className="w-full rounded-full border border-[#bd7b83] px-6 py-4 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
              >
                Reiniciar conversación
              </button>

              {testResult && (
                <div className="rounded-2xl bg-[#f7f9fa] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                    Última detección
                  </p>

                  <div className="mt-3 grid gap-3">
                    <div>
                      <p className="text-xs text-[#8a969a]">Intención</p>
                      <p className="text-sm text-[#263238]">
                        {testResult.intent || "-"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-[#8a969a]">Fuente</p>
                      <p className="text-sm text-[#263238]">
                        {testResult.matchedSource || "-"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <SectionHeader
              eyebrow="Simulador"
              title="Conversación tipo WhatsApp"
              description="Escribe mensajes seguidos para probar cómo contestaría el bot."
            />

            <div className="overflow-hidden rounded-[1.5rem] border border-[#dde3e6] bg-[#f7f9fa]">
              <div className="flex h-[520px] flex-col">
               <div ref={testChatScrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
                  {testChatMessages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-center">
                      <div>
                        <p className="text-sm text-[#68777c]">
                          Aún no hay mensajes en esta prueba.
                        </p>
                        <p className="mt-1 text-xs text-[#8a969a]">
                          Prueba con: “Hola”, “Quiero agendar” o “¿Dónde están ubicadas?”
                        </p>
                      </div>
                    </div>
                  ) : (
                    testChatMessages.map((item) => (
                      <div
                        key={item.id}
                        className={`flex ${
                          item.direction === "user"
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                            item.direction === "user"
                              ? "bg-[#bd7b83] text-white"
                              : item.isError
                              ? "bg-red-600 text-white"
                              : "bg-white text-[#263238]"
                          }`}
                        >
                          <p className="whitespace-pre-wrap leading-6">
                            {item.body}
                          </p>

                          {item.direction === "bot" && !item.isError && (
                            <p className="mt-2 text-[11px] opacity-70">
                              {item.intent || "sin intención"} ·{" "}
                              {item.matchedSource || "sin fuente"}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}

                  {testLoading && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl bg-white px-4 py-3 text-sm text-[#68777c] shadow-sm">
                        Escribiendo...
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-[#dde3e6] bg-white p-3">
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!testLoading) {
                        testBot();
                      }
                    }}
                  >
                    <input
                      value={testMessage}
                      onChange={(event) => setTestMessage(event.target.value)}
                      className="flex-1 rounded-full border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 text-sm outline-none"
                      placeholder="Escribe un mensaje..."
                      disabled={testLoading}
                    />

                    <button
                      type="submit"
                      disabled={testLoading || !testMessage.trim()}
                      className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90 disabled:opacity-60"
                    >
                      Enviar
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeSection === "solicitudes" && (
        <Card>
          <SectionHeader
            eyebrow="Solicitudes"
            title="Solicitudes de cita recibidas"
            description="Aquí aparecerán las solicitudes antes de convertirlas en cita."
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

          {appointmentRequests.length === 0 ? (
            <EmptyState text="Aún no hay solicitudes de cita del bot." />
          ) : (
            <div className="space-y-4">
              {appointmentRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5"
                >
                  <div className="flex flex-col justify-between gap-4 md:flex-row">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                        {request.status}
                      </p>
                      <h4 className="mt-2 text-xl font-light">
                        {request.client_name || "Cliente sin nombre"}
                      </h4>
                      <p className="mt-2 text-sm text-[#68777c]">
                        WhatsApp: {request.client_phone || "-"}
                      </p>
                      <p className="text-sm text-[#68777c]">
                        Servicio: {request.requested_service || "-"}
                      </p>
                      <p className="text-sm text-[#68777c]">
                        Fecha/hora: {request.requested_date || "-"} ·{" "}
                        {request.requested_time || "-"}
                      </p>
                      {request.notes && (
                        <p className="mt-3 rounded-xl bg-[#f7f9fa] p-3 text-sm text-[#68777c]">
                          {request.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateRequestStatus(request.id, "en_revision")
                        }
                        className="rounded-full border border-[#bd7b83] px-5 py-2 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                      >
                        En revisión
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          updateRequestStatus(request.id, "convertida")
                        }
                        className="rounded-full bg-green-600 px-5 py-2 text-sm text-white transition hover:opacity-90"
                      >
                        Marcar convertida
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          updateRequestStatus(request.id, "cancelada")
                        }
                        className="rounded-full border border-red-500 px-5 py-2 text-sm text-red-600 transition hover:bg-red-600 hover:text-white"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
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

          {conversations.length === 0 ? (
            <EmptyState text="Aún no hay conversaciones del bot." />
          ) : (
            <div className="space-y-4">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                    {conversation.status} · {conversation.current_step}
                  </p>
                  <h4 className="mt-2 text-xl font-light">
                    {conversation.client_name || conversation.client_phone}
                  </h4>
                  <p className="mt-2 text-sm text-[#68777c]">
                    WhatsApp: {conversation.client_phone}
                  </p>
                  {conversation.last_message && (
                    <p className="mt-3 whitespace-pre-wrap rounded-xl bg-[#f7f9fa] p-3 text-sm text-[#68777c]">
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

function InputField({ label, value, onChange, placeholder = "", type = "text" }) {
  return (
    <div>
      <label className="mb-2 block text-sm text-[#68777c]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
        placeholder={placeholder}
      />
    </div>
  );
}

function TextAreaField({ label, value, onChange, placeholder = "" }) {
  return (
    <div>
      <label className="mb-2 block text-sm text-[#68777c]">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-28 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
        placeholder={placeholder}
      />
    </div>
  );
}

function CheckField({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 rounded-2xl bg-[#f7f9fa] px-4 py-3 text-sm text-[#68777c]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function EmptyState({ text }) {
  return (
    <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
      {text}
    </div>
  );
}

function InfoCard({
  eyebrow,
  title,
  content,
  keywords,
  onEdit,
  onToggle,
  active,
}) {
  return (
    <div className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
            {eyebrow}
          </p>

          <h4 className="mt-2 text-xl font-light">{title}</h4>

          {content && (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#68777c]">
              {content}
            </p>
          )}

          {keywords && (
            <p className="mt-3 text-xs text-[#8a969a]">
              Palabras clave: {keywords}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full border border-[#bd7b83] px-5 py-2 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
          >
            Editar
          </button>

          <button
            type="button"
            onClick={onToggle}
            className={`rounded-full border px-5 py-2 text-sm transition ${
              active
                ? "border-red-500 text-red-600 hover:bg-red-600 hover:text-white"
                : "border-green-600 text-green-700 hover:bg-green-600 hover:text-white"
            }`}
          >
            {active ? "Desactivar" : "Activar"}
          </button>
        </div>
      </div>
    </div>
  );
}
