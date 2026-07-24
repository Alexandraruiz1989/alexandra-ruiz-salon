import { getAvailability } from "./bookingAvailability.js";

function clean(value) {
  return String(value || "").trim();
}

function writesUnavailable() {
  const error = new Error("Bot appointment writes are not configured.");
  error.code = "bot_appointment_writes_not_configured";
  throw error;
}

export function createReadOnlyBotAppointmentRepository({ supabase }) {
  if (!supabase) throw new Error("Supabase client is required.");

  return {
    async getServicesByIds(serviceIds) {
      const ids = [...new Set((serviceIds || []).map(clean).filter(Boolean))];
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .in("id", ids)
        .eq("active", true);
      if (error) throw error;
      const byId = new Map((data || []).map((service) => [service.id, service]));
      return ids.map((id) => byId.get(id)).filter(Boolean);
    },

    async getStaffById(staffId) {
      if (!clean(staffId)) return null;
      const { data, error } = await supabase
        .from("staff")
        .select("*")
        .eq("id", staffId)
        .eq("active", true)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    async checkAvailability({
      date,
      startTime,
      endTime,
      staffId,
      serviceIds,
    }) {
      const availability = await getAvailability({
        adminSupabase: supabase,
        date,
        serviceIds,
        preferredStaffId: staffId,
        requestedStartTime: startTime,
        limit: 5,
        allowMissingTimeBlocks: false,
      });
      const slot = (availability.slots || []).find(
        (item) =>
          item.staff_id === staffId &&
          item.start_time === startTime &&
          item.end_time === endTime
      );
      return {
        available: Boolean(slot),
        slot: slot || null,
        alternatives: slot ? [] : availability.slots || [],
      };
    },

    findCreationByIdempotencyKey: writesUnavailable,
    findOrCreateClient: writesUnavailable,
    createAppointment: writesUnavailable,
    createAppointmentServices: writesUnavailable,
    compensateAppointment: writesUnavailable,
    getAppointmentCreationResult: writesUnavailable,
  };
}
