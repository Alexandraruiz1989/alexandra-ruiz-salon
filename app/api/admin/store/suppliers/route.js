import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { cleanText, normalizeText, toFiniteNumber } from "../../../../lib/storeProductSale";

const managerRoles = ["admin", "encargada"];

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
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

function createAuthenticatedClient(accessToken) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Faltan variables de entorno. Revisa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

async function getSessionProfile(request, adminSupabase) {
  const token = getBearerToken(request);

  if (!token) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión.", status: 401 };
  }

  const { data: userData, error: userError } = await adminSupabase.auth.getUser(token);

  if (userError || !userData?.user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión.", status: 401 };
  }

  const user = userData.user;
  const userEmail = normalizeEmail(user.email);
  const { data: profilesById } = await adminSupabase
    .from("user_profiles")
    .select("id, auth_user_id, email, full_name, role, active")
    .eq("auth_user_id", user.id)
    .limit(1);

  let profile = profilesById?.[0] || null;

  if (!profile && userEmail) {
    const { data: profilesByEmail } = await adminSupabase
      .from("user_profiles")
      .select("id, auth_user_id, email, full_name, role, active")
      .ilike("email", userEmail)
      .limit(1);

    profile = profilesByEmail?.[0] || null;
  }

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

  const role = normalizeText(profile.role);

  if (!managerRoles.includes(role)) {
    return {
      error: `Tu rol actual es ${profile.role || "sin rol"}. Solo admin o encargada pueden administrar proveedores.`,
      status: 403,
    };
  }

  return { token, user, profile, role };
}

function errorResponse(error, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error: error?.message || error || "No se pudo completar la operación.",
    },
    { status }
  );
}

function supplierPayload(input) {
  const commercialName = cleanText(input.commercial_name);
  if (!commercialName) throw new Error("El nombre comercial del proveedor es obligatorio.");

  return {
    commercial_name: commercialName,
    legal_name: cleanText(input.legal_name) || null,
    contact_name: cleanText(input.contact_name) || null,
    phone: cleanText(input.phone) || null,
    whatsapp_phone: cleanText(input.whatsapp_phone) || null,
    email: normalizeEmail(input.email) || null,
    address: cleanText(input.address) || null,
    rfc: cleanText(input.rfc).toUpperCase() || null,
    notes: cleanText(input.notes) || null,
    active: input.active !== false,
    updated_at: new Date().toISOString(),
  };
}

function productSupplierPayload(input) {
  const productId = cleanText(input.product_id);
  const supplierId = cleanText(input.supplier_id);

  if (!productId || !supplierId) {
    throw new Error("Selecciona producto y proveedor.");
  }

  const ownershipModel = cleanText(input.ownership_model) || "consignment";

  if (!["salon_owned", "consignment", "supplier_owned"].includes(ownershipModel)) {
    throw new Error("Modelo de propiedad inválido.");
  }

  return {
    product_id: productId,
    supplier_id: supplierId,
    supplier_sku: cleanText(input.supplier_sku) || null,
    reference_cost:
      input.reference_cost === "" || input.reference_cost === null || input.reference_cost === undefined
        ? null
        : toFiniteNumber(input.reference_cost, 0),
    ownership_model: ownershipModel,
    active: input.active !== false,
    is_default_for_sales: input.is_default_for_sales === true,
    priority: Number.parseInt(input.priority || 100, 10) || 100,
    notes: cleanText(input.notes) || null,
    updated_at: new Date().toISOString(),
  };
}

