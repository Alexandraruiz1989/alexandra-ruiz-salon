"use client";

import { useEffect, useMemo, useState } from "react";
import ClientPortalShell, {
  PortalCard,
  PortalMessage,
} from "../components/ClientPortalShell";
import { portalFetch } from "../components/portalApi";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatMinutes(value) {
  const minutes = Number(value || 0);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function staffCanDoService(personId, service) {
  const staffIds = Array.isArray(service?.bookable_staff_ids)
    ? service.bookable_staff_ids
    : [];

  return staffIds.length === 0 || staffIds.includes(personId);
}

function staffCanDoSelectedServices(personId, selectedServices) {
  if (!personId) return true;
  return (selectedServices || []).every((service) =>
    staffCanDoService(personId, service)
  );
}

function formatServiceWithStaff(service) {
  const staffName = service?.staff_name || service?.staff?.full_name || "";
  return staffName ? `${service.name} — con ${staffName}` : service.name;
}

export default function ClienteAgendaPage() {
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [appointmentDate, setAppointmentDate] = useState(todayISO());
  const [preferredStaffId, setPreferredStaffId] = useState("");
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState("info");
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdAppointment, setCreatedAppointment] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await portalFetch("/api/client/services");
        setServices(data.services || []);
        setStaff(data.staff || []);
      } catch (error) {
        setTone("error");
        setMessage(error.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const groupedServices = useMemo(() => {
    return services.reduce((groups, service) => {
      const category = service.category || "Servicios";
      if (!groups[category]) groups[category] = [];
      groups[category].push(service);
      return groups;
    }, {});
  }, [services]);

  const selectedServices = useMemo(() => {
    return services.filter((service) => selectedServiceIds.includes(service.id));
  }, [services, selectedServiceIds]);

  const compatibleStaff = useMemo(() => {
    if (selectedServices.length === 0) return staff;
    return staff.filter((person) =>
      staffCanDoSelectedServices(person.id, selectedServices)
    );
  }, [staff, selectedServices]);

  const estimatedTotal = selectedServices.reduce(
    (sum, service) => sum + Number(service.base_price || 0),
    0
  );
  const estimatedDuration = selectedServices.reduce(
    (sum, service) =>
      sum +
      Number(service.duration_minutes || 0) +
      Number(service.cleanup_minutes || 0),
    0
  );
  const hasCompatibleStaff =
    selectedServices.length === 0 || compatibleStaff.length > 0;

  const toggleService = (serviceId) => {
    const nextServiceIds = selectedServiceIds.includes(serviceId)
      ? selectedServiceIds.filter((id) => id !== serviceId)
      : [...selectedServiceIds, serviceId];
    const nextSelectedServices = services.filter((service) =>
      nextServiceIds.includes(service.id)
    );

    setSlots([]);
    setSelectedSlot(null);
    setCreatedAppointment(null);
    if (
      preferredStaffId &&
      !staffCanDoSelectedServices(preferredStaffId, nextSelectedServices)
    ) {
      setPreferredStaffId("");
    }
    setSelectedServiceIds(nextServiceIds);
  };

  const handleAppointmentDateChange = (value) => {
    setAppointmentDate(value);
    setSlots([]);
    setSelectedSlot(null);
    setCreatedAppointment(null);
  };

  const findAvailability = async () => {
    setSearching(true);
    setMessage("");
    setTone("info");
    setSelectedSlot(null);
    setCreatedAppointment(null);

    if (selectedServiceIds.length === 0) {
      setTone("error");
      setMessage("Selecciona al menos un servicio.");
      setSearching(false);
      return;
    }
    if (!hasCompatibleStaff) {
      setTone("error");
      setMessage(
        "No hay colaboradoras configuradas para todos los servicios seleccionados."
      );
      setSearching(false);
      return;
    }

    try {
      const data = await portalFetch("/api/client/availability", {
        method: "POST",
        body: JSON.stringify({
          service_ids: selectedServiceIds,
          date: appointmentDate,
          preferred_staff_id: preferredStaffId,
        }),
      });

      setSlots(data.slots || []);
      setTone((data.slots || []).length > 0 ? "success" : "info");
      setMessage(
        (data.slots || []).length > 0
          ? `Encontramos ${(data.slots || []).length} horario(s) disponible(s).`
          : "No encontramos horarios libres para esa fecha. Prueba otro día o colaboradora."
      );
    } catch (error) {
      setTone("error");
      setMessage(error.message);
    } finally {
      setSearching(false);
    }
  };

  const createAppointment = async () => {
    if (submitting) return;

    if (!selectedSlot) {
      setTone("error");
      setMessage("Selecciona un horario disponible.");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const data = await portalFetch("/api/client/appointments", {
        method: "POST",
        body: JSON.stringify({
          service_ids: selectedServiceIds,
          appointment_date: appointmentDate,
          start_time: selectedSlot.start_time,
          staff_id: selectedSlot.staff_id,
          preview_id: selectedSlot.preview?.id,
          preview_version: selectedSlot.preview?.version,
          confirmation_id: selectedSlot.preview?.confirmation_id,
          request_hash: selectedSlot.preview?.request_hash,
          preview_expires_at: selectedSlot.preview?.expires_at,
          notes,
        }),
      });

      setTone("success");
      setMessage(data.message);
      setCreatedAppointment(data.appointment || null);
      setSelectedServiceIds([]);
      setSlots([]);
      setSelectedSlot(null);
      setNotes("");
    } catch (error) {
      setTone("error");
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ClientPortalShell
      title="Agendar cita"
      subtitle="Selecciona servicios, revisa horarios libres reales y envía tu solicitud. El equipo te contactará para confirmar anticipo."
    >
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <PortalCard>
          <div className="mb-5">
            <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
              Servicios
            </p>
            <h2 className="mt-2 text-2xl font-light">Elige qué deseas agendar</h2>
            <p className="mt-2 text-sm leading-6 text-[#765d5f]">
              Puedes seleccionar uno o varios servicios. El total mostrado es
              aproximado y puede ajustarse si agregas extras o diseños.
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-[#765d5f]">Cargando servicios...</p>
          ) : (
            <div className="space-y-5">
              {Object.entries(groupedServices).map(([category, items]) => (
                <div key={category}>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#9a7074]">
                    {category}
                  </h3>
                  <div className="grid gap-3">
                    {items.map((service) => {
                      const selected = selectedServiceIds.includes(service.id);

                      return (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => toggleService(service.id)}
                          className={`rounded-3xl border p-4 text-left transition ${
                            selected
                              ? "border-[#bd7b83] bg-[#fff3f1] shadow-md shadow-[#bd7b83]/10"
                              : "border-[#ead8d4] bg-white hover:border-[#bd7b83]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-[#3b2b2d]">
                                {service.name}
                              </p>
                              {service.description && (
                                <p className="mt-1 text-sm leading-6 text-[#765d5f]">
                                  {service.description}
                                </p>
                              )}
                              <p className="mt-2 text-sm text-[#9a7074]">
                                {formatMinutes(
                                  Number(service.duration_minutes || 0) +
                                    Number(service.cleanup_minutes || 0)
                                )}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-[#f8eeeb] px-3 py-1 text-sm text-[#7a5558]">
                              {formatMoney(service.base_price)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </PortalCard>

        <div className="space-y-5">
          <PortalCard>
            <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
              Disponibilidad
            </p>
            <h2 className="mt-2 text-2xl font-light">Busca un horario libre</h2>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#765d5f]">
                  Fecha
                </label>
                <input
                  type="date"
                  id="client-appointment-date"
                  name="appointment_date"
                  min={todayISO()}
                  value={appointmentDate}
                  onChange={(event) =>
                    handleAppointmentDateChange(event.target.value)
                  }
                  onInput={(event) =>
                    handleAppointmentDateChange(event.currentTarget.value)
                  }
                  className="w-full rounded-2xl border border-[#ead8d4] bg-[#fff8f6] px-4 py-3 outline-none focus:border-[#bd7b83]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#765d5f]">
                  Técnica de preferencia
                </label>
                <select
                  value={preferredStaffId}
                  onChange={(event) => {
                    setPreferredStaffId(event.target.value);
                    setSlots([]);
                    setSelectedSlot(null);
                  }}
                  className="w-full rounded-2xl border border-[#ead8d4] bg-[#fff8f6] px-4 py-3 outline-none focus:border-[#bd7b83]"
                >
                  <option value="">La colaboradora disponible</option>
                  {compatibleStaff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </select>
                {selectedServices.length > 0 && compatibleStaff.length === 0 && (
                  <p className="mt-2 text-sm text-red-700">
                    No hay colaboradoras configuradas para todos los servicios
                    seleccionados. Elige otra combinación.
                  </p>
                )}
              </div>

              {selectedServices.length > 0 && (
                <div className="rounded-3xl bg-[#fff8f6] p-4 text-sm leading-6 text-[#765d5f]">
                  <p className="font-medium text-[#3b2b2d]">
                    Resumen de selección
                  </p>
                  <p>{selectedServices.map((item) => item.name).join(", ")}</p>
                  <p className="mt-2">
                    Duración aprox. {formatMinutes(estimatedDuration)} · Total
                    aprox. {formatMoney(estimatedTotal)}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={findAvailability}
                disabled={
                  searching || selectedServiceIds.length === 0 || !hasCompatibleStaff
                }
                className="w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {searching ? "Buscando..." : "Buscar horarios disponibles"}
              </button>

              <PortalMessage message={message} tone={tone} />

              {createdAppointment && (
                <div className="rounded-3xl border border-green-200 bg-green-50 p-4 text-sm leading-6 text-green-800">
                  <p className="font-medium text-green-900">
                    Solicitud creada correctamente
                  </p>
                  <p>
                    {createdAppointment.appointment_date} ·{" "}
                    {createdAppointment.start_time}
                    {createdAppointment.end_time
                      ? ` - ${createdAppointment.end_time}`
                      : ""}
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {(createdAppointment.services || []).map((service) => (
                      <li key={service.id || service.service_id}>
                        {formatServiceWithStaff(service)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2">
                    Estado:{" "}
                    {createdAppointment.confirmation_status || "pendiente"}.
                  </p>
                </div>
              )}
            </div>
          </PortalCard>

          {slots.length > 0 && (
            <PortalCard>
              <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
                Horarios libres
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {slots.map((slot) => {
                  const selected =
                    selectedSlot?.staff_id === slot.staff_id &&
                    selectedSlot?.start_time === slot.start_time;

                  return (
                    <button
                      key={`${slot.staff_id}-${slot.start_time}`}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`rounded-3xl border p-4 text-left transition ${
                        selected
                          ? "border-[#bd7b83] bg-[#fff3f1]"
                          : "border-[#ead8d4] bg-white hover:border-[#bd7b83]"
                      }`}
                    >
                      <p className="text-xl font-light">
                        {slot.start_time} - {slot.end_time}
                      </p>
                      <p className="mt-1 text-sm text-[#765d5f]">
                        Con {slot.staff_name || "colaboradora disponible"}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5">
                <label className="mb-2 block text-sm text-[#765d5f]">
                  Nota para el equipo, opcional
                </label>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="min-h-24 w-full rounded-2xl border border-[#ead8d4] bg-[#fff8f6] px-4 py-3 outline-none focus:border-[#bd7b83]"
                  placeholder="Ej. Es mi primera vez, quiero algo natural, llevo diseño de referencia..."
                />
              </div>

              {selectedSlot && (
                <div className="mt-4 rounded-3xl border border-[#ead8d4] bg-[#fff8f6] p-4 text-sm leading-6 text-[#765d5f]">
                  <p className="font-medium text-[#3b2b2d]">
                    Revisa antes de confirmar
                  </p>
                  <p>
                    {(selectedSlot.preview?.services || [])
                      .map((service) => service.name)
                      .join(", ")}
                  </p>
                  <p>
                    {appointmentDate} · {selectedSlot.start_time}-
                    {selectedSlot.end_time} ·{" "}
                    {selectedSlot.staff_name || "colaboradora disponible"}
                  </p>
                  <p>
                    Total aproximado{" "}
                    {formatMoney(selectedSlot.preview?.expected_price)}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={createAppointment}
                disabled={submitting || !selectedSlot}
                className="mt-4 w-full rounded-full bg-[#3b2b2d] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {submitting
                  ? "Confirmando solicitud..."
                  : "Confirmar y enviar solicitud"}
              </button>

              <p className="mt-4 text-sm leading-6 text-[#765d5f]">
                No se cobra en línea por ahora. Para confirmar tu espacio, el
                equipo revisará la solicitud y te compartirá los datos para el
                anticipo.
              </p>
            </PortalCard>
          )}
        </div>
      </div>
    </ClientPortalShell>
  );
}
