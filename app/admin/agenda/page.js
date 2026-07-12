"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import AdminShell from "../components/AdminShell";

const DESIGN_IMAGE_BUCKET = "appointment-designs";

const agendaMenuItems = [
  { key: "nueva", label: "Nueva cita" },
  { key: "diaria", label: "Vista diaria" },
  { key: "semanal", label: "Vista semanal" },
  { key: "mensual", label: "Vista mensual" },
  { key: "disponibilidad", label: "Buscar disponibilidad" },
];

const attendanceOptions = [
  { value: "pendiente", label: "Pendiente", source: null },
  { value: "confirmada", label: "Confirmó", source: "general" },
  { value: "confirmada_llamada", label: "Confirmó por llamada", source: "llamada" },
  { value: "confirmada_mensaje", label: "Confirmó por mensaje", source: "mensaje" },
  { value: "asistio", label: "Asistió", source: "presencial" },
  { value: "llego_retrasada", label: "Llegó retrasada", source: "presencial" },
  { value: "cancelo", label: "Canceló", source: "manual" },
  { value: "no_asistio", label: "No asistió", source: "manual" },
];

const emptyServiceLine = {
  service_id: "",
  service_search: "",
  staff_id: "",
  start_time: "",
  end_time: "",
  duration_minutes: 0,
  cleanup_minutes: 0,
  price: 0,
  quantity: 1,
  notes: "",
};

const emptyAppointmentExtraLine = {
  extra_id: "",
  staff_id: "",
  name: "",
  quantity: 1,
  unit_price: "",
  total_price: "",
  notes: "",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysToISO(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function DateNavigation({ selectedDate, setSelectedDate, mode = "day" }) {
  const stepDays = mode === "week" ? 7 : mode === "month" ? 30 : 1;

  const goBack = () => {
    setSelectedDate(addDaysToISO(selectedDate, -stepDays));
  };

  const goToday = () => {
    setSelectedDate(todayISO());
  };

  const goForward = () => {
    setSelectedDate(addDaysToISO(selectedDate, stepDays));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={goBack}
        className="rounded-full border border-[#bd7b83] px-4 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
      >
        ←
      </button>

      <button
        type="button"
        onClick={goToday}
        className="rounded-full border border-[#dde3e6] bg-white px-4 py-3 text-sm text-[#68777c] transition hover:bg-[#f7eeee] hover:text-[#bd7b83]"
      >
        Hoy
      </button>

      <input
        type="date"
        value={selectedDate}
        onChange={(event) => setSelectedDate(event.target.value)}
        className="rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
      />

      <button
        type="button"
        onClick={goForward}
        className="rounded-full border border-[#bd7b83] px-4 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
      >
        →
      </button>
    </div>
  );
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}
function formatTime(time) {
  if (!time) return "";
  return time.slice(0, 5);
}

function getAttendanceOption(status) {
  const normalized = String(status || "pendiente").toLowerCase();
  return (
    attendanceOptions.find((option) => option.value === normalized) ||
    attendanceOptions[0]
  );
}

function getAttendanceAccentClass(status) {
  const normalized = String(status || "pendiente").toLowerCase();

  if (normalized.includes("confirmada") || normalized === "asistio") {
    return "border-l-green-400";
  }

  if (normalized === "llego_retrasada") {
    return "border-l-green-400";
  }

  if (normalized === "cancelo") {
    return "border-l-red-500";
  }

  if (normalized === "no_asistio") {
    return "border-l-red-900";
  }

  return "border-l-yellow-300";
}

function getAttendanceBadgeClass(status) {
  const normalized = String(status || "pendiente").toLowerCase();

  if (normalized.includes("confirmada") || normalized === "asistio") {
    return "bg-green-50 text-green-700";
  }

  if (normalized === "llego_retrasada") {
    return "bg-red-50 text-red-700";
  }

  if (normalized === "cancelo" || normalized === "no_asistio") {
    return "bg-red-100 text-red-800";
  }

  return "bg-yellow-50 text-yellow-700";
}

function normalizeServiceText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function serviceHasAcrylic(serviceName) {
  return normalizeServiceText(serviceName).includes("acrilic");
}

function isAcrylicFill(serviceName) {
  const normalized = normalizeServiceText(serviceName);
  return normalized.includes("relleno") && normalized.includes("acrilic");
}

function isAcrylicCycleReset(serviceName) {
  const normalized = normalizeServiceText(serviceName);
  const hasAcrylic = normalized.includes("acrilic");
  const hasFill = normalized.includes("relleno");
  const hasRemoval = normalized.includes("retiro");

  return hasAcrylic && (!hasFill || hasRemoval);
}

function addMinutesToTime(time, minutes) {
  if (!time) return "";

  const [hours, mins] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours || 0);
  date.setMinutes((mins || 0) + Number(minutes || 0));

  const finalHours = String(date.getHours()).padStart(2, "0");
  const finalMinutes = String(date.getMinutes()).padStart(2, "0");

  return `${finalHours}:${finalMinutes}`;
}

function timeToMinutes(time) {
  if (!time) return null;

  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function timesOverlap(startA, endA, startB, endB) {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);

  if (aStart === null || aEnd === null || bStart === null || bEnd === null) {
    return false;
  }

  return aStart < bEnd && bStart < aEnd;
}

function getDayOfWeek(dateString) {
  if (!dateString) return null;

  const date = new Date(`${dateString}T00:00:00`);
  return date.getDay();
}

function getWeekRange(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

function getWeekDays(dateString) {
  const range = getWeekRange(dateString);
  const start = new Date(`${range.start}T00:00:00`);

  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    return date.toISOString().slice(0, 10);
  });
}

function getMonthDays(dateString) {
  const current = new Date(`${dateString}T00:00:00`);
  const year = current.getFullYear();
  const month = current.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const start = new Date(firstDay);
  const startDay = start.getDay();
  const diffToMonday = startDay === 0 ? -6 : 1 - startDay;
  start.setDate(start.getDate() + diffToMonday);

  const end = new Date(lastDay);
  const endDay = end.getDay();
  const diffToSunday = endDay === 0 ? 0 : 7 - endDay;
  end.setDate(end.getDate() + diffToSunday);

  const days = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    days.push({
      date: cursor.toISOString().slice(0, 10),
      isCurrentMonth: cursor.getMonth() === month,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function getDateLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

function getShortDateLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function generateTimeOptions() {
  const options = [];

  for (let hour = 6; hour <= 23; hour++) {
    for (let minute = 0; minute < 60; minute += 10) {
      if (hour === 23 && minute > 0) continue;

      const value = `${String(hour).padStart(2, "0")}:${String(
        minute
      ).padStart(2, "0")}`;

      options.push(value);
    }
  }

  return options;
}

function generateTimeSlots() {
  const slots = [];

  for (let hour = 8; hour <= 21; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      if (hour === 21 && minute > 0) continue;

      const value = `${String(hour).padStart(2, "0")}:${String(
        minute
      ).padStart(2, "0")}`;

      slots.push(value);
    }
  }

  return slots;
}

function getMessageType(message) {
  const text = String(message || "").toLowerCase();

  const isError =
    text.includes("no se pudo") ||
    text.includes("empalme") ||
    text.includes("ya tiene") ||
    text.includes("obligatoria") ||
    text.includes("obligatorias") ||
    text.includes("agrega al menos") ||
    text.includes("validar disponibilidad") ||
    text.includes("conflicto") ||
    text.includes("fuera de horario") ||
    text.includes("descanso") ||
    text.includes("bloqueo") ||
    text.includes("no trabaja") ||
    text.includes("no encontré") ||
    text.includes("selecciona") ||
    text.includes("no hay") ||
    text.includes("no tiene") ||
    text.includes("queda fuera") ||
    text.includes("error");

  const isSuccess =
    text.includes("correctamente") ||
    text.includes("encontré") ||
    text.includes("seleccionado") ||
    text.includes("seleccionados");

  if (isError) return "error";
  if (isSuccess) return "success";
  return "info";
}

function getToastStyle(message) {
  const type = getMessageType(message);

  if (type === "error") {
    return "bg-red-600 text-white shadow-[0_18px_45px_rgba(220,38,38,0.28)]";
  }

  if (type === "success") {
    return "bg-green-600 text-white shadow-[0_18px_45px_rgba(22,163,74,0.25)]";
  }

  return "bg-[#8a5f63] text-white shadow-[0_18px_45px_rgba(138,95,99,0.25)]";
}

function getBlockCardClass(block) {
  const type = String(block?.block_type || "").toLowerCase();
  const title = String(block?.title || "").toLowerCase();

  if (type.includes("comida") || title.includes("comida")) {
    return "border-yellow-200 bg-yellow-50 text-yellow-800";
  }

  if (type.includes("falta") || title.includes("falta")) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-red-200 bg-red-50 text-red-700";
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-[1.5rem] bg-white p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
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

function ViewButtons({ activeSection, setActiveSection }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setActiveSection("diaria")}
        className={`rounded-full px-4 py-2 text-sm transition ${
          activeSection === "diaria"
            ? "bg-[#bd7b83] text-white"
            : "bg-[#f7eeee] text-[#8a5f63] hover:bg-[#edd8d4]"
        }`}
      >
        Diaria
      </button>

      <button
        type="button"
        onClick={() => setActiveSection("semanal")}
        className={`rounded-full px-4 py-2 text-sm transition ${
          activeSection === "semanal"
            ? "bg-[#bd7b83] text-white"
            : "bg-[#f7eeee] text-[#8a5f63] hover:bg-[#edd8d4]"
        }`}
      >
        Semanal
      </button>

      <button
        type="button"
        onClick={() => setActiveSection("mensual")}
        className={`rounded-full px-4 py-2 text-sm transition ${
          activeSection === "mensual"
            ? "bg-[#bd7b83] text-white"
            : "bg-[#f7eeee] text-[#8a5f63] hover:bg-[#edd8d4]"
        }`}
      >
        Mensual
      </button>
    </div>
  );
}

const timeOptions = generateTimeOptions();
const timeSlots = generateTimeSlots();

async function triggerPushForNotificationIds(notificationIds = []) {
  const ids = [...new Set((notificationIds || []).filter(Boolean))];

  if (ids.length === 0) return { error: null };

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    return { error: { message: "Tu sesión expiró. Vuelve a iniciar sesión." } };
  }

  try {
    const response = await fetch("/api/push/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        notification_ids: ids,
      }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        error: {
          message:
            result.error ||
            "La notificación interna se creó, pero no se pudo enviar push.",
        },
      };
    }

    return { error: null, result };
  } catch (error) {
    return { error };
  }
}

async function triggerAdminAppointmentNotification(payload = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    return { error: { message: "Tu sesión expiró. Vuelve a iniciar sesión." } };
  }

  try {
    const response = await fetch("/api/push/admin-appointment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        error: {
          message:
            result.error ||
            "No se pudo notificar al admin sobre el cambio de cita.",
        },
      };
    }

    return { error: null, result };
  } catch (error) {
    return { error };
  }
}

export default function AgendaPage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);

  const [activeSection, setActiveSection] = useState("diaria");
  const [message, setMessage] = useState("");
  const [availabilityMessage, setAvailabilityMessage] = useState("");

  const [clients, setClients] = useState([]);
  const [staff, setStaff] = useState([]);
  const [services, setServices] = useState([]);
  const [extras, setExtras] = useState([]);
  const [staffServices, setStaffServices] = useState([]);
  const [resources, setResources] = useState([]);
  const [serviceResources, setServiceResources] = useState([]);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [currentRole, setCurrentRole] = useState("tecnica");

  const [showQuickClientModal, setShowQuickClientModal] = useState(false);
const [savingQuickClient, setSavingQuickClient] = useState(false);
const [quickClientMessage, setQuickClientMessage] = useState("");
const [quickClientForm, setQuickClientForm] = useState({
  full_name: "",
  phone: "",
  email: "",
  birthday: "",
  gender: "",
  notes: "",
});
  const [followupRules, setFollowupRules] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [rangeAppointments, setRangeAppointments] = useState([]);
  const [staffSchedules, setStaffSchedules] = useState([]);
  const [timeBlocks, setTimeBlocks] = useState([]);
  const [rangeTimeBlocks, setRangeTimeBlocks] = useState([]);

  const [selectedDate, setSelectedDate] = useState(todayISO());

  const [activeSuggestion, setActiveSuggestion] = useState({});
  const [closedSuggestions, setClosedSuggestions] = useState({});
  const [availabilitySuggestions, setAvailabilitySuggestions] = useState([]);

  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [editingAppointmentId, setEditingAppointmentId] = useState(null);

  const [form, setForm] = useState({
    client_id: "",
    appointment_date: todayISO(),
    deposit_amount: "",
    deposit_payment_method: "",
    design_image_url: "",
    notes: "",
    force_created: false,
  });

  const [serviceLines, setServiceLines] = useState([{ ...emptyServiceLine }]);
