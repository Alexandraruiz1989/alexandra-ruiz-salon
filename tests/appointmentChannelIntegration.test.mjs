import assert from "node:assert/strict";
import test from "node:test";

import {
  createAppointmentFromAdmin,
  createAppointmentFromBot,
  confirmClientPortalAppointment,
  prepareAdminAppointmentContract,
  prepareBotAppointmentContract,
  prepareClientPortalAppointment,
} from "../app/lib/appointmentChannelAdapters.js";
import { clearAppointmentWriteInFlightForTests } from "../app/lib/appointmentWriteService.js";

const now = new Date("2026-07-24T12:00:00.000Z");
const env = {
  APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED: "true",
  APPOINTMENT_ADMIN_TRANSACTIONAL_WRITES_ENABLED: "true",
  BOT_APPOINTMENT_WRITES_ENABLED: "true",
};
const serviceId = "11111111-1111-4111-8111-111111111111";
const staffId = "22222222-2222-4222-8222-222222222222";
const clientId = "33333333-3333-4333-8333-333333333333";

function commonService(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function adminContract(overrides = {}) {
  return prepareAdminAppointmentContract({
    actorId: "44444444-4444-4444-8444-444444444444",
    eventId: "event_1",
    client: { id: clientId, name: "Clienta", phone: "9991112233" },
    services: [commonService()],
    date: "2026-08-01",
    startTime: "09:00",
    endTime: "10:00",
    staffId,
    expectedPrice: 250,
    depositStatus: "not_required",
    ...overrides,
  });
}

function portalContract(overrides = {}) {
  const publicService = {
    id: serviceId,
    name: "Manicure",
    active: true,
    service_type: "servicio",
    variable_pricing: false,
    bot_active: true,
    bot_bookable: true,
    duration_minutes: 50,
    cleanup_minutes: 10,
    base_price: 250,
  };
  return prepareClientPortalAppointment({
    actorId: "55555555-5555-4555-8555-555555555555",
    client: { id: clientId, name: "Clienta", phone: "9991112233" },
    slot: {
      date: "2026-08-01",
      staff_id: staffId,
      start_time: "09:00",
      end_time: "10:00",
      service_segments: [
        {
          service_id: serviceId,
          service: publicService,
          staff_id: staffId,
          service_date: "2026-08-01",
          start_time: "09:00",
          end_time: "10:00",
          duration_minutes: 50,
          cleanup_minutes: 10,
          price: 250,
        },
      ],
    },
    now,
    ...overrides,
  });
}

function botContract(overrides = {}) {
  return prepareBotAppointmentContract({
    conversationId: "66666666-6666-4666-8666-666666666666",
    customer: { id: clientId, name: "Clienta", phone: "9991112233" },
    participants: [{ id: "person_1", label: "clienta" }],
    services: [commonService()],
    date: "2026-08-01",
    startTime: "09:00",
    endTime: "10:00",
    staff: { id: staffId, name: "Laura Canul" },
    previewId: "bot_preview_1",
    version: 1,
    expiresAt: "2026-08-01T18:00:00.000Z",
    confirmation: { id: "bot_confirmation_1" },
    fingerprint: "bot_persisted_fingerprint",
    expectedPrice: 250,
    depositStatus: "not_required",
    ...overrides,
  });
}

function simulatedRepository() {
  const occupied = new Map();
  const operations = new Map();
  let sequence = 0;
  return {
    calls: [],
    async createAppointmentTransaction({ contract, idempotencyKey }) {
      this.calls.push({ contract, idempotencyKey });
      if (operations.has(idempotencyKey)) {
        return {
          ...operations.get(idempotencyKey),
          status: "already_created",
          isReplay: true,
        };
      }
      const slotKey = [
        contract.date,
        contract.startTime,
        contract.endTime,
        contract.staffId,
      ].join(":");
      if (occupied.has(slotKey)) {
        return {
          status: "not_available",
          errorCode: "staff_overlap",
          appointmentId: null,
          servicesCreated: 0,
        };
      }
      sequence += 1;
      occupied.set(slotKey, idempotencyKey);
      const result = {
        status: "created",
        appointmentId: `appointment_${sequence}`,
        clientId: contract.client.id,
        servicesCreated: contract.services.length,
        isReplay: false,
      };
      operations.set(idempotencyKey, result);
      return result;
    },
  };
}

function comparable(contract) {
  return {
    services: contract.services.map((item) => ({
      id: item.id,
      durationMinutes: item.durationMinutes,
      cleanupMinutes: item.cleanupMinutes,
      price: item.price,
      staffId: item.staffId,
    })),
    date: contract.date,
    startTime: contract.startTime,
    endTime: contract.endTime,
    staffId: contract.staffId,
    expectedPrice: contract.expectedPrice,
    participantCount: contract.participantCount,
  };
}

async function write(source, input, repository) {
  const options = {
    input,
    env,
    transactionalRepository: repository,
    now,
  };
  if (source === "admin") return createAppointmentFromAdmin(options);
  if (source === "client_portal") {
    return confirmClientPortalAppointment(options);
  }
  return createAppointmentFromBot(options);
}

test("integración compartida 1: los tres canales normalizan servicios igual", () => {
  assert.deepEqual(comparable(adminContract()), comparable(portalContract()));
  assert.deepEqual(comparable(portalContract()), comparable(botContract()));
});

test("integración compartida 2: cada contrato conserva origen distinto", () => {
  assert.deepEqual(
    [adminContract().source, portalContract().source, botContract().source],
    ["admin", "client_portal", "bot"]
  );
});

test("integración compartida 3: los tres llegan al mismo repositorio", async () => {
  const sources = [];
  for (const [source, input] of [
    ["admin", adminContract()],
    ["client_portal", portalContract()],
    ["bot", botContract()],
  ]) {
    const repository = simulatedRepository();
    await write(source, input, repository);
    sources.push(repository.calls[0].contract.source);
  }
  assert.deepEqual(sources, ["admin", "client_portal", "bot"]);
});

test("integración compartida 4: resultado uniforme incluye modo y origen", async () => {
  const repository = simulatedRepository();
  const result = await write("admin", adminContract(), repository);
  assert.equal(result.ok, true);
  assert.equal(result.mode, "transactional");
  assert.equal(result.source, "admin");
});

test("concurrencia 1: portal y bot compiten y solo uno gana", async () => {
  clearAppointmentWriteInFlightForTests();
  const repository = simulatedRepository();
  const results = await Promise.all([
    write("client_portal", portalContract(), repository),
    write("bot", botContract(), repository),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(
    results.filter((result) => result.status === "not_available").length,
    1
  );
});

test("concurrencia 2: agenda y bot compiten y solo uno gana", async () => {
  clearAppointmentWriteInFlightForTests();
  const repository = simulatedRepository();
  const results = await Promise.all([
    write("admin", adminContract(), repository),
    write("bot", botContract(), repository),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(
    results.filter((result) => result.status === "not_available").length,
    1
  );
});

test("concurrencia 3: agenda y portal compiten y solo uno gana", async () => {
  clearAppointmentWriteInFlightForTests();
  const repository = simulatedRepository();
  const results = await Promise.all([
    write("admin", adminContract(), repository),
    write("client_portal", portalContract(), repository),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(
    results.filter((result) => result.status === "not_available").length,
    1
  );
});

test("concurrencia 4: dos pestañas del portal obtienen replay", async () => {
  clearAppointmentWriteInFlightForTests();
  const repository = simulatedRepository();
  const current = portalContract();
  const results = await Promise.all([
    write("client_portal", current, repository),
    write("client_portal", current, repository),
  ]);
  assert.equal(repository.calls.length, 1);
  assert.equal(results[0].appointmentId, results[1].appointmentId);
  assert.equal(results[1].isReplay, true);
});

test("concurrencia 5: dos administradoras no crean el mismo horario", async () => {
  clearAppointmentWriteInFlightForTests();
  const repository = simulatedRepository();
  const results = await Promise.all([
    write("admin", adminContract(), repository),
    write(
      "admin",
      adminContract({
        actorId: "77777777-7777-4777-8777-777777777777",
        eventId: "event_2",
      }),
      repository
    ),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(
    results.filter((result) => result.status === "not_available").length,
    1
  );
});
