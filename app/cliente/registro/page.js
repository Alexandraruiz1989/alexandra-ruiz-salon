"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { portalFetch } from "../components/portalApi";
import { PortalMessage } from "../components/ClientPortalShell";

export default function ClienteRegistroPage() {
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    password: "",
    confirm_password: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("info");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const fullName = form.full_name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim().toLowerCase();
    const password = form.password;
    const confirmPassword = form.confirm_password;

    if (!fullName || !phone || !email) {
      setTone("error");
      setMessage(
        "Completa tu nombre, teléfono y correo para crear tu cuenta."
      );
      setLoading(false);
      return;
    }

    if (!password) {
      setTone("error");
      setMessage("Escribe una contraseña.");
      setLoading(false);
      return;
    }

    if (!confirmPassword) {
      setTone("error");
      setMessage("Confirma tu contraseña.");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setTone("error");
      setMessage("La contraseña debe tener al menos 6 caracteres.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setTone("error");
      setMessage("Las contraseñas no coinciden.");
      setLoading(false);
      return;
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== "undefined"
        ? window.location.origin
        : "https://www.alexandraruizsalon.com");
    const cleanSiteUrl = String(siteUrl).replace(/\/$/, "");
    const emailRedirectTo = `${cleanSiteUrl}/cliente/login?confirmed=1`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          full_name: fullName,
          phone,
          role: "client",
          user_type: "clienta",
        },
      },
    });

    if (error) {
      setTone("error");
      setMessage(error.message || "No se pudo crear tu cuenta.");
      setLoading(false);
      return;
    }

    if (!data.session) {
      setTone("success");
      setMessage(
        "Te enviamos un correo para confirmar tu cuenta. Revisa tu bandeja de entrada o spam. Después de confirmar, podrás entrar al portal para agendar."
      );
      setLoading(false);
      return;
    }

    try {
      await portalFetch("/api/client/profile", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName,
          phone,
          email,
        }),
      });

      await supabase.auth.signOut();
      setTone("success");
      setMessage(
        "Te enviamos un correo para confirmar tu cuenta. Revisa tu bandeja de entrada o spam. Después de confirmar, podrás entrar al portal para agendar."
      );
      setLoading(false);
    } catch (profileError) {
      setTone("error");
      setMessage(profileError.message);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#fff8f6_0%,#f6e7e3_50%,#fff_100%)] px-5 py-8 text-[#3b2b2d]">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col justify-center">
        <div className="rounded-[2rem] border border-white/80 bg-white/90 p-7 shadow-[0_24px_70px_rgba(189,123,131,0.18)]">
          <p className="text-xs uppercase tracking-[0.35em] text-[#bd7b83]">
            Portal de clientas
          </p>
          <h1 className="mt-3 text-4xl font-light">Crear cuenta</h1>
          <p className="mt-2 text-sm leading-6 text-[#765d5f]">
            Si ya estás registrada en el salón, ligaremos tu cuenta con tu ficha
            existente usando tu correo o teléfono.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
            <div>
              <label className="mb-2 block text-sm text-[#765d5f]">
                Nombre completo
              </label>
              <input
                name="full_name"
                value={form.full_name}
                onChange={handleChange}
                required
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
                required
                className="w-full rounded-2xl border border-[#ead8d4] bg-[#fff8f6] px-4 py-3 outline-none focus:border-[#bd7b83]"
              />
            </div>

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
                  minLength={6}
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

            <div>
              <label className="mb-2 block text-sm text-[#765d5f]">
                Confirmar contraseña
              </label>
              <div className="flex rounded-2xl border border-[#ead8d4] bg-[#fff8f6] focus-within:border-[#bd7b83]">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirm_password"
                  value={form.confirm_password}
                  onChange={handleChange}
                  required
                  minLength={6}
                  className="min-w-0 flex-1 rounded-l-2xl bg-transparent px-4 py-3 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  className="shrink-0 px-4 text-sm text-[#bd7b83]"
                >
                  {showConfirmPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            <PortalMessage message={message} tone={tone} />

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Creando cuenta..." : "Crear cuenta"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#765d5f]">
            ¿Ya tienes cuenta?{" "}
            <Link href="/cliente/login" className="text-[#bd7b83] underline">
              Inicia sesión
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
