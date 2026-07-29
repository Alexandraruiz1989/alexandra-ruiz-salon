import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { handleBotAppointmentConfirmation } from "../app/api/bot/appointments/confirm/route.js";
import {
  confirmAppointmentPreview,
  prepareAppointmentDraft,
} from "../app/lib/botAppointmentOrchestrator.js";
import { authenticateInternalBotRequest } from "../app/lib/botInternalRequestAuth.js";

const now = new Date("2026-07-24T12:00:00.000Z");
const enabledEnv = {
  APPOINTMENT_TRANSACTIONAL_WRITES_ENABLED: "true",
  BOT_APPOINTMENT_WRITES_ENABLED: "true",
};

function confirmedDraft(overrides = {}) {
  const draft = prepareAppointmentDraft({
    conversationId: "11111111-1111-4111-8111-111111111111",
    customer: { name: "Clienta de prueba", phone: "9991112233" },
    participants: [
      {
        id: "person_1",
        label: "clienta",
        services: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Gel en manos",
          },
        ],
      },
    ],
    services: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Gel en manos",
        durationMinutes: 50,
        cleanupMinutes: 10,
        price: 250,
        priceType: "fixed",
        participantId: "person_1",
      },
    ],
    date: "2026-07-25",
    startTime: "09:00",
    endTime: "10:00",
    staff: {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Alexandra Ruiz",
      preference: "specific",
    },
    expectedPrice: 250,
    depositStatus: "not_required",
    now,
    ...overrides,
  });
  const confirmation = confirmAppointmentPreview({
    draft,
    pendingStep: "confirmation",
    previewId: draft.previewId,
    explicitConfirmation: true,
    now,
  });
  assert.equal(confirmation.ok, true);
  return confirmation.draft;
}

function makeRequest(draft, overrides = {}) {
  return new Request("http://localhost/api/bot/appointments/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId: draft.conversationId,
      previewId: draft.previewId,
      confirmationId: draft.confirmation.id,
      requestHash: draft.fingerprint,
      ...overrides,
    }),
  });
}

function contextFor(draft, overrides = {}) {
  return {
    settings: { active: true },
    conversation: {
      id: draft.conversationId,
      bot_enabled: true,
      handoff_to_human: false,
      conversation_context: {
        conversation_engine_state: { appointmentDraft: draft },
      },
    },
    ...overrides,
  };
}

function productionRepository(result, calls) {
  return {
    mode: "production_rpc",
    async createAppointmentTransaction(input) {
      calls.push(input);
      return result;
    },
  };
}

async function responseJson(response) {
  return {
    status: response.status,
    body: await response.json(),
  };
}

test("endpoint 1: bandera inactiva responde cerrado antes de autenticar", async () => {
  const draft = confirmedDraft();
  let authCalls = 0;
  let supabaseCalls = 0;
  const response = await handleBotAppointmentConfirmation(makeRequest(draft), {
    env: {},
    authenticateRequest: async () => {
      authCalls += 1;
      return { ok: true };
    },
    createSupabase() {
      supabaseCalls += 1;
      return {};
    },
  });
  const result = await responseJson(response);
  assert.equal(result.status, 503);
  assert.equal(result.body.code, "write_disabled");
  assert.equal(authCalls, 0);
  assert.equal(supabaseCalls, 0);
});

test("endpoint 2: con bandera activa y auth sin configurar responde 401", async () => {
  const draft = confirmedDraft();
  let supabaseCalls = 0;
  const response = await handleBotAppointmentConfirmation(makeRequest(draft), {
    env: enabledEnv,
    createSupabase() {
      supabaseCalls += 1;
      return {};
    },
  });
  assert.equal(response.status, 401);
  assert.equal(supabaseCalls, 0);
});

test("endpoint 3: controles de escritura enviados por cliente se rechazan", async () => {
  const draft = confirmedDraft();
  let contextCalls = 0;
  const response = await handleBotAppointmentConfirmation(
    makeRequest(draft, { allowRealWrite: true }),
    {
      env: enabledEnv,
      authenticateRequest: async () => ({ ok: true }),
      supabase: {},
      loadContext: async () => {
        contextCalls += 1;
        return contextFor(draft);
      },
    }
  );
  const result = await responseJson(response);
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "unsupported_request_fields");
  assert.equal(contextCalls, 0);
});

