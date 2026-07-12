import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

export function normalizeRole(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function getBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

export function createAdminClient() {
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

export function getPushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || "";
}

export function isPushConfigured() {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
}

export function configureWebPush() {
  if (!isPushConfigured()) {
    return false;
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  return true;
}

export async function getSessionProfile(request, adminSupabase) {
  const token = getBearerToken(request);

  if (!token) {
    return {
      error: "Tu sesión expiró. Vuelve a iniciar sesión.",
      status: 401,
    };
  }

  const { data: userData, error: userError } =
    await adminSupabase.auth.getUser(token);

  if (userError || !userData?.user) {
    return {
      error: "Tu sesión expiró. Vuelve a iniciar sesión.",
      status: 401,
    };
  }

  const user = userData.user;
  const userEmail = normalizeEmail(user.email);

  const { data: profilesById, error: profileByIdError } = await adminSupabase
    .from("user_profiles")
    .select("id, auth_user_id, email, full_name, role, active, staff_id")
    .eq("auth_user_id", user.id)
    .limit(1);

  if (profileByIdError) {
    console.warn("[push] profile_by_id_error", profileByIdError.message);
  }

  let profile = profilesById?.[0] || null;

  if (!profile && userEmail) {
    const { data: profilesByEmail, error: profileByEmailError } =
      await adminSupabase
        .from("user_profiles")
        .select("id, auth_user_id, email, full_name, role, active, staff_id")
        .ilike("email", userEmail)
        .limit(1);

    if (profileByEmailError) {
      console.warn("[push] profile_by_email_error", profileByEmailError.message);
    }

    profile = profilesByEmail?.[0] || null;
  }

  if (!profile) {
    return {
      error: "No encontré tu perfil de acceso. Revisa /admin/accesos.",
      status: 403,
      user,
    };
  }

  if (profile.active === false) {
    return {
      error: "Tu acceso está desactivado.",
      status: 403,
      user,
      profile,
    };
  }

  return { token, user, profile };
}

export function getNotificationUrl(notification) {
  if (notification?.related_table === "staff_tasks") return "/admin/tareas";
  if (notification?.related_table === "appointments") return "/admin/agenda";
  return "/admin/notificaciones";
}

export async function sendPushToSubscriptions(adminSupabase, subscriptions, payload) {
  if (!configureWebPush()) {
    return {
      sent: 0,
      failed: 0,
      skipped: true,
      error: "Faltan variables VAPID para enviar push.",
    };
  }

  let sent = 0;
  let failed = 0;

  for (const subscription of subscriptions || []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        JSON.stringify(payload)
      );

      sent += 1;
    } catch (error) {
      failed += 1;
      console.warn("[push] send_error", {
        endpoint: subscription.endpoint,
        statusCode: error?.statusCode || null,
        message: error?.message || null,
      });

      if ([404, 410].includes(Number(error?.statusCode))) {
        await adminSupabase
          .from("push_subscriptions")
          .update({
            active: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", subscription.id);
      }
    }
  }

  return { sent, failed, skipped: false };
}

async function loadSubscriptionsForStaff(adminSupabase, staffId) {
  const subscriptionMap = new Map();

  const addSubscriptions = (items = []) => {
    items.forEach((item) => {
      if (item?.endpoint) {
        subscriptionMap.set(item.endpoint, item);
      }
    });
  };

  const { data: staffSubscriptions, error: staffSubscriptionsError } =
    await adminSupabase
      .from("push_subscriptions")
      .select("*")
      .eq("staff_id", staffId)
      .eq("active", true);

  if (staffSubscriptionsError) throw staffSubscriptionsError;

  addSubscriptions(staffSubscriptions);

  const { data: profiles, error: profilesError } = await adminSupabase
    .from("user_profiles")
    .select("auth_user_id, email")
    .eq("staff_id", staffId)
    .eq("active", true);

  if (profilesError) {
    console.warn("[push] staff_profiles_error", profilesError.message);
    return [...subscriptionMap.values()];
  }

  const authUserIds = [
    ...new Set((profiles || []).map((profile) => profile.auth_user_id).filter(Boolean)),
  ];
  const emails = [
    ...new Set((profiles || []).map((profile) => normalizeEmail(profile.email)).filter(Boolean)),
  ];

  if (authUserIds.length > 0) {
    const { data: authSubscriptions, error: authSubscriptionsError } =
      await adminSupabase
        .from("push_subscriptions")
        .select("*")
        .in("auth_user_id", authUserIds)
        .eq("active", true);

    if (authSubscriptionsError) throw authSubscriptionsError;

    addSubscriptions(authSubscriptions);
  }

  if (emails.length > 0) {
    const { data: emailSubscriptions, error: emailSubscriptionsError } =
      await adminSupabase
        .from("push_subscriptions")
        .select("*")
        .in("user_email", emails)
        .eq("active", true);

    if (emailSubscriptionsError) throw emailSubscriptionsError;

    addSubscriptions(emailSubscriptions);
  }

  return [...subscriptionMap.values()];
}

async function loadSubscriptionsForRecipient(adminSupabase, notification) {
  const subscriptionMap = new Map();

  const addSubscriptions = (items = []) => {
    items.forEach((item) => {
      if (item?.endpoint) {
        subscriptionMap.set(item.endpoint, item);
      }
    });
  };

  if (notification.staff_id) {
    const staffSubscriptions = await loadSubscriptionsForStaff(
      adminSupabase,
      notification.staff_id
    );
    addSubscriptions(staffSubscriptions);
  }

  if (notification.recipient_auth_user_id) {
    const { data, error } = await adminSupabase
      .from("push_subscriptions")
      .select("*")
      .eq("auth_user_id", notification.recipient_auth_user_id)
      .eq("active", true);

    if (error) throw error;
    addSubscriptions(data);
  }

  if (notification.recipient_email) {
    const { data, error } = await adminSupabase
      .from("push_subscriptions")
      .select("*")
      .ilike("user_email", normalizeEmail(notification.recipient_email))
      .eq("active", true);

    if (error) throw error;
    addSubscriptions(data);
  }

  return [...subscriptionMap.values()];
}

export async function sendPushForNotifications(adminSupabase, notificationIds = []) {
  const ids = [...new Set((notificationIds || []).filter(Boolean))];

  if (ids.length === 0) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const { data: notifications, error: notificationsError } = await adminSupabase
    .from("notifications")
    .select("*")
    .in("id", ids);

  if (notificationsError) {
    return {
      sent: 0,
      failed: 0,
      skipped: true,
      error: notificationsError.message,
    };
  }

  let totalSent = 0;
  let totalFailed = 0;
  let firstError = "";

  for (const notification of notifications || []) {
    if (
      !notification.staff_id &&
      !notification.recipient_auth_user_id &&
      !notification.recipient_email
    ) {
      continue;
    }

    let subscriptions = [];

    try {
      subscriptions = await loadSubscriptionsForRecipient(adminSupabase, notification);
    } catch (error) {
      totalFailed += 1;
      firstError = firstError || error.message || "No se pudieron cargar suscripciones.";
      continue;
    }

    const result = await sendPushToSubscriptions(adminSupabase, subscriptions, {
      title: notification.title || "Alexandra Ruiz Salón",
      body: notification.message || "Tienes una nueva notificación.",
      url: getNotificationUrl(notification),
      notification_id: notification.id,
      type: notification.notification_type || "notificacion",
    });

    totalSent += result.sent || 0;
    totalFailed += result.failed || 0;
    firstError = firstError || result.error || "";
  }

  return {
    sent: totalSent,
    failed: totalFailed,
    skipped: false,
    error: firstError || undefined,
  };
}
