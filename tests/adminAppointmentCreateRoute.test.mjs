import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { handleAdminAppointmentCreate } from "../app/api/admin/appointments/create/route.js";
import { clearAppointmentWriteInFlightForTests } from "../app/lib/appointmentWriteService.js";

const now = new Date("2026-07-24T12:00:00.000Z");
const enabledEnv = {
  APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED: "true",
  APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED: "true",
};
const actorId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const staffId = "33333333-3333-4333-8333-333333333333";
const serviceId = "44444444-4444-4444-8444-444444444444";
const appointmentId = "55555555-5555-4555-8555-555555555555";

function request(overrides = {}) {
  return new Request("http://localhost/api/admin/appointments/create", {
    method: "POST",
    headers: {
      authorization: "Bearer token-de-prueba",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      eventId: "admin_event_1",
      clientId,
      serviceIds: [serviceId],
      date: "2026-08-01",
      startTime: "09:00",
      staffId,
      ...overrides,
    }),
  });
}

function session(role = "admin") {
  return {
    user: { id: actorId, email: "admin@example.test" },
    profile: { id: "profile_1", role, active: true },
  };
}

function selection(overrides = {}) {
  return {
    ok: true,
    client: {
      id: clientId,
      name: "Clienta de prueba",
      phone: "9991112233",
    },
    services: [
      {
        id: serviceId,
        name: "Manicure",
        staffId,
        participantId: "person_1",
        durationMinutes: 50,
        cleanupMinutes: 10,
        price: 250,
        priceType: "fixed",
        active: true,
        bookable: true,
        service_type: "servicio",
      },
    ],
    extras: [],
    date: "2026-08-01",
    startTime: "09:00",
    endTime: "10:00",
    staffId,
    expectedPrice: 250,
    ...overrides,
  };
}

function created(overrides = {}) {
  return {
    status: "created",
    appointmentId,
    clientId,
    servicesCreated: 1,
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  return {
    env: enabledEnv,
    supabase: {},
    authenticateRequest: async () => session(),
    loadSelection: async () => selection(),
    createRepository: () => ({
      createAppointmentTransaction: async () => created(),
    }),
    now,
    ...overrides,
  };
}

async function result(response) {
  return {
    status: response.status,
    body: await response.json(),
  };
}

test("ruta admin 1: rechaza sesión ausente", async () => {
  let loadCalls = 0;
  const response = await handleAdminAppointmentCreate(
    request(),
    dependencies({
      authenticateRequest: async () => ({ error: "expired", status: 401 }),
      loadSelection: async () => {
        loadCalls += 1;
        return selection();
      },
    })
  );
  const output = await result(response);
  assert.equal(output.status, 401);
  assert.equal(output.body.code, "unauthorized");
  assert.equal(loadCalls, 0);
});

test("ruta admin 2: rechaza rol sin permiso", async () => {
  const response = await handleAdminAppointmentCreate(
    request(),
    dependencies({
      authenticateRequest: async () => session("recepcion"),
    })
  );
  const output = await result(response);
  assert.equal(output.status, 403);
  assert.equal(output.body.code, "forbidden");
});

test("ruta admin 3: administradora válida usa una sola vez la capa compartida", async () => {
  const calls = [];
  const response = await handleAdminAppointmentCreate(
    request(),
    dependencies({
      createRepository: () => ({
        async createAppointmentTransaction(input) {
          calls.push(input);
          return created();
        },
      }),
    })
  );
  const output = await result(response);
  assert.equal(output.status, 201);
  assert.equal(output.body.success, true);
  assert.equal(output.body.appointmentId, appointmentId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].contract.source, "admin");
});

test("ruta admin 4: servicio inválido no llega al RPC", async () => {
  let repositoryCalls = 0;
  const response = await handleAdminAppointmentCreate(
    request(),
    dependencies({
      loadSelection: async () => ({ ok: false, code: "invalid_service" }),
      createRepository: () => {
        repositoryCalls += 1;
        return {};
      },
    })
  );
  const output = await result(response);
  assert.equal(output.status, 400);
  assert.equal(output.body.code, "invalid_service");
  assert.equal(repositoryCalls, 0);
});

test("ruta admin 5: técnica inválida no llega al RPC", async () => {
  const response = await handleAdminAppointmentCreate(
    request(),
    dependencies({
      loadSelection: async () => ({ ok: false, code: "invalid_staff" }),
    })
  );
  const output = await result(response);
  assert.equal(output.status, 400);
  assert.equal(output.body.code, "invalid_staff");
});

test("ruta admin 6: traslape devuelve horario no disponible", async () => {
  const response = await handleAdminAppointmentCreate(
    request(),
    dependencies({
      loadSelection: async () => ({ ok: false, code: "not_available" }),
    })
  );
  const output = await result(response);
  assert.equal(output.status, 409);
  assert.equal(output.body.code, "not_available");
});

