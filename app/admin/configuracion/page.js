"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import AdminShell from "../components/AdminShell";

const menuItems = [
  { key: "mensajes", label: "Mensajes WhatsApp" },
  { key: "negocio", label: "Datos del negocio" },
  { key: "seguimientos", label: "Seguimientos" },
  { key: "cobros", label: "Cobros / Propinas" },
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
const [activeMessageId, setActiveMessageId] = useState(null);

  const [templates, setTemplates] = useState([]);
  const [followupRules, setFollowupRules] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
const [paymentSettings, setPaymentSettings] = useState({
  id: "",
  tip_rule: "appointment_staff",
  allow_manual_tip_adjustment: true,
  selected_staff_ids: [],
});
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
    setActiveMessageId(null);
  }, 15000);

  return () => clearTimeout(timer);
}, [message]);

  const loadData = async () => {
    setLoadingData(true);
    setMessage("");

   const [
  settingsResult,
  templatesResult,
  followupRulesResult,
  paymentSettingsResult,
  staffResult,
] = await Promise.all([
  supabase.from("business_settings").select("*").limit(1).maybeSingle(),
  supabase
    .from("message_templates")
    .select("*")
    .order("created_at", { ascending: true }),
  supabase
    .from("followup_rules")
    .select("*")
    .order("created_at", { ascending: true }),
    supabase.from("payment_settings").select("*").limit(1).maybeSingle(),
supabase.from("staff").select("*").eq("active", true).order("full_name"),
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
if (followupRulesResult.error) {
  setMessage(`No se pudieron cargar reglas de seguimiento: ${followupRulesResult.error.message}`);
} else {
  setFollowupRules(followupRulesResult.data || []);
}
if (paymentSettingsResult.error) {
  setMessage(
    `No se pudo cargar configuración de cobros: ${paymentSettingsResult.error.message}`
  );
} else if (paymentSettingsResult.data) {
  setPaymentSettings({
    id: paymentSettingsResult.data.id,
    tip_rule: paymentSettingsResult.data.tip_rule || "appointment_staff",
    allow_manual_tip_adjustment:
      paymentSettingsResult.data.allow_manual_tip_adjustment ?? true,
    selected_staff_ids: paymentSettingsResult.data.selected_staff_ids || [],
  });
}

if (staffResult.error) {
  setMessage(`No se pudo cargar personal: ${staffResult.error.message}`);
} else {
  setStaffMembers(staffResult.data || []);
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
const handleFollowupRuleChange = (id, field, value) => {
  setFollowupRules((current) =>
    current.map((rule) =>
      rule.id === id ? { ...rule, [field]: value } : rule
    )
  );
};

const saveFollowupRule = async (rule) => {
  setSaving(true);
  setMessage("");
  setActiveMessageId(rule.id);

  if (!rule.title?.trim() || !rule.keywords?.trim() || !rule.message_body?.trim()) {
    setMessage("El título, palabras clave y mensaje son obligatorios.");
    setSaving(false);
    return;
  }

  const { error } = await supabase
    .from("followup_rules")
    .update({
      title: rule.title.trim(),
      keywords: rule.keywords.trim(),
      followup_days: Number(rule.followup_days || 0),
      followup_months: Number(rule.followup_months || 0),
      followup_type: rule.followup_type?.trim() || "reagendar",
      message_body: rule.message_body.trim(),
      is_active: Boolean(rule.is_active),
      updated_at: new Date().toISOString(),
    })
    .eq("id", rule.id);

  if (error) {
    setMessage(`No se pudo guardar la regla de seguimiento: ${error.message}`);
    setSaving(false);
    return;
  }

  setMessage("Regla de seguimiento guardada correctamente ✨");
  setSaving(false);
};
const handlePaymentSettingsChange = (field, value) => {
  setPaymentSettings((current) => ({
    ...current,
    [field]: value,
  }));
};

const handleSelectedStaffToggle = (staffId) => {
  setPaymentSettings((current) => {
    const currentSelected = current.selected_staff_ids || [];
    const alreadySelected = currentSelected.includes(staffId);

    return {
      ...current,
      selected_staff_ids: alreadySelected
        ? currentSelected.filter((id) => id !== staffId)
        : [...currentSelected, staffId],
    };
  });
};

const savePaymentSettings = async () => {
  setSaving(true);
  setMessage("");
  setActiveMessageId("payment-settings");

  if (
    paymentSettings.tip_rule === "selected_staff" &&
    (!paymentSettings.selected_staff_ids ||
      paymentSettings.selected_staff_ids.length === 0)
  ) {
    setMessage("Selecciona al menos una colaboradora para repartir propinas.");
    setSaving(false);
    return;
  }

  const payload = {
    tip_rule: paymentSettings.tip_rule,
    allow_manual_tip_adjustment: Boolean(
      paymentSettings.allow_manual_tip_adjustment
    ),
    selected_staff_ids: paymentSettings.selected_staff_ids || [],
    updated_at: new Date().toISOString(),
  };

  if (paymentSettings.id) {
    const { error } = await supabase
      .from("payment_settings")
      .update(payload)
      .eq("id", paymentSettings.id);

    if (error) {
      setMessage(`No se pudo guardar configuración de cobros: ${error.message}`);
      setSaving(false);
      return;
    }
  } else {
    const { data, error } = await supabase
      .from("payment_settings")
      .insert([payload])
      .select()
      .single();

    if (error) {
      setMessage(`No se pudo crear configuración de cobros: ${error.message}`);
      setSaving(false);
      return;
    }

    setPaymentSettings((current) => ({
      ...current,
      id: data.id,
    }));
  }

  setMessage("Configuración de cobros guardada correctamente ✨");
  setSaving(false);
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
    setActiveMessageId(template.id);

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
                    {message && activeMessageId === template.id && (
  <div
    className={`mt-4 rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(
      message
    )}`}
  >
    {message}
                  </div>
                  )}
                   </div>

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
{activeSection === "seguimientos" && (
  <Card>
    <SectionHeader
      eyebrow="Seguimientos"
      title="Reglas para reagendar clientas"
      description="Configura cuándo se debe crear un recordatorio según las palabras clave del servicio."
    />

    <div className="mb-6 rounded-2xl bg-[#f7f9fa] p-4 text-sm leading-6 text-[#68777c]">
      El sistema revisa el nombre y categoría del servicio. Si encuentra alguna
      palabra clave, crea un seguimiento con los días o meses configurados.
      Puedes usar variables como{" "}
      <span className="font-medium text-[#263238]">{"{client_first_name}"}</span>.
    </div>

    {loadingData ? (
      <p className="text-sm text-[#68777c]">Cargando reglas...</p>
    ) : followupRules.length === 0 ? (
      <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
        No hay reglas de seguimiento registradas.
      </div>
    ) : (
      <div className="space-y-5">
        {followupRules.map((rule) => (
          <div
            key={rule.id}
            className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5"
          >
            <div className="grid gap-4 md:grid-cols-[1fr_0.35fr_0.35fr]">
              <div>
                <label className="mb-2 block text-sm text-[#68777c]">
                  Título
                </label>
                <input
                  value={rule.title || ""}
                  onChange={(event) =>
                    handleFollowupRuleChange(rule.id, "title", event.target.value)
                  }
                  className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#68777c]">
                  Días
                </label>
                <input
                  type="number"
                  value={rule.followup_days || 0}
                  onChange={(event) =>
                    handleFollowupRuleChange(
                      rule.id,
                      "followup_days",
                      event.target.value
                    )
                  }
                  className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#68777c]">
                  Meses
                </label>
                <input
                  type="number"
                  value={rule.followup_months || 0}
                  onChange={(event) =>
                    handleFollowupRuleChange(
                      rule.id,
                      "followup_months",
                      event.target.value
                    )
                  }
                  className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm text-[#68777c]">
                Palabras clave
              </label>
              <textarea
                value={rule.keywords || ""}
                onChange={(event) =>
                  handleFollowupRuleChange(rule.id, "keywords", event.target.value)
                }
                className="min-h-20 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                placeholder="Ej. uñas, manicure, pedicure, gel..."
              />
              <p className="mt-2 text-xs text-[#8a969a]">
                Separa palabras clave con coma.
              </p>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm text-[#68777c]">
                Tipo interno
              </label>
              <input
                value={rule.followup_type || ""}
                onChange={(event) =>
                  handleFollowupRuleChange(rule.id, "followup_type", event.target.value)
                }
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                placeholder="manos_pies, cabello_1_mes..."
              />
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm text-[#68777c]">
                Mensaje WhatsApp
              </label>
              <textarea
                value={rule.message_body || ""}
                onChange={(event) =>
                  handleFollowupRuleChange(
                    rule.id,
                    "message_body",
                    event.target.value
                  )
                }
                className="min-h-32 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              />
            </div>

            <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 text-sm text-[#68777c]">
                <input
                  type="checkbox"
                  checked={Boolean(rule.is_active)}
                  onChange={(event) =>
                    handleFollowupRuleChange(
                      rule.id,
                      "is_active",
                      event.target.checked
                    )
                  }
                />
                Regla activa
              </label>
{message && activeMessageId === rule.id && (
  <div
    className={`mt-4 rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(
      message
    )}`}
  >
    {message}
  </div>
)}

<div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
  ...
</div>
              <button
                type="button"
                onClick={() => saveFollowupRule(rule)}
                disabled={saving}
                className="rounded-full bg-[#bd7b83] px-6 py-3 text-sm text-white transition hover:opacity-90 disabled:opacity-60"
              >
                Guardar regla
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </Card>
)}
{activeSection === "cobros" && (
  <Card>
    <SectionHeader
      eyebrow="Cobros / Propinas"
      title="Configuración de propinas"
      description="Define cómo se reparten las propinas al registrar un cobro."
    />

    <div className="space-y-5">
      <div className="rounded-2xl bg-[#f7f9fa] p-5">
        <label className="mb-3 block text-sm font-medium text-[#263238]">
          Regla de reparto de propinas
        </label>

        <div className="space-y-3">
          <label className="flex items-start gap-3 rounded-2xl bg-white p-4 text-sm text-[#68777c]">
            <input
              type="radio"
              name="tip_rule"
              value="appointment_staff"
              checked={paymentSettings.tip_rule === "appointment_staff"}
              onChange={(event) =>
                handlePaymentSettingsChange("tip_rule", event.target.value)
              }
            />
            <span>
              <span className="block font-medium text-[#263238]">
                Para la técnica o técnicas que atendieron la cita
              </span>
              <span>
                La propina se reparte entre quienes participaron en los servicios
                de la cita.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl bg-white p-4 text-sm text-[#68777c]">
            <input
              type="radio"
              name="tip_rule"
              value="all_active_staff"
              checked={paymentSettings.tip_rule === "all_active_staff"}
              onChange={(event) =>
                handlePaymentSettingsChange("tip_rule", event.target.value)
              }
            />
            <span>
              <span className="block font-medium text-[#263238]">
                Dividir entre todos los colaboradores activos
              </span>
              <span>
                La propina se reparte entre todo el personal activo registrado.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl bg-white p-4 text-sm text-[#68777c]">
            <input
              type="radio"
              name="tip_rule"
              value="selected_staff"
              checked={paymentSettings.tip_rule === "selected_staff"}
              onChange={(event) =>
                handlePaymentSettingsChange("tip_rule", event.target.value)
              }
            />
            <span>
              <span className="block font-medium text-[#263238]">
                Dividir entre colaboradores seleccionados
              </span>
              <span>
                Tú eliges qué colaboradoras participan en el reparto de propinas.
              </span>
            </span>
          </label>
        </div>
      </div>

      {paymentSettings.tip_rule === "selected_staff" && (
        <div className="rounded-2xl bg-[#f7f9fa] p-5">
          <label className="mb-3 block text-sm font-medium text-[#263238]">
            Colaboradores seleccionados
          </label>

          {staffMembers.length === 0 ? (
            <p className="text-sm text-[#68777c]">
              No hay colaboradores activos registrados.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {staffMembers.map((person) => (
                <label
                  key={person.id}
                  className="flex items-center gap-3 rounded-2xl bg-white p-4 text-sm text-[#68777c]"
                >
                  <input
                    type="checkbox"
                    checked={(paymentSettings.selected_staff_ids || []).includes(
                      person.id
                    )}
                    onChange={() => handleSelectedStaffToggle(person.id)}
                  />
                  <span>{person.full_name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <label className="flex items-start gap-3 rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
        <input
          type="checkbox"
          checked={Boolean(paymentSettings.allow_manual_tip_adjustment)}
          onChange={(event) =>
            handlePaymentSettingsChange(
              "allow_manual_tip_adjustment",
              event.target.checked
            )
          }
        />
        <span>
          <span className="block font-medium text-[#263238]">
            Permitir ajuste manual al cobrar
          </span>
          <span>
            Si está activo, en Cobros se podrá modificar la asignación de propina
            cuando sea necesario.
          </span>
        </span>
      </label>

      {message && activeMessageId === "payment-settings" && (
        <div
          className={`rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(
            message
          )}`}
        >
          {message}
        </div>
      )}

      <button
        type="button"
        onClick={savePaymentSettings}
        disabled={saving}
        className="w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {saving ? "Guardando..." : "Guardar configuración de cobros"}
      </button>
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