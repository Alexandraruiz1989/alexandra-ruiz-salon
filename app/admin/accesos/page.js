"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "../components/AdminShell";
import { supabase } from "../../lib/supabaseClient";

const menuItems = [
  { key: "usuarios", label: "Usuarios" },
  { key: "invitar", label: "Invitar usuario" },
  { key: "permisos", label: "Permisos por rol" },
];

const roleOptions = [
  {
    value: "admin",
    label: "Admin / Dueña",
    description: "Acceso completo al sistema.",
  },
  {
    value: "encargada",
    label: "Encargada",
    description: "Agenda, clientas, cobros, seguimientos y reportes básicos.",
  },
  {
    value: "tecnica",
    label: "Técnica",
    description: "Agenda, sus citas y funciones operativas limitadas.",
  },
  {
    value: "caja",
    label: "Caja / Recepción",
    description: "Agenda, clientas, cobros, recibos y caja.",
  },
  {
    value: "product_owner",
    label: "Dueña productos",
    description: "Acceso limitado a Tienda, stock, ventas y reportes de productos.",
  },
];

const rolePermissions = {
  admin: [
    "Agenda",
    "Clientas",
    "Servicios",
    "Cobros",
    "Tienda",
    "Reportes",
    "Técnicas / Personal",
    "Seguimientos",
    "Calificaciones",
    "Configuración",
    "Accesos",
  ],
  encargada: [
    "Agenda",
    "Clientas",
    "Servicios",
    "Cobros",
    "Tienda",
    "Seguimientos",
    "Calificaciones",
    "Reportes básicos",
  ],
  tecnica: ["Agenda", "Sus citas", "Clientas básicas", "Seguimientos básicos"],
  caja: ["Agenda", "Clientas", "Cobros", "Recibos", "Caja", "Tienda"],
  product_owner: [
    "Tienda",
    "Stock actual",
    "Ventas de productos",
    "Movimientos de inventario",
    "Reportes de productos",
    "Neto proveedor",
  ],
};

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-[1.5rem] bg-white p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
          {eyebrow}
        </p>
        <h3 className="mt-2 text-2xl font-light">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-[#68777c]">{description}</p>
        )}
      </div>

      {action}
    </div>
  );
}

function getMessageStyle(message) {
  const text = String(message || "").toLowerCase();

  if (
    text.includes("no se pudo") ||
    text.includes("error") ||
    text.includes("obligatorio") ||
    text.includes("válido") ||
    text.includes("revisa")
  ) {
    return "bg-red-600 text-white";
  }

  return "bg-green-600 text-white";
}

