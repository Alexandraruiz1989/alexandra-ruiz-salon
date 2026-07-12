import { NextResponse } from "next/server";
import {
  cleanText,
  createClientPortalAdmin,
  ensureClientForUser,
  getAuthUserFromRequest,
  updateClientProfile,
} from "../../../lib/clientPortalServer";

function errorResponse(error, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error: error?.message || error || "No se pudo procesar tu perfil.",
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

    const client = await ensureClientForUser(adminSupabase, session.user);

    return NextResponse.json({
      success: true,
      client,
      user: {
        id: session.user.id,
        email: session.user.email,
      },
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

    const body = await request.json();
    const client = await ensureClientForUser(adminSupabase, session.user, {
      full_name: cleanText(body.full_name),
      phone: cleanText(body.phone),
      email: cleanText(body.email) || session.user.email,
    });

    return NextResponse.json({
      success: true,
      client,
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

    const body = await request.json();
    const client = await ensureClientForUser(adminSupabase, session.user);
    const updatedClient = await updateClientProfile(adminSupabase, client.id, {
      full_name: cleanText(body.full_name),
      phone: cleanText(body.phone),
    });

    return NextResponse.json({
      success: true,
      client: updatedClient,
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
