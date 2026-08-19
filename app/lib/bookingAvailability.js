import { appointmentBlocksAvailability } from "./clientPortalAppointmentStatus.js";

export function cleanText(value) {
  return String(value || "").trim();
}

export function formatTime(value) {
  return cleanText(value).slice(0, 5);
}

export function timeToMinutes(time) {
  if (!time) return null;
  const [hours, minutes] = formatTime(time).split(":").map(Number);
  return Number(hours || 0) * 60 + Number(minutes || 0);
}

export function minutesToTime(minutes) {
  const safeMinutes = Number(minutes || 0);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function addMinutesToTime(time, minutes) {
  const start = timeToMinutes(time);
  if (start === null) return "";
  return minutesToTime(start + Number(minutes || 0));
}

export function timesOverlap(startA, endA, startB, endB) {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);

  if (aStart === null || aEnd === null || bStart === null || bEnd === null) {
    return false;
  }

  return aStart < bEnd && bStart < aEnd;
}

function appointmentServiceLineBlocksAvailability(serviceLine = {}) {
  const status = cleanText(serviceLine.status || "agendado").toLowerCase();
  return ![
    "cancelada",
    "cancelado",
    "cancelled",
    "canceled",
    "rechazada",
    "eliminada",
    "eliminado",
    "deleted",
    "inactiva",
    "inactivo",
  ].includes(status);
}

export function getDayOfWeek(dateString) {
  if (!dateString) return null;
  return new Date(`${dateString}T00:00:00`).getDay();
}

export function getServiceDuration(service) {
  return (
    Number(service?.duration_minutes || 0) +
    Number(service?.cleanup_minutes || 0)
  );
}

function staffCanDoAllServices(person, serviceIds, staffServices) {
  return serviceIds.every((serviceId) => {
    const configuredForService = (staffServices || []).filter(
      (item) => item.service_id === serviceId && item.active !== false
    );

    if (configuredForService.length === 0) return true;

    return configuredForService.some((item) => item.staff_id === person.id);
  });
}

function buildServiceSegments(services, startTime, staffId, date) {
  let currentStart = formatTime(startTime);

  return services.map((service) => {
    const duration = getServiceDuration(service);
    const endTime = addMinutesToTime(currentStart, duration);
    const segment = {
      service_id: service.id,
      service,
      staff_id: staffId,
      service_date: date,
      start_time: currentStart,
      end_time: endTime,
      duration_minutes: Number(service.duration_minutes || 0),
      cleanup_minutes: Number(service.cleanup_minutes || 0),
      price: Number(service.base_price || 0),
      quantity: 1,
    };

    currentStart = endTime;
    return segment;
  });
}

function getScheduleForStaff(staffId, dateString, schedules) {
  const dayOfWeek = getDayOfWeek(dateString);

  return (schedules || []).find(
    (item) =>
      item.staff_id === staffId &&
      Number(item.day_of_week) === Number(dayOfWeek)
  );
}

function getCandidateTimes(schedule, totalDuration) {
  const start = timeToMinutes(schedule?.start_time);
  const end = timeToMinutes(schedule?.end_time);

  if (start === null || end === null || end <= start) return [];

  const result = [];

  for (let minute = start; minute + totalDuration <= end; minute += 30) {
    result.push(minutesToTime(minute));
  }

  return result;
}

function staffIsFree({
  person,
  date,
  startTime,
  totalDuration,
  schedules,
  existingServices,
  blocksForDate,
  now,
}) {
  const schedule = getScheduleForStaff(person.id, date, schedules);
  const endTime = addMinutesToTime(startTime, totalDuration);

  if (!schedule || !schedule.is_active || schedule.is_day_off) return false;

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

  const appointmentConflict = (existingServices || []).some((item) => {
    if (!appointmentServiceLineBlocksAvailability(item)) return false;
    if (item.staff_id !== person.id) return false;
    if (!appointmentBlocksAvailability(item.appointments, { now })) {
      return false;
    }
    return timesOverlap(startTime, endTime, item.start_time, item.end_time);
  });

  if (appointmentConflict) return false;

  return !(blocksForDate || []).some((block) => {
    if (block.staff_id !== person.id) return false;
    return timesOverlap(startTime, endTime, block.start_time, block.end_time);
  });
}

function resourcesAreFree({
  segments,
  existingServices,
  resources,
  serviceResources,
  now,
}) {
  const activeServiceResources = (serviceResources || []).filter(
    (item) => item.active !== false
  );

  if (activeServiceResources.length === 0 || (resources || []).length === 0) {
    return true;
  }

  for (const segment of segments) {
    const requiredResources = activeServiceResources.filter(
      (item) => item.service_id === segment.service_id
    );

    for (const requirement of requiredResources) {
      const resource = (resources || []).find(
        (item) => item.id === requirement.resource_id
      );

      if (!resource || resource.active === false) continue;

      const quantityAvailable = Number(resource.quantity || 0);
      const requiredQuantity = Number(requirement.quantity_required || 1);

      const existingUsage = (existingServices || []).reduce((sum, existing) => {
        if (
          !appointmentServiceLineBlocksAvailability(existing) ||
          !appointmentBlocksAvailability(existing.appointments, { now }) ||
          !timesOverlap(
            segment.start_time,
            segment.end_time,
            existing.start_time,
            existing.end_time
          )
        ) {
          return sum;
        }

        const existingRequirement = activeServiceResources.find(
          (item) =>
            item.service_id === existing.service_id &&
            item.resource_id === requirement.resource_id
        );

        return sum + Number(existingRequirement?.quantity_required || 0);
      }, 0);

      const currentUsage = segments.reduce((sum, currentSegment) => {
        if (
          !timesOverlap(
            segment.start_time,
            segment.end_time,
            currentSegment.start_time,
            currentSegment.end_time
          )
        ) {
          return sum;
        }

        const currentRequirement = activeServiceResources.find(
          (item) =>
            item.service_id === currentSegment.service_id &&
            item.resource_id === requirement.resource_id
        );

        return sum + Number(currentRequirement?.quantity_required || 0);
      }, 0);

      if (existingUsage + currentUsage > quantityAvailable) {
        return false;
      }

      if (requiredQuantity > quantityAvailable) {
        return false;
      }
    }
  }

  return true;
}

