import { NextResponse } from "next/server";
import {
  cleanText,
  createClientPortalAdmin,
  ensureClientForUser,
  formatMoney,
  formatTime,
  getAvailability,
  getSalonContact,
  getAuthUserFromRequest,
  notifyAdminsForClientAppointment,
} from "../../../lib/clientPortalServer";

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

function mapAppointmentForClient(appointment) {
  const services = appointment.appointment_services || [];
  const total =
    Number(appointment.estimated_total || 0) ||
    services.reduce((sum, item) => sum + Number(item.total_price || 0), 0);

  return {
    id: appointment.id,
    appointment_date: appointment.appointment_date,
    start_time: formatTime(appointment.start_time),
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
      start_time: formatTime(item.start_time),
      end_time: formatTime(item.end_time),
      total_price: Number(item.total_price || item.price || 0),
    })),
  };
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

    const client = await ensureClientForUser(adminSupabase, session.user);
    const body = await request.json();
    const serviceIds = Array.isArray(body.service_ids) ? body.service_ids : [];
    const appointmentDate = cleanText(body.appointment_date);
    const startTime = formatTime(body.start_time);
    const staffId = cleanText(body.staff_id);
    const notes = cleanText(body.notes);

    if (!appointmentDate || !startTime || !staffId || serviceIds.length === 0) {
      return errorResponse(
        "Selecciona servicios, fecha, horario y colaboradora disponible.",
        400
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

    const serviceSegments = selectedSlot.service_segments || [];
    const estimatedTotal = serviceSegments.reduce(
      (sum, segment) => sum + Number(segment.price || 0),
      0
    );
    const serviceText = serviceSegments
      .map((segment) => segment.service?.name)
      .filter(Boolean)
      .join(", ");
    const portalNote = [
      "Solicitud creada desde portal de clientas.",
      "Pendiente de revisión del equipo y anticipo.",
      notes ? `Nota de clienta: ${notes}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const appointmentPayload = {
      client_id: client.id,
      staff_id: staffId,
      appointment_date: appointmentDate,
      start_time: startTime,
      end_time: selectedSlot.end_time,
      status: "agendada",
      confirmation_status: "pendiente",
      attendance_status: "pendiente",
      booking_source: "cliente_portal",
      estimated_total: estimatedTotal,
      deposit_amount: 0,
      notes: portalNote,
      client_visible_notes:
        "Solicitud recibida. El equipo revisará disponibilidad y te contactará para confirmar el anticipo.",
    };

    const { data: appointment, error: appointmentError } = await adminSupabase
      .from("appointments")
      .insert([appointmentPayload])
      .select()
      .single();

    if (appointmentError) throw appointmentError;

    const serviceRows = serviceSegments.map((segment) => ({
      appointment_id: appointment.id,
      service_id: segment.service_id,
      staff_id: staffId,
      service_date: appointmentDate,
      start_time: segment.start_time,
      end_time: segment.end_time,
      duration_minutes: Number(segment.duration_minutes || 0),
      cleanup_minutes: Number(segment.cleanup_minutes || 0),
      quantity: 1,
      unit_price: Number(segment.price || 0),
      total_price: Number(segment.price || 0),
      price: Number(segment.price || 0),
      notes: null,
      status: "agendado",
    }));

    const { error: servicesError } = await adminSupabase
      .from("appointment_services")
      .insert(serviceRows);

    if (servicesError) throw servicesError;

    const notification = await notifyAdminsForClientAppointment({
      adminSupabase,
      appointmentId: appointment.id,
      clientName: client.full_name,
      summary: `${appointmentDate} ${startTime}-${selectedSlot.end_time} · ${serviceText}`,
      user: session.user,
    });

    return NextResponse.json({
      success: true,
      appointment: {
        id: appointment.id,
        appointment_date: appointmentDate,
        start_time: startTime,
        end_time: selectedSlot.end_time,
        confirmation_status: "pendiente",
      },
      notification,
      message:
        "Tu cita quedó preagendada. Para dejar tu espacio confirmado, el equipo te contactará para el anticipo.",
    });
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
