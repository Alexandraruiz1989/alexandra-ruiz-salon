import { NextResponse } from "next/server";
import {
  cleanText,
  createClientPortalAdmin,
  ensureClientForUser,
  getAuthUserFromRequest,
  getAvailability,
} from "../../../lib/clientPortalServer";

function errorResponse(error, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error: error?.message || error || "No se pudo revisar disponibilidad.",
    },
    { status }
  );
}

export async function POST(request) {
  try {
    const adminSupabase = createClientPortalAdmin();
    const session = await getAuthUserFromRequest(request, adminSupabase);

    if (session.error) {
      return errorResponse(session.error, session.status || 401);
    }

    await ensureClientForUser(adminSupabase, session.user);

    const body = await request.json();
    const result = await getAvailability({
      adminSupabase,
      date: cleanText(body.date),
      serviceIds: Array.isArray(body.service_ids) ? body.service_ids : [],
      preferredStaffId: cleanText(body.preferred_staff_id),
      limit: 30,
    });

    return NextResponse.json({
      success: true,
      ...result,
      slots: result.slots.map((slot) => ({
        staff_id: slot.staff_id,
        staff_name: slot.staff_name,
        staff_photo_url: slot.staff_photo_url,
        start_time: slot.start_time,
        end_time: slot.end_time,
        duration_minutes: slot.duration_minutes,
      })),
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
