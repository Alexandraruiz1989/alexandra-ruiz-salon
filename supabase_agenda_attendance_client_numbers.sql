-- Mejoras de Agenda / Clientas para Alexandra Ruiz Salón
-- Seguro para ejecutar varias veces en Supabase SQL Editor.
-- No borra tablas ni elimina datos existentes.

alter table public.appointments
  add column if not exists attendance_status text default 'pendiente',
  add column if not exists attendance_source text null,
  add column if not exists attendance_notes text null,
  add column if not exists arrived_late_minutes integer null,
  add column if not exists cancelled_at timestamptz null,
  add column if not exists no_show_at timestamptz null,
  add column if not exists confirmed_at timestamptz null;

update public.appointments
set attendance_status = 'pendiente'
where attendance_status is null;

alter table public.clients
  add column if not exists client_number text null;

create unique index if not exists clients_client_number_unique
  on public.clients (client_number)
  where client_number is not null;

create sequence if not exists public.clients_client_number_seq;

with existing_max as (
  select coalesce(
    max(nullif(regexp_replace(client_number, '\D', '', 'g'), '')::bigint),
    0
  ) as max_number
  from public.clients
),
numbered_clients as (
  select
    id,
    row_number() over (order by created_at asc nulls last, id asc)
      + (select max_number from existing_max) as next_number
  from public.clients
  where client_number is null
)
update public.clients as clients
set client_number = 'CL-' || lpad(numbered_clients.next_number::text, 4, '0')
from numbered_clients
where clients.id = numbered_clients.id;

do $$
declare
  max_number bigint;
begin
  select coalesce(
    max(nullif(regexp_replace(client_number, '\D', '', 'g'), '')::bigint),
    0
  )
  into max_number
  from public.clients;

  if max_number < 1 then
    perform setval('public.clients_client_number_seq', 1, false);
  else
    perform setval('public.clients_client_number_seq', max_number, true);
  end if;
end $$;

create or replace function public.assign_client_number()
returns trigger
language plpgsql
as $$
declare
  next_number bigint;
begin
  if new.client_number is null or trim(new.client_number) = '' then
    next_number := nextval('public.clients_client_number_seq');
    new.client_number := 'CL-' || lpad(next_number::text, 4, '0');
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_clients_client_number'
  ) then
    create trigger set_clients_client_number
    before insert on public.clients
    for each row
    execute function public.assign_client_number();
  end if;
end $$;

alter table public.staff_time_blocks
  add column if not exists is_all_day boolean default false,
  add column if not exists source_type text null,
  add column if not exists source_id uuid null;

create index if not exists staff_time_blocks_source_idx
  on public.staff_time_blocks (source_type, source_id);

create index if not exists staff_time_blocks_staff_date_idx
  on public.staff_time_blocks (staff_id, block_date, start_time, end_time);

alter table public.staff
  add column if not exists photo_url text null,
  add column if not exists google_calendar_email text null;

create index if not exists notifications_staff_unread_idx
  on public.notifications (staff_id, is_read, created_at desc);

grant select, insert, update, delete on public.staff_time_blocks to authenticated;
grant select, update on public.appointments to authenticated;
grant select, insert, update on public.clients to authenticated;
grant select, update on public.staff to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;
grant usage, select on sequence public.clients_client_number_seq to authenticated;
grant execute on function public.assign_client_number() to authenticated;
