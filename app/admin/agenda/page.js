"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function AgendaPage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [clients, setClients] = useState([]);
  const [staff, setStaff] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [selectedDate, setSelectedDate] = useState(todayISO());

  const [form, setForm] = useState({
    client_id: "",
    staff_id: "",
    appointment_date: todayISO(),
    start_time: "",
    end_time: "",
    estimated_total: "",
    deposit_amount: "",
    deposit_payment_method: "",
    notes: "",
    force_created: false,
  });

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
      loadAppointments(selectedDate);
    }
  }, [selectedDate, loadingSession]);

  const loadInitialData = async () => {
    setLoadingData(true);
    setMessage("");

    const [clientsResult, staffResult] = await Promise.all([
      supabase.from("clients").select("*").order("full_name"),
      supabase.from("staff").select("*").eq("active", true).order("full_name"),
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

    await loadAppointments(selectedDate);
    setLoadingData(false);
  };

  const loadAppointments = async (date) => {
    setMessage("");

    const { data, error } = await supabase
      .from("appointments")
      .select(`
        *,
        clients (
          full_name,
          phone
        ),
        staff (
          full_name
        )
      `)
      .eq("appointment_date", date)
      .order("start_time", { ascending: true });

    if (error) {
      setMessage(`Error al cargar citas: ${error.message}`);
    } else {
      setAppointments(data || []);
    }
  };

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;

    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const resetForm = () => {
    setForm({
      client_id: "",
      staff_id: "",
      appointment_date: selectedDate,
      start_time: "",
      end_time: "",
      estimated_total: "",
      deposit_amount: "",
      deposit_payment_method: "",
      notes: "",
      force_created: false,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    if (!form.client_id || !form.staff_id || !form.appointment_date || !form.start_time) {
      setMessage("Clienta, técnica, fecha y hora de inicio son obligatorios.");
      setSaving(false);
      return;
    }

    const appointmentData = {
      client_id: form.client_id,
      staff_id: form.staff_id,
      appointment_date: form.appointment_date,
      start_time: form.start_time,
      end_time: form.end_time || null,
      estimated_total: Number(form.estimated_total || 0),
      deposit_amount: Number(form.deposit_amount || 0),
      deposit_payment_method: form.deposit_payment_method || null,
      force_created: form.force_created,
      notes: form.notes.trim() || null,
      status: "agendada",
    };

    const { error } = await supabase.from("appointments").insert([appointmentData]);

    if (error) {
      setMessage(`No se pudo guardar la cita: ${error.message}`);
    } else {
      setMessage("Cita registrada correctamente ✨");
      setSelectedDate(form.appointment_date);
      resetForm();
      await loadAppointments(form.appointment_date);
    }

    setSaving(false);
  };

  const appointmentsByStaff = useMemo(() => {
    const result = {};

    staff.forEach((person) => {
      result[person.id] = appointments.filter(
        (appointment) => appointment.staff_id === person.id
      );
    });

    return result;
  }, [appointments, staff]);

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
              Registra citas, asigna técnica y consulta el día por columnas.
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

        {message && (
          <div className="mb-6 rounded-2xl border border-[#ecd8d4] bg-white px-5 py-4 text-sm text-[#8a5f63] shadow-sm">
            {message}
          </div>
        )}

        <div className="grid gap-8 xl:grid-cols-[0.85fr_1.15fr]">
          <form
            onSubmit={handleSubmit}
            className="h-fit rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.10)]"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              Nueva cita
            </p>

            <h2 className="mt-3 text-2xl font-light">Registrar cita</h2>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#6d5a58]">
                  Clienta *
                </label>
                <select
                  name="client_id"
                  value={form.client_id}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  required
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
                  Técnica *
                </label>
                <select
                  name="staff_id"
                  value={form.staff_id}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  required
                >
                  <option value="">Seleccionar técnica</option>
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
                    Fecha *
                  </label>
                  <input
                    type="date"
                    name="appointment_date"
                    value={form.appointment_date}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#6d5a58]">
                    Inicio *
                  </label>
                  <input
                    type="time"
                    name="start_time"
                    value={form.start_time}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#6d5a58]">
                    Fin
                  </label>
                  <input
                    type="time"
                    name="end_time"
                    value={form.end_time}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm text-[#6d5a58]">
                    Total estimado
                  </label>
                  <input
                    type="number"
                    name="estimated_total"
                    value={form.estimated_total}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#6d5a58]">
                    Anticipo
                  </label>
                  <input
                    type="number"
                    name="deposit_amount"
                    value={form.deposit_amount}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#6d5a58]">
                    Método anticipo
                  </label>
                  <select
                    name="deposit_payment_method"
                    value={form.deposit_payment_method}
                    onChange={handleChange}
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
                  Notas
                </label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  className="min-h-24 w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] px-4 py-3 outline-none"
                  placeholder="Servicios tentativos, observaciones, preferencias..."
                />
              </div>

              <label className="flex items-center gap-2 rounded-2xl bg-[#fcf7f6] p-4 text-sm text-[#6d5a58]">
                <input
                  type="checkbox"
                  name="force_created"
                  checked={form.force_created}
                  onChange={handleChange}
                />
                Forzar cita fuera de horario o disponibilidad
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-6 w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar cita"}
            </button>
          </form>

          <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_60px_rgba(189,123,131,0.10)]">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
                  Vista diaria
                </p>
                <h2 className="mt-3 text-2xl font-light">Citas del día</h2>
                <p className="mt-2 text-sm text-[#6d5a58]">
                  Total: {appointments.length}
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
                          Sin citas registradas.
                        </p>
                      ) : (
                        appointmentsByStaff[person.id].map((appointment) => (
                          <div
                            key={appointment.id}
                            className="rounded-xl bg-white p-4 text-sm shadow-sm"
                          >
                            <p className="font-medium text-[#352829]">
                              {appointment.start_time?.slice(0, 5)}
                              {appointment.end_time
                                ? ` - ${appointment.end_time.slice(0, 5)}`
                                : ""}
                            </p>

                            <p className="mt-2 text-[#352829]">
                              {appointment.clients?.full_name || "Sin clienta"}
                            </p>

                            <p className="text-[#6d5a58]">
                              WhatsApp: {appointment.clients?.phone || "-"}
                            </p>

                            <p className="mt-2 text-[#6d5a58]">
                              Estimado: ${appointment.estimated_total || 0}
                            </p>

                            {appointment.deposit_amount > 0 && (
                              <p className="text-[#6d5a58]">
                                Anticipo: ${appointment.deposit_amount} ·{" "}
                                {appointment.deposit_payment_method}
                              </p>
                            )}

                            {appointment.force_created && (
                              <p className="mt-2 rounded-full bg-[#fcf0ef] px-3 py-1 text-xs text-[#8a5f63]">
                                Cita forzada
                              </p>
                            )}

                            {appointment.notes && (
                              <p className="mt-3 rounded-xl bg-[#fcf7f6] p-3 text-[#6d5a58]">
                                {appointment.notes}
                              </p>
                            )}
                          </div>
                        ))
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