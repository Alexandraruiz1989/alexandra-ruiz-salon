import { NextResponse } from "next/server";
import {
  createClientPortalAdmin,
  getClientPortalProfile,
  getAuthUserFromRequest,
} from "../../../lib/clientPortalServer";
import { mapClientPortalCatalog } from "../../../lib/clientPortalCatalog.js";

function errorResponse(error, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error: error?.message || error || "No se pudieron cargar los servicios.",
    },
    { status }
  );
}

export async function GET(request) {
  try {
    const adminSupabase = createClientPortalAdmin();
    const session = await getAuthUserFromRequest(request, adminSupabase);

    if (session.error) {
      return errorResponse(session.error, session.status || 401);
    }

    const profile = await getClientPortalProfile(
      adminSupabase,
      session.user
    );

    const [servicesResult, staffResult, staffServicesResult] = await Promise.all([
      adminSupabase
        .from("services")
        .select(
          "id, name, category, description, base_price, duration_minutes, cleanup_minutes, active, service_type, variable_pricing, bot_active, bot_bookable"
        )
        .eq("active", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true }),
      adminSupabase
        .from("staff")
        .select("id, full_name, photo_url")
        .eq("active", true)
        .order("full_name", { ascending: true }),
      adminSupabase
        .from("staff_services")
        .select("staff_id, service_id")
        .eq("active", true),
    ]);

    if (servicesResult.error) throw servicesResult.error;
    if (staffResult.error) throw staffResult.error;
    if (staffServicesResult.error) throw staffServicesResult.error;

    const catalog = mapClientPortalCatalog({
      services: servicesResult.data || [],
      staff: staffResult.data || [],
      staffServices: staffServicesResult.data || [],
    });

    return NextResponse.json({
      success: true,
      ...catalog,
      profile: {
        complete: profile.profile_complete,
        required: profile.profile_required,
      },
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
