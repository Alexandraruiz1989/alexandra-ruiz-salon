import { NextResponse } from "next/server";
import {
  createAdminClient,
  getSessionProfile,
} from "../../../lib/pushServer";

function cleanText(value) {
  return String(value || "").trim();
}

function getSubscriptionPayload(subscription) {
  const endpoint = cleanText(subscription?.endpoint);
  const p256dh = cleanText(subscription?.keys?.p256dh);
  const auth = cleanText(subscription?.keys?.auth);

  if (!endpoint || !p256dh || !auth) {
    throw new Error("La suscripción del dispositivo está incompleta.");
  }

  return { endpoint, p256dh, auth };
}

function errorResponse(error, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error: error?.message || error || "No se pudo registrar el dispositivo.",
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

    const body = await request.json();
    const subscription = getSubscriptionPayload(body.subscription);
    const userEmail = cleanText(session.user?.email).toLowerCase() || null;

    const { data, error } = await adminSupabase
      .from("push_subscriptions")
      .upsert(
        [
          {
            auth_user_id: session.user.id,
            user_email: userEmail,
            staff_id: session.profile?.staff_id || null,
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
            user_agent:
              cleanText(body.user_agent) ||
              request.headers.get("user-agent") ||
              null,
            active: true,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: "endpoint" }
      )
      .select("id, staff_id, active")
      .single();

    if (error) {
      const detail = String(error.message || "");
      const permissionMessage = detail.toLowerCase().includes("permission denied")
        ? "No se pudo guardar la suscripción push con service role. Revisa que SUPABASE_SERVICE_ROLE_KEY sea la llave service_role en Vercel y ejecuta el SQL actualizado de notificaciones push."
        : detail;

      return errorResponse(permissionMessage, 400);
    }

    return NextResponse.json({
      success: true,
      subscription: data,
      message: "Notificaciones activadas en este dispositivo.",
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
