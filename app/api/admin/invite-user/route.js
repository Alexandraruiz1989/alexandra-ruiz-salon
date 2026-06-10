import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const allowedRoles = ["admin", "encargada", "tecnica", "caja"];

function cleanText(value) {
  return String(value || "").trim();
}

export async function POST(request) {
  try {
    const body = await request.json();

    const email = cleanText(body.email).toLowerCase();
    const fullName = cleanText(body.full_name);
    const role = cleanText(body.role || "tecnica");
    const staffId = body.staff_id || null;

    if (!email) {
      return NextResponse.json(
        { success: false, error: "El correo es obligatorio." },
        { status: 400 }
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Escribe un correo válido." },
        { status: 400 }
      );
    }

    if (!allowedRoles.includes(role)) {
      return NextResponse.json(
        { success: false, error: "El rol seleccionado no es válido." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Faltan variables de entorno. Revisa NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.",
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

    const origin =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";

   const redirectTo = `${origin}/crear-password`;

    const { data: inviteData, error: inviteError } =
      await adminSupabase.auth.admin.inviteUserByEmail(email, {
        data: {
          full_name: fullName || email,
          role,
        },
        redirectTo,
      });

    if (inviteError) {
      return NextResponse.json(
        {
          success: false,
          error: `No se pudo enviar la invitación: ${inviteError.message}`,
        },
        { status: 400 }
      );
    }

    const authUserId = inviteData?.user?.id;

    if (!authUserId) {
      return NextResponse.json(
        {
          success: false,
          error: "Supabase no devolvió el ID del usuario invitado.",
        },
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
          success: false,
          error: `La invitación se envió, pero no se pudo guardar el perfil: ${profileError.message}`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Invitación enviada correctamente. Revisa también spam/no deseado si no aparece en la bandeja principal.",
      user: {
        id: authUserId,
        email,
        role,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Error inesperado al invitar usuario.",
      },
      { status: 500 }
    );
  }
}