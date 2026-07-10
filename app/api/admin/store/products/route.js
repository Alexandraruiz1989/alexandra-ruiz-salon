import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const productManagerRoles = ["admin", "encargada"];

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function normalizeRole(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Faltan variables de entorno. Revisa NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function logAccessDiagnostic({ user, profile, source }) {
  console.info("[store-products-access]", {
    source,
    email: normalizeEmail(user?.email),
    user_id: user?.id || null,
    profile_found: Boolean(profile),
    profile_email: normalizeEmail(profile?.email),
    profile_id: profile?.id || null,
    role: profile?.role || null,
    active: profile?.active ?? null,
  });
}

async function findAccessProfile(adminSupabase, user) {
  const userEmail = normalizeEmail(user?.email);

  const { data: profilesById, error: profileByIdError } = await adminSupabase
    .from("user_profiles")
    .select("id, email, role, active")
    .eq("auth_user_id", user.id)
    .limit(1);

  if (profileByIdError) {
    console.warn("[store-products-access] profile_by_id_error", {
      email: userEmail,
      user_id: user.id,
      error: profileByIdError.message,
    });
  }

  let profile = profilesById?.[0] || null;
  let source = profile ? "auth_user_id" : "not_found_by_id";

  if (!profile && userEmail) {
    const { data: profilesByEmail, error: profileByEmailError } =
      await adminSupabase
        .from("user_profiles")
        .select("id, email, role, active")
        .ilike("email", userEmail)
        .limit(1);

    if (profileByEmailError) {
      console.warn("[store-products-access] profile_by_email_error", {
        email: userEmail,
        user_id: user.id,
        error: profileByEmailError.message,
      });
    }

    profile = profilesByEmail?.[0] || null;
    source = profile ? "email" : "not_found";
  }

  logAccessDiagnostic({ user, profile, source });

  return profile;
}

async function getSessionProfile(request, adminSupabase) {
  const token = getBearerToken(request);

  if (!token) {
    return {
      error: "Tu sesión expiró. Vuelve a iniciar sesión.",
      status: 401,
    };
  }

  const { data: userData, error: userError } =
    await adminSupabase.auth.getUser(token);

  if (userError || !userData?.user) {
    return {
      error: "Tu sesión expiró. Vuelve a iniciar sesión.",
      status: 401,
    };
  }

  const user = userData.user;
  const profile = await findAccessProfile(adminSupabase, user);

  if (!profile) {
    return {
      error: "No encontré tu perfil de acceso. Revisa /admin/accesos.",
      status: 403,
    };
  }

  if (profile.active === false) {
    return {
      error: "Tu perfil de acceso está desactivado. Revisa /admin/accesos.",
      status: 403,
    };
  }

  const role = normalizeRole(profile?.role);

  return { profile, user, role };
}

function requireProductManager(session) {
  if (!productManagerRoles.includes(session.role)) {
    return {
      error: `Tu rol actual es ${session.profile?.role || "sin rol"}. Solo admin o encargada pueden administrar productos.`,
      status: 403,
    };
  }

  return null;
}

function buildProductPayload(product, { partial = false } = {}) {
  const payload = {};
  const hasField = (field) => Object.prototype.hasOwnProperty.call(product, field);

  if (!partial || hasField("name")) {
    const name = cleanText(product.name);
    if (!name) throw new Error("El nombre del producto es obligatorio.");
    payload.name = name;
  }

  if (!partial || hasField("sku")) payload.sku = cleanText(product.sku) || null;
  if (!partial || hasField("brand")) payload.brand = cleanText(product.brand) || null;
  if (!partial || hasField("category")) payload.category = cleanText(product.category) || null;
  if (!partial || hasField("description")) {
    payload.description = cleanText(product.description) || null;
  }
  if (!partial || hasField("cost_price")) {
    payload.cost_price = Number(product.cost_price || 0);
  }
  if (!partial || hasField("sale_price")) {
    const salePrice = Number(product.sale_price || 0);
    if (!partial && salePrice <= 0) {
      throw new Error("El precio de venta debe ser mayor a cero.");
    }
    payload.sale_price = salePrice;
  }
  if (!partial || hasField("current_stock")) {
    payload.current_stock = Number.parseInt(product.current_stock || 0, 10) || 0;
  }
  if (!partial || hasField("min_stock")) {
    payload.min_stock = Number.parseInt(product.min_stock || 0, 10) || 0;
  }
  if (!partial || hasField("external_owner_name")) {
    payload.external_owner_name = cleanText(product.external_owner_name) || null;
  }
  if (!partial || hasField("active")) payload.active = product.active !== false;

  payload.updated_at = new Date().toISOString();

  return payload;
}

function errorResponse(error, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error: error?.message || error || "No se pudo guardar producto.",
    },
    { status }
  );
}

export async function GET(request) {
  try {
    const adminSupabase = createAdminClient();
    const session = await getSessionProfile(request, adminSupabase);

    if (session.error) return errorResponse(session.error, session.status);

    return NextResponse.json({
      success: true,
      profile: {
        id: session.profile.id,
        email: normalizeEmail(session.profile.email),
        role: session.profile.role,
        active: session.profile.active !== false,
      },
      can_manage_products: productManagerRoles.includes(session.role),
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function POST(request) {
  try {
    const adminSupabase = createAdminClient();
    const session = await getSessionProfile(request, adminSupabase);

    if (session.error) return errorResponse(session.error, session.status);

    const authorizationError = requireProductManager(session);
    if (authorizationError) {
      return errorResponse(authorizationError.error, authorizationError.status);
    }

    const body = await request.json();
    const product = body.product || body;
    const payload = buildProductPayload(product);
    const matchBySku = Boolean(body.match_by_sku);

    if (matchBySku && payload.sku) {
      const { data: existing, error: existingError } = await adminSupabase
        .from("store_products")
        .select("id")
        .eq("sku", payload.sku)
        .maybeSingle();

      if (existingError) return errorResponse(existingError.message, 400);

      if (existing?.id) {
        const { data, error } = await adminSupabase
          .from("store_products")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single();

        if (error) return errorResponse(error.message, 400);

        return NextResponse.json({
          success: true,
          action: "updated",
          product: data,
        });
      }
    }

    const { data, error } = await adminSupabase
      .from("store_products")
      .insert([payload])
      .select()
      .single();

    if (error) return errorResponse(error.message, 400);

    return NextResponse.json({
      success: true,
      action: "created",
      product: data,
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function PATCH(request) {
  try {
    const adminSupabase = createAdminClient();
    const session = await getSessionProfile(request, adminSupabase);

    if (session.error) return errorResponse(session.error, session.status);

    const authorizationError = requireProductManager(session);
    if (authorizationError) {
      return errorResponse(authorizationError.error, authorizationError.status);
    }

    const body = await request.json();
    const id = cleanText(body.id);

    if (!id) {
      return errorResponse("Falta el ID del producto.", 400);
    }

    const product = body.product || body;
    const payload = buildProductPayload(product, { partial: true });

    const { data, error } = await adminSupabase
      .from("store_products")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) return errorResponse(error.message, 400);

    return NextResponse.json({
      success: true,
      action: "updated",
      product: data,
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
