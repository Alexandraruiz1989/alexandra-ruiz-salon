"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const emptyForm = {
  category: "",
  name: "",
  description: "",
  base_price: "",
  duration_minutes: "",
  cleanup_minutes: "",
  service_type: "servicio",
  variable_pricing: false,
  pricing_notes: "",
  active: true,
};

export default function ServiciosPage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingServices, setLoadingServices] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [services, setServices] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    const start = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        window.location.href = "/admin";
        return;
      }

      setLoadingSession(false);
      await loadServices();
    };

    start();
  }, []);

  const loadServices = async () => {
    setLoadingServices(true);
    setMessage("");

    const { data, error } = await supabase
      .from("services")
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      setMessage(`Error al cargar servicios: ${error.message}`);
    } else {
      setServices(data || []);
    }

    setLoadingServices(false);
  };

  const categories = useMemo(() => {
    const unique = new Set(services.map((service) => service.category));
    return Array.from(unique).sort();
  }, [services]);

  const filteredServices = useMemo(() => {
    const term = search.toLowerCase().trim();

    return services.filter((service) => {
      const matchesSearch =
        !term ||
        service.name?.toLowerCase().includes(term) ||
        service.category?.toLowerCase().includes(term) ||
        service.description?.toLowerCase().includes(term);

      const matchesCategory =
        !categoryFilter || service.category === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [services, search, categoryFilter]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingServiceId(null);
    setMessage("");
  };

  const handleEdit = (service) => {
    setEditingServiceId(service.id);
    setMessage("");

    setForm({
      category: service.category || "",
      name: service.name || "",
      description: service.description || "",
      base_price: service.base_price ?? "",
      duration_minutes: service.duration_minutes ?? "",
      cleanup_minutes: service.cleanup_minutes ?? "",
      service_type: service.service_type || "servicio",
      variable_pricing: Boolean(service.variable_pricing),
      pricing_notes: service.pricing_notes || "",
      active: Boolean(service.active),
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    if (!form.category.trim() || !form.name.trim()) {
      setMessage("La categoría y el nombre del servicio son obligatorios.");
      setSaving(false);
      return;
    }

    const serviceData = {
      category: form.category.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      base_price: Number(form.base_price || 0),
      duration_minutes: Number(form.duration_minutes || 0),
      cleanup_minutes: Number(form.cleanup_minutes || 0),
      service_type: form.service_type || "servicio",
      variable_pricing: form.variable_pricing,
      pricing_notes: form.pricing_notes.trim() || null,
      active: form.active,
      updated_at: new Date().toISOString(),
    };

    if (editingServiceId) {
      const { error } = await supabase
        .from("services")
        .update(serviceData)
        .eq("id", editingServiceId);

      if (error) {
        setMessage(`No se pudo actualizar el servicio: ${error.message}`);
      } else {
        setMessage("Servicio actualizado correctamente ✨");
        resetForm();
        await loadServices();
      }
    } else {
      const { error } = await supabase.from("services").insert([serviceData]);

      if (error) {
        setMessage(`No se pudo crear el servicio: ${error.message}`);
      } else {
        setMessage("Servicio creado correctamente ✨");
        resetForm();
        await loadServices();
      }
    }

    setSaving(false);
  };

  const toggleActive = async (service) => {
    setMessage("");

    const { error } = await supabase
      .from("services")
      .update({
        active: !service.active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", service.id);

    if (error) {
      setMessage(`No se pudo cambiar el estado: ${error.message}`);
    } else {
      await loadServices();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/admin";
  };

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
            <h1 className="mt-3 text-4xl font-light">Servicios</h1>
            <p className="mt-2 text-sm text-[#6d5a58]">
              Administra precios, duración, limpieza, descripciones y servicios activos.
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

        {message && (
          <div className="mb-6 rounded-2xl border border-[#ecd8d4] bg-white px-5 py-4 text-sm text-[#8a5f63] shadow-sm">
            {message}
          </div>
        )}

        <div className="grid gap-8 xl:grid-cols-[0.85fr_1.15fr]">
          <form
            onSubmit={handleSubmit}
            className="h-fit rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.10)]"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              {editingServiceId ? "Editar servicio" : "Nuevo servicio"}
            </p>

            <h2 className="mt-3 text-2xl font-light">
              {editingServiceId ? "Actualizar datos" : "Crear servicio"}
            </h2>

            {editingServiceId && (
              <div className="mt-4 rounded-2xl bg-[#fcf0ef] p-4 text-sm text-[#8a5f63]">
                Estás editando un servicio existente.
              </div>
            )}

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Categoría *
                </label>
                <input
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  placeholder="Ej. Extensiones de Uñas"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Nombre del servicio *
                </label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  placeholder="Ej. Softgel"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm text-[#6d5a58]">
                    Precio base
                  </label>
                  <input
                    type="number"
                    name="base_price"
                    value={form.base_price}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#6d5a58]">
                    Duración min.
                  </label>
                  <input
                    type="number"
                    name="duration_minutes"
                    value={form.duration_minutes}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#6d5a58]">
                    Limpieza min.
                  </label>
                  <input
                    type="number"
                    name="cleanup_minutes"
                    value={form.cleanup_minutes}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Tipo
                </label>
                <select
                  name="service_type"
                  value={form.service_type}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                >
                  <option value="servicio">Servicio</option>
                  <option value="extra">Extra</option>
                  <option value="decoracion">Decoración</option>
                  <option value="retiro">Retiro</option>
                  <option value="promocion">Promoción</option>
                </select>
              </div>

              <label className="flex items-center gap-2 rounded-2xl bg-[#fcf7f6] p-4 text-sm text-[#6d5a58]">
                <input
                  type="checkbox"
                  name="variable_pricing"
                  checked={form.variable_pricing}
                  onChange={handleChange}
                />
                Precio variable / requiere cotización
              </label>

              <label className="flex items-center gap-2 rounded-2xl bg-[#fcf7f6] p-4 text-sm text-[#6d5a58]">
                <input
                  type="checkbox"
                  name="active"
                  checked={form.active}
                  onChange={handleChange}
                />
                Servicio activo
              </label>

              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Notas de precio
                </label>
                <input
                  name="pricing_notes"
                  value={form.pricing_notes}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  placeholder="Ej. Precio desde $650 / requiere valoración"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Descripción
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  className="min-h-32 w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  placeholder="Descripción del servicio..."
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {saving
                  ? "Guardando..."
                  : editingServiceId
                  ? "Guardar cambios"
                  : "Crear servicio"}
              </button>

              {editingServiceId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-full border border-[#bd7b83] px-6 py-4 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>

          <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.10)]">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
                  Catálogo
                </p>
                <h2 className="mt-3 text-2xl font-light">
                  Servicios registrados
                </h2>
                <p className="mt-2 text-sm text-[#6d5a58]">
                  Total: {services.length}
                </p>
              </div>

              <button
                onClick={loadServices}
                className="rounded-full border border-[#bd7b83] px-5 py-3 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
              >
                Actualizar
              </button>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                placeholder="Buscar servicio..."
              />

              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
              >
                <option value="">Todas las categorías</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-6 space-y-4">
              {loadingServices ? (
                <p className="text-sm text-[#6d5a58]">Cargando servicios...</p>
              ) : filteredServices.length === 0 ? (
                <div className="rounded-2xl bg-[#fcf7f6] p-5 text-sm text-[#6d5a58]">
                  No hay servicios con esos filtros.
                </div>
              ) : (
                filteredServices.map((service) => (
                  <div
                    key={service.id}
                    className={`rounded-2xl border p-5 ${
                      service.active
                        ? "border-[#ead2cf] bg-[#fdf8f6]"
                        : "border-[#ead2cf] bg-[#f5eeee] opacity-70"
                    }`}
                  >
                    <div className="flex flex-col justify-between gap-4 md:flex-row">
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                          {service.category}
                        </p>

                        <h3 className="mt-2 text-xl font-light">
                          {service.name}
                        </h3>

                        <div className="mt-3 grid gap-2 text-sm text-[#6d5a58] sm:grid-cols-2">
                          <p>Precio: ${service.base_price || 0}</p>
                          <p>Duración: {service.duration_minutes || 0} min</p>
                          <p>Limpieza: {service.cleanup_minutes || 0} min</p>
                          <p>Tipo: {service.service_type || "servicio"}</p>
                        </div>

                        {service.variable_pricing && (
                          <p className="mt-3 rounded-full bg-[#fcf0ef] px-3 py-1 text-xs text-[#8a5f63]">
                            Precio variable / requiere cotización
                          </p>
                        )}

                        {service.pricing_notes && (
                          <p className="mt-3 text-sm text-[#6d5a58]">
                            {service.pricing_notes}
                          </p>
                        )}

                        {service.description && (
                          <p className="mt-3 text-sm leading-6 text-[#6d5a58]">
                            {service.description}
                          </p>
                        )}
                      </div>

                      <div className="flex min-w-36 flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(service)}
                          className="rounded-full border border-[#bd7b83] px-4 py-2 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleActive(service)}
                          className="rounded-full bg-[#f2e4e1] px-4 py-2 text-sm text-[#8a5f63] transition hover:bg-[#edd8d4]"
                        >
                          {service.active ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}