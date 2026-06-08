"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import AdminShell from "../components/AdminShell";

const days = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

const incidenceTypes = [
  { value: "vacaciones", label: "Vacaciones" },
  { value: "permiso_con_goce", label: "Permiso con goce" },
  { value: "permiso_sin_goce", label: "Permiso sin goce" },
  { value: "falta", label: "Falta" },
  { value: "retardo", label: "Retardo" },
  { value: "salida_temprano", label: "Salida temprano" },
  { value: "incapacidad", label: "Incapacidad" },
  { value: "descanso_trabajado", label: "Descanso trabajado" },
  { value: "otro", label: "Otro" },
];

const staffMenuItems = [
  { key: "colaboradores", label: "Colaboradores" },
  { key: "agregar", label: "Agregar colaborador" },
  { key: "bloqueos", label: "Bloqueos / comida" },
  { key: "incidencias", label: "Incidencias" },
];

function generateTimeOptions() {
  const options = [];
  const startHour = 6;
  const endHour = 23;

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

const timeOptions = generateTimeOptions();

const emptyStaffForm = {
  full_name: "",
  email: "",
  phone: "",
  birthday: "",
  hire_date: "",
  vacation_days_adjustment: "",
  vacation_notes: "",
  service_commission_percentage: "",
  product_commission_percentage: "",
  commission_notes: "",
  product_commission_notes: "",
  role: "tecnica",
  color: "#bd7b83",
  notes: "",
  active: true,
};

const emptyBlockForm = {
  staff_id: "",
  block_date: new Date().toISOString().slice(0, 10),
  start_time: "14:00",
  end_time: "14:40",
  block_type: "comida",
  title: "Comida",
  notes: "",
};

const emptyIncidenceForm = {
  staff_id: "",
  event_type: "vacaciones",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: new Date().toISOString().slice(0, 10),
  days_taken: "1",
  minutes_late: "0",
  affects_vacation_balance: true,
  discount_amount: "0",
  status: "tomada",
  reason: "Vacaciones",
  notes: "",
};

const defaultWeekSchedule = days.map((day) => ({
  day_of_week: day.value,
  label: day.label,
  is_active: false,
  is_day_off: false,
  start_time: "09:00",
  end_time: "18:00",
  has_break: false,
  break_start: "14:00",
  break_end: "15:00",
}));

function getMessageType(message) {
  const text = String(message || "").toLowerCase();

  const isError =
    text.includes("no se pudo") ||
    text.includes("error") ||
    text.includes("obligatorio") ||
    text.includes("obligatorios") ||
    text.includes("faltan") ||
    text.includes("selecciona") ||
    text.includes("no puedes") ||
    text.includes("no es posible") ||
    text.includes("relacionadas") ||
    text.includes("citas");

  const isSuccess =
    text.includes("correctamente") ||
    text.includes("activado") ||
    text.includes("activada") ||
    text.includes("desactivado") ||
    text.includes("desactivada") ||
    text.includes("eliminado") ||
    text.includes("eliminada");

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

function formatTime(time) {
  if (!time) return "";
  return time.slice(0, 5);
}

function getDayLabel(value) {
  return days.find((day) => Number(day.value) === Number(value))?.label || "";
}

function getIncidenceLabel(value) {
  return (
    incidenceTypes.find((type) => type.value === value)?.label || "Incidencia"
  );
}

function calculateYearsWorked(hireDate) {
  if (!hireDate) return 0;

  const start = new Date(`${hireDate}T00:00:00`);
  const today = new Date();

  let years = today.getFullYear() - start.getFullYear();
  const monthDiff = today.getMonth() - start.getMonth();
  const dayDiff = today.getDate() - start.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    years -= 1;
  }

  return Math.max(0, years);
}

function getEntitledVacationDays(yearsWorked, policies) {
  if (yearsWorked < 1) return 0;

  const policy = policies.find((item) => {
    const from = Number(item.years_from);
    const to = item.years_to === null ? 999 : Number(item.years_to);
    return yearsWorked >= from && yearsWorked <= to && item.active;
  });

  return Number(policy?.days_entitled || 0);
}

function TimeSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
    >
      <option value="">Hora</option>
      {timeOptions.map((time) => (
        <option key={time} value={time}>
          {time}
        </option>
      ))}
    </select>
  );
}