export async function getAvailability({
  adminSupabase,
  date,
  serviceIds,
  preferredStaffId = "",
  requestedStartTime = "",
  limit = 24,
  allowMissingTimeBlocks = false,
  now = new Date(),
}) {
  const selectedDate = cleanText(date);
  const ids = [...new Set((serviceIds || []).map(cleanText).filter(Boolean))];

  if (!selectedDate || ids.length === 0) {
    throw new Error("Selecciona fecha y al menos un servicio.");
  }

  const [
    servicesResult,
    staffResult,
    schedulesResult,
    staffServicesResult,
    existingServicesResult,
    blocksResult,
    resourcesResult,
    serviceResourcesResult,
  ] = await Promise.all([
    adminSupabase
      .from("services")
      .select("*")
      .in("id", ids)
      .eq("active", true),
    adminSupabase
      .from("staff")
      .select("*")
      .eq("active", true)
      .order("full_name"),
    adminSupabase.from("staff_schedules").select("*"),
    adminSupabase.from("staff_services").select("*").eq("active", true),
    adminSupabase
      .from("appointment_services")
      .select(
        `
        id,
        appointment_id,
        service_id,
        staff_id,
        service_date,
        start_time,
        end_time,
        status,
        appointments (
          status,
          confirmation_status,
          booking_source,
          confirmation_deadline_at
        )
      `
      )
      .eq("service_date", selectedDate),
    adminSupabase
      .from("staff_time_blocks")
      .select("*")
      .eq("block_date", selectedDate),
    adminSupabase.from("resources").select("*").eq("active", true),
    adminSupabase.from("service_resources").select("*").eq("active", true),
  ]);

  const timeBlocksPermissionDenied =
    blocksResult.error?.code === "42501" && allowMissingTimeBlocks;
  const firstError = [
    servicesResult.error,
    staffResult.error,
    schedulesResult.error,
    staffServicesResult.error,
    existingServicesResult.error,
    timeBlocksPermissionDenied ? null : blocksResult.error,
    resourcesResult.error,
    serviceResourcesResult.error,
  ].find(Boolean);

  if (firstError) throw firstError;

  const servicesById = new Map(
    (servicesResult.data || []).map((item) => [item.id, item])
  );
  const selectedServices = ids
    .map((id) => servicesById.get(id))
    .filter(Boolean);

  if (selectedServices.length !== ids.length) {
    throw new Error("Alguno de los servicios seleccionados ya no está disponible.");
  }

  const totalDuration = selectedServices.reduce(
    (sum, service) => sum + getServiceDuration(service),
    0
  );

  if (totalDuration <= 0) {
    throw new Error("Los servicios seleccionados no tienen duración registrada.");
  }

  const staffToCheck = (staffResult.data || [])
    .filter((person) => !preferredStaffId || person.id === preferredStaffId)
    .filter((person) =>
      staffCanDoAllServices(person, ids, staffServicesResult.data || [])
    );

  const slots = [];

  for (const person of staffToCheck) {
    const schedule = getScheduleForStaff(
      person.id,
      selectedDate,
      schedulesResult.data || []
    );
    const candidateTimes = requestedStartTime
      ? [formatTime(requestedStartTime)]
      : getCandidateTimes(schedule, totalDuration);

    for (const startTime of candidateTimes) {
      if (!startTime) continue;

      const isFree = staffIsFree({
        person,
        date: selectedDate,
        startTime,
        totalDuration,
        schedules: schedulesResult.data || [],
        existingServices: existingServicesResult.data || [],
        blocksForDate: blocksResult.data || [],
        now,
      });

      if (!isFree) continue;

      const segments = buildServiceSegments(
        selectedServices,
        startTime,
        person.id,
        selectedDate
      );

      const resourcesFree = resourcesAreFree({
        segments,
        existingServices: existingServicesResult.data || [],
        resources: resourcesResult.data || [],
        serviceResources: serviceResourcesResult.data || [],
        now,
      });

      if (!resourcesFree) continue;

      slots.push({
        staff_id: person.id,
        staff_name: person.full_name || "Colaboradora disponible",
        staff_photo_url: person.photo_url || person.image_url || null,
        start_time: startTime,
        end_time: addMinutesToTime(startTime, totalDuration),
        duration_minutes: totalDuration,
        service_segments: segments,
      });
    }
  }

  return {
    slots: slots
      .sort((a, b) => {
        const timeCompare = a.start_time.localeCompare(b.start_time);
        if (timeCompare !== 0) return timeCompare;
        return a.staff_name.localeCompare(b.staff_name);
      })
      .slice(0, Number(limit || 24)),
    selected_services: selectedServices,
    total_duration_minutes: totalDuration,
    warnings: timeBlocksPermissionDenied
      ? [{ code: "staff_time_blocks_permission_denied" }]
      : [],
  };
}
