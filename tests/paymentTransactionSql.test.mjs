import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202608100001_payment_economic_trace.sql",
    import.meta.url
  ),
  "utf8"
);
const paymentPage = readFileSync(
  new URL("../app/admin/cobros/page.js", import.meta.url),
  "utf8"
);

test("migración agrega relaciones nullable de extras hacia appointment_services", () => {
  assert.match(
    migration,
    /alter table public\.appointment_extra_items[\s\S]*appointment_service_id uuid/i
  );
  assert.match(
    migration,
    /alter table public\.payment_extra_items[\s\S]*appointment_service_id uuid[\s\S]*appointment_extra_item_id uuid/i
  );
  assert.match(
    migration,
    /foreign key \(appointment_service_id\)[\s\S]*references public\.appointment_services\(id\)[\s\S]*on delete set null/i
  );
  const schemaOnly = migration.split("CREATE OR REPLACE FUNCTION")[0];
  assert.doesNotMatch(schemaOnly, /update public\.appointment_extra_items/i);
});

test("RPC valida que cada extra pertenezca a un servicio de la misma cita", () => {
  assert.match(migration, /message = 'extra_appointment_service_required'/i);
  assert.match(
    migration,
    /service\.id = \(v_extra ->> 'appointmentServiceId'\)::uuid[\s\S]*service\.appointment_id = p_appointment_id/i
  );
  assert.match(migration, /v_original_extra\.appointment_service_id <> v_service\.id/i);
  assert.match(migration, /'staffId', v_service\.staff_id/i);
});

test("RPC conserva una partida por appointment_service sin usar el total del pago", () => {
  assert.match(
    migration,
    /insert into public\.payment_service_items[\s\S]*service\.id[\s\S]*coalesce\(nullif\(service\.total_price, 0\), service\.price, 0\)/i
  );
  assert.doesNotMatch(
    migration,
    /insert into public\.payment_service_items[\s\S]{0,900}v_total_amount/i
  );
});

test("RPC recupera price cuando un servicio histórico conserva total_price en cero", () => {
  assert.match(
    migration,
    /sum\(coalesce\(nullif\(service\.total_price, 0\), service\.price, 0\)\)/i
  );
  assert.match(
    migration,
    /nullif\(service\.unit_price, 0\)[\s\S]*nullif\(service\.price, 0\)/i
  );
});

test("payment_staff_totals se deriva de partidas y propinas manuales", () => {
  assert.match(
    migration,
    /from public\.payment_service_items item[\s\S]*group by item\.staff_id/i
  );
  assert.match(
    migration,
    /from public\.payment_extra_items item[\s\S]*group by item\.staff_id/i
  );
  assert.match(migration, /jsonb_array_elements\(coalesce\(p_tip_allocations/i);
  assert.match(
    migration,
    /commission_base[\s\S]*coalesce\(services\.service_total, 0\) \+ coalesce\(extras\.extras_total, 0\)/i
  );
  assert.doesNotMatch(
    migration,
    /commission_base[\s\S]{0,500}\+\s*coalesce\(tips\.tip_amount/i
  );
});

test("RPC guarda snapshot de comisión y suma exacta de propinas", () => {
  assert.match(
    migration,
    /commission_snapshot_complete[\s\S]*true[\s\S]*from staff_ids/i
  );
  assert.match(migration, /v_tip_total := v_tip_total \+ v_tip_amount/i);
  assert.match(migration, /'tipAmount', v_tip_total/i);
});

test("la conciliación del RPC contiene únicamente servicios, extras, descuentos, anticipo y propinas", () => {
  assert.match(
    migration,
    /v_service_total \+ v_extra_total - v_discount - v_deposit \+ v_tip_total/i
  );
  assert.match(migration, /v_total_amount := v_services_payment_total/i);
});

test("P: la creación principal está contenida en una sola función transaccional", () => {
  const functionBody = migration.match(
    /create or replace function public\.create_payment_transaction[\s\S]*?\n\$\$;/i
  )?.[0];

  assert.ok(functionBody);
  for (const table of [
    "payments",
    "payment_service_items",
    "payment_extra_items",
    "payment_staff_totals",
    "cash_movements",
  ]) {
    assert.match(functionBody, new RegExp(`insert into public\\.${table}`, "i"));
  }
  assert.match(functionBody, /raise exception/i);
  assert.doesNotMatch(paymentPage, /\.from\(["']payments["']\)\s*\.insert/i);
  assert.match(paymentPage, /\.rpc\(\s*["']create_payment_transaction["']/i);
});
