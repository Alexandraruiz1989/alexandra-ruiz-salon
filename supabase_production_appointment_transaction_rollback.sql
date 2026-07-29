-- ROLLBACK CANDIDATO — revisión humana obligatoria antes de ejecutar.
-- Objetivo: deshabilitar escrituras transaccionales nuevas sin tocar citas,
-- clientas, servicios, pagos ni otros datos operativos.
-- Ejecutar solo si el SQL incremental de appointment transaction fue aplicado.

begin;

revoke execute on function public.create_appointment_transaction(
  text,
  uuid,
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
  jsonb,
  text,
  date,
  time without time zone,
  time without time zone,
  uuid,
  numeric,
  text,
  timestamptz,
  boolean,
  text
) from service_role;

drop function if exists public.create_appointment_transaction(
  text,
  uuid,
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
  jsonb,
  text,
  date,
  time without time zone,
  time without time zone,
  uuid,
  numeric,
  text,
  timestamptz,
  boolean,
  text
);

revoke all on table public.appointment_write_operations
  from public, anon, authenticated, service_role;

drop table if exists public.appointment_write_operations;

drop index if exists public.clients_phone_digits_idx;

notify pgrst, 'reload schema';

commit;
