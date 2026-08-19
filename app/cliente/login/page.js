"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { getPortalSession, portalFetch, signOutClient } from "../components/portalApi";
import { PortalMessage } from "../components/ClientPortalShell";

export default function ClienteLoginPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("info");
  const [showPassword, setShowPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [existingSession, setExistingSession] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const session = await getPortalSession();
      if (session) {
        setExistingSession(true);
        setCheckingSession(false);
        return;
      }

      const params = new URLSearchParams(window.location.search);

      if (params.get("confirmed") === "1") {
        setTone("success");
        setMessage(
          "Tu correo fue confirmado. Ya puedes iniciar sesión para agendar tu cita."
        );
      }
      setCheckingSession(false);
    };

    checkSession();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.trim(),
      password: form.password,
    });

    if (error) {
      setTone("error");
      setMessage("No pudimos iniciar sesión. Revisa tu correo y contraseña.");
      setLoading(false);
      return;
    }

    try {
      const profile = await portalFetch("/api/client/profile");
      window.location.href = profile.profile_required
        ? "/cliente/perfil?next=/cliente/agenda"
        : "/cliente/agenda";
    } catch (profileError) {
      setTone("error");
      setMessage(profileError.message);
      setLoading(false);
    }
  };

  const handleContinueCurrentSession = async () => {
    setLoading(true);
    setMessage("");

    try {
      const profile = await portalFetch("/api/client/profile");
      window.location.href = profile.profile_required
        ? "/cliente/perfil?next=/cliente/agenda"
        : "/cliente/agenda";
    } catch (error) {
      setTone("error");
      setMessage(error.message);
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    setMessage("");
    await signOutClient();
    setExistingSession(false);
    setTone("success");
    setMessage("Sesión cerrada. Ahora puedes iniciar sesión como clienta.");
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#fff8f6_0%,#f6e7e3_50%,#fff_100%)] px-5 py-8 text-[#3b2b2d]">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
        <div className="rounded-[2rem] border border-white/80 bg-white/90 p-7 shadow-[0_24px_70px_rgba(189,123,131,0.18)]">
          <p className="text-xs uppercase tracking-[0.35em] text-[#bd7b83]">
            Portal de clientas
          </p>
          <h1 className="mt-3 text-4xl font-light">Iniciar sesión</h1>
          <p className="mt-2 text-sm leading-6 text-[#765d5f]">
            Entra para agendar y revisar tus citas en Alexandra Ruiz Salón.
          </p>

          {checkingSession ? (
            <div className="mt-7 rounded-3xl bg-[#fff8f6] p-5 text-sm text-[#765d5f]">
              Revisando sesión...
            </div>
          ) : existingSession ? (
            <div className="mt-7 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
              <p className="font-medium">Ya hay una sesión iniciada.</p>
              <p className="mt-1">
                Si quieres entrar con una cuenta de clienta diferente, primero
                cierra la sesión actual. Así evitamos mezclar cuentas del salón
                con cuentas de clientas.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleContinueCurrentSession}
                  disabled={loading}
                  className="rounded-full bg-[#bd7b83] px-6 py-3 text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  Continuar con esta sesión
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={loading}
                  className="rounded-full border border-[#bd7b83] bg-white px-6 py-3 text-[#bd7b83] transition hover:bg-[#fff3f1] disabled:opacity-60"
                >
                  Cerrar sesión
                </button>
              </div>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label className="mb-2 block text-sm text-[#765d5f]">
                Correo
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                className="w-full rounded-2xl border border-[#ead8d4] bg-[#fff8f6] px-4 py-3 outline-none focus:border-[#bd7b83]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#765d5f]">
                Contraseña
              </label>
              <div className="flex rounded-2xl border border-[#ead8d4] bg-[#fff8f6] focus-within:border-[#bd7b83]">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  className="min-w-0 flex-1 rounded-l-2xl bg-transparent px-4 py-3 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="shrink-0 px-4 text-sm text-[#bd7b83]"
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            <PortalMessage message={message} tone={tone} />

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
          )}

          <p className="mt-6 text-center text-sm text-[#765d5f]">
            ¿Primera vez?{" "}
            <Link href="/cliente/registro" className="text-[#bd7b83] underline">
              Crear cuenta
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
