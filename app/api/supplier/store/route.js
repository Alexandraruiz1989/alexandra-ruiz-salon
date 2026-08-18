import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  cleanText,
  sanitizeSupplierPortalSaleItem,
  summarizeSupplierSaleItems,
  toPositiveInteger,
} from "../../../lib/storeProductSale";

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

async function getSupplierSession(request, supabase) {
  const token = getBearerToken(request);

  if (!token) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión.", status: 401 };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData?.user) {
    return { error: "Tu sesión expiró. Vuelve a iniciar sesión.", status: 401 };
  }

  const user = userData.user;
  const email = normalizeEmail(user.email);

  const { data: profileRows } = await supabase
    .from("user_profiles")
    .select("id, email, full_name, active")
    .or(`auth_user_id.eq.${user.id},email.ilike.${email}`)
    .limit(1);

  const profile = profileRows?.[0] || null;

  const { data: supplierUsers, error: supplierUserError } = await supabase
    .from("store_supplier_users")
    .select(
      "id,supplier_id,auth_user_id,user_profile_id,email_snapshot,active,revoked_at,store_suppliers(id,commercial_name,active)"
    )
    .eq("active", true)
    .is("revoked_at", null)
    .or(
      [
        `auth_user_id.eq.${user.id}`,
        profile?.id ? `user_profile_id.eq.${profile.id}` : "",
        email ? `email_snapshot.ilike.${email}` : "",
      ]
        .filter(Boolean)
        .join(",")
    );

  if (supplierUserError) {
    return { error: supplierUserError.message, status: 400 };
  }

  const activeLinks = (supplierUsers || []).filter(
    (link) => link.store_suppliers?.active !== false
  );

  if (activeLinks.length === 0) {
    return {
      error: "No hay un proveedor activo vinculado a esta cuenta.",
      status: 403,
    };
  }

  return {
    user,
    profile,
    supplierLinks: activeLinks,
    supplierIds: activeLinks.map((link) => link.supplier_id).filter(Boolean),
  };
}

function errorResponse(error, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error: error?.message || error || "No se pudo cargar el portal proveedor.",
    },
    { status }
  );
}

function sanitizeProductRelation(relation) {
  const inventory = Array.isArray(relation.store_supplier_inventory)
    ? relation.store_supplier_inventory[0]
    : relation.store_supplier_inventory;

  return {
    product_supplier_id: relation.id,
    name: relation.store_products?.name || "Producto",
    sku: relation.supplier_sku || relation.store_products?.sku || "",
    stock: Number(inventory?.current_stock || 0),
    price: Number(relation.store_products?.sale_price || 0),
    status:
      relation.active === false || relation.store_products?.active === false
        ? "inactivo"
        : "activo",
  };
}

function sanitizeMovement(movement) {
  return {
    id: movement.id,
    created_at: movement.created_at,
    product_name: movement.store_products?.name || "Producto",
    movement_type: movement.movement_type,
    quantity: Number(movement.quantity || 0),
    previous_stock: Number(movement.previous_stock || 0),
    new_stock: Number(movement.new_stock || 0),
    status: movement.movement_request_id ? "aprobado" : "registrado",
    reason: movement.reason || "",
  };
}

function sanitizeRequest(request) {
  return {
    id: request.id,
    requested_at: request.requested_at,
    product_supplier_id: request.product_supplier_id,
    product_name: request.store_products?.name || "Producto",
    request_type: request.request_type,
    quantity: Number(request.quantity || 0),
    reason: request.reason || "",
    status: request.status,
    rejection_reason: request.rejection_reason || "",
  };
}

export async function GET(request) {
  try {
    const supabase = createAdminClient();
    const session = await getSupplierSession(request, supabase);

    if (session.error) return errorResponse(session.error, session.status);

    const supplierIds = session.supplierIds;
    const [
      productsResult,
      salesResult,
      movementsResult,
      requestsResult,
    ] = await Promise.all([
      supabase
        .from("store_product_suppliers")
        .select(
          "id,product_id,supplier_id,supplier_sku,ownership_model,active,created_at,store_products(id,name,sku,sale_price,current_stock,active),store_supplier_inventory(id,current_stock)"
        )
        .in("supplier_id", supplierIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("store_sale_items")
        .select(
          "id,product_name,quantity,unit_price,discount_amount,supplier_net_amount,store_sales(id,sale_date,sale_reference,payment_method,status)"
        )
        .in("supplier_id", supplierIds)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("store_inventory_movements")
        .select(
          "id,movement_type,quantity,previous_stock,new_stock,reason,movement_request_id,created_at,store_products(id,name,sku)"
        )
        .in("supplier_id", supplierIds)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("store_inventory_movement_requests")
        .select(
          "id,requested_at,product_supplier_id,request_type,quantity,reason,status,rejection_reason,store_products(id,name,sku)"
        )
        .in("supplier_id", supplierIds)
        .order("requested_at", { ascending: false })
        .limit(100),
    ]);

    const firstError = [
      productsResult,
      salesResult,
      movementsResult,
      requestsResult,
    ].find((result) => result.error)?.error;

    if (firstError) return errorResponse(firstError.message, 400);

    const products = (productsResult.data || []).map(sanitizeProductRelation);
    const sales = (salesResult.data || []).map(sanitizeSupplierPortalSaleItem);
    const movements = (movementsResult.data || []).map(sanitizeMovement);
    const requests = (requestsResult.data || []).map(sanitizeRequest);
    const salesSummary = summarizeSupplierSaleItems(salesResult.data || []);

    return NextResponse.json({
      success: true,
      supplier: {
        commercial_name:
          session.supplierLinks[0]?.store_suppliers?.commercial_name ||
          "Proveedor",
      },
      summary: {
        sales_count: sales.length,
        units_sold: salesSummary.units,
        supplier_net_amount: salesSummary.supplierNet,
        products_count: products.length,
        stock_units: products.reduce((sum, product) => sum + product.stock, 0),
        pending_requests: requests.filter((item) => item.status === "pending").length,
      },
      products,
      sales,
      movements,
      requests,
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function POST(request) {
  try {
    const supabase = createAdminClient();
    const session = await getSupplierSession(request, supabase);
    if (session.error) return errorResponse(session.error, session.status);

    const body = await request.json();
    const productSupplierId = cleanText(body.product_supplier_id);
    const requestType = cleanText(body.request_type) || "entrada";
    const quantity = toPositiveInteger(body.quantity);
    const reason = cleanText(body.reason);

    if (!productSupplierId || quantity <= 0) {
      return errorResponse("Selecciona producto y cantidad mayor a cero.", 400);
    }

    if (!["entrada", "retiro", "correccion", "devolucion", "ajuste", "otro"].includes(requestType)) {
      return errorResponse("Tipo de solicitud inválido.", 400);
    }

    const { data: relation, error: relationError } = await supabase
      .from("store_product_suppliers")
      .select("id,product_id,supplier_id,active,store_suppliers(id,active)")
      .eq("id", productSupplierId)
      .single();

    if (relationError || !relation) {
      return errorResponse("No se encontró la relación producto/proveedor.", 400);
    }

    if (!session.supplierIds.includes(relation.supplier_id)) {
      return errorResponse("No puedes solicitar movimientos sobre productos de otro proveedor.", 403);
    }

    if (relation.active === false || relation.store_suppliers?.active === false) {
      return errorResponse("La relación producto/proveedor no está activa.", 400);
    }

    const { data, error } = await supabase
      .from("store_inventory_movement_requests")
      .insert([
        {
          supplier_id: relation.supplier_id,
          product_id: relation.product_id,
          product_supplier_id: relation.id,
          request_type: requestType,
          quantity,
          reason: reason || null,
          notes: cleanText(body.notes) || null,
          status: "pending",
          requested_by_user_profile_id: session.profile?.id || null,
          requested_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select("id,requested_at,product_supplier_id,request_type,quantity,reason,status,rejection_reason")
      .single();

    if (error) return errorResponse(error.message, 400);

    return NextResponse.json({ success: true, request: sanitizeRequest(data) });
  } catch (error) {
    return errorResponse(error, 500);
  }
}

export async function PATCH(request) {
  try {
    const supabase = createAdminClient();
    const session = await getSupplierSession(request, supabase);
    if (session.error) return errorResponse(session.error, session.status);

    const body = await request.json();
    const requestId = cleanText(body.id);

    if (!requestId) return errorResponse("Falta solicitud.", 400);

    const { data: existing, error: existingError } = await supabase
      .from("store_inventory_movement_requests")
      .select("id,supplier_id,status")
      .eq("id", requestId)
      .single();

    if (existingError || !existing) return errorResponse("Solicitud no encontrada.", 404);
    if (!session.supplierIds.includes(existing.supplier_id)) {
      return errorResponse("No puedes modificar solicitudes de otro proveedor.", 403);
    }
    if (existing.status !== "pending") {
      return errorResponse("Solo puedes cancelar solicitudes pendientes.", 400);
    }

    const { data, error } = await supabase
      .from("store_inventory_movement_requests")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id,requested_at,product_supplier_id,request_type,quantity,reason,status,rejection_reason")
      .single();

    if (error) return errorResponse(error.message, 400);

    return NextResponse.json({ success: true, request: sanitizeRequest(data) });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
