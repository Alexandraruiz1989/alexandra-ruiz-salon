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

const saleApiSource = readFileSync(
  new URL("../app/api/admin/store/sales/route.js", import.meta.url),
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
