"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function AdminPage() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("alexandraruizsalon@gmail.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setLoading(false);
    };

    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setMessage(`No se pudo iniciar sesión: ${error.message}`);
    } else {
      setMessage("Sesión iniciada correctamente.");
    }

    setLoginLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#fdf8f6] px-6 py-10 text-[#352829]">
        <p>Cargando...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#fcf7f6] to-[#f6e9e6] px-6 py-10 text-[#352829]">
        <section className="mx-auto flex min-h-[80vh] max-w-md items-center">
          <div className="w-full rounded-[2rem] border border-[#ecd8d4] bg-white p-8 shadow-[0_25px_70px_rgba(189,123,131,0.15)]">
            <p className="text-xs uppercase tracking-[0.35em] text-[#bd7b83]">
              Alexandra Ruiz Salón
            </p>

            <h1 className="mt-4 text-4xl font-light">Acceso interno</h1>

            <p className="mt-3 text-sm leading-6 text-[#6d5a58]">
              Inicia sesión para entrar al sistema administrativo del salón.
            </p>

            <form onSubmit={handleLogin} className="mt-8 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Correo
                </label>
                <input
                  type="email"
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Contraseña
                </label>

                <input
                  type={showPassword ? "text" : "password"}
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />

                <label className="mt-3 flex items-center gap-2 text-sm text-[#6d5a58]">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(event) => setShowPassword(event.target.checked)}
                  />
                  Mostrar contraseña
                </label>
              </div>

              {message && (
                <p className="rounded-2xl bg-[#fcf0ef] px-4 py-3 text-sm text-[#8a5f63]">
                  {message}
                </p>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {loginLoading ? "Entrando..." : "Entrar"}
              </button>
            </form>

            <a
              href="/"
              className="mt-5 block text-center text-sm text-[#bd7b83]"
            >
              Volver a la web
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fdf8f6] px-6 py-10 text-[#352829]">
      <section className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col justify-between gap-4 rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.08)] md:flex-row md:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[#bd7b83]">
              Sistema interno
            </p>

            <h1 className="mt-3 text-4xl font-light">Panel administrativo</h1>

            <p className="mt-2 text-[#6d5a58]">
              Sesión activa: {session.user.email}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-full border border-[#bd7b83] px-6 py-3 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
          >
            Cerrar sesión
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <a
            href="/admin/clientas"
            className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_50px_rgba(189,123,131,0.08)] transition hover:-translate-y-1"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              Módulo
            </p>
            <h2 className="mt-3 text-2xl font-light">Clientas</h2>
            <p className="mt-3 text-sm text-[#6d5a58]">
              Registrar clientas, teléfono, correo, cumpleaños y consultar
              historial.
            </p>
          </a>

          <a
            href="/admin/servicios"
            className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_50px_rgba(189,123,131,0.08)] transition hover:-translate-y-1"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              Módulo
            </p>
            <h2 className="mt-3 text-2xl font-light">Servicios</h2>
            <p className="mt-3 text-sm text-[#6d5a58]">
              Editar precios, duración, limpieza, descripción y servicios
              activos.
            </p>
          </a>

          <a
            href="/admin/agenda"
            className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_50px_rgba(189,123,131,0.08)] transition hover:-translate-y-1"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              Módulo
            </p>
            <h2 className="mt-3 text-2xl font-light">Agenda</h2>
            <p className="mt-3 text-sm text-[#6d5a58]">
              Registrar citas, asignar técnica, anticipos y consultar agenda
              diaria.
            </p>
          </a>

          <a
            href="/admin/tecnicas"
            className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_50px_rgba(189,123,131,0.08)] transition hover:-translate-y-1"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              Módulo
            </p>
            <h2 className="mt-3 text-2xl font-light">Técnicas / Personal</h2>
            <p className="mt-3 text-sm text-[#6d5a58]">
              Colaboradores, horarios, descansos, vacaciones, permisos, retardos
              e incidencias.
            </p>
          </a>

         <a
  href="/admin/tareas"
  className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_50px_rgba(189,123,131,0.08)] transition hover:-translate-y-1"
>
  <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
    Módulo
  </p>
  <h2 className="mt-3 text-2xl font-light">Tareas</h2>
  <p className="mt-3 text-sm text-[#6d5a58]">
    Asignar tareas al personal, revisar pendientes y marcar avances.
  </p>
</a>

          <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 opacity-60 shadow-[0_20px_50px_rgba(189,123,131,0.08)]">
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              Próximamente
            </p>
            <h2 className="mt-3 text-2xl font-light">Membresías</h2>
            <p className="mt-3 text-sm text-[#6d5a58]">
              Servicios incluidos, vigencia, descuentos y usos por clienta.
            </p>
          </div>

          <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 opacity-60 shadow-[0_20px_50px_rgba(189,123,131,0.08)]">
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              Próximamente
            </p>
            <h2 className="mt-3 text-2xl font-light">Tarjetas de regalo</h2>
            <p className="mt-3 text-sm text-[#6d5a58]">
              Venta, códigos, saldos e historial de uso.
            </p>
          </div>

          <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 opacity-60 shadow-[0_20px_50px_rgba(189,123,131,0.08)]">
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              Próximamente
            </p>
            <h2 className="mt-3 text-2xl font-light">Tareas</h2>
            <p className="mt-3 text-sm text-[#6d5a58]">
              Asignar tareas al personal, revisar pendientes y marcar avances.
            </p>
          </div>

          <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 opacity-60 shadow-[0_20px_50px_rgba(189,123,131,0.08)]">
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              Próximamente
            </p>
            <h2 className="mt-3 text-2xl font-light">Reportes</h2>
            <p className="mt-3 text-sm text-[#6d5a58]">
              Citas, servicios, ventas, anticipos, comisiones, clientas,
              retardos, faltas, permisos, vacaciones y descansos.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}