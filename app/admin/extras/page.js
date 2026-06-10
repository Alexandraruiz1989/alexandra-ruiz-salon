"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "../components/AdminShell";
import { supabase } from "../../lib/supabaseClient";

const menuItems = [
  { key: "activos", label: "Extras activos" },
  { key: "nuevo", label: "Agregar extra" },
  { key: "inactivos", label: "Desactivados" },
];

const pricingTypes = [
  { value: "fixed", label: "Precio fijo" },
  { value: "per_nail", label: "Por uña" },
  { value: "per_piece", label: "Por pieza" },
];

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-[1.5rem] bg-white p-6 shadow-sm ${className}`}>
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

function getPricingLabel(value) {
  return pricingTypes.find((item) => item.value === value)?.label || value;
}

function getToastStyle(message) {
  const text = String(message || "").toLowerCase();

  if (
    text.includes("no se pudo") ||
    text.includes("error") ||
    text.includes("obligatorio") ||
    text.includes("precio") ||
    text.includes("nombre")
  ) {
    return "bg-red-600 text-white";
  }

  return "bg-green-600 text-white";
}

const emptyForm = {
  name: "",
  category: "Decoración",
  pricing_type: "fixed",
  price: 0,
  active: true,
  notes: "",
};

export default function ExtrasPage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState("activos");
  const [message, setMessage] = useState("");

  const [extras, setExtras] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const activeExtras = useMemo(() => {
    return extras.filter((extra) => extra.active !== false);
  }, [extras]);

  const inactiveExtras = useMemo(() => {
    return extras.filter((extra) => extra.active === false);
  }, [extras]);

  const categories = useMemo(() => {
    const allCategories = extras
      .map((extra) => extra.category)
      .filter(Boolean)
      .map((category) => String(category).trim());

    return [...new Set(["Decoración", "Retiro", "Diseño", "Extra", ...allCategories])];
  }, [extras]);

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

  const loadData = async () => {
    setLoadingData(true);
    setMessage("");

    const { data, error } = await supabase
      .from("service_extras")
      .select("*")
      .order("active", { ascending: false })
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      setMessage(`No se pudieron cargar extras: ${error.message}`);
    } else {
      setExtras(data || []);
    }

    setLoadingData(false);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleFormChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const editExtra = (extra) => {
    setEditingId(extra.id);
    setForm({
      name: extra.name || "",
      category: extra.category || "Decoración",
      pricing_type: extra.pricing_type || "fixed",
      price: Number(extra.price || 0),
      active: extra.active !== false,
      notes: extra.notes || "",
    });
    setActiveSection("nuevo");
    setMessage("");
  };

  const saveExtra = async () => {
    setSaving(true);
    setMessage("");

    const name = form.name.trim();
    const category = form.category.trim() || "General";
    const price = Number(form.price || 0);

    if (!name) {
      setMessage("El nombre del extra es obligatorio.");
      setSaving(false);
      return;
    }

    if (price < 0) {
      setMessage("El precio no puede ser negativo.");
      setSaving(false);
      return;
    }

    const payload = {
      name,
      category,
      pricing_type: form.pricing_type || "fixed",
      price,
      active: form.active !== false,
      notes: form.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (editingId) {
      const { error } = await supabase
        .from("service_extras")
        .update(payload)
        .eq("id", editingId);

      if (error) {
        setMessage(`No se pudo actualizar el extra: ${error.message}`);
        setSaving(false);
        return;
      }

      setMessage("Extra actualizado correctamente ✨");
    } else {
      const { error } = await supabase.from("service_extras").insert([payload]);

      if (error) {
        setMessage(`No se pudo crear el extra: ${error.message}`);
        setSaving(false);
        return;
      }

      setMessage("Extra agregado correctamente ✨");
    }

    resetForm();
    setActiveSection("activos");
    setSaving(false);
    await loadData();
  };

  const toggleExtraStatus = async (extra) => {
    setMessage("");

    const { error } = await supabase
      .from("service_extras")
      .update({
        active: !extra.active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", extra.id);

    if (error) {
      setMessage(`No se pudo cambiar el estado: ${error.message}`);
      return;
    }

    setMessage(
      extra.active
        ? "Extra desactivado correctamente."
        : "Extra activado correctamente ✨"
    );

    await loadData();
  };

  const duplicateExtra = async (extra) => {
    setMessage("");

    const { error } = await supabase.from("service_extras").insert([
      {
        name: `${extra.name} copia`,
        category: extra.category || "General",
        pricing_type: extra.pricing_type || "fixed",
        price: Number(extra.price || 0),
        active: true,
        notes: extra.notes || null,
        updated_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      setMessage(`No se pudo duplicar el extra: ${error.message}`);
      return;
    }

    setMessage("Extra duplicado correctamente ✨");
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
      title="Extras / Decoraciones"
      subtitle="Agrega, edita, activa o desactiva extras que aparecen en Cobros."
      activeModule="extras"
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

      {activeSection === "activos" && (
        <Card>
          <SectionHeader
            eyebrow="Activos"
            title="Extras disponibles en Cobros"
            description="Estos extras aparecerán automáticamente cuando cobres una cita."
            action={
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setActiveSection("nuevo");
                  }}
                  className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
                >
                  Agregar extra
                </button>

                <button
                  type="button"
                  onClick={loadData}
                  className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                >
                  Actualizar
                </button>
              </div>
            }
          />

          {loadingData ? (
            <p className="text-sm text-[#68777c]">Cargando extras...</p>
          ) : activeExtras.length === 0 ? (
            <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
              Aún no hay extras activos.
            </div>
          ) : (
            <ExtrasGrid
              extras={activeExtras}
              editExtra={editExtra}
              toggleExtraStatus={toggleExtraStatus}
              duplicateExtra={duplicateExtra}
            />
          )}
        </Card>
      )}

      {activeSection === "nuevo" && (
        <Card>
          <SectionHeader
            eyebrow={editingId ? "Editar" : "Nuevo"}
            title={editingId ? "Editar extra / decoración" : "Agregar extra / decoración"}
            description="Define nombre, precio, categoría y tipo de cobro."
            action={
              editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                >
                  Cancelar edición
                </button>
              ) : null
            }
          />

          <div className="grid gap-5 lg:grid-cols-[1fr_0.75fr]">
            <div className="rounded-2xl bg-[#f7f9fa] p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Nombre del extra
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => handleFormChange("name", event.target.value)}
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                    placeholder="Ej. Francés, ojo de gato, cristal..."
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Categoría
                  </label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(event) =>
                      handleFormChange("category", event.target.value)
                    }
                    list="extra-categories"
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                    placeholder="Ej. Decoración"
                  />

                  <datalist id="extra-categories">
                    {categories.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Tipo de cobro
                  </label>
                  <select
                    value={form.pricing_type}
                    onChange={(event) =>
                      handleFormChange("pricing_type", event.target.value)
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                  >
                    {pricingTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Precio
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.price}
                    onChange={(event) => handleFormChange("price", event.target.value)}
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                    placeholder="0"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm text-[#68777c]">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(event) =>
                        handleFormChange("active", event.target.checked)
                      }
                      className="h-4 w-4"
                    />
                    Activo y disponible para cobrar
                  </label>
                </div>
              </div>

              <textarea
                value={form.notes}
                onChange={(event) => handleFormChange("notes", event.target.value)}
                className="mt-4 min-h-24 w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                placeholder="Notas internas del extra..."
              />

              <button
                type="button"
                disabled={saving}
                onClick={saveExtra}
                className="mt-4 w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {saving
                  ? "Guardando..."
                  : editingId
                  ? "Guardar cambios"
                  : "Agregar extra"}
              </button>
            </div>

            <div className="rounded-2xl bg-[#fff6fb] p-5">
              <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                Vista previa
              </p>

              <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                  {form.category || "Categoría"}
                </p>

                <h3 className="mt-2 text-xl font-light text-[#263238]">
                  {form.name || "Nombre del extra"}
                </h3>

                <p className="mt-2 text-sm text-[#68777c]">
                  {getPricingLabel(form.pricing_type)}
                </p>

                <p className="mt-3 text-3xl font-light text-[#263238]">
                  {formatMoney(form.price)}
                </p>

                <p
                  className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs ${
                    form.active
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {form.active ? "Activo" : "Desactivado"}
                </p>

                {form.notes && (
                  <p className="mt-4 rounded-xl bg-[#f7f9fa] p-3 text-sm text-[#68777c]">
                    {form.notes}
                  </p>
                )}
              </div>

              <div className="mt-5 space-y-3 text-sm leading-6 text-[#68777c]">
                <p>
                  <b>Precio fijo:</b> se cobra una sola vez.
                </p>
                <p>
                  <b>Por uña:</b> en Cobros podrás poner cantidad de uñas.
                </p>
                <p>
                  <b>Por pieza:</b> para cristales, charms u otros elementos por
                  unidad.
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {activeSection === "inactivos" && (
        <Card>
          <SectionHeader
            eyebrow="Desactivados"
            title="Extras ocultos en Cobros"
            description="Estos extras no aparecerán al cobrar, pero puedes reactivarlos cuando quieras."
          />

          {loadingData ? (
            <p className="text-sm text-[#68777c]">Cargando extras...</p>
          ) : inactiveExtras.length === 0 ? (
            <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
              No tienes extras desactivados.
            </div>
          ) : (
            <ExtrasGrid
              extras={inactiveExtras}
              editExtra={editExtra}
              toggleExtraStatus={toggleExtraStatus}
              duplicateExtra={duplicateExtra}
            />
          )}
        </Card>
      )}
    </AdminShell>
  );
}

function ExtrasGrid({ extras, editExtra, toggleExtraStatus, duplicateExtra }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {extras.map((extra) => (
        <div
          key={extra.id}
          className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                {extra.category || "General"}
              </p>

              <h3 className="mt-2 text-lg font-light text-[#263238]">
                {extra.name}
              </h3>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs ${
                extra.active
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {extra.active ? "Activo" : "Inactivo"}
            </span>
          </div>

          <p className="mt-3 text-sm text-[#68777c]">
            Tipo: {getPricingLabel(extra.pricing_type)}
          </p>

          <p className="mt-3 text-3xl font-light text-[#263238]">
            {formatMoney(extra.price)}
          </p>

          {extra.notes && (
            <p className="mt-3 rounded-xl bg-[#f7f9fa] p-3 text-sm text-[#68777c]">
              {extra.notes}
            </p>
          )}

          <div className="mt-5 grid gap-2">
            <button
              type="button"
              onClick={() => editExtra(extra)}
              className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
            >
              Editar
            </button>

            <button
              type="button"
              onClick={() => toggleExtraStatus(extra)}
              className={`rounded-full border px-5 py-3 text-sm transition ${
                extra.active
                  ? "border-red-500 text-red-600 hover:bg-red-600 hover:text-white"
                  : "border-green-600 text-green-700 hover:bg-green-600 hover:text-white"
              }`}
            >
              {extra.active ? "Desactivar" : "Activar"}
            </button>

            <button
              type="button"
              onClick={() => duplicateExtra(extra)}
              className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
            >
              Duplicar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}