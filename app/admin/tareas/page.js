"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const emptyTaskForm = {
  staff_id: "",
  title: "",
  description: "",
  due_date: new Date().toISOString().slice(0, 10),
  priority: "media",
  status: "pendiente",
};

const statusOptions = [
  { value: "pendiente", label: "Pendiente" },
  { value: "en_proceso", label: "En proceso" },
  { value: "completada", label: "Completada" },
  { value: "cancelada", label: "Cancelada" },
];

const priorityOptions = [
  { value: "baja", label: "Baja" },
  { value: "media", label: "Media" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];

function getMessageType(message) {
  const text = String(message || "").toLowerCase();

  const isError =
    text.includes("no se pudo") ||
    text.includes("error") ||
    text.includes("obligatorio") ||
    text.includes("obligatorios") ||
    text.includes("selecciona");

  const isSuccess =
    text.includes("correctamente") ||
    text.includes("completada") ||
    text.includes("cancelada") ||
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

function getStatusLabel(value) {
  return statusOptions.find((item) => item.value === value)?.label || value;
}

function getPriorityLabel(value) {
  return priorityOptions.find((item) => item.value === value)?.label || value;
}

function getStatusBadgeClass(status) {
  if (status === "completada") {
    return "bg-green-50 text-green-700";
  }

  if (status === "cancelada") {
    return "bg-red-50 text-red-700";
  }

  if (status === "en_proceso") {
    return "bg-yellow-50 text-yellow-700";
  }

  return "bg-[#fcf0ef] text-[#8a5f63]";
}

function getPriorityBadgeClass(priority) {
  if (priority === "urgente") {
    return "bg-red-600 text-white";
  }

  if (priority === "alta") {
    return "bg-red-50 text-red-700";
  }

  if (priority === "media") {
    return "bg-yellow-50 text-yellow-700";
  }

  return "bg-green-50 text-green-700";
}

export default function TareasPage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [listMessage, setListMessage] = useState("");

  const [staff, setStaff] = useState([]);
  const [tasks, setTasks] = useState([]);

  const [editingTaskId, setEditingTaskId] = useState(null);
  const [form, setForm] = useState(emptyTaskForm);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("");

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

  const loadData = async () => {
    setLoadingData(true);

    const [staffResult, tasksResult] = await Promise.all([
      supabase.from("staff").select("*").eq("active", true).order("full_name"),
      supabase
        .from("staff_tasks")
        .select("*, staff(full_name)")
        .order("due_date", { ascending: true })
        .order("created_at", { ascending: false }),
    ]);

    if (staffResult.error) {
      setListMessage(`Error al cargar personal: ${staffResult.error.message}`);
    } else {
      setStaff(staffResult.data || []);
    }

    if (tasksResult.error) {
      setListMessage(`Error al cargar tareas: ${tasksResult.error.message}`);
    } else {
      setTasks(tasksResult.data || []);
    }

    setLoadingData(false);
  };

  const createTaskNotification = async (task) => {
    if (!task.staff_id) return { error: null };

    const notificationData = {
      staff_id: task.staff_id,
      title: "Nueva tarea asignada",
      message: `Se te asignó la tarea: ${task.title}${
        task.due_date ? ` · Fecha límite: ${task.due_date}` : ""
      }`,
      notification_type: "tarea",
      related_table: "staff_tasks",
      related_id: task.id,
      is_read: false,
    };

    return await supabase.from("notifications").insert([notificationData]);
  };

  const filteredTasks = useMemo(() => {
    const term = search.toLowerCase().trim();

    return tasks.filter((task) => {
      const matchesSearch =
        !term ||
        task.title?.toLowerCase().includes(term) ||
        task.description?.toLowerCase().includes(term) ||
        task.staff?.full_name?.toLowerCase().includes(term);

      const matchesStatus = !statusFilter || task.status === statusFilter;
      const matchesStaff = !staffFilter || task.staff_id === staffFilter;

      return matchesSearch && matchesStatus && matchesStaff;
    });
  }, [tasks, search, statusFilter, staffFilter]);

  const taskSummary = useMemo(() => {
    return tasks.reduce(
      (summary, task) => {
        summary.total += 1;
        summary[task.status] = (summary[task.status] || 0) + 1;

        if (task.priority === "urgente" && task.status !== "completada") {
          summary.urgent += 1;
        }

        return summary;
      },
      {
        total: 0,
        pendiente: 0,
        en_proceso: 0,
        completada: 0,
        cancelada: 0,
        urgent: 0,
      }
    );
  }, [tasks]);

  const tasksByStaff = useMemo(() => {
    const result = {};

    staff.forEach((person) => {
      result[person.id] = filteredTasks.filter(
        (task) => task.staff_id === person.id
      );
    });

    const unassigned = filteredTasks.filter((task) => !task.staff_id);

    if (unassigned.length > 0) {
      result.sin_asignar = unassigned;
    }

    return result;
  }, [staff, filteredTasks]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setForm(emptyTaskForm);
    setEditingTaskId(null);
  };

  const handleEdit = (task) => {
    setEditingTaskId(task.id);
    setMessage("");

    setForm({
      staff_id: task.staff_id || "",
      title: task.title || "",
      description: task.description || "",
      due_date: task.due_date || new Date().toISOString().slice(0, 10),
      priority: task.priority || "media",
      status: task.status || "pendiente",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSave = async () => {
    setSaving(true);
    setListMessage("");
    setMessage("Guardando tarea...");

    if (!form.title.trim()) {
      setMessage("El título de la tarea es obligatorio.");
      setSaving(false);
      return;
    }

    const taskData = {
      staff_id: form.staff_id || null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date || null,
      priority: form.priority || "media",
      status: form.status || "pendiente",
      updated_at: new Date().toISOString(),
      completed_at:
        form.status === "completada" ? new Date().toISOString() : null,
    };

    if (editingTaskId) {
      const { error } = await supabase
        .from("staff_tasks")
        .update(taskData)
        .eq("id", editingTaskId);

      if (error) {
        setMessage(`No se pudo actualizar la tarea: ${error.message}`);
        setSaving(false);
        return;
      }

      await loadData();
      resetForm();
      setMessage("Tarea actualizada correctamente ✨");
      setSaving(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();

    const { data: createdTask, error } = await supabase
      .from("staff_tasks")
      .insert([
        {
          ...taskData,
          created_by: sessionData.session?.user?.email || null,
        },
      ])
      .select()
      .single();

    if (error) {
      setMessage(`No se pudo crear la tarea: ${error.message}`);
      setSaving(false);
      return;
    }

    const notificationResult = await createTaskNotification(createdTask);

    await loadData();
    resetForm();

    if (notificationResult.error) {
      setMessage(
        `Tarea creada correctamente, pero no se pudo crear la notificación: ${notificationResult.error.message}`
      );
      setSaving(false);
      return;
    }

    setMessage(
      createdTask.staff_id
        ? "Tarea creada correctamente y notificación interna generada ✨"
        : "Tarea creada correctamente ✨"
    );

    setSaving(false);
  };

  const updateTaskStatus = async (task, newStatus) => {
    setListMessage("Actualizando tarea...");

    const { error } = await supabase
      .from("staff_tasks")
      .update({
        status: newStatus,
        completed_at:
          newStatus === "completada" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    if (error) {
      setListMessage(`No se pudo actualizar la tarea: ${error.message}`);
      return;
    }

    await loadData();

    if (newStatus === "completada") {
      setListMessage("Tarea completada correctamente ✨");
    } else if (newStatus === "cancelada") {
      setListMessage("Tarea cancelada correctamente.");
    } else {
      setListMessage("Tarea actualizada correctamente ✨");
    }
  };

  const deleteTask = async (task) => {
    setListMessage("Eliminando tarea...");

    const { error } = await supabase
      .from("staff_tasks")
      .delete()
      .eq("id", task.id);

    if (error) {
      setListMessage(`No se pudo eliminar la tarea: ${error.message}`);
      return;
    }

    await loadData();
    setListMessage("Tarea eliminada correctamente.");
  };

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
            <h1 className="mt-3 text-4xl font-light">Tareas</h1>
            <p className="mt-2 text-sm text-[#6d5a58]">
              Asigna pendientes al personal, da seguimiento y genera
              notificaciones internas.
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

        <div className="mb-8 grid gap-4 md:grid-cols-5">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
              Total
            </p>
            <p className="mt-2 text-3xl font-light">{taskSummary.total}</p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
              Pendientes
            </p>
            <p className="mt-2 text-3xl font-light">
              {taskSummary.pendiente || 0}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
              En proceso
            </p>
            <p className="mt-2 text-3xl font-light">
              {taskSummary.en_proceso || 0}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
              Completadas
            </p>
            <p className="mt-2 text-3xl font-light">
              {taskSummary.completada || 0}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
              Urgentes
            </p>
            <p className="mt-2 text-3xl font-light">{taskSummary.urgent}</p>
          </div>
        </div>

        <div className="grid gap-8 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="h-fit rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.10)]">
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              {editingTaskId ? "Editar tarea" : "Nueva tarea"}
            </p>

            <h2 className="mt-3 text-2xl font-light">
              {editingTaskId ? "Actualizar pendiente" : "Crear pendiente"}
            </h2>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Título *
                </label>
                <input
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  placeholder="Ej. Confirmar anticipos del día"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Asignar a
                </label>
                <select
                  name="staff_id"
                  value={form.staff_id}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                >
                  <option value="">Sin asignar</option>
                  {staff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm text-[#6d5a58]">
                    Fecha límite
                  </label>
                  <input
                    type="date"
                    name="due_date"
                    value={form.due_date}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#6d5a58]">
                    Prioridad
                  </label>
                  <select
                    name="priority"
                    value={form.priority}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  >
                    {priorityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#6d5a58]">
                    Estado
                  </label>
                  <select
                    name="status"
                    value={form.status}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Descripción / notas
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  className="min-h-32 w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  placeholder="Detalles de la tarea..."
                />
              </div>
            </div>

            <div className="mt-6">
              <SectionToast message={message} />

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {saving
                    ? "Guardando..."
                    : editingTaskId
                    ? "Guardar cambios"
                    : "Crear tarea"}
                </button>

                {editingTaskId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-full border border-[#bd7b83] px-6 py-4 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.10)]">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
                  Lista
                </p>
                <h2 className="mt-3 text-2xl font-light">
                  Tareas registradas
                </h2>
                <p className="mt-2 text-sm text-[#6d5a58]">
                  Mostrando: {filteredTasks.length}
                </p>
              </div>

              <button
                onClick={loadData}
                className="rounded-full border border-[#bd7b83] px-5 py-3 text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
              >
                Actualizar
              </button>
            </div>

            {listMessage && (
              <div
                className={`mt-5 rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(
                  listMessage
                )}`}
              >
                {listMessage}
              </div>
            )}

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                placeholder="Buscar tarea..."
              />

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
              >
                <option value="">Todos los estados</option>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={staffFilter}
                onChange={(event) => setStaffFilter(event.target.value)}
                className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
              >
                <option value="">Todo el personal</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-6 space-y-6">
              {loadingData ? (
                <p className="text-sm text-[#6d5a58]">Cargando tareas...</p>
              ) : filteredTasks.length === 0 ? (
                <div className="rounded-2xl bg-[#fcf7f6] p-5 text-sm text-[#6d5a58]">
                  No hay tareas con esos filtros.
                </div>
              ) : (
                <>
                  {staff.map((person) => {
                    const personTasks = tasksByStaff[person.id] || [];

                    if (personTasks.length === 0) return null;

                    return (
                      <div key={person.id}>
                        <h3 className="mb-3 text-lg font-light">
                          {person.full_name}
                        </h3>

                        <div className="space-y-3">
                          {personTasks.map((task) => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              onEdit={handleEdit}
                              onStatusChange={updateTaskStatus}
                              onDelete={deleteTask}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {(tasksByStaff.sin_asignar || []).length > 0 && (
                    <div>
                      <h3 className="mb-3 text-lg font-light">Sin asignar</h3>

                      <div className="space-y-3">
                        {tasksByStaff.sin_asignar.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            onEdit={handleEdit}
                            onStatusChange={updateTaskStatus}
                            onDelete={deleteTask}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function TaskCard({ task, onEdit, onStatusChange, onDelete }) {
  return (
    <div className="rounded-2xl border border-[#ead2cf] bg-[#fdf8f6] p-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs ${getStatusBadgeClass(
                task.status
              )}`}
            >
              {getStatusLabel(task.status)}
            </span>

            <span
              className={`rounded-full px-3 py-1 text-xs ${getPriorityBadgeClass(
                task.priority
              )}`}
            >
              {getPriorityLabel(task.priority)}
            </span>
          </div>

          <h3 className="mt-3 text-xl font-light">{task.title}</h3>

          {task.due_date && (
            <p className="mt-2 text-sm text-[#6d5a58]">
              Fecha límite: {task.due_date}
            </p>
          )}

          {task.description && (
            <p className="mt-3 rounded-xl bg-white p-3 text-sm leading-6 text-[#6d5a58]">
              {task.description}
            </p>
          )}

          {task.created_by && (
            <p className="mt-3 text-xs text-[#8a5f63]">
              Creada por: {task.created_by}
            </p>
          )}
        </div>

        <div className="flex min-w-40 flex-col gap-2">
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="rounded-full border border-[#bd7b83] px-4 py-2 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
          >
            Editar
          </button>

          {task.status !== "en_proceso" && task.status !== "completada" && (
            <button
              type="button"
              onClick={() => onStatusChange(task, "en_proceso")}
              className="rounded-full bg-yellow-50 px-4 py-2 text-sm text-yellow-700 transition hover:bg-yellow-100"
            >
              En proceso
            </button>
          )}

          {task.status !== "completada" && (
            <button
              type="button"
              onClick={() => onStatusChange(task, "completada")}
              className="rounded-full bg-green-50 px-4 py-2 text-sm text-green-700 transition hover:bg-green-100"
            >
              Completar
            </button>
          )}

          {task.status !== "cancelada" && task.status !== "completada" && (
            <button
              type="button"
              onClick={() => onStatusChange(task, "cancelada")}
              className="rounded-full bg-red-50 px-4 py-2 text-sm text-red-600 transition hover:bg-red-100"
            >
              Cancelar
            </button>
          )}

          <button
            type="button"
            onClick={() => onDelete(task)}
            className="rounded-full bg-[#f2e4e1] px-4 py-2 text-sm text-[#8a5f63] transition hover:bg-[#edd8d4]"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}