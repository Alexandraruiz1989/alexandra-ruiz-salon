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

const quickReplies = [
  {
    label: "Ubicación",
    text: "Claro 💕 Nos encontramos en calle 44 #491, Los Pinos, cerca de Macroplaza.\n\nTe comparto nuestra ubicación para que puedas orientarte mejor:\nhttps://www.google.com/maps/search/?api=1&query=Alexandra%20Ruiz%20Salon%20Calle%2044%20491%20Los%20Pinos%20Merida",
  },
  {
    label: "Horarios",
    text: "Nuestro horario de atención es:\n\nMartes a viernes: 9:00 am a 9:00 pm\nSábado: 9:00 am a 6:00 pm\nDomingo: 9:00 am a 2:00 pm\nLunes: cerrado",
  },
  {
    label: "Solicitar anticipo",
    text: "Para confirmar tu cita solicitamos anticipo de $100 por servicio. Ese anticipo se descuenta del total a pagar el día de tu cita 💕",
  },
  {
    label: "Confirmar disponibilidad",
    text: "Claro 💕 Permíteme revisar disponibilidad para ese servicio y horario. Enseguida te confirmo las opciones disponibles.",
  },
  {
    label: "Hablar con asesora",
    text: "Claro 💕 Una persona del equipo de Alexandra Ruiz Salón dará seguimiento a tu conversación.",
  },
  {
    label: "Gracias",
    text: "Gracias por escribirnos 💕 Quedamos atentas para ayudarte con tu cita.",
  },
];

function formatDateTime(value) {
  if (!value) return "Sin fecha";

  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch (error) {
    return "Sin fecha";
  }
}

function isConversationAiEnabled(conversation) {
  const status = String(conversation?.status || "").toLowerCase();
  return (
    conversation?.bot_enabled !== false &&
    conversation?.handoff_to_human !== true &&
    status !== "human" &&
    status !== "humano"
  );
}

function getConversationStatusLabel(conversation) {
  if (!isConversationAiEnabled(conversation)) return "Bot apagado";
  if (conversation?.status === "pendiente") return "pendiente";
  if (conversation?.status === "solicitud_cita") return "solicitud de cita";
  if (conversation?.status === "bot" || conversation?.status === "abierta") {
    return "Bot activo";
  }
  return conversation?.status || "Bot activo";
}

function isMissingBotConversationColumns(error) {
  const text = String(error?.message || error || "").toLowerCase();
  return (
    text.includes("schema cache") ||
    text.includes("bot_enabled") ||
    text.includes("handoff_to_human") ||
    text.includes("assigned_to") ||
    text.includes("unread_count") ||
    text.includes("status") ||
    text.includes("last_message_at") ||
    text.includes("updated_at")
  );
}

