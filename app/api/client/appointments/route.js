import { NextResponse } from "next/server";
import {
  cleanText,
  createClientPortalAdmin,
  ensureClientForUser,
  formatMoney,
  formatTime,
  getAvailability,
  getClientPortalProfile,
  getSalonContact,
  getAuthUserFromRequest,
  notifyAdminsForClientAppointment,
} from "../../../lib/clientPortalServer";
import {
  confirmClientPortalAppointment,
  prepareClientPortalAppointment,
} from "../../../lib/appointmentChannelAdapters.js";
import {
  hasForbiddenWriteControls,
  isPortalBookableService,
  slotMeetsMinimumNotice,
} from "../../../lib/appointmentWriteContracts.js";
import { createAppointmentTransactionalRepository } from "../../../lib/appointmentTransactionalRepository.js";

function errorResponse(error, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error:
        error?.message ||
        error ||
        "No se pudo procesar la solicitud de cita.",
    },
    { status }
  );
}

function getAppointmentDateTime(appointment) {
  return new Date(
    `${appointment.appointment_date}T${formatTime(
      appointment.start_time || "00:00"
    )}:00`
  );
}

function canClientCancelAppointment(appointment) {
  const status = cleanText(appointment.status).toLowerCase();
  const confirmationStatus = cleanText(
    appointment.confirmation_status || appointment.attendance_status
  ).toLowerCase();

  if (["cancelada", "cancelado", "realizada"].includes(status)) return false;
  if (["cancelada", "rechazada", "realizada"].includes(confirmationStatus)) {
    return false;
  }

  if (confirmationStatus === "pendiente") return true;

  const appointmentDate = getAppointmentDateTime(appointment);
  const hoursDiff = (appointmentDate.getTime() - Date.now()) / 36e5;

  return hoursDiff >= 24;
}

function isActiveAppointmentService(service) {
  const status = cleanText(service?.status || "agendado").toLowerCase();
  return ![
    "cancelada",
    "cancelado",
    "cancelled",
    "canceled",
    "rechazada",
    "eliminada",
    "eliminado",
    "deleted",
    "inactiva",
    "inactivo",
  ].includes(status);
}

function getPrimaryAppointmentTime(appointment) {
  const services = (appointment.appointment_services || [])
    .filter(isActiveAppointmentService)
    .map((service) => formatTime(service.start_time))
    .filter(Boolean)
    .sort();

  return services[0] || formatTime(appointment.start_time);
}

function mapAppointmentForClient(appointment) {
  const services = (appointment.appointment_services || []).filter(
    isActiveAppointmentService
  );
  const total =
    Number(appointment.estimated_total || 0) ||
    services.reduce((sum, item) => sum + Number(item.total_price || 0), 0);

  return {
    id: appointment.id,
    appointment_date: appointment.appointment_date,
    start_time: getPrimaryAppointmentTime(appointment),
    end_time: formatTime(appointment.end_time),
    status: appointment.status || "agendada",
    confirmation_status:
      appointment.confirmation_status || appointment.attendance_status || "pendiente",
    attendance_status: appointment.attendance_status || "pendiente",
    total_estimate: total,
    total_estimate_text: formatMoney(total),
    public_notes: appointment.client_visible_notes || "",
    can_cancel: canClientCancelAppointment(appointment),
    services: services.map((item) => ({
      id: item.id,
      service_id: item.service_id,
      name: item.services?.name || "Servicio",
      category: item.services?.category || "",
      staff_name: item.staff?.full_name || "",
      start_time: formatTime(item.start_time),
      end_time: formatTime(item.end_time),
      total_price: Number(item.total_price || item.price || 0),
    })),
  };
}

function portalWriteError(result) {
  if (result?.code === "preview_expired") {
    return "La vista previa venció. Busca nuevamente un horario.";
  }
  if (result?.code === "preview_changed") {
    return "El precio, la duración o el horario cambió. Revisa una vista previa nueva.";
  }
  if (result?.status === "not_available") {
    return "Ese horario acaba de ocuparse. Elige otro espacio.";
  }
  if (result?.code === "invalid_service") {
    return "Uno de los servicios ya no está disponible.";
  }
  if (result?.status === "human_review") {
    return "La solicitud requiere revisión del equipo.";
  }
  return "No se pudo crear la cita. Revisa los datos e inténtalo nuevamente.";
}

export async function GET(request) {
  try {
    const adminSupabase = createClientPortalAdmin();
    const session = await getAuthUserFromRequest(request, adminSupabase);

    if (session.error) {
      return errorResponse(session.error, session.status || 401);
    }

    const client = await ensureClientForUser(adminSupabase, session.user);

    const { data, error } = await adminSupabase
      .from("appointments")
      .select(
        `
        id,
        client_id,
        appointment_date,
        start_time,
        end_time,
        status,
        confirmation_status,
        attendance_status,
        estimated_total,
        client_visible_notes,
        booking_source,
        appointment_services (
          id,
          service_id,
          start_time,
          end_time,
          total_price,
          price,
          status,
          staff (
            full_name
          ),
          services (
            name,
            category
          )
        )
      `
      )
      .eq("client_id", client.id)
      .order("appointment_date", { ascending: false })
      .order("start_time", { ascending: false })
      .limit(80);

    if (error) throw error;

    const appointments = (data || []).map(mapAppointmentForClient);
    const contact = await getSalonContact(adminSupabase);

    return NextResponse.json({
      success: true,
      client,
      appointments,
      contact,
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
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
        "Completa tu perfil con nombre y teléfono antes de confirmar la cita.",
        409
      );
    }
    const client = profile.client;
    const body = await request.json();
    if (hasForbiddenWriteControls(body)) {
      return errorResponse("La solicitud no es válida.", 400);
    }
    const serviceIds = Array.isArray(body.service_ids) ? body.service_ids : [];
    const appointmentDate = cleanText(body.appointment_date);
    const startTime = formatTime(body.start_time);
    const staffId = cleanText(body.staff_id);
    const notes = cleanText(body.notes);
    const previewIdentity = {
      id: cleanText(body.preview_id),
      version: Number(body.preview_version || 0),
      confirmationId: cleanText(body.confirmation_id),
      requestHash: cleanText(body.request_hash),
      expiresAt: cleanText(body.preview_expires_at),
    };

    if (
      !appointmentDate ||
      !startTime ||
      !staffId ||
      serviceIds.length === 0 ||
      !previewIdentity.id ||
      !previewIdentity.confirmationId ||
      !previewIdentity.requestHash ||
      !previewIdentity.expiresAt
    ) {
      return errorResponse(
        "Revisa los servicios, la fecha y el horario antes de confirmar.",
        400
      );
    }
    if (
      !Number.isFinite(new Date(previewIdentity.expiresAt).getTime()) ||
      new Date(previewIdentity.expiresAt).getTime() <= Date.now()
    ) {
      return errorResponse(
        "La vista previa venció. Busca nuevamente un horario.",
        409
      );
    }

    const availability = await getAvailability({
      adminSupabase,
      date: appointmentDate,
      serviceIds,
      preferredStaffId: staffId,
      requestedStartTime: startTime,
      limit: 5,
    });

    const selectedSlot = availability.slots.find(
      (slot) => slot.staff_id === staffId && slot.start_time === startTime
    );

    if (!selectedSlot) {
      return errorResponse(
        "Ese horario ya no está disponible. Elige otro espacio.",
        409
      );
    }
    if (
      !slotMeetsMinimumNotice({
        date: appointmentDate,
        startTime,
        staffName: selectedSlot.staff_name,
      })
    ) {
      return errorResponse(
        "Ese horario ya no cumple la anticipación mínima. Elige otro espacio.",
        409
      );
    }
    if (!(availability.selected_services || []).every(isPortalBookableService)) {
      return errorResponse(
        "Uno de los servicios seleccionados requiere revisión del equipo.",
        409
      );
    }

    const currentPreview = prepareClientPortalAppointment({
      actorId: session.user.id,
      client: {
        id: client.id,
        name: client.full_name,
        phone: client.phone,
      },
      slot: { ...selectedSlot, date: appointmentDate },
    });
    if (
      previewIdentity.id !== currentPreview.previewId ||
      previewIdentity.version !== currentPreview.previewVersion ||
      previewIdentity.confirmationId !== currentPreview.confirmationId ||
      previewIdentity.requestHash !== currentPreview.requestHash
    ) {
      return errorResponse(
        "El precio, la duración o el horario cambió. Revisa una vista previa nueva.",
        409
      );
    }

    const contract = {
      ...currentPreview,
      confirmationId: previewIdentity.confirmationId,
      previewExpiresAt: previewIdentity.expiresAt,
      notes,
    };
    const result = await confirmClientPortalAppointment({
      input: contract,
      transactionalRepository: createAppointmentTransactionalRepository({
        supabase: adminSupabase,
      }),
    });
    if (!result.ok || !result.appointmentId) {
      return errorResponse(
        portalWriteError(result),
        result.status === "human_review" ? 409 : 422
      );
    }

    const serviceText = currentPreview.services
      .map((service) => service.name)
      .filter(Boolean)
      .join(", ");
    let notification = { skipped: result.isReplay };
    if (!result.isReplay) {
      try {
        notification = await notifyAdminsForClientAppointment({
          adminSupabase,
          appointmentId: result.appointmentId,
          clientName: client.full_name,
          summary: `${appointmentDate} ${startTime}-${selectedSlot.end_time} · ${serviceText}`,
          user: session.user,
        });
      } catch {
        notification = { failed: true };
      }
    }

    return NextResponse.json({
      success: true,
      appointment: {
        id: result.appointmentId,
        appointment_date: appointmentDate,
        start_time: startTime,
        end_time: selectedSlot.end_time,
        confirmation_status: "pendiente",
        services: currentPreview.services.map((service) => ({
          id: service.id,
          service_id: service.id,
          name: service.name,
          staff_name: selectedSlot.staff_name || "",
          start_time: selectedSlot.service_segments.find(
            (segment) => segment.service_id === service.id
          )?.start_time,
          end_time: selectedSlot.service_segments.find(
            (segment) => segment.service_id === service.id
          )?.end_time,
          total_price: service.price,
        })),
      },
      notification,
      write_mode: result.mode,
      replay: result.isReplay,
      message:
        "Tu solicitud fue creada. El equipo revisará el anticipo y te contactará para confirmar.",
    }, { status: result.isReplay ? 200 : 201 });
  } catch (error) {
    return errorResponse(error, 400);
  }
}

