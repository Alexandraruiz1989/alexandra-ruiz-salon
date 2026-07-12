"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getPortalSession, portalFetch, signOutClient } from "./portalApi";

const navItems = [
  { href: "/cliente/agenda", label: "Agendar" },
  { href: "/cliente/mis-citas", label: "Mis citas" },
  { href: "/cliente/perfil", label: "Perfil" },
];

export default function ClientPortalShell({
  children,
  title = "Portal de clientas",
  subtitle = "Tu espacio personal en Alexandra Ruiz Salón.",
}) {
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState(null);

  useEffect(() => {
    const start = async () => {
      const session = await getPortalSession();

      if (!session) {
        window.location.href = "/cliente/login";
        return;
      }

      try {
        const data = await portalFetch("/api/client/profile");
        setClient(data.client);
      } catch (error) {
        console.error("No se pudo cargar perfil de clienta", error);
      } finally {
        setLoading(false);
      }
    };

    start();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#fff8f6] px-6 py-10 text-[#3b2b2d]">
        <p>Cargando tu portal...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#fff8f6_0%,#f6e7e3_45%,#fdfaf7_100%)] px-4 py-5 text-[#3b2b2d] md:px-8 md:py-8">
      <section className="mx-auto max-w-6xl">
        <header className="mb-6 rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_80px_rgba(189,123,131,0.16)] backdrop-blur md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-[#bd7b83]">
                Alexandra Ruiz Salón
              </p>
              <h1 className="mt-3 text-3xl font-light md:text-5xl">{title}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#765d5f]">
                {subtitle}
              </p>
              {client && (
                <p className="mt-3 text-sm text-[#9a7074]">
                  Hola, {client.full_name || "clienta"}
                  {client.client_number ? ` · ${client.client_number}` : ""}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {navItems.map((item) => {
                const active = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-full px-4 py-3 text-sm transition ${
                      active
                        ? "bg-[#bd7b83] text-white shadow-lg shadow-[#bd7b83]/20"
                        : "bg-[#f8eeeb] text-[#7a5558] hover:bg-[#efd8d4]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}

              <button
                type="button"
                onClick={signOutClient}
                className="rounded-full border border-[#d8b8b4] bg-white px-4 py-3 text-sm text-[#7a5558] transition hover:border-[#bd7b83] hover:text-[#bd7b83]"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </header>

        {children}
      </section>
    </main>
  );
}

export function PortalCard({ children, className = "" }) {
  return (
    <div
      className={`rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(87,59,62,0.08)] ${className}`}
    >
      {children}
    </div>
  );
}

export function PortalMessage({ message, tone = "info" }) {
  if (!message) return null;

  const styles = {
    error: "border-red-200 bg-red-50 text-red-700",
    success: "border-green-200 bg-green-50 text-green-700",
    info: "border-[#efd8d4] bg-[#fff8f6] text-[#7a5558]",
  };

  return (
    <div className={`rounded-2xl border p-4 text-sm ${styles[tone] || styles.info}`}>
      {message}
    </div>
  );
}
