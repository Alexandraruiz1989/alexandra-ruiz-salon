"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import AdminShell from "../components/AdminShell";

const menuItems = [
  { key: "mensajes", label: "Mensajes WhatsApp" },
  { key: "negocio", label: "Datos del negocio" },
  { key: "automaticos", label: "Horarios automáticos" },
];

function getToastStyle(message) {
  const text = String(message || "").toLowerCase();

const isError =
  text.includes("no se pudo") ||
  text.includes("no se pudieron") ||
  text.includes("permission denied") ||
  text.includes("error") ||
  text.includes("obligatorio");

  if (isError) {
    return "bg-red-600 text-white shadow-[0_18px_45px_rgba(220,38,38,0.28)]";
  }

  return "bg-green-600 text-white shadow-[0_18px_45px_rgba(22,163,74,0.25)]";
}

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
      {description && <p className="mt-1 text-sm text-[#68777c]">{description}</p>}
    </div>
  );
}

export default function ConfiguracionPage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);

  const [activeSection, setActiveSection] = useState("mensajes");
  const [message, setMessage] = useState("");

  const [templates, setTemplates] = useState([]);
  const [businessSettings, setBusinessSettings] = useState({
    id: "",
    business_name: "Alexandra Ruiz Salón Spa",
    whatsapp_phone: "",
  });

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
    }, 5000);

    return () => clearTimeout(timer);
  }, [message]);

  const loadData = async () => {
    setLoadingData(true);
    setMessage("");

    const [settingsResult, templatesResult] = await Promise.all([
      supabase.from("business_settings").select("*").limit(1).maybeSingle(),
      supabase
        .from("message_templates")
        .select("*")
        .order("created_at", { ascending: true }),
    ]);

    if (settingsResult.error) {
      setMessage(`No se pudo cargar datos del negocio: ${settingsResult.error.message}`);
    } else if (settingsResult.data) {
      setBusinessSettings({
        id: settingsResult.data.id,
        business_name: settingsResult.data.business_name || "Alexandra Ruiz Salón Spa",
        whatsapp_phone: settingsResult.data.whatsapp_phone || "",
      });
    }

    if (templatesResult.error) {
      setMessage(`No se pudieron cargar mensajes: ${templatesResult.error.message}`);
    } else {
      setTemplates(templatesResult.data || []);
    }

    setLoadingData(false);
  };

  const handleBusinessChange = (event) => {
    const { name, value } = event.target;

    setBusinessSettings((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleTemplateChange = (id, field, value) => {
    setTemplates((current) =>
      current.map((template) =>
        template.id === id ? { ...template, [field]: value } : template
      )
    );
  };

  const saveBusinessSettings = async () => {
    setSaving(true);
    setMessage("");

    if (!businessSettings.business_name.trim()) {
      setMessage("El nombre del negocio es obligatorio.");
      setSaving(false);
      return;
    }

    if (businessSettings.id) {
      const { error } = await supabase
        .from("business_settings")
        .update({
          business_name: businessSettings.business_name.trim(),
          whatsapp_phone: businessSettings.whatsapp_phone.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", businessSettings.id);

      if (error) {
        setMessage(`No se pudo guardar la configuración: ${error.message}`);
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("business_settings")
        .insert([
          {
            business_name: businessSettings.business_name.trim(),
            whatsapp_phone: businessSettings.whatsapp_phone.trim() || null,
          },
        ])
        .select()
        .single();

      if (error) {
        setMessage(`No se pudo crear la configuración: ${error.message}`);
        setSaving(false);
        return;
      }

      setBusinessSettings((current) => ({
        ...current,
        id: data.id,
      }));
    }

    setMessage("Datos del negocio guardados correctamente ✨");
    setSaving(false);
  };

  const saveTemplate = async (template) => {
    setSaving(true);
    setMessage("");

    if (!template.title.trim() || !template.message_body.trim()) {
      setMessage("El título y mensaje son obligatorios.");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("message_templates")
      .update({
        title: template.title.trim(),
        message_body: template.message_body.trim(),
        send_timing: template.send_timing?.trim() || null,
        is_active: Boolean(template.is_active),
        updated_at: new Date().toISOString(),
      })
      .eq("id", template.id);

    if (error) {
      setMessage(`No se pudo guardar el mensaje: ${error.message}`);
      setSaving(false);
      return;
    }

    setMessage("Mensaje guardado correctamente ✨");
    setSaving(false);
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
      title="Configuración"
      subtitle="Personaliza mensajes, datos del negocio y horarios automáticos."
      activeModule="configuracion"
      menuItems={menuItems}
      activeSection={activeSection}
      setActiveSection={setActiveSection}
    >
    

      {activeSection === "mensajes" && (
        <Card>
          <SectionHeader
            eyebrow="Mensajes WhatsApp"
            title="Plantillas editables"
            description="Estos textos se usarán en Agenda para recordatorios, agradecimientos y solicitudes de calificación."
          />

          <div className="mb-6 rounded-2xl bg-[#f7f9fa] p-4 text-sm leading-6 text-[#68777c]">
            Puedes usar variables como{" "}
            <span className="font-medium text-[#263238]">{"{client_first_name}"}</span>,{" "}
            <span className="font-medium text-[#263238]">{"{business_name}"}</span>,{" "}
            <span className="font-medium text-[#263238]">{"{appointment_time}"}</span> y{" "}
            <span className="font-medium text-[#263238]">{"{services}"}</span>.
          </div>

          {loadingData ? (
            <p className="text-sm text-[#68777c]">Cargando mensajes...</p>
          ) : (
            <div className="space-y-5">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5"
                >
                  <div className="grid gap-4 md:grid-cols-[1fr_0.35fr]">
                    <div>
                      <label className="mb-2 block text-sm text-[#68777c]">
                        Título
                      </label>
                      <input
                        value={template.title || ""}
                        onChange={(event) =>
                          handleTemplateChange(template.id, "title", event.target.value)
                        }
                        className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm text-[#68777c]">
                        Envío
                      </label>
                      <input
                        value={template.send_timing || ""}
                        onChange={(event) =>
                          handleTemplateChange(
                            template.id,
                            "send_timing",
                            event.target.value
                          )
                        }
                        className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-2 block text-sm text-[#68777c]">
                      Mensaje
                    </label>
                    <textarea
                      value={template.message_body || ""}
                      onChange={(event) =>
                        handleTemplateChange(
                          template.id,
                          "message_body",
                          event.target.value
                        )
                      }
                      className="min-h-32 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                    />
                  </div>
{message && (
  <div
    className={`mt-4 rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(
      message
    )}`}
  >
    {message}
  </div>
)}
                  <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <label className="flex items-center gap-2 text-sm text-[#68777c]">
                      <input
                        type="checkbox"
                        checked={Boolean(template.is_active)}
                        onChange={(event) =>
                          handleTemplateChange(
                            template.id,
                            "is_active",
                            event.target.checked
                          )
                        }
                      />
                      Mensaje activo
                    </label>

                    <button
                      type="button"
                      onClick={() => saveTemplate(template)}
                      disabled={saving}
                      className="rounded-full bg-[#bd7b83] px-6 py-3 text-sm text-white transition hover:opacity-90 disabled:opacity-60"
                    >
                      Guardar mensaje
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeSection === "negocio" && (
        <Card>
          <SectionHeader
            eyebrow="Datos del negocio"
            title="Información general"
            description="Estos datos podrán usarse en mensajes, reportes y configuración del sistema."
          />

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm text-[#68777c]">
                Nombre del negocio
              </label>
              <input
                name="business_name"
                value={businessSettings.business_name}
                onChange={handleBusinessChange}
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#68777c]">
                WhatsApp ligado del salón
              </label>
              <input
                name="whatsapp_phone"
                value={businessSettings.whatsapp_phone}
                onChange={handleBusinessChange}
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                placeholder="Ej. 9993642676"
              />
            </div>

          <div>
  {message && (
    <div
      className={`mb-3 rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(
        message
      )}`}
    >
      {message}
    </div>
  )}

  <button
    type="button"
    onClick={saveBusinessSettings}
    disabled={saving}
    className="w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
  >
    {saving ? "Guardando..." : "Guardar datos"}
  </button>
</div>
          </div>
        </Card>
      )}

      {activeSection === "automaticos" && (
        <Card>
          <SectionHeader
            eyebrow="Horarios automáticos"
            title="Automatizaciones pendientes"
            description="Aquí configuraremos cuándo enviar recordatorios, agradecimientos y solicitudes de calificación."
          />

          <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm leading-6 text-[#68777c]">
            Ya dejamos lista la base para guardar los tiempos de envío. Más
            adelante conectaremos el bot/API para enviar automáticamente, por
            ejemplo 24 horas antes o 4 horas después de la cita.
          </div>
        </Card>
      )}
    </AdminShell>
  );
}