function supplierUserPayload(input, profileId) {
  const supplierId = cleanText(input.supplier_id);
  const email = normalizeEmail(input.email_snapshot || input.email);

  if (!supplierId) throw new Error("Selecciona proveedor.");
  if (!email && !cleanText(input.auth_user_id) && !cleanText(input.user_profile_id)) {
    throw new Error("Agrega correo, auth user ID o perfil para vincular usuario.");
  }

  return {
    supplier_id: supplierId,
    auth_user_id: cleanText(input.auth_user_id) || null,
    user_profile_id: cleanText(input.user_profile_id) || null,
    email_snapshot: email || null,
    display_name: cleanText(input.display_name) || null,
    supplier_role: cleanText(input.supplier_role) || "supplier",
    active: input.active !== false,
    invited_by_user_profile_id: profileId || null,
    revoked_at: input.active === false ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}

async function loadSupplierData(supabase) {
  const [
    suppliersResult,
    productSuppliersResult,
    inventoryResult,
    requestsResult,
    usersResult,
    approversResult,
    profilesResult,
  ] = await Promise.all([
    supabase.from("store_suppliers").select("*").order("commercial_name"),
    supabase
      .from("store_product_suppliers")
      .select("*, store_products(id,name,sku,sale_price,current_stock,active), store_suppliers(id,commercial_name,active), store_supplier_inventory(id,current_stock)")
      .order("created_at", { ascending: false }),
    supabase
      .from("store_supplier_inventory")
      .select("*, store_products(id,name,sku,current_stock), store_suppliers(id,commercial_name), store_product_suppliers(id,ownership_model,supplier_sku)")
      .order("updated_at", { ascending: false }),
    supabase
      .from("store_inventory_movement_requests")
      .select("*, store_products(id,name,sku), store_suppliers(id,commercial_name)")
      .order("requested_at", { ascending: false })
      .limit(100),
    supabase
      .from("store_supplier_users")
      .select("*, store_suppliers(id,commercial_name), user_profiles(id,email,full_name,role)")
      .order("created_at", { ascending: false }),
    supabase
      .from("store_inventory_approvers")
      .select("*, user_profiles(id,email,full_name,role)")
      .order("created_at", { ascending: false }),
    supabase
      .from("user_profiles")
      .select("id,email,full_name,role,active")
      .eq("active", true)
      .order("full_name", { ascending: true }),
  ]);

  const firstError = [
    suppliersResult,
    productSuppliersResult,
    inventoryResult,
    requestsResult,
    usersResult,
    approversResult,
    profilesResult,
  ].find((result) => result.error)?.error;

  if (firstError) throw new Error(firstError.message);

  return {
    suppliers: suppliersResult.data || [],
    product_suppliers: productSuppliersResult.data || [],
    supplier_inventory: inventoryResult.data || [],
    movement_requests: requestsResult.data || [],
    supplier_users: usersResult.data || [],
    approvers: approversResult.data || [],
    profiles: profilesResult.data || [],
  };
}

export async function GET(request) {
  try {
    const adminSupabase = createAdminClient();
    const session = await getSessionProfile(request, adminSupabase);
    if (session.error) return errorResponse(session.error, session.status);

    const supabase = createAuthenticatedClient(session.token);
    const data = await loadSupplierData(supabase);

    return NextResponse.json({
      success: true,
      can_manage_approvers: session.role === "admin",
      ...data,
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

    const body = await request.json();
    const type = cleanText(body.type);
    const supabase = createAuthenticatedClient(session.token);

    if (type === "supplier") {
      const { data, error } = await supabase
        .from("store_suppliers")
        .insert([supplierPayload(body.supplier || body)])
        .select()
        .single();
      if (error) return errorResponse(error.message, 400);
      return NextResponse.json({ success: true, supplier: data });
    }

    if (type === "product_supplier") {
      const payload = productSupplierPayload(body.product_supplier || body);
      const { data, error } = await supabase
        .from("store_product_suppliers")
        .insert([payload])
        .select()
        .single();
      if (error) return errorResponse(error.message, 400);

      const { error: inventoryError } = await supabase
        .from("store_supplier_inventory")
        .insert([
          {
            product_supplier_id: data.id,
            product_id: data.product_id,
            supplier_id: data.supplier_id,
            current_stock: 0,
            updated_at: new Date().toISOString(),
          },
        ]);
      if (inventoryError) return errorResponse(inventoryError.message, 400);

      return NextResponse.json({ success: true, product_supplier: data });
    }

    if (type === "supplier_user") {
      const { data, error } = await supabase
        .from("store_supplier_users")
        .insert([supplierUserPayload(body.supplier_user || body, session.profile.id)])
        .select()
        .single();
      if (error) return errorResponse(error.message, 400);
      return NextResponse.json({ success: true, supplier_user: data });
    }

    if (type === "approver") {
      if (session.role !== "admin") {
        return errorResponse("Solo admin puede administrar aprobadores.", 403);
      }

      const userProfileId = cleanText(body.user_profile_id);
      if (!userProfileId) return errorResponse("Selecciona usuario.", 400);

      const { data, error } = await supabase
        .from("store_inventory_approvers")
        .insert([
          {
            user_profile_id: userProfileId,
            granted_by_user_profile_id: session.profile.id,
            active: true,
            updated_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();
      if (error) return errorResponse(error.message, 400);
      return NextResponse.json({ success: true, approver: data });
    }

    return errorResponse("Tipo de operación no soportado.", 400);
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function PATCH(request) {
  try {
    const adminSupabase = createAdminClient();
    const session = await getSessionProfile(request, adminSupabase);
    if (session.error) return errorResponse(session.error, session.status);

    const body = await request.json();
    const type = cleanText(body.type);
    const id = cleanText(body.id);
    const supabase = createAuthenticatedClient(session.token);

    if (!id && !["approve_request", "reject_request"].includes(type)) {
      return errorResponse("Falta el ID.", 400);
    }

    if (type === "supplier") {
      const { data, error } = await supabase
        .from("store_suppliers")
        .update(supplierPayload(body.supplier || body))
        .eq("id", id)
        .select()
        .single();
      if (error) return errorResponse(error.message, 400);
      return NextResponse.json({ success: true, supplier: data });
    }

    if (type === "product_supplier") {
      const { data, error } = await supabase
        .from("store_product_suppliers")
        .update(productSupplierPayload(body.product_supplier || body))
        .eq("id", id)
        .select()
        .single();
      if (error) return errorResponse(error.message, 400);
      return NextResponse.json({ success: true, product_supplier: data });
    }

    if (type === "supplier_user") {
      const nextActive = body.active !== false;
      const { data, error } = await supabase
        .from("store_supplier_users")
        .update({
          active: nextActive,
          revoked_at: nextActive ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) return errorResponse(error.message, 400);
      return NextResponse.json({ success: true, supplier_user: data });
    }

    if (type === "approver") {
      if (session.role !== "admin") {
        return errorResponse("Solo admin puede administrar aprobadores.", 403);
      }

      const nextActive = body.active !== false;
      const { data, error } = await supabase
        .from("store_inventory_approvers")
        .update({
          active: nextActive,
          revoked_at: nextActive ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) return errorResponse(error.message, 400);
      return NextResponse.json({ success: true, approver: data });
    }

    if (type === "approve_request") {
      const { data, error } = await supabase.rpc(
        "approve_store_inventory_movement_request",
        { p_request_id: cleanText(body.request_id || id) }
      );
      if (error) return errorResponse(error.message, 400);
      return NextResponse.json({ success: true, result: data });
    }

    if (type === "reject_request") {
      const { data, error } = await supabase.rpc(
        "reject_store_inventory_movement_request",
        {
          p_request_id: cleanText(body.request_id || id),
          p_rejection_reason: cleanText(body.rejection_reason),
        }
      );
      if (error) return errorResponse(error.message, 400);
      return NextResponse.json({ success: true, result: data });
    }

    return errorResponse("Tipo de operación no soportado.", 400);
  } catch (error) {
    return errorResponse(error, 500);
  }
}
