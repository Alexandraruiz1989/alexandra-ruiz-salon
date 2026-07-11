import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const saleRoles = ["admin", "encargada", "caja"];

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

  const role = normalizeRole(profile.role);

  if (!saleRoles.includes(role)) {
    return {
      error: `Tu rol actual es ${profile.role || "sin rol"}. Solo admin, encargada o caja pueden vender productos.`,
      status: 403,
    };
  }

  return { token, user, profile, role };
}

function errorResponse(error, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error: error?.message || error || "No se pudo registrar la venta de productos.",
    },
    { status }
  );
}

function normalizePaymentMethod(value) {
  const text = normalizeRole(value);
  if (text.includes("tarjeta")) return "tarjeta";
  if (text.includes("transferencia")) return "transferencia";
  if (text.includes("mixto")) return "mixto";
  return "efectivo";
}

function cashPaymentMethodLabel(value) {
  if (value === "tarjeta") return "Tarjeta";
  if (value === "transferencia") return "Transferencia";
  if (value === "mixto") return "Mixto";
  return "Efectivo";
}

function getSellerCommissionPercent(staff, fallback) {
  const fields = [
    "product_commission_percent",
    "products_commission_percent",
    "sales_commission_percent",
    "commission_products_percent",
    "product_commission_percentage",
    "products_commission_percentage",
  ];

  for (const field of fields) {
    const value = Number(staff?.[field] || 0);
    if (value > 0) return value;
  }

  return Number(fallback || 0);
}

export async function POST(request) {
  try {
    const token = getBearerToken(request);
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
      .select("*")
      .in("id", productIds);

    if (productsError) return errorResponse(productsError.message, 400);

    const productsById = new Map((dbProducts || []).map((item) => [item.id, item]));
    const now = new Date().toISOString();
    const saleItems = [];

    for (const line of products) {
      const product = productsById.get(line.product_id);
      const quantity = Math.trunc(Number(line.quantity || 0));
      const unitPrice = Number(line.unit_price ?? product?.sale_price ?? 0);

      if (!product) return errorResponse("No se encontró uno de los productos.", 400);
      if (product.active === false) {
        return errorResponse(`${product.name} está inactivo.`, 400);
      }
      if (quantity <= 0) {
        return errorResponse(`Cantidad inválida para ${product.name}.`, 400);
      }
      if (unitPrice < 0) {
        return errorResponse(`Precio inválido para ${product.name}.`, 400);
      }
      if (quantity > Number(product.current_stock || 0)) {
        return errorResponse(`Stock insuficiente para ${product.name}.`, 400);
      }

      saleItems.push({
        product,
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit_price: unitPrice,
        subtotal: Number((quantity * unitPrice).toFixed(2)),
      });
    }

    const paymentMethod = normalizePaymentMethod(body.payment_method);
    const subtotal = saleItems.reduce((sum, item) => sum + item.subtotal, 0);
    const discount = Number(body.discount_amount || 0);
    const total = Math.max(subtotal - discount, 0);

    const { data: settings } = await supabase
      .from("store_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    const { data: seller } = body.seller_staff_id
      ? await supabase
          .from("staff")
          .select("*")
          .eq("id", body.seller_staff_id)
          .maybeSingle()
      : { data: null };

    const salonPercent = Number(settings?.salon_product_commission_percent || 0);
    const terminalPercent =
      paymentMethod === "tarjeta" || paymentMethod === "mixto"
        ? Number(settings?.terminal_card_fee_percent || 0)
        : 0;
    const sellerPercent = getSellerCommissionPercent(
      seller,
      settings?.default_seller_commission_percent
    );

    const salonCommission = total * (salonPercent / 100);
    const terminalFee = total * (terminalPercent / 100);
    const sellerCommission = total * (sellerPercent / 100);
    const externalNet = total - salonCommission - terminalFee - sellerCommission;

    const { data: sale, error: saleError } = await supabase
      .from("store_sales")
      .insert([
        {
          sale_date: body.sale_date || new Date().toISOString().slice(0, 10),
          appointment_id: body.appointment_id || null,
          payment_id: body.payment_id || null,
          client_id: body.client_id || null,
          seller_staff_id: seller?.id || null,
          seller_name: seller?.full_name || null,
          subtotal: Number(subtotal.toFixed(2)),
          discount_amount: Number(discount.toFixed(2)),
          total_amount: Number(total.toFixed(2)),
          payment_method: paymentMethod,
          salon_commission_percent: salonPercent,
          salon_commission_amount: Number(salonCommission.toFixed(2)),
          terminal_fee_percent: terminalPercent,
          terminal_fee_amount: Number(terminalFee.toFixed(2)),
          seller_commission_percent: sellerPercent,
          seller_commission_amount: Number(sellerCommission.toFixed(2)),
          external_owner_net_amount: Number(externalNet.toFixed(2)),
          cash_registered: true,
          source: body.source || "direct_sale",
          notes: cleanText(body.notes) || null,
          created_by: session.user?.email || null,
          updated_at: now,
        },
      ])
      .select()
      .single();

    if (saleError) return errorResponse(saleError.message, 400);

    const itemRows = saleItems.map((item) => ({
      sale_id: sale.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
    }));

    const { error: itemsError } = await supabase.from("store_sale_items").insert(itemRows);
    if (itemsError) return errorResponse(itemsError.message, 400);

    for (const item of saleItems) {
      const previousStock = Number(item.product.current_stock || 0);
      const newStock = previousStock - item.quantity;

      const { error: stockError } = await supabase
        .from("store_products")
        .update({ current_stock: newStock, updated_at: now })
        .eq("id", item.product_id);

      if (stockError) return errorResponse(stockError.message, 400);

      const { error: movementError } = await supabase
        .from("store_inventory_movements")
        .insert([
          {
            product_id: item.product_id,
            movement_type: "venta",
            quantity: item.quantity,
            previous_stock: previousStock,
            new_stock: newStock,
            note: `Venta de producto ${sale.id}`,
            created_by: session.user?.email || null,
          },
        ]);

      if (movementError) return errorResponse(movementError.message, 400);
    }

    const { error: cashError } = await supabase.from("cash_movements").insert([
      {
        movement_date: body.sale_date || new Date().toISOString().slice(0, 10),
        movement_type: "ingreso",
        amount: Number(total.toFixed(2)),
        payment_method: cashPaymentMethodLabel(paymentMethod),
        concept:
          body.source === "appointment_payment"
            ? `Venta de productos en cobro ${body.payment_id || sale.id}`
            : `Venta de productos ${sale.id}`,
        category: "venta_producto",
        notes: `Tienda · Vendedora: ${seller?.full_name || "Sin vendedora"}`,
        payment_id: body.payment_id || null,
        created_by_user_id: session.user?.id || null,
        created_by_email: session.user?.email || null,
        updated_at: now,
      },
    ]);

    if (cashError) return errorResponse(cashError.message, 400);

    return NextResponse.json({
      success: true,
      sale,
      total,
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
