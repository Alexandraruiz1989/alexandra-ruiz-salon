"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function CrearPasswordPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const start = async () => {
      const { data } = await supabase.auth.getSession();

      if (data.session) {
        setHasSession(true);
      } else {
        setHasSession(false);
        setMessage(
          "El enlace no tiene una sesión activa o ya expiró. Pide que te envíen una nueva invitación."
        );
      }

      setLoading(false);
    };

    start();
  }, []);

  const savePassword = async () => {
    setMessage("");

    if (!password || password.length < 6) {
      setMessage("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setMessage(`No se pudo guardar la contraseña: ${error.message}`);
      setSaving(false);
      return;
    }

    setMessage("Contraseña creada correctamente ✨ Redirigiendo al sistema...");

    setTimeout(() => {
      window.location.href = "/admin";
    }, 1800);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef1f3] px-6 text-[#263238]">
        <div className="w-full max-w-md rounded-[1.5rem] bg-white p-8 shadow-sm">
          <p className="text-sm text-[#68777c]">Validando invitación...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef1f3] px-6 text-[#263238]">
      <div className="w-full max-w-md rounded-[1.5rem] bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
          Alexandra Ruiz
        </p>

        <h1 className="mt-2 text-3xl font-light">Crear contraseña</h1>

        <p className="mt-3 text-sm leading-6 text-[#68777c]">
          Crea tu contraseña para poder entrar al sistema del salón desde la
          página inicial cuando lo necesites.
        </p>

        {message && (
          <div
            className={`mt-5 rounded-2xl px-4 py-3 text-sm font-medium ${
              message.toLowerCase().includes("correctamente")
                ? "bg-green-600 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            {message}
          </div>
        )}

        {hasSession && (
          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm text-[#68777c]">
                Nueva contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#68777c]">
                Confirmar contraseña
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                placeholder="Repite la contraseña"
              />
            </div>

            <button
              type="button"
              onClick={savePassword}
              disabled={saving}
              className="w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar contraseña"}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            window.location.href = "/admin";
          }}
          className="mt-4 w-full rounded-full border border-[#bd7b83] px-6 py-4 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
        >
          Ir al inicio de sesión
        </button>
      </div>
    </main>
  );
}