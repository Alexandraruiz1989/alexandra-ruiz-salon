import { createClient } from "@supabase/supabase-js";
import { sendPushForNotifications } from "./pushServer";
import {
  addMinutesToTime,
  cleanText,
  formatTime,
  getAvailability,
  getDayOfWeek,
  getServiceDuration,
  minutesToTime,
  timeToMinutes,
  timesOverlap,
} from "./bookingAvailability";
import {
  getClientDetailsFromUser,
  isClientProfileComplete,
  normalizeEmail,
  normalizePhoneDigits,
} from "./clientPortalProfile.js";

export {
  addMinutesToTime,
  cleanText,
  formatTime,
  getAvailability,
  getDayOfWeek,
  getServiceDuration,
  minutesToTime,
  timeToMinutes,
  timesOverlap,
};

const CLIENT_COLUMNS =
  "id, full_name, phone, email, client_number, auth_user_id, created_at, updated_at";

export {
  getClientDetailsFromUser,
  isClientProfileComplete,
  normalizeEmail,
  normalizePhoneDigits,
};

export function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
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
  const { email, fullName, phone } = getClientDetailsFromUser(user, details);

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

export async function getClientPortalProfile(adminSupabase, user, details = {}) {
  const normalizedDetails = getClientDetailsFromUser(user, details);
  let client = await findClientForUser(adminSupabase, user);

  if (
    client ||
    (normalizedDetails.fullName &&
      normalizePhoneDigits(normalizedDetails.phone).length >= 8)
  ) {
    client = await ensureClientForUser(adminSupabase, user, {
      full_name: normalizedDetails.fullName,
      phone: normalizedDetails.phone,
      email: normalizedDetails.email,
    });
  }

  return {
    client,
    profile_complete: isClientProfileComplete(client),
    profile_required: !isClientProfileComplete(client),
  };
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
