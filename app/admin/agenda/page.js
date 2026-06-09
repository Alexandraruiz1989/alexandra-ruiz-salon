"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import AdminShell from "../components/AdminShell";

const agendaMenuItems = [
  { key: "nueva", label: "Nueva cita" },
  { key: "diaria", label: "Vista diaria" },
  { key: "semanal", label: "Vista semanal" },
  { key: "mensual", label: "Vista mensual" },
  { key: "disponibilidad", label: "Buscar disponibilidad" },
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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(time) {
  if (!time) return "";
  return time.slice(0, 5);
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
  const [appointments, setAppointments] = useState([]);
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
    notes: "",
    force_created: false,
  });

  const [serviceLines, setServiceLines] = useState([{ ...emptyServiceLine }]);

  useEffect(() => {
    const start = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        window.location.href = "/admin";
        return;
      }

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

  const loadInitialData = async () => {
    setLoadingData(true);
    setMessage("");

    const [clientsResult, staffResult, servicesResult, schedulesResult] =
      await Promise.all([
        supabase.from("clients").select("*").order("full_name"),
        supabase.from("staff").select("*").eq("active", true).order("full_name"),
        supabase
          .from("services")
          .select("*")
          .eq("active", true)
          .order("category", { ascending: true })
          .order("name", { ascending: true }),
        supabase.from("staff_schedules").select("*"),
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

    if (servicesResult.error) {
      setMessage(`Error al cargar servicios: ${servicesResult.error.message}`);
    } else {
      setServices(servicesResult.data || []);
    }

    if (schedulesResult.error) {
      setMessage(`Error al cargar horarios: ${schedulesResult.error.message}`);
    } else {
      setStaffSchedules(schedulesResult.data || []);
    }

    await loadDateData(selectedDate);
    await loadRangeData(selectedDate);

    setLoadingData(false);
  };

  const loadDateData = async (date) => {
    const [appointmentsResult, blocksResult] = await Promise.all([
      supabase
        .from("appointments")
        .select(
          `
          *,
          clients (
            full_name,
            phone
          ),
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
      setAppointments(appointmentsResult.data || []);
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
          clients (
            full_name,
            phone
          ),
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
      setRangeAppointments(appointmentsResult.data || []);
    }

    if (!blocksResult.error) {
      setRangeTimeBlocks(blocksResult.data || []);
    }
  };
    const handleFormChange = (event) => {
    const { name, value, type, checked } = event.target;

    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const getServiceMatches = (searchText) => {
    const term = searchText.toLowerCase().trim();

    if (term.length < 2) return [];

    return services
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

        setActiveSuggestion((currentActive) => ({
          ...currentActive,
          [index]: 0,
        }));

        setClosedSuggestions((currentClosed) => ({
          ...currentClosed,
          [index]: false,
        }));
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

  const validServiceLines = useMemo(() => {
    return serviceLines.filter(
      (line) =>
        line.service_id && line.staff_id && line.start_time && line.end_time
    );
  }, [serviceLines]);

  const estimatedTotal = useMemo(() => {
    return serviceLines.reduce((sum, line) => {
      return sum + Number(line.price || 0) * Number(line.quantity || 1);
    }, 0);
  }, [serviceLines]);

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
      notes: "",
      force_created: false,
    });

    setServiceLines([{ ...emptyServiceLine }]);
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
      notes: "",
      force_created: false,
    });

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
    setSelectedAppointment(appointment);
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

  const rows = [];

  for (const line of validServiceLines) {
    const service = services.find((item) => item.id === line.service_id);

    if (!service) continue;

    const rule = getFollowupRule(service.name, service.category);

    if (!rule.shouldCreate) continue;

    const followupDate =
      rule.months && rule.months > 0
        ? addMonthsToDate(appointment.appointment_date, rule.months)
        : addDaysToDate(appointment.appointment_date, rule.days || 14);

    const client = clients.find((item) => item.id === appointment.client_id);
    const clientName = client?.full_name || "";

    rows.push({
      appointment_id: appointment.id,
      client_id: appointment.client_id,
      service_id: line.service_id,
      staff_id: line.staff_id || appointment.staff_id || null,
      followup_type: rule.type || "reagendar",
      followup_date: followupDate,
      followup_status: "pendiente",
      message_body: buildFollowupMessage(rule.message, clientName),
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

    const internalConflict = checkInternalConflicts();

    if (internalConflict.hasConflict && !form.force_created) {
      setMessage(internalConflict.message);
      setSaving(false);
      return;
    }

    const scheduleConflict = checkStaffScheduleConflicts();

    if (scheduleConflict.hasConflict && !form.force_created) {
      setMessage(scheduleConflict.message);
      setSaving(false);
      return;
    }

    const timeBlockConflict = await checkTimeBlockConflicts();

    if (timeBlockConflict.hasConflict && !form.force_created) {
      setMessage(timeBlockConflict.message);
      setSaving(false);
      return;
    }

    const databaseConflict = await checkDatabaseConflicts();

    if (databaseConflict.hasConflict && !form.force_created) {
      setMessage(databaseConflict.message);
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
      force_created: form.force_created,
      notes: form.notes.trim() || null,
    };

    let appointment = null;
    const wasEditing = Boolean(editingAppointmentId);

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
await createAppointmentFollowups(appointment);
    setSelectedDate(form.appointment_date);
    await loadDateData(form.appointment_date);
    await loadRangeData(form.appointment_date);

    resetForm();
    setMessage(
      wasEditing
        ? "Cita actualizada correctamente ✨"
        : "Cita registrada correctamente ✨"
    );
    setSaving(false);
    setActiveSection("diaria");
  };

  const appointmentsByStaff = useMemo(() => {
    const result = {};

    staff.forEach((person) => {
      result[person.id] = [];
    });

    appointments.forEach((appointment) => {
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
  }, [appointments, staff, timeBlocks]);

  const appointmentsByDate = useMemo(() => {
    const result = {};

    rangeAppointments.forEach((appointment) => {
      const date = appointment.appointment_date;

      if (!result[date]) {
        result[date] = [];
      }

      const servicesForAppointment = appointment.appointment_services || [];

      servicesForAppointment.forEach((item) => {
        result[date].push({
          ...item,
          appointment,
          isBlock: false,
        });
      });
    });

    rangeTimeBlocks.forEach((block) => {
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
  }, [rangeAppointments, rangeTimeBlocks]);

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
          form={form}
          serviceLines={serviceLines}
          message={message}
          editingAppointmentId={editingAppointmentId}
          activeSuggestion={activeSuggestion}
          closedSuggestions={closedSuggestions}
          estimatedTotal={estimatedTotal}
          saving={saving}
          timeOptions={timeOptions}
          handleFormChange={handleFormChange}
          getServiceMatches={getServiceMatches}
          applySelectedService={applySelectedService}
          handleServiceLineChange={handleServiceLineChange}
          handleServiceSearchKeyDown={handleServiceSearchKeyDown}
          addServiceLine={addServiceLine}
          removeServiceLine={removeServiceLine}
          setActiveSuggestion={setActiveSuggestion}
          handleSubmit={handleSubmit}
          findAvailableSpaces={findAvailableSpaces}
          availabilityMessage={availabilityMessage}
          availabilitySuggestions={availabilitySuggestions}
          applyAvailabilitySuggestion={applyAvailabilitySuggestion}
          getToastStyle={getToastStyle}
        />
      )}

      {activeSection === "diaria" && (
        <DailyViewSection
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          staff={staff}
          appointmentsByStaff={appointmentsByStaff}
          loadingData={loadingData}
          openNewAppointment={openNewAppointment}
          openAppointmentDetail={openAppointmentDetail}
          openEditAppointment={openEditAppointment}
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
          activeSection={activeSection}
          setActiveSection={setActiveSection}
        />
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

      {selectedAppointment && (
        <AppointmentDetailModal
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onEdit={() => openEditAppointment(selectedAppointment)}
        />
      )}
    </AdminShell>
  );
}
function NewAppointmentSection({
  clients,
  staff,
  services,
  form,
  serviceLines,
  message,
  editingAppointmentId,
  activeSuggestion,
  closedSuggestions,
  estimatedTotal,
  saving,
  timeOptions,
  handleFormChange,
  getServiceMatches,
  applySelectedService,
  handleServiceLineChange,
  handleServiceSearchKeyDown,
  addServiceLine,
  removeServiceLine,
  setActiveSuggestion,
  handleSubmit,
  findAvailableSpaces,
  availabilityMessage,
  availabilitySuggestions,
  applyAvailabilitySuggestion,
  getToastStyle,
}) {
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
              <select
                name="client_id"
                value={form.client_id}
                onChange={handleFormChange}
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              >
                <option value="">Seleccionar clienta</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.full_name} - {client.phone}
                  </option>
                ))}
              </select>

              <a
                href="/admin/clientas"
                className="mt-2 inline-block text-sm text-[#bd7b83]"
              >
                Registrar nueva clienta
              </a>
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

              <button
                type="button"
                onClick={addServiceLine}
                className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
              >
                Agregar servicio
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {serviceLines.map((line, index) => {
                const matches = getServiceMatches(line.service_search);
                const selectedService = services.find(
                  (service) => service.id === line.service_id
                );
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
                          {staff.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.full_name}
                            </option>
                          ))}
                        </select>
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
            placeholder="Notas generales de la cita..."
          />

          <label className="flex items-center gap-2 rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
            <input
              type="checkbox"
              name="force_created"
              checked={form.force_created}
              onChange={handleFormChange}
            />
            Forzar cita fuera de horario o disponibilidad
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
      />
    </div>
  );
}function AvailabilityCard({
  availabilityMessage,
  availabilitySuggestions,
  applyAvailabilitySuggestion,
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

function AppointmentCard({ item, person, onOpen, onEdit, compact = false }) {
  if (item.isBlock) {
    return (
      <div
        className={`rounded-xl border px-3 py-2 text-xs ${getBlockCardClass(
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
      className="relative cursor-pointer rounded-xl px-3 py-2 text-xs text-white shadow-sm"
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

      <p className="pr-8 font-medium">
        {formatTime(item.start_time)} - {formatTime(item.end_time)}
      </p>
      <p className="pr-8">
        {item.appointment?.clients?.full_name || "Clienta"}
      </p>
      <p className={compact ? "truncate" : ""}>
        {item.services?.name || "Servicio"}
      </p>
    </div>
  );
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
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
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
        <div className="overflow-auto rounded-2xl border border-[#dde3e6]">
          <table className="min-w-[950px] w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#f7f9fa]">
                <th className="sticky left-0 z-10 border-b border-r border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 text-left font-medium">
                  Hora
                </th>

                {staff.map((person) => (
                  <th
                    key={person.id}
                    className="border-b border-r border-[#dde3e6] px-4 py-3 text-left font-medium"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: person.color || "#bd7b83" }}
                      />
                      {person.full_name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {timeSlots.map((slot) => (
                <tr key={slot} className="hover:bg-[#fbf7f6]">
                  <td className="sticky left-0 z-10 border-b border-r border-[#dde3e6] bg-white px-4 py-3 font-medium text-[#68777c]">
                    {slot}
                  </td>

                  {staff.map((person) => {
                    const items = (appointmentsByStaff[person.id] || []).filter(
                      (item) =>
                        timesOverlap(
                          slot,
                          addMinutesToTime(slot, 30),
                          item.start_time,
                          item.end_time
                        )
                    );

                    return (
                      <td
                        key={`${person.id}-${slot}`}
                        onClick={() => {
                          if (items.length === 0) {
                            openNewAppointment({
                              date: selectedDate,
                              staffId: person.id,
                              startTime: slot,
                            });
                          }
                        }}
                        className={`h-20 min-w-56 border-b border-r border-[#dde3e6] px-3 py-2 align-top ${
                          items.length === 0
                            ? "cursor-pointer bg-white hover:bg-[#fff6fb]"
                            : "bg-white"
                        }`}
                      >
                        {items.length === 0 ? (
                          <span className="text-xs text-[#b0b8bb]">
                            Libre · clic para agendar
                          </span>
                        ) : (
                          <div className="space-y-2">
                            {items.map((item) => (
                              <AppointmentCard
                                key={item.id}
                                item={item}
                                person={person}
                                onOpen={openAppointmentDetail}
                                onEdit={openEditAppointment}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
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
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
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
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
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

function getFollowupRule(serviceName = "", serviceCategory = "") {
  const text = `${serviceName} ${serviceCategory}`.toLowerCase();

  const isHandsOrFeet =
    text.includes("uña") ||
    text.includes("uñas") ||
    text.includes("mano") ||
    text.includes("manos") ||
    text.includes("pie") ||
    text.includes("pies") ||
    text.includes("mani") ||
    text.includes("pedi") ||
    text.includes("gel") ||
    text.includes("gelish") ||
    text.includes("rubber") ||
    text.includes("acril") ||
    text.includes("acrí") ||
    text.includes("softgel") ||
    text.includes("polygel");

  const isHairTreatment =
    text.includes("cabello") ||
    text.includes("capilar") ||
    text.includes("keratina") ||
    text.includes("cirugía") ||
    text.includes("cirugia") ||
    text.includes("botox") ||
    text.includes("tratamiento");

  if (isHandsOrFeet) {
    return {
      shouldCreate: true,
      days: 14,
      months: 0,
      type: "manos_pies",
      message:
        "Hola {client_first_name} 💕 Esperamos que estés muy bien. Ya pasaron aproximadamente 2 semanas desde tu cita y queremos recordarte que es buen momento para agendar tu siguiente servicio de manos o pies. ¿Te ayudamos a buscar un espacio? ✨",
    };
  }

  if (isHairTreatment) {
    return {
      shouldCreate: true,
      days: 0,
      months: 1,
      type: "cabello_1_mes",
      message:
        "Hola {client_first_name} 💕 Esperamos que estés muy bien. Queríamos darte seguimiento a tu tratamiento capilar y recordarte que ya puedes agendar tu próxima cita de mantenimiento o valoración. ¿Te ayudamos a revisar disponibilidad? ✨",
    };
  }

  return {
    shouldCreate: false,
  };
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
  if (!fullName) return "hermosa";
  return fullName.split(" ")[0];
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
function AppointmentDetailModal({ appointment, onClose, onEdit }) {
  const services = appointment.appointment_services || [];
  const clientName = appointment.clients?.full_name || "";
  const clientFirstName = getClientFirstName(clientName);
  const clientPhone = appointment.clients?.phone || "";
  const appointmentTime = formatTime(appointment.start_time);
  const servicesText = getAppointmentServicesText(appointment);

  const reminderMessage = `Hola ${clientFirstName} 💕 Te recordamos con mucho gusto tu cita en Alexandra Ruiz Salón Spa para hoy a las ${appointmentTime}. Te esperamos para consentirte ✨`;

  const onTheWayMessage = `Hola ${clientFirstName} 💕 Solo queremos confirmar si vienes en camino a tu cita de las ${appointmentTime}. Te esperamos ✨`;

  const lateMessage = `Hola ${clientFirstName} 💕 Notamos que tu cita era a las ${appointmentTime}. ¿Nos confirmas si vienes en camino o si tuviste algún retraso?`;

  const thankYouMessage = `Hola ${clientFirstName} 💕 Muchas gracias por visitarnos y confiar en Alexandra Ruiz Salón Spa. Esperamos que hayas disfrutado tu servicio de ${servicesText}. Fue un gusto atenderte, te esperamos pronto ✨`;

 const reviewBaseUrl = "https://alexandra-ruiz-salon.vercel.app";

const reviewLink = `${reviewBaseUrl}/calificar/${appointment.id}`;

const reviewMessage = `Hola ${clientFirstName} 💕 Gracias por visitarnos. Nos encantaría conocer tu opinión sobre tu experiencia en Alexandra Ruiz Salón Spa. Tu calificación nos ayuda muchísimo a seguir mejorando ✨

Puedes calificarnos aquí:
${reviewLink}`;
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
            Por ahora se abrirá WhatsApp con el mensaje listo para enviar. Más adelante estos textos serán editables desde configuración.
          </p>
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
              Notas generales
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