test("endpoint 4: bot_settings inactivo impide llegar al repositorio", async () => {
  const draft = confirmedDraft();
  let repositoryCalls = 0;
  const response = await handleBotAppointmentConfirmation(makeRequest(draft), {
    env: enabledEnv,
    authenticateRequest: async () => ({ ok: true }),
    supabase: {},
    loadContext: async () =>
      contextFor(draft, { settings: { active: false } }),
    createRepository() {
      repositoryCalls += 1;
      return {};
    },
  });
  const result = await responseJson(response);
  assert.equal(result.status, 409);
  assert.equal(result.body.code, "bot_inactive");
  assert.equal(repositoryCalls, 0);
});

test("endpoint 5: fingerprint distinto se rechaza sin RPC", async () => {
  const draft = confirmedDraft();
  let repositoryCalls = 0;
  const response = await handleBotAppointmentConfirmation(
    makeRequest(draft, { requestHash: "fp_diferente" }),
    {
      env: enabledEnv,
      authenticateRequest: async () => ({ ok: true }),
      supabase: {},
      loadContext: async () => contextFor(draft),
      createRepository() {
        repositoryCalls += 1;
        return {};
      },
    }
  );
  const result = await responseJson(response);
  assert.equal(result.status, 409);
  assert.equal(result.body.code, "confirmation_mismatch");
  assert.equal(repositoryCalls, 0);
});

test("endpoint 6: una confirmación válida usa el repositorio una sola vez", async () => {
  const draft = confirmedDraft();
  const calls = [];
  const response = await handleBotAppointmentConfirmation(makeRequest(draft), {
    env: enabledEnv,
    authenticateRequest: async () => ({
      ok: true,
      principal: { type: "internal" },
    }),
    supabase: {},
    loadContext: async () => contextFor(draft),
    createRepository: () =>
      productionRepository(
        {
          status: "created",
          appointmentId: "44444444-4444-4444-8444-444444444444",
          clientId: "55555555-5555-4555-8555-555555555555",
          servicesCreated: 1,
          isReplay: false,
          date: draft.date,
          startTime: draft.startTime,
          endTime: draft.endTime,
          staffId: draft.staff.id,
        },
        calls
      ),
    now,
  });
  const result = await responseJson(response);
  assert.equal(result.status, 201);
  assert.equal(result.body.status, "created");
  assert.equal(result.body.servicesCreated, 1);
  assert.equal(calls.length, 1);
});

test("endpoint 7: replay idempotente responde 200 y no duplica en el adaptador", async () => {
  const draft = confirmedDraft();
  const calls = [];
  const response = await handleBotAppointmentConfirmation(makeRequest(draft), {
    env: enabledEnv,
    authenticateRequest: async () => ({ ok: true }),
    supabase: {},
    loadContext: async () => contextFor(draft),
    createRepository: () =>
      productionRepository(
        {
          status: "already_created",
          appointmentId: "44444444-4444-4444-8444-444444444444",
          clientId: "55555555-5555-4555-8555-555555555555",
          servicesCreated: 1,
          isReplay: true,
          date: draft.date,
          startTime: draft.startTime,
          endTime: draft.endTime,
          staffId: draft.staff.id,
        },
        calls
      ),
    now,
  });
  const result = await responseJson(response);
  assert.equal(result.status, 200);
  assert.equal(result.body.isReplay, true);
  assert.equal(calls.length, 1);
});

test("endpoint 8: autenticación interna falla cerrada por defecto", async () => {
  assert.deepEqual(await authenticateInternalBotRequest(), {
    ok: false,
    status: 401,
    code: "internal_auth_not_configured",
  });
});

test("endpoint 9: el probador permanece admin, simulación y sin repositorio real", () => {
  const source = readFileSync(
    new URL("../app/api/bot/test/route.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /authorizeAdminRequest\(request\)/);
  assert.match(source, /const allowRealWrite = false;/);
  assert.match(source, /createReadOnlyBotAppointmentRepository/);
  assert.doesNotMatch(source, /botAppointmentProductionRepository/);
  assert.doesNotMatch(source, /createProductionBotAppointmentRepository/);
});

test("endpoint 10: la ruta futura no contiene WhatsApp ni inserciones directas", () => {
  const source = readFileSync(
    new URL(
      "../app/api/bot/appointments/confirm/route.js",
      import.meta.url
    ),
    "utf8"
  );
  assert.doesNotMatch(source, /whatsapp|twilio|meta api/i);
  assert.doesNotMatch(
    source,
    /\.from\(["'](?:clients|appointments|appointment_services|payments)["']\)/
  );
  assert.doesNotMatch(source, /\.insert\(/);
});
