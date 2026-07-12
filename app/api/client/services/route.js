import { NextResponse } from "next/server";
import {
  createClientPortalAdmin,
  ensureClientForUser,
  getAuthUserFromRequest,
} from "../../../lib/clientPortalServer";

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

    const [servicesResult, staffResult] = await Promise.all([
      adminSupabase
        .from("services")
        .select("*")
        .eq("active", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true }),
      adminSupabase
        .from("staff")
        .select("*")
        .eq("active", true)
        .order("full_name", { ascending: true }),
    ]);

    if (servicesResult.error) throw servicesResult.error;
    if (staffResult.error) throw staffResult.error;

    return NextResponse.json({
      success: true,
      services: servicesResult.data || [],
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
