"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ClientPortalShell, {
  PortalCard,
  PortalMessage,
} from "../components/ClientPortalShell";
import { portalFetch } from "../components/portalApi";

export default function ClientePerfilPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [client, setClient] = useState(null);
  const [form, setForm] = useState({ full_name: "", phone: "" });
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("info");
  const [returnToAgenda] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.get("next") === "/cliente/agenda";
  });

  useEffect(() => {
    let active = true;

    async function loadInitialProfile() {
      try {
        const data = await portalFetch("/api/client/profile");
        if (!active) return;
        setClient(data.client);
        setForm({
          full_name: data.client?.full_name || "",
          phone: data.client?.phone || "",
        });
      } catch (error) {
        if (!active) return;
        setTone("error");
        setMessage(error.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadInitialProfile();

    return () => {
      active = false;
    };
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const data = await portalFetch("/api/client/profile", {
        method: "POST",
        body: JSON.stringify(form),
      });

      setClient(data.client);
      setTone("success");
      setMessage("Perfil actualizado correctamente.");
      if (returnToAgenda) {
        window.location.href = "/cliente/agenda";
      }
    } catch (error) {
      setTone("error");
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ClientPortalShell
      title="Mi perfil"
      subtitle="Consulta y actualiza tus datos básicos de clienta."
    >
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <PortalCard>
          <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
            Datos de clienta
          </p>
          <h2 className="mt-2 text-2xl font-light">Tu información</h2>

          {loading ? (
            <p className="mt-5 text-sm text-[#765d5f]">Cargando perfil...</p>
          ) : (
            <div className="mt-5 space-y-3 text-sm text-[#765d5f]">
              <div className="rounded-3xl bg-[#fff8f6] p-4">
                <span className="block text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                  Número de cliente
                </span>
                <span className="mt-1 block text-xl font-light text-[#3b2b2d]">
                  {client?.client_number || "Pendiente"}
                </span>
              </div>
              <div className="rounded-3xl bg-[#fff8f6] p-4">
                <span className="block text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                  Correo
                </span>
                <span className="mt-1 block text-[#3b2b2d]">
                  {client?.email || "Sin correo"}
                </span>
              </div>
            </div>
          )}
        </PortalCard>

        <PortalCard>
          <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
            Actualizar
          </p>
          <h2 className="mt-2 text-2xl font-light">Nombre y teléfono</h2>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-sm text-[#765d5f]">
                Nombre completo
              </label>
              <input
                name="full_name"
                value={form.full_name}
                onChange={handleChange}
                className="w-full rounded-2xl border border-[#ead8d4] bg-[#fff8f6] px-4 py-3 outline-none focus:border-[#bd7b83]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#765d5f]">
                Teléfono / WhatsApp
              </label>
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full rounded-2xl border border-[#ead8d4] bg-[#fff8f6] px-4 py-3 outline-none focus:border-[#bd7b83]"
              />
            </div>

            <PortalMessage message={message} tone={tone} />

            {tone === "success" && !returnToAgenda && (
              <Link
                href="/cliente/agenda"
                className="inline-flex w-full justify-center rounded-full border border-[#d8b8b4] bg-white px-6 py-4 text-[#7a5558] transition hover:border-[#bd7b83] hover:text-[#bd7b83]"
              >
                Volver a Agenda
              </Link>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar perfil"}
            </button>
          </form>
        </PortalCard>
      </div>
    </ClientPortalShell>
  );
}
