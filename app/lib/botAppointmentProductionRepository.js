import { prepareBotAppointmentContract } from "./appointmentChannelAdapters.js";
import {
  appointmentTransactionalWritesEnabled,
  createAppointmentTransactionalRepository,
} from "./appointmentTransactionalRepository.js";
import { exactServerFlagEnabled } from "./appointmentWriteService.js";

export function botAppointmentWritesEnabled(env = process.env) {
  return (
    appointmentTransactionalWritesEnabled(env) &&
    exactServerFlagEnabled("BOT_APPOINTMENT_WRITES_ENABLED", env)
  );
}

export function createProductionBotAppointmentRepository({
  supabase,
  env = process.env,
}) {
  const repository = createAppointmentTransactionalRepository({
    supabase,
    env,
  });

  return {
    mode: "production_rpc",
    writesEnabled: botAppointmentWritesEnabled(env),

    async createAppointmentTransaction({ draft, contract, idempotencyKey }) {
      if (!botAppointmentWritesEnabled(env)) {
        return {
          status: "write_disabled",
          appointmentId: null,
          clientId: null,
          idempotencyKey: String(idempotencyKey || "").trim(),
          isReplay: false,
          servicesCreated: 0,
          errorCode: "write_disabled",
          errorMessage: "La creación real de citas está desactivada.",
        };
      }
      return repository.createAppointmentTransaction({
        contract: contract || prepareBotAppointmentContract(draft),
        idempotencyKey,
      });
    },
  };
}

export const BOT_APPOINTMENT_RPC_NAME = "create_appointment_transaction";
