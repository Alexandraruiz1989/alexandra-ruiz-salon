import { NextResponse } from "next/server";
import {
  createAdminClient,
  getSessionProfile,
  normalizeRole,
  sendPushForNotifications,
} from "../../../lib/pushServer";

const rolesThatNotifyAdmin = ["tecnica", "encargada", "caja"];

function cleanText(value) {
  return String(value || "").trim();
}

function getActorName(session) {
  return (
    cleanText(session.profile?.full_name) ||
    cleanText(session.profile?.email) ||
    cleanText(session.user?.email) ||
    "Usuario del sistema"
  );
}

function buildNotificationText({ eventType, actorName, clientName, summary }) {
  const safeClientName = cleanText(clientName) || "una clienta";
  const safeSummary = cleanText(summary);

  const titles = {
    cita_nueva_admin: `Nueva cita creada por ${actorName}`,
    cita_actualizada_admin: `Cita modificada por ${actorName}`,
    cita_servicios_admin: `Servicios actualizados por ${actorName}`,
    cita_cancelada_admin: `Cita cancelada por ${actorName}`,
  };

  const messages = {
    cita_nueva_admin: `Nueva cita creada por ${actorName} para ${safeClientName}.`,
    cita_actualizada_admin: `Cita modificada por ${actorName} para ${safeClientName}.`,
    cita_servicios_admin: `Se actualizaron servicios de una cita por ${actorName} para ${safeClientName}.`,
    cita_cancelada_admin: `Cita cancelada por ${actorName} para ${safeClientName}.`,
  };

  return {
    title: titles[eventType] || `Movimiento de cita por ${actorName}`,
    message: `${messages[eventType] || messages.cita_actualizada_admin}${
      safeSummary ? ` ${safeSummary}` : ""
    }`,
  };
}

function errorResponse(error, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error:
        error?.message ||
        error ||
        "No se pudo crear notificación para admin.",
    },
    { status }
  );
}

export async function POST(request) {
  try {
    const adminSupabase = createAdminClient();
    const session = await getSessionProfile(request, adminSupabase);

    if (session.error) {
      return errorResponse(session.error, session.status || 400);
    }

    const role = normalizeRole(session.profile?.role);

    if (!rolesThatNotifyAdmin.includes(role)) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "El rol actual no requiere notificar al admin.",
      });
    }

    const body = await request.json();
    const appointmentId = cleanText(body.appointment_id);

    if (!appointmentId) {
      return errorResponse("Falta el ID de la cita.", 400);
    }

    const actorName = getActorName(session);
    const eventType = cleanText(body.event_type) || "cita_actualizada_admin";
    const { title, message } = buildNotificationText({
      eventType,
      actorName,
      clientName: body.client_name,
      summary: body.summary,
    });

    const { data: adminProfiles, error: adminProfilesError } =
      await adminSupabase
        .from("user_profiles")
        .select("auth_user_id, email, staff_id, active, role")
        .eq("active", true)
        .ilike("role", "admin");

    if (adminProfilesError) {
      return errorResponse(adminProfilesError.message, 400);
    }

    const currentUserId = session.user?.id;
    const rows = (adminProfiles || [])
      .filter((profile) => profile.auth_user_id !== currentUserId)
      .map((profile) => ({
        staff_id: profile.staff_id || null,
        recipient_auth_user_id: profile.auth_user_id || null,
        recipient_email: cleanText(profile.email).toLowerCase() || null,
        created_by_auth_user_id: currentUserId || null,
        created_by_email: cleanText(session.user?.email).toLowerCase() || null,
        title,
        message,
        notification_type: eventType,
        related_table: "appointments",
        related_id: appointmentId,
        is_read: false,
      }));

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "No hay admins activos para notificar.",
      });
    }

    const { data: notifications, error: notificationsError } =
      await adminSupabase.from("notifications").insert(rows).select("id");

    if (notificationsError) {
      return errorResponse(notificationsError.message, 400);
    }

    const pushResult = await sendPushForNotifications(
      adminSupabase,
      (notifications || []).map((notification) => notification.id)
    );

    return NextResponse.json({
      success: true,
      notifications_created: notifications?.length || 0,
      push: pushResult,
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
