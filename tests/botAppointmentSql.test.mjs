import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase_appointment_transaction.sql", import.meta.url),
  "utf8"
);
const rollback = readFileSync(
  new URL(
    "../supabase_appointment_transaction_rollback.sql",
    import.meta.url
  ),
  "utf8"
);

function normalizeSql(value) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractColumns(sql, table) {
  const match = sql.match(
    new RegExp(
      `insert\\s+into\\s+public\\.${table}\\s*\\(([^)]+)\\)\\s*values`,
      "i"
    )
  );
  assert.ok(match, `No se encontró el INSERT de ${table}`);
  return match[1]
    .split(",")
    .map((column) => column.trim().toLowerCase())
    .filter(Boolean);
}

test("SQL 1: la migración es revisable y queda envuelta en transacción", () => {
  const normalized = normalizeSql(migration);
  assert.ok(normalized.startsWith("-- creación transaccional"));
  assert.match(normalized, /\bbegin;/);
  assert.ok(normalized.endsWith("commit;"));
});

test("SQL 2: la tabla idempotente tiene ambas identidades únicas y RLS", () => {
  assert.match(
    migration,
    /unique\s*\(\s*idempotency_key\s*\)/i
  );
  assert.match(
    migration,
    /unique\s*\(\s*source\s*,\s*preview_id\s*,\s*confirmation_id\s*\)/i
  );
  assert.match(
    migration,
    /alter table public\.appointment_write_operations enable row level security/i
  );
});

test("SQL 3: la RPC es SECURITY DEFINER con search_path fijo", () => {
  assert.match(
    migration,
    /create or replace function public\.create_appointment_transaction/i
  );
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = public, pg_temp/i);
});

test("SQL 4: la RPC y tabla no se conceden a roles públicos", () => {
  assert.match(
    migration,
    /revoke all on table public\.appointment_write_operations\s+from public, anon, authenticated/i
  );
  assert.match(
    migration,
    /grant select, insert, update on table public\.appointment_write_operations\s+to service_role/i
  );
  assert.match(
    migration,
    /grant execute on function public\.create_appointment_transaction[\s\S]+to service_role/i
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.create_appointment_transaction[\s\S]+to (?:anon|authenticated)/i
  );
});

test("SQL 5: no existe ninguna escritura ni lectura de payments", () => {
  assert.doesNotMatch(migration, /\b(?:insert|update|delete)\s+(?:into\s+)?public\.payments\b/i);
  assert.doesNotMatch(migration, /\bfrom\s+public\.payments\b/i);
});

test("SQL 6: cita, servicios y extras se crean dentro de la RPC y se verifican", () => {
  assert.match(migration, /insert into public\.appointments/i);
  assert.match(migration, /insert into public\.appointment_services/i);
  assert.match(migration, /insert into public\.appointment_extra_items/i);
  assert.match(migration, /v_services_created <> v_service_count/i);
  assert.match(migration, /v_extras_created <> v_extra_count/i);
  assert.match(
    migration,
    /raise exception using[\s\S]+appointment_items_count_mismatch/i
  );
  assert.match(migration, /exception\s+when others then/i);
});

test("SQL 7: solo se usan columnas de appointments confirmadas", () => {
  const allowed = new Set([
    "client_id",
    "staff_id",
    "appointment_date",
    "start_time",
    "end_time",
    "status",
    "confirmation_status",
    "attendance_status",
    "booking_source",
    "estimated_total",
    "deposit_amount",
    "force_created",
    "notes",
    "client_visible_notes",
    "updated_at",
  ]);
  const columns = extractColumns(migration, "appointments");
  assert.ok(columns.length > 0);
  assert.deepEqual(
    columns.filter((column) => !allowed.has(column)),
    []
  );
});

test("SQL 8: solo se usan columnas confirmadas al crear servicios", () => {
  const allowed = new Set([
    "appointment_id",
    "service_id",
    "custom_name",
    "quantity",
    "unit_price",
    "total_price",
    "price",
    "staff_id",
    "service_date",
    "start_time",
    "end_time",
    "duration_minutes",
    "cleanup_minutes",
    "status",
    "notes",
  ]);
  const columns = extractColumns(migration, "appointment_services");
  assert.deepEqual(
    columns.filter((column) => !allowed.has(column)),
    []
  );
});

test("SQL 9: revalida configuración, agenda, traslapes y recursos", () => {
  for (const expected of [
    "public.bot_settings",
    "public.bot_conversations",
    "public.staff_schedules",
    "public.staff_time_blocks",
    "public.appointment_services",
    "public.staff_services",
    "public.resources",
    "public.service_resources",
  ]) {
    assert.match(migration, new RegExp(expected.replace(".", "\\."), "i"));
  }
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /minimum_notice_not_met/i);
  assert.match(migration, /staff_overlap/i);
  assert.match(migration, /resource_capacity/i);
});

test("SQL 10: compara la confirmación contra el borrador persistido", () => {
  for (const path of [
    "appointmentDraft,conversationId",
    "appointmentDraft,previewId",
    "appointmentDraft,confirmation,id",
    "appointmentDraft,confirmation,previewId",
    "appointmentDraft,fingerprint",
    "appointmentDraft,confirmation,fingerprint",
    "appointmentDraft,version",
    "appointmentDraft,status",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `\\{conversation_engine_state,${path.replaceAll(",", ",")}\\}`,
        "i"
      )
    );
  }
  assert.match(migration, /persisted_confirmation_mismatch/i);
});

test("SQL 11: cliente concurrente se serializa y no se sobrescribe", () => {
  assert.match(migration, /appointment-client-phone:/i);
  assert.match(migration, /regexp_replace\(coalesce\(client\.phone/i);
  assert.match(
    migration,
    /insert into public\.clients\s*\(\s*full_name\s*,\s*phone\s*,\s*updated_at\s*\)/i
  );
  assert.doesNotMatch(migration, /update public\.clients/i);
});

test("SQL 12: rollback coincide con la firma y no elimina datos reales", () => {
  const signature =
    /create or replace function public\.create_appointment_transaction\s*\(([\s\S]*?)\)\s*returns jsonb/i.exec(
      migration
    )?.[1];
  const dropSignature =
    /drop function if exists public\.create_appointment_transaction\s*\(([\s\S]*?)\)\s*;/i.exec(
      rollback
    )?.[1];
  assert.ok(signature);
  assert.ok(dropSignature);
  const argumentTypes = signature
    .split(",")
    .map((argument) =>
      argument
        .trim()
        .replace(/^p_[a-z_]+\s+/i, "")
        .replace(/\s+default[\s\S]*$/i, "")
        .trim()
        .toLowerCase()
    );
  const rollbackTypes = dropSignature
    .split(",")
    .map((type) => type.trim().toLowerCase());
  assert.deepEqual(argumentTypes, rollbackTypes);
  assert.doesNotMatch(
    rollback,
    /drop table if exists public\.(?:appointments|appointment_services|clients|payments)/i
  );
});

test("SQL 13: el origen se limita a los tres canales", () => {
  assert.match(
    migration,
    /source\s+text\s+not null[\s\S]+source in\s*\(\s*'admin'\s*,\s*'client_portal'\s*,\s*'bot'\s*\)/i
  );
  assert.match(
    migration,
    /v_source not in\s*\(\s*'admin'\s*,\s*'client_portal'\s*,\s*'bot'\s*\)/i
  );
});

test("SQL 14: la idempotencia registra origen y actor", () => {
  assert.match(
    migration,
    /insert into public\.appointment_write_operations\s*\(\s*source\s*,\s*actor_id\s*,\s*idempotency_key/i
  );
  assert.match(migration, /'source'\s*,\s*v_source/i);
  assert.match(migration, /'actorId'\s*,\s*p_actor_id/i);
});

test("SQL 15: bot_settings solo se exige al origen bot", () => {
  assert.match(
    migration,
    /if v_source = 'bot' then[\s\S]+from public\.bot_conversations[\s\S]+from public\.bot_settings[\s\S]+end if;/i
  );
});

test("SQL 16: extras administrativos se revalidan contra el esquema real", () => {
  assert.match(migration, /p_extras jsonb default '\[\]'::jsonb/i);
  assert.match(migration, /from public\.service_extras extra/i);
  assert.match(migration, /coalesce\(v_extra\.price, 0\)/i);
  assert.match(migration, /public\.appointment_extra_items/i);
  assert.match(
    migration,
    /v_source <> 'admin' and jsonb_array_length\(p_extras\) > 0/i
  );
});

test("SQL 17: force_created solo puede omitir conflictos del canal admin", () => {
  assert.match(
    migration,
    /p_force_created[\s\S]+v_source <> 'admin'[\s\S]+force_not_allowed/i
  );
  assert.match(
    migration,
    /not \(v_source = 'admin' and coalesce\(p_force_created, false\)\)[\s\S]+staff_overlap/i
  );
  assert.match(
    migration,
    /where not \(\s*v_source = 'admin' and coalesce\(p_force_created, false\)\s*\)[\s\S]+appointment-resource-day:/i
  );
});

test("SQL 18: horarios no dependen de columnas locales no demostradas", () => {
  assert.doesNotMatch(migration, /staff_schedules[\s\S]{0,500}updated_at/i);
  assert.match(
    migration,
    /from public\.staff_schedules schedule[\s\S]+schedule\.day_of_week/i
  );
});
