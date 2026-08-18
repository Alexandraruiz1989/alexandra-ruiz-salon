import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildStoreSaleIdempotencyKey,
  buildStoreSaleProductsPayload,
  resolveProductSupplierForSale,
  sanitizeSupplierPortalSaleItem,
} from "../app/lib/storeProductSale.js";

const migrationSource = readFileSync(
  new URL("../supabase/migrations/202608180001_store_supplier_inventory_workflow.sql", import.meta.url),
  "utf8"
);

const supplierApiSource = readFileSync(
  new URL("../app/api/supplier/store/route.js", import.meta.url),
  "utf8"
);

const adminSupplierApiSource = readFileSync(
  new URL("../app/api/admin/store/suppliers/route.js", import.meta.url),
  "utf8"
);

const saleApiSource = readFileSync(
  new URL("../app/api/admin/store/sales/route.js", import.meta.url),
  "utf8"
);

const tiendaPageSource = readFileSync(
  new URL("../app/admin/tienda/page.js", import.meta.url),
  "utf8"
);

const cobrosPageSource = readFileSync(
  new URL("../app/admin/cobros/page.js", import.meta.url),
  "utf8"
);

function productWithSuppliers(relations = []) {
  return {
    id: "product-1",
    name: "Producto prueba",
    current_stock: 10,
    sale_price: 250,
    active: true,
    store_product_suppliers: relations,
  };
}

function relation(overrides = {}) {
  return {
    id: overrides.id || "relation-1",
    product_id: "product-1",
    supplier_id: overrides.supplier_id || "supplier-1",
    supplier_sku: "",
    ownership_model: overrides.ownership_model || "consignment",
    reference_cost: overrides.reference_cost ?? 100,
    active: overrides.active ?? true,
    priority: overrides.priority ?? 100,
    store_suppliers: {
      id: overrides.supplier_id || "supplier-1",
      commercial_name: overrides.supplier_name || "Proveedor Uno",
      active: overrides.supplierActive ?? true,
    },
    store_supplier_inventory: {
      id: `inventory-${overrides.id || "relation-1"}`,
      current_stock: overrides.current_stock ?? 10,
    },
  };
}

test("venta con un solo proveedor activo con stock se atribuye automaticamente", () => {
  const result = resolveProductSupplierForSale({
    product: productWithSuppliers([relation()]),
    quantity: 2,
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "structured");
  assert.equal(result.selected.id, "relation-1");
  assert.equal(result.economicSnapshotComplete, true);
});

test("producto con varios proveedores activos exige seleccion explicita", () => {
  const result = resolveProductSupplierForSale({
    product: productWithSuppliers([
      relation({ id: "relation-1", supplier_id: "supplier-1" }),
      relation({ id: "relation-2", supplier_id: "supplier-2", supplier_name: "Proveedor Dos" }),
    ]),
    quantity: 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "supplier_required");
  assert.equal(result.requiresSelection, true);
});

test("proveedor inactivo o relacion inactiva no son seleccionables", () => {
  const inactiveSupplier = resolveProductSupplierForSale({
    product: productWithSuppliers([
      relation({ id: "relation-1", supplierActive: false, current_stock: 10 }),
    ]),
    quantity: 1,
  });
  const inactiveRelation = resolveProductSupplierForSale({
    product: productWithSuppliers([
      relation({ id: "relation-1", active: false, current_stock: 10 }),
    ]),
    quantity: 1,
  });

  assert.equal(inactiveSupplier.ok, false);
  assert.equal(inactiveSupplier.code, "supplier_unavailable");
  assert.equal(inactiveRelation.ok, false);
  assert.equal(inactiveRelation.code, "supplier_unavailable");
});

test("producto con proveedor seleccionado valida que pertenezca y tenga stock", () => {
  const product = productWithSuppliers([
    relation({ id: "relation-1", supplier_id: "supplier-1", current_stock: 2 }),
    relation({ id: "relation-2", supplier_id: "supplier-2", current_stock: 5 }),
  ]);

  const selected = resolveProductSupplierForSale({
    product,
    quantity: 3,
    requestedProductSupplierId: "relation-2",
  });
  const insufficient = resolveProductSupplierForSale({
    product,
    quantity: 3,
    requestedProductSupplierId: "relation-1",
  });

  assert.equal(selected.ok, true);
  assert.equal(selected.selected.supplier_id, "supplier-2");
  assert.equal(insufficient.ok, false);
  assert.equal(insufficient.code, "supplier_stock_insufficient");
});

test("producto legacy sin proveedor estructurado sigue siendo compatible e incompleto economicamente", () => {
  const result = resolveProductSupplierForSale({
    product: productWithSuppliers([]),
    quantity: 1,
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "legacy");
  assert.equal(result.selected, null);
  assert.equal(result.economicSnapshotComplete, false);
});

test("stock legacy no se redistribuye al asociar proveedor", () => {
  assert.match(adminSupplierApiSource, /current_stock:\s*0/);
  assert.doesNotMatch(
    adminSupplierApiSource,
    /\.from\(["']store_products["']\)[\s\S]{0,160}\.update\([\s\S]{0,160}current_stock/
  );
  assert.doesNotMatch(migrationSource, /current_stock\s*=\s*sum\(/i);
  assert.doesNotMatch(migrationSource, /sum\s*\(\s*.*store_supplier_inventory.*current_stock/i);
});

test("payload de venta conserva product_supplier_id y no inventa proveedor", () => {
  const payload = buildStoreSaleProductsPayload([
    {
      product_id: "product-1",
      quantity: 2,
      unit_price: 250,
      product_supplier_id: "relation-1",
    },
    {
      product_id: "product-legacy",
      quantity: 1,
      unit_price: 100,
      product_supplier_id: "",
    },
  ]);

  assert.deepEqual(payload, [
    {
      product_id: "product-1",
      quantity: 2,
      unit_price: 250,
      product_supplier_id: "relation-1",
    },
    {
      product_id: "product-legacy",
      quantity: 1,
      unit_price: 100,
      product_supplier_id: null,
    },
  ]);
});

test("idempotencia de productos en Cobros depende del payment_id", () => {
  const first = buildStoreSaleIdempotencyKey({
    source: "appointment_payment",
    paymentId: "payment-1",
    appointmentId: "appointment-1",
    cart: [],
  });
  const second = buildStoreSaleIdempotencyKey({
    source: "appointment_payment",
    paymentId: "payment-1",
    appointmentId: "appointment-1",
    cart: [{ product_id: "otra-cosa" }],
  });

  assert.equal(first, "store-sale:appointment-payment:payment-1");
  assert.equal(second, first);
});

test("portal proveedor no devuelve datos privados de clientas, citas o pagos", () => {
  const sale = sanitizeSupplierPortalSaleItem({
    id: "item-1",
    product_name: "Producto",
    quantity: 1,
    unit_price: 200,
    discount_amount: 0,
    supplier_net_amount: 150,
    client_id: "client-private",
    appointment_id: "appointment-private",
    payment_id: "payment-private",
    store_sales: {
      id: "sale-1",
      sale_date: "2026-08-18",
      sale_reference: "TV-TEST",
      payment_method: "tarjeta",
      status: "completed",
      client_id: "client-private",
      payment_id: "payment-private",
      appointment_id: "appointment-private",
    },
  });

  assert.deepEqual(Object.keys(sale).sort(), [
    "discount_amount",
    "id",
    "payment_method",
    "product_name",
    "quantity",
    "sale_date",
    "sale_reference",
    "status",
    "supplier_net_amount",
    "unit_price",
  ]);
  assert.doesNotMatch(JSON.stringify(sale), /client-private|appointment-private|payment-private/);
});

test("endpoint proveedor usa DTO explicito y no select star", () => {
  assert.doesNotMatch(supplierApiSource, /\.select\(\s*["']\*/);
  assert.match(supplierApiSource, /sanitizeProductRelation/);
  assert.match(supplierApiSource, /sanitizeMovement/);
  assert.match(supplierApiSource, /sanitizeRequest/);
  assert.match(supplierApiSource, /sanitizeSupplierPortalSaleItem/);
});

test("migracion crea tablas, columnas, RLS y RPCs esperadas sin tocar create_payment_transaction", () => {
  for (const table of [
    "store_suppliers",
    "store_supplier_users",
    "store_product_suppliers",
    "store_supplier_inventory",
    "store_inventory_movement_requests",
    "store_inventory_approvers",
  ]) {
    assert.match(migrationSource, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
    assert.match(migrationSource, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }

  for (const column of [
    "supplier_id",
    "product_supplier_id",
    "supplier_name_snapshot",
    "ownership_model_snapshot",
    "unit_cost_snapshot",
    "supplier_net_amount",
    "economic_snapshot_complete",
  ]) {
    assert.match(migrationSource, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
  }

  assert.match(migrationSource, /CREATE OR REPLACE FUNCTION public\.approve_store_inventory_movement_request/);
  assert.match(migrationSource, /CREATE OR REPLACE FUNCTION public\.reject_store_inventory_movement_request/);
  assert.match(migrationSource, /CREATE OR REPLACE FUNCTION public\.create_store_product_sale_transaction/);
  assert.doesNotMatch(migrationSource, /CREATE OR REPLACE FUNCTION public\.create_payment_transaction/);
});

test("aprobacion usa bloqueo, status pending y evita doble movimiento", () => {
  assert.match(migrationSource, /FOR UPDATE/);
  assert.match(migrationSource, /v_request\.status <> 'pending'/);
  assert.match(migrationSource, /WHERE id = v_request\.id\s+AND status = 'pending'/);
  assert.match(migrationSource, /CREATE UNIQUE INDEX IF NOT EXISTS store_inventory_movements_request_idx/);
});

test("RLS y RPC impiden spoofing de supplier_id en solicitudes", () => {
  assert.match(migrationSource, /store_supplier_product_relation_matches/);
  assert.match(migrationSource, /store_inventory_requests_insert_supplier_own[\s\S]*store_supplier_product_relation_matches/);
  assert.match(migrationSource, /approve_store_inventory_movement_request[\s\S]*store_supplier_product_relation_matches/);
  assert.match(supplierApiSource, /session\.supplierIds\.includes\(relation\.supplier_id\)/);
  assert.match(supplierApiSource, /No puedes solicitar movimientos sobre productos de otro proveedor/);
});

test("solo admin o aprobadores activos pueden aprobar o rechazar stock", () => {
  assert.match(migrationSource, /CREATE OR REPLACE FUNCTION public\.store_user_can_approve_inventory/);
  assert.match(migrationSource, /store_user_has_any_active_role\(ARRAY\['admin'::text\]\)/);
  assert.match(migrationSource, /FROM public\.store_inventory_approvers approver/);
  assert.match(migrationSource, /approver\.active = true/);
  assert.match(migrationSource, /approver\.revoked_at IS NULL/);
  assert.doesNotMatch(
    migrationSource.slice(
      migrationSource.indexOf("CREATE OR REPLACE FUNCTION public.store_user_can_approve_inventory"),
      migrationSource.indexOf("CREATE OR REPLACE FUNCTION public.approve_store_inventory_movement_request")
    ),
    /store_supplier_user_is_active/
  );
});

test("entrada aprobada incrementa inventario proveedor y stock total en la misma RPC", () => {
  assert.match(migrationSource, /IF v_request\.request_type = 'entrada' THEN\s+v_delta := v_request\.quantity/s);
  assert.match(migrationSource, /v_supplier_new_stock := coalesce\(v_inventory\.current_stock, 0\) \+ v_delta/);
  assert.match(migrationSource, /v_product_new_stock := coalesce\(v_product\.current_stock, 0\) \+ v_delta/);
  assert.match(migrationSource, /UPDATE public\.store_supplier_inventory[\s\S]*SET current_stock = v_supplier_new_stock/);
  assert.match(migrationSource, /UPDATE public\.store_products[\s\S]*SET current_stock = v_product_new_stock/);
});

test("venta con proveedor descuenta inventario proveedor y stock total en una sola RPC", () => {
  assert.match(migrationSource, /v_supplier_new_stock := v_supplier_previous_stock - v_quantity/);
  assert.match(migrationSource, /v_product_new_stock := v_product_previous_stock - v_quantity/);
  assert.match(migrationSource, /UPDATE public\.store_supplier_inventory[\s\S]*SET current_stock = v_supplier_new_stock/);
  assert.match(migrationSource, /UPDATE public\.store_products[\s\S]*SET current_stock = v_product_new_stock/);
});

test("fallos transaccionales no se silencian en RPCs de stock y venta", () => {
  for (const functionName of [
    "approve_store_inventory_movement_request",
    "reject_store_inventory_movement_request",
    "create_store_product_sale_transaction",
  ]) {
    const start = migrationSource.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`);
    const next = migrationSource.indexOf("CREATE OR REPLACE FUNCTION public.", start + 1);
    const source = migrationSource.slice(start, next === -1 ? undefined : next);
    assert.match(source, /LANGUAGE plpgsql/);
    assert.match(source, /SECURITY DEFINER/);
    assert.match(source, /SET search_path = public, pg_temp/);
    assert.doesNotMatch(source, /EXCEPTION\s+WHEN\s+OTHERS[\s\S]*RETURN/i);
  }
});

test("venta repetida con misma idempotency_key no duplica venta, stock, movimientos ni caja", () => {
  const saleFunction = migrationSource.slice(
    migrationSource.indexOf("CREATE OR REPLACE FUNCTION public.create_store_product_sale_transaction"),
    migrationSource.indexOf("ALTER TABLE public.store_suppliers ENABLE ROW LEVEL SECURITY")
  );

  assert.match(migrationSource, /CREATE UNIQUE INDEX IF NOT EXISTS store_sales_idempotency_key_idx/);
  assert.match(saleFunction, /WHERE idempotency_key = v_idempotency_key/);
  assert.match(saleFunction, /RETURN jsonb_build_object\('success', true, 'saleId', v_existing\.id, 'idempotent', true\)/);
  assert.ok(
    saleFunction.indexOf("WHERE idempotency_key = v_idempotency_key") <
      saleFunction.indexOf("INSERT INTO public.store_sales")
  );
});

test("servidor no confia precio ni comision enviados por cliente", () => {
  assert.match(saleApiSource, /const unitPrice = toFiniteNumber\(product\.sale_price, 0\)/);
  assert.doesNotMatch(saleApiSource, /unit_price:\s*line\.unit_price/);
  assert.match(saleApiSource, /p_seller_commission_percent:\s*null/);
  assert.match(
    saleApiSource,
    /\.from\("store_settings"\)[\s\S]*\.select\(\s*"salon_product_commission_percent,terminal_card_fee_percent,default_seller_commission_percent"\s*\)/
  );
  assert.match(saleApiSource, /\.from\("staff"\)[\s\S]*\.select\("product_commission_percentage"\)/);
  assert.match(migrationSource, /v_unit_price := round\(coalesce\(v_product\.sale_price, 0\), 2\)/);
  assert.doesNotMatch(migrationSource, /ELSE greatest\(p_seller_commission_percent/);
  assert.doesNotMatch(tiendaPageSource, /seller_commission_percent:\s*saleTotals\.sellerPercent/);
});

test("Tienda y Cobros bloquean productos con proveedor estructurado no disponible", () => {
  for (const source of [tiendaPageSource, cobrosPageSource]) {
    assert.match(source, /supplier_error:\s*supplierResolution\.ok \? "" : supplierResolution\.message/);
    assert.match(source, /find\(\(.*\) => .*\.supplier_error\)/s);
    assert.match(source, /supplier_options\?\.\length === 0 && !.*\.supplier_error/s);
  }
});

test("salon_owned no inventa neto a proveedor", () => {
  assert.match(
    migrationSource,
    /WHEN \(v_line ->> 'ownership_model_snapshot'\) = 'salon_owned' THEN 0/
  );
});

test("rechazo no modifica inventario ni stock", () => {
  const rejectionFunction = migrationSource.slice(
    migrationSource.indexOf("CREATE OR REPLACE FUNCTION public.reject_store_inventory_movement_request"),
    migrationSource.indexOf("CREATE OR REPLACE FUNCTION public.create_store_product_sale_transaction")
  );

  assert.match(rejectionFunction, /status = 'rejected'/);
  assert.doesNotMatch(rejectionFunction, /UPDATE public\.store_supplier_inventory/);
  assert.doesNotMatch(rejectionFunction, /UPDATE public\.store_products/);
  assert.doesNotMatch(rejectionFunction, /INSERT INTO public\.store_inventory_movements/);
});

test("proveedor no recibe acceso API a payments, appointments, clients ni datos de cita", () => {
  assert.doesNotMatch(supplierApiSource, /\.from\(["']payments["']\)/);
  assert.doesNotMatch(supplierApiSource, /\.from\(["']appointments["']\)/);
  assert.doesNotMatch(supplierApiSource, /\.from\(["']clients["']\)/);
  assert.doesNotMatch(supplierApiSource, /client_id|payment_id|appointment_id/);
});

test("venta de productos usa RPC separada y no create_payment_transaction", () => {
  assert.match(saleApiSource, /create_store_product_sale_transaction/);
  assert.doesNotMatch(saleApiSource, /create_payment_transaction/);
});