test("ruta admin 7: doble envío en vuelo ejecuta un solo RPC", async () => {
  clearAppointmentWriteInFlightForTests();
  let calls = 0;
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const sharedDependencies = dependencies({
    createRepository: () => ({
      async createAppointmentTransaction() {
        calls += 1;
        await wait;
        return created();
      },
    }),
  });
  const first = handleAdminAppointmentCreate(request(), sharedDependencies);
  const second = handleAdminAppointmentCreate(request(), sharedDependencies);
  await Promise.resolve();
  release();
  const outputs = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal((await outputs[0].json()).appointmentId, appointmentId);
  assert.equal((await outputs[1].json()).isReplay, true);
});

test("ruta admin 8: force_created autorizado llega firmado por servidor", async () => {
  const contracts = [];
  const response = await handleAdminAppointmentCreate(
    request({ forceCreated: true }),
    dependencies({
      authenticateRequest: async () => session("encargada"),
      loadSelection: async ({ allowConflictOverride }) => {
        assert.equal(allowConflictOverride, true);
        return selection();
      },
      createRepository: () => ({
        async createAppointmentTransaction({ contract }) {
          contracts.push(contract);
          return created();
        },
      }),
    })
  );
  assert.equal(response.status, 201);
  assert.equal(contracts[0].forceCreated, true);
});

test("ruta admin 9: force_created se rechaza para rol no autorizado", async () => {
  let loadCalls = 0;
  const response = await handleAdminAppointmentCreate(
    request({ forceCreated: true }),
    dependencies({
      authenticateRequest: async () => session("tecnica"),
      loadSelection: async () => {
        loadCalls += 1;
        return selection();
      },
    })
  );
  const output = await result(response);
  assert.equal(output.status, 403);
  assert.equal(output.body.code, "force_forbidden");
  assert.equal(loadCalls, 0);
});

test("ruta admin 10: bandera apagada falla antes de autenticación", async () => {
  let authCalls = 0;
  const response = await handleAdminAppointmentCreate(
    request(),
    dependencies({
      env: {},
      authenticateRequest: async () => {
        authCalls += 1;
        return session();
      },
    })
  );
  const output = await result(response);
  assert.equal(output.status, 503);
  assert.equal(output.body.code, "write_disabled");
  assert.equal(authCalls, 0);
});

test("ruta admin 11: RPC ausente falla cerrado", async () => {
  const response = await handleAdminAppointmentCreate(
    request(),
    dependencies({
      createRepository: () => ({
        createAppointmentTransaction: async () => ({
          status: "failed",
          errorCode: "rpc_unavailable",
        }),
      }),
    })
  );
  const output = await result(response);
  assert.equal(output.status, 503);
  assert.equal(output.body.code, "rpc_unavailable");
});

test("ruta admin 12: resultado transaccional incompleto no anuncia éxito", async () => {
  const response = await handleAdminAppointmentCreate(
    request(),
    dependencies({
      createRepository: () => ({
        createAppointmentTransaction: async () =>
          created({ servicesCreated: 0 }),
      }),
    })
  );
  const output = await result(response);
  assert.equal(output.status, 502);
  assert.equal(output.body.success, false);
  assert.equal(output.body.code, "incomplete_write_result");
});

for (const field of ["writesEnabled", "bypass"]) {
  test(`ruta admin 13.${field}: rechaza control ${field} del navegador`, async () => {
    let loadCalls = 0;
    const response = await handleAdminAppointmentCreate(
      request({ [field]: true }),
      dependencies({
        loadSelection: async () => {
          loadCalls += 1;
          return selection();
        },
      })
    );
    const output = await result(response);
    assert.equal(output.status, 400);
    assert.equal(output.body.code, "unsupported_request_fields");
    assert.equal(loadCalls, 0);
  });
}

test("ruta admin 14: extras usan datos autoritativos y no precio del navegador", async () => {
  const extraId = "66666666-6666-4666-8666-666666666666";
  const contracts = [];
  const response = await handleAdminAppointmentCreate(
    request({
      extras: [{ extraId, quantity: 2 }],
    }),
    dependencies({
      loadSelection: async () =>
        selection({
          extras: [
            {
              id: extraId,
              name: "Retiro",
              staffId,
              quantity: 2,
              unitPrice: 50,
              active: true,
            },
          ],
          expectedPrice: 350,
        }),
      createRepository: () => ({
        async createAppointmentTransaction({ contract }) {
          contracts.push(contract);
          return created();
        },
      }),
    })
  );
  assert.equal(response.status, 201);
  assert.equal(contracts[0].extras[0].unitPrice, 50);
  assert.equal(contracts[0].expectedPrice, 350);
});

test("ruta admin 15: la ruta no contiene escritor secuencial y Agenda la usa tras banderas", () => {
  const routeSource = readFileSync(
    new URL(
      "../app/api/admin/appointments/create/route.js",
      import.meta.url
    ),
    "utf8"
  );
  const agendaSource = readFileSync(
    new URL("../app/admin/agenda/page.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(
    routeSource,
    /\.from\(["'](?:appointments|appointment_services|appointment_extra_items)["']\)[\s\S]{0,120}\.(?:insert|update)\(/
  );
  assert.doesNotMatch(routeSource, /legacyWriter/);
  assert.match(
    agendaSource,
    /\/api\/admin\/appointments\/create/
  );
  assert.match(
    agendaSource,
    /ADMIN_TRANSACTIONAL_APPOINTMENT_WRITES_ENABLED/
  );
});