function getBotConversationErrorMessage(action, error) {
  const detail = error?.message || "Error desconocido.";

  if (isMissingBotConversationColumns(error)) {
    return `Faltan columnas del bot en Supabase. Ejecuta el SQL actualizado del módulo Bot. Detalle: ${detail}`;
  }

  return `${action}: ${detail}`;
}

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
    text.includes("faltan columnas") ||
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
  const [aiStatus, setAiStatus] = useState(null);
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
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [conversationMessages, setConversationMessages] = useState([]);
  const [loadingConversationMessages, setLoadingConversationMessages] =
    useState(false);
  const [manualReply, setManualReply] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const conversationScrollRef = useRef(null);

  const [testClientName, setTestClientName] = useState("Ana López");
  const [testClientPhone, setTestClientPhone] = useState("9991112233");
  const [testMessage, setTestMessage] = useState("");
  const [testLoading, setTestLoading] = useState(false);
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
      await loadAiStatus();
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

  useEffect(() => {
    if (activeSection !== "conversaciones") return;

    if (!selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0].id);
      return;
    }

    if (
      selectedConversationId &&
      conversations.length > 0 &&
      !conversations.some((conversation) => conversation.id === selectedConversationId)
    ) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [activeSection, conversations, selectedConversationId]);

  useEffect(() => {
    if (activeSection !== "conversaciones" || !selectedConversationId) return;

    loadConversationMessages(selectedConversationId);
  }, [activeSection, selectedConversationId]);

  useEffect(() => {
    const selected = conversations.find(
      (conversation) => conversation.id === selectedConversationId
    );

    setAssignedTo(selected?.assigned_to || "");
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    if (!conversationScrollRef.current) return;

    conversationScrollRef.current.scrollTo({
      top: conversationScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [conversationMessages, selectedConversationId]);

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
        getBotConversationErrorMessage(
          "No se pudieron cargar conversaciones",
          conversationsResult.error
        )
      );
    } else {
      setConversations(conversationsResult.data || []);
    }

    setLoadingData(false);
  };

  const loadAiStatus = async () => {
    try {
      const response = await fetch("/api/bot/test", { method: "GET" });
      const data = await response.json();

      if (response.ok) {
        setAiStatus(data);
      }
    } catch (error) {
      setAiStatus({
        aiConfigured: false,
        message:
          "No se pudo validar el estado de IA. El bot seguirá funcionando con reglas básicas.",
      });
    }
  };

  const loadConversationMessages = async (conversationId) => {
    if (!conversationId) return;

    setLoadingConversationMessages(true);

    const { data, error } = await supabase
      .from("bot_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(`No se pudieron cargar mensajes: ${error.message}`);
      setConversationMessages([]);
    } else {
      setConversationMessages(data || []);
    }

    setLoadingConversationMessages(false);
  };

  const updateConversationControl = async (conversation, enabled) => {
    if (!conversation?.id) return;

    setSaving(true);
    setMessage("");

    const payload = {
      bot_enabled: enabled,
      handoff_to_human: !enabled,
      status: enabled ? "bot" : "human",
      unread_count: enabled ? 0 : Number(conversation.unread_count || 0),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("bot_conversations")
      .update(payload)
      .eq("id", conversation.id);

    if (error) {
      setMessage(
        getBotConversationErrorMessage("No se pudo actualizar IA", error)
      );
      setSaving(false);
      return;
    }

    setMessage(
      enabled
        ? "IA activada para esta conversación."
        : "IA apagada para esta conversación."
    );
    setSaving(false);
    await loadData();
    await loadConversationMessages(conversation.id);
  };

  const saveAssignedTo = async (conversation) => {
    if (!conversation?.id) return;

    const { error } = await supabase
      .from("bot_conversations")
      .update({
        assigned_to: assignedTo.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);

    if (error) {
      setMessage(
        getBotConversationErrorMessage("No se pudo guardar responsable", error)
      );
      return;
    }

    setMessage("Responsable actualizado correctamente.");
    await loadData();
  };

  const sendManualReply = async (conversation) => {
    const cleanReply = manualReply.trim();

    if (!conversation?.id) {
      setMessage("Selecciona una conversación.");
      return;
    }

    if (!cleanReply) {
      setMessage("Escribe una respuesta manual.");
      return;
    }

    setSaving(true);
    setMessage("");

    const now = new Date().toISOString();

    const { error: messageError } = await supabase.from("bot_messages").insert([
      {
        conversation_id: conversation.id,
        client_phone: conversation.client_phone,
        direction: "outgoing",
        message_type: "text",
        body: cleanReply,
        raw_payload: {
          source: "admin_manual",
          assigned_to: assignedTo.trim() || null,
        },
      },
    ]);

    if (messageError) {
      setMessage(`No se pudo enviar respuesta manual: ${messageError.message}`);
      setSaving(false);
      return;
    }

    const { error: conversationError } = await supabase
      .from("bot_conversations")
      .update({
        bot_enabled: false,
        handoff_to_human: true,
        assigned_to: assignedTo.trim() || null,
        unread_count: 0,
        status: "human",
        last_message: cleanReply,
        last_message_at: now,
        updated_at: now,
      })
      .eq("id", conversation.id);

    if (conversationError) {
      setMessage(
        getBotConversationErrorMessage(
          "Se guardó el mensaje, pero no se pudo apagar IA",
          conversationError
        )
      );
      setSaving(false);
      await loadConversationMessages(conversation.id);
      return;
    }

    setManualReply("");
    setMessage(
      "Respuesta manual guardada. La IA quedó apagada para esta conversación."
    );
    setSaving(false);
    await loadData();
    await loadConversationMessages(conversation.id);
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

  const deleteKnowledge = async (item) => {
    setMessage("");

    const confirmed = window.confirm(
      `¿Seguro que deseas eliminar "${item.title}" de la base de conocimiento del bot?`
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("bot_knowledge_base")
      .delete()
      .eq("id", item.id);

    if (error) {
      setMessage(`No se pudo eliminar la información: ${error.message}`);
      return;
    }

    setMessage("Información eliminada correctamente.");

    if (editingKnowledgeId === item.id) {
      resetKnowledgeForm();
    }

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

      if (data.botMuted) {
        setMessage(
          "La IA está apagada para esta conversación. El mensaje quedó en la bandeja para seguimiento manual."
        );
        setTestLoading(false);
        await loadData();
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

  const resetTestChat = async () => {
    setTestMessage("");
    setTestChatMessages([]);
    setTestLoading(true);

    try {
      const response = await fetch("/api/bot/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resetConversation: true,
          clientName: testClientName.trim(),
          clientPhone: testClientPhone.trim() || "test",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "No se pudo reiniciar la conversacion.");
        return;
      }

      setMessage("Conversacion de prueba reiniciada correctamente.");
      await loadData();
    } catch (error) {
      setMessage(`No se pudo reiniciar la conversacion: ${error.message}`);
    } finally {
      setTestLoading(false);
    }
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

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId
  );

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
            {aiStatus && (
              <div className="rounded-2xl bg-[#f7f9fa] px-5 py-4 text-sm text-[#68777c]">
                {aiStatus.aiConfigured
                  ? `IA conectada en modo servidor${
                      aiStatus.model ? ` con ${aiStatus.model}` : ""
                    }.`
                  : "IA no conectada. El bot está funcionando con respuestas configuradas y reglas básicas."}
              </div>
            )}

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
                    onDelete={() => deleteKnowledge(item)}
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
                          {item.direction === "bot" &&
                            (item.matchedSource || item.intent) && (
                              <p className="mt-2 border-t border-[#dde3e6] pt-2 text-[11px] text-[#8a969a]">
                                Fuente: {item.matchedSource || "sin fuente"} ·
                                Intent: {item.intent || "sin intent"}
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
            title="Gestor de conversaciones"
            description="Bandeja interna para revisar chats, responder manualmente y prender o apagar la IA por conversación."
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
            <div className="grid h-[calc(100vh-220px)] min-h-[560px] overflow-hidden rounded-[1.5rem] border border-[#dde3e6] bg-[#f7f9fa] xl:grid-cols-[0.85fr_1.6fr]">
              <aside className="h-52 min-h-0 overflow-y-auto border-b border-[#dde3e6] bg-white xl:h-full xl:border-b-0 xl:border-r">
                {conversations.map((conversation) => {
                  const isSelected = conversation.id === selectedConversationId;
                  const aiEnabled = isConversationAiEnabled(conversation);
                  const unreadCount = Number(conversation.unread_count || 0);

                  return (
                    <button
                      type="button"
                      key={conversation.id}
                      onClick={() => setSelectedConversationId(conversation.id)}
                      className={`w-full border-b border-[#edf0f1] px-4 py-4 text-left transition hover:bg-[#f7f9fa] ${
                        isSelected ? "bg-[#f9eef0]" : "bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#263238]">
                            {conversation.client_name ||
                              conversation.client_phone ||
                              "Contacto sin nombre"}
                          </p>
                          <p className="mt-1 text-xs text-[#8a969a]">
                            {conversation.client_phone || "Sin teléfono"}
                          </p>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="text-[11px] text-[#8a969a]">
                            {formatDateTime(
                              conversation.last_message_at ||
                                conversation.updated_at ||
                                conversation.created_at
                            )}
                          </p>
                          {unreadCount > 0 && (
                            <span className="mt-2 inline-flex rounded-full bg-[#bd7b83] px-2 py-0.5 text-[11px] text-white">
                              {unreadCount}
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="mt-3 line-clamp-2 text-sm text-[#68777c]">
                        {conversation.last_message || "Sin mensajes recientes"}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] ${
                            aiEnabled
                              ? "bg-green-50 text-green-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {aiEnabled ? "IA ON · Bot activo" : "IA OFF · Bot apagado"}
                        </span>
                        <span className="rounded-full bg-[#eef1f3] px-3 py-1 text-[11px] text-[#68777c]">
                          {getConversationStatusLabel(conversation)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </aside>

              <section className="flex h-full min-h-0 flex-col bg-[#f7f9fa]">
                {!selectedConversation ? (
                  <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-[#68777c]">
                    Selecciona una conversación para ver el historial.
                  </div>
                ) : (
                  <>
                    <div className="shrink-0 border-b border-[#dde3e6] bg-white p-5">
                      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                            {getConversationStatusLabel(selectedConversation)}
                          </p>
                          <h4 className="mt-2 text-2xl font-light">
                            {selectedConversation.client_name ||
                              selectedConversation.client_phone}
                          </h4>
                          <p className="mt-1 text-sm text-[#68777c]">
                            WhatsApp: {selectedConversation.client_phone || "-"}
                          </p>
                          <p className="text-xs text-[#8a969a]">
                            Última actividad:{" "}
                            {formatDateTime(
                              selectedConversation.last_message_at ||
                                selectedConversation.updated_at
                            )}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            updateConversationControl(
                              selectedConversation,
                              !isConversationAiEnabled(selectedConversation)
                            )
                          }
                          className={`rounded-full px-5 py-2 text-sm text-white transition hover:opacity-90 ${
                            isConversationAiEnabled(selectedConversation)
                              ? "bg-green-600"
                              : "bg-red-600"
                          }`}
                          title={
                            isConversationAiEnabled(selectedConversation)
                              ? "Apagar IA para esta conversación"
                              : "Activar IA para esta conversación"
                          }
                        >
                          {isConversationAiEnabled(selectedConversation)
                            ? "IA ON · Bot activo"
                            : "IA OFF · Bot apagado"}
                        </button>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                        <InputField
                          label="Responsable"
                          value={assignedTo}
                          onChange={setAssignedTo}
                          placeholder="Nombre de asesora o responsable"
                        />
                        <button
                          type="button"
                          onClick={() => saveAssignedTo(selectedConversation)}
                          className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                        >
                          Guardar responsable
                        </button>
                      </div>
                    </div>

                    <div
                      ref={conversationScrollRef}
                      className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5"
                    >
                      {loadingConversationMessages ? (
                        <p className="text-sm text-[#68777c]">
                          Cargando mensajes...
                        </p>
                      ) : conversationMessages.length === 0 ? (
                        <EmptyState text="Aún no hay mensajes para esta conversación." />
                      ) : (
                        conversationMessages.map((item) => {
                          const isIncoming = item.direction === "incoming";

                          return (
                            <div
                              key={item.id}
                              className={`flex ${
                                isIncoming ? "justify-start" : "justify-end"
                              }`}
                            >
                              <div
                                className={`max-w-[78%] rounded-[1.25rem] px-4 py-3 text-sm leading-6 shadow-sm ${
                                  isIncoming
                                    ? "bg-white text-[#263238]"
                                    : "bg-[#bd7b83] text-white"
                                }`}
                              >
                                <p className="whitespace-pre-wrap">{item.body}</p>
                                <p
                                  className={`mt-2 text-[11px] ${
                                    isIncoming
                                      ? "text-[#8a969a]"
                                      : "text-white/75"
                                  }`}
                                >
                                  {isIncoming ? "Cliente" : "Bot / admin"} ·{" "}
                                  {formatDateTime(item.created_at)}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="shrink-0 border-t border-[#dde3e6] bg-white p-5">
                      <div className="mb-4">
                        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                          Respuestas rápidas
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {quickReplies.map((reply) => (
                            <button
                              type="button"
                              key={reply.label}
                              onClick={() => setManualReply(reply.text)}
                              className="rounded-full border border-[#dde3e6] px-4 py-2 text-xs text-[#68777c] transition hover:border-[#bd7b83] hover:text-[#bd7b83]"
                            >
                              {reply.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                        <TextAreaField
                          label="Respuesta manual"
                          value={manualReply}
                          onChange={setManualReply}
                          placeholder="Escribe una respuesta para la clienta..."
                        />
                        <button
                          type="button"
                          onClick={() => sendManualReply(selectedConversation)}
                          disabled={saving || !manualReply.trim()}
                          className="rounded-full bg-[#bd7b83] px-6 py-4 text-sm text-white transition hover:opacity-90 disabled:opacity-60"
                        >
                          Enviar respuesta manual
                        </button>
                      </div>

                      <p className="mt-3 text-xs text-[#8a969a]">
                        Al enviar una respuesta manual, la IA se apaga para esta conversación y queda en seguimiento humano. Puedes reactivarla con “Activar IA”.
                      </p>
                    </div>
                  </>
                )}
              </section>
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
  onDelete,
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

          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-full border border-red-500 px-5 py-2 text-sm text-red-600 transition hover:bg-red-600 hover:text-white"
            >
              Eliminar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

