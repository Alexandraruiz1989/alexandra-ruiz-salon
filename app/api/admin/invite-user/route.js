import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request) {
  try {
    const body = await request.json();

    const email = String(body.email || "").trim().toLowerCase();
    const fullName = String(body.full_name || "").trim();
    const role = String(body.role || "tecnica").trim();
    const staffId = body.staff_id || null;

    if (!email) {
      return NextResponse.json(
        { error: "El correo es obligatorio." },
        { status: 400 }
      );
    }

    const allowedRoles = ["admin", "encargada", "tecnica", "caja"];

    if (!allowedRoles.includes(role)) {
      return NextResponse.json(
        { error: "El rol seleccionado no es válido." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          error:
            "Faltan variables de entorno de Supabase. Revisa SUPABASE_SERVICE_ROLE_KEY.",
        },
        { status: 500 }
      );
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL;

    const { data: inviteData, error: inviteError } =
      await adminSupabase.auth.admin.inviteUserByEmail(email, {
        data: {
          full_name: fullName || email,
          role,
        },
        redirectTo: origin ? `${origin}/admin` : undefined,
      });

    if (inviteError) {
      return NextResponse.json(
        { error: `No se pudo enviar la invitación: ${inviteError.message}` },
        { status: 400 }
      );
    }

    const authUserId = inviteData?.user?.id;

    if (!authUserId) {
      return NextResponse.json(
        { error: "No se pudo obtener el usuario creado por Supabase." },
        { status: 400 }
      );
    }

    const { error: profileError } = await adminSupabase
      .from("user_profiles")
      .upsert(
        {
          auth_user_id: authUserId,
          email,
          full_name: fullName || email,
          role,
          staff_id: staffId,
          active: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "auth_user_id",
        }
      );

    if (profileError) {
      return NextResponse.json(
        {
          error: `La invitación se envió, pero no se pudo guardar el perfil: ${profileError.message}`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Invitación enviada correctamente.",
      user: inviteData.user,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Error inesperado al invitar usuario." },
      { status: 500 }
    );
  }
}