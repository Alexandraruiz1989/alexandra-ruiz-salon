"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function ClientDetailPage() {
  const params = useParams();
  const clientId = params?.id;

  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const start = async () => {
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session) {
        window.location.href = "/admin";
        return;
      }

      if (!clientId) {
        setMessage("No se encontró el ID de la clienta.");
        setLoading(false);
        return;
      }

      await loadClient(clientId);
      setLoading(false);
    };

    start();
  }, [clientId]);

  const loadClient = async (id) => {
    setMessage("");

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      setMessage(`No se pudo cargar la clienta: ${error.message}`);
    } else {
      setClient(data);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/admin";
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#fdf8f6] px-6 py-10 text-[#352829]">
        <p>Cargando...</p>
      </main>
    );
  }

  if (message) {
    return (
      <main className="min-h-screen bg-[#fdf8f6] px-6 py-10 text-[#352829]">
        <section className="mx-auto max-w-4xl rounded-[2rem] border border-[#ecd8d4] bg-white p-8">
          <p className="text-[#8a5f63]">{message}</p>
          <a href="/admin/clientas" className="mt-6 inline-block text-[#bd7b83]">
            Volver a clientas
          </a>
        </section>
      </main>
    );
  }

  if (!client) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#fcf7f6] to-[#f6e9e6] px-4 py-8 text-[#352829] md:px-8">
      <section className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.08)] md:flex-row md:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[#bd7b83]">
              Historial de clienta
            </p>
            <h1 className="mt-3 text-4xl font-light">{client.full_name}</h1>
            <p className="mt-2 text-sm text-[#6d5a58]">
              Perfil, datos de contacto e historial del salón.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href="/admin/clientas"
              className="rounded-full border border-[#bd7b83] px-6 py-3 text-center text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
            >
              Volver a clientas
            </a>

            <button
              onClick={handleLogout}
              className="rounded-full bg-[#f2e4e1] px-6 py-3 text-[#8a5f63] transition hover:bg-[#edd8d4]"
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.10)]">
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              Datos generales
            </p>

            <h2 className="mt-3 text-2xl font-light">
              Información de contacto
            </h2>

            <div className="mt-6 space-y-4 text-sm text-[#6d5a58]">
              <div className="rounded-2xl bg-[#fcf7f6] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                  WhatsApp
                </p>
                <p className="mt-1 text-lg text-[#352829]">{client.phone}</p>
              </div>

              <div className="rounded-2xl bg-[#fcf7f6] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                  Correo
                </p>
                <p className="mt-1 text-lg text-[#352829]">
                  {client.email || "Sin correo registrado"}
                </p>
              </div>

              <div className="rounded-2xl bg-[#fcf7f6] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                  Cumpleaños
                </p>
                <p className="mt-1 text-lg text-[#352829]">
                  {client.birthday || "Sin cumpleaños registrado"}
                </p>
              </div>

              <div className="rounded-2xl bg-[#fcf7f6] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                  Género
                </p>
                <p className="mt-1 text-lg text-[#352829]">
                  {client.gender || "No especificado"}
                </p>
              </div>

              <div className="rounded-2xl bg-[#fcf7f6] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                  Notas
                </p>
                <p className="mt-1 whitespace-pre-line text-[#352829]">
                  {client.notes || "Sin notas registradas"}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <a
                href={`https://wa.me/52${client.phone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-[#bd7b83] px-6 py-4 text-center text-white transition hover:opacity-90"
              >
                Enviar WhatsApp
              </a>

              <a
                href="/admin/clientas"
                className="rounded-full border border-[#bd7b83] px-6 py-4 text-center text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
              >
                Editar desde listado
              </a>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.10)]">
              <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
                Próximamente
              </p>
              <h2 className="mt-3 text-2xl font-light">Historial de citas</h2>
              <p className="mt-3 text-sm text-[#6d5a58]">
                Aquí aparecerán sus citas anteriores, servicios realizados,
                técnica que atendió, total pagado y notas de cada visita.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 opacity-70 shadow-[0_20px_60px_rgba(189,123,131,0.10)]">
                <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
                  Próximamente
                </p>
                <h2 className="mt-3 text-2xl font-light">Membresías</h2>
                <p className="mt-3 text-sm text-[#6d5a58]">
                  Membresías activas, servicios restantes, vigencia y descuentos.
                </p>
              </div>

              <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 opacity-70 shadow-[0_20px_60px_rgba(189,123,131,0.10)]">
                <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
                  Próximamente
                </p>
                <h2 className="mt-3 text-2xl font-light">
                  Tarjetas de regalo
                </h2>
                <p className="mt-3 text-sm text-[#6d5a58]">
                  Códigos activos, saldos disponibles e historial de uso.
                </p>
              </div>
            </div>

            <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 opacity-70 shadow-[0_20px_60px_rgba(189,123,131,0.10)]">
              <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
                Próximamente
              </p>
              <h2 className="mt-3 text-2xl font-light">Pagos y tickets</h2>
              <p className="mt-3 text-sm text-[#6d5a58]">
                Resumen de pagos, anticipos, saldos pendientes y tickets enviados.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}