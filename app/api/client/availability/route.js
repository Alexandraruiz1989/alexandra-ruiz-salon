import { NextResponse } from "next/server";
import {
  cleanText,
  createClientPortalAdmin,
  getClientPortalProfile,
  getAuthUserFromRequest,
  getAvailability,
} from "../../../lib/clientPortalServer";
import { prepareClientPortalAppointment } from "../../../lib/appointmentChannelAdapters.js";
import {
  isPortalBookableService,
  slotMeetsMinimumNotice,
} from "../../../lib/appointmentWriteContracts.js";

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

    const profile = await getClientPortalProfile(adminSupabase, session.user);
    if (!profile.profile_complete || !profile.client) {
      return errorResponse(
        "Completa tu perfil con nombre y teléfono antes de buscar horarios.",
        409
      );
    }
    const client = profile.client;

    const body = await request.json();
    const result = await getAvailability({
      adminSupabase,
      date: cleanText(body.date),
      serviceIds: Array.isArray(body.service_ids) ? body.service_ids : [],
      preferredStaffId: cleanText(body.preferred_staff_id),
      limit: 30,
    });
    if (!(result.selected_services || []).every(isPortalBookableService)) {
      return errorResponse(
        "Uno de los servicios seleccionados requiere revisión del equipo.",
        409
      );
    }
    const eligibleSlots = result.slots.filter((slot) =>
      slotMeetsMinimumNotice({
        date: cleanText(body.date),
        startTime: slot.start_time,
        staffName: slot.staff_name,
      })
    );

    return NextResponse.json({
      success: true,
      total_duration_minutes: result.total_duration_minutes,
      warnings: result.warnings || [],
      slots: eligibleSlots.map((slot) => {
        const preview = prepareClientPortalAppointment({
          actorId: session.user.id,
          client: {
            id: client.id,
            name: client.full_name,
            phone: client.phone,
          },
          slot: { ...slot, date: cleanText(body.date) },
        });
        return {
          staff_id: slot.staff_id,
          staff_name: slot.staff_name,
          staff_photo_url: slot.staff_photo_url,
          start_time: slot.start_time,
          end_time: slot.end_time,
          duration_minutes: slot.duration_minutes,
          preview: {
            id: preview.previewId,
            version: preview.previewVersion,
            confirmation_id: preview.confirmationId,
            request_hash: preview.requestHash,
            expires_at: preview.previewExpiresAt,
            expected_price: preview.expectedPrice,
            services: preview.services.map((service) => ({
              id: service.id,
              name: service.name,
              duration_minutes: service.durationMinutes,
              cleanup_minutes: service.cleanupMinutes,
              price: service.price,
            })),
          },
        };
      }),
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
