import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  confirmClientPortalAppointment,
  prepareClientPortalAppointment,
} from "../app/lib/appointmentChannelAdapters.js";
import { getAvailability } from "../app/lib/bookingAvailability.js";
import {
  appointmentContractFingerprint,
  isPortalBookableService,
  validateAppointmentWriteContract,
} from "../app/lib/appointmentWriteContracts.js";
import { clearAppointmentWriteInFlightForTests } from "../app/lib/appointmentWriteService.js";
import { createAppointmentTransactionalRepository } from "../app/lib/appointmentTransactionalRepository.js";
import {
  CLIENT_PORTAL_UNCATEGORIZED_CATEGORY,
  getCompatibleStaffForSelectedServices,
  groupClientPortalServicesByCategory,
  mapClientPortalCatalog,
} from "../app/lib/clientPortalCatalog.js";
import { getClientAppointmentStatusLabel } from "../app/lib/clientPortalAppointmentStatus.js";
import {
  isClientAuthUser,
  isClientProfileComplete,
  normalizePhoneDigits,
} from "../app/lib/clientPortalProfile.js";

const now = new Date("2026-07-24T12:00:00.000Z");

function service(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Manicure",
    active: true,
    service_type: "servicio",
    variable_pricing: false,
    bot_active: true,
    bot_bookable: true,
    duration_minutes: 50,
    cleanup_minutes: 10,
    base_price: 250,
    ...overrides,
  };
}

function slot(services = [service()], overrides = {}) {
  let minute = 9 * 60;
  const segments = services.map((item) => {
    const start = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(
      minute % 60
    ).padStart(2, "0")}`;
    minute += Number(item.duration_minutes) + Number(item.cleanup_minutes);
    const end = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(
      minute % 60
    ).padStart(2, "0")}`;
    return {
      service_id: item.id,
      service: item,
      staff_id: "22222222-2222-4222-8222-222222222222",
      service_date: "2026-08-01",
      start_time: start,
      end_time: end,
      duration_minutes: item.duration_minutes,
      cleanup_minutes: item.cleanup_minutes,
      price: item.base_price,
    };
  });
  return {
    date: "2026-08-01",
    staff_id: "22222222-2222-4222-8222-222222222222",
    staff_name: "Laura Canul",
    start_time: "09:00",
    end_time: segments.at(-1).end_time,
    duration_minutes: minute - 9 * 60,
    service_segments: segments,
    ...overrides,
  };
}

function preview(overrides = {}) {
  return prepareClientPortalAppointment({
    actorId: "33333333-3333-4333-8333-333333333333",
    client: {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Clienta",
      phone: "9991112233",
    },
    slot: slot(),
    now,
    ...overrides,
  });
}

function created() {
  return {
    status: "created",
    appointmentId: "55555555-5555-4555-8555-555555555555",
    clientId: "44444444-4444-4444-8444-444444444444",
    servicesCreated: 1,
  };
}

function createPortalTransactionalHarness({
  occupiedSlots = [],
  failBeforeServices = false,
  invalidStaffIds = [],
} = {}) {
  const operations = new Map();
  const occupied = new Set(occupiedSlots);
  const appointments = [];
  const appointmentServices = [];
  let sequence = 0;
  return {
    calls: [],
    appointments,
    appointmentServices,
    async createAppointmentTransaction({ contract, idempotencyKey }) {
      this.calls.push({ contract, idempotencyKey });
      if (operations.has(idempotencyKey)) {
        return {
          ...operations.get(idempotencyKey),
          status: "already_created",
          isReplay: true,
        };
      }
      if (invalidStaffIds.includes(contract.staffId)) {
        return {
          status: "invalid_staff",
          errorCode: "staff_service_not_allowed",
          appointmentId: null,
          servicesCreated: 0,
        };
      }
      const slotKey = [
        contract.staffId,
        contract.date,
        contract.startTime,
        contract.endTime,
      ].join("|");
      if (occupied.has(slotKey)) {
        return {
          status: "not_available",
          errorCode: "staff_overlap",
          appointmentId: null,
          servicesCreated: 0,
        };
      }
      if (failBeforeServices) {
        return {
          status: "failed",
          errorCode: "transaction_failed",
          appointmentId: null,
          servicesCreated: 0,
        };
      }
      sequence += 1;
      const appointmentId = `appointment_${sequence}`;
      occupied.add(slotKey);
      appointments.push({ id: appointmentId, slotKey });
      for (const serviceItem of contract.services) {
        appointmentServices.push({
          appointment_id: appointmentId,
          service_id: serviceItem.id,
          staff_id: serviceItem.staffId,
        });
      }
      const result = {
        status: "created",
        appointmentId,
        clientId: contract.client.id,
        servicesCreated: contract.services.length,
        isReplay: false,
      };
      operations.set(idempotencyKey, result);
      return result;
    },
  };
}