function SectionToast({ message }) {
  if (!message) return null;

  return (
    <div
      className={`mb-3 rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(
        message
      )}`}
    >
      {message}
    </div>
  );
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

export default function TecnicasPage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);

  const [activeSection, setActiveSection] = useState("colaboradores");

  const [savingStaff, setSavingStaff] = useState(false);
  const [savingBlock, setSavingBlock] = useState(false);
  const [savingIncidence, setSavingIncidence] = useState(false);

  const [staffMessage, setStaffMessage] = useState("");
  const [blockMessage, setBlockMessage] = useState("");
  const [incidenceMessage, setIncidenceMessage] = useState("");
  const [listMessage, setListMessage] = useState("");

  const [staff, setStaff] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [incidences, setIncidences] = useState([]);
  const [vacationPolicies, setVacationPolicies] = useState([]);

  const [staffSearch, setStaffSearch] = useState("");
  const [blockDateFilter, setBlockDateFilter] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const [editingStaffId, setEditingStaffId] = useState(null);
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [editingIncidenceId, setEditingIncidenceId] = useState(null);

  const [staffForm, setStaffForm] = useState(emptyStaffForm);
  const [weekSchedule, setWeekSchedule] = useState(defaultWeekSchedule);

  const [blockForm, setBlockForm] = useState(emptyBlockForm);
  const [incidenceForm, setIncidenceForm] = useState(emptyIncidenceForm);

  useEffect(() => {
    const start = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        window.location.href = "/admin";
        return;
      }

      setLoadingSession(false);
      await loadData();
    };

    start();
  }, []);

  useEffect(() => {
    if (!staffMessage) return;

    const timer = setTimeout(() => {
      setStaffMessage("");
    }, 15000);

    return () => clearTimeout(timer);
  }, [staffMessage]);

  useEffect(() => {
    if (!blockMessage) return;

    const timer = setTimeout(() => {
      setBlockMessage("");
    }, 15000);

    return () => clearTimeout(timer);
  }, [blockMessage]);

  useEffect(() => {
    if (!incidenceMessage) return;

    const timer = setTimeout(() => {
      setIncidenceMessage("");
    }, 15000);

    return () => clearTimeout(timer);
  }, [incidenceMessage]);

  useEffect(() => {
    if (!listMessage) return;

    const timer = setTimeout(() => {
      setListMessage("");
    }, 15000);

    return () => clearTimeout(timer);
  }, [listMessage]);

  const clearMessagesExcept = (section) => {
    if (section !== "staff") setStaffMessage("");
    if (section !== "block") setBlockMessage("");
    if (section !== "incidence") setIncidenceMessage("");
    if (section !== "list") setListMessage("");
  };

  const loadData = async () => {
    setLoadingData(true);

    const [
      staffResult,
      schedulesResult,
      blocksResult,
      incidencesResult,
      policiesResult,
    ] = await Promise.all([
      supabase.from("staff").select("*").order("full_name"),
      supabase
        .from("staff_schedules")
        .select("*, staff(full_name)")
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true }),
      supabase
        .from("staff_time_blocks")
        .select("*, staff(full_name)")
        .order("block_date", { ascending: false })
        .order("start_time", { ascending: true }),
      supabase
        .from("staff_vacations")
        .select("*, staff(full_name)")
        .order("start_date", { ascending: false }),
      supabase
        .from("vacation_policies")
        .select("*")
        .eq("active", true)
        .order("years_from", { ascending: true }),
    ]);

    if (staffResult.error) {
      setListMessage(
        `Error al cargar colaboradores: ${staffResult.error.message}`
      );
    } else {
      setStaff(staffResult.data || []);
    }

    if (schedulesResult.error) {
      setListMessage(
        `Error al cargar horarios: ${schedulesResult.error.message}`
      );
    } else {
      setSchedules(schedulesResult.data || []);
    }

    if (blocksResult.error) {
      setListMessage(`Error al cargar bloqueos: ${blocksResult.error.message}`);
    } else {
      setBlocks(blocksResult.data || []);
    }

    if (incidencesResult.error) {
      setListMessage(
        `Error al cargar incidencias: ${incidencesResult.error.message}`
      );
    } else {
      setIncidences(incidencesResult.data || []);
    }

    if (policiesResult.error) {
      setListMessage(
        `Error al cargar políticas: ${policiesResult.error.message}`
      );
    } else {
      setVacationPolicies(policiesResult.data || []);
    }

    setLoadingData(false);
  };
    const loadWeekScheduleForStaff = (staffId) => {
    const personSchedules = schedules.filter(
      (schedule) => schedule.staff_id === staffId
    );

    const updatedWeek = defaultWeekSchedule.map((day) => {
      const saved = personSchedules.find(
        (schedule) => Number(schedule.day_of_week) === Number(day.day_of_week)
      );

      if (!saved) return { ...day };

      return {
        ...day,
        is_active: Boolean(saved.is_active),
        is_day_off: Boolean(saved.is_day_off),
        start_time: formatTime(saved.start_time) || "09:00",
        end_time: formatTime(saved.end_time) || "18:00",
        has_break: Boolean(saved.has_break),
        break_start: formatTime(saved.break_start) || "14:00",
        break_end: formatTime(saved.break_end) || "15:00",
      };
    });

    setWeekSchedule(updatedWeek);
  };

  const filteredStaff = useMemo(() => {
    const term = staffSearch.toLowerCase().trim();

    if (!term) return staff;

    return staff.filter((person) => {
      return (
        person.full_name?.toLowerCase().includes(term) ||
        person.email?.toLowerCase().includes(term) ||
        person.phone?.toLowerCase().includes(term) ||
        person.role?.toLowerCase().includes(term)
      );
    });
  }, [staff, staffSearch]);

  const filteredBlocks = useMemo(() => {
    return blocks.filter((block) => block.block_date === blockDateFilter);
  }, [blocks, blockDateFilter]);

  const schedulesByStaff = useMemo(() => {
    const result = {};

    staff.forEach((person) => {
      result[person.id] = schedules.filter(
        (schedule) => schedule.staff_id === person.id
      );
    });

    return result;
  }, [staff, schedules]);

  const incidencesByStaff = useMemo(() => {
    const result = {};

    staff.forEach((person) => {
      result[person.id] = incidences.filter(
        (incidence) => incidence.staff_id === person.id
      );
    });

    return result;
  }, [staff, incidences]);

  const incidenceSummary = useMemo(() => {
    return incidences.reduce(
      (summary, item) => {
        if (item.status === "cancelada") return summary;

        const type = item.event_type || "vacaciones";

        summary.total += 1;
        summary[type] = (summary[type] || 0) + 1;

        if (type === "retardo") {
          summary.minutesLate += Number(item.minutes_late || 0);
        }

        if (type === "falta") {
          summary.absenceDays += Number(item.days_taken || 0);
        }

        return summary;
      },
      { total: 0, minutesLate: 0, absenceDays: 0 }
    );
  }, [incidences]);

  const getVacationSummary = (person) => {
    const yearsWorked = calculateYearsWorked(person.hire_date);
    const entitledDays = getEntitledVacationDays(yearsWorked, vacationPolicies);
    const adjustment = Number(person.vacation_days_adjustment || 0);

    const usedDays = (incidencesByStaff[person.id] || [])
      .filter(
        (incidence) =>
          incidence.status !== "cancelada" &&
          Boolean(incidence.affects_vacation_balance)
      )
      .reduce((sum, incidence) => sum + Number(incidence.days_taken || 0), 0);

    return {
      yearsWorked,
      entitledDays,
      adjustment,
      usedDays,
      availableDays: entitledDays + adjustment - usedDays,
    };
  };

  const handleStaffChange = (event) => {
    const { name, value, type, checked } = event.target;

    setStaffForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleWeekChange = (index, field, value) => {
    setWeekSchedule((current) => {
      const updated = [...current];
      const day = { ...updated[index], [field]: value };

      if (field === "is_active" && value === true) {
        day.is_day_off = false;
      }

      if (field === "is_day_off" && value === true) {
        day.is_active = true;
        day.has_break = false;
      }

      updated[index] = day;
      return updated;
    });
  };

  const copyFirstActiveScheduleToAllDays = () => {
    const sourceDay =
      weekSchedule.find((day) => day.is_active) || weekSchedule[0];

    if (!sourceDay) {
      setStaffMessage("No hay horario base para copiar.");
      return;
    }

    setWeekSchedule((current) =>
      current.map((day) => ({
        ...day,
        is_active: true,
        is_day_off: false,
        start_time: sourceDay.start_time || "09:00",
        end_time: sourceDay.end_time || "18:00",
        has_break: Boolean(sourceDay.has_break),
        break_start: sourceDay.break_start || "14:00",
        break_end: sourceDay.break_end || "15:00",
      }))
    );

    setStaffMessage(
      "Horario copiado correctamente a todos los días. Ahora puedes ajustar días individuales ✨"
    );
  };

  const handleBlockChange = (event) => {
    const { name, value } = event.target;

    setBlockForm((current) => ({
      ...current,
      [name]: value,
    }));

    if (name === "block_date") {
      setBlockDateFilter(value);
    }

    if (name === "block_type") {
      const titles = {
        comida: "Comida",
        descanso: "Descanso",
        personal: "Bloqueo personal",
        bloqueo: "Bloqueo",
      };

      setBlockForm((current) => ({
        ...current,
        block_type: value,
        title: titles[value] || "Bloqueo",
      }));
    }
  };

  const handleIncidenceChange = (event) => {
    const { name, value, type, checked } = event.target;

    setIncidenceForm((current) => {
      const next = {
        ...current,
        [name]: type === "checkbox" ? checked : value,
      };

      if (name === "event_type") {
        const labels = {
          vacaciones: "Vacaciones",
          permiso_con_goce: "Permiso con goce",
          permiso_sin_goce: "Permiso sin goce",
          falta: "Falta",
          retardo: "Retardo",
          salida_temprano: "Salida temprano",
          incapacidad: "Incapacidad",
          descanso_trabajado: "Descanso trabajado",
          otro: "Otro",
        };

        next.reason = labels[value] || "Incidencia";
        next.affects_vacation_balance = value === "vacaciones";
        next.days_taken = value === "retardo" ? "0" : "1";
        next.minutes_late = value === "retardo" ? "10" : "0";
      }

      return next;
    });
  };

  const resetStaffForm = () => {
    setStaffForm(emptyStaffForm);
    setWeekSchedule(defaultWeekSchedule);
    setEditingStaffId(null);
  };

  const openNewStaffForm = () => {
    resetStaffForm();
    clearMessagesExcept("staff");
    setStaffMessage("");
    setActiveSection("agregar");
  };

  const closeStaffForm = () => {
    resetStaffForm();
    setStaffMessage("");
    setActiveSection("colaboradores");
  };

  const resetBlockForm = () => {
    setBlockForm({
      ...emptyBlockForm,
      block_date: blockDateFilter,
    });
    setEditingBlockId(null);
  };

  const resetIncidenceForm = () => {
    setIncidenceForm(emptyIncidenceForm);
    setEditingIncidenceId(null);
  };

  const handleEditStaff = (person) => {
    setEditingStaffId(person.id);
    clearMessagesExcept("staff");
    setStaffMessage("");

    setStaffForm({
      full_name: person.full_name || "",
      email: person.email || "",
      phone: person.phone || "",
      birthday: person.birthday || "",
      hire_date: person.hire_date || "",
      vacation_days_adjustment: person.vacation_days_adjustment ?? "",
      vacation_notes: person.vacation_notes || "",
      service_commission_percentage:
        person.service_commission_percentage ??
        person.commission_percentage ??
        "",
      product_commission_percentage: person.product_commission_percentage ?? "",
      commission_notes: person.commission_notes || "",
      product_commission_notes: person.product_commission_notes || "",
      role: person.role || "tecnica",
      color: person.color || "#bd7b83",
      notes: person.notes || "",
      active: Boolean(person.active),
    });

    loadWeekScheduleForStaff(person.id);
    setActiveSection("agregar");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveStaffSchedule = async (staffId) => {
    const { error: deleteError } = await supabase
      .from("staff_schedules")
      .delete()
      .eq("staff_id", staffId);

    if (deleteError) {
      return deleteError;
    }

    const rows = weekSchedule.map((day) => ({
      staff_id: staffId,
      day_of_week: Number(day.day_of_week),
      start_time: day.start_time || "09:00",
      end_time: day.end_time || "18:00",
      is_active: Boolean(day.is_active),
      is_day_off: Boolean(day.is_day_off),
      has_break: Boolean(day.has_break),
      break_start: day.has_break ? day.break_start || null : null,
      break_end: day.has_break ? day.break_end || null : null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("staff_schedules").insert(rows);

    return error;
  };

  const handleSaveStaff = async () => {
    setSavingStaff(true);
    clearMessagesExcept("staff");
    setStaffMessage("Guardando colaborador...");

    if (!staffForm.full_name.trim()) {
      setStaffMessage("El nombre del colaborador es obligatorio.");
      setSavingStaff(false);
      return;
    }

    const serviceCommission = Number(
      staffForm.service_commission_percentage || 0
    );
    const productCommission = Number(
      staffForm.product_commission_percentage || 0
    );

    const staffData = {
      full_name: staffForm.full_name.trim(),
      email: staffForm.email.trim() || null,
      phone: staffForm.phone.trim() || null,
      birthday: staffForm.birthday || null,
      hire_date: staffForm.hire_date || null,
      vacation_days_adjustment: Number(staffForm.vacation_days_adjustment || 0),
      vacation_notes: staffForm.vacation_notes.trim() || null,
      commission_percentage: serviceCommission,
      service_commission_percentage: serviceCommission,
      product_commission_percentage: productCommission,
      commission_notes: staffForm.commission_notes.trim() || null,
      product_commission_notes: staffForm.product_commission_notes.trim() || null,
      role: staffForm.role.trim() || "tecnica",
      color: staffForm.color || "#bd7b83",
      notes: staffForm.notes.trim() || null,
      active: staffForm.active,
      updated_at: new Date().toISOString(),
    };

    if (editingStaffId) {
      const { error } = await supabase
        .from("staff")
        .update(staffData)
        .eq("id", editingStaffId);

      if (error) {
        setStaffMessage(
          `No se pudo actualizar el colaborador: ${error.message}`
        );
        setSavingStaff(false);
        return;
      }

      const scheduleError = await saveStaffSchedule(editingStaffId);

      if (scheduleError) {
        setStaffMessage(
          `El colaborador se actualizó, pero no se pudo guardar el horario: ${scheduleError.message}`
        );
        setSavingStaff(false);
        return;
      }

      await loadData();
      resetStaffForm();
      setStaffMessage("Colaborador y horario actualizados correctamente ✨");
      setSavingStaff(false);
      setActiveSection("colaboradores");
      return;
    }

    const { data: createdStaff, error } = await supabase
      .from("staff")
      .insert([staffData])
      .select()
      .single();

    if (error) {
      setStaffMessage(`No se pudo crear el colaborador: ${error.message}`);
      setSavingStaff(false);
      return;
    }

    const scheduleError = await saveStaffSchedule(createdStaff.id);

    if (scheduleError) {
      setStaffMessage(
        `El colaborador se creó, pero no se pudo guardar el horario: ${scheduleError.message}`
      );
      setSavingStaff(false);
      return;
    }

    await loadData();
    resetStaffForm();
    setStaffMessage("Colaborador y horario creados correctamente ✨");
    setSavingStaff(false);
    setActiveSection("colaboradores");
  };
    const toggleStaffActive = async (person) => {
    clearMessagesExcept("list");
    setListMessage("Actualizando colaborador...");

    const { error } = await supabase
      .from("staff")
      .update({
        active: !Boolean(person.active),
        updated_at: new Date().toISOString(),
      })
      .eq("id", person.id);

    if (error) {
      setListMessage(`No se pudo cambiar el estado: ${error.message}`);
      return;
    }

    await loadData();

    setListMessage(
      person.active
        ? "Colaborador desactivado correctamente."
        : "Colaborador activado correctamente ✨"
    );
  };

  const deleteStaff = async (person) => {
    const confirmDelete = window.confirm(
      `¿Seguro que deseas eliminar a ${person.full_name}? Si tiene citas relacionadas, lo recomendable es desactivarlo para conservar el historial.`
    );

    if (!confirmDelete) return;

    clearMessagesExcept("list");
    setListMessage("Validando si el colaborador tiene citas relacionadas...");

    const { count, error: countError } = await supabase
      .from("appointment_services")
      .select("*", { count: "exact", head: true })
      .eq("staff_id", person.id);

    if (countError) {
      setListMessage(
        `No se pudo validar si tiene citas relacionadas: ${countError.message}`
      );
      return;
    }

    if ((count || 0) > 0) {
      setListMessage(
        "No es posible eliminar este colaborador porque tiene citas relacionadas. Puedes desactivarlo para conservar el historial."
      );
      return;
    }

    const { error: schedulesError } = await supabase
      .from("staff_schedules")
      .delete()
      .eq("staff_id", person.id);

    if (schedulesError) {
      setListMessage(
        `No se pudieron eliminar sus horarios: ${schedulesError.message}`
      );
      return;
    }

    const { error: blocksError } = await supabase
      .from("staff_time_blocks")
      .delete()
      .eq("staff_id", person.id);

    if (blocksError) {
      setListMessage(
        `No se pudieron eliminar sus bloqueos: ${blocksError.message}`
      );
      return;
    }

    const { error: incidencesError } = await supabase
      .from("staff_vacations")
      .delete()
      .eq("staff_id", person.id);

    if (incidencesError) {
      setListMessage(
        `No se pudieron eliminar sus incidencias: ${incidencesError.message}`
      );
      return;
    }

    const { error } = await supabase.from("staff").delete().eq("id", person.id);

    if (error) {
      setListMessage(`No se pudo eliminar el colaborador: ${error.message}`);
      return;
    }

    await loadData();
    setListMessage("Colaborador eliminado correctamente.");
  };

  const handleEditBlock = (block) => {
    setEditingBlockId(block.id);
    clearMessagesExcept("block");
    setBlockMessage("");

    setBlockForm({
      staff_id: block.staff_id || "",
      block_date: block.block_date || blockDateFilter,
      start_time: formatTime(block.start_time) || "14:00",
      end_time: formatTime(block.end_time) || "14:40",
      block_type: block.block_type || "bloqueo",
      title: block.title || "Bloqueo",
      notes: block.notes || "",
    });

    setBlockDateFilter(block.block_date || blockDateFilter);
    setActiveSection("bloqueos");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSaveBlock = async () => {
    setSavingBlock(true);
    clearMessagesExcept("block");
    setBlockMessage("Guardando bloqueo...");

    if (
      !blockForm.staff_id ||
      !blockForm.block_date ||
      !blockForm.start_time ||
      !blockForm.end_time ||
      !blockForm.title.trim()
    ) {
      setBlockMessage(
        "Colaborador, fecha, hora y título del bloqueo son obligatorios."
      );
      setSavingBlock(false);
      return;
    }

    const blockData = {
      staff_id: blockForm.staff_id,
      block_date: blockForm.block_date,
      start_time: blockForm.start_time,
      end_time: blockForm.end_time,
      block_type: blockForm.block_type || "bloqueo",
      title: blockForm.title.trim(),
      notes: blockForm.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (editingBlockId) {
      const { error } = await supabase
        .from("staff_time_blocks")
        .update(blockData)
        .eq("id", editingBlockId);

      if (error) {
        setBlockMessage(`No se pudo actualizar el bloqueo: ${error.message}`);
        setSavingBlock(false);
        return;
      }

      await loadData();
      resetBlockForm();
      setBlockMessage("Bloqueo actualizado correctamente ✨");
      setSavingBlock(false);
      return;
    }

    const { error } = await supabase
      .from("staff_time_blocks")
      .insert([blockData]);

    if (error) {
      setBlockMessage(`No se pudo crear el bloqueo: ${error.message}`);
      setSavingBlock(false);
      return;
    }

    await loadData();
    resetBlockForm();
    setBlockMessage("Bloqueo creado correctamente ✨");
    setSavingBlock(false);
  };

  const deleteBlock = async (block) => {
    clearMessagesExcept("list");
    setListMessage("Eliminando bloqueo...");

    const { error } = await supabase
      .from("staff_time_blocks")
      .delete()
      .eq("id", block.id);

    if (error) {
      setListMessage(`No se pudo eliminar el bloqueo: ${error.message}`);
      return;
    }

    await loadData();
    setListMessage("Bloqueo eliminado correctamente.");
  };

  const handleEditIncidence = (incidence) => {
    setEditingIncidenceId(incidence.id);
    clearMessagesExcept("incidence");
    setIncidenceMessage("");

    setIncidenceForm({
      staff_id: incidence.staff_id || "",
      event_type: incidence.event_type || "vacaciones",
      start_date: incidence.start_date || "",
      end_date: incidence.end_date || "",
      days_taken: incidence.days_taken ?? "0",
      minutes_late: incidence.minutes_late ?? "0",
      affects_vacation_balance: Boolean(incidence.affects_vacation_balance),
      discount_amount: incidence.discount_amount ?? "0",
      status: incidence.status || "tomada",
      reason: incidence.reason || getIncidenceLabel(incidence.event_type),
      notes: incidence.notes || "",
    });

    setActiveSection("incidencias");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSaveIncidence = async () => {
    setSavingIncidence(true);
    clearMessagesExcept("incidence");
    setIncidenceMessage("Guardando incidencia...");

    if (
      !incidenceForm.staff_id ||
      !incidenceForm.event_type ||
      !incidenceForm.start_date ||
      !incidenceForm.end_date
    ) {
      setIncidenceMessage(
        "Colaborador, tipo de incidencia y fechas son obligatorios."
      );
      setSavingIncidence(false);
      return;
    }

    const incidenceData = {
      staff_id: incidenceForm.staff_id,
      event_type: incidenceForm.event_type,
      start_date: incidenceForm.start_date,
      end_date: incidenceForm.end_date,
      days_taken: Number(incidenceForm.days_taken || 0),
      minutes_late: Number(incidenceForm.minutes_late || 0),
      affects_vacation_balance: Boolean(
        incidenceForm.affects_vacation_balance
      ),
      discount_amount: Number(incidenceForm.discount_amount || 0),
      status: incidenceForm.status || "tomada",
      reason: incidenceForm.reason.trim() || null,
      notes: incidenceForm.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (editingIncidenceId) {
      const { error } = await supabase
        .from("staff_vacations")
        .update(incidenceData)
        .eq("id", editingIncidenceId);

      if (error) {
        setIncidenceMessage(
          `No se pudo actualizar la incidencia: ${error.message}`
        );
        setSavingIncidence(false);
        return;
      }

      await loadData();
      resetIncidenceForm();
      setIncidenceMessage("Incidencia actualizada correctamente ✨");
      setSavingIncidence(false);
      return;
    }

    const { error } = await supabase
      .from("staff_vacations")
      .insert([incidenceData]);

    if (error) {
      setIncidenceMessage(
        `No se pudo registrar la incidencia: ${error.message}`
      );
      setSavingIncidence(false);
      return;
    }

    await loadData();
    resetIncidenceForm();
    setIncidenceMessage("Incidencia registrada correctamente ✨");
    setSavingIncidence(false);
  };

  const deleteIncidence = async (incidence) => {
    clearMessagesExcept("list");
    setListMessage("Eliminando incidencia...");

    const { error } = await supabase
      .from("staff_vacations")
      .delete()
      .eq("id", incidence.id);

    if (error) {
      setListMessage(`No se pudo eliminar la incidencia: ${error.message}`);
      return;
    }

    await loadData();
    setListMessage("Incidencia eliminada correctamente.");
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
      title="Técnicas / Personal"
      subtitle="Colaboradores, horarios, descansos, comisiones, vacaciones e incidencias."
      activeModule="tecnicas"
      menuItems={staffMenuItems}
      activeSection={activeSection}
      setActiveSection={setActiveSection}
    >
      {listMessage && (
        <div
          className={`mb-6 rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(
            listMessage
          )}`}
        >
          {listMessage}
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Colaboradores
          </p>
          <p className="mt-3 text-4xl font-light">{staff.length}</p>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Incidencias
          </p>
          <p className="mt-3 text-4xl font-light">{incidenceSummary.total}</p>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Retardos
          </p>
          <p className="mt-3 text-4xl font-light">
            {incidenceSummary.retardo || 0}
          </p>
          <p className="mt-2 text-sm text-[#68777c]">
            {incidenceSummary.minutesLate} min acumulados
          </p>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Vacaciones
          </p>
          <p className="mt-3 text-4xl font-light">
            {incidenceSummary.vacaciones || 0}
          </p>
        </Card>
      </div>
            {activeSection === "colaboradores" && (
        <Card>
          <SectionHeader
            eyebrow="Personal"
            title="Colaboradores registrados"
            description={`Total: ${staff.length}`}
            action={
              <button
                type="button"
                onClick={openNewStaffForm}
                className="rounded-full bg-[#bd7b83] px-6 py-3 text-sm text-white transition hover:opacity-90"
              >
                Agregar colaborador
              </button>
            }
          />

          <input
            value={staffSearch}
            onChange={(event) => setStaffSearch(event.target.value)}
            className="mb-6 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
            placeholder="Buscar colaborador..."
          />

          {loadingData ? (
            <p className="text-sm text-[#68777c]">Cargando...</p>
          ) : filteredStaff.length === 0 ? (
            <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
              No hay colaboradores registrados.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {filteredStaff.map((person) => {
                const vacationSummary = getVacationSummary(person);

                return (
                  <div
                    key={person.id}
                    className={`rounded-2xl border p-5 ${
                      person.active
                        ? "border-[#dde3e6] bg-[#fdfefe]"
                        : "border-[#dde3e6] bg-[#f4f5f6] opacity-70"
                    }`}
                  >
                    <div className="flex flex-col justify-between gap-4 md:flex-row">
                      <div>
                        <div className="flex items-center gap-3">
                          <span
                            className="h-4 w-4 rounded-full"
                            style={{
                              backgroundColor: person.color || "#bd7b83",
                            }}
                          />
                          <h3 className="text-xl font-light">
                            {person.full_name}
                          </h3>
                        </div>

                        <p className="mt-2 text-sm text-[#68777c]">
                          Rol: {person.role || "tecnica"}
                        </p>

                        <p className="text-sm text-[#68777c]">
                          Estado: {person.active ? "Activo" : "Desactivado"}
                        </p>

                        <p className="text-sm text-[#68777c]">
                          Comisión servicios:{" "}
                          {person.service_commission_percentage ??
                            person.commission_percentage ??
                            0}
                          %
                        </p>

                        <p className="text-sm text-[#68777c]">
                          Comisión productos:{" "}
                          {person.product_commission_percentage || 0}%
                        </p>

                        {person.birthday && (
                          <p className="mt-2 text-sm text-[#68777c]">
                            Cumpleaños: {person.birthday}
                          </p>
                        )}

                        {person.hire_date && (
                          <p className="text-sm text-[#68777c]">
                            Ingreso: {person.hire_date} ·{" "}
                            {vacationSummary.yearsWorked} año(s)
                          </p>
                        )}

                        <div className="mt-3 rounded-xl bg-[#f7f9fa] p-3 text-sm text-[#68777c]">
                          <p className="font-medium text-[#263238]">
                            Vacaciones
                          </p>
                          <p>
                            Derecho: {vacationSummary.entitledDays} días ·
                            Usados: {vacationSummary.usedDays} · Disponibles:{" "}
                            {vacationSummary.availableDays}
                          </p>
                        </div>

                        {person.email && (
                          <p className="mt-2 text-sm text-[#68777c]">
                            Correo: {person.email}
                          </p>
                        )}

                        {person.phone && (
                          <p className="text-sm text-[#68777c]">
                            Teléfono: {person.phone}
                          </p>
                        )}

                        <div className="mt-4 rounded-xl bg-[#f7f9fa] p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                            Horario semanal
                          </p>

                          <div className="mt-2 space-y-1 text-sm text-[#68777c]">
                            {(schedulesByStaff[person.id] || []).length ===
                            0 ? (
                              <p>Sin horarios registrados.</p>
                            ) : (
                              schedulesByStaff[person.id].map((schedule) => (
                                <div
                                  key={schedule.id}
                                  className="rounded-lg bg-white px-3 py-2"
                                >
                                  {getDayLabel(schedule.day_of_week)} ·{" "}
                                  {schedule.is_day_off
                                    ? "Descanso"
                                    : `${formatTime(
                                        schedule.start_time
                                      )} - ${formatTime(schedule.end_time)}`}
                                  {schedule.has_break &&
                                    !schedule.is_day_off &&
                                    ` · Descanso ${formatTime(
                                      schedule.break_start
                                    )} - ${formatTime(schedule.break_end)}`}
                                  {!schedule.is_active ? " · Inactivo" : ""}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex min-w-40 flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditStaff(person)}
                          className="rounded-full border border-[#bd7b83] px-4 py-2 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleStaffActive(person)}
                          className="rounded-full bg-[#f7eeee] px-4 py-2 text-sm text-[#8a5f63] transition hover:bg-[#edd8d4]"
                        >
                          {person.active ? "Desactivar" : "Activar"}
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteStaff(person)}
                          className="rounded-full bg-red-50 px-4 py-2 text-sm text-red-600 transition hover:bg-red-100"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {activeSection === "agregar" && (
        <Card>
          <SectionHeader
            eyebrow={editingStaffId ? "Editar colaborador" : "Nuevo colaborador"}
            title={
              editingStaffId
                ? "Actualizar datos y horario"
                : "Crear colaborador con horario"
            }
            description="Captura datos generales, comisiones, color de agenda, notas internas y horario semanal."
          />

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm text-[#68777c]">
                Nombre *
              </label>
              <input
                name="full_name"
                value={staffForm.full_name}
                onChange={handleStaffChange}
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                placeholder="Ej. Laura Canul"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-[#68777c]">
                  Correo
                </label>
                <input
                  type="email"
                  name="email"
                  value={staffForm.email}
                  onChange={handleStaffChange}
                  className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                  placeholder="correo@email.com"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#68777c]">
                  Teléfono
                </label>
                <input
                  name="phone"
                  value={staffForm.phone}
                  onChange={handleStaffChange}
                  className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                  placeholder="9991234567"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm text-[#68777c]">
                  Cumpleaños
                </label>
                <input
                  type="date"
                  name="birthday"
                  value={staffForm.birthday}
                  onChange={handleStaffChange}
                  className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#68777c]">
                  Fecha de ingreso
                </label>
                <input
                  type="date"
                  name="hire_date"
                  value={staffForm.hire_date}
                  onChange={handleStaffChange}
                  className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#68777c]">
                  Rol
                </label>
                <input
                  name="role"
                  value={staffForm.role}
                  onChange={handleStaffChange}
                  className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                  placeholder="tecnica"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm text-[#68777c]">
                  Color agenda
                </label>
                <input
                  type="color"
                  name="color"
                  value={staffForm.color}
                  onChange={handleStaffChange}
                  className="h-12 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-2 outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#68777c]">
                  Comisión servicios %
                </label>
                <input
                  type="number"
                  name="service_commission_percentage"
                  value={staffForm.service_commission_percentage}
                  onChange={handleStaffChange}
                  className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                  placeholder="Ej. 30"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#68777c]">
                  Comisión productos %
                </label>
                <input
                  type="number"
                  name="product_commission_percentage"
                  value={staffForm.product_commission_percentage}
                  onChange={handleStaffChange}
                  className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                  placeholder="Ej. 10"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <input
                name="commission_notes"
                value={staffForm.commission_notes}
                onChange={handleStaffChange}
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                placeholder="Notas comisión servicios"
              />

              <input
                name="product_commission_notes"
                value={staffForm.product_commission_notes}
                onChange={handleStaffChange}
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                placeholder="Notas comisión productos"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#68777c]">
                Ajuste vacaciones
              </label>
              <input
                type="number"
                name="vacation_days_adjustment"
                value={staffForm.vacation_days_adjustment}
                onChange={handleStaffChange}
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                placeholder="0"
              />
            </div>

            <label className="flex items-center gap-2 rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
              <input
                type="checkbox"
                name="active"
                checked={staffForm.active}
                onChange={handleStaffChange}
              />
              Colaborador activo
            </label>

            <textarea
              name="vacation_notes"
              value={staffForm.vacation_notes}
              onChange={handleStaffChange}
              className="min-h-20 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              placeholder="Notas de vacaciones..."
            />

            <textarea
              name="notes"
              value={staffForm.notes}
              onChange={handleStaffChange}
              className="min-h-24 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              placeholder="Notas internas..."
            />
          </div>

          <div className="mt-8 rounded-[1.5rem] bg-[#f7f9fa] p-5">
            <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                  Horario semanal
                </p>
                <h4 className="mt-2 text-xl font-light">
                  Configura días, descansos y horario cortado
                </h4>
                <p className="mt-1 text-sm text-[#68777c]">
                  Llena un día y usa el botón para copiarlo a todos. Después
                  puedes modificar días individuales.
                </p>
              </div>

              <button
                type="button"
                onClick={copyFirstActiveScheduleToAllDays}
                className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
              >
                Copiar primer horario a todos
              </button>
            </div>

            <div className="space-y-4">
              {weekSchedule.map((day, index) => (
                <div
                  key={day.day_of_week}
                  className="rounded-2xl border border-[#dde3e6] bg-white p-4"
                >
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                    <h3 className="text-lg font-light">{day.label}</h3>

                    <div className="flex flex-wrap gap-3 text-sm text-[#68777c]">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={day.is_active}
                          onChange={(event) =>
                            handleWeekChange(
                              index,
                              "is_active",
                              event.target.checked
                            )
                          }
                        />
                        Trabaja
                      </label>

                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={day.is_day_off}
                          onChange={(event) =>
                            handleWeekChange(
                              index,
                              "is_day_off",
                              event.target.checked
                            )
                          }
                        />
                        Día de descanso
                      </label>

                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={day.has_break}
                          disabled={day.is_day_off}
                          onChange={(event) =>
                            handleWeekChange(
                              index,
                              "has_break",
                              event.target.checked
                            )
                          }
                        />
                        Descanso intermedio / horario cortado
                      </label>
                    </div>
                  </div>

                  {day.is_active && !day.is_day_off && (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Entrada
                        </label>
                        <TimeSelect
                          value={day.start_time}
                          onChange={(event) =>
                            handleWeekChange(
                              index,
                              "start_time",
                              event.target.value
                            )
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-[#68777c]">
                          Salida
                        </label>
                        <TimeSelect
                          value={day.end_time}
                          onChange={(event) =>
                            handleWeekChange(
                              index,
                              "end_time",
                              event.target.value
                            )
                          }
                        />
                      </div>
                    </div>
                  )}

                  {day.is_active && day.has_break && !day.is_day_off && (
                    <div className="mt-4 rounded-2xl bg-[#f7f9fa] p-4">
                      <p className="mb-3 text-sm text-[#8a5f63]">
                        Descanso intermedio o corte de horario
                      </p>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm text-[#68777c]">
                            Inicio descanso
                          </label>
                          <TimeSelect
                            value={day.break_start}
                            onChange={(event) =>
                              handleWeekChange(
                                index,
                                "break_start",
                                event.target.value
                              )
                            }
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-[#68777c]">
                            Fin descanso
                          </label>
                          <TimeSelect
                            value={day.break_end}
                            onChange={(event) =>
                              handleWeekChange(
                                index,
                                "break_end",
                                event.target.value
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {day.is_day_off && (
                    <p className="mt-4 rounded-xl bg-[#f7f9fa] p-3 text-sm text-[#8a5f63]">
                      Este día está marcado como descanso.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <SectionToast message={staffMessage} />

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleSaveStaff}
                disabled={savingStaff}
                className="flex-1 rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {savingStaff
                  ? "Guardando..."
                  : editingStaffId
                  ? "Guardar cambios"
                  : "Crear colaborador"}
              </button>

              <button
                type="button"
                onClick={closeStaffForm}
                className="rounded-full border border-[#bd7b83] px-6 py-4 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        </Card>
      )}
            {activeSection === "bloqueos" && (
        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <Card>
            <SectionHeader
              eyebrow="Bloqueos movibles"
              title={editingBlockId ? "Editar bloqueo" : "Crear bloqueo"}
              description="Registra comida, descanso o bloqueo personal para evitar agendar en ese espacio."
            />

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#68777c]">
                  Colaborador
                </label>
                <select
                  name="staff_id"
                  value={blockForm.staff_id}
                  onChange={handleBlockChange}
                  className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                >
                  <option value="">Seleccionar colaborador</option>
                  {staff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Fecha
                  </label>
                  <input
                    type="date"
                    name="block_date"
                    value={blockForm.block_date}
                    onChange={handleBlockChange}
                    className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Tipo
                  </label>
                  <select
                    name="block_type"
                    value={blockForm.block_type}
                    onChange={handleBlockChange}
                    className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                  >
                    <option value="comida">Comida</option>
                    <option value="descanso">Descanso</option>
                    <option value="personal">Personal</option>
                    <option value="bloqueo">Bloqueo</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Inicio
                  </label>
                  <TimeSelect
                    value={blockForm.start_time}
                    onChange={(event) =>
                      handleBlockChange({
                        target: {
                          name: "start_time",
                          value: event.target.value,
                        },
                      })
                    }
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Fin
                  </label>
                  <TimeSelect
                    value={blockForm.end_time}
                    onChange={(event) =>
                      handleBlockChange({
                        target: {
                          name: "end_time",
                          value: event.target.value,
                        },
                      })
                    }
                  />
                </div>
              </div>

              <input
                name="title"
                value={blockForm.title}
                onChange={handleBlockChange}
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                placeholder="Título del bloqueo"
              />

              <textarea
                name="notes"
                value={blockForm.notes}
                onChange={handleBlockChange}
                className="min-h-24 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                placeholder="Notas del bloqueo..."
              />
            </div>

            <div className="mt-6">
              <SectionToast message={blockMessage} />

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleSaveBlock}
                  disabled={savingBlock}
                  className="flex-1 rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {savingBlock
                    ? "Guardando..."
                    : editingBlockId
                    ? "Guardar bloqueo"
                    : "Crear bloqueo"}
                </button>

                {editingBlockId && (
                  <button
                    type="button"
                    onClick={resetBlockForm}
                    className="rounded-full border border-[#bd7b83] px-6 py-4 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <SectionHeader
              eyebrow="Bloqueos del día"
              title="Comidas y descansos"
              description="Consulta los bloqueos registrados para la fecha elegida."
              action={
                <input
                  type="date"
                  value={blockDateFilter}
                  onChange={(event) => {
                    setBlockDateFilter(event.target.value);
                    setBlockForm((current) => ({
                      ...current,
                      block_date: event.target.value,
                    }));
                  }}
                  className="rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                />
              }
            />

            <div className="space-y-4">
              {filteredBlocks.length === 0 ? (
                <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
                  No hay bloqueos para esta fecha.
                </div>
              ) : (
                filteredBlocks.map((block) => (
                  <div
                    key={block.id}
                    className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5"
                  >
                    <div className="flex flex-col justify-between gap-4 md:flex-row">
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                          {block.block_type}
                        </p>

                        <h3 className="mt-2 text-xl font-light">
                          {block.title}
                        </h3>

                        <p className="mt-2 text-sm text-[#68777c]">
                          {block.staff?.full_name || "Colaborador"} ·{" "}
                          {formatTime(block.start_time)} -{" "}
                          {formatTime(block.end_time)}
                        </p>

                        {block.notes && (
                          <p className="mt-3 rounded-xl bg-[#f7f9fa] p-3 text-sm text-[#68777c]">
                            {block.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex min-w-36 flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditBlock(block)}
                          className="rounded-full border border-[#bd7b83] px-4 py-2 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteBlock(block)}
                          className="rounded-full bg-red-50 px-4 py-2 text-sm text-red-600 transition hover:bg-red-100"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {activeSection === "incidencias" && (
        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <Card>
            <SectionHeader
              eyebrow="Incidencias y ausencias"
              title={
                editingIncidenceId ? "Editar incidencia" : "Registrar incidencia"
              }
              description="Registra vacaciones, permisos, faltas, retardos, descansos trabajados u otros movimientos."
            />

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#68777c]">
                  Colaborador
                </label>
                <select
                  name="staff_id"
                  value={incidenceForm.staff_id}
                  onChange={handleIncidenceChange}
                  className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                >
                  <option value="">Seleccionar colaborador</option>
                  {staff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Tipo de incidencia
                  </label>
                  <select
                    name="event_type"
                    value={incidenceForm.event_type}
                    onChange={handleIncidenceChange}
                    className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                  >
                    {incidenceTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Estado
                  </label>
                  <select
                    name="status"
                    value={incidenceForm.status}
                    onChange={handleIncidenceChange}
                    className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                  >
                    <option value="programada">Programada</option>
                    <option value="tomada">Tomada</option>
                    <option value="cancelada">Cancelada</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Fecha inicio
                  </label>
                  <input
                    type="date"
                    name="start_date"
                    value={incidenceForm.start_date}
                    onChange={handleIncidenceChange}
                    className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Fecha fin
                  </label>
                  <input
                    type="date"
                    name="end_date"
                    value={incidenceForm.end_date}
                    onChange={handleIncidenceChange}
                    className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Días registrados
                  </label>
                  <input
                    type="number"
                    name="days_taken"
                    value={incidenceForm.days_taken}
                    onChange={handleIncidenceChange}
                    className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                    placeholder="Días"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Minutos de retardo
                  </label>
                  <input
                    type="number"
                    name="minutes_late"
                    value={incidenceForm.minutes_late}
                    onChange={handleIncidenceChange}
                    className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                    placeholder="Minutos"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Descuento opcional
                  </label>
                  <input
                    type="number"
                    name="discount_amount"
                    value={incidenceForm.discount_amount}
                    onChange={handleIncidenceChange}
                    className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                    placeholder="0"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
                <input
                  type="checkbox"
                  name="affects_vacation_balance"
                  checked={incidenceForm.affects_vacation_balance}
                  onChange={handleIncidenceChange}
                />
                Descuenta del saldo de vacaciones
              </label>

              <input
                name="reason"
                value={incidenceForm.reason}
                onChange={handleIncidenceChange}
                className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                placeholder="Motivo"
              />

              <textarea
                name="notes"
                value={incidenceForm.notes}
                onChange={handleIncidenceChange}
                className="min-h-24 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                placeholder="Notas..."
              />
            </div>

            <div className="mt-6">
              <SectionToast message={incidenceMessage} />

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleSaveIncidence}
                  disabled={savingIncidence}
                  className="flex-1 rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {savingIncidence
                    ? "Guardando..."
                    : editingIncidenceId
                    ? "Guardar incidencia"
                    : "Registrar incidencia"}
                </button>

                {editingIncidenceId && (
                  <button
                    type="button"
                    onClick={resetIncidenceForm}
                    className="rounded-full border border-[#bd7b83] px-6 py-4 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <SectionHeader
              eyebrow="Historial"
              title="Incidencias registradas"
              description="Vacaciones, permisos, faltas, retardos y otros movimientos del personal."
            />

            <div className="space-y-4">
              {incidences.length === 0 ? (
                <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
                  No hay incidencias registradas.
                </div>
              ) : (
                incidences.map((incidence) => (
                  <div
                    key={incidence.id}
                    className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5"
                  >
                    <div className="flex flex-col justify-between gap-4 md:flex-row">
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                          {getIncidenceLabel(incidence.event_type)}
                        </p>

                        <h3 className="mt-2 text-xl font-light">
                          {incidence.staff?.full_name || "Colaborador"}
                        </h3>

                        <p className="mt-2 text-sm text-[#68777c]">
                          {incidence.start_date} a {incidence.end_date} ·{" "}
                          {incidence.days_taken} día(s)
                          {incidence.minutes_late > 0
                            ? ` · ${incidence.minutes_late} min retardo`
                            : ""}{" "}
                          · {incidence.status}
                        </p>

                        {incidence.reason && (
                          <p className="mt-3 rounded-xl bg-[#f7f9fa] p-3 text-sm text-[#68777c]">
                            {incidence.reason}
                          </p>
                        )}
                      </div>

                      <div className="flex min-w-36 flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditIncidence(incidence)}
                          className="rounded-full border border-[#bd7b83] px-4 py-2 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteIncidence(incidence)}
                          className="rounded-full bg-red-50 px-4 py-2 text-sm text-red-600 transition hover:bg-red-100"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}
    </AdminShell>
  );
}