export async function PATCH(request) {
  try {
    const adminSupabase = createClientPortalAdmin();
    const session = await getAuthUserFromRequest(request, adminSupabase);

    if (session.error) {
      return errorResponse(session.error, session.status || 401);
    }

    const client = await ensureClientForUser(adminSupabase, session.user);
    const body = await request.json();
    const appointmentId = cleanText(body.appointment_id);

    if (!appointmentId) {
      return errorResponse("Falta seleccionar la cita.", 400);
    }

    const { data: appointment, error: appointmentError } = await adminSupabase
      .from("appointments")
      .select(
        "id, client_id, appointment_date, start_time, end_time, status, confirmation_status, attendance_status"
      )
      .eq("id", appointmentId)
      .eq("client_id", client.id)
      .single();

    if (appointmentError || !appointment) {
      return errorResponse("No encontramos esa cita en tu cuenta.", 404);
    }

    if (!canClientCancelAppointment(appointment)) {
      return errorResponse(
        "Esta cita ya no puede cancelarse desde el portal. Escríbenos por WhatsApp para ayudarte.",
        400
      );
    }

    const { error: updateError } = await adminSupabase
      .from("appointments")
      .update({
        status: "cancelada",
        confirmation_status: "cancelada",
        attendance_status: "cancelo",
        client_visible_notes:
          "Cancelación solicitada desde el portal de clientas.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointment.id);

    if (updateError) throw updateError;

    await notifyAdminsForClientAppointment({
      adminSupabase,
      appointmentId: appointment.id,
      clientName: client.full_name,
      summary: `${appointment.appointment_date} ${formatTime(
        appointment.start_time
      )}-${formatTime(appointment.end_time)}`,
      user: session.user,
      type: "cliente_portal_cancelacion",
    });

    return NextResponse.json({
      success: true,
      message: "Solicitud cancelada correctamente.",
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
