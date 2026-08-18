export const PRODUCT_SALE_ITEM_SELECT =
  "id,name,sku,brand,category,cost_price,sale_price,current_stock,active,store_product_suppliers(id,product_id,supplier_id,supplier_sku,reference_cost,ownership_model,active,is_default_for_sales,priority,store_suppliers(id,commercial_name,active),store_supplier_inventory(id,current_stock))";

export function cleanText(value) {
  return String(value || "").trim();
}

export function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizePaymentMethod(value) {
  const text = normalizeText(value);
  if (text.includes("tarjeta")) return "tarjeta";
  if (text.includes("transferencia")) return "transferencia";
  if (text.includes("mixto")) return "mixto";
  return "efectivo";
}

export function cashPaymentMethodLabel(value) {
  const method = normalizePaymentMethod(value);
  if (method === "tarjeta") return "Tarjeta";
  if (method === "transferencia") return "Transferencia";
  if (method === "mixto") return "Mixto";
  return "Efectivo";
}

export function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toPositiveInteger(value) {
  const parsed = Math.trunc(toFiniteNumber(value, 0));
  return parsed > 0 ? parsed : 0;
}

export function getSellerCommissionPercent(staff, fallback) {
  const fields = [
    "product_commission_percent",
    "products_commission_percent",
    "sales_commission_percent",
    "commission_products_percent",
    "product_commission_percentage",
    "products_commission_percentage",
  ];

  for (const field of fields) {
    const value = toFiniteNumber(staff?.[field], 0);
    if (value > 0) return value;
  }

  return toFiniteNumber(fallback, 0);
}

export function getSupplierInventoryStock(relation) {
  const inventory = relation?.store_supplier_inventory;

  if (Array.isArray(inventory)) {
    return toFiniteNumber(inventory[0]?.current_stock, 0);
  }

  return toFiniteNumber(inventory?.current_stock, 0);
}

export function getProductSupplierOptions(product, { requireStock = false } = {}) {
  const relations = Array.isArray(product?.store_product_suppliers)
    ? product.store_product_suppliers
    : [];

  return relations
    .filter((relation) => relation?.active !== false)
    .filter((relation) => relation?.store_suppliers?.active !== false)
    .map((relation) => ({
      id: relation.id,
      product_id: relation.product_id || product?.id || null,
      supplier_id: relation.supplier_id,
      supplier_name:
        relation.store_suppliers?.commercial_name ||
        relation.supplier_name_snapshot ||
        "Proveedor",
      supplier_sku: relation.supplier_sku || "",
      ownership_model: relation.ownership_model || "consignment",
      reference_cost:
        relation.reference_cost === null || relation.reference_cost === undefined
          ? null
          : toFiniteNumber(relation.reference_cost, 0),
      priority: Number.isFinite(Number(relation.priority))
        ? Number(relation.priority)
        : 100,
      current_stock: getSupplierInventoryStock(relation),
      active: relation.active !== false,
    }))
    .filter((option) => !requireStock || option.current_stock > 0)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.supplier_name.localeCompare(b.supplier_name, "es");
    });
}

export function resolveProductSupplierForSale({
  product,
  quantity,
  requestedProductSupplierId = "",
}) {
  const safeQuantity = toPositiveInteger(quantity);
  const relations = Array.isArray(product?.store_product_suppliers)
    ? product.store_product_suppliers
    : [];
  const options = getProductSupplierOptions(product);
  const inStockOptions = options.filter(
    (option) => option.current_stock >= safeQuantity
  );
  const requestedId = cleanText(requestedProductSupplierId);

  if (safeQuantity <= 0) {
    return {
      ok: false,
      code: "quantity_invalid",
      message: "La cantidad debe ser mayor a cero.",
      options,
    };
  }

  if (requestedId) {
    const selected = options.find((option) => option.id === requestedId);

    if (!selected) {
      return {
        ok: false,
        code: "supplier_not_found",
        message: "El proveedor seleccionado no pertenece al producto.",
        options,
      };
    }

    if (selected.current_stock < safeQuantity) {
      return {
        ok: false,
        code: "supplier_stock_insufficient",
        message: `Stock insuficiente con ${selected.supplier_name}.`,
        selected,
        options,
      };
    }

    return {
      ok: true,
      mode: "structured",
      selected,
      requiresSelection: false,
      options,
      economicSnapshotComplete: true,
    };
  }

  if (options.length === 0 && relations.length === 0) {
    return {
      ok: true,
      mode: "legacy",
      selected: null,
      requiresSelection: false,
      options,
      economicSnapshotComplete: false,
      reason: "legacy_product_without_structured_supplier",
    };
  }

  if (options.length === 0) {
    return {
      ok: false,
      code: "supplier_unavailable",
      message: "Este producto no tiene proveedores activos disponibles.",
      requiresSelection: true,
      options,
    };
  }

  if (inStockOptions.length === 1) {
    return {
      ok: true,
      mode: "structured",
      selected: inStockOptions[0],
      requiresSelection: false,
      options,
      economicSnapshotComplete: true,
    };
  }

  if (inStockOptions.length > 1) {
    return {
      ok: false,
      code: "supplier_required",
      message: "Selecciona proveedor para este producto.",
      requiresSelection: true,
      options,
    };
  }

  return {
    ok: false,
    code: "supplier_stock_insufficient",
    message: "Ningún proveedor activo tiene stock suficiente para este producto.",
    options,
  };
}

export function buildStoreSaleProductsPayload(cart) {
  return (Array.isArray(cart) ? cart : []).map((line) => ({
    product_id: line.product_id,
    quantity: toPositiveInteger(line.quantity),
    unit_price: toFiniteNumber(line.unit_price, 0),
    product_supplier_id: cleanText(line.product_supplier_id) || null,
  }));
}

export function buildStoreSaleIdempotencyKey({
  source,
  paymentId,
  appointmentId,
  cart,
  timestamp,
}) {
  const normalizedSource = cleanText(source) || "direct_sale";

  if (normalizedSource === "appointment_payment" && paymentId) {
    return `store-sale:appointment-payment:${paymentId}`;
  }

  const productFingerprint = (Array.isArray(cart) ? cart : [])
    .map((item) =>
      [
        item.product_id,
        item.product_supplier_id || "legacy",
        toPositiveInteger(item.quantity),
        toFiniteNumber(item.unit_price, 0).toFixed(2),
      ].join(":")
    )
    .sort()
    .join("|");

  return [
    "store-sale",
    normalizedSource,
    appointmentId || "direct",
    timestamp || new Date().toISOString(),
    productFingerprint || "empty",
  ].join(":");
}

export function summarizeSupplierSaleItems(items) {
  return (Array.isArray(items) ? items : []).reduce(
    (summary, item) => {
      summary.units += toFiniteNumber(item.quantity, 0);
      summary.gross += toFiniteNumber(item.gross_amount ?? item.subtotal, 0);
      summary.supplierNet += toFiniteNumber(item.supplier_net_amount, 0);
      return summary;
    },
    { units: 0, gross: 0, supplierNet: 0 }
  );
}

export function sanitizeSupplierPortalSaleItem(item) {
  const sale = item?.store_sales || {};

  return {
    id: item?.id || "",
    sale_date: sale.sale_date || "",
    sale_reference: sale.sale_reference || "",
    product_name: item?.product_name || "Producto",
    quantity: toFiniteNumber(item?.quantity, 0),
    unit_price: toFiniteNumber(item?.unit_price, 0),
    discount_amount: toFiniteNumber(item?.discount_amount, 0),
    payment_method: sale.payment_method || "",
    supplier_net_amount: toFiniteNumber(item?.supplier_net_amount, 0),
    status: sale.status || "completed",
  };
}
