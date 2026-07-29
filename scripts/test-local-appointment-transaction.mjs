import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";

const containerName = "supabase_db_alexandra-ruiz-salon";

const ids = {
  staff: "10000000-0000-4000-8000-000000000001",
  client: "10000000-0000-4000-8000-000000000003",
  serviceOne: "10000000-0000-4000-8000-000000000004",
  serviceTwo: "10000000-0000-4000-8000-000000000005",
  extra: "10000000-0000-4000-8000-000000000006",
  secondStaff: "10000000-0000-4000-8000-000000000101",
  secondClient: "10000000-0000-4000-8000-000000000102",
  actorOne: "10000000-0000-4000-8000-000000000201",
  actorTwo: "10000000-0000-4000-8000-000000000202",
};

function parseStatusJson(raw) {
  const text = String(raw || "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("No se pudo leer el estado local de Supabase.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function assertLocalSafety() {
  if (fs.existsSync("supabase/.temp/project-ref")) {
    throw new Error("Bloqueado: existe supabase/.temp/project-ref.");
  }

  const config = fs.existsSync("supabase/config.toml")
    ? fs
        .readFileSync("supabase/config.toml", "utf8")
        .split(/\r?\n/)
        .filter((line) => !line.trimStart().startsWith("#"))
        .join("\n")
    : "";
  const localConfig =
    config.includes('site_url = "http://127.0.0.1:3000"') &&
    config.includes('api_url = "http://127.0.0.1"');
  if (!localConfig) {
    throw new Error("Bloqueado: la configuración local no es claramente localhost.");
  }

  const dockerState = execFileSync(
    "docker",
    ["ps", "--filter", `name=${containerName}`, "--format", "{{.Names}}\t{{.Status}}"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (!dockerState.includes(containerName) || !/healthy/i.test(dockerState)) {
    throw new Error("Bloqueado: Supabase Local no está saludable.");
  }
}

function runPsql(sql, { quiet = true } = {}) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      containerName,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      quiet ? "-Atq" : "-At",
    ],
    {
      input: sql,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 8,
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "psql local falló");
  }
  return result.stdout.trim();
}

function literal(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function uuid(value) {
  return value ? `${literal(value)}::uuid` : "null";
}

function jsonb(value) {
  return `${literal(JSON.stringify(value))}::jsonb`;
}

function dateLiteral(value) {
  return `${literal(value)}::date`;
}

function timeLiteral(value) {
  return `${literal(value)}::time`;
}

function addMinutes(time, minutes) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function isoDateForMonday(offsetWeeks = 0) {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 14));
  const dow = date.getUTCDay();
  const daysUntilMonday = (1 - dow + 7) % 7;
  date.setUTCDate(date.getUTCDate() + daysUntilMonday + offsetWeeks * 7);
  return date.toISOString().slice(0, 10);
}

function makeService(serviceId, participantId, overrides = {}) {
  const isTwo = serviceId === ids.serviceTwo;
  return {
    serviceId,
    participantId,
    durationMinutes: isTwo ? 45 : 60,
    cleanupMinutes: 0,
    price: isTwo ? 150 : 100,
    ...overrides,
  };
}

function makeExtra(overrides = {}) {
  return {
    extraId: ids.extra,
    name: "Extra Prueba Local",
    staffId: ids.staff,
    quantity: 1,
    unitPrice: 25,
    totalPrice: 25,
    notes: "Extra ficticio local",
    ...overrides,
  };
}

function makePayload(label, overrides = {}) {
  const participantId = overrides.participantId || "participante-prueba-local";
  const services = overrides.services || [makeService(ids.serviceOne, participantId)];
  const extras = overrides.extras || [];
  const startTime = overrides.startTime || "10:00";
  const totalMinutes = services.reduce(
    (sum, service) => sum + Number(service.durationMinutes || 0) + Number(service.cleanupMinutes || 0),
    0,
  );
  const expectedEndTime = overrides.expectedEndTime || addMinutes(startTime, totalMinutes);
  const expectedPrice =
    overrides.expectedPrice ??
    services.reduce((sum, service) => sum + Number(service.price || 0), 0) +
      extras.reduce((sum, extra) => sum + Number(extra.totalPrice || 0), 0);
  const previewId = overrides.previewId || `preview-${label}`;
  const confirmationId = overrides.confirmationId || `confirmation-${label}`;
  const fingerprint = overrides.previewFingerprint || `fingerprint-${label}`;
  return {
    source: overrides.source || "admin",
    actorId: overrides.actorId === undefined ? ids.actorOne : overrides.actorId,
    idempotencyKey: overrides.idempotencyKey || `idempotency-${label}`,
    conversationId: overrides.conversationId || null,
    previewId,
    confirmationId,
    previewVersion: overrides.previewVersion || 1,
    previewFingerprint: fingerprint,
    clientId: overrides.clientId === undefined ? ids.client : overrides.clientId,
    clientName: overrides.clientName || "Clienta Prueba Local",
    clientPhone: overrides.clientPhone || "0000000001",
    services,
    extras,
    participantId,
    appointmentDate: overrides.appointmentDate || isoDateForMonday(overrides.week || 0),
    startTime,
    expectedEndTime,
    staffId: overrides.staffId || ids.staff,
    expectedPrice,
    depositStatus: overrides.depositStatus || "not_required",
    previewExpiresAt: overrides.previewExpiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    forceCreated: Boolean(overrides.forceCreated),
    notes: overrides.notes || "Prueba local transaccional",
  };
}

function rpcSql(payload) {
  return `
select public.create_appointment_transaction(
  p_source => ${literal(payload.source)},
  p_actor_id => ${uuid(payload.actorId)},
  p_idempotency_key => ${literal(payload.idempotencyKey)},
  p_conversation_id => ${uuid(payload.conversationId)},
  p_preview_id => ${literal(payload.previewId)},
  p_confirmation_id => ${literal(payload.confirmationId)},
  p_preview_version => ${Number(payload.previewVersion)},
  p_preview_fingerprint => ${literal(payload.previewFingerprint)},
  p_client_id => ${uuid(payload.clientId)},
  p_client_name => ${literal(payload.clientName)},
  p_client_phone => ${literal(payload.clientPhone)},
  p_services => ${jsonb(payload.services)},
  p_extras => ${jsonb(payload.extras)},
  p_participant_id => ${literal(payload.participantId)},
  p_appointment_date => ${dateLiteral(payload.appointmentDate)},
  p_start_time => ${timeLiteral(payload.startTime)},
  p_expected_end_time => ${timeLiteral(payload.expectedEndTime)},
  p_staff_id => ${uuid(payload.staffId)},
  p_expected_price => ${Number(payload.expectedPrice)},
  p_deposit_status => ${literal(payload.depositStatus)},
  p_preview_expires_at => ${literal(payload.previewExpiresAt)}::timestamptz,
  p_force_created => ${payload.forceCreated ? "true" : "false"},
  p_notes => ${literal(payload.notes)}
)::text;
`;
}

function callRpc(payload) {
  const output = runPsql(rpcSql(payload));
  return JSON.parse(output);
}

function callRpcAsync(payload) {
  return new Promise((resolve) => {
    const result = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        containerName,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-Atq",
      ],
      { input: rpcSql(payload), encoding: "utf8", maxBuffer: 1024 * 1024 * 8 },
    );
    if (result.status !== 0) {
      resolve({ ok: false, error: result.stderr || result.stdout });
      return;
    }
    try {
      resolve({ ok: true, result: JSON.parse(result.stdout.trim()) });
    } catch (error) {
      resolve({ ok: false, error: error.message });
    }
  });
}

function resetCase() {
  runPsql(`
begin;
drop trigger if exists local_fail_appointment_service on public.appointment_services;
drop trigger if exists local_fail_appointment_extra on public.appointment_extra_items;
drop function if exists public.local_fail_appointment_service();
drop function if exists public.local_fail_appointment_extra();
delete from public.appointment_extra_items;
delete from public.appointment_services;
delete from public.appointments;
delete from public.appointment_write_operations;
delete from public.staff_time_blocks where title like 'Bloqueo Prueba Local%';
delete from public.bot_conversations where client_phone like '00000009%';
delete from public.clients where full_name like 'Clienta RPC Local%';
delete from public.staff_services where staff_id = '${ids.secondStaff}';
delete from public.staff_schedules where staff_id = '${ids.secondStaff}';
delete from public.staff where id = '${ids.secondStaff}';
update public.services
set active = true,
    bot_active = true,
    bot_bookable = true,
    service_type = 'servicio',
    variable_pricing = false,
    base_price = case when id = '${ids.serviceTwo}' then 150 else 100 end,
    duration_minutes = case when id = '${ids.serviceTwo}' then 45 else 60 end,
    cleanup_minutes = 0
where id in ('${ids.serviceOne}', '${ids.serviceTwo}');
update public.service_extras
set active = true,
    price = 25
where id = '${ids.extra}';
update public.resources
set active = true,
    quantity = 1
where id = '10000000-0000-4000-8000-000000000007';
update public.bot_settings set active = false;
commit;
`);
}

function ensureSecondStaff() {
  runPsql(`
insert into public.staff (id, full_name, email, phone, role, active, color)
values ('${ids.secondStaff}', 'Técnica RPC Local Dos', 'tecnica.rpc.local.dos@example.invalid', '0000000099', 'tecnica', true, '#8B5CF6')
on conflict (id) do update set active = true;
insert into public.staff_schedules (id, staff_id, day_of_week, start_time, end_time, is_active, is_day_off, has_break)
values ('10000000-0000-4000-8000-000000000103', '${ids.secondStaff}', 1, '09:00', '18:00', true, false, false)
on conflict (id) do update set is_active = true;
`);
}

function ensureSecondStaffAllowed() {
  ensureSecondStaff();
  runPsql(`
insert into public.staff_services (id, staff_id, service_id, active)
values ('10000000-0000-4000-8000-000000000104', '${ids.secondStaff}', '${ids.serviceOne}', true)
on conflict (id) do update set active = true;
`);
}

function ensureBotConversation(payload) {
  runPsql(`
update public.bot_settings set active = true;
insert into public.bot_conversations (
  id,
  client_phone,
  client_name,
  status,
  bot_enabled,
  handoff_to_human,
  conversation_context
) values (
  '${payload.conversationId}',
  '0000000900',
  'Clienta RPC Local Bot',
  'bot',
  true,
  false,
  '${JSON.stringify({
    conversation_engine_state: {
      appointmentDraft: {
        conversationId: payload.conversationId,
        previewId: payload.previewId,
        version: payload.previewVersion,
        fingerprint: payload.previewFingerprint,
        status: "customer_confirmed",
        confirmation: {
          id: payload.confirmationId,
          previewId: payload.previewId,
          fingerprint: payload.previewFingerprint,
        },
      },
    },
  }).replaceAll("'", "''")}'::jsonb
)
on conflict (id) do update set
  bot_enabled = true,
  handoff_to_human = false,
  conversation_context = excluded.conversation_context;
`);
}

function installFailureTrigger(tableName, triggerName, functionName) {
  runPsql(`
create or replace function public.${functionName}() returns trigger
language plpgsql
as $$
begin
  raise exception 'local forced failure';
end;
$$;
drop trigger if exists ${triggerName} on public.${tableName};
create trigger ${triggerName}
before insert on public.${tableName}
for each row execute function public.${functionName}();
`);
}

function removeFailureTriggers() {
  runPsql(`
drop trigger if exists local_fail_appointment_service on public.appointment_services;
drop trigger if exists local_fail_appointment_extra on public.appointment_extra_items;
drop function if exists public.local_fail_appointment_service();
drop function if exists public.local_fail_appointment_extra();
`);
}

function counts() {
  const out = runPsql(`
select jsonb_build_object(
  'appointments', (select count(*) from public.appointments),
  'appointmentServices', (select count(*) from public.appointment_services),
  'appointmentExtras', (select count(*) from public.appointment_extra_items),
  'orphanServices', (
    select count(*)
    from public.appointment_services s
    left join public.appointments a on a.id = s.appointment_id
    where a.id is null
  ),
  'orphanExtras', (
    select count(*)
    from public.appointment_extra_items e
    left join public.appointments a on a.id = e.appointment_id
    where a.id is null
  ),
  'payments', (select count(*) from public.payments),
  'createdOperationWithoutAppointment', (
    select count(*)
    from public.appointment_write_operations
    where status = 'created' and appointment_id is null
  )
)::text;
`);
  return JSON.parse(out);
}

function assertAtomicFailure(testName) {
  const current = counts();
  const bad =
    current.appointments !== 0 ||
    current.appointmentServices !== 0 ||
    current.appointmentExtras !== 0 ||
    current.orphanServices !== 0 ||
    current.orphanExtras !== 0 ||
    current.payments !== 0 ||
    current.createdOperationWithoutAppointment !== 0;
  if (bad) {
    throw new Error(`${testName}: atomicidad inválida ${JSON.stringify(current)}`);
  }
}

function assertCreated(testName, result, expectedServices = 1) {
  if (result.status !== "created" || !result.appointmentId) {
    throw new Error(`${testName}: esperaba created, recibió ${JSON.stringify(result)}`);
  }
  if (Number(result.servicesCreated) !== expectedServices) {
    throw new Error(`${testName}: cantidad de servicios inesperada`);
  }
}

function assertStatus(testName, result, expectedStatus, expectedErrorCode = null) {
  if (result.status !== expectedStatus) {
    throw new Error(`${testName}: esperaba ${expectedStatus}, recibió ${JSON.stringify(result)}`);
  }
  if (expectedErrorCode && result.errorCode !== expectedErrorCode) {
    throw new Error(`${testName}: esperaba ${expectedErrorCode}, recibió ${JSON.stringify(result)}`);
  }
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("01 Un servicio", () => {
  resetCase();
  const result = callRpc(makePayload("01", { week: 1 }));
  assertCreated("01", result, 1);
});

test("02 Dos servicios", () => {
  resetCase();
  const participantId = "participante-prueba-local";
  const result = callRpc(
    makePayload("02", {
      week: 2,
      services: [makeService(ids.serviceOne, participantId), makeService(ids.serviceTwo, participantId)],
    }),
  );
  assertCreated("02", result, 2);
});

test("03 Un extra", () => {
  resetCase();
  const result = callRpc(makePayload("03", { week: 3, extras: [makeExtra()] }));
  assertCreated("03", result, 1);
});

test("04 Dos servicios y extras", () => {
  resetCase();
  const participantId = "participante-prueba-local";
  const result = callRpc(
    makePayload("04", {
      week: 4,
      services: [makeService(ids.serviceOne, participantId), makeService(ids.serviceTwo, participantId)],
      extras: [makeExtra()],
    }),
  );
  assertCreated("04", result, 2);
});

test("05 Replay idéntico", () => {
  resetCase();
  const payload = makePayload("05", { week: 5 });
  const first = callRpc(payload);
  const second = callRpc(payload);
  assertCreated("05 primera", first, 1);
  assertStatus("05 replay", second, "already_created");
  if (first.appointmentId !== second.appointmentId || second.isReplay !== true) {
    throw new Error("05: replay no devolvió el mismo appointmentId/isReplay");
  }
});

test("06 Misma clave con hash diferente", () => {
  resetCase();
  const payload = makePayload("06", { week: 6 });
  assertCreated("06 primera", callRpc(payload), 1);
  const conflict = callRpc({ ...payload, expectedPrice: payload.expectedPrice + 1 });
  assertStatus("06 conflicto", conflict, "idempotency_conflict", "idempotency_payload_mismatch");
});

test("07 Misma confirmación simultánea", async () => {
  resetCase();
  const payload = makePayload("07", { week: 7 });
  const results = await Promise.all([callRpcAsync(payload), callRpcAsync(payload)]);
  const statuses = results.map((entry) => entry.result?.status).sort();
  if (statuses.join(",") !== "already_created,created") {
    throw new Error(`07: estados inesperados ${JSON.stringify(results)}`);
  }
});

test("08 Dos claves distintas para el mismo horario", async () => {
  resetCase();
  const a = makePayload("08a", { week: 8 });
  const b = makePayload("08b", { week: 8 });
  const results = await Promise.all([callRpcAsync(a), callRpcAsync(b)]);
  const statuses = results.map((entry) => entry.result?.status).sort();
  if (statuses.join(",") !== "created,not_available") {
    throw new Error(`08: estados inesperados ${JSON.stringify(results)}`);
  }
});

test("09 Portal y bot para el mismo horario", async () => {
  resetCase();
  const conversationId = "10000000-0000-4000-8000-000000000301";
  const bot = makePayload("09b", { week: 9, source: "bot", actorId: null, conversationId });
  ensureBotConversation(bot);
  const portal = makePayload("09p", { week: 9, source: "client_portal", actorId: ids.actorOne });
  const results = await Promise.all([callRpcAsync(portal), callRpcAsync(bot)]);
  const statuses = results.map((entry) => entry.result?.status).sort();
  if (statuses.join(",") !== "created,not_available") {
    throw new Error(`09: estados inesperados ${JSON.stringify(results)}`);
  }
});

test("10 Agenda y portal para el mismo horario", async () => {
  resetCase();
  const admin = makePayload("10a", { week: 10, source: "admin" });
  const portal = makePayload("10p", { week: 10, source: "client_portal", actorId: ids.actorTwo });
  const results = await Promise.all([callRpcAsync(admin), callRpcAsync(portal)]);
  const statuses = results.map((entry) => entry.result?.status).sort();
  if (statuses.join(",") !== "created,not_available") {
    throw new Error(`10: estados inesperados ${JSON.stringify(results)}`);
  }
});

test("11 Dos administradoras", async () => {
  resetCase();
  const a = makePayload("11a", { week: 11, actorId: ids.actorOne });
  const b = makePayload("11b", { week: 11, actorId: ids.actorTwo });
  const results = await Promise.all([callRpcAsync(a), callRpcAsync(b)]);
  const statuses = results.map((entry) => entry.result?.status).sort();
  if (statuses.join(",") !== "created,not_available") {
    throw new Error(`11: estados inesperados ${JSON.stringify(results)}`);
  }
});

test("12 Dos pestañas del portal", async () => {
  resetCase();
  const a = makePayload("12a", { week: 12, source: "client_portal", actorId: ids.actorOne });
  const b = makePayload("12b", { week: 12, source: "client_portal", actorId: ids.actorOne });
  const results = await Promise.all([callRpcAsync(a), callRpcAsync(b)]);
  const statuses = results.map((entry) => entry.result?.status).sort();
  if (statuses.join(",") !== "created,not_available") {
    throw new Error(`12: estados inesperados ${JSON.stringify(results)}`);
  }
});

test("13 Horario bloqueado", () => {
  resetCase();
  const appointmentDate = isoDateForMonday(13);
  runPsql(`
insert into public.staff_time_blocks (staff_id, block_date, start_time, end_time, block_type, title)
values ('${ids.staff}', '${appointmentDate}', '10:00', '11:00', 'bloqueo', 'Bloqueo Prueba Local 13');
`);
  const result = callRpc(makePayload("13", { week: 13, appointmentDate }));
  assertStatus("13", result, "not_available", "staff_time_block");
  assertAtomicFailure("13");
});

test("14 Descanso", () => {
  resetCase();
  const result = callRpc(makePayload("14", { week: 14, startTime: "13:15" }));
  assertStatus("14", result, "not_available", "outside_staff_schedule");
  assertAtomicFailure("14");
});

test("15 Fuera de jornada", () => {
  resetCase();
  const result = callRpc(makePayload("15", { week: 15, startTime: "08:00" }));
  assertStatus("15", result, "not_available", "outside_staff_schedule");
  assertAtomicFailure("15");
});

test("16 Servicio desactivado", () => {
  resetCase();
  runPsql(`update public.services set active = false where id = '${ids.serviceOne}';`);
  const result = callRpc(makePayload("16", { week: 16 }));
  assertStatus("16", result, "invalid_service", "service_unavailable");
  assertAtomicFailure("16");
});

test("17 Técnica no capacitada", () => {
  resetCase();
  ensureSecondStaff();
  const result = callRpc(makePayload("17", { week: 17, staffId: ids.secondStaff }));
  assertStatus("17", result, "invalid_staff", "staff_service_not_allowed");
  assertAtomicFailure("17");
});

test("18 Precio cambiado después de la vista previa", () => {
  resetCase();
  const services = [makeService(ids.serviceOne, "participante-prueba-local", { price: 99 })];
  const result = callRpc(makePayload("18", { week: 18, services, expectedPrice: 99 }));
  assertStatus("18", result, "invalid_request", "preview_service_changed");
  assertAtomicFailure("18");
});

test("19 Duración cambiada", () => {
  resetCase();
  const services = [makeService(ids.serviceOne, "participante-prueba-local", { durationMinutes: 30 })];
  const result = callRpc(makePayload("19", { week: 19, services, expectedEndTime: addMinutes("10:00", 30) }));
  assertStatus("19", result, "invalid_request", "preview_service_changed");
  assertAtomicFailure("19");
});

test("20 Vista previa vencida", () => {
  resetCase();
  const result = callRpc(
    makePayload("20", {
      week: 20,
      source: "client_portal",
      actorId: ids.actorOne,
      previewExpiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
    }),
  );
  assertStatus("20", result, "invalid_request", "preview_expired");
  assertAtomicFailure("20");
});

test("21 Anticipo pendiente", () => {
  resetCase();
  const result = callRpc(makePayload("21", { week: 21, depositStatus: "required_pending" }));
  assertStatus("21", result, "deposit_pending", "deposit_pending");
  assertAtomicFailure("21");
});

test("22 Fallo durante asociación de servicios", () => {
  resetCase();
  installFailureTrigger("appointment_services", "local_fail_appointment_service", "local_fail_appointment_service");
  try {
    const result = callRpc(makePayload("22", { week: 22 }));
    assertStatus("22", result, "failed", "transaction_failed");
    assertAtomicFailure("22");
  } finally {
    removeFailureTriggers();
  }
});

test("23 Fallo durante asociación de extras", () => {
  resetCase();
  installFailureTrigger("appointment_extra_items", "local_fail_appointment_extra", "local_fail_appointment_extra");
  try {
    const result = callRpc(makePayload("23", { week: 23, extras: [makeExtra()] }));
    assertStatus("23", result, "failed", "transaction_failed");
    assertAtomicFailure("23");
  } finally {
    removeFailureTriggers();
  }
});

test("24 force_created desde admin autorizado", () => {
  resetCase();
  const result = callRpc(makePayload("24", { week: 24, startTime: "08:00", forceCreated: true }));
  assertCreated("24", result, 1);
  if (result.status !== "created") throw new Error("24: force_created no creó");
});

test("25 force_created desde portal rechazado", () => {
  resetCase();
  const result = callRpc(
    makePayload("25", {
      week: 25,
      source: "client_portal",
      actorId: ids.actorOne,
      forceCreated: true,
    }),
  );
  assertStatus("25", result, "invalid_request", "force_not_allowed");
  assertAtomicFailure("25");
});

test("26 force_created desde bot rechazado", () => {
  resetCase();
  const conversationId = "10000000-0000-4000-8000-000000000326";
  const payload = makePayload("26", {
    week: 26,
    source: "bot",
    actorId: null,
    conversationId,
    forceCreated: true,
  });
  ensureBotConversation(payload);
  const result = callRpc(payload);
  assertStatus("26", result, "invalid_request", "force_not_allowed");
  assertAtomicFailure("26");
});

test("27 Anticipo desconocido permite crear sin pago", () => {
  resetCase();
  const result = callRpc(makePayload("27", { week: 27, depositStatus: "unknown" }));
  assertCreated("27", result, 1);
});

assertLocalSafety();

const results = [];
for (const item of tests) {
  try {
    await item.fn();
    results.push({ name: item.name, status: "passed" });
    console.log(`ok - ${item.name}`);
  } catch (error) {
    results.push({ name: item.name, status: "failed", error: error.message });
    console.error(`not ok - ${item.name}`);
    console.error(error.message);
    process.exitCode = 1;
    break;
  }
}

if (process.exitCode) {
  console.error(JSON.stringify(results, null, 2));
} else {
  console.log(`RPC local tests passed: ${results.length}/${tests.length}`);
}
