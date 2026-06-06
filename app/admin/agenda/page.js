"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

function formatTime(time) {
  if (!time) return "";
  return time.slice(0, 5);
}

function generateTimeOptions() {
  const options = [];
  const startHour = 8;
  const endHour = 21;

  for (let hour = startHour; hour <= endHour; hour++) {
    for (let minute = 0; minute < 60; minute += 10) {
      if (hour === endHour && minute > 0) continue;

      const value = `${String(hour).padStart(2, "0")}:${String(
        minute
      ).padStart(2, "0")}`;

      options.push(value);
    }
  }

  return options;
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

function getMessageType(message) {
  const text = message.toLowerCase();

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
    text.includes("no trabaja");

  const isSuccess = text.includes("correctamente");

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

const timeOptions = generateTimeOptions();

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

export default function AgendaPage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [clients, setClients] = useState([]);
  const [staff, setStaff] = useState([]);
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [staffSchedules, setStaffSchedules] = useState([]);
  const [timeBlocks, setTimeBlocks] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayISO());

  const [activeSuggestion, setActiveSuggestion] = useState({});
  const [closedSuggestions, setClosedSuggestions] = useState({});

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
    }
  }, [selectedDate, loadingSession]);

  const loadInitialData = async () => {
    setLoadingData(true);
    setMessage("");

    const [
      clientsResult,
      staffResult,
      servicesResult,
      schedulesResult,
    ] = await Promise.all([
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
    setLoadingData(false);
  };

  const loadDateData = async (date) => {
    setMessage("");

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
            notes,
            status,
            services (
              name,
              category
            ),
            staff (
              full_name
            )
          )
        `
        )
        .eq("appointment_date", date)
        .order("start_time", { ascending: true }),
      supabase
        .from("staff_time_blocks")
        .select("*, staff(full_name)")
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
          )}. El servicio ${getServiceName(line.service_id)} queda fuera de horario.`,
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
      return status !== "cancelada" && status !== "cancelado";
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
  };

  const handleSubmit = async () => {
    setSaving(true);
    setMessage("Validando disponibilidad...");

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

    setMessage("Guardando cita...");

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

    const { data: appointment, error: appointmentError } = await supabase
      .from("appointments")
      .insert([appointmentData])
      .select()
      .single();

    if (appointmentError) {
      setMessage(`No se pudo guardar la cita: ${appointmentError.message}`);
      setSaving(false);
      return;
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
        `La cita se creó, pero no se pudieron guardar los servicios: ${servicesError.message}`
      );
      setSaving(false);
      return;
    }

    setSelectedDate(form.appointment_date);
    await loadDateData(form.appointment_date);
    resetForm();
    setMessage("Cita registrada correctamente ✨");
    setSaving(false);
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/admin";
  };

  if (loadingSession) {
    return (
      <main className="min-h-screen bg-[#fdf8f6] px-6 py-10 text-[#352829]">
        <p>Cargando...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#fcf7f6] to-[#f6e9e6] px-4 py-8 text-[#352829] md:px-8">
      <section className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.08)] md:flex-row md:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[#bd7b83]">
              Sistema interno
            </p>
            <h1 className="mt-3 text-4xl font-light">Agenda</h1>
            <p className="mt-2 text-sm text-[#6d5a58]">
              Agenda citas validando horarios, descansos, bloqueos y empalmes.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href="/admin"
              className="rounded-full border border-[#bd7b83] px-6 py-3 text-center text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
            >
              Volver al panel
            </a>

            <button
              onClick={handleLogout}
              className="rounded-full bg-[#f2e4e1] px-6 py-3 text-[#8a5f63] transition hover:bg-[#edd8d4]"
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        <div className="grid gap-8 2xl:grid-cols-[0.95fr_1.05fr]">
          <div className="h-fit rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.10)]">
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              Nueva cita
            </p>

            <h2 className="mt-3 text-2xl font-light">
              Registrar cita con servicios
            </h2>

            <div className="mt-6 space-y-5">
              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Clienta *
                </label>
                <select
                  name="client_id"
                  value={form.client_id}
                  onChange={handleFormChange}
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
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
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Fecha *
                </label>
                <input
                  type="date"
                  name="appointment_date"
                  value={form.appointment_date}
                  onChange={handleFormChange}
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                />
              </div>

              <div className="rounded-[1.5rem] bg-[#fcf7f6] p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                      Servicios de la cita
                    </p>
                    <p className="mt-1 text-sm text-[#6d5a58]">
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

                    const currentActiveSuggestion =
                      activeSuggestion[index] || 0;

                    return (
                      <div
                        key={index}
                        className="rounded-2xl border border-[#ead2cf] bg-white p-4"
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <h3 className="font-medium text-[#352829]">
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
                            <label className="mb-2 block text-sm text-[#6d5a58]">
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
                                handleServiceSearchKeyDown(
                                  event,
                                  index,
                                  matches
                                )
                              }
                              className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                              placeholder="Ej. softgel, pedi, cejas, pies..."
                            />

                            {shouldShowMatches && (
                              <div className="absolute z-20 mt-2 max-h-[520px] w-full overflow-auto rounded-2xl border border-[#ead2cf] bg-white p-2 shadow-xl">
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
                                          ? "bg-[#fcf0ef]"
                                          : "hover:bg-[#fcf0ef]"
                                      }`}
                                    >
                                      <span className="block font-medium text-[#352829]">
                                        {service.name} - ${service.base_price}
                                      </span>
                                      <span className="text-xs text-[#6d5a58]">
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
                            <label className="mb-2 block text-sm text-[#6d5a58]">
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
                              className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
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
                            <label className="mb-2 block text-sm text-[#6d5a58]">
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
                              className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
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
                            <label className="mb-2 block text-sm text-[#6d5a58]">
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
                              className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
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
                            <label className="mb-2 block text-sm text-[#6d5a58]">
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
                                className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-8 py-3 outline-none"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="mb-2 block text-sm text-[#6d5a58]">
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
                              className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                            />
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-sm text-[#6d5a58]">
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
                              className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm text-[#6d5a58]">
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
                              className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                            />
                          </div>
                        </div>

                        <div className="mt-4">
                          <label className="mb-2 block text-sm text-[#6d5a58]">
                            Notas del servicio
                          </label>
                          <textarea
                            value={line.notes}
                            onChange={(event) =>
                              handleServiceLineChange(
                                index,
                                "notes",
                                event.target.value
                              )
                            }
                            className="min-h-20 w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                            placeholder="Diseño, detalles, observaciones..."
                          />
                        </div>

                        {selectedService?.pricing_notes && (
                          <p className="mt-3 rounded-xl bg-[#fcf0ef] p-3 text-sm text-[#8a5f63]">
                            {selectedService.pricing_notes}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm text-[#6d5a58]">
                    Total estimado
                  </label>
                  <div className="rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 text-lg text-[#352829]">
                    ${estimatedTotal}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#6d5a58]">
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
                      className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-8 py-3 outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#6d5a58]">
                    Método anticipo
                  </label>
                  <select
                    name="deposit_payment_method"
                    value={form.deposit_payment_method}
                    onChange={handleFormChange}
                    className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  >
                    <option value="">Sin anticipo</option>
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Tarjeta">Tarjeta</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Notas generales
                </label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleFormChange}
                  className="min-h-24 w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  placeholder="Notas generales de la cita..."
                />
              </div>

              <label className="flex items-center gap-2 rounded-2xl bg-[#fcf7f6] p-4 text-sm text-[#6d5a58]">
                <input
                  type="checkbox"
                  name="force_created"
                  checked={form.force_created}
                  onChange={handleFormChange}
                />
                Forzar cita fuera de horario o disponibilidad
              </label>

              <div className="relative">
                {message && (
                  <div
                    className={`mb-3 rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(
                      message
                    )}`}
                  >
                    {message}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                  className="w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Guardar cita"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.10)]">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
                  Vista diaria
                </p>
                <h2 className="mt-3 text-2xl font-light">
                  Servicios, comidas y bloqueos
                </h2>
                <p className="mt-2 text-sm text-[#6d5a58]">
                  Citas del día: {appointments.length} · Bloqueos:{" "}
                  {timeBlocks.length}
                </p>
              </div>

              <input
                type="date"
                value={selectedDate}
                onChange={(event) => {
                  setSelectedDate(event.target.value);
                  setForm((current) => ({
                    ...current,
                    appointment_date: event.target.value,
                  }));
                }}
                className="rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
              />
            </div>

            {loadingData ? (
              <p className="mt-6 text-sm text-[#6d5a58]">Cargando agenda...</p>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {staff.map((person) => (
                  <div
                    key={person.id}
                    className="rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] p-4"
                  >
                    <h3 className="text-lg font-light">{person.full_name}</h3>

                    <div className="mt-4 space-y-3">
                      {(appointmentsByStaff[person.id] || []).length === 0 ? (
                        <p className="rounded-xl bg-white p-3 text-sm text-[#6d5a58]">
                          Sin servicios ni bloqueos.
                        </p>
                      ) : (
                        appointmentsByStaff[person.id].map((item) => {
                          if (item.isBlock) {
                            return (
                              <div
                                key={item.id}
                                className="rounded-xl border border-[#f1c7c7] bg-red-50 p-4 text-sm shadow-sm"
                              >
                                <p className="font-medium text-red-700">
                                  {formatTime(item.start_time)}
                                  {item.end_time
                                    ? ` - ${formatTime(item.end_time)}`
                                    : ""}
                                </p>

                                <p className="mt-2 text-red-700">
                                  {item.block.title || "Bloqueo"}
                                </p>

                                <p className="text-red-600">
                                  Tipo: {item.block.block_type || "bloqueo"}
                                </p>

                                {item.block.notes && (
                                  <p className="mt-3 rounded-xl bg-white p-3 text-red-700">
                                    {item.block.notes}
                                  </p>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div
                              key={item.id}
                              className="rounded-xl bg-white p-4 text-sm shadow-sm"
                            >
                              <p className="font-medium text-[#352829]">
                                {formatTime(item.start_time)}
                                {item.end_time
                                  ? ` - ${formatTime(item.end_time)}`
                                  : ""}
                              </p>

                              <p className="mt-2 text-[#352829]">
                                {item.appointment.clients?.full_name ||
                                  "Sin clienta"}
                              </p>

                              <p className="text-[#6d5a58]">
                                WhatsApp:{" "}
                                {item.appointment.clients?.phone || "-"}
                              </p>

                              <p className="mt-2 text-[#352829]">
                                {item.services?.name || "Servicio"}
                              </p>

                              <p className="text-[#6d5a58]">
                                ${item.total_price || item.price || 0}
                              </p>

                              {item.appointment.deposit_amount > 0 && (
                                <p className="mt-2 text-[#6d5a58]">
                                  Anticipo cita: $
                                  {item.appointment.deposit_amount} ·{" "}
                                  {item.appointment.deposit_payment_method}
                                </p>
                              )}

                              {item.appointment.force_created && (
                                <p className="mt-2 rounded-full bg-[#fcf0ef] px-3 py-1 text-xs text-[#8a5f63]">
                                  Cita forzada
                                </p>
                              )}

                              {item.notes && (
                                <p className="mt-3 rounded-xl bg-[#fcf7f6] p-3 text-[#6d5a58]">
                                  {item.notes}
                                </p>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}