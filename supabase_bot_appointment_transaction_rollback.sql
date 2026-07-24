-- Rollback revisable de supabase_bot_appointment_transaction.sql.
-- ARCHIVO PARA REVISIÓN: no ejecutar sin respaldo y autorización.
-- Las citas reales existentes no se eliminan.

begin;

revoke all on function public.create_bot_appointment_transaction(
  text,
  uuid,
  text,
  text,
  integer,
  text,
  uuid,
  text,
  text,
  jsonb,
  text,
  date,
  time without time zone,
  time without time zone,
  uuid,
  numeric,
  text,
  timestamptz
) from public, anon, authenticated, service_role;

drop function if exists public.create_bot_appointment_transaction(
  text,
  uuid,
  text,
  text,
  integer,
  text,
  uuid,
  text,
  text,
  jsonb,
  text,
  date,
  time without time zone,
  time without time zone,
  uuid,
  numeric,
  text,
  timestamptz
);

drop index if exists public.clients_phone_digits_idx;

-- Esta operación elimina solo el registro técnico de idempotencia.
-- appointment_id usa ON DELETE SET NULL desde la tabla técnica hacia
-- appointments, por lo que ninguna cita, clienta o servicio se elimina.
drop table if exists public.bot_appointment_operations;

notify pgrst, 'reload schema';

commit;
