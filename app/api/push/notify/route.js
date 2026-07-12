import { NextResponse } from "next/server";
import {
  createAdminClient,
  getSessionProfile,
  normalizeRole,
  sendPushForNotifications,
} from "../../../lib/pushServer";

const allowedTriggerRoles = ["admin", "encargada", "caja"];

function errorResponse(error, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error:
        error?.message ||
        error ||
        "No se pudieron enviar las notificaciones push.",
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

    if (!allowedTriggerRoles.includes(role)) {
      return errorResponse(
        "No tienes permiso para enviar notificaciones push.",
        403
      );
    }

    const body = await request.json();
    const notificationIds = Array.isArray(body.notification_ids)
      ? body.notification_ids
      : [];

    const result = await sendPushForNotifications(
      adminSupabase,
      notificationIds
    );

    if (result.error) return errorResponse(result.error, 400);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
