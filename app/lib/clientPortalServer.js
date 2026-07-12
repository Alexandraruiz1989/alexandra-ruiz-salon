import { createClient } from "@supabase/supabase-js";
import { sendPushForNotifications } from "./pushServer";

const CLIENT_COLUMNS =
  "id, full_name, phone, email, client_number, auth_user_id, created_at, updated_at";

export function cleanText(value) {
  return String(value || "").trim();
}

export function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

export function normalizePhoneDigits(value) {
  return cleanText(value).replace(/\D/g, "");
}

export function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function formatTime(value) {
  return cleanText(value).slice(0, 5);
}

export function createClientPortalAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

export async function getAuthUserFromRequest(request, adminSupabase) {
  const token = getBearerToken(request);

  if (!token) {
    return {
      error: "Tu sesión expiró. Vuelve a iniciar sesión.",
      status: 401,
    };
  }

  const { data, error } = await adminSupabase.auth.getUser(token);

  if (error || !data?.user) {
    return {
      error: "Tu sesión expiró. Vuelve a iniciar sesión.",
      status: 401,
    };
  }

  return { token, user: data.user };
}

async function getNextClientNumber(adminSupabase) {
  const { data, error } = await adminSupabase
    .from("clients")
    .select("client_number")
    .not("client_number", "is", null);

  if (error) throw error;

  const maxNumber = (data || []).reduce((max, item) => {
    const match = String(item.client_number || "").match(/CL-(\d+)/i);
    const number = match ? Number(match[1]) : 0;
    return Number.isFinite(number) && number > max ? number : max;
  }, 0);

  return `CL-${String(maxNumber + 1).padStart(4, "0")}`;
}

async function findClientByPhoneDigits(adminSupabase, phone) {
  const targetDigits = normalizePhoneDigits(phone);
  if (!targetDigits) return null;

  const { data, error } = await adminSupabase
    .from("clients")
    .select(CLIENT_COLUMNS)
    .not("phone", "is", null)
    .limit(1500);

  if (error) throw error;

  return (
    (data || []).find(
      (client) => normalizePhoneDigits(client.phone) === targetDigits
    ) || null
  );
}

export async function findClientForUser(adminSupabase, user) {
  if (!user?.id) return null;

  const email = normalizeEmail(user.email);

  const { data: byAuth, error: authError } = await adminSupabase
    .from("clients")
    .select(CLIENT_COLUMNS)
    .eq("auth_user_id", user.id)
    .limit(1);

  if (authError) throw authError;
  if (byAuth?.[0]) return byAuth[0];

  if (email) {
    const { data: byEmail, error: emailError } = await adminSupabase
      .from("clients")
      .select(CLIENT_COLUMNS)
      .ilike("email", email)
      .limit(1);

    if (emailError) throw emailError;
    if (byEmail?.[0]) return byEmail[0];
  }

  const metadataPhone = user.user_metadata?.phone || user.phone || "";
  return findClientByPhoneDigits(adminSupabase, metadataPhone);
}

export async function ensureClientForUser(adminSupabase, user, details = {}) {
  const email = normalizeEmail(details.email || user?.email);
  const fullName =
    cleanText(details.full_name) ||
    cleanText(details.fullName) ||
    cleanText(user?.user_metadata?.full_name) ||
    cleanText(user?.user_metadata?.name);
  const phone =
    cleanText(details.phone) ||
    cleanText(user?.user_metadata?.phone) ||
    cleanText(user?.phone);

  let client = await findClientForUser(adminSupabase, user);

  if (!client && phone) {
    client = await findClientByPhoneDigits(adminSupabase, phone);
  }

  if (client) {
    const updates = {
      auth_user_id: client.auth_user_id || user.id,
      email: normalizeEmail(client.email) || email || null,
      phone: cleanText(client.phone) || phone || null,
      full_name: cleanText(client.full_name) || fullName || "Clienta",
      updated_at: new Date().toISOString(),
    };

    if (!client.client_number) {
      updates.client_number = await getNextClientNumber(adminSupabase);
    }

    const { data, error } = await adminSupabase
      .from("clients")
      .update(updates)
      .eq("id", client.id)
      .select(CLIENT_COLUMNS)
      .single();

    if (error) throw error;
    return data;
  }

  if (!fullName || !phone) {
    throw new Error(
      "Completa tu nombre y teléfono para crear tu perfil de clienta."
    );
  }

  const payload = {
    auth_user_id: user.id,
    full_name: fullName,
    phone,
    email: email || null,
    client_number: await getNextClientNumber(adminSupabase),
  };

  const { data, error } = await adminSupabase
    .from("clients")
    .insert([payload])
    .select(CLIENT_COLUMNS)
    .single();

  if (error) throw error;

  return data;
}