const [appointmentExtraLines, setAppointmentExtraLines] = useState([]);
const [designImageFile, setDesignImageFile] = useState(null);
const [acrylicWarning, setAcrylicWarning] = useState(null);
const [loadingAcrylicWarning, setLoadingAcrylicWarning] = useState(false);
const [staffFilter, setStaffFilter] = useState("");
const [appointmentStatusFilter, setAppointmentStatusFilter] = useState("");
const [quickSearch, setQuickSearch] = useState("");
const [appointmentPopover, setAppointmentPopover] = useState(null);

  useEffect(() => {
    const start = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        window.location.href = "/admin";
        return;
      }

      await loadCurrentAccessProfile(data.session.user);
      setLoadingSession(false);
      await loadInitialData();
    };

    start();
  }, []);

  useEffect(() => {
    if (!loadingSession) {
      loadDateData(selectedDate);
      loadRangeData(selectedDate);
    }
  }, [selectedDate, loadingSession]);

  const loadCurrentAccessProfile = async (user) => {
    if (!user) return;

    const { data: profileById } = await supabase
      .from("user_profiles")
      .select("id, auth_user_id, email, full_name, role, active, staff_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    let profile = profileById || null;

    if (!profile && user.email) {
      const { data: profileByEmail } = await supabase
        .from("user_profiles")
        .select("id, auth_user_id, email, full_name, role, active, staff_id")
        .ilike("email", user.email)
        .maybeSingle();

      profile = profileByEmail || null;
    }

    if (profile) {
      setCurrentProfile(profile);
      setCurrentRole(profile.role || "tecnica");
    }
  };

  const loadInitialData = async () => {
    setLoadingData(true);
    setMessage("");

    const [
  clientsResult,
  staffResult,
  servicesResult,
  extrasResult,
  schedulesResult,
  followupRulesResult,
  paymentsResult,
  staffServicesResult,
  resourcesResult,
  serviceResourcesResult,
] = await Promise.all([
        supabase.from("clients").select("*").order("full_name"),
        supabase.from("staff").select("*").eq("active", true).order("full_name"),
        supabase
          .from("services")
          .select("*")
          .eq("active", true)
          .order("category", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("service_extras")
          .select("*")
          .eq("active", true)
          .order("category", { ascending: true })
          .order("name", { ascending: true }),
        supabase.from("staff_schedules").select("*"),
        supabase
  .from("followup_rules")
  .select("*")
  .eq("is_active", true)
  .order("created_at", { ascending: true }),
  supabase
  .from("payments")
  .select("id, appointment_id, total_amount, payment_method, payment_date")
  .not("appointment_id", "is", null),
  supabase.from("staff_services").select("*").eq("active", true),
  supabase.from("resources").select("*").eq("active", true).order("name"),
  supabase.from("service_resources").select("*").eq("active", true),
      ]);

    if (clientsResult.error) {
      setMessage(`Error al cargar clientas: ${clientsResult.error.message}`);
    } else {
      setClients(clientsResult.data || []);
    }

    if (staffResult.error) {
      setMessage(`Error al cargar técnicas: ${staffResult.error.message}`);
    } else {
      setStaff(staffResult.data || []);
    }
    if (followupRulesResult.error) {
  setMessage(
    `Error al cargar reglas de seguimiento: ${followupRulesResult.error.message}`
  );
} else {
  setFollowupRules(followupRulesResult.data || []);
}

    if (servicesResult.error) {
      setMessage(`Error al cargar servicios: ${servicesResult.error.message}`);
    } else {
      setServices(servicesResult.data || []);
    }

    if (extrasResult.error) {
      setMessage(`Error al cargar extras: ${extrasResult.error.message}`);
    } else {
      setExtras(extrasResult.data || []);
    }

    if (schedulesResult.error) {
      setMessage(`Error al cargar horarios: ${schedulesResult.error.message}`);
    } else {
      setStaffSchedules(schedulesResult.data || []);
    }

    if (staffServicesResult.error) {
      console.warn(
        "No se pudieron cargar servicios por técnica",
        staffServicesResult.error.message
      );
      setStaffServices([]);
    } else {
      setStaffServices(staffServicesResult.data || []);
    }

    if (resourcesResult.error) {
      console.warn("No se pudieron cargar recursos", resourcesResult.error.message);
      setResources([]);
    } else {
      setResources(resourcesResult.data || []);
    }

    if (serviceResourcesResult.error) {
      console.warn(
        "No se pudieron cargar recursos por servicio",
        serviceResourcesResult.error.message
      );
      setServiceResources([]);
    } else {
      setServiceResources(serviceResourcesResult.data || []);
    }

    await loadDateData(selectedDate);
    await loadRangeData(selectedDate);

    setLoadingData(false);
  if (paymentsResult.error) {
  setMessage(`Error al cargar pagos: ${paymentsResult.error.message}`);
} else {
  setPayments(paymentsResult.data || []);
}
  };

  const attachAppointmentExtras = async (appointmentsList) => {
    const list = appointmentsList || [];

    if (list.length === 0) return list;

    const appointmentIds = list.map((appointment) => appointment.id).filter(Boolean);

    if (appointmentIds.length === 0) return list;

    const { data, error } = await supabase
      .from("appointment_extra_items")
      .select("*")
      .in("appointment_id", appointmentIds)
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(`Error al cargar extras de citas: ${error.message}`);
      return list.map((appointment) => ({
        ...appointment,
        appointment_extra_items: appointment.appointment_extra_items || [],
      }));
    }

    const extrasByAppointment = {};

    (data || []).forEach((item) => {
      if (!extrasByAppointment[item.appointment_id]) {
        extrasByAppointment[item.appointment_id] = [];
      }

      extrasByAppointment[item.appointment_id].push(item);
    });

    return list.map((appointment) => ({
      ...appointment,
      appointment_extra_items: extrasByAppointment[appointment.id] || [],
    }));
  };

  const loadDateData = async (date) => {
    const [appointmentsResult, blocksResult] = await Promise.all([
      supabase
        .from("appointments")
        .select(
          `
          *,
          clients (*),
          appointment_services (
            id,
            service_id,
            staff_id,
            service_date,
            start_time,
            end_time,
            duration_minutes,
            cleanup_minutes,
            price,
            quantity,
            total_price,
            notes,
            status,
            services (
              name,
              category
            ),
            staff (
              full_name,
              color
            )
          )
        `
        )
        .eq("appointment_date", date)
        .order("start_time", { ascending: true }),
      supabase
        .from("staff_time_blocks")
        .select("*, staff(full_name, color)")
        .eq("block_date", date)
        .order("start_time", { ascending: true }),
    ]);

    if (appointmentsResult.error) {
      setMessage(`Error al cargar citas: ${appointmentsResult.error.message}`);
    } else {
      const appointmentsWithExtras = await attachAppointmentExtras(
        appointmentsResult.data || []
      );
      setAppointments(appointmentsWithExtras);
    }

    if (blocksResult.error) {
      setMessage(`Error al cargar bloqueos: ${blocksResult.error.message}`);
    } else {
      setTimeBlocks(blocksResult.data || []);
    }
  };

  const loadRangeData = async (date) => {
    const weekRange = getWeekRange(date);
    const monthDays = getMonthDays(date);

    const rangeStart =
      monthDays.length > 0 ? monthDays[0].date : weekRange.start;
    const rangeEnd =
      monthDays.length > 0
        ? monthDays[monthDays.length - 1].date
        : weekRange.end;

    const [appointmentsResult, blocksResult] = await Promise.all([
      supabase
        .from("appointments")
        .select(
          `
          *,
          clients (*),
          appointment_services (
            id,
            service_id,
            staff_id,
            service_date,
            start_time,
            end_time,
            duration_minutes,
            cleanup_minutes,
            price,
            quantity,
            total_price,
            notes,
            status,
            services (
              name,
              category
            ),
            staff (
              full_name,
              color
            )
          )
        `
        )
        .gte("appointment_date", rangeStart)
        .lte("appointment_date", rangeEnd)
        .order("appointment_date", { ascending: true }),
      supabase
        .from("staff_time_blocks")
        .select("*, staff(full_name, color)")
        .gte("block_date", rangeStart)
        .lte("block_date", rangeEnd)
        .order("block_date", { ascending: true }),
    ]);

    if (!appointmentsResult.error) {
      const appointmentsWithExtras = await attachAppointmentExtras(
        appointmentsResult.data || []
      );
      setRangeAppointments(appointmentsWithExtras);
    }

    if (!blocksResult.error) {
      setRangeTimeBlocks(blocksResult.data || []);
    }
  };
  const resetQuickClientForm = () => {
  setQuickClientForm({
    full_name: "",
    phone: "",
    email: "",
    birthday: "",
    gender: "",
    notes: "",
  });
  setQuickClientMessage("");
};

const openQuickClientModal = () => {
  resetQuickClientForm();
  setShowQuickClientModal(true);
};

const closeQuickClientModal = () => {
  setShowQuickClientModal(false);
  resetQuickClientForm();
};

const handleQuickClientChange = (field, value) => {
  setQuickClientForm((current) => ({
    ...current,
    [field]: value,
  }));
};

const saveQuickClient = async () => {
  setQuickClientMessage("");

  const fullName = quickClientForm.full_name.trim();
  const phone = quickClientForm.phone.trim();

  if (!fullName || !phone) {
    setQuickClientMessage("El nombre completo y el teléfono son obligatorios.");
    return;
  }

  setSavingQuickClient(true);

  const clientData = {
    full_name: fullName,
    phone,
    email: quickClientForm.email.trim() || null,
    birthday: quickClientForm.birthday || null,
    gender: quickClientForm.gender || null,
    notes: quickClientForm.notes.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("clients")
    .insert([clientData])
    .select()
    .single();

  if (error) {
    setQuickClientMessage(`No se pudo registrar cliente: ${error.message}`);
    setSavingQuickClient(false);
    return;
  }

  setClients((current) =>
    [...current, data].sort((a, b) =>
      String(a.full_name || "").localeCompare(String(b.full_name || ""))
    )
  );

  setForm((current) => ({
    ...current,
    client_id: data.id,
  }));

  setSavingQuickClient(false);
  setShowQuickClientModal(false);
  resetQuickClientForm();
  setMessage("Cliente registrado y seleccionado correctamente ✨");
};
  const handleFormChange = (event) => {
    const { name, value, type, checked } = event.target;

    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleDesignImageFileChange = (event) => {
    const file = event.target.files?.[0] || null;

    if (!file) {
      setDesignImageFile(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setDesignImageFile(null);
      setMessage("Selecciona una imagen válida para el diseño.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setDesignImageFile(null);
      setMessage("La imagen del diseño debe pesar máximo 5 MB.");
      event.target.value = "";
      return;
    }

    setDesignImageFile(file);
    setMessage("Imagen lista para subir al guardar la cita.");
  };

  const clearDesignImage = () => {
    setDesignImageFile(null);
    setForm((current) => ({
      ...current,
      design_image_url: "",
    }));
  };

  const getDesignImageUploadMessage = (error) => {
    const detail = String(error?.message || error || "");
    const normalized = detail.toLowerCase();

    if (
      normalized.includes("bucket") ||
      normalized.includes("row-level security") ||
      normalized.includes("permission") ||
      normalized.includes("not found")
    ) {
      return "No se pudo subir la imagen. Ejecuta el SQL de Agenda para crear el bucket appointment-designs y sus permisos.";
    }

    return `No se pudo subir la imagen del diseño: ${detail || "intenta nuevamente."}`;
  };

  const uploadDesignImageFile = async (appointmentId) => {
    if (!designImageFile) return null;

    const extension =
      designImageFile.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ||
      "jpg";
    const filePath = `${appointmentId}/${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(DESIGN_IMAGE_BUCKET)
      .upload(filePath, designImageFile, {
        cacheControl: "3600",
        contentType: designImageFile.type,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from(DESIGN_IMAGE_BUCKET)
      .getPublicUrl(filePath);

    if (!data?.publicUrl) {
      throw new Error("Supabase no devolvió una URL pública para la imagen.");
    }

    return data.publicUrl;
  };

  const normalizedCurrentRole = normalizeRole(currentRole);
  const canForceAgenda = ["admin", "encargada"].includes(
    normalizedCurrentRole
  );

  const getStaffServiceRowsForStaff = (staffId) =>
    staffServices.filter((item) => item.staff_id === staffId && item.active !== false);

  const getStaffServiceRowsForService = (serviceId) =>
    staffServices.filter((item) => item.service_id === serviceId && item.active !== false);

  const isStaffAllowedForService = (staffId, serviceId) => {
    if (!staffId || !serviceId) return true;

    const serviceRows = getStaffServiceRowsForService(serviceId);

    if (serviceRows.length === 0) return true;

    return staffServices.some(
      (item) =>
        item.staff_id === staffId &&
        item.service_id === serviceId &&
        item.active !== false
    );
  };

  const getAllowedStaffForService = (serviceId) => {
    if (!serviceId) return staff;

    const linkedStaffIds = getStaffServiceRowsForService(serviceId).map(
      (item) => item.staff_id
    );

    if (linkedStaffIds.length === 0) return staff;

    return staff.filter((person) => linkedStaffIds.includes(person.id));
  };

  const getAllowedServicesForStaff = (staffId) => {
    if (!staffId) return services;

    const linkedServiceIds = getStaffServiceRowsForStaff(staffId).map(
      (item) => item.service_id
    );

    if (linkedServiceIds.length === 0) return services;

    return services.filter(
      (service) =>
        linkedServiceIds.includes(service.id) ||
        getStaffServiceRowsForService(service.id).length === 0
    );
  };

  const getServiceMatches = (searchText, staffId = "") => {
    const term = searchText.toLowerCase().trim();

    if (term.length < 2) return [];

    return getAllowedServicesForStaff(staffId)
      .filter((service) => {
        const searchable = `${service.category} ${service.name}`.toLowerCase();
        return searchable.includes(term);
      })
      .slice(0, 10);
  };

  const applySelectedService = (index, selectedService) => {
    setServiceLines((current) => {
      const updated = [...current];
      const previousLine = updated[index];

      const totalMinutes =
        Number(selectedService.duration_minutes || 0) +
        Number(selectedService.cleanup_minutes || 0);

      const newLine = {
        ...previousLine,
        service_id: selectedService.id,
        service_search: `${selectedService.category} - ${selectedService.name}`,
        staff_id: isStaffAllowedForService(
          previousLine.staff_id,
          selectedService.id
        )
          ? previousLine.staff_id
          : "",
        duration_minutes: Number(selectedService.duration_minutes || 0),
        cleanup_minutes: Number(selectedService.cleanup_minutes || 0),
        price: Number(selectedService.base_price || 0),
        quantity: 1,
      };

      if (newLine.start_time) {
        newLine.end_time = addMinutesToTime(newLine.start_time, totalMinutes);
      }

      updated[index] = newLine;
      return updated;
    });

    setActiveSuggestion((current) => ({
      ...current,
      [index]: 0,
    }));

    setClosedSuggestions((current) => ({
      ...current,
      [index]: true,
    }));
  };

  const handleServiceLineChange = (index, field, value) => {
  setServiceLines((current) => {
    const updated = [...current];
    const line = { ...updated[index], [field]: value };

    if (field === "service_search") {
      line.service_id = "";
      line.duration_minutes = 0;
      line.cleanup_minutes = 0;
      line.price = 0;
      line.end_time = "";

      setClosedSuggestions((current) => ({
        ...current,
        [index]: false,
      }));

      setActiveSuggestion((current) => ({
        ...current,
        [index]: 0,
      }));
    }

    if (
      field === "staff_id" &&
      value &&
      line.service_id &&
      !isStaffAllowedForService(value, line.service_id)
    ) {
      line.service_id = "";
      line.service_search = "";
      line.duration_minutes = 0;
      line.cleanup_minutes = 0;
      line.price = 0;
      line.end_time = "";
    }

    if (field === "staff_id" && value && !line.start_time) {
      const previousSameStaffLine = updated
        .slice(0, index)
        .reverse()
        .find(
          (item) =>
            item.staff_id === value &&
            item.end_time &&
            item.end_time !== ""
        );

      if (previousSameStaffLine) {
        line.start_time = previousSameStaffLine.end_time;

        const totalMinutes =
          Number(line.duration_minutes || 0) +
          Number(line.cleanup_minutes || 0);

        if (totalMinutes > 0) {
          line.end_time = addMinutesToTime(line.start_time, totalMinutes);
        }
      }
    }

    if (field === "start_time") {
      const totalMinutes =
        Number(line.duration_minutes || 0) +
        Number(line.cleanup_minutes || 0);

      line.end_time = addMinutesToTime(value, totalMinutes);
    }

    if (field === "duration_minutes" || field === "cleanup_minutes") {
      const totalMinutes =
        Number(line.duration_minutes || 0) +
        Number(line.cleanup_minutes || 0);

      if (line.start_time) {
        line.end_time = addMinutesToTime(line.start_time, totalMinutes);
      }
    }

    updated[index] = line;
    return updated;
  });
};

  const handleServiceSearchKeyDown = (event, index, matches) => {
    if (!matches.length) return;

    const currentIndex = activeSuggestion[index] || 0;

    if (event.key === "ArrowDown") {
      event.preventDefault();

      setClosedSuggestions((current) => ({
        ...current,
        [index]: false,
      }));

      setActiveSuggestion((current) => ({
        ...current,
        [index]: currentIndex >= matches.length - 1 ? 0 : currentIndex + 1,
      }));
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      setClosedSuggestions((current) => ({
        ...current,
        [index]: false,
      }));

      setActiveSuggestion((current) => ({
        ...current,
        [index]: currentIndex <= 0 ? matches.length - 1 : currentIndex - 1,
      }));
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selectedService = matches[currentIndex];

      if (selectedService) {
        applySelectedService(index, selectedService);
      }
    }

    if (event.key === "Escape") {
      event.preventDefault();

      setClosedSuggestions((current) => ({
        ...current,
        [index]: true,
      }));
    }
  };

  const addServiceLine = () => {
  setServiceLines((current) => [...current, { ...emptyServiceLine }]);
};



  const removeServiceLine = (index) => {
    setServiceLines((current) => {
      if (current.length === 1) return current;
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const addAppointmentExtraLine = () => {
  setAppointmentExtraLines((current) => [
    ...current,
    { ...emptyAppointmentExtraLine },
  ]);
};

const removeAppointmentExtraLine = (index) => {
  setAppointmentExtraLines((current) =>
    current.filter((_, itemIndex) => itemIndex !== index)
  );
};

const handleAppointmentExtraLineChange = (index, field, value) => {
  setAppointmentExtraLines((current) =>
    current.map((line, itemIndex) => {
      if (itemIndex !== index) return line;

      const updatedLine = {
        ...line,
        [field]: value,
      };

      if (field === "extra_id") {
        const selectedExtra = extras.find((extra) => extra.id === value);

        if (selectedExtra) {
          updatedLine.name = selectedExtra.name || "";
          updatedLine.unit_price = Number(selectedExtra.price || 0);

          if (!updatedLine.quantity) {
            updatedLine.quantity = 1;
          }
        }
      }

      const quantity = Number(
        field === "quantity" ? value : updatedLine.quantity || 0
      );
      const unitPrice = Number(
        field === "unit_price" ? value : updatedLine.unit_price || 0
      );

      updatedLine.total_price = Number((quantity * unitPrice).toFixed(2));

      return updatedLine;
    })
  );
};

const validAppointmentExtras = useMemo(() => {
  return appointmentExtraLines.filter(
    (line) => line.name.trim() && Number(line.total_price || 0) > 0
  );
}, [appointmentExtraLines]);

  const validServiceLines = useMemo(() => {
    return serviceLines.filter(
      (line) =>
        line.service_id && line.staff_id && line.start_time && line.end_time
    );
  }, [serviceLines]);

  const incompleteServiceLines = useMemo(() => {
    return serviceLines
      .map((line, index) => ({ ...line, index }))
      .filter((line) => {
        const hasAnyValue =
          line.service_id ||
          line.service_search?.trim() ||
          line.staff_id ||
          line.start_time ||
          line.end_time ||
          line.notes?.trim();

        if (!hasAnyValue) return false;

        return !(
          line.service_id &&
          line.staff_id &&
          line.start_time &&
          line.end_time
        );
      });
  }, [serviceLines]);

  const checkStaffServiceRestrictions = () => {
    for (const line of validServiceLines) {
      if (isStaffAllowedForService(line.staff_id, line.service_id)) continue;

      const staffName = getStaffName(line.staff_id);
      const serviceName = getServiceName(line.service_id);

      return {
        hasConflict: true,
        message: canForceAgenda
          ? `${staffName} no tiene asignado el servicio ${serviceName}. Revisa Servicios por técnica o marca “Forzar cita” si deseas guardarlo de todos modos.`
          : "Esta técnica no tiene asignado este servicio. Revisa Servicios por técnica o selecciona otra técnica.",
      };
    }

    return { hasConflict: false, message: "" };
  };

 const estimatedTotal = useMemo(() => {
  const servicesTotal = serviceLines.reduce((sum, line) => {
    return sum + Number(line.price || 0) * Number(line.quantity || 1);
  }, 0);

  const extrasTotal = appointmentExtraLines.reduce((sum, line) => {
    return sum + Number(line.total_price || 0);
  }, 0);

  return servicesTotal + extrasTotal;
}, [serviceLines, appointmentExtraLines]);

  const earliestStartTime = useMemo(() => {
    const times = validServiceLines
      .map((line) => line.start_time)
      .filter(Boolean)
      .sort();

    return times[0] || null;
  }, [validServiceLines]);

  const latestEndTime = useMemo(() => {
    const times = validServiceLines
      .map((line) => line.end_time)
      .filter(Boolean)
      .sort();

    return times[times.length - 1] || null;
  }, [validServiceLines]);

  useEffect(() => {
    const loadAcrylicWarning = async () => {
      if (!form.client_id || !form.appointment_date) {
        setAcrylicWarning(null);
        setLoadingAcrylicWarning(false);
        return;
      }

      setLoadingAcrylicWarning(true);

      const { data, error } = await supabase
        .from("appointments")
        .select(
          `
          id,
          appointment_date,
          start_time,
          appointment_services (
            id,
            services (
              name
            )
          )
        `
        )
        .eq("client_id", form.client_id)
        .order("appointment_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) {
        setAcrylicWarning({
          type: "error",
          message: `No se pudo revisar el historial de acrílico: ${error.message}`,
        });
        setLoadingAcrylicWarning(false);
        return;
      }

      const appointmentDate = form.appointment_date;
      const appointmentStart = earliestStartTime;

      const previousAppointments = (data || []).filter((appointment) => {
        if (editingAppointmentId && appointment.id === editingAppointmentId) {
          return false;
        }

        if (appointment.appointment_date < appointmentDate) return true;
        if (appointment.appointment_date > appointmentDate) return false;

        if (!appointmentStart || !appointment.start_time) return false;

        return appointment.start_time < appointmentStart;
      });

      let fillsAfterLastApplication = 0;
      let lastApplication = null;
      let lastAcrylicService = null;

      previousAppointments.forEach((appointment) => {
        const acrylicServices = (appointment.appointment_services || []).filter(
          (item) => serviceHasAcrylic(item.services?.name)
        );

        acrylicServices.forEach((item) => {
          const serviceName = item.services?.name || "Servicio de acrílico";
          const serviceInfo = {
            name: serviceName,
            date: appointment.appointment_date,
            time: appointment.start_time,
          };

          if (isAcrylicCycleReset(serviceName)) {
            fillsAfterLastApplication = 0;
            lastApplication = serviceInfo;
          } else if (isAcrylicFill(serviceName)) {
            fillsAfterLastApplication += 1;
          }

          lastAcrylicService = serviceInfo;
        });
      });

      if (fillsAfterLastApplication >= 2) {
        setAcrylicWarning({
          type: "warning",
          fillsAfterLastApplication,
          lastApplication,
          lastAcrylicService,
        });
      } else {
        setAcrylicWarning(null);
      }

      setLoadingAcrylicWarning(false);
    };

    loadAcrylicWarning();
  }, [form.client_id, form.appointment_date, earliestStartTime, editingAppointmentId]);

  const getServiceName = (serviceId) => {
    const service = services.find((item) => item.id === serviceId);
    return service?.name || "Servicio";
  };

  const getStaffName = (staffId) => {
    const person = staff.find((item) => item.id === staffId);
    return person?.full_name || "Técnica";
  };

  const resetForm = () => {
    setForm({
      client_id: "",
      appointment_date: selectedDate,
      deposit_amount: "",
      deposit_payment_method: "",
      design_image_url: "",
      notes: "",
      force_created: false,
    });

    setServiceLines([{ ...emptyServiceLine }]);
    setAppointmentExtraLines([]);
    setDesignImageFile(null);
    setActiveSuggestion({});
    setClosedSuggestions({});
    setAvailabilitySuggestions([]);
    setEditingAppointmentId(null);
  };

  const openNewAppointment = ({ date, staffId, startTime } = {}) => {
    const targetDate = date || selectedDate;

    setEditingAppointmentId(null);
    setSelectedAppointment(null);
    setSelectedDate(targetDate);
    setForm({
      client_id: "",
      appointment_date: targetDate,
      deposit_amount: "",
      deposit_payment_method: "",
      design_image_url: "",
      notes: "",
      force_created: false,
    });
    setAppointmentExtraLines([]);
    setDesignImageFile(null);

    setServiceLines(() => {
      const firstLine = { ...emptyServiceLine };

      if (staffId) {
        firstLine.staff_id = staffId;
      }

      if (startTime) {
        firstLine.start_time = startTime;
      }

      return [firstLine];
    });

    setMessage(
      startTime && staffId
        ? "Horario y técnica seleccionados para nueva cita ✨"
        : "Día seleccionado para nueva cita ✨"
    );

    setActiveSection("nueva");
  };

  const openAppointmentDetail = (appointment) => {
    setAppointmentPopover(appointment);
   
  };
const getPaymentForAppointment = (appointmentId) => {
  if (!appointmentId) return null;

  return payments.find((payment) => payment.appointment_id === appointmentId);
};

const appointmentMatchesFilters = (appointment) => {
  const servicesForAppointment = appointment.appointment_services || [];

  if (
    staffFilter &&
    !servicesForAppointment.some((service) => service.staff_id === staffFilter)
  ) {
    return false;
  }

  if (
    appointmentStatusFilter &&
    String(appointment.attendance_status || "pendiente") !== appointmentStatusFilter
  ) {
    return false;
  }

  return true;
};

const visibleStaff = useMemo(() => {
  return staffFilter
    ? staff.filter((person) => person.id === staffFilter)
    : staff;
}, [staff, staffFilter]);

const appointmentSearchPool = useMemo(() => {
  const map = new Map();

  [...appointments, ...rangeAppointments].forEach((appointment) => {
    if (appointment?.id) {
      map.set(appointment.id, appointment);
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const dateCompare = String(a.appointment_date || "").localeCompare(
      String(b.appointment_date || "")
    );

    if (dateCompare !== 0) return dateCompare;

    return String(a.start_time || "").localeCompare(String(b.start_time || ""));
  });
}, [appointments, rangeAppointments]);

const quickSearchResults = useMemo(() => {
  const term = quickSearch.trim().toLowerCase();

  if (term.length < 2) return [];

  return appointmentSearchPool
    .filter((appointment) => {
      const servicesText = getAppointmentServicesText(appointment).toLowerCase();
      const clientName = String(appointment.clients?.full_name || "").toLowerCase();
      const phone = String(appointment.clients?.phone || "").toLowerCase();
      const clientNumber = String(
        appointment.clients?.client_number || ""
      ).toLowerCase();
      const date = String(appointment.appointment_date || "").toLowerCase();

      return (
        clientName.includes(term) ||
        phone.includes(term) ||
        clientNumber.includes(term) ||
        servicesText.includes(term) ||
        date.includes(term)
      );
    })
    .slice(0, 10);
}, [appointmentSearchPool, quickSearch]);

const handleAppointmentLocalUpdate = (appointmentId, changes) => {
  if (!appointmentId) return;

  const applyChanges = (appointment) =>
    appointment?.id === appointmentId ? { ...appointment, ...changes } : appointment;

  setAppointments((current) => current.map(applyChanges));
  setRangeAppointments((current) => current.map(applyChanges));
  setSelectedAppointment((current) => applyChanges(current));
  setAppointmentPopover((current) => applyChanges(current));
};

  const openEditAppointment = (appointment) => {
    if (!appointment) return;

    setSelectedAppointment(null);
    setEditingAppointmentId(appointment.id);
    setSelectedDate(appointment.appointment_date);

    setForm({
      client_id: appointment.client_id || "",
      appointment_date: appointment.appointment_date || selectedDate,
      deposit_amount: appointment.deposit_amount ?? "",
      deposit_payment_method: appointment.deposit_payment_method || "",
      design_image_url: appointment.design_image_url || "",
      notes: appointment.notes || "",
      force_created: Boolean(appointment.force_created),
    });

    const lines = (appointment.appointment_services || []).map((item) => ({
      service_id: item.service_id || "",
      service_search: item.services
        ? `${item.services.category || "Servicio"} - ${item.services.name}`
        : "",
      staff_id: item.staff_id || "",
      start_time: formatTime(item.start_time),
      end_time: formatTime(item.end_time),
      duration_minutes: Number(item.duration_minutes || 0),
      cleanup_minutes: Number(item.cleanup_minutes || 0),
      price: Number(item.price || item.total_price || 0),
      quantity: Number(item.quantity || 1),
      notes: item.notes || "",
    }));

    setServiceLines(lines.length > 0 ? lines : [{ ...emptyServiceLine }]);
    setAppointmentExtraLines(
      (appointment.appointment_extra_items || []).map((item) => ({
        extra_id: item.extra_id || "",
        staff_id: item.staff_id || "",
        name: item.name || "",
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unit_price || 0),
        total_price: Number(item.total_price || 0),
        notes: item.notes || "",
      }))
    );
    setDesignImageFile(null);
    setMessage("Cita cargada para edición ✨");
    setActiveSection("nueva");
  };

  const checkInternalConflicts = () => {
    for (let i = 0; i < validServiceLines.length; i++) {
      for (let j = i + 1; j < validServiceLines.length; j++) {
        const first = validServiceLines[i];
        const second = validServiceLines[j];

        if (first.staff_id !== second.staff_id) continue;

        const overlap = timesOverlap(
          first.start_time,
          first.end_time,
          second.start_time,
          second.end_time
        );

        if (overlap) {
          return {
            hasConflict: true,
            message: `${getStaffName(
              first.staff_id
            )} tiene empalme dentro de esta misma cita: ${getServiceName(
              first.service_id
            )} (${formatTime(first.start_time)} - ${formatTime(
              first.end_time
            )}) y ${getServiceName(second.service_id)} (${formatTime(
              second.start_time
            )} - ${formatTime(second.end_time)}).`,
          };
        }
      }
    }

    return { hasConflict: false, message: "" };
  };

  const checkStaffScheduleConflicts = () => {
    const appointmentDay = getDayOfWeek(form.appointment_date);

    for (const line of validServiceLines) {
      const staffName = getStaffName(line.staff_id);

      const schedule = staffSchedules.find(
        (item) =>
          item.staff_id === line.staff_id &&
          Number(item.day_of_week) === Number(appointmentDay)
      );

      if (!schedule || !schedule.is_active) {
        return {
          hasConflict: true,
          message: `${staffName} no tiene horario activo para ese día. Marca “Forzar cita” si deseas guardarla de todos modos.`,
        };
      }

      if (schedule.is_day_off) {
        return {
          hasConflict: true,
          message: `${staffName} tiene marcado ese día como descanso. Marca “Forzar cita” si deseas guardarla de todos modos.`,
        };
      }

      const startsBeforeSchedule =
        timeToMinutes(line.start_time) < timeToMinutes(schedule.start_time);

      const endsAfterSchedule =
        timeToMinutes(line.end_time) > timeToMinutes(schedule.end_time);

      if (startsBeforeSchedule || endsAfterSchedule) {
        return {
          hasConflict: true,
          message: `${staffName} trabaja de ${formatTime(
            schedule.start_time
          )} a ${formatTime(
            schedule.end_time
          )}. El servicio ${getServiceName(
            line.service_id
          )} queda fuera de horario.`,
        };
      }

      if (
        schedule.has_break &&
        schedule.break_start &&
        schedule.break_end &&
        timesOverlap(
          line.start_time,
          line.end_time,
          schedule.break_start,
          schedule.break_end
        )
      ) {
        return {
          hasConflict: true,
          message: `${staffName} tiene descanso intermedio de ${formatTime(
            schedule.break_start
          )} a ${formatTime(
            schedule.break_end
          )}. El servicio ${getServiceName(
            line.service_id
          )} cae dentro de ese descanso.`,
        };
      }
    }

    return { hasConflict: false, message: "" };
  };
    const checkTimeBlockConflicts = async () => {
    const { data, error } = await supabase
      .from("staff_time_blocks")
      .select("*, staff(full_name)")
      .eq("block_date", form.appointment_date);

    if (error) {
      return {
        hasConflict: true,
        message: `No se pudo validar bloqueos: ${error.message}`,
      };
    }

    const blocksForDate = data || [];

    for (const line of validServiceLines) {
      for (const block of blocksForDate) {
        if (line.staff_id !== block.staff_id) continue;

        const overlap = timesOverlap(
          line.start_time,
          line.end_time,
          block.start_time,
          block.end_time
        );

        if (overlap) {
          return {
            hasConflict: true,
            message: `${
              block.staff?.full_name || "La técnica"
            } tiene bloqueo "${block.title}" de ${formatTime(
              block.start_time
            )} a ${formatTime(
              block.end_time
            )}. Marca “Forzar cita” si deseas guardarla de todos modos.`,
          };
        }
      }
    }

    return { hasConflict: false, message: "" };
  };

  const checkDatabaseConflicts = async () => {
    const { data, error } = await supabase
      .from("appointment_services")
      .select(
        `
        id,
        staff_id,
        service_date,
        start_time,
        end_time,
        appointment_id,
        services (
          name
        ),
        staff (
          full_name
        ),
        appointments (
          status,
          clients (
            full_name
          )
        )
      `
      )
      .eq("service_date", form.appointment_date);

    if (error) {
      return {
        hasConflict: true,
        message: `No se pudo validar disponibilidad: ${error.message}`,
      };
    }

    const existingServices = (data || []).filter((item) => {
      const status = item.appointments?.status || "";

      if (status === "cancelada" || status === "cancelado") return false;

      if (editingAppointmentId && item.appointment_id === editingAppointmentId) {
        return false;
      }

      return true;
    });

    for (const newLine of validServiceLines) {
      for (const existing of existingServices) {
        if (newLine.staff_id !== existing.staff_id) continue;

        const overlap = timesOverlap(
          newLine.start_time,
          newLine.end_time,
          existing.start_time,
          existing.end_time
        );

        if (overlap) {
          return {
            hasConflict: true,
            message: `${existing.staff?.full_name || "La técnica"} ya tiene ${
              existing.services?.name || "un servicio"
            } con ${
              existing.appointments?.clients?.full_name || "una clienta"
            } de ${formatTime(existing.start_time)} a ${formatTime(
              existing.end_time
            )}. Marca “Forzar cita” si deseas guardarla de todos modos.`,
          };
        }
      }
    }

    return { hasConflict: false, message: "" };
  };

  const checkResourceConflicts = async () => {
    const activeServiceResources = serviceResources.filter(
      (item) => item.active !== false
    );

    if (activeServiceResources.length === 0 || resources.length === 0) {
      return { hasConflict: false, message: "" };
    }

    const serviceResourceRows = (serviceId) =>
      activeServiceResources.filter((item) => item.service_id === serviceId);

    const appointmentUsesResources = validServiceLines.some(
      (line) => serviceResourceRows(line.service_id).length > 0
    );

    if (!appointmentUsesResources) {
      return { hasConflict: false, message: "" };
    }

    const { data, error } = await supabase
      .from("appointment_services")
      .select(
        `
        id,
        appointment_id,
        service_id,
        service_date,
        start_time,
        end_time,
        appointments (
          status
        )
      `
      )
      .eq("service_date", form.appointment_date);

    if (error) {
      return {
        hasConflict: true,
        message: `No se pudo validar mobiliario/recursos: ${error.message}`,
      };
    }

    const existingServices = (data || []).filter((item) => {
      const status = item.appointments?.status || "";

      if (status === "cancelada" || status === "cancelado") return false;

      if (editingAppointmentId && item.appointment_id === editingAppointmentId) {
        return false;
      }

      return true;
    });

    for (const line of validServiceLines) {
      const requiredResources = serviceResourceRows(line.service_id);

      for (const requiredResource of requiredResources) {
        const resource = resources.find(
          (item) => item.id === requiredResource.resource_id
        );

        if (!resource || resource.active === false) continue;

        const quantityAvailable = Number(resource.quantity || 0);
        const resourceName = resource.name || "recurso";

        const existingUsage = existingServices.reduce((sum, existing) => {
          if (
            !timesOverlap(
              line.start_time,
              line.end_time,
              existing.start_time,
              existing.end_time
            )
          ) {
            return sum;
          }

          const existingRequirement = activeServiceResources.find(
            (item) =>
              item.service_id === existing.service_id &&
              item.resource_id === requiredResource.resource_id &&
              item.active !== false
          );

          return (
            sum + Number(existingRequirement?.quantity_required || 0)
          );
        }, 0);

        const currentAppointmentUsage = validServiceLines.reduce(
          (sum, currentLine) => {
            if (
              !timesOverlap(
                line.start_time,
                line.end_time,
                currentLine.start_time,
                currentLine.end_time
              )
            ) {
              return sum;
            }

            const currentRequirement = activeServiceResources.find(
              (item) =>
                item.service_id === currentLine.service_id &&
                item.resource_id === requiredResource.resource_id &&
                item.active !== false
            );

            return (
              sum + Number(currentRequirement?.quantity_required || 0)
            );
          },
          0
        );

        if (existingUsage + currentAppointmentUsage > quantityAvailable) {
          return {
            hasConflict: true,
            message: `No hay suficientes ${resourceName} disponibles en ese horario. ${
              canForceAgenda
                ? "Marca “Forzar cita” si deseas guardarlo de todos modos."
                : "Pide a admin revisar el horario o recursos."
            }`,
          };
        }
      }
    }

    return { hasConflict: false, message: "" };
  };

  const isSlotAvailableForStaff = ({
    staffId,
    date,
    startTime,
    durationMinutes,
    existingServices = [],
    blocksForDate = [],
  }) => {
    const endTime = addMinutesToTime(startTime, durationMinutes);
    const dayOfWeek = getDayOfWeek(date);

    const schedule = staffSchedules.find(
      (item) =>
        item.staff_id === staffId &&
        Number(item.day_of_week) === Number(dayOfWeek)
    );

    if (!schedule || !schedule.is_active || schedule.is_day_off) {
      return false;
    }

    if (
      timeToMinutes(startTime) < timeToMinutes(schedule.start_time) ||
      timeToMinutes(endTime) > timeToMinutes(schedule.end_time)
    ) {
      return false;
    }

    if (
      schedule.has_break &&
      schedule.break_start &&
      schedule.break_end &&
      timesOverlap(startTime, endTime, schedule.break_start, schedule.break_end)
    ) {
      return false;
    }

    const hasAppointmentConflict = existingServices.some((item) => {
      const status = item.appointments?.status || "";

      if (status === "cancelada" || status === "cancelado") return false;

      if (editingAppointmentId && item.appointment_id === editingAppointmentId) {
        return false;
      }

      if (item.staff_id !== staffId) return false;

      return timesOverlap(startTime, endTime, item.start_time, item.end_time);
    });

    if (hasAppointmentConflict) return false;

    const hasBlockConflict = blocksForDate.some((block) => {
      if (block.staff_id !== staffId) return false;

      return timesOverlap(startTime, endTime, block.start_time, block.end_time);
    });

    if (hasBlockConflict) return false;

    return true;
  };

  const findAvailableSpaces = async () => {
    setAvailabilityMessage("Buscando espacios disponibles...");
    setAvailabilitySuggestions([]);

    const selectedLines = serviceLines.filter((line) => line.service_id);

    if (selectedLines.length === 0) {
      setAvailabilityMessage(
        "Selecciona al menos un servicio para buscar espacios disponibles."
      );
      return;
    }

    const totalDuration = selectedLines.reduce((sum, line) => {
      return (
        sum +
        Number(line.duration_minutes || 0) +
        Number(line.cleanup_minutes || 0)
      );
    }, 0);

    if (totalDuration <= 0) {
      setAvailabilityMessage(
        "Los servicios seleccionados no tienen duración registrada."
      );
      return;
    }

    const preferredStaffIds = [
      ...new Set(selectedLines.map((line) => line.staff_id).filter(Boolean)),
    ];

    const staffToCheck =
      preferredStaffIds.length > 0
        ? staff.filter((person) => preferredStaffIds.includes(person.id))
        : staff;

    if (staffToCheck.length === 0) {
      setAvailabilityMessage(
        "No hay técnicas disponibles para revisar espacios."
      );
      return;
    }

    const { data: existingServices, error: servicesError } = await supabase
      .from("appointment_services")
      .select(
        `
        id,
        appointment_id,
        staff_id,
        service_date,
        start_time,
        end_time,
        appointments (
          status
        )
      `
      )
      .eq("service_date", form.appointment_date);

    if (servicesError) {
      setAvailabilityMessage(
        `No se pudo validar la agenda: ${servicesError.message}`
      );
      return;
    }

    const { data: blocksForDate, error: blocksError } = await supabase
      .from("staff_time_blocks")
      .select("*")
      .eq("block_date", form.appointment_date);

    if (blocksError) {
      setAvailabilityMessage(
        `No se pudo validar bloqueos: ${blocksError.message}`
      );
      return;
    }

    const suggestions = [];

    for (const person of staffToCheck) {
      for (const startTime of timeOptions) {
        const available = isSlotAvailableForStaff({
          staffId: person.id,
          date: form.appointment_date,
          startTime,
          durationMinutes: totalDuration,
          existingServices: existingServices || [],
          blocksForDate: blocksForDate || [],
        });

        if (available) {
          suggestions.push({
            staff_id: person.id,
            staff_name: person.full_name,
            staff_color: person.color || "#bd7b83",
            start_time: startTime,
            end_time: addMinutesToTime(startTime, totalDuration),
            duration_minutes: totalDuration,
          });
        }

        if (suggestions.length >= 12) break;
      }

      if (suggestions.length >= 12) break;
    }

    setAvailabilitySuggestions(suggestions);

    if (suggestions.length === 0) {
      setAvailabilityMessage(
        "No encontré espacios libres con esos servicios y técnica. Prueba otra fecha o marca una técnica diferente."
      );
      return;
    }

    setAvailabilityMessage(
      `Encontré ${suggestions.length} espacio(s) disponible(s) ✨`
    );
  };

  const applyAvailabilitySuggestion = (suggestion) => {
    setServiceLines((current) => {
      let currentStart = suggestion.start_time;

      return current.map((line) => {
        if (!line.service_id) return line;

        const lineDuration =
          Number(line.duration_minutes || 0) +
          Number(line.cleanup_minutes || 0);

        const updatedLine = {
          ...line,
          staff_id: suggestion.staff_id,
          start_time: currentStart,
          end_time: addMinutesToTime(currentStart, lineDuration),
        };

        currentStart = updatedLine.end_time;

        return updatedLine;
      });
    });

    setAvailabilityMessage(
      `Espacio seleccionado con ${suggestion.staff_name} de ${suggestion.start_time} a ${suggestion.end_time} ✨`
    );

    setActiveSection("nueva");
  };
 
const createAppointmentFollowups = async (appointment) => {
  if (!appointment?.id || !appointment?.client_id || !appointment?.appointment_date) {
    return;
  }

  const { error: deleteError } = await supabase
    .from("appointment_followups")
    .delete()
    .eq("appointment_id", appointment.id)
    .eq("followup_status", "pendiente");

  if (deleteError) {
    setMessage(
      `La cita se guardó, pero no se pudieron actualizar los seguimientos pendientes: ${deleteError.message}`
    );
    return;
  }

  const rows = [];

  for (const line of validServiceLines) {
    const service = services.find((item) => item.id === line.service_id);

    if (!service) continue;

    const rule = getFollowupRuleFromConfig(
  followupRules,
  service.name,
  service.category
);

   if (!rule) continue;

    const followupDate =
  Number(rule.followup_months || 0) > 0
    ? addMonthsToDate(
        appointment.appointment_date,
        Number(rule.followup_months || 0)
      )
    : addDaysToDate(
        appointment.appointment_date,
        Number(rule.followup_days || 14)
      );

    const client = clients.find((item) => item.id === appointment.client_id);
    const clientName = client?.full_name || "";

     rows.push({
      appointment_id: appointment.id,
      client_id: appointment.client_id,
      service_id: line.service_id,
      staff_id: line.staff_id || appointment.staff_id || null,
     followup_type: rule.followup_type || "reagendar",
      followup_date: followupDate,
      followup_status: "pendiente",
     message_body: buildFollowupMessage(rule.message_body, clientName),
      notes: `Seguimiento generado automáticamente por el servicio: ${service.name}`,
    });
  }

  if (rows.length === 0) return;

  const { error } = await supabase.from("appointment_followups").insert(rows);

  if (error) {
    setMessage(
      `La cita se guardó, pero no se pudieron crear los seguimientos: ${error.message}`
    );
  }
};

const notifyAppointmentStaff = async ({
  appointment,
  lines,
  eventType,
  previousStaffIds = [],
}) => {
  if (!appointment?.id || !eventType) return null;

  const currentStaffIds = [
    ...new Set((lines || []).map((line) => line.staff_id).filter(Boolean)),
  ];
  const targetStaffIds = [
    ...new Set([...currentStaffIds, ...previousStaffIds].filter(Boolean)),
  ];

  if (targetStaffIds.length === 0) return null;

  const client = clients.find((item) => item.id === appointment.client_id);
  const clientName = client?.full_name || "Clienta";
  const serviceText =
    (lines || [])
      .map((line) => getServiceName(line.service_id))
      .filter(Boolean)
      .join(", ") || "servicio";

  const titles = {
    cita_nueva: "Nueva cita asignada",
    cita_actualizada: "Cita actualizada",
    cita_estado: "Estado de cita actualizado",
  };

  const messages = {
    cita_nueva: `Se agendó una cita para ${clientName} el ${appointment.appointment_date} de ${formatTime(
      appointment.start_time
    )} a ${formatTime(appointment.end_time)} · ${serviceText}`,
    cita_actualizada: `Se actualizó la cita de ${clientName} para el ${appointment.appointment_date} de ${formatTime(
      appointment.start_time
    )} a ${formatTime(appointment.end_time)} · ${serviceText}`,
    cita_estado: `Cambió el estado de la cita de ${clientName} el ${appointment.appointment_date} · ${serviceText}`,
  };

  const rows = targetStaffIds.map((staffId) => ({
    staff_id: staffId,
    title: titles[eventType] || "Movimiento de cita",
    message: messages[eventType] || messages.cita_actualizada,
    notification_type: eventType,
    related_table: "appointments",
    related_id: appointment.id,
    is_read: false,
  }));

  const { data, error } = await supabase
    .from("notifications")
    .insert(rows)
    .select("id");

  if (error) return error;

  const pushResult = await triggerPushForNotificationIds(
    (data || []).map((notification) => notification.id)
  );

  return pushResult.error || null;
};

const handleSubmit = async () => {
    setSaving(true);
    setMessage("");

    if (!form.client_id || !form.appointment_date) {
      setMessage("La clienta y la fecha son obligatorias.");
      setSaving(false);
      return;
    }

    if (validServiceLines.length === 0) {
      setMessage(
        "Agrega al menos un servicio con servicio, técnica, hora de inicio y hora de fin."
      );
      setSaving(false);
      return;
    }

    if (incompleteServiceLines.length > 0) {
      const firstIncomplete = incompleteServiceLines[0];
      setMessage(
        `El servicio ${firstIncomplete.index + 1} está incompleto. Selecciona servicio, técnica, hora de inicio y hora de fin antes de guardar.`
      );
      setSaving(false);
      return;
    }

    const staffServiceConflict = checkStaffServiceRestrictions();

    if (
      staffServiceConflict.hasConflict &&
      (!form.force_created || !canForceAgenda)
    ) {
      setMessage(staffServiceConflict.message);
      setSaving(false);
      return;
    }

    const internalConflict = checkInternalConflicts();

    if (internalConflict.hasConflict && (!form.force_created || !canForceAgenda)) {
      setMessage(internalConflict.message);
      setSaving(false);
      return;
    }

    const scheduleConflict = checkStaffScheduleConflicts();

    if (scheduleConflict.hasConflict && (!form.force_created || !canForceAgenda)) {
      setMessage(scheduleConflict.message);
      setSaving(false);
      return;
    }

    const timeBlockConflict = await checkTimeBlockConflicts();

    if (timeBlockConflict.hasConflict && (!form.force_created || !canForceAgenda)) {
      setMessage(timeBlockConflict.message);
      setSaving(false);
      return;
    }

    const databaseConflict = await checkDatabaseConflicts();

    if (databaseConflict.hasConflict && (!form.force_created || !canForceAgenda)) {
      setMessage(databaseConflict.message);
      setSaving(false);
      return;
    }

    const resourceConflict = await checkResourceConflicts();

    if (resourceConflict.hasConflict && (!form.force_created || !canForceAgenda)) {
      setMessage(resourceConflict.message);
      setSaving(false);
      return;
    }

    const firstStaffId = validServiceLines[0].staff_id;

    const appointmentData = {
      client_id: form.client_id,
      staff_id: firstStaffId,
      appointment_date: form.appointment_date,
      start_time: earliestStartTime,
      end_time: latestEndTime,
      status: "agendada",
      estimated_total: estimatedTotal,
      deposit_amount: Number(form.deposit_amount || 0),
      deposit_payment_method: form.deposit_payment_method || null,
      design_image_url: form.design_image_url?.trim() || null,
      force_created: form.force_created,
      notes: form.notes.trim() || null,
    };

    if (!editingAppointmentId) {
      appointmentData.attendance_status = "pendiente";
    }

    let appointment = null;
    const wasEditing = Boolean(editingAppointmentId);
    let designImageWarning = "";
    let notificationWarning = "";
    const previousAppointmentSnapshot = wasEditing
      ? appointments.find((item) => item.id === editingAppointmentId) ||
        rangeAppointments.find((item) => item.id === editingAppointmentId)
      : null;
    const previousStaffIds = [
      ...new Set(
        (previousAppointmentSnapshot?.appointment_services || [])
          .map((item) => item.staff_id)
          .filter(Boolean)
      ),
    ];
    const previousSignature = previousAppointmentSnapshot
      ? [
          previousAppointmentSnapshot.appointment_date,
          previousAppointmentSnapshot.start_time,
          previousAppointmentSnapshot.end_time,
          previousStaffIds.sort().join(","),
        ].join("|")
      : "";
    const previousServicesSignature = previousAppointmentSnapshot
      ? (previousAppointmentSnapshot.appointment_services || [])
          .map((item) =>
            [
              item.service_id,
              item.staff_id,
              formatTime(item.start_time),
              formatTime(item.end_time),
            ].join(":")
          )
          .sort()
          .join("|")
      : "";

    if (editingAppointmentId) {
      const { data: updatedAppointment, error: updateError } = await supabase
        .from("appointments")
        .update(appointmentData)
        .eq("id", editingAppointmentId)
        .select()
        .single();

      if (updateError) {
        setMessage(`No se pudo actualizar la cita: ${updateError.message}`);
        setSaving(false);
        return;
      }

      const { error: deleteServicesError } = await supabase
        .from("appointment_services")
        .delete()
        .eq("appointment_id", editingAppointmentId);

      if (deleteServicesError) {
        setMessage(
          `La cita se actualizó, pero no se pudieron reemplazar los servicios: ${deleteServicesError.message}`
        );
        setSaving(false);
        return;
      }

      appointment = updatedAppointment;
    } else {
      const { data: createdAppointment, error: appointmentError } =
        await supabase
          .from("appointments")
          .insert([appointmentData])
          .select()
          .single();

      if (appointmentError) {
        setMessage(`No se pudo guardar la cita: ${appointmentError.message}`);
        setSaving(false);
        return;
      }

      appointment = createdAppointment;
    }

    const servicesToInsert = validServiceLines.map((line) => ({
      appointment_id: appointment.id,
      service_id: line.service_id,
      staff_id: line.staff_id,
      service_date: form.appointment_date,
      start_time: line.start_time,
      end_time: line.end_time || null,
      duration_minutes: Number(line.duration_minutes || 0),
      cleanup_minutes: Number(line.cleanup_minutes || 0),
      quantity: Number(line.quantity || 1),
      unit_price: Number(line.price || 0),
      total_price: Number(line.price || 0) * Number(line.quantity || 1),
      price: Number(line.price || 0),
      notes: line.notes.trim() || null,
      status: "agendado",
    }));

    const { error: servicesError } = await supabase
      .from("appointment_services")
      .insert(servicesToInsert);

    if (servicesError) {
      setMessage(
        `La cita se guardó, pero no se pudieron guardar los servicios: ${servicesError.message}`
      );
      setSaving(false);
      return;
    }
   if (editingAppointmentId) {
  const { error: deleteExtrasError } = await supabase
    .from("appointment_extra_items")
    .delete()
    .eq("appointment_id", appointment.id);

  if (deleteExtrasError) {
    setMessage(
      `La cita se guardó, pero no se pudieron actualizar los extras: ${deleteExtrasError.message}`
    );
    setSaving(false);
    return;
  }
}

if (validAppointmentExtras.length > 0) {
  const extrasToInsert = validAppointmentExtras.map((line) => ({
    appointment_id: appointment.id,
    extra_id: line.extra_id || null,
    staff_id: line.staff_id || null,
    name: line.name.trim(),
    quantity: Number(line.quantity || 1),
    unit_price: Number(line.unit_price || 0),
    total_price: Number(line.total_price || 0),
    notes: line.notes?.trim() || null,
  }));

  const { error: extrasError } = await supabase
    .from("appointment_extra_items")
    .insert(extrasToInsert);

  if (extrasError) {
    setMessage(
      `La cita se guardó, pero no se pudieron guardar los extras: ${extrasError.message}`
    );
    setSaving(false);
    return;
  }
} 
if (designImageFile) {
  try {
    const uploadedDesignImageUrl = await uploadDesignImageFile(appointment.id);

    if (uploadedDesignImageUrl) {
      const { data: updatedDesignAppointment, error: designImageUpdateError } =
        await supabase
          .from("appointments")
          .update({
            design_image_url: uploadedDesignImageUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", appointment.id)
          .select()
          .single();

      if (designImageUpdateError) throw designImageUpdateError;

      appointment = updatedDesignAppointment || appointment;
    }
  } catch (error) {
    console.error("No se pudo subir o guardar imagen de diseño", error);
    designImageWarning = ` ${getDesignImageUploadMessage(error)}`;
  }
}

await createAppointmentFollowups(appointment);

const currentStaffSignature = [
  appointment.appointment_date,
  appointment.start_time,
  appointment.end_time,
  [...new Set(validServiceLines.map((line) => line.staff_id).filter(Boolean))]
    .sort()
    .join(","),
].join("|");

const shouldNotifyAppointment =
  !wasEditing || !previousSignature || previousSignature !== currentStaffSignature;

if (shouldNotifyAppointment) {
  const notificationError = await notifyAppointmentStaff({
    appointment,
    lines: validServiceLines,
    eventType: wasEditing ? "cita_actualizada" : "cita_nueva",
    previousStaffIds: wasEditing ? previousStaffIds : [],
  });

  if (notificationError) {
    notificationWarning = ` La cita se guardó, pero no se pudo enviar notificación push: ${notificationError.message}`;
  }
}

const currentServicesSignature = validServiceLines
  .map((line) =>
    [line.service_id, line.staff_id, line.start_time, line.end_time].join(":")
  )
  .sort()
  .join("|");
const adminEventType = !wasEditing
  ? "cita_nueva_admin"
  : previousServicesSignature !== currentServicesSignature
  ? "cita_servicios_admin"
  : "cita_actualizada_admin";
const clientForNotification = clients.find(
  (item) => item.id === appointment.client_id
);
const adminNotificationResult = await triggerAdminAppointmentNotification({
  appointment_id: appointment.id,
  event_type: adminEventType,
  client_name: clientForNotification?.full_name || "Clienta",
  summary: `${appointment.appointment_date} ${formatTime(
    appointment.start_time
  )}-${formatTime(appointment.end_time)} · ${validServiceLines
    .map((line) => getServiceName(line.service_id))
    .filter(Boolean)
    .join(", ")}`,
});

if (adminNotificationResult.error) {
  notificationWarning = `${notificationWarning} No se pudo notificar al admin: ${adminNotificationResult.error.message}`;
}
    setSelectedDate(form.appointment_date);
    await loadDateData(form.appointment_date);
    await loadRangeData(form.appointment_date);

    resetForm();
    setMessage(
      `${
        wasEditing
          ? "Cita actualizada correctamente ✨"
          : "Cita registrada correctamente ✨"
      }${designImageWarning}${notificationWarning}`
    );
    setSaving(false);
    setActiveSection("diaria");
    setAppointmentExtraLines([]);
    setDesignImageFile(null);
  };

  const appointmentsByStaff = useMemo(() => {
    const result = {};

    staff.forEach((person) => {
      result[person.id] = [];
    });

    appointments.forEach((appointment) => {
      if (!appointmentMatchesFilters(appointment)) return;

      const servicesForAppointment = appointment.appointment_services || [];

      servicesForAppointment.forEach((item) => {
        if (!result[item.staff_id]) {
          result[item.staff_id] = [];
        }

        result[item.staff_id].push({
          ...item,
          appointment,
          isBlock: false,
        });
      });
    });

    timeBlocks.forEach((block) => {
      if (staffFilter && block.staff_id !== staffFilter) return;

      if (!result[block.staff_id]) {
        result[block.staff_id] = [];
      }

      result[block.staff_id].push({
        id: `block-${block.id}`,
        isBlock: true,
        start_time: block.start_time,
        end_time: block.end_time,
        block,
      });
    });

    Object.keys(result).forEach((staffId) => {
      result[staffId].sort((a, b) =>
        String(a.start_time || "").localeCompare(String(b.start_time || ""))
      );
    });

    return result;
  }, [appointments, staff, timeBlocks, staffFilter, appointmentStatusFilter]);

  const appointmentsByDate = useMemo(() => {
    const result = {};

    rangeAppointments.forEach((appointment) => {
      if (!appointmentMatchesFilters(appointment)) return;

      const date = appointment.appointment_date;

      if (!result[date]) {
        result[date] = [];
      }

      const servicesForAppointment = appointment.appointment_services || [];
      const orderedServices = [...servicesForAppointment].sort((a, b) =>
        String(a.start_time || "").localeCompare(String(b.start_time || ""))
      );
      const firstService = orderedServices[0];
      const lastService = [...orderedServices].sort((a, b) =>
        String(b.end_time || "").localeCompare(String(a.end_time || ""))
      )[0];

      result[date].push({
        id: `appointment-${appointment.id}`,
        appointment,
        isBlock: false,
        start_time: appointment.start_time || firstService?.start_time,
        end_time:
          lastService?.end_time ||
          appointment.end_time ||
          appointment.start_time ||
          firstService?.end_time,
        services: {
          name: getAppointmentServicesText(appointment),
        },
        staff: firstService?.staff,
      });
    });

    rangeTimeBlocks.forEach((block) => {
      if (staffFilter && block.staff_id !== staffFilter) return;

      const date = block.block_date;

      if (!result[date]) {
        result[date] = [];
      }

      result[date].push({
        id: `block-${block.id}`,
        isBlock: true,
        start_time: block.start_time,
        end_time: block.end_time,
        block,
      });
    });

    Object.keys(result).forEach((date) => {
      result[date].sort((a, b) =>
        String(a.start_time || "").localeCompare(String(b.start_time || ""))
      );
    });

    return result;
  }, [rangeAppointments, rangeTimeBlocks, staffFilter, appointmentStatusFilter]);

  if (loadingSession) {
    return (
      <main className="min-h-screen bg-[#eef1f3] px-6 py-10 text-[#263238]">
        <p>Cargando...</p>
      </main>
    );
  }

  return (
    <AdminShell
      title="Agenda"
      subtitle="Agenda citas, consulta disponibilidad y visualiza la operación diaria, semanal y mensual."
      activeModule="agenda"
      menuItems={agendaMenuItems}
      activeSection={activeSection}
      setActiveSection={setActiveSection}
    >
      {activeSection === "nueva" && (
        <NewAppointmentSection
          clients={clients}
          staff={staff}
          services={services}
          extras={extras}
          form={form}
          serviceLines={serviceLines}
          appointmentExtraLines={appointmentExtraLines}
          designImageFile={designImageFile}
          message={message}
          editingAppointmentId={editingAppointmentId}
          activeSuggestion={activeSuggestion}
          closedSuggestions={closedSuggestions}
          estimatedTotal={estimatedTotal}
          saving={saving}
          acrylicWarning={acrylicWarning}
          loadingAcrylicWarning={loadingAcrylicWarning}
          canForceAgenda={canForceAgenda}
          timeOptions={timeOptions}
          handleFormChange={handleFormChange}
          openQuickClientModal={openQuickClientModal}
          getServiceMatches={getServiceMatches}
          getAllowedStaffForService={getAllowedStaffForService}
          isStaffAllowedForService={isStaffAllowedForService}
          applySelectedService={applySelectedService}
          handleServiceLineChange={handleServiceLineChange}
          handleServiceSearchKeyDown={handleServiceSearchKeyDown}
          addServiceLine={addServiceLine}
          removeServiceLine={removeServiceLine}
          addAppointmentExtraLine={addAppointmentExtraLine}
          removeAppointmentExtraLine={removeAppointmentExtraLine}
          handleAppointmentExtraLineChange={handleAppointmentExtraLineChange}
          handleDesignImageFileChange={handleDesignImageFileChange}
          clearDesignImage={clearDesignImage}
          setActiveSuggestion={setActiveSuggestion}
          handleSubmit={handleSubmit}
          findAvailableSpaces={findAvailableSpaces}
          availabilityMessage={availabilityMessage}
          availabilitySuggestions={availabilitySuggestions}
          applyAvailabilitySuggestion={applyAvailabilitySuggestion}
          getToastStyle={getToastStyle}
        />
      )}

      {["diaria", "semanal", "mensual"].includes(activeSection) && (
        <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <AgendaSidePanel
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            staff={staff}
            staffFilter={staffFilter}
            setStaffFilter={setStaffFilter}
            appointmentStatusFilter={appointmentStatusFilter}
            setAppointmentStatusFilter={setAppointmentStatusFilter}
            quickSearch={quickSearch}
            setQuickSearch={setQuickSearch}
            quickSearchResults={quickSearchResults}
            openAppointmentPreview={openAppointmentDetail}
          />

          <div className="min-w-0">
            {activeSection === "diaria" && (
              <DailyViewSection
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                staff={visibleStaff}
                appointmentsByStaff={appointmentsByStaff}
                loadingData={loadingData}
                openNewAppointment={openNewAppointment}
                openAppointmentDetail={openAppointmentDetail}
                openEditAppointment={openEditAppointment}
                getPaymentForAppointment={getPaymentForAppointment}
                activeSection={activeSection}
                setActiveSection={setActiveSection}
              />
            )}

            {activeSection === "semanal" && (
              <WeeklyViewSection
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                weekDays={getWeekDays(selectedDate)}
                appointmentsByDate={appointmentsByDate}
                openNewAppointment={openNewAppointment}
                openAppointmentDetail={openAppointmentDetail}
                openEditAppointment={openEditAppointment}
                getPaymentForAppointment={getPaymentForAppointment}
                activeSection={activeSection}
                setActiveSection={setActiveSection}
              />
            )}

            {activeSection === "mensual" && (
              <MonthlyViewSection
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                monthDays={getMonthDays(selectedDate)}
                appointmentsByDate={appointmentsByDate}
                openNewAppointment={openNewAppointment}
                openAppointmentDetail={openAppointmentDetail}
                openEditAppointment={openEditAppointment}
                getPaymentForAppointment={getPaymentForAppointment}
                activeSection={activeSection}
                setActiveSection={setActiveSection}
              />
            )}
          </div>
        </div>
      )}

      {activeSection === "disponibilidad" && (
        <AvailabilitySection
          form={form}
          setActiveSection={setActiveSection}
          handleFormChange={handleFormChange}
          findAvailableSpaces={findAvailableSpaces}
          availabilityMessage={availabilityMessage}
          availabilitySuggestions={availabilitySuggestions}
          applyAvailabilitySuggestion={applyAvailabilitySuggestion}
        />
      )}

      {appointmentPopover && (
        <AppointmentPopover
          appointment={appointmentPopover}
          payment={getPaymentForAppointment(appointmentPopover.id)}
          onClose={() => setAppointmentPopover(null)}
          onOpenDetail={() => {
            setSelectedAppointment(appointmentPopover);
            setAppointmentPopover(null);
          }}
        />
      )}

      {selectedAppointment && (
        <AppointmentDetailModal
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onEdit={() => openEditAppointment(selectedAppointment)}
          onAppointmentUpdated={handleAppointmentLocalUpdate}
        />
      )}
      {showQuickClientModal && (
  <QuickClientModal
    form={quickClientForm}
    saving={savingQuickClient}
    message={quickClientMessage}
    onChange={handleQuickClientChange}
    onSave={saveQuickClient}
    onClose={closeQuickClientModal}
  />
)}
    </AdminShell>
  );
}
function NewAppointmentSection({
  clients,
  staff,
  services,
  extras,
  form,
  serviceLines,
  appointmentExtraLines,
  designImageFile,
  message,
  editingAppointmentId,
  activeSuggestion,
  closedSuggestions,
  estimatedTotal,
  saving,
  acrylicWarning,
  loadingAcrylicWarning,
  canForceAgenda,
  timeOptions,
  handleFormChange,
  openQuickClientModal,
  getServiceMatches,
  getAllowedStaffForService,
  isStaffAllowedForService,
  applySelectedService,
  handleServiceLineChange,
  handleServiceSearchKeyDown,
  addServiceLine,
  removeServiceLine,
  addAppointmentExtraLine,
  removeAppointmentExtraLine,
  handleAppointmentExtraLineChange,
  handleDesignImageFileChange,
  clearDesignImage,
  setActiveSuggestion,
  handleSubmit,
  findAvailableSpaces,
  availabilityMessage,
  availabilitySuggestions,
  applyAvailabilitySuggestion,
  getToastStyle,
}) {
    const selectedClient = clients.find((client) => client.id === form.client_id);

  const [clientSearch, setClientSearch] = useState(
    selectedClient
      ? `${selectedClient.client_number ? `${selectedClient.client_number} · ` : ""}${
          selectedClient.full_name || "Sin nombre"
        }${
          selectedClient.phone ? ` - ${selectedClient.phone}` : ""
        }`
      : ""
  );

  const [showClientResults, setShowClientResults] = useState(false);

  useEffect(() => {
    if (!form.client_id) {
      return;
    }

    if (!selectedClient) {
      return;
    }

    if (showClientResults) {
      return;
    }

    setClientSearch(
      `${selectedClient.client_number ? `${selectedClient.client_number} · ` : ""}${
        selectedClient.full_name || "Sin nombre"
      }${
        selectedClient.phone ? ` - ${selectedClient.phone}` : ""
      }`
    );
  }, [form.client_id, selectedClient, showClientResults]);

  const selectClient = (client) => {
    handleFormChange({
      target: {
        name: "client_id",
        value: client.id,
        type: "text",
        checked: false,
      },
    });

    setClientSearch(
      `${client.client_number ? `${client.client_number} · ` : ""}${
        client.full_name || "Sin nombre"
      }${
        client.phone ? ` - ${client.phone}` : ""
      }`
    );

    setShowClientResults(false);
  };
  const filteredClients = clients.filter((client) => {
  const search = clientSearch.trim().toLowerCase();

  if (!search) return false;

  const name = String(client.full_name || "").toLowerCase();
  const phone = String(client.phone || "").toLowerCase();
  const email = String(client.email || "").toLowerCase();
  const clientNumber = String(client.client_number || "").toLowerCase();

  return (
    name.includes(search) ||
    phone.includes(search) ||
    email.includes(search) ||
    clientNumber.includes(search)
  );
});

const shouldShowClientResults =
  showClientResults && clientSearch.trim() && filteredClients.length > 0;

const shouldShowNoClientFound =
  showClientResults && clientSearch.trim() && filteredClients.length === 0;
  
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.45fr]">
      <Card>
        <SectionHeader
          eyebrow={editingAppointmentId ? "Editar cita" : "Nueva cita"}
          title={
            editingAppointmentId
              ? "Actualizar cita con servicios"
              : "Registrar cita con servicios"
          }
          description="Agrega uno o varios servicios, asigna técnica y valida disponibilidad."
        />

        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-[#68777c]">
                Clienta *
              </label>

<div className="relative">
  <input
    value={clientSearch}
    onChange={(event) => {
      setClientSearch(event.target.value);
      setShowClientResults(true);

      handleFormChange({
        target: {
          name: "client_id",
          value: "",
          type: "text",
          checked: false,
        },
      });
    }}
    onFocus={() => setShowClientResults(true)}
    placeholder="Buscar por número, nombre, WhatsApp o correo..."
    className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
  />

  {shouldShowClientResults && (
    <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-[#dde3e6] bg-white p-2 shadow-xl">
      {filteredClients.map((client) => (
        <button
          key={client.id}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectClient(client)}
          className="block w-full rounded-xl px-4 py-3 text-left text-sm transition hover:bg-[#f7eeee]"
        >
          <span className="block font-medium text-[#263238]">
            {client.client_number ? `${client.client_number} · ` : ""}
            {client.full_name || "Sin nombre"}
          </span>
          <span className="text-xs text-[#68777c]">
            {client.phone || "Sin teléfono"}
            {client.email ? ` · ${client.email}` : ""}
          </span>
        </button>
      ))}
    </div>
  )}

  {shouldShowNoClientFound && (
    <p className="mt-2 rounded-2xl bg-[#fff6fb] px-4 py-3 text-xs text-[#bd7b83]">
      No encontré clienta con esa búsqueda. Puedes registrarla como nueva.
    </p>
  )}

  {form.client_id && selectedClient && (
    <p className="mt-2 text-xs text-[#68777c]">
      Seleccionada:{" "}
      {selectedClient.client_number ? `${selectedClient.client_number} · ` : ""}
      {selectedClient.full_name}{" "}
      {selectedClient.phone ? `· ${selectedClient.phone}` : ""}
    </p>
  )}
</div>

              <button
                type="button"
                onClick={openQuickClientModal}
                className="mt-2 inline-block text-sm text-[#bd7b83]"
              >
                + Registrar nueva clienta/cliente
              </button>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#68777c]">
                Fecha *
              </label>
              <input
                type="date"
                name="appointment_date"
                value={form.appointment_date}
                onChange={handleFormChange}
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              />
            </div>
          </div>

          {form.client_id && loadingAcrylicWarning && (
            <div className="rounded-[1.5rem] border border-[#efd8b5] bg-[#fff9ef] p-4 text-sm text-[#8a5f2d]">
              Revisando historial de acrílico de la clienta...
            </div>
          )}

          {form.client_id && acrylicWarning?.type === "error" && (
            <div className="rounded-[1.5rem] border border-[#f0c6c6] bg-[#fff6f6] p-4 text-sm text-[#9f3a3a]">
              {acrylicWarning.message}
            </div>
          )}

          {form.client_id && acrylicWarning?.type === "warning" && (
            <div className="rounded-[1.5rem] border border-[#e8c48f] bg-[#fff8eb] p-5 text-[#5f4630]">
              <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                Aviso de acrílico
              </p>
              <p className="mt-2 text-sm leading-6">
                Esta clienta ya cuenta con 2 rellenos posteriores a su
                aplicación de acrílico. Para cuidar la estructura y evitar
                desprendimientos, corresponde agendar retiro de acrílico y
                nueva aplicación.
              </p>

              <div className="mt-4 grid gap-3 text-xs text-[#68777c] md:grid-cols-3">
                <div className="rounded-2xl bg-white/70 p-3">
                  <p className="uppercase tracking-[0.18em] text-[#bd7b83]">
                    Última aplicación
                  </p>
                  <p className="mt-1 text-[#263238]">
                    {acrylicWarning.lastApplication
                      ? `${acrylicWarning.lastApplication.name} · ${
                          acrylicWarning.lastApplication.date
                        } ${formatTime(acrylicWarning.lastApplication.time)}`
                      : "No detectada"}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/70 p-3">
                  <p className="uppercase tracking-[0.18em] text-[#bd7b83]">
                    Rellenos detectados
                  </p>
                  <p className="mt-1 text-[#263238]">
                    {acrylicWarning.fillsAfterLastApplication}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/70 p-3">
                  <p className="uppercase tracking-[0.18em] text-[#bd7b83]">
                    Último acrílico
                  </p>
                  <p className="mt-1 text-[#263238]">
                    {acrylicWarning.lastAcrylicService
                      ? `${acrylicWarning.lastAcrylicService.name} · ${
                          acrylicWarning.lastAcrylicService.date
                        } ${formatTime(acrylicWarning.lastAcrylicService.time)}`
                      : "No detectado"}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-[1.5rem] bg-[#fff6fb] p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                  Imagen de diseño
                </p>
                <p className="mt-1 text-sm text-[#68777c]">
                  Agrega una foto o URL del diseño que quiere la clienta.
                </p>
              </div>

              {(form.design_image_url || designImageFile) && (
                <button
                  type="button"
                  onClick={clearDesignImage}
                  className="rounded-full border border-[#bd7b83] px-4 py-2 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                >
                  Quitar imagen
                </button>
              )}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-[#68777c]">
                  URL de imagen
                </label>
                <input
                  type="url"
                  name="design_image_url"
                  value={form.design_image_url}
                  onChange={handleFormChange}
                  className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#68777c]">
                  Subir imagen
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleDesignImageFileChange}
                  className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 text-sm outline-none"
                />
                {designImageFile && (
                  <p className="mt-2 text-xs text-[#68777c]">
                    Lista para subir: {designImageFile.name}
                  </p>
                )}
              </div>
            </div>

            {form.design_image_url ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-[#dde3e6] bg-white">
                <img
                  src={form.design_image_url}
                  alt="Diseño solicitado por la clienta"
                  className="max-h-72 w-full object-contain"
                />
              </div>
            ) : (
              <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-[#68777c]">
                Sin imagen de diseño.
              </p>
            )}
          </div>

          <div className="rounded-[1.5rem] bg-[#f7f9fa] p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                  Servicios de la cita
                </p>
                <p className="mt-1 text-sm text-[#68777c]">
                  Escribe para buscar, usa ↑ ↓ y Enter para seleccionar.
                </p>
              </div>

              <div className="flex gap-2">
  <button
    type="button"
    onClick={addAppointmentExtraLine}
    className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
  >
    Extras
  </button>

  <button
    type="button"
    onClick={addServiceLine}
    className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
  >
    Agregar servicio
  </button>
</div>
            </div>

            <div className="mt-5 space-y-4">
              {serviceLines.map((line, index) => {
                const matches = getServiceMatches(line.service_search, line.staff_id);
                const selectedService = services.find(
                  (service) => service.id === line.service_id
                );
                const allowedStaffForService = getAllowedStaffForService(
                  line.service_id
                );
                const selectedStaffOutsideAllowed =
                  line.staff_id &&
                  !allowedStaffForService.some(
                    (person) => person.id === line.staff_id
                  )
                    ? staff.find((person) => person.id === line.staff_id)
                    : null;
                const staffOptionsForLine = selectedStaffOutsideAllowed
                  ? [...allowedStaffForService, selectedStaffOutsideAllowed]
                  : allowedStaffForService;
                const shouldShowMatches =
                  matches.length > 0 &&
                  !line.service_id &&
                  !closedSuggestions[index];

                const currentActiveSuggestion = activeSuggestion[index] || 0;

                return (
                  <div
                    key={index}
                    className="rounded-2xl border border-[#dde3e6] bg-white p-4"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="font-medium text-[#263238]">
                        Servicio {index + 1}
                      </h3>

                      {serviceLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeServiceLine(index)}
                          className="text-sm text-[#bd7b83]"
                        >
                          Quitar
                        </button>
                      )}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="relative">
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Buscar servicio *
                        </label>
                        <input
                          value={line.service_search}
                          onChange={(event) =>
                            handleServiceLineChange(
                              index,
                              "service_search",
                              event.target.value
                            )
                          }
                          onKeyDown={(event) =>
                            handleServiceSearchKeyDown(event, index, matches)
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                          placeholder="Ej. softgel, pedi, cejas, pies..."
                        />

                        {shouldShowMatches && (
                          <div className="absolute z-20 mt-2 max-h-[520px] w-full overflow-auto rounded-2xl border border-[#dde3e6] bg-white p-2 shadow-xl">
                            {matches.map((service, matchIndex) => {
                              const isActive =
                                matchIndex === currentActiveSuggestion;

                              return (
                                <button
                                  key={service.id}
                                  type="button"
                                  onMouseEnter={() =>
                                    setActiveSuggestion((current) => ({
                                      ...current,
                                      [index]: matchIndex,
                                    }))
                                  }
                                  onClick={() =>
                                    applySelectedService(index, service)
                                  }
                                  className={`block w-full rounded-xl px-3 py-3 text-left text-sm transition ${
                                    isActive
                                      ? "bg-[#f7eeee]"
                                      : "hover:bg-[#f7eeee]"
                                  }`}
                                >
                                  <span className="block font-medium text-[#263238]">
                                    {service.name} - ${service.base_price}
                                  </span>
                                  <span className="text-xs text-[#68777c]">
                                    {service.category} ·{" "}
                                    {service.duration_minutes || 0} min +{" "}
                                    {service.cleanup_minutes || 0} min limpieza
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {selectedService && (
                          <button
                            type="button"
                            onClick={() =>
                              handleServiceLineChange(
                                index,
                                "service_search",
                                ""
                              )
                            }
                            className="mt-2 text-sm text-[#bd7b83]"
                          >
                            Cambiar servicio
                          </button>
                        )}
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Técnica *
                        </label>
                        <select
                          value={line.staff_id}
                          onChange={(event) =>
                            handleServiceLineChange(
                              index,
                              "staff_id",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                        >
                          <option value="">Seleccionar técnica</option>
                          {staffOptionsForLine.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.full_name}
                            </option>
                          ))}
                        </select>
                        {line.staff_id &&
                          line.service_id &&
                          !isStaffAllowedForService(
                            line.staff_id,
                            line.service_id
                          ) && (
                            <p className="mt-2 rounded-xl bg-yellow-50 p-3 text-xs leading-5 text-yellow-800">
                              Esta técnica no tiene asignado este servicio.
                              Revisa Servicios por técnica o selecciona otra
                              técnica.
                            </p>
                          )}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-4">
                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Inicio *
                        </label>
                        <select
                          value={line.start_time}
                          onChange={(event) =>
                            handleServiceLineChange(
                              index,
                              "start_time",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                        >
                          <option value="">Hora</option>
                          {timeOptions.map((time) => (
                            <option key={time} value={time}>
                              {time}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Fin automático
                        </label>
                        <select
                          value={line.end_time}
                          onChange={(event) =>
                            handleServiceLineChange(
                              index,
                              "end_time",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                        >
                          <option value="">Hora</option>
                          {timeOptions.map((time) => (
                            <option key={time} value={time}>
                              {time}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Precio
                        </label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8a5f63]">
                            $
                          </span>
                          <input
                            type="number"
                            value={line.price}
                            onChange={(event) =>
                              handleServiceLineChange(
                                index,
                                "price",
                                event.target.value
                              )
                            }
                            className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-8 py-3 outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Cantidad
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(event) =>
                            handleServiceLineChange(
                              index,
                              "quantity",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Duración min.
                        </label>
                        <input
                          type="number"
                          value={line.duration_minutes}
                          onChange={(event) =>
                            handleServiceLineChange(
                              index,
                              "duration_minutes",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Limpieza min.
                        </label>
                        <input
                          type="number"
                          value={line.cleanup_minutes}
                          onChange={(event) =>
                            handleServiceLineChange(
                              index,
                              "cleanup_minutes",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                        />
                      </div>
                    </div>

                    <textarea
                      value={line.notes}
                      onChange={(event) =>
                        handleServiceLineChange(
                          index,
                          "notes",
                          event.target.value
                        )
                      }
                      className="mt-4 min-h-20 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                      placeholder="Diseño, detalles, observaciones..."
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {(appointmentExtraLines || []).length > 0 && (
            <div className="rounded-[1.5rem] bg-[#fff6fb] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                    Extras de la cita
                  </p>
                  <p className="mt-1 text-sm text-[#68777c]">
                    Selecciona decoraciones, retiros, largo extra u otros cargos.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                {(appointmentExtraLines || []).map((line, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-[#dde3e6] bg-white p-4"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="font-medium text-[#263238]">
                        Extra {index + 1}
                      </h3>

                      <button
                        type="button"
                        onClick={() => removeAppointmentExtraLine(index)}
                        className="text-sm text-[#bd7b83]"
                      >
                        Quitar
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <div className="lg:col-span-2">
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Seleccionar extra
                        </label>
                        <select
                          value={line.extra_id}
                          onChange={(event) =>
                            handleAppointmentExtraLineChange(
                              index,
                              "extra_id",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                        >
                          <option value="">Extra personalizado</option>
                          {(extras || []).map((extra) => (
                            <option key={extra.id} value={extra.id}>
                              {extra.name} · ${extra.price}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Cantidad
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(event) =>
                            handleAppointmentExtraLineChange(
                              index,
                              "quantity",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Precio unitario
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unit_price}
                          onChange={(event) =>
                            handleAppointmentExtraLineChange(
                              index,
                              "unit_price",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <div className="lg:col-span-2">
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Nombre del extra *
                        </label>
                        <input
                          value={line.name}
                          onChange={(event) =>
                            handleAppointmentExtraLineChange(
                              index,
                              "name",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                          placeholder="Ej. Francés, retiro, largo extra, cristales..."
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Técnica / responsable
                        </label>
                        <select
                          value={line.staff_id}
                          onChange={(event) =>
                            handleAppointmentExtraLineChange(
                              index,
                              "staff_id",
                              event.target.value
                            )
                          }
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                        >
                          <option value="">Sin asignar</option>
                          {staff.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.full_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Total
                        </label>
                        <input
                          value={line.total_price}
                          readOnly
                          className="w-full rounded-2xl border border-[#dde3e6] bg-[#edf0f2] px-4 py-3 outline-none"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="mb-2 block text-sm text-[#68777c]">
                        Notas
                      </label>
                      <input
                        value={line.notes}
                        onChange={(event) =>
                          handleAppointmentExtraLineChange(
                            index,
                            "notes",
                            event.target.value
                          )
                        }
                        className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                        placeholder="Detalle opcional"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm text-[#68777c]">
                Total estimado
              </label>
              <div className="rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 text-lg text-[#263238]">
                ${estimatedTotal}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#68777c]">
                Anticipo
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8a5f63]">
                  $
                </span>
                <input
                  type="number"
                  name="deposit_amount"
                  value={form.deposit_amount}
                  onChange={handleFormChange}
                  className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-8 py-3 outline-none"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#68777c]">
                Método anticipo
              </label>
              <select
                name="deposit_payment_method"
                value={form.deposit_payment_method}
                onChange={handleFormChange}
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              >
                <option value="">Sin anticipo</option>
                <option value="Efectivo">Efectivo</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Tarjeta">Tarjeta</option>
              </select>
            </div>
          </div>

          <textarea
            name="notes"
            value={form.notes}
            onChange={handleFormChange}
            className="min-h-24 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
            placeholder="Observaciones internas: siguiente cita necesita retiro, tiene evento, llegó con desprendimiento, prefiere tonos naturales..."
          />

          <label className="flex items-center gap-2 rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
            <input
              type="checkbox"
              name="force_created"
              checked={form.force_created}
              disabled={!canForceAgenda}
              onChange={handleFormChange}
            />
            {canForceAgenda
              ? "Forzar cita fuera de horario, disponibilidad o recursos"
              : "Solo admin/encargada pueden forzar citas"}
          </label>

          <div>
            {message && (
              <div
                className={`mb-3 rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(
                  message
                )}`}
              >
                {message}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={findAvailableSpaces}
                className="rounded-full border border-[#bd7b83] px-6 py-4 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
              >
                Buscar espacio disponible
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {saving
                  ? "Guardando..."
                  : editingAppointmentId
                  ? "Actualizar cita"
                  : "Guardar cita"}
              </button>
            </div>
          </div>
        </div>
      </Card>

      <AvailabilityCard
        availabilityMessage={availabilityMessage}
        availabilitySuggestions={availabilitySuggestions}
        applyAvailabilitySuggestion={applyAvailabilitySuggestion}
        getToastStyle={getToastStyle}
      />
    </div>
  );
}

function QuickClientModal({
  form,
  saving,
  message,
  onChange,
  onSave,
  onClose,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-[1.5rem] bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
              Nueva clienta/cliente
            </p>
            <h3 className="mt-2 text-2xl font-light">Registro rápido</h3>
            <p className="mt-1 text-sm text-[#68777c]">
              Al guardar, se seleccionará automáticamente en la cita.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f9fa] text-[#68777c] transition hover:bg-[#edf0f2]"
          >
            ×
          </button>
        </div>

        {message && (
          <div
            className={`mb-5 rounded-2xl px-5 py-4 text-sm font-medium ${
              message.toLowerCase().includes("no se pudo") ||
              message.toLowerCase().includes("obligatorios")
                ? "bg-red-600 text-white"
                : "bg-green-600 text-white"
            }`}
          >
            {message}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm text-[#68777c]">
              Nombre completo *
            </label>
            <input
              type="text"
              value={form.full_name}
              onChange={(event) => onChange("full_name", event.target.value)}
              className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              placeholder="Ej. María López"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-[#68777c]">
              Teléfono / WhatsApp *
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => onChange("phone", event.target.value)}
              className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              placeholder="Ej. 9991234567"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-[#68777c]">
              Correo electrónico
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(event) => onChange("email", event.target.value)}
              className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              placeholder="Ej. clienta@email.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-[#68777c]">
              Fecha de cumpleaños
            </label>
            <input
              type="date"
              value={form.birthday}
              onChange={(event) => onChange("birthday", event.target.value)}
              className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-[#68777c]">
              Género
            </label>
            <select
              value={form.gender}
              onChange={(event) => onChange("gender", event.target.value)}
              className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
            >
              <option value="">No especificado</option>
              <option value="Mujer">Mujer</option>
              <option value="Hombre">Hombre</option>
              <option value="Otro">Otro</option>
              <option value="Prefiere no decir">Prefiere no decir</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm text-[#68777c]">
              Notas
            </label>
            <textarea
              value={form.notes}
              onChange={(event) => onChange("notes", event.target.value)}
              className="min-h-28 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              placeholder="Ej. alergias, preferencias, colores favoritos, observaciones..."
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex-1 rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar y usar en la cita"}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-[#bd7b83] px-6 py-4 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function AvailabilityCard({
  availabilityMessage,
  availabilitySuggestions,
  applyAvailabilitySuggestion,
  getToastStyle,
}) {
  return (
    <Card>
      <SectionHeader
        eyebrow="Disponibilidad"
        title="Espacios sugeridos"
        description="Aquí aparecerán opciones libres según servicios, fecha y técnica."
      />

      {availabilityMessage && (
        <div
          className={`mb-4 rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(
            availabilityMessage
          )}`}
        >
          {availabilityMessage}
        </div>
      )}

      {availabilitySuggestions.length === 0 ? (
        <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
          Aún no hay sugerencias. Selecciona servicios y presiona “Buscar
          espacio disponible”.
        </div>
      ) : (
        <div className="space-y-3">
          {availabilitySuggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.staff_id}-${suggestion.start_time}-${index}`}
              type="button"
              onClick={() => applyAvailabilitySuggestion(suggestion)}
              className="w-full rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-4 text-left transition hover:border-[#bd7b83]"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: suggestion.staff_color }}
                />
                <p className="font-medium text-[#263238]">
                  {suggestion.staff_name}
                </p>
              </div>

              <p className="mt-2 text-sm text-[#68777c]">
                {suggestion.start_time} - {suggestion.end_time}
              </p>

              <p className="text-xs text-[#8a969a]">
                Duración: {suggestion.duration_minutes} min
              </p>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function getStaffInitials(person) {
  return String(person?.full_name || "T")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function getStaffPhotoUrl(person) {
  return (
    person?.photo_url ||
    person?.avatar_url ||
    person?.profile_photo_url ||
    person?.image_url ||
    ""
  );
}

function StaffAvatar({ person, size = "md" }) {
  const photoUrl = getStaffPhotoUrl(person);
  const sizeClass = size === "lg" ? "h-12 w-12" : "h-9 w-9";

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={person?.full_name || "Técnica"}
        className={`${sizeClass} rounded-full object-cover ring-2 ring-white shadow-sm`}
      />
    );
  }

  return (
    <span
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-white shadow-sm`}
      style={{ backgroundColor: person?.color || "#bd7b83" }}
    >
      {getStaffInitials(person)}
    </span>
  );
}

function MiniCalendar({ selectedDate, setSelectedDate }) {
  const monthDays = getMonthDays(selectedDate);
  const currentDate = new Date(`${selectedDate}T00:00:00`);
  const title = currentDate.toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setSelectedDate(addDaysToISO(selectedDate, -30))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f7eeee] text-[#8a5f63]"
        >
          ‹
        </button>
        <p className="text-sm font-medium capitalize text-[#263238]">{title}</p>
        <button
          type="button"
          onClick={() => setSelectedDate(addDaysToISO(selectedDate, 30))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f7eeee] text-[#8a5f63]"
        >
          ›
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-[0.12em] text-[#8a969a]">
        {["L", "M", "M", "J", "V", "S", "D"].map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1">
        {monthDays.map((day) => {
          const isSelected = day.date === selectedDate;

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => setSelectedDate(day.date)}
              className={`flex h-9 items-center justify-center rounded-full text-xs transition ${
                isSelected
                  ? "bg-[#bd7b83] text-white"
                  : day.isCurrentMonth
                  ? "bg-white text-[#263238] hover:bg-[#f7eeee]"
                  : "bg-[#f7f9fa] text-[#b0b8bb]"
              }`}
            >
              {Number(day.date.slice(8, 10))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AgendaSidePanel({
  selectedDate,
  setSelectedDate,
  staff,
  staffFilter,
  setStaffFilter,
  appointmentStatusFilter,
  setAppointmentStatusFilter,
  quickSearch,
  setQuickSearch,
  quickSearchResults,
  openAppointmentPreview,
}) {
  return (
    <aside className="h-fit rounded-[1.5rem] bg-white p-5 shadow-sm xl:sticky xl:top-28">
      <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
        Agenda Pro
      </p>

      <div className="mt-5 rounded-2xl bg-[#f7f9fa] p-4">
        <MiniCalendar selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <label className="mb-2 block text-sm text-[#68777c]">
            Técnica / profesional
          </label>
          <select
            value={staffFilter}
            onChange={(event) => setStaffFilter(event.target.value)}
            className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
          >
            <option value="">Todas</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm text-[#68777c]">
            Estado de asistencia
          </label>
          <select
            value={appointmentStatusFilter}
            onChange={(event) => setAppointmentStatusFilter(event.target.value)}
            className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
          >
            <option value="">Todos</option>
            {attendanceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm text-[#68777c]">
            Búsqueda rápida
          </label>
          <input
            value={quickSearch}
            onChange={(event) => setQuickSearch(event.target.value)}
            className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
            placeholder="Clienta, teléfono, CL-0001, servicio..."
          />

          {quickSearch.trim().length >= 2 && (
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
              {quickSearchResults.length === 0 ? (
                <p className="rounded-2xl bg-[#fff6fb] p-3 text-xs text-[#8a5f63]">
                  No encontré citas en el rango visible.
                </p>
              ) : (
                quickSearchResults.map((appointment) => (
                  <button
                    key={appointment.id}
                    type="button"
                    onClick={() => openAppointmentPreview(appointment)}
                    className="w-full rounded-2xl bg-[#f7f9fa] p-3 text-left text-xs transition hover:bg-[#f7eeee]"
                  >
                    <span className="block font-medium text-[#263238]">
                      {appointment.clients?.client_number
                        ? `${appointment.clients.client_number} · `
                        : ""}
                      {appointment.clients?.full_name || "Clienta"}
                    </span>
                    <span className="mt-1 block text-[#68777c]">
                      {appointment.appointment_date} ·{" "}
                      {formatTime(appointment.start_time)} ·{" "}
                      {getAppointmentServicesText(appointment)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function buildGoogleCalendarUrl(appointment) {
  const start = `${appointment.appointment_date}T${formatTime(
    appointment.start_time
  )}:00`;
  const end = `${appointment.appointment_date}T${formatTime(
    appointment.end_time || appointment.start_time
  )}:00`;
  const formatCalendarDate = (value) =>
    new Date(value).toISOString().replace(/[-:]|\.\d{3}/g, "");

  const text = `Cita Alexandra Ruiz Salón · ${
    appointment.clients?.full_name || "Clienta"
  }`;
  const details = [
    `Servicios: ${getAppointmentServicesText(appointment)}`,
    appointment.clients?.phone ? `Teléfono: ${appointment.clients.phone}` : "",
    appointment.notes ? `Observaciones: ${appointment.notes}` : "",
    "Recordatorio sugerido: 15 minutos antes.",
  ]
    .filter(Boolean)
    .join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text,
    dates: `${formatCalendarDate(start)}/${formatCalendarDate(end)}`,
    details,
    location: "Alexandra Ruiz Salón",
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function AppointmentPopover({ appointment, payment, onClose, onOpenDetail }) {
  const servicesText = getAppointmentServicesText(appointment);
  const phone = appointment.clients?.phone || "";
  const whatsappUrl = phone
    ? `https://wa.me/${cleanPhoneForWhatsApp(phone)}`
    : "";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/20 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-[1.5rem] bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
              Resumen de cita
            </p>
            <h3 className="mt-2 text-2xl font-light text-[#263238]">
              {appointment.clients?.full_name || "Clienta"}
            </h3>
            {appointment.clients?.client_number && (
              <p className="mt-1 text-xs text-[#8a969a]">
                {appointment.clients.client_number}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f9fa] text-[#68777c]"
          >
            ×
          </button>
        </div>

        <div className="mt-5 grid gap-3 text-sm text-[#68777c] sm:grid-cols-2">
          <div className="rounded-2xl bg-[#f7f9fa] p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[#bd7b83]">
              Fecha y hora
            </p>
            <p className="mt-1 text-[#263238]">
              {appointment.appointment_date} · {formatTime(appointment.start_time)} -{" "}
              {formatTime(appointment.end_time)}
            </p>
          </div>

          <div className="rounded-2xl bg-[#f7f9fa] p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[#bd7b83]">
              Técnica
            </p>
            <p className="mt-1 text-[#263238]">
              {(appointment.appointment_services || [])
                .map((service) => service.staff?.full_name)
                .filter(Boolean)
                .filter((name, index, list) => list.indexOf(name) === index)
                .join(", ") || "Sin técnica"}
            </p>
          </div>

          <div className="rounded-2xl bg-[#f7f9fa] p-3 sm:col-span-2">
            <p className="text-xs uppercase tracking-[0.18em] text-[#bd7b83]">
              Servicios
            </p>
            <p className="mt-1 text-[#263238]">{servicesText}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${getAttendanceBadgeClass(
              appointment.attendance_status
            )}`}
          >
            {getAttendanceOption(appointment.attendance_status).label}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              payment ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
            }`}
          >
            {payment ? `$ Pagada · ${formatMoney(payment.total_amount)}` : "$ Pendiente"}
          </span>
          {phone && (
            <span className="rounded-full bg-[#f7eeee] px-3 py-1 text-xs text-[#8a5f63]">
              {phone}
            </span>
          )}
        </div>

        {appointment.notes && (
          <p className="mt-4 rounded-2xl bg-[#fff6fb] p-3 text-sm leading-6 text-[#68777c]">
            {appointment.notes}
          </p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onOpenDetail}
            className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
          >
            Abrir cita
          </button>

          <a
            href={`/admin/cobros?appointmentId=${appointment.id}`}
            className="rounded-full border border-green-600 px-5 py-3 text-center text-sm text-green-700 transition hover:bg-green-600 hover:text-white"
          >
            Cobrar / ir a cobro
          </a>

          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-[#25D366] px-5 py-3 text-center text-sm text-[#128C4A] transition hover:bg-[#25D366] hover:text-white"
            >
              WhatsApp
            </a>
          )}

          <a
            href={buildGoogleCalendarUrl(appointment)}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-[#bd7b83] px-5 py-3 text-center text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
          >
            Google Calendar
          </a>
        </div>
      </div>
    </div>
  );
}

function AppointmentCard({ item, person, payment, onOpen, onEdit, compact = false }) {
  if (item.isBlock) {
    return (
      <div
        className={`flex h-full min-h-16 flex-col justify-center rounded-xl border px-3 py-2 text-xs ${getBlockCardClass(
          item.block
        )}`}
      >
        <p className="font-medium">
          {formatTime(item.start_time)} - {formatTime(item.end_time)}
        </p>
        <p>{item.block.title || "Bloqueo"}</p>
      </div>
    );
  }

  return (
    <div
      onClick={(event) => {
        event.stopPropagation();
        onOpen(item.appointment);
      }}
      className={`relative flex h-full min-h-16 cursor-pointer flex-col justify-center rounded-xl border-l-4 px-3 py-2 text-xs text-white shadow-sm ${getAttendanceAccentClass(
        item.appointment?.attendance_status
      )}`}
      style={{
        backgroundColor: item.staff?.color || person?.color || "#bd7b83",
      }}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onEdit(item.appointment);
        }}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-[12px] text-[#bd7b83] shadow-sm"
        title="Editar cita"
      >
        ✏️
      </button>

      {payment && (
        <div
          className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-[12px] font-bold text-white shadow-sm"
          title={`Cita cobrada: ${formatMoney(payment.total_amount)}`}
        >
          $
        </div>
      )}

      <p className={payment ? "pl-7 pr-8 font-medium" : "pr-8 font-medium"}>
        {formatTime(item.start_time)} - {formatTime(item.end_time)}
      </p>
      <p className={payment ? "pl-7 pr-8" : "pr-8"}>
        {item.appointment?.clients?.full_name || "Clienta"}
      </p>
      <p className={compact ? "truncate" : ""}>
        {item.services?.name || "Servicio"}
      </p>
      {!compact && (
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="rounded-full bg-white/20 px-2 py-1 text-[10px] text-white">
            {getAttendanceOption(item.appointment?.attendance_status).label}
          </span>
          <span className="rounded-full bg-white/20 px-2 py-1 text-[10px] text-white">
            {person?.full_name || item.staff?.full_name || "Técnica"}
          </span>
          {item.appointment?.attendance_status === "llego_retrasada" && (
            <span className="rounded-full bg-red-600 px-2 py-1 text-[10px] text-white">
              Retraso
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function itemStartsInSlot(item, slot) {
  const start = timeToMinutes(item.start_time);
  const slotStart = timeToMinutes(slot);

  if (start === null || slotStart === null) return false;

  return start >= slotStart && start < slotStart + 30;
}

function itemContinuesThroughSlot(item, slot) {
  const start = timeToMinutes(item.start_time);
  const end = timeToMinutes(item.end_time);
  const slotStart = timeToMinutes(slot);

  if (start === null || end === null || slotStart === null) return false;

  return start < slotStart && end > slotStart;
}

function getItemSlotSpan(item, slot) {
  const end = timeToMinutes(item.end_time);
  const slotStart = timeToMinutes(slot);

  if (end === null || slotStart === null || end <= slotStart) return 1;

  return Math.max(1, Math.ceil((end - slotStart) / 30));
}

function DailyViewSection({
  selectedDate,
  setSelectedDate,
  staff,
  appointmentsByStaff,
  loadingData,
  openNewAppointment,
  openAppointmentDetail,
  openEditAppointment,
  getPaymentForAppointment,
  activeSection,
  setActiveSection,
}) {
  return (
    <Card>
      <SectionHeader
        eyebrow="Vista diaria"
        title={getDateLabel(selectedDate)}
        description="Filas por horario y columnas por técnica. Da clic en una celda libre para agendar."
        action={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <DateNavigation
  selectedDate={selectedDate}
  setSelectedDate={setSelectedDate}
  mode="day"
/>

            <ViewButtons
              activeSection={activeSection}
              setActiveSection={setActiveSection}
            />

            <button
              type="button"
              onClick={() => openNewAppointment({ date: selectedDate })}
              className="rounded-full bg-[#bd7b83] px-6 py-3 text-sm text-white transition hover:opacity-90"
            >
              Nueva cita
            </button>
          </div>
        }
      />

      {loadingData ? (
        <p className="text-sm text-[#68777c]">Cargando agenda...</p>
      ) : staff.length === 0 ? (
        <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
          No hay técnicas activas registradas.
        </div>
      ) : (
        <DailyCalendarGrid
          selectedDate={selectedDate}
          staff={staff}
          appointmentsByStaff={appointmentsByStaff}
          openNewAppointment={openNewAppointment}
          openAppointmentDetail={openAppointmentDetail}
          openEditAppointment={openEditAppointment}
          getPaymentForAppointment={getPaymentForAppointment}
        />
      )}
    </Card>
  );
}

function DailyCalendarGrid({
  selectedDate,
  staff,
  appointmentsByStaff,
  openNewAppointment,
  openAppointmentDetail,
  openEditAppointment,
  getPaymentForAppointment,
}) {
  const slotHeight = 72;
  const firstSlotMinutes = timeToMinutes(timeSlots[0]) || 0;
  const gridHeight = timeSlots.length * slotHeight;
  const templateColumns = `88px repeat(${staff.length}, minmax(240px, 1fr))`;
  const minWidth = Math.max(960, 88 + staff.length * 240);

  const getItemPosition = (item) => {
    const start = timeToMinutes(item.start_time);
    const end = timeToMinutes(item.end_time);

    if (start === null || end === null) {
      return { top: 0, height: slotHeight };
    }

    const top = Math.max(0, ((start - firstSlotMinutes) / 30) * slotHeight);
    const height = Math.max(44, ((end - start) / 30) * slotHeight - 8);

    return { top, height };
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-[#dde3e6] bg-white">
      <div style={{ minWidth }}>
        <div
          className="grid border-b border-[#dde3e6] bg-[#f7f9fa]"
          style={{ gridTemplateColumns: templateColumns }}
        >
          <div className="sticky left-0 z-30 border-r border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 text-sm font-medium text-[#68777c]">
            Hora
          </div>

          {staff.map((person) => (
            <div
              key={person.id}
              className="border-r border-[#dde3e6] px-4 py-3 last:border-r-0"
            >
              <div className="flex items-center gap-3">
                <StaffAvatar person={person} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#263238]">
                    {person.full_name}
                  </p>
                  <p className="text-xs text-[#8a969a]">Profesional</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          className="grid"
          style={{ gridTemplateColumns: templateColumns }}
        >
          <div
            className="sticky left-0 z-20 border-r border-[#dde3e6] bg-white"
            style={{ height: gridHeight }}
          >
            {timeSlots.map((slot) => (
              <div
                key={slot}
                className="border-b border-[#edf0f2] px-4 py-2 text-xs font-medium text-[#68777c]"
                style={{ height: slotHeight }}
              >
                {slot}
              </div>
            ))}
          </div>

          {staff.map((person) => {
            const staffItems = (appointmentsByStaff[person.id] || []).filter(
              (item) => item.start_time && item.end_time
            );

            return (
              <div
                key={person.id}
                className="relative border-r border-[#dde3e6] bg-white last:border-r-0"
                style={{ height: gridHeight }}
              >
                {timeSlots.map((slot, index) => (
                  <button
                    key={`${person.id}-${slot}`}
                    type="button"
                    onClick={() =>
                      openNewAppointment({
                        date: selectedDate,
                        staffId: person.id,
                        startTime: slot,
                      })
                    }
                    className="absolute left-0 right-0 border-b border-[#edf0f2] text-left transition hover:bg-[#fff6fb]"
                    style={{
                      top: index * slotHeight,
                      height: slotHeight,
                    }}
                    title={`Agendar con ${person.full_name} a las ${slot}`}
                  >
                    <span className="sr-only">
                      Agendar con {person.full_name} a las {slot}
                    </span>
                  </button>
                ))}

                {staffItems.map((item) => {
                  const position = getItemPosition(item);

                  return (
                    <div
                      key={item.id}
                      className="absolute z-10"
                      style={{
                        top: position.top,
                        height: position.height,
                        left: 8,
                        right: 8,
                      }}
                    >
                      <AppointmentCard
                        item={item}
                        person={person}
                        payment={getPaymentForAppointment(item.appointment?.id)}
                        onOpen={openAppointmentDetail}
                        onEdit={openEditAppointment}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeeklyViewSection({
  selectedDate,
  setSelectedDate,
  weekDays,
  appointmentsByDate,
  openNewAppointment,
  openAppointmentDetail,
  openEditAppointment,
  getPaymentForAppointment,
  activeSection,
  setActiveSection,
}) {
  const weekRange = getWeekRange(selectedDate);

  return (
    <Card>
      <SectionHeader
        eyebrow="Vista semanal"
        title={`${weekRange.start} al ${weekRange.end}`}
        description="Da clic en un día para crear una cita con esa fecha preseleccionada."
        action={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <DateNavigation
  selectedDate={selectedDate}
  setSelectedDate={setSelectedDate}
  mode="week"
/>

            <ViewButtons
              activeSection={activeSection}
              setActiveSection={setActiveSection}
            />
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-7">
        {weekDays.map((date) => {
          const items = appointmentsByDate[date] || [];

          return (
            <div
              key={date}
              onClick={() => openNewAppointment({ date })}
              className="min-h-72 cursor-pointer rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-4 transition hover:border-[#bd7b83] hover:bg-[#fff6fb]"
            >
              <p className="text-sm font-medium text-[#263238]">
                {getShortDateLabel(date)}
              </p>

              <p className="mt-1 text-xs text-[#8a969a]">
                {items.length} movimiento{items.length === 1 ? "" : "s"}
              </p>

              <div className="mt-4 space-y-2">
                {items.length === 0 ? (
                  <p className="rounded-xl bg-[#f7f9fa] p-3 text-xs text-[#8a969a]">
                    Libre
                  </p>
                ) : (
                  items.slice(0, 8).map((item) => (
                    <AppointmentCard
                      key={item.id}
                      item={item}
                      onOpen={openAppointmentDetail}
                      payment={getPaymentForAppointment(item.appointment?.id)}
                      onEdit={openEditAppointment}
                      compact
                    />
                  ))
                )}

                {items.length > 8 && (
                  <p className="text-xs text-[#68777c]">
                    + {items.length - 8} más
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function MonthlyViewSection({
  selectedDate,
  setSelectedDate,
  monthDays,
  appointmentsByDate,
  openNewAppointment,
  openAppointmentDetail,
  openEditAppointment,
  getPaymentForAppointment,
  activeSection,
  setActiveSection,
}) {
  const currentDate = new Date(`${selectedDate}T00:00:00`);

  const monthTitle = currentDate.toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });

  return (
    <Card>
      <SectionHeader
        eyebrow="Vista mensual"
        title={monthTitle}
        description="Da clic en cualquier día para crear una cita con esa fecha preseleccionada."
        action={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <DateNavigation
  selectedDate={selectedDate}
  setSelectedDate={setSelectedDate}
  mode="month"
/>

            <ViewButtons
              activeSection={activeSection}
              setActiveSection={setActiveSection}
            />
          </div>
        }
      />

      <div className="grid grid-cols-7 rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] text-center text-xs font-medium uppercase tracking-[0.18em] text-[#68777c]">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
          <div
            key={day}
            className="border-r border-[#dde3e6] px-2 py-3 last:border-r-0"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-7 gap-3">
        {monthDays.map((day) => {
          const items = appointmentsByDate[day.date] || [];

          return (
            <div
              key={day.date}
              onClick={() => openNewAppointment({ date: day.date })}
              className={`min-h-40 cursor-pointer rounded-2xl border p-3 transition hover:border-[#bd7b83] hover:bg-[#fff6fb] ${
                day.isCurrentMonth
                  ? "border-[#dde3e6] bg-white"
                  : "border-[#edf0f2] bg-[#f7f9fa] opacity-60"
              }`}
            >
              <p className="text-sm font-medium text-[#263238]">
                {Number(day.date.slice(8, 10))}
              </p>

              <div className="mt-3 space-y-1">
                {items.slice(0, 4).map((item) => (
                  <AppointmentCard
                    key={item.id}
                    item={item}
                    onOpen={openAppointmentDetail}
                    payment={getPaymentForAppointment(item.appointment?.id)}
                    onEdit={openEditAppointment}
                    compact
                  />
                ))}

                {items.length > 4 && (
                  <p className="text-[11px] text-[#68777c]">
                    + {items.length - 4} más
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AvailabilitySection({
  form,
  setActiveSection,
  handleFormChange,
  findAvailableSpaces,
  availabilityMessage,
  availabilitySuggestions,
  applyAvailabilitySuggestion,
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <SectionHeader
          eyebrow="Buscar disponibilidad"
          title="Encontrar espacios libres"
          description="Primero agrega los servicios en Nueva cita. Después busca opciones libres para la fecha seleccionada."
        />

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm text-[#68777c]">
              Fecha para buscar
            </label>
            <input
              type="date"
              name="appointment_date"
              value={form.appointment_date}
              onChange={handleFormChange}
              className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
            />
          </div>

          <button
            type="button"
            onClick={findAvailableSpaces}
            className="w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90"
          >
            Buscar espacio disponible
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("nueva")}
            className="w-full rounded-full border border-[#bd7b83] px-6 py-4 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
          >
            Volver a nueva cita
          </button>
        </div>
      </Card>

      <AvailabilityCard
        availabilityMessage={availabilityMessage}
        availabilitySuggestions={availabilitySuggestions}
        applyAvailabilitySuggestion={applyAvailabilitySuggestion}
      />
    </div>
  );
}
function addDaysToDate(dateString, daysToAdd) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + daysToAdd);
  return date.toISOString().slice(0, 10);
}

function addMonthsToDate(dateString, monthsToAdd) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setMonth(date.getMonth() + monthsToAdd);
  return date.toISOString().slice(0, 10);
}

function getFollowupRuleFromConfig(
  rules = [],
  serviceName = "",
  serviceCategory = ""
) {
  const text = `${serviceName} ${serviceCategory}`.toLowerCase();

  return (rules || []).find((rule) => {
    const keywords = String(rule.keywords || "")
      .split(",")
      .map((keyword) => keyword.trim().toLowerCase())
      .filter(Boolean);

    return keywords.some((keyword) => text.includes(keyword));
  });
}

function buildFollowupMessage(template, clientName) {
  const firstName = clientName ? clientName.split(" ")[0] : "hermosa";

  return String(template || "").replaceAll("{client_first_name}", firstName);
}
function cleanPhoneForWhatsApp(phone) {
  if (!phone) return "";

  const onlyNumbers = String(phone).replace(/\D/g, "");

  if (onlyNumbers.startsWith("52")) {
    return onlyNumbers;
  }

  return `52${onlyNumbers}`;
}

function openWhatsAppMessage(phone, message) {
  const cleanPhone = cleanPhoneForWhatsApp(phone);

  if (!cleanPhone) {
    alert("Esta clienta no tiene teléfono registrado.");
    return;
  }

  const encodedMessage = encodeURIComponent(message);
  window.open(`https://wa.me/${cleanPhone}?text=${encodedMessage}`, "_blank");
}

function getClientFirstName(fullName) {
  if (!fullName) return "";
  return ` ${fullName.split(" ")[0]}`;
}

function getAppointmentServicesText(appointment) {
  const services = appointment.appointment_services || [];

  if (services.length === 0) {
    return "tu servicio";
  }

  return services
    .map((service) => service.services?.name || "servicio")
    .join(", ");
}

function normalizeRole(role) {
  return String(role || "tecnica").trim().toLowerCase();
}

function AppointmentDetailModal({
  appointment,
  onClose,
  onEdit,
  onAppointmentUpdated,
}) {
  const services = appointment.appointment_services || [];
  const appointmentExtras = appointment.appointment_extra_items || [];
  const designImageUrl = appointment.design_image_url || "";
  const clientName = appointment.clients?.full_name || "";
  const clientNumber = appointment.clients?.client_number || "";
 const clientFirstName = getClientFirstName(clientName);
  const clientPhone = appointment.clients?.phone || "";
  const appointmentTime = formatTime(appointment.start_time);
  const servicesText = getAppointmentServicesText(appointment);
 
  const [currentRole, setCurrentRole] = useState("tecnica");
  const [previousAppointment, setPreviousAppointment] = useState(null);
  const [loadingPreviousAppointment, setLoadingPreviousAppointment] =
    useState(true);
  const [attendanceForm, setAttendanceForm] = useState({
    attendance_status: appointment.attendance_status || "pendiente",
    attendance_notes: appointment.attendance_notes || "",
    arrived_late_minutes: appointment.arrived_late_minutes || "",
  });
  const [attendanceMessage, setAttendanceMessage] = useState("");
  const [savingAttendance, setSavingAttendance] = useState(false);

useEffect(() => {
  setAttendanceForm({
    attendance_status: appointment.attendance_status || "pendiente",
    attendance_notes: appointment.attendance_notes || "",
    arrived_late_minutes: appointment.arrived_late_minutes || "",
  });
  setAttendanceMessage("");
}, [appointment.id, appointment.attendance_status, appointment.attendance_notes, appointment.arrived_late_minutes]);

useEffect(() => {
  const loadRole = async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;

    if (!user) return;

    const { data: profileById } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (profileById?.role) {
      setCurrentRole(profileById.role);
      return;
    }

    const { data: profileByEmail } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("email", user.email)
      .maybeSingle();

    if (profileByEmail?.role) {
      setCurrentRole(profileByEmail.role);
    }
  };

  loadRole();
}, []);

useEffect(() => {
  const loadPreviousAppointment = async () => {
    if (!appointment.client_id) {
      setPreviousAppointment(null);
      setLoadingPreviousAppointment(false);
      return;
    }

    setLoadingPreviousAppointment(true);

    const { data, error } = await supabase
      .from("appointments")
      .select(`
        id,
        appointment_date,
        start_time,
        appointment_services (
          id,
          services (name)
        )
      `)
      .eq("client_id", appointment.client_id)
      .neq("id", appointment.id)
      .or(
        `appointment_date.lt.${appointment.appointment_date},and(appointment_date.eq.${appointment.appointment_date},start_time.lt.${appointment.start_time})`
      )
      .order("appointment_date", { ascending: false })
      .order("start_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    setPreviousAppointment(error ? null : data);
    setLoadingPreviousAppointment(false);
  };

  loadPreviousAppointment();
}, [appointment.id, appointment.client_id, appointment.appointment_date, appointment.start_time]);

const normalizedRole = normalizeRole(currentRole);
const isAdmin = normalizedRole === "admin";
const canUpdateAttendance = ["admin", "encargada"].includes(normalizedRole);
const canUseManualWhatsApp = normalizedRole !== "tecnica";
const currentAttendanceOption = getAttendanceOption(
  attendanceForm.attendance_status
);

const handleAttendanceStatusChange = (value) => {
  const option = getAttendanceOption(value);

  setAttendanceForm((current) => ({
    ...current,
    attendance_status: value,
    arrived_late_minutes:
      value === "llego_retrasada" ? current.arrived_late_minutes : "",
    attendance_source: option.source,
  }));
};

const saveAttendanceStatus = async () => {
  setAttendanceMessage("");

  if (!canUpdateAttendance) {
    setAttendanceMessage("Solo admin o encargada pueden actualizar asistencia.");
    return;
  }

  const selectedStatus = attendanceForm.attendance_status || "pendiente";
  const option = getAttendanceOption(selectedStatus);
  const now = new Date().toISOString();

  const payload = {
    attendance_status: selectedStatus,
    attendance_source: option.source,
    attendance_notes: attendanceForm.attendance_notes.trim() || null,
    arrived_late_minutes:
      selectedStatus === "llego_retrasada"
        ? Number(attendanceForm.arrived_late_minutes || 0)
        : null,
    confirmed_at: selectedStatus.includes("confirmada") ? now : appointment.confirmed_at || null,
    cancelled_at: selectedStatus === "cancelo" ? now : null,
    no_show_at: selectedStatus === "no_asistio" ? now : null,
  };

  setSavingAttendance(true);

  const { error } = await supabase
    .from("appointments")
    .update(payload)
    .eq("id", appointment.id);

  if (error) {
    setAttendanceMessage(
      `No se pudo actualizar asistencia. Ejecuta el SQL de agenda si faltan columnas. Detalle: ${error.message}`
    );
    setSavingAttendance(false);
    return;
  }

  onAppointmentUpdated?.(appointment.id, payload);
  let attendancePushWarning = "";
  const staffIds = [
    ...new Set(
      (appointment.appointment_services || [])
        .map((service) => service.staff_id)
        .filter(Boolean)
    ),
  ];

  if (staffIds.length > 0) {
    const { data: attendanceNotifications, error: attendanceNotificationError } =
      await supabase
        .from("notifications")
        .insert(
          staffIds.map((staffId) => ({
            staff_id: staffId,
            title: "Estado de cita actualizado",
            message: `La cita de ${
              appointment.clients?.full_name || "Clienta"
            } cambió a ${getAttendanceOption(selectedStatus).label}.`,
            notification_type: "cita_estado",
            related_table: "appointments",
            related_id: appointment.id,
            is_read: false,
          }))
        )
        .select("id");

    if (!attendanceNotificationError) {
      const pushResult = await triggerPushForNotificationIds(
        (attendanceNotifications || []).map((notification) => notification.id)
      );

      if (pushResult.error) {
        attendancePushWarning = ` No se pudo enviar push: ${pushResult.error.message}`;
      }
    }
  }
  if (selectedStatus === "cancelo") {
    const adminNotificationResult = await triggerAdminAppointmentNotification({
      appointment_id: appointment.id,
      event_type: "cita_cancelada_admin",
      client_name: appointment.clients?.full_name || "Clienta",
      summary: `${appointment.appointment_date} ${formatTime(
        appointment.start_time
      )}`,
    });

    if (adminNotificationResult.error) {
      attendancePushWarning = `${attendancePushWarning} No se pudo notificar al admin: ${adminNotificationResult.error.message}`;
    }
  }
  setAttendanceMessage(
    `Estado de asistencia actualizado correctamente ✨${attendancePushWarning}`
  );
  setSavingAttendance(false);
};

  const reminderMessage = `Hola ${clientFirstName} 💕 Te recordamos con mucho gusto tu cita en Alexandra Ruiz Salón Spa para hoy a las ${appointmentTime}. Te esperamos para consentirte ✨`;

  const onTheWayMessage = `Hola ${clientFirstName} 💕 Solo queremos confirmar si vienes en camino a tu cita de las ${appointmentTime}. Te esperamos ✨`;

  const lateMessage = `Hola ${clientFirstName} 💕 Notamos que tu cita era a las ${appointmentTime}. ¿Nos confirmas si vienes en camino o si tuviste algún retraso?`;

  const thankYouMessage = `Hola ${clientFirstName} 💕 Muchas gracias por visitarnos y confiar en Alexandra Ruiz Salón Spa. Esperamos que hayas disfrutado tu servicio de ${servicesText}. Fue un gusto atenderte, te esperamos pronto ✨`;

 const reviewBaseUrl = "https://alexandra-ruiz-salon.vercel.app";

const reviewLink = `${reviewBaseUrl}/calificar/${appointment.id}`;

const reviewMessage = `Hola ${clientFirstName} 💕 Gracias por visitarnos. Nos encantaría conocer tu opinión sobre tu experiencia en Alexandra Ruiz Salón Spa. Tu calificación nos ayuda muchísimo a seguir mejorando ✨

Puedes calificarnos aquí:
${reviewLink}`;

const goToPayment = () => {
  window.location.href = `/admin/cobros?appointmentId=${appointment.id}`;
};

const [deletingAppointment, setDeletingAppointment] = useState(false);
const [deleteMessage, setDeleteMessage] = useState("");

const canDeleteAppointment = isAdmin;

const deleteAppointment = async () => {
  setDeleteMessage("");

  if (!isAdmin) {
    setDeleteMessage("Solo admin puede borrar citas.");
    return;
  }

  const confirmDelete = window.confirm(
    "¿Seguro que deseas borrar esta cita? Esta acción no se puede deshacer."
  );

  if (!confirmDelete) return;

  setDeletingAppointment(true);

  const { data: existingPayments, error: paymentCheckError } = await supabase
    .from("payments")
    .select("id")
    .eq("appointment_id", appointment.id);

  if (paymentCheckError) {
    setDeleteMessage(
      `No se pudo validar si la cita ya tiene cobros: ${paymentCheckError.message}`
    );
    setDeletingAppointment(false);
    return;
  }

  if (existingPayments && existingPayments.length > 0) {
    const paymentIds = existingPayments.map((payment) => payment.id);
    const relatedPaymentTables = [
      "payment_extra_items",
      "payment_service_items",
      "payment_staff_totals",
      "cash_movements",
    ];

    for (const tableName of relatedPaymentTables) {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .in("payment_id", paymentIds);

      if (error) {
        setDeleteMessage(
          `No se pudo borrar información relacionada en ${tableName}: ${error.message}`
        );
        setDeletingAppointment(false);
        return;
      }
    }

    const { error: paymentsError } = await supabase
      .from("payments")
      .delete()
      .eq("appointment_id", appointment.id);

    if (paymentsError) {
      setDeleteMessage(
        `No se pudieron borrar los cobros de la cita: ${paymentsError.message}`
      );
      setDeletingAppointment(false);
      return;
    }
  }

  const { error: extrasError } = await supabase
    .from("appointment_extra_items")
    .delete()
    .eq("appointment_id", appointment.id);

  if (extrasError) {
    setDeleteMessage(
      `No se pudieron borrar los extras de la cita: ${extrasError.message}`
    );
    setDeletingAppointment(false);
    return;
  }

  const { error: servicesError } = await supabase
    .from("appointment_services")
    .delete()
    .eq("appointment_id", appointment.id);

  if (servicesError) {
    setDeleteMessage(
      `No se pudieron borrar los servicios de la cita: ${servicesError.message}`
    );
    setDeletingAppointment(false);
    return;
  }

  const { error: appointmentError } = await supabase
    .from("appointments")
    .delete()
    .eq("id", appointment.id);

  if (appointmentError) {
    setDeleteMessage(`No se pudo borrar la cita: ${appointmentError.message}`);
    setDeletingAppointment(false);
    return;
  }

  setDeletingAppointment(false);
  onClose();
  window.location.reload();
};

  return (
    <div className="fixed inset-0 z-50 flex
     items-center justify-center bg-black/40 p-4">
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-auto rounded-[1.5rem] bg-white p-6 shadow-2xl">
        <button
          type="button"
          onClick={onEdit}
          className="absolute right-14 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#f7eeee] text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
          title="Editar cita"
        >
          ✏️
        </button>

        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-[#f7f9fa] text-[#68777c] transition hover:bg-[#edf0f2]"
          title="Cerrar"
        >
          ×
        </button>

        <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
          Detalle de cita
        </p>

        <h3 className="mt-2 pr-24 text-2xl font-light">
          {appointment.clients?.full_name || "Clienta"}
        </h3>

        <p className="mt-1 text-sm text-[#68777c]">
          {appointment.appointment_date} · {formatTime(appointment.start_time)} -{" "}
          {formatTime(appointment.end_time)}
        </p>

        {clientNumber && (
          <p className="mt-2 inline-flex rounded-full bg-[#f7eeee] px-3 py-1 text-xs font-medium text-[#8a5f63]">
            Número de clienta: {clientNumber}
          </p>
        )}

        <div className="mt-6 rounded-2xl bg-[#f7f9fa] p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                Asistencia / seguimiento
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${getAttendanceBadgeClass(
                    attendanceForm.attendance_status
                  )}`}
                >
                  {currentAttendanceOption.label}
                </span>
                {attendanceForm.attendance_status === "llego_retrasada" &&
                  Number(attendanceForm.arrived_late_minutes || 0) > 0 && (
                    <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                      Retraso: {attendanceForm.arrived_late_minutes} min
                    </span>
                  )}
              </div>
              {attendanceForm.attendance_notes && (
                <p className="mt-3 text-sm leading-6 text-[#68777c]">
                  {attendanceForm.attendance_notes}
                </p>
              )}
            </div>

            {!canUpdateAttendance && (
              <p className="text-xs text-[#8a969a]">
                Visible para técnicas. Edición disponible para admin/encargada.
              </p>
            )}
          </div>

          {canUpdateAttendance && (
            <div className="mt-4 grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Estado
                  </label>
                  <select
                    value={attendanceForm.attendance_status}
                    onChange={(event) =>
                      handleAttendanceStatusChange(event.target.value)
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                  >
                    {attendanceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {attendanceForm.attendance_status === "llego_retrasada" && (
                  <div>
                    <label className="mb-2 block text-sm text-[#68777c]">
                      Minutos de retraso
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={attendanceForm.arrived_late_minutes}
                      onChange={(event) =>
                        setAttendanceForm((current) => ({
                          ...current,
                          arrived_late_minutes: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                      placeholder="Ej. 15"
                    />
                  </div>
                )}
              </div>

              {["llego_retrasada", "cancelo", "no_asistio"].includes(
                attendanceForm.attendance_status
              ) && (
                <textarea
                  value={attendanceForm.attendance_notes}
                  onChange={(event) =>
                    setAttendanceForm((current) => ({
                      ...current,
                      attendance_notes: event.target.value,
                    }))
                  }
                  className="min-h-24 w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                  placeholder="Nota interna de asistencia, cancelación o retraso..."
                />
              )}

              {attendanceMessage && (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                    attendanceMessage.includes("correctamente")
                      ? "bg-green-600 text-white"
                      : "bg-red-600 text-white"
                  }`}
                >
                  {attendanceMessage}
                </div>
              )}

              <button
                type="button"
                disabled={savingAttendance}
                onClick={saveAttendanceStatus}
                className="w-full rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90 disabled:opacity-60 sm:w-fit"
              >
                {savingAttendance ? "Guardando..." : "Guardar asistencia"}
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-2xl bg-[#fff6fb] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
            Última cita anterior
          </p>
          {loadingPreviousAppointment ? (
            <p className="mt-3 text-sm text-[#68777c]">Cargando información...</p>
          ) : previousAppointment ? (
            <div className="mt-3 space-y-1 text-sm text-[#263238]">
              <p><span className="font-medium">Fecha:</span>{" "}
                {previousAppointment.appointment_date}</p>
              <p><span className="font-medium">Hora:</span>{" "}
                {formatTime(previousAppointment.start_time)}</p>
              <p><span className="font-medium">Servicios:</span>{" "}
                {(previousAppointment.appointment_services || [])
                  .map((item) => item.services?.name)
                  .filter(Boolean)
                  .join(", ") || "Sin servicios registrados"}</p>
              <p className="pt-2 text-[#68777c]">
                Revisa esta información para confirmar si corresponde cobrar retiro,
                cambio de técnica o algún adicional.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#68777c]">
              No hay una cita anterior registrada para esta clienta.
            </p>
          )}
        </div>

        <div className="mt-6 rounded-2xl bg-[#f7f9fa] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
            Diseño solicitado
          </p>
          {designImageUrl ? (
            <div className="mt-3 overflow-hidden rounded-2xl border border-[#dde3e6] bg-white">
              <img
                src={designImageUrl}
                alt="Diseño solicitado por la clienta"
                className="max-h-96 w-full object-contain"
              />
              <div className="border-t border-[#edf0f1] p-3">
                <a
                  href={designImageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-[#bd7b83]"
                >
                  Abrir imagen en tamaño completo
                </a>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[#68777c]">Sin imagen de diseño.</p>
          )}
        </div>

        <div className="mt-6 rounded-2xl bg-[#fff6fb] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
            Extras / decoraciones
          </p>
          {appointmentExtras.length === 0 ? (
            <p className="mt-3 text-sm text-[#68777c]">
              Sin extras registrados.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {appointmentExtras.map((extra) => (
                <div
                  key={extra.id || `${extra.name}-${extra.total_price}`}
                  className="rounded-2xl border border-[#dde3e6] bg-white p-3"
                >
                  <div className="flex justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium text-[#263238]">
                        {extra.name || "Extra"}
                      </p>
                      <p className="text-[#68777c]">
                        Cantidad: {extra.quantity || 1} · Precio:{" "}
                        {formatMoney(extra.unit_price || 0)}
                      </p>
                      {extra.notes && (
                        <p className="mt-1 text-[#68777c]">{extra.notes}</p>
                      )}
                    </div>
                    <p className="font-medium text-[#263238]">
                      {formatMoney(extra.total_price || 0)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

     {canUseManualWhatsApp && (
  <div className="mt-6 rounded-2xl bg-[#f7f9fa] p-4">
    <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
      Mensajes rápidos por WhatsApp
    </p>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => openWhatsAppMessage(clientPhone, reminderMessage)}
        className="rounded-full bg-[#25D366] px-5 py-3 text-sm text-white transition hover:opacity-90"
      >
        Enviar recordatorio
      </button>

      <button
        type="button"
        onClick={() => openWhatsAppMessage(clientPhone, onTheWayMessage)}
        className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
      >
        ¿Viene en camino?
      </button>

      <button
        type="button"
        onClick={() => openWhatsAppMessage(clientPhone, lateMessage)}
        className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
      >
        Preguntar si viene retrasada
      </button>

      <button
        type="button"
        onClick={() => openWhatsAppMessage(clientPhone, thankYouMessage)}
        className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
      >
        Enviar agradecimiento
      </button>

      <button
        type="button"
        onClick={() => openWhatsAppMessage(clientPhone, reviewMessage)}
        className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white sm:col-span-2"
      >
        Solicitar calificación
      </button>
    </div>

    <p className="mt-3 text-xs text-[#68777c]">
      Por ahora se abrirá WhatsApp con el mensaje listo para enviar. Más adelante estos mensajes se enviarán desde el número del salón mediante API.
    </p>
  </div>
)}

<div className="mt-6">
  {deleteMessage && (
    <div className="mb-3 rounded-2xl bg-red-600 px-5 py-4 text-sm font-medium text-white">
      {deleteMessage}
    </div>
  )}

  <div className="flex flex-col gap-3 sm:flex-row">
    <button
      type="button"
      onClick={goToPayment}
      className="rounded-full bg-green-600 px-5 py-3 text-sm text-white transition hover:opacity-90"
    >
      Cobrar cita
    </button>

    {canDeleteAppointment && (
      <button
        type="button"
        disabled={deletingAppointment}
        onClick={deleteAppointment}
        className="rounded-full border border-red-500 px-5 py-3 text-sm text-red-600 transition hover:bg-red-600 hover:text-white disabled:opacity-60"
      >
        {deletingAppointment ? "Borrando..." : "Borrar cita"}
      </button>
    )}
  </div>
</div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-[#f7f9fa] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
              WhatsApp
            </p>
            <p className="mt-2 text-sm text-[#263238]">
              {appointment.clients?.phone || "-"}
            </p>
          </div>

          <div className="rounded-2xl bg-[#f7f9fa] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
              Total estimado
            </p>
            <p className="mt-2 text-sm text-[#263238]">
              ${appointment.estimated_total || 0}
            </p>
          </div>

          <div className="rounded-2xl bg-[#f7f9fa] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
              Anticipo
            </p>
            <p className="mt-2 text-sm text-[#263238]">
              ${appointment.deposit_amount || 0}{" "}
              {appointment.deposit_payment_method
                ? `· ${appointment.deposit_payment_method}`
                : ""}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-lg font-light">Servicios</h4>

          <div className="mt-3 space-y-3">
            {services.length === 0 ? (
              <div className="rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
                No hay servicios guardados.
              </div>
            ) : (
              services.map((service) => (
                <div
                  key={service.id}
                  className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-4"
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row">
                    <div>
                      <p className="font-medium text-[#263238]">
                        {service.services?.name || "Servicio"}
                      </p>
                      <p className="text-sm text-[#68777c]">
                        {service.staff?.full_name || "Técnica"} ·{" "}
                        {formatTime(service.start_time)} -{" "}
                        {formatTime(service.end_time)}
                      </p>
                      {service.notes && (
                        <p className="mt-2 rounded-xl bg-[#f7f9fa] p-3 text-sm text-[#68777c]">
                          {service.notes}
                        </p>
                      )}
                    </div>

                    <p className="text-sm font-medium text-[#263238]">
                      ${service.total_price || service.price || 0}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {appointment.notes && (
          <div className="mt-6 rounded-2xl bg-[#fff6fb] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
              Observaciones internas
            </p>
            <p className="mt-2 text-sm leading-6 text-[#68777c]">
              {appointment.notes}
            </p>
          </div>
        )}

        {appointment.force_created && (
          <p className="mt-5 rounded-full bg-[#f7eeee] px-4 py-2 text-sm text-[#8a5f63]">
            Cita forzada fuera de disponibilidad
          </p>
        )}
      </div>
    </div>
  );
}
