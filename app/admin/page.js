"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function AdminLoginPage() {
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [email, setEmail] = useState("alexandraruizsalon@gmail.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (data.session) {
        window.location.href = "/admin/agenda";
        return;
      }

      setLoading(false);
    };

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        window.location.href = "/admin/agenda";
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();

    setMessage("");

    if (!email.trim()) {
      setMessage("Escribe tu correo.");
      return;
    }

    if (!password.trim()) {
      setMessage("Escribe tu contraseña.");
      return;
    }

    setLoginLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setMessage(`No se pudo iniciar sesión: ${error.message}`);
      setLoginLoading(false);
      return;
    }

    window.location.href = "/admin/agenda";
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef1f3] px-6 text-[#263238]">
        <div className="w-full max-w-md rounded-[1.5rem] bg-white p-8 shadow-sm">
          <p className="text-sm text-[#68777c]">Cargando sistema...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef1f3] px-6 text-[#263238]">
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
          Alexandra Ruiz
        </p>

        <h1 className="mt-2 text-3xl font-light">Sistema interno</h1>

        <p className="mt-3 text-sm leading-6 text-[#68777c]">
          Ingresa con tu correo y contraseña para acceder al panel del salón.
        </p>

        {message && (
          <div className="mt-5 rounded-2xl bg-red-600 px-4 py-3 text-sm font-medium text-white">
            {message}
          </div>
        )}

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm text-[#68777c]">
              Correo
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              placeholder="correo@ejemplo.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-[#68777c]">
              Contraseña
            </label>

            <div className="flex rounded-2xl border border-[#dde3e6] bg-[#f7f9fa]">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-w-0 flex-1 rounded-l-2xl bg-transparent px-4 py-3 outline-none"
                placeholder="Tu contraseña"
              />

              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="px-4 text-sm text-[#bd7b83]"
              >
                {showPassword ? "Ocultar" : "Ver"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loginLoading}
            className="w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {loginLoading ? "Entrando..." : "Entrar al sistema"}
          </button>
        </form>
      </div>
    </main>
  );
}