function staff(overrides = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    full_name: "Laura Canul",
    active: true,
    photo_url: null,
    ...overrides,
  };
}

function scheduleForStaff(staffId, overrides = {}) {
  return {
    staff_id: staffId,
    day_of_week: 6,
    start_time: "09:00",
    end_time: "13:00",
    is_active: true,
    is_day_off: false,
    has_break: false,
    ...overrides,
  };
}

function createAvailabilitySupabase({
  services = [service()],
  staffRows = [staff()],
  schedules = staffRows.map((person) => scheduleForStaff(person.id)),
  staffServices = [],
  existingServices = [],
  blocks = [],
  resources = [],
  serviceResources = [],
} = {}) {
  const tables = {
    services,
    staff: staffRows,
    staff_schedules: schedules,
    staff_services: staffServices,
    appointment_services: existingServices,
    staff_time_blocks: blocks,
    resources,
    service_resources: serviceResources,
  };

  return {
    from(table) {
      const filters = [];
      const inFilters = [];
      const builder = {
        select() {
          return builder;
        },
        eq(column, value) {
          filters.push({ column, value });
          return builder;
        },
        in(column, values) {
          inFilters.push({ column, values });
          return builder;
        },
        order() {
          return builder;
        },
        then(resolve) {
          let data = [...(tables[table] || [])];
          for (const filter of filters) {
            data = data.filter((item) => item[filter.column] === filter.value);
          }
          for (const filter of inFilters) {
            data = data.filter((item) =>
              (filter.values || []).includes(item[filter.column])
            );
          }
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };

      return builder;
    },
  };
}

test("portal 1: carga solo servicios públicos activos", () => {
  const catalog = [service(), service({ id: "2", active: false })];
  assert.deepEqual(catalog.filter(isPortalBookableService).map((item) => item.id), [
    service().id,
  ]);
});

test("portal 2: oculta servicios internos", () => {
  assert.equal(
    isPortalBookableService(service({ service_type: "extra" })),
    false
  );
});

test("portal 3: un servicio queda en la vista previa", () => {
  assert.equal(preview().services.length, 1);
});

test("portal 4: conserva dos servicios", () => {
  const second = service({
    id: "66666666-6666-4666-8666-666666666666",
    name: "Pedicure",
    duration_minutes: 40,
    base_price: 300,
  });
  const result = preview({ slot: slot([service(), second]) });
  assert.deepEqual(result.services.map((item) => item.name), [
    "Manicure",
    "Pedicure",
  ]);
});

test("portal 5: acumula duración de dos servicios", () => {
  const second = service({
    id: "66666666-6666-4666-8666-666666666666",
    duration_minutes: 40,
    cleanup_minutes: 5,
  });
  const result = preview({ slot: slot([service(), second]) });
  const duration = result.services.reduce(
    (sum, item) => sum + item.durationMinutes + item.cleanupMinutes,
    0
  );
  assert.equal(duration, 105);
  assert.equal(result.endTime, "10:45");
});

test("portal 6: colaboradora específica queda vinculada", () => {
  assert.equal(
    preview().staffId,
    "22222222-2222-4222-8222-222222222222"
  );
});

test("portal 7: cualquiera se resuelve a colaboradora concreta en servidor", () => {
  const selectedByServer = preview();
  assert.ok(selectedByServer.staffId);
  assert.equal(selectedByServer.services[0].staffId, selectedByServer.staffId);
});

test("portal 8: técnica no compatible requiere revisión", () => {
  const current = preview();
  const input = {
    ...current,
    services: [
      {
        ...current.services[0],
        staffId: "77777777-7777-4777-8777-777777777777",
      },
    ],
  };
  input.requestHash = appointmentContractFingerprint(input);
  const validation = validateAppointmentWriteContract(input, { now });
  assert.equal(validation.code, "human_review");
});

test("portal 9: horario ocupado se conserva como no disponible", async () => {
  const result = await confirmClientPortalAppointment({
    input: preview(),
    transactionalRepository: {
      createAppointmentTransaction: async () => ({
        status: "not_available",
        errorCode: "staff_overlap",
      }),
    },
    now,
  });
  assert.equal(result.status, "not_available");
  assert.equal(result.ok, false);
});

test("portal 10: horario vencido se rechaza", () => {
  const current = preview();
  const validation = validateAppointmentWriteContract(
    { ...current, previewExpiresAt: "2026-07-24T11:59:00.000Z" },
    { now }
  );
  assert.equal(validation.code, "preview_expired");
});

test("portal 11: vista previa incluye identidad versionada", () => {
  const current = preview();
  assert.match(current.previewId, /^portal_preview_/);
  assert.equal(current.previewVersion, 1);
  assert.match(current.confirmationId, /^portal_confirmation_/);
  assert.match(current.requestHash, /^aw_/);
});

test("portal 12: cambio posterior invalida la vista previa", () => {
  const current = preview();
  const validation = validateAppointmentWriteContract(
    {
      ...current,
      date: "2026-08-02",
    },
    { now }
  );
  assert.equal(validation.code, "preview_changed");
});

test("portal 13: confirmación válida usa la operación transaccional", async () => {
  const repository = createPortalTransactionalHarness();
  const result = await confirmClientPortalAppointment({
    input: preview(),
    transactionalRepository: repository,
    now,
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "transactional");
  assert.equal(repository.calls.length, 1);
  assert.equal(repository.appointments.length, 1);
  assert.equal(repository.appointmentServices.length, 1);
});

test("portal 14: misma idempotency key regresa replay sin duplicar cita", async () => {
  const repository = createPortalTransactionalHarness();
  const current = preview();
  const first = await confirmClientPortalAppointment({
    input: current,
    transactionalRepository: repository,
    now,
  });
  const second = await confirmClientPortalAppointment({
    input: current,
    transactionalRepository: repository,
    now,
  });
  assert.equal(first.ok, true);
  assert.equal(second.isReplay, true);
  assert.equal(first.appointmentId, second.appointmentId);
  assert.equal(repository.appointments.length, 1);
  assert.equal(repository.appointmentServices.length, 1);
});

test("portal 15: doble clic concurrente no duplica la llamada", async () => {
  let calls = 0;
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const options = {
    input: preview(),
    transactionalRepository: {
      createAppointmentTransaction: async () => {
        calls += 1;
        await wait;
        return created();
      },
    },
    now,
  };
  const first = confirmClientPortalAppointment(options);
  const second = confirmClientPortalAppointment(options);
  release();
  const results = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(results[1].isReplay, true);
});

test("portal 16: clienta existente conserva su id", () => {
  assert.equal(
    preview().client.id,
    "44444444-4444-4444-8444-444444444444"
  );
});

test("portal 17: clienta nueva puede usar nombre y teléfono sin exponer búsquedas", () => {
  const result = prepareClientPortalAppointment({
    actorId: "33333333-3333-4333-8333-333333333333",
    client: { name: "Nueva clienta", phone: "9992223344" },
    slot: slot(),
    now,
  });
  assert.equal(validateAppointmentWriteContract(result, { now }).ok, true);
});

test("portal 18: teléfono inválido se rechaza", () => {
  const result = prepareClientPortalAppointment({
    actorId: "33333333-3333-4333-8333-333333333333",
    client: { name: "Nueva clienta", phone: "123" },
    slot: slot(),
    now,
  });
  assert.equal(
    validateAppointmentWriteContract(result, { now }).errors.includes(
      "client_phone_invalid"
    ),
    true
  );
});

test("portal 19: precio variable no se publica", () => {
  assert.equal(
    isPortalBookableService(service({ variable_pricing: true })),
    false
  );
});

test("portal 20: servicio de revisión humana no se confirma", () => {
  const current = preview();
  const changed = {
    ...current,
    services: [
      { ...current.services[0], requiresHumanReview: true },
    ],
  };
  changed.requestHash = appointmentContractFingerprint(changed);
  assert.equal(
    validateAppointmentWriteContract(changed, { now }).code,
    "human_review"
  );
});

test("portal 21: anticipo pendiente no se marca verificado", () => {
  const current = preview();
  const changed = {
    ...current,
    depositStatus: "required_pending",
    depositRequiredForWrite: true,
  };
  changed.requestHash = appointmentContractFingerprint(changed);
  const validation = validateAppointmentWriteContract(changed, { now });
  assert.equal(validation.code, "human_review");
  assert.notEqual(validation.contract.depositStatus, "verified");
});

test("portal 22: error de red se normaliza", async () => {
  const result = await confirmClientPortalAppointment({
    input: preview(),
    transactionalRepository: {
      createAppointmentTransaction: async () => {
        throw new Error("network");
      },
    },
    now,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "transactional_write_failed");
});

test("portal 23: RPC no disponible no cae al escritor antiguo", async () => {
  let legacyCalls = 0;
  const result = await confirmClientPortalAppointment({
    input: preview(),
    legacyWriter: async () => {
      legacyCalls += 1;
      return created();
    },
    transactionalRepository: {},
    now,
  });
  assert.equal(result.code, "transactional_repository_unavailable");
  assert.equal(legacyCalls, 0);
});

test("portal 24: portal no depende de BOT_APPOINTMENT_WRITES_ENABLED", async () => {
  let legacyCalls = 0;
  let transactionalCalls = 0;
  const result = await confirmClientPortalAppointment({
    input: preview(),
    env: {
      BOT_APPOINTMENT_WRITES_ENABLED: "false",
    },
    legacyWriter: async () => {
      legacyCalls += 1;
      return created();
    },
    transactionalRepository: {
      createAppointmentTransaction: async () => {
        transactionalCalls += 1;
        return created();
      },
    },
    now,
  });
  assert.equal(result.mode, "transactional");
  assert.equal(legacyCalls, 0);
  assert.equal(transactionalCalls, 1);
});

test("portal 25: las pruebas usan repositorios falsos y no Supabase", async () => {
  let fakeWrites = 0;
  const result = await confirmClientPortalAppointment({
    input: preview(),
    transactionalRepository: {
      createAppointmentTransaction: async () => {
        fakeWrites += 1;
        return created();
      },
    },
    now,
  });
  assert.equal(result.ok, true);
  assert.equal(fakeWrites, 1);
});

test("portal 26: servicio desactivado invalida el catálogo público", () => {
  assert.equal(isPortalBookableService(service({ active: false })), false);
});

test("portal 27: precios provienen del snapshot del servidor", () => {
  const result = preview();
  assert.equal(result.expectedPrice, 250);
  assert.equal(result.services[0].price, 250);
});

test("portal 28: disponibilidad no ofrece técnica incompatible", async () => {
  const laura = staff();
  const tania = staff({
    id: "77777777-7777-4777-8777-777777777777",
    full_name: "Tania Mendez",
  });
  const result = await getAvailability({
    adminSupabase: createAvailabilitySupabase({
      staffRows: [laura, tania],
      schedules: [scheduleForStaff(laura.id), scheduleForStaff(tania.id)],
      staffServices: [{ staff_id: laura.id, service_id: service().id, active: true }],
    }),
    date: "2026-08-01",
    serviceIds: [service().id],
    requestedStartTime: "09:00",
  });

  assert.deepEqual([...new Set(result.slots.map((item) => item.staff_id))], [
    laura.id,
  ]);
});

test("portal 29: horario ocupado no aparece", async () => {
  const result = await getAvailability({
    adminSupabase: createAvailabilitySupabase({
      existingServices: [
        {
          staff_id: staff().id,
          service_date: "2026-08-01",
          start_time: "09:00",
          end_time: "10:00",
          appointments: { status: "agendada" },
        },
      ],
    }),
    date: "2026-08-01",
    serviceIds: [service().id],
    requestedStartTime: "09:00",
  });

  assert.equal(result.slots.length, 0);
});

test("portal 30: bloqueo o comida se respeta", async () => {
  const blocked = await getAvailability({
    adminSupabase: createAvailabilitySupabase({
      blocks: [
        {
          staff_id: staff().id,
          block_date: "2026-08-01",
          start_time: "09:00",
          end_time: "10:00",
        },
      ],
    }),
    date: "2026-08-01",
    serviceIds: [service().id],
    requestedStartTime: "09:00",
  });
  const lunch = await getAvailability({
    adminSupabase: createAvailabilitySupabase({
      schedules: [
        scheduleForStaff(staff().id, {
          has_break: true,
          break_start: "09:30",
          break_end: "10:00",
        }),
      ],
    }),
    date: "2026-08-01",
    serviceIds: [service().id],
    requestedStartTime: "09:00",
  });

  assert.equal(blocked.slots.length, 0);
  assert.equal(lunch.slots.length, 0);
});

test("portal 31: cita cancelada no bloquea el horario", async () => {
  const result = await getAvailability({
    adminSupabase: createAvailabilitySupabase({
      existingServices: [
        {
          staff_id: staff().id,
          service_date: "2026-08-01",
          start_time: "09:00",
          end_time: "10:00",
          appointments: { status: "cancelada" },
        },
      ],
    }),
    date: "2026-08-01",
    serviceIds: [service().id],
    requestedStartTime: "09:00",
  });

  assert.equal(result.slots.length, 1);
  assert.equal(result.slots[0].start_time, "09:00");
});

test("portal 32: APIs derivan clienta desde sesión y no confían client_id del navegador", () => {
  const routeSource = readFileSync(
    new URL("../app/api/client/appointments/route.js", import.meta.url),
    "utf8"
  );

  assert.match(routeSource, /ensureClientForUser/);
  assert.doesNotMatch(routeSource, /body\.client_id|client_id:\s*body/i);
});

test("portal 33: catálogo del portal no usa select star y expone compatibilidad mínima", () => {
  const routeSource = readFileSync(
    new URL("../app/api/client/services/route.js", import.meta.url),
    "utf8"
  );
  const pageSource = readFileSync(
    new URL("../app/cliente/agenda/page.js", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(routeSource, /\.select\(["']\*["']\)/);
  assert.match(routeSource, /staff_services/);
  assert.match(
    readFileSync(
      new URL("../app/lib/clientPortalCatalog.js", import.meta.url),
      "utf8"
    ),
    /bookable_staff_ids/
  );
  assert.match(pageSource, /compatibleStaff/);
});

test("portal 34: dos intents distintos sobre el mismo slot dejan solo una cita", async () => {
  clearAppointmentWriteInFlightForTests();
  const repository = createPortalTransactionalHarness();
  const first = preview();
  const second = preview({
    actorId: "88888888-8888-4888-8888-888888888888",
    client: {
      id: "99999999-9999-4999-8999-999999999999",
      name: "Otra clienta",
      phone: "9995556677",
    },
  });
  const results = await Promise.all([
    confirmClientPortalAppointment({
      input: first,
      transactionalRepository: repository,
      now,
    }),
    confirmClientPortalAppointment({
      input: second,
      transactionalRepository: repository,
      now,
    }),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(
    results.filter((result) => result.status === "not_available").length,
    1
  );
  assert.equal(repository.appointments.length, 1);
  assert.equal(repository.appointmentServices.length, 1);
});

test("portal 35: multiservicio crea todos los servicios en la misma operación", async () => {
  const second = service({
    id: "66666666-6666-4666-8666-666666666666",
    name: "Pedicure",
    duration_minutes: 40,
    cleanup_minutes: 5,
    base_price: 300,
  });
  const repository = createPortalTransactionalHarness();
  const result = await confirmClientPortalAppointment({
    input: preview({ slot: slot([service(), second]) }),
    transactionalRepository: repository,
    now,
  });
  assert.equal(result.ok, true);
  assert.equal(result.servicesCreated, 2);
  assert.equal(repository.appointments.length, 1);
  assert.equal(repository.appointmentServices.length, 2);
  assert.deepEqual(
    repository.appointmentServices.map((item) => item.appointment_id),
    [result.appointmentId, result.appointmentId]
  );
});

test("portal 36: fallo intermedio no deja servicios parciales", async () => {
  const repository = createPortalTransactionalHarness({
    failBeforeServices: true,
  });
  const result = await confirmClientPortalAppointment({
    input: preview(),
    transactionalRepository: repository,
    now,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "transaction_failed");
  assert.equal(repository.appointments.length, 0);
  assert.equal(repository.appointmentServices.length, 0);
});

test("portal 37: staff incompatible falla en la operación de escritura", async () => {
  const repository = createPortalTransactionalHarness({
    invalidStaffIds: ["22222222-2222-4222-8222-222222222222"],
  });
  const result = await confirmClientPortalAppointment({
    input: preview(),
    transactionalRepository: repository,
    now,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "invalid_staff");
  assert.equal(repository.appointments.length, 0);
});

test("portal 38: slot ocupado después de consultar disponibilidad falla al confirmar", async () => {
  const current = preview();
  const repository = createPortalTransactionalHarness({
    occupiedSlots: [
      [
        current.staffId,
        current.date,
        current.startTime,
        current.endTime,
      ].join("|"),
    ],
  });
  const result = await confirmClientPortalAppointment({
    input: current,
    transactionalRepository: repository,
    now,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "not_available");
  assert.equal(repository.appointments.length, 0);
});

test("portal 39: el endpoint del portal no conserva escritor legacy", () => {
  const routeSource = readFileSync(
    new URL("../app/api/client/appointments/route.js", import.meta.url),
    "utf8"
  );
  assert.match(routeSource, /createAppointmentTransactionalRepository/);
  assert.doesNotMatch(routeSource, /createLegacyPortalAppointment/);
  assert.doesNotMatch(routeSource, /legacyWriter/);
});

test("portal 40: el repositorio permite portal sin activar bandera general ni bot", async () => {
  let rpcCalls = 0;
  const current = preview();
  const repository = createAppointmentTransactionalRepository({
    env: {
      BOT_APPOINTMENT_WRITES_ENABLED: "false",
    },
    supabase: {
      rpc: async (name, parameters) => {
        rpcCalls += 1;
        assert.equal(name, "create_appointment_transaction");
        assert.equal(parameters.p_source, "client_portal");
        return {
          data: {
            status: "created",
            appointmentId: "55555555-5555-4555-8555-555555555555",
            clientId: current.client.id,
            idempotencyKey: parameters.p_idempotency_key,
            servicesCreated: 1,
            date: current.date,
            startTime: current.startTime,
            endTime: current.endTime,
            staffId: current.staffId,
          },
          error: null,
        };
      },
    },
  });
  const result = await confirmClientPortalAppointment({
    input: current,
    transactionalRepository: repository,
    now,
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "transactional");
  assert.equal(rpcCalls, 1);
});

test("portal 41: perfil completo se reconoce por nombre real y teléfono", () => {
  assert.equal(
    isClientProfileComplete({
      id: "client_1",
      full_name: "Clienta Real",
      phone: "999 111 2233",
    }),
    true
  );
});

test("portal 42: perfil incompleto no bloquea el catálogo pero exige completar", () => {
  assert.equal(
    isClientProfileComplete({
      id: "client_1",
      full_name: "",
      phone: "",
    }),
    false
  );
  assert.equal(
    isClientProfileComplete({
      id: "client_1",
      full_name: "Clienta",
      phone: "9991112233",
    }),
    false
  );
  assert.equal(normalizePhoneDigits("999 111-2233"), "9991112233");
});

test("portal 43: catálogo del portal expone servicios activos con DTO mínimo", () => {
  const catalog = mapClientPortalCatalog({
    services: [service()],
    staff: [staff()],
    staffServices: [
      {
        staff_id: staff().id,
        service_id: service().id,
        active: true,
      },
    ],
  });
  assert.deepEqual(Object.keys(catalog.services[0]).sort(), [
    "base_price",
    "bookable_staff_ids",
    "category",
    "cleanup_minutes",
    "description",
    "duration_minutes",
    "id",
    "name",
  ]);
  assert.equal(catalog.services[0].name, "Manicure");
  assert.deepEqual(catalog.services[0].bookable_staff_ids, [staff().id]);
});

test("portal 44: servicio inactivo no aparece en catálogo público", () => {
  const catalog = mapClientPortalCatalog({
    services: [service(), service({ id: "inactive", active: false })],
    staff: [staff()],
  });
  assert.deepEqual(catalog.services.map((item) => item.id), [service().id]);
});

test("portal 45: error de API y catálogo vacío tienen estados visuales distintos", () => {
  const pageSource = readFileSync(
    new URL("../app/cliente/agenda/page.js", import.meta.url),
    "utf8"
  );
  assert.match(pageSource, /Error cargando servicios/);
  assert.match(pageSource, /No hay servicios disponibles para agenda en línea/);
  assert.match(pageSource, /Cargando servicios/);
});

test("portal 46: sin servicio seleccionado no se inventan técnicas individuales", () => {
  assert.deepEqual(getCompatibleStaffForSelectedServices([staff()], []), []);
});

test("portal 47: seleccionar servicio muestra técnicas compatibles", () => {
  const laura = staff();
  const tania = staff({
    id: "77777777-7777-4777-8777-777777777777",
    full_name: "Tania Mendez",
  });
  const catalog = mapClientPortalCatalog({
    services: [service()],
    staff: [laura, tania],
    staffServices: [
      {
        staff_id: laura.id,
        service_id: service().id,
        active: true,
      },
    ],
  });
  assert.deepEqual(
    getCompatibleStaffForSelectedServices(catalog.staff, catalog.services).map(
      (person) => person.id
    ),
    [laura.id]
  );
});

test("portal 48: técnica incompatible no aparece", () => {
  const laura = staff();
  const tania = staff({
    id: "77777777-7777-4777-8777-777777777777",
    full_name: "Tania Mendez",
  });
  const catalog = mapClientPortalCatalog({
    services: [service()],
    staff: [laura, tania],
    staffServices: [
      {
        staff_id: laura.id,
        service_id: service().id,
        active: true,
      },
    ],
  });
  const compatible = getCompatibleStaffForSelectedServices(
    catalog.staff,
    catalog.services
  );
  assert.equal(compatible.some((person) => person.id === tania.id), false);
});

test("portal 49: varios servicios filtran por técnica que cubre toda la combinación", () => {
  const first = service();
  const second = service({
    id: "66666666-6666-4666-8666-666666666666",
    name: "Pedicure",
  });
  const laura = staff();
  const tania = staff({
    id: "77777777-7777-4777-8777-777777777777",
    full_name: "Tania Mendez",
  });
  const catalog = mapClientPortalCatalog({
    services: [first, second],
    staff: [laura, tania],
    staffServices: [
      { staff_id: laura.id, service_id: first.id, active: true },
      { staff_id: laura.id, service_id: second.id, active: true },
      { staff_id: tania.id, service_id: first.id, active: true },
    ],
  });
  assert.deepEqual(
    getCompatibleStaffForSelectedServices(catalog.staff, catalog.services).map(
      (person) => person.id
    ),
    [laura.id]
  );
});

test("portal 50: La colaboradora disponible sigue disponible como opción genérica", () => {
  const pageSource = readFileSync(
    new URL("../app/cliente/agenda/page.js", import.meta.url),
    "utf8"
  );
  assert.match(pageSource, /La colaboradora disponible/);
});

test("portal 51: client_id se deriva de sesión y no del navegador", () => {
  const appointmentsRoute = readFileSync(
    new URL("../app/api/client/appointments/route.js", import.meta.url),
    "utf8"
  );
  const availabilityRoute = readFileSync(
    new URL("../app/api/client/availability/route.js", import.meta.url),
    "utf8"
  );
  assert.match(appointmentsRoute, /ensureClientForUser/);
  assert.match(availabilityRoute, /getClientPortalProfile/);
  assert.doesNotMatch(appointmentsRoute, /body\.client_id|client_id:\s*body/i);
  assert.doesNotMatch(availabilityRoute, /body\.client_id|client_id:\s*body/i);
});

test("portal 52: servicios ya no exigen crear perfil completo antes de mostrar catálogo", () => {
  const servicesRoute = readFileSync(
    new URL("../app/api/client/services/route.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(servicesRoute, /ensureClientForUser/);
  assert.match(servicesRoute, /getClientPortalProfile/);
  assert.doesNotMatch(servicesRoute, /\.select\(["']\*["']\)/);
});

test("portal 53: Perfil puede completar nombre y teléfono sin cerrar sesión", () => {
  const profilePage = readFileSync(
    new URL("../app/cliente/perfil/page.js", import.meta.url),
    "utf8"
  );
  const profileRoute = readFileSync(
    new URL("../app/api/client/profile/route.js", import.meta.url),
    "utf8"
  );
  assert.match(profilePage, /method:\s*"POST"/);
  assert.equal(
    profilePage.includes("Volver a Agenda") ||
      profilePage.includes("next=/cliente/agenda"),
    true
  );
  assert.match(profileRoute, /ensureClientForUser/);
  assert.match(profileRoute, /profile_required/);
});

test("portal 54: admin autenticado sin perfil de clienta no obtiene datos ajenos", () => {
  const serverSource = readFileSync(
    new URL("../app/lib/clientPortalServer.js", import.meta.url),
    "utf8"
  );
  assert.match(serverSource, /\.eq\("auth_user_id", user\.id\)/);
  assert.match(serverSource, /\.ilike\("email", email\)/);
  assert.doesNotMatch(serverSource, /role.*admin.*client_id|admin.*client_id/i);
});

test("portal 55: disponibilidad y creación exigen perfil completo desde servidor", () => {
  const appointmentsRoute = readFileSync(
    new URL("../app/api/client/appointments/route.js", import.meta.url),
    "utf8"
  );
  const availabilityRoute = readFileSync(
    new URL("../app/api/client/availability/route.js", import.meta.url),
    "utf8"
  );
  assert.match(availabilityRoute, /profile_complete/);
  assert.match(availabilityRoute, /antes de buscar horarios/);
  assert.match(appointmentsRoute, /profile_complete/);
  assert.match(appointmentsRoute, /antes de confirmar la cita/);
});

test("portal 56: relaciones inactivas staff-servicio no habilitan técnicas", () => {
  const catalog = mapClientPortalCatalog({
    services: [service()],
    staff: [staff()],
    staffServices: [
      {
        staff_id: staff().id,
        service_id: service().id,
        active: false,
      },
    ],
  });
  assert.deepEqual(catalog.services[0].bookable_staff_ids, []);
});

test("portal 57: registro pide correo propio y contraseña sin email del admin", () => {
  const registrationPage = readFileSync(
    new URL("../app/cliente/registro/page.js", import.meta.url),
    "utf8"
  );

  assert.match(registrationPage, /name="email"/);
  assert.match(registrationPage, /name="password"/);
  assert.match(registrationPage, /name="confirm_password"/);
  assert.doesNotMatch(registrationPage, /alexandraruizsalon@gmail\.com/i);
});

test("portal 58: sesión existente bloquea registro accidental de clienta", () => {
  const registrationPage = readFileSync(
    new URL("../app/cliente/registro/page.js", import.meta.url),
    "utf8"
  );

  assert.match(registrationPage, /getPortalSession/);
  assert.match(registrationPage, /Ya hay una sesión iniciada/);
  assert.match(registrationPage, /Cerrar sesión y registrar clienta/);
  assert.match(registrationPage, /signOutClient/);
});

test("portal 59: login usa correo y contraseña propios sin identidad fija", () => {
  const loginPage = readFileSync(
    new URL("../app/cliente/login/page.js", import.meta.url),
    "utf8"
  );

  assert.match(loginPage, /signInWithPassword/);
  assert.match(loginPage, /name="email"/);
  assert.match(loginPage, /name="password"/);
  assert.match(loginPage, /Ya hay una sesión iniciada/);
  assert.doesNotMatch(loginPage, /alexandraruizsalon@gmail\.com/i);
});

test("portal 60: metadatos admin no crean clienta automáticamente", () => {
  assert.equal(
    isClientAuthUser({
      user_metadata: { role: "admin", user_type: "admin" },
    }),
    false
  );
  assert.equal(
    isClientAuthUser({
      user_metadata: { role: "client", user_type: "clienta" },
    }),
    true
  );

  const serverSource = readFileSync(
    new URL("../app/lib/clientPortalServer.js", import.meta.url),
    "utf8"
  );
  assert.match(serverSource, /isClientAuthUser\(user\)/);
});

test("portal 61: servicios se agrupan por categoría real y conserva Otros", () => {
  const grouped = groupClientPortalServicesByCategory([
    service({ id: "svc-uñas", category: "Uñas" }),
    service({ id: "svc-pedi", category: "Pedicure" }),
    service({ id: "svc-otro", category: "" }),
  ]);

  assert.deepEqual(Object.keys(grouped), [
    "Uñas",
    "Pedicure",
    CLIENT_PORTAL_UNCATEGORIZED_CATEGORY,
  ]);
  assert.equal(grouped[CLIENT_PORTAL_UNCATEGORIZED_CATEGORY][0].id, "svc-otro");
});

test("portal 62: categorías desplegables conservan multiselección", () => {
  const agendaPage = readFileSync(
    new URL("../app/cliente/agenda/page.js", import.meta.url),
    "utf8"
  );

  assert.match(agendaPage, /openCategories/);
  assert.match(agendaPage, /aria-expanded/);
  assert.match(agendaPage, /seleccionado/);
  assert.match(agendaPage, /toggleService\(service\.id\)/);
  const toggleCategorySource =
    agendaPage.match(/const toggleCategory[\s\S]*?;\n\n  const findAvailability/)?.[0] ||
    "";
  assert.doesNotMatch(toggleCategorySource, /setSelectedServiceIds/);
});

test("portal 63: cita del portal pendiente se traduce como pendiente de anticipo", () => {
  assert.equal(
    getClientAppointmentStatusLabel({
      status: "agendada",
      confirmation_status: "pendiente",
      booking_source: "cliente_portal",
    }),
    "Pendiente de anticipo"
  );
  assert.equal(
    getClientAppointmentStatusLabel({
      status: "agendada",
      confirmation_status: "confirmada",
      booking_source: "cliente_portal",
    }),
    "Confirmada"
  );
});

test("portal 64: autoagenda responde solicitud pendiente y no cita confirmada", () => {
  const appointmentsRoute = readFileSync(
    new URL("../app/api/client/appointments/route.js", import.meta.url),
    "utf8"
  );

  assert.match(appointmentsRoute, /status_label: "Pendiente de anticipo"/);
  assert.match(appointmentsRoute, /booking_source: "cliente_portal"/);
  assert.match(appointmentsRoute, /confirmation_status: "pendiente"/);
  assert.match(appointmentsRoute, /Tu horario fue apartado/);
  assert.doesNotMatch(appointmentsRoute, /Tu cita está confirmada/);
});

test("portal 65: SQL transaccional aparta horario como pendiente existente", () => {
  const sql = readFileSync(
    new URL(
      "../supabase/migrations/202607260009_appointment_transaction_rpc.sql",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(sql, /'agendada'/);
  assert.match(sql, /'pendiente'/);
  assert.match(sql, /when v_source = 'client_portal' then 'cliente_portal'/);
  assert.match(sql, /appointment_services/);
});

test("portal 66: pendiente de anticipo bloquea disponibilidad hasta cancelarse", async () => {
  const busy = await getAvailability({
    adminSupabase: createAvailabilitySupabase({
      existingServices: [
        {
          appointment_id: "pending_portal",
          staff_id: staff().id,
          service_date: "2026-08-01",
          start_time: "09:00",
          end_time: "10:00",
          appointments: {
            status: "agendada",
            confirmation_status: "pendiente",
            booking_source: "cliente_portal",
          },
        },
      ],
    }),
    date: "2026-08-01",
    serviceIds: [service().id],
    requestedStartTime: "09:00",
  });

  const released = await getAvailability({
    adminSupabase: createAvailabilitySupabase({
      existingServices: [
        {
          appointment_id: "cancelled_portal",
          staff_id: staff().id,
          service_date: "2026-08-01",
          start_time: "09:00",
          end_time: "10:00",
          appointments: {
            status: "cancelada",
            confirmation_status: "cancelada",
            booking_source: "cliente_portal",
          },
        },
      ],
    }),
    date: "2026-08-01",
    serviceIds: [service().id],
    requestedStartTime: "09:00",
  });

  assert.equal(busy.slots.length, 0);
  assert.equal(released.slots.length, 1);
});

test("portal 67: Agenda admin muestra y confirma pendiente sin duplicar cita", () => {
  const agendaPage = readFileSync(
    new URL("../app/admin/agenda/page.js", import.meta.url),
    "utf8"
  );

  assert.match(agendaPage, /getClientAppointmentStatusLabel/);
  assert.match(agendaPage, /Confirmar cita/);
  assert.match(agendaPage, /confirmation_status: "confirmada"/);
  assert.match(agendaPage, /\.update\(payload\)/);
  assert.doesNotMatch(agendaPage, /insert\(\[payload\]\).*Confirmar cita/s);
});

test("portal 68: Mis citas usa etiqueta amigable pendiente de anticipo", () => {
  const appointmentsPage = readFileSync(
    new URL("../app/cliente/mis-citas/page.js", import.meta.url),
    "utf8"
  );

  assert.match(appointmentsPage, /getClientAppointmentStatusLabel/);
  assert.match(appointmentsPage, /status_label/);
});