export async function updateClientProfile(adminSupabase, clientId, details = {}) {
  const fullName = cleanText(details.full_name);
  const phone = cleanText(details.phone);

  if (!fullName || !phone) {
    throw new Error("El nombre y teléfono son obligatorios.");
  }

  const { data, error } = await adminSupabase
    .from("clients")
    .update({
      full_name: fullName,
      phone,
      updated_at: new Date().toISOString(),
    })
    .eq("id", clientId)
    .select(CLIENT_COLUMNS)
    .single();

  if (error) throw error;

  return data;
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

function isCancelledAppointment(status) {
  const normalized = cleanText(status).toLowerCase();
  return ["cancelada", "cancelado", "cancelled", "rechazada"].includes(
    normalized
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
    if (item.staff_id !== person.id) return false;
    if (isCancelledAppointment(item.appointments?.status)) return false;
    return timesOverlap(startTime, endTime, item.start_time, item.end_time);
  });

  if (appointmentConflict) return false;

  return !(blocksForDate || []).some((block) => {
    if (block.staff_id !== person.id) return false;
    return timesOverlap(startTime, endTime, block.start_time, block.end_time);
  });
}

function resourcesAreFree({ segments, existingServices, resources, serviceResources }) {
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
          isCancelledAppointment(existing.appointments?.status) ||
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
        appointments (
          status
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

  const firstError = [
    servicesResult.error,
    staffResult.error,
    schedulesResult.error,
    staffServicesResult.error,
    existingServicesResult.error,
    blocksResult.error,
    resourcesResult.error,
    serviceResourcesResult.error,
  ].find(Boolean);

  if (firstError) throw firstError;

  const servicesById = new Map((servicesResult.data || []).map((item) => [item.id, item]));
  const selectedServices = ids.map((id) => servicesById.get(id)).filter(Boolean);

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
  };
}

export async function getSalonContact(adminSupabase) {
  const { data } = await adminSupabase
    .from("business_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  const whatsapp = cleanText(data?.whatsapp_phone);
  const digits = normalizePhoneDigits(whatsapp);

  return {
    business_name: cleanText(data?.business_name) || "Alexandra Ruiz Salón",
    whatsapp_phone: whatsapp,
    whatsapp_url: digits ? `https://wa.me/${digits}` : "",
  };
}

export async function notifyAdminsForClientAppointment({
  adminSupabase,
  appointmentId,
  clientName,
  summary,
  user,
  type = "cliente_portal_solicitud",
}) {
  const { data: adminProfiles, error: adminProfilesError } = await adminSupabase
    .from("user_profiles")
    .select("auth_user_id, email, staff_id, active, role")
    .eq("active", true)
    .ilike("role", "admin");

  if (adminProfilesError) throw adminProfilesError;

  const title = "Nueva solicitud desde portal de clientas";
  const message = `Nueva solicitud de cita desde portal de clientas para ${
    cleanText(clientName) || "una clienta"
  }. ${cleanText(summary)}`;

  const rows = (adminProfiles || []).map((profile) => ({
    staff_id: profile.staff_id || null,
    recipient_auth_user_id: profile.auth_user_id || null,
    recipient_email: normalizeEmail(profile.email) || null,
    created_by_auth_user_id: user?.id || null,
    created_by_email: normalizeEmail(user?.email) || null,
    title,
    message,
    notification_type: type,
    related_table: "appointments",
    related_id: appointmentId,
    is_read: false,
  }));

  if (rows.length === 0) {
    return { notifications_created: 0, push: { skipped: true } };
  }

  const { data, error } = await adminSupabase
    .from("notifications")
    .insert(rows)
    .select("id");

  if (error) throw error;

  const ids = (data || []).map((notification) => notification.id);
  const push = await sendPushForNotifications(adminSupabase, ids);

  return {
    notifications_created: ids.length,
    push,
  };
}
