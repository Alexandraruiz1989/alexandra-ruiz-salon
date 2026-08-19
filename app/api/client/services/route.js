import { NextResponse } from "next/server";
import {
  createClientPortalAdmin,
  ensureClientForUser,
  getAuthUserFromRequest,
} from "../../../lib/clientPortalServer";
import { isPortalBookableService } from "../../../lib/appointmentWriteContracts.js";

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

    await ensureClientForUser(adminSupabase, session.user);

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

    const staffIdsByService = (staffServicesResult.data || []).reduce(
      (result, item) => {
        if (!item.service_id || !item.staff_id) return result;
        if (!result[item.service_id]) result[item.service_id] = [];
        result[item.service_id].push(item.staff_id);
        return result;
      },
      {}
    );

    return NextResponse.json({
      success: true,
      services: (servicesResult.data || [])
        .filter(isPortalBookableService)
        .map((service) => ({
          id: service.id,
          name: service.name,
          category: service.category || "Servicios",
          description: service.description || "",
          base_price: Number(service.base_price || 0),
          duration_minutes: Number(service.duration_minutes || 0),
          cleanup_minutes: Number(service.cleanup_minutes || 0),
          bookable_staff_ids: staffIdsByService[service.id] || [],
        })),
      staff: (staffResult.data || []).map((person) => ({
        id: person.id,
        full_name: person.full_name,
        photo_url: person.photo_url || person.image_url || null,
      })),
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
