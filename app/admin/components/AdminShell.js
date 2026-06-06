"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function AdminShell({
  title = "Panel administrativo",
  subtitle = "",
  activeModule = "",
  menuItems = [],
  activeSection = "",
  setActiveSection,
  children,
}) {
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [sessionEmail, setSessionEmail] = useState("");

  useEffect(() => {
    const start = async () => {
      const { data } = await supabase.auth.getSession();

      if (data.session?.user?.email) {
        setSessionEmail(data.session.user.email);
      }

      await loadUnreadNotifications();
    };

    start();
  }, []);

  const loadUnreadNotifications = async () => {
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("is_read", false);

    if (!error) {
      setUnreadNotifications(count || 0);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/admin";
  };

  const mainModules = [
    { label: "Inicio", href: "/admin", key: "inicio" },
    { label: "Clientas", href: "/admin/clientas", key: "clientas" },
    { label: "Servicios", href: "/admin/servicios", key: "servicios" },
    { label: "Crear cita", href: "/admin/agenda", key: "agenda" },
    { label: "Técnicas / Personal", href: "/admin/tecnicas", key: "tecnicas" },
    { label: "Tareas", href: "/admin/tareas", key: "tareas" },
    {
      label: "Notificaciones",
      href: "/admin/notificaciones",
      key: "notificaciones",
      badge: unreadNotifications,
    },
  ];

 const futureModules = [
  "Caja próximamente",
  "Tienda / Productos próximamente",
  "Membresías próximamente",
  "Tarjetas de regalo próximamente",
  "Reportes próximamente",
  "Bot / WhatsApp próximamente",
];

  return (
    <main className="min-h-screen bg-[#eef1f3] text-[#263238]">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-[#dde3e6] bg-white p-6 lg:block">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              Alexandra Ruiz
            </p>
            <h1 className="mt-2 text-2xl font-light">Sistema interno</h1>
          </div>

          <nav className="space-y-2">
            {mainModules.map((item) => (
              <a
                key={item.key}
                href={item.href}
                className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm transition ${
                  activeModule === item.key
                    ? "bg-[#bd7b83] text-white"
                    : "text-[#536166] hover:bg-[#f7eeee]"
                }`}
              >
                <span>{item.label}</span>

                {item.badge > 0 && (
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-bold ${
                      activeModule === item.key
                        ? "bg-white text-[#d6007f]"
                        : "bg-[#d6007f] text-white"
                    }`}
                  >
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </a>
            ))}

            {menuItems.length > 0 && (
              <>
                <div className="my-4 border-t border-[#edf0f2]" />

                <p className="px-4 text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                  Secciones
                </p>

                {menuItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveSection(item.key)}
                    className={`w-full rounded-2xl px-4 py-3 text-left text-sm transition ${
                      activeSection === item.key
                        ? "bg-[#bd7b83] text-white"
                        : "text-[#536166] hover:bg-[#f7eeee]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </>
            )}

            <div className="my-4 border-t border-[#edf0f2]" />

            {futureModules.map((item) => (
              <span
                key={item}
                className="block rounded-2xl px-4 py-3 text-sm text-[#9aa4a8]"
              >
                {item}
              </span>
            ))}
          </nav>
        </aside>

        <section className="flex-1">
          <header className="sticky top-0 z-30 border-b border-[#dde3e6] bg-white/95 px-4 py-4 backdrop-blur md:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
                  Panel administrativo
                </p>

                <h2 className="mt-1 text-3xl font-light">{title}</h2>

                {subtitle && (
                  <p className="mt-1 text-sm text-[#68777c]">{subtitle}</p>
                )}

                {sessionEmail && (
                  <p className="mt-1 text-xs text-[#8a969a]">
                    Sesión activa: {sessionEmail}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <a
                  href="/admin/notificaciones"
                  className={`relative flex h-12 w-12 items-center justify-center rounded-full border transition ${
                    unreadNotifications > 0
                      ? "animate-pulse border-[#d6007f] bg-[#d6007f] text-white shadow-[0_0_25px_rgba(214,0,127,0.45)]"
                      : "border-[#bd7b83] bg-white text-[#bd7b83] hover:bg-[#bd7b83] hover:text-white"
                  }`}
                  title="Notificaciones"
                >
                  <span className="text-xl">🔔</span>

                  {unreadNotifications > 0 && (
                    <span className="absolute -right-2 -top-2 flex min-h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-xs font-bold text-[#d6007f] shadow-md">
                      {unreadNotifications > 99
                        ? "99+"
                        : unreadNotifications}
                    </span>
                  )}
                </a>

                <button
                  onClick={handleLogout}
                  className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                >
                  Cerrar sesión
                </button>
              </div>
            </div>

            {menuItems.length > 0 && (
              <div className="mt-4 flex gap-2 overflow-auto lg:hidden">
                {menuItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveSection(item.key)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm ${
                      activeSection === item.key
                        ? "bg-[#bd7b83] text-white"
                        : "bg-[#f7eeee] text-[#8a5f63]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </header>

          <div className="p-4 md:p-8">{children}</div>
        </section>
      </div>
    </main>
  );
}