"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const roleModulePermissions = {
  admin: [
    "inicio",
    "clientas",
    "servicios",
    "agenda",
    "cobros",
    "caja",
    "extras",
    "reportes",
    "tecnicas",
    "tareas",
    "configuracion",
    "calificaciones",
    "seguimientos",
    "notificaciones",
    "accesos",
  ],
  encargada: [
    "inicio",
    "clientas",
    "servicios",
    "agenda",
    "cobros",
    "caja",
    "extras",
    "reportes",
    "tareas",
    "calificaciones",
    "seguimientos",
    "notificaciones",
  ],
  tecnica: [
    "inicio",
    "clientas",
    "agenda",
    "cobros",
    "seguimientos",
    "notificaciones",
  ],
  caja: [
    "inicio",
    "clientas",
    "agenda",
    "cobros",
    "caja",
    "notificaciones",
  ],
};

const roleLabels = {
  admin: "Admin / Dueña",
  encargada: "Encargada",
  tecnica: "Técnica",
  caja: "Caja / Recepción",
};

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
  const [currentProfile, setCurrentProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    const start = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        window.location.href = "/admin";
        return;
      }

      if (data.session?.user?.email) {
        setSessionEmail(data.session.user.email);
        await loadCurrentProfile(data.session.user);
      } else {
        setLoadingProfile(false);
      }

      await loadUnreadNotifications();
    };

    start();
  }, []);

  const loadCurrentProfile = async (user) => {
    setLoadingProfile(true);

    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!error && data) {
      setCurrentProfile(data);
      setLoadingProfile(false);
      return;
    }

    const { data: profileByEmail, error: emailError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("email", user.email)
      .maybeSingle();

    if (!emailError && profileByEmail) {
      setCurrentProfile(profileByEmail);
      setLoadingProfile(false);
      return;
    }

    setCurrentProfile({
      email: user.email,
      full_name: user.email,
      role: "tecnica",
      active: true,
    });

    setLoadingProfile(false);
  };

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

  const profileRole = currentProfile?.role || "tecnica";
  const allowedModules =
    roleModulePermissions[profileRole] || roleModulePermissions.tecnica;

  const mainModules = [
    { label: "Inicio", href: "/admin", key: "inicio" },
    { label: "Clientas", href: "/admin/clientas", key: "clientas" },
    { label: "Servicios", href: "/admin/servicios", key: "servicios" },
    { label: "Agenda", href: "/admin/agenda", key: "agenda" },
    { label: "Cobros", href: "/admin/cobros", key: "cobros" },
    { label: "Caja chica", href: "/admin/caja", key: "caja" },
    { label: "Extras / Decoraciones", href: "/admin/extras", key: "extras" },
    { label: "Reportes", href: "/admin/reportes", key: "reportes" },
    { label: "Técnicas / Personal", href: "/admin/tecnicas", key: "tecnicas" },
    { label: "Tareas", href: "/admin/tareas", key: "tareas" },
    { label: "Configuración", href: "/admin/configuracion", key: "configuracion" },
    { label: "Calificaciones", href: "/admin/calificaciones", key: "calificaciones" },
    { label: "Seguimientos", href: "/admin/seguimientos", key: "seguimientos" },
    {
      label: "Notificaciones",
      href: "/admin/notificaciones",
      key: "notificaciones",
      badge: unreadNotifications,
    },
    { label: "Accesos", href: "/admin/accesos", key: "accesos" },
  ];

  const visibleMainModules = useMemo(() => {
    return mainModules.filter((item) => allowedModules.includes(item.key));
  }, [allowedModules, unreadNotifications]);

  const futureModules = [
    "Tienda / Productos próximamente",
    "Membresías próximamente",
    "Tarjetas de regalo próximamente",
    "Bot / WhatsApp próximamente",
  ];

  const isModuleAllowed =
    !activeModule || activeModule === "" || allowedModules.includes(activeModule);

  useEffect(() => {
    if (!loadingProfile && currentProfile?.active !== false && !isModuleAllowed) {
      const timer = setTimeout(() => {
        window.location.href = "/admin";
      }, 2500);

      return () => clearTimeout(timer);
    }
  }, [loadingProfile, currentProfile, isModuleAllowed]);

  if (loadingProfile) {
    return (
      <main className="min-h-screen bg-[#eef1f3] px-6 py-10 text-[#263238]">
        <p>Cargando permisos...</p>
      </main>
    );
  }

  if (currentProfile?.active === false) {
    return (
      <main className="min-h-screen bg-[#eef1f3] px-6 py-10 text-[#263238]">
        <div className="mx-auto max-w-xl rounded-[1.5rem] bg-white p-8 shadow-sm">
          <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
            Acceso desactivado
          </p>
          <h1 className="mt-2 text-2xl font-light">Tu acceso no está activo</h1>
          <p className="mt-3 text-sm leading-6 text-[#68777c]">
            Pide a administración que reactive tu cuenta para poder entrar al sistema.
          </p>

          <button
            onClick={handleLogout}
            className="mt-6 rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
          >
            Cerrar sesión
          </button>
        </div>
      </main>
    );
  }

  if (!isModuleAllowed) {
    return (
      <main className="min-h-screen bg-[#eef1f3] px-6 py-10 text-[#263238]">
        <div className="mx-auto max-w-xl rounded-[1.5rem] bg-white p-8 shadow-sm">
          <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
            Acceso no permitido
          </p>

          <h1 className="mt-2 text-2xl font-light">
            No tienes permiso para entrar a esta sección
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#68777c]">
            Tu rol actual es{" "}
            <span className="font-medium text-[#263238]">
              {roleLabels[profileRole] || profileRole}
            </span>
            . Esta sección está restringida para tu tipo de acceso.
          </p>

          <p className="mt-3 text-sm leading-6 text-[#68777c]">
            Te redirigiremos al inicio del sistema en unos segundos.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/admin"
              className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
            >
              Ir al inicio
            </a>

            <button
              onClick={handleLogout}
              className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef1f3] text-[#263238]">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-[#dde3e6] bg-white p-6 lg:block">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              Alexandra Ruiz
            </p>
            <h1 className="mt-2 text-2xl font-light">Sistema interno</h1>

            <div className="mt-4 rounded-2xl bg-[#fff6fb] p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-[#bd7b83]">
                Rol
              </p>
              <p className="mt-1 text-sm text-[#263238]">
                {roleLabels[profileRole] || profileRole}
              </p>
            </div>
          </div>

          <nav className="space-y-2">
            {visibleMainModules.map((item) => (
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
                    Sesión activa: {sessionEmail} ·{" "}
                    {roleLabels[profileRole] || profileRole}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                {allowedModules.includes("notificaciones") && (
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
                        {unreadNotifications > 99 ? "99+" : unreadNotifications}
                      </span>
                    )}
                  </a>
                )}

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

            <div className="mt-4 flex gap-2 overflow-auto lg:hidden">
              {visibleMainModules.map((item) => (
                <a
                  key={item.key}
                  href={item.href}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm ${
                    activeModule === item.key
                      ? "bg-[#bd7b83] text-white"
                      : "bg-[#f7eeee] text-[#8a5f63]"
                  }`}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </header>

          <div className="p-4 md:p-8">{children}</div>
        </section>
      </div>
    </main>
  );
}