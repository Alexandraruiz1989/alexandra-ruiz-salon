"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function ClientasPage() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingClients, setLoadingClients] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    birthday: "",
    gender: "",
    notes: "",
  });

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        window.location.href = "/admin";
        return;
      }

      setSession(data.session);
      setLoadingSession(false);
      loadClients();
    };

    getSession();
  }, []);

  const loadClients = async () => {
    setLoadingClients(true);
    setMessage("");

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(`Error al cargar clientas: ${error.message}`);
    } else {
      setClients(data || []);
    }

    setLoadingClients(false);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setForm({
      full_name: "",
      phone: "",
      email: "",
      birthday: "",
      gender: "",
      notes: "",
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    if (!form.full_name.trim() || !form.phone.trim()) {
      setMessage("El nombre completo y el teléfono son obligatorios.");
      setSaving(false);
      return;
    }

    const newClient = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      birthday: form.birthday || null,
      gender: form.gender || null,
      notes: form.notes.trim() || null,
    };

    const { error } = await supabase.from("clients").insert([newClient]);

    if (error) {
      setMessage(`No se pudo guardar la clienta: ${error.message}`);
    } else {
      setMessage("Clienta registrada correctamente ✨");
      resetForm();
      await loadClients();
    }

    setSaving(false);
  };

  const filteredClients = useMemo(() => {
    const term = search.toLowerCase().trim();

    if (!term) return clients;

    return clients.filter((client) => {
      return (
        client.full_name?.toLowerCase().includes(term) ||
        client.phone?.toLowerCase().includes(term) ||
        client.email?.toLowerCase().includes(term)
      );
    });
  }, [clients, search]);

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
            <h1 className="mt-3 text-4xl font-light">Clientas</h1>
            <p className="mt-2 text-sm text-[#6d5a58]">
              Registra clientas, datos de contacto, cumpleaños y notas.
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

        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <form
            onSubmit={handleSubmit}
            className="h-fit rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.10)]"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              Nueva clienta
            </p>

            <h2 className="mt-3 text-2xl font-light">Registrar datos</h2>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Nombre completo *
                </label>
                <input
                  name="full_name"
                  value={form.full_name}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  placeholder="Ej. María López"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Teléfono / WhatsApp *
                </label>
                <input
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  placeholder="Ej. 9991234567"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  placeholder="Ej. clienta@email.com"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Fecha de cumpleaños
                </label>
                <input
                  type="date"
                  name="birthday"
                  value={form.birthday}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Género
                </label>
                <select
                  name="gender"
                  value={form.gender}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                >
                  <option value="">No especificado</option>
                  <option value="Mujer">Mujer</option>
                  <option value="Hombre">Hombre</option>
                  <option value="Otro">Otro</option>
                  <option value="Prefiere no decir">Prefiere no decir</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Notas
                </label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  className="min-h-28 w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  placeholder="Ej. alergias, preferencias, colores favoritos, observaciones..."
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-6 w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar clienta"}
            </button>
          </form>

          <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.10)]">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
                  Base de datos
                </p>
                <h2 className="mt-3 text-2xl font-light">
                  Clientas registradas
                </h2>
                <p className="mt-2 text-sm text-[#6d5a58]">
                  Total: {clients.length}
                </p>
              </div>

              <button
                onClick={loadClients}
                className="rounded-full border border-[#bd7b83] px-5 py-3 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
              >
                Actualizar
              </button>
            </div>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="mt-6 w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
              placeholder="Buscar por nombre, teléfono o correo..."
            />

            <div className="mt-6 space-y-4">
              {loadingClients ? (
                <p className="text-sm text-[#6d5a58]">Cargando clientas...</p>
              ) : filteredClients.length === 0 ? (
                <div className="rounded-2xl bg-[#fcf7f6] p-5 text-sm text-[#6d5a58]">
                  Todavía no hay clientas registradas.
                </div>
              ) : (
                filteredClients.map((client) => (
                  <div
                    key={client.id}
                    className="rounded-2xl border border-[#ead2cf] bg-[#fdf8f6] p-5"
                  >
                    <div className="flex flex-col justify-between gap-3 md:flex-row">
                      <div>
                        <h3 className="text-xl font-light">
                          {client.full_name}
                        </h3>

                        <p className="mt-2 text-sm text-[#6d5a58]">
                          WhatsApp: {client.phone}
                        </p>

                        {client.email && (
                          <p className="text-sm text-[#6d5a58]">
                            Correo: {client.email}
                          </p>
                        )}

                        {client.birthday && (
                          <p className="text-sm text-[#6d5a58]">
                            Cumpleaños: {client.birthday}
                          </p>
                        )}

                        {client.gender && (
                          <p className="text-sm text-[#6d5a58]">
                            Género: {client.gender}
                          </p>
                        )}
                      </div>

                      <a
                        href={`https://wa.me/52${client.phone}`}
                        target="_blank"
                        className="h-fit rounded-full border border-[#bd7b83] px-4 py-2 text-center text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                      >
                        WhatsApp
                      </a>
                    </div>

                    {client.notes && (
                      <p className="mt-4 rounded-xl bg-white p-3 text-sm text-[#6d5a58]">
                        {client.notes}
                      </p>
                    )}
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