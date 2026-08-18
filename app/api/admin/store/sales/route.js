import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  PRODUCT_SALE_ITEM_SELECT,
  buildStoreSaleIdempotencyKey,
  buildStoreSaleProductsPayload,
  cleanText,
  getSellerCommissionPercent,
  normalizePaymentMethod,
  normalizeText,
  resolveProductSupplierForSale,
  toFiniteNumber,
  toPositiveInteger,
} from "../../../../lib/storeProductSale";

const saleRoles = ["admin", "encargada", "caja"];

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

async function getSessionProfile(request, supabase) {
  const token = getBearerToken(request);

  if (!token) {
    return {
      error: "Tu sesión expiró. Vuelve a iniciar sesión.",
      status: 401,
    };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData?.user) {
    return {
      error: "Tu sesión expiró. Vuelve a iniciar sesión.",
      status: 401,
    };
  }

  const user = userData.user;
  const userEmail = normalizeEmail(user.email);

  const { data: profilesById } = await supabase
    .from("user_profiles")
    .select("id, auth_user_id, email, role, active")
    .eq("auth_user_id", user.id)
    .limit(1);

  let profile = profilesById?.[0] || null;

  if (!profile && userEmail) {
    const { data: profilesByEmail } = await supabase
      .from("user_profiles")
      .select("id, auth_user_id, email, role, active")
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

  if (!saleRoles.includes(role)) {
    return {
      error: `Tu rol actual es ${profile.role || "sin rol"}. Solo admin, encargada o caja pueden vender productos.`,
      status: 403,
    };
  }

  return { token, user, profile, role };
}

function errorResponse(error, status = 400) {
  const rawMessage = error?.message || error || "No se pudo registrar la venta de productos.";
  const normalized = normalizeText(rawMessage);
  const messageMap = [
    ["product_supplier_required", "Selecciona proveedor para los productos con varias opciones activas."],
    ["product_supplier_unavailable", "El producto no tiene proveedores activos disponibles."],
    ["supplier_unavailable", "El producto no tiene proveedores activos disponibles."],
    ["supplier_stock_insufficient", "El proveedor seleccionado no tiene stock suficiente."],
    ["product_stock_insufficient", "El producto no tiene stock suficiente."],
    ["duplicate_product_line", "Un producto aparece duplicado en el carrito."],
    ["store_sale_not_allowed", "No tienes permiso para registrar ventas de tienda."],
    ["products_required", "Agrega al menos un producto para vender."],
  ];

  const mapped = messageMap.find(([code]) => normalized.includes(code))?.[1];

  return NextResponse.json(
    {
      success: false,
      error: mapped || rawMessage,
    },
    { status }
  );
}

function calculatePreviewTotals({ saleItems, discountAmount, paymentMethod, settings, seller }) {
  const subtotal = saleItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const discount = Math.min(Math.max(toFiniteNumber(discountAmount, 0), 0), subtotal);
  const total = Math.max(subtotal - discount, 0);
  const salonPercent = toFiniteNumber(settings?.salon_product_commission_percent, 0);
  const terminalPercent =
    paymentMethod === "tarjeta" || paymentMethod === "mixto"
      ? toFiniteNumber(settings?.terminal_card_fee_percent, 0)
      : 0;
  const sellerPercent = getSellerCommissionPercent(
    seller,
    settings?.default_seller_commission_percent
  );

  return {
    subtotal,
    discount,
    total,
    salonPercent,
    terminalPercent,
    sellerPercent,
  };
}

export async function POST(request) {
  try {
    const adminSupabase = createAdminClient();
    const session = await getSessionProfile(request, adminSupabase);

    if (session.error) return errorResponse(session.error, session.status);

    const supabase = createAuthenticatedClient(session.token);
    const body = await request.json();
    const products = Array.isArray(body.products) ? body.products : [];

    if (products.length === 0) {
      return errorResponse("Agrega al menos un producto para vender.", 400);
    }

    const productIds = products.map((item) => item.product_id).filter(Boolean);

    if (productIds.length !== products.length) {
      return errorResponse("Hay productos sin ID válido.", 400);
    }

    const { data: dbProducts, error: productsError } = await supabase
      .from("store_products")
      .select(PRODUCT_SALE_ITEM_SELECT)
      .in("id", productIds);

    if (productsError) return errorResponse(productsError.message, 400);

    const productsById = new Map((dbProducts || []).map((item) => [item.id, item]));
    const saleItems = [];

    for (const line of products) {
      const product = productsById.get(line.product_id);
      const quantity = toPositiveInteger(line.quantity);
      if (!product) return errorResponse("No se encontró uno de los productos.", 400);
      const unitPrice = toFiniteNumber(product.sale_price, 0);

      if (product.active === false) return errorResponse(`${product.name} está inactivo.`, 400);
      if (quantity <= 0) return errorResponse(`Cantidad inválida para ${product.name}.`, 400);
      if (unitPrice < 0) return errorResponse(`Precio inválido para ${product.name}.`, 400);
      if (quantity > Number(product.current_stock || 0)) {
        return errorResponse(`Stock insuficiente para ${product.name}.`, 400);
      }

      const supplierResolution = resolveProductSupplierForSale({
        product,
        quantity,
        requestedProductSupplierId: line.product_supplier_id,
      });

      if (!supplierResolution.ok) {
        return errorResponse(
          `${supplierResolution.message} Producto: ${product.name}`,
          supplierResolution.code === "supplier_required" ? 409 : 400
        );
      }

      saleItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit_price: unitPrice,
        subtotal: Number((quantity * unitPrice).toFixed(2)),
        product_supplier_id: supplierResolution.selected?.id || null,
      });
    }

    const paymentMethod = normalizePaymentMethod(body.payment_method);

    const { data: settings } = await supabase
      .from("store_settings")
      .select(
        "salon_product_commission_percent,terminal_card_fee_percent,default_seller_commission_percent"
      )
      .limit(1)
      .maybeSingle();

    const { data: seller } = body.seller_staff_id
      ? await supabase
          .from("staff")
          .select("product_commission_percentage")
          .eq("id", body.seller_staff_id)
          .maybeSingle()
      : { data: null };

    const discountAmount = toFiniteNumber(body.discount_amount, 0);
    const preview = calculatePreviewTotals({
      saleItems,
      discountAmount,
      paymentMethod,
      settings,
      seller,
    });
    const idempotencyKey =
      cleanText(body.idempotency_key) ||
      buildStoreSaleIdempotencyKey({
        source: body.source || "direct_sale",
        paymentId: body.payment_id || null,
        appointmentId: body.appointment_id || null,
        cart: saleItems,
        timestamp: body.client_request_id || new Date().toISOString(),
      });

    const { data: transactionResult, error: transactionError } = await supabase.rpc(
      "create_store_product_sale_transaction",
      {
        p_sale_date: body.sale_date || new Date().toISOString().slice(0, 10),
        p_source: body.source || "direct_sale",
        p_payment_method: paymentMethod,
        p_products: buildStoreSaleProductsPayload(saleItems),
        p_seller_staff_id: seller?.id || null,
        p_discount_amount: discountAmount,
        p_notes: cleanText(body.notes) || null,
        p_appointment_id: body.appointment_id || null,
        p_payment_id: body.payment_id || null,
        p_client_id: body.client_id || null,
        p_seller_commission_percent: null,
        p_idempotency_key: idempotencyKey,
      }
    );

    if (transactionError) return errorResponse(transactionError.message, 400);

    return NextResponse.json({
      success: true,
      sale: {
        id: transactionResult?.saleId || null,
        sale_reference: transactionResult?.saleReference || null,
      },
      total: transactionResult?.total ?? preview.total,
      idempotent: Boolean(transactionResult?.idempotent),
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
