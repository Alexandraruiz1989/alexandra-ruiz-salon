import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function includesAnyKeyword(message, keywordsText) {
  const messageText = normalizeText(message);
  const keywords = String(keywordsText || "")
    .split(",")
    .map((item) => normalizeText(item))
    .filter(Boolean);

  return keywords.some((keyword) => messageText.includes(keyword));
}

function getFirstName(name) {
  if (!name) return "";
  return String(name).trim().split(" ")[0];
}

function buildMenuResponse(settings, menuOptions) {
  const welcome =
    settings?.welcome_message ||
    "Hola 💕 Bienvenida/o a Alexandra Ruiz Salón Spa. ¿En qué puedo ayudarte?";

  const activeOptions = menuOptions
    .filter((item) => item.active !== false)
    .sort((a, b) => Number(a.option_order || 0) - Number(b.option_order || 0));

  if (activeOptions.length === 0) return welcome;

  const optionsText = activeOptions
    .map((item) => `${item.option_order}. ${item.option_label}`)
    .join("\n");

  return `${welcome}\n\n${optionsText}`;
}

function findMenuOption(message, menuOptions) {
  const normalized = normalizeText(message);

  return menuOptions.find((item) => {
    if (item.active === false) return false;

    const order = String(item.option_order || "");
    const key = normalizeText(item.option_key);
    const label = normalizeText(item.option_label);

    return (
      normalized === order ||
      normalized === key ||
      normalized.includes(key) ||
      normalized.includes(label)
    );
  });
}

function findFaqAnswer(message, faqs) {
  const normalized = normalizeText(message);

  return faqs.find((faq) => {
    if (faq.active === false) return false;

    const question = normalizeText(faq.question);
    const keywordsMatch = includesAnyKeyword(message, faq.keywords);

    return (
      keywordsMatch ||
      normalized.includes(question) ||
      question.includes(normalized)
    );
  });
}

function findKnowledgeAnswer(message, knowledgeItems) {
  const normalized = normalizeText(message);

  const directMatch = knowledgeItems.find((item) => {
    if (item.active === false) return false;

    const title = normalizeText(item.title);
    const category = normalizeText(item.category);
    const content = normalizeText(item.content);
    const keywordsMatch = includesAnyKeyword(message, item.keywords);

    return (
      keywordsMatch ||
      normalized.includes(title) ||
      normalized.includes(category) ||
      content.includes(normalized)
    );
  });

  if (!directMatch) return null;

  return directMatch;
}

function detectBasicIntent(message) {
  const text = normalizeText(message);

  if (
    text.includes("hola") ||
    text.includes("buenos dias") ||
    text.includes("buenas tardes") ||
    text.includes("buenas noches") ||
    text === "menu" ||
    text === "menú" ||
    text === "inicio"
  ) {
    return "menu";
  }

  if (
    text.includes("agendar") ||
    text.includes("cita") ||
    text.includes("espacio") ||
    text.includes("disponible") ||
    text.includes("reservar")
  ) {
    return "agendar";
  }

  if (
    text.includes("humano") ||
    text.includes("persona") ||
    text.includes("asesora") ||
    text.includes("hablar") ||
    text.includes("atencion")
  ) {
    return "humano";
  }

  return "desconocido";
}

export async function POST(request) {
  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          error:
            "Faltan variables de entorno de Supabase. Revisa NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.",
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const incomingMessage = String(body.message || "").trim();
    const clientName = String(body.clientName || "").trim();
    const clientPhone = String(body.clientPhone || "test").trim();

    if (!incomingMessage) {
      return NextResponse.json(
        { error: "El mensaje es obligatorio." },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const [
      settingsResult,
      menuResult,
      faqsResult,
      knowledgeResult,
    ] = await Promise.all([
      supabase.from("bot_settings").select("*").limit(1).maybeSingle(),
      supabase
        .from("bot_menu_options")
        .select("*")
        .eq("active", true)
        .order("option_order", { ascending: true }),
      supabase
        .from("bot_faqs")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("bot_knowledge_base")
        .select("*")
        .eq("active", true)
        .order("category", { ascending: true }),
    ]);

    if (settingsResult.error) throw settingsResult.error;
    if (menuResult.error) throw menuResult.error;
    if (faqsResult.error) throw faqsResult.error;
    if (knowledgeResult.error) throw knowledgeResult.error;

    const settings = settingsResult.data;
    const menuOptions = menuResult.data || [];
    const faqs = faqsResult.data || [];
    const knowledgeItems = knowledgeResult.data || [];

    const intent = detectBasicIntent(incomingMessage);
    const firstName = getFirstName(clientName);

    let reply = "";
    let matchedSource = "fallback";

    if (intent === "menu") {
      reply = buildMenuResponse(settings, menuOptions);
      matchedSource = "menu";
    }

    if (!reply) {
      const matchedMenu = findMenuOption(incomingMessage, menuOptions);

      if (matchedMenu) {
        reply =
          matchedMenu.response_message ||
          `Elegiste: ${matchedMenu.option_label}`;
        matchedSource = "menu_option";
      }
    }

    if (!reply) {
      const matchedFaq = findFaqAnswer(incomingMessage, faqs);

      if (matchedFaq) {
        reply = matchedFaq.answer;
        matchedSource = "faq";
      }
    }

    if (!reply) {
      const matchedKnowledge = findKnowledgeAnswer(
        incomingMessage,
        knowledgeItems
      );

      if (matchedKnowledge) {
        reply = matchedKnowledge.content;
        matchedSource = "knowledge_base";
      }
    }

    if (!reply && intent === "agendar") {
      const agendarOption = menuOptions.find(
        (item) => item.option_key === "agendar"
      );

      reply =
        agendarOption?.response_message ||
        "Perfecto 💕 Para ayudarte a agendar, dime qué servicio te gustaría realizarte.";
      matchedSource = "intent_agendar";
    }

    if (!reply && intent === "humano") {
      reply =
        settings?.human_help_message ||
        "Claro 💕 Te vamos a comunicar con una persona del salón.";
      matchedSource = "human_help";
    }

    if (!reply) {
      reply =
        settings?.fallback_message ||
        "Disculpa, no logré entenderte bien. Puedes escribir “menú” para ver las opciones disponibles.";
    }

    if (firstName && reply.startsWith("Hola")) {
      reply = reply.replace("Hola", `Hola ${firstName}`);
    }

    const { data: conversation } = await supabase
      .from("bot_conversations")
      .upsert(
        [
          {
            client_phone: clientPhone,
            client_name: clientName || null,
            current_step: intent,
            intent,
            status: "abierta",
            last_message: incomingMessage,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: "client_phone" }
      )
      .select()
      .single();

    if (conversation?.id) {
      await supabase.from("bot_messages").insert([
        {
          conversation_id: conversation.id,
          client_phone: clientPhone,
          direction: "incoming",
          message_type: "text",
          body: incomingMessage,
          raw_payload: body,
        },
        {
          conversation_id: conversation.id,
          client_phone: clientPhone,
          direction: "outgoing",
          message_type: "text",
          body: reply,
          raw_payload: {
            matchedSource,
            intent,
          },
        },
      ]);
    }

    return NextResponse.json({
      ok: true,
      reply,
      intent,
      matchedSource,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message || "Error inesperado al probar el bot.",
      },
      { status: 500 }
    );
  }
}