import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const productManagerRoles = ["admin", "encargada"];

function cleanText(value) {
  return String(value || "").trim();
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

async function getAuthorizedProfile(request, adminSupabase) {
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

  const { data: profileById } = await adminSupabase
    .from("user_profiles")
    .select("id, email, role, active")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  let profile = profileById || null;

  if (!profile && user.email) {
    const { data: profileByEmail } = await adminSupabase
      .from("user_profiles")
      .select("id, email, role, active")
      .ilike("email", user.email)
      .maybeSingle();

    profile = profileByEmail || null;
  }

  const role = normalizeRole(profile?.role);

  if (!profile || profile.active === false || !productManagerRoles.includes(role)) {
    return {
      error: "No tienes permiso para administrar productos.",
      status: 403,
    };
  }

  return { profile, user, role };
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

export async function POST(request) {
  try {
    const adminSupabase = createAdminClient();
    const auth = await getAuthorizedProfile(request, adminSupabase);

    if (auth.error) return errorResponse(auth.error, auth.status);

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
    const auth = await getAuthorizedProfile(request, adminSupabase);

    if (auth.error) return errorResponse(auth.error, auth.status);

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