export default function AccesosPage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [savingInvite, setSavingInvite] = useState(false);
  const [activeSection, setActiveSection] = useState("usuarios");
  const [message, setMessage] = useState("");

  const [profiles, setProfiles] = useState([]);
  const [staff, setStaff] = useState([]);

  const [inviteForm, setInviteForm] = useState({
    full_name: "",
    email: "",
    role: "tecnica",
    staff_id: "",
  });

  const activeProfiles = useMemo(() => {
    return profiles.filter((profile) => profile.active !== false);
  }, [profiles]);

  const inactiveProfiles = useMemo(() => {
    return profiles.filter((profile) => profile.active === false);
  }, [profiles]);

  useEffect(() => {
    const start = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        window.location.href = "/admin";
        return;
      }

      setLoadingSession(false);
      await loadData({ keepMessage: true });
    };

    start();
  }, []);

  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(() => {
      setMessage("");
    }, 18000);

    return () => clearTimeout(timer);
  }, [message]);

  const loadData = async ({ keepMessage = false } = {}) => {
    setLoadingData(true);

    if (!keepMessage) {
      setMessage("");
    }

    const [profilesResult, staffResult] = await Promise.all([
      supabase
        .from("user_profiles")
        .select(
          `
          *,
          staff (
            id,
            full_name
          )
        `
        )
        .order("created_at", { ascending: false }),

      supabase.from("staff").select("*").eq("active", true).order("full_name"),
    ]);

    if (profilesResult.error) {
      setMessage(`No se pudieron cargar usuarios: ${profilesResult.error.message}`);
    } else {
      setProfiles(profilesResult.data || []);
    }

    if (staffResult.error) {
      setMessage(`No se pudo cargar personal: ${staffResult.error.message}`);
    } else {
      setStaff(staffResult.data || []);
    }

    setLoadingData(false);
  };

  const updateProfile = async (profileId, payload) => {
    setMessage("");

    const { error } = await supabase
      .from("user_profiles")
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);

    if (error) {
      setMessage(`No se pudo actualizar el acceso: ${error.message}`);
      return;
    }

    setMessage("Acceso actualizado correctamente ✨");
    await loadData({ keepMessage: true });
  };

  const toggleActive = async (profile) => {
    await updateProfile(profile.id, {
      active: !profile.active,
    });
  };

  const handleInviteChange = (field, value) => {
    setInviteForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const inviteUser = async () => {
    setMessage("");

    const email = inviteForm.email.trim().toLowerCase();
    const fullName = inviteForm.full_name.trim();

    if (!email) {
      setMessage("El correo es obligatorio.");
      return;
    }

    if (!email.includes("@")) {
      setMessage("Escribe un correo válido.");
      return;
    }

    setSavingInvite(true);

    try {
      const response = await fetch("/api/admin/invite-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          full_name: fullName,
          role: inviteForm.role,
          staff_id: inviteForm.staff_id || null,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setMessage(result.error || "No se pudo enviar la invitación.");
        setSavingInvite(false);
        return;
      }

      setMessage(
        result.message ||
          "Invitación enviada correctamente. Revisa spam/no deseado si no aparece en la bandeja principal ✨"
      );

      setInviteForm({
        full_name: "",
        email: "",
        role: "tecnica",
        staff_id: "",
      });

      setActiveSection("usuarios");
      await loadData({ keepMessage: true });
    } catch (error) {
      setMessage(error.message || "No se pudo enviar la invitación.");
    }

    setSavingInvite(false);
  };

  if (loadingSession) {
    return (
      <main className="min-h-screen bg-[#eef1f3] px-6 py-10 text-[#263238]">
        <p>Cargando...</p>
      </main>
    );
  }

  return (
    <AdminShell
      title="Accesos"
      subtitle="Administra usuarios, invitaciones, roles y permisos del sistema."
      activeModule="accesos"
      menuItems={menuItems}
      activeSection={activeSection}
      setActiveSection={setActiveSection}
    >
      {message && (
        <div
          className={`mb-6 rounded-2xl px-5 py-4 text-sm font-medium ${getMessageStyle(
            message
          )}`}
        >
          {message}
        </div>
      )}

      {activeSection === "usuarios" && (
        <Card>
          <SectionHeader
            eyebrow="Usuarios"
            title="Roles y accesos"
            description="Aquí puedes asignar el rol de cada usuario y ligarlo a una técnica del salón."
            action={
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveSection("invitar")}
                  className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
                >
                  Invitar usuario
                </button>

                <button
                  type="button"
                  onClick={() => loadData()}
                  className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                >
                  Actualizar
                </button>
              </div>
            }
          />

          {loadingData ? (
            <p className="text-sm text-[#68777c]">Cargando usuarios...</p>
          ) : activeProfiles.length === 0 ? (
            <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
              Aún no hay usuarios activos registrados.
            </div>
          ) : (
            <div className="space-y-4">
              {activeProfiles.map((profile) => (
                <UserAccessCard
                  key={profile.id}
                  profile={profile}
                  staff={staff}
                  updateProfile={updateProfile}
                  toggleActive={toggleActive}
                />
              ))}
            </div>
          )}

          {inactiveProfiles.length > 0 && (
            <div className="mt-8">
              <h4 className="text-lg font-light text-[#263238]">
                Usuarios desactivados
              </h4>

              <div className="mt-4 space-y-3">
                {inactiveProfiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] p-4"
                  >
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                      <div>
                        <p className="font-medium text-[#263238]">
                          {profile.full_name || profile.email}
                        </p>
                        <p className="text-sm text-[#68777c]">{profile.email}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleActive(profile)}
                        className="rounded-full border border-[#bd7b83] px-5 py-2 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                      >
                        Reactivar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {activeSection === "invitar" && (
        <Card>
          <SectionHeader
            eyebrow="Invitar"
            title="Enviar invitación de acceso"
            description="El usuario recibirá un correo para crear su contraseña y entrar al sistema."
          />

          <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
            <div className="rounded-2xl bg-[#f7f9fa] p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={inviteForm.full_name}
                    onChange={(event) =>
                      handleInviteChange("full_name", event.target.value)
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                    placeholder="Nombre de la colaboradora"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Correo
                  </label>
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={(event) =>
                      handleInviteChange("email", event.target.value)
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                    placeholder="correo@ejemplo.com"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Rol
                  </label>
                  <select
                    value={inviteForm.role}
                    onChange={(event) =>
                      handleInviteChange("role", event.target.value)
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                  >
                    {roleOptions.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Técnica relacionada
                  </label>
                  <select
                    value={inviteForm.staff_id}
                    onChange={(event) =>
                      handleInviteChange("staff_id", event.target.value)
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                  >
                    <option value="">Sin ligar</option>
                    {staff.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={inviteUser}
                disabled={savingInvite}
                className="mt-5 w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {savingInvite ? "Enviando invitación..." : "Enviar invitación"}
              </button>
            </div>

            <div className="rounded-2xl bg-[#fff6fb] p-5">
              <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                Importante
              </p>

              <div className="mt-3 space-y-3 text-sm leading-6 text-[#68777c]">
                <p>
                  La invitación se enviará al correo indicado. La colaboradora
                  podrá crear su contraseña desde ese correo.
                </p>
                <p>
                  Si no aparece el correo, revisa spam/no deseado. También puede
                  tardar unos minutos dependiendo de Supabase.
                </p>
                <p>
                  Si el correo ya existe en Authentication, Supabase puede
                  rechazar una nueva invitación. En ese caso se puede actualizar
                  el rol desde Usuarios.
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {activeSection === "permisos" && (
        <Card>
          <SectionHeader
            eyebrow="Permisos"
            title="Qué puede hacer cada rol"
            description="Primera versión de permisos. Después conectaremos estos permisos para ocultar módulos automáticamente."
          />

          <div className="grid gap-4 md:grid-cols-2">
            {roleOptions.map((role) => (
              <div
                key={role.value}
                className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5"
              >
                <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                  {role.value}
                </p>
                <h3 className="mt-2 text-xl font-light text-[#263238]">
                  {role.label}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#68777c]">
                  {role.description}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(rolePermissions[role.value] || []).map((permission) => (
                    <span
                      key={permission}
                      className="rounded-full bg-[#fff6fb] px-4 py-2 text-xs text-[#8a5f63]"
                    >
                      {permission}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </AdminShell>
  );
}

function UserAccessCard({ profile, staff, updateProfile, toggleActive }) {
  return (
    <div className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5">
      <div className="grid gap-4 xl:grid-cols-[1fr_0.6fr_0.7fr_0.35fr] xl:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Usuario
          </p>
          <h3 className="mt-2 text-xl font-light text-[#263238]">
            {profile.full_name || profile.email}
          </h3>
          <p className="mt-1 text-sm text-[#68777c]">{profile.email}</p>
        </div>

        <div>
          <label className="mb-2 block text-sm text-[#68777c]">Rol</label>
          <select
            value={profile.role || "tecnica"}
            onChange={(event) =>
              updateProfile(profile.id, {
                role: event.target.value,
              })
            }
            className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
          >
            {roleOptions.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm text-[#68777c]">
            Técnica relacionada
          </label>
          <select
            value={profile.staff_id || ""}
            onChange={(event) =>
              updateProfile(profile.id, {
                staff_id: event.target.value || null,
              })
            }
            className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
          >
            <option value="">Sin ligar</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => toggleActive(profile)}
          className="rounded-full border border-red-500 px-5 py-3 text-sm text-red-600 transition hover:bg-red-600 hover:text-white"
        >
          Desactivar
        </button>
      </div>
    </div>
  );
}
