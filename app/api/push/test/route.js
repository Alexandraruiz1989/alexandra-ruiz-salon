import { NextResponse } from "next/server";
import {
  createAdminClient,
  getSessionProfile,
  sendPushToSubscriptions,
} from "../../../lib/pushServer";

function errorResponse(error, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error:
        error?.message ||
        error ||
        "No se pudo enviar la notificación de prueba.",
    },
    { status }
  );
}

async function loadCurrentDeviceSubscriptions(adminSupabase, session) {
  const authUserId = session.user?.id;
  const staffId = session.profile?.staff_id;

  let query = adminSupabase
    .from("push_subscriptions")
    .select("*")
    .eq("active", true);

  if (authUserId && staffId) {
    query = query.or(`auth_user_id.eq.${authUserId},staff_id.eq.${staffId}`);
  } else if (authUserId) {
    query = query.eq("auth_user_id", authUserId);
  } else if (staffId) {
    query = query.eq("staff_id", staffId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return data || [];
}

export async function POST(request) {
  try {
    const adminSupabase = createAdminClient();
    const session = await getSessionProfile(request, adminSupabase);

    if (session.error) {
      return errorResponse(session.error, session.status || 400);
    }

    const subscriptions = await loadCurrentDeviceSubscriptions(
      adminSupabase,
      session
    );

    if (subscriptions.length === 0) {
      return errorResponse(
        "No encontré una suscripción activa para este usuario. Activa las notificaciones primero.",
        404
      );
    }

    const result = await sendPushToSubscriptions(adminSupabase, subscriptions, {
      title: "Alexandra Ruiz Salón",
      body: "Notificación de prueba activada correctamente.",
      url: "/admin/notificaciones",
      type: "test",
    });

    if (result.error) return errorResponse(result.error, 400);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
