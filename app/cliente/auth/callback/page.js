"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

function sanitizeNextPath(value) {
  const next = String(value || "").trim();

  if (!next || !next.startsWith("/cliente") || next.startsWith("//")) {
    return "/cliente/login?confirmed=1";
  }

  return next;
}

function appendConfirmedParam(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}confirmed=1`;
}

export default function ClienteAuthCallbackPage() {
  const [message, setMessage] = useState("Confirmando tu correo...");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const next = sanitizeNextPath(params.get("next") || "/cliente/agenda");

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) throw error;

          window.location.replace(appendConfirmedParam(next));
          return;
        }

        const { data } = await supabase.auth.getSession();

        if (data.session) {
          window.location.replace(appendConfirmedParam(next));
          return;
        }

        window.location.replace("/cliente/login?confirmed=1");
      } catch (error) {
        console.error("[cliente/auth/callback] confirm_error", error);
        setMessage("");
        setErrorMessage(
          "No pudimos completar la confirmación automáticamente. Intenta iniciar sesión; si tu correo ya fue confirmado, podrás entrar al portal."
        );
      }
    };

    handleCallback();
  }, []);

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#fff8f6_0%,#f6e7e3_50%,#fff_100%)] px-5 py-8 text-[#3b2b2d]">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
        <div className="rounded-[2rem] border border-white/80 bg-white/90 p-7 text-center shadow-[0_24px_70px_rgba(189,123,131,0.18)]">
          <p className="text-xs uppercase tracking-[0.35em] text-[#bd7b83]">
            Portal de clientas
          </p>
          <h1 className="mt-3 text-3xl font-light">
            Confirmación de correo
          </h1>

          {message && (
            <p className="mt-4 text-sm leading-6 text-[#765d5f]">{message}</p>
          )}

          {errorMessage && (
            <>
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
                {errorMessage}
              </div>
              <Link
                href="/cliente/login?confirmed=1"
                className="mt-5 inline-flex rounded-full bg-[#bd7b83] px-6 py-3 text-sm text-white transition hover:opacity-90"
              >
                Ir al login
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
