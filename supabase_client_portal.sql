-- Portal de clientas para Alexandra Ruiz Salón
-- Seguro para ejecutar varias veces en Supabase SQL Editor.
-- No borra tablas ni elimina datos existentes.

alter table public.clients
  add column if not exists auth_user_id uuid null,
  add column if not exists client_number text null,
  add column if not exists email text null,
  add column if not exists phone text null,
  add column if not exists full_name text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists clients_auth_user_id_unique
  on public.clients(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists clients_client_number_unique
  on public.clients(client_number)
  where client_number is not null;

create index if not exists clients_email_lower_idx
  on public.clients(lower(email))
  where email is not null;

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

alter table public.appointments
  add column if not exists booking_source text default 'admin',
  add column if not exists confirmation_status text default 'pendiente',
  add column if not exists attendance_status text default 'pendiente',
  add column if not exists client_visible_notes text null,
  add column if not exists estimated_total numeric default 0,
  add column if not exists deposit_amount numeric default 0,
  add column if not exists notes text null,
  add column if not exists updated_at timestamptz default now();

update public.appointments
set booking_source = 'admin'
where booking_source is null;

update public.appointments
set confirmation_status = coalesce(attendance_status, 'pendiente')
where confirmation_status is null;

update public.appointments
set attendance_status = 'pendiente'
where attendance_status is null;

create index if not exists appointments_client_date_idx
  on public.appointments(client_id, appointment_date desc, start_time desc);

create index if not exists appointments_portal_pending_idx
  on public.appointments(booking_source, confirmation_status, appointment_date desc);

alter table public.notifications
  add column if not exists recipient_auth_user_id uuid null,
  add column if not exists recipient_email text null,
  add column if not exists created_by_auth_user_id uuid null,
  add column if not exists created_by_email text null;

create index if not exists notifications_recipient_auth_user_idx
  on public.notifications(recipient_auth_user_id, is_read, created_at desc);

create index if not exists notifications_recipient_email_idx
  on public.notifications(lower(recipient_email), is_read, created_at desc);

create or replace function public.client_portal_has_role(allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and coalesce(up.active, true) = true
      and lower(up.role) = any(allowed_roles)
  );
$$;

grant execute on function public.client_portal_has_role(text[]) to authenticated;

grant select on public.services to authenticated;
grant select on public.staff to authenticated;
grant select on public.staff_schedules to authenticated;
grant select on public.staff_services to authenticated;
grant select on public.resources to authenticated;
grant select on public.service_resources to authenticated;
grant select on public.staff_time_blocks to authenticated;
grant select, insert, update on public.clients to authenticated;
grant select, insert, update, delete on public.appointments to authenticated;
grant select, insert, update, delete on public.appointment_services to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;
grant usage, select on sequence public.clients_client_number_seq to authenticated;
grant execute on function public.assign_client_number() to authenticated;

grant all on public.clients to service_role;
grant all on public.appointments to service_role;
grant all on public.appointment_services to service_role;
grant all on public.notifications to service_role;
grant usage, select on sequence public.clients_client_number_seq to service_role;

-- Nota:
-- El portal usa APIs server-side con service role y valida la sesión de la clienta.
-- No se fuerza ENABLE ROW LEVEL SECURITY aquí para no romper páginas públicas
-- existentes del sistema, como recibos o calificaciones. Las políticas quedan
-- creadas para proyectos donde RLS ya esté activo o se active de forma controlada.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'clients'
      and policyname = 'client_portal_clients_select_own_or_staff'
  ) then
    execute 'create policy client_portal_clients_select_own_or_staff
      on public.clients
      for select
      using (
        auth_user_id = auth.uid()
        or public.client_portal_has_role(array[''admin'', ''encargada'', ''caja'', ''tecnica''])
      )';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'clients'
      and policyname = 'client_portal_clients_manage_staff'
  ) then
    execute 'create policy client_portal_clients_manage_staff
      on public.clients
      for all
      using (public.client_portal_has_role(array[''admin'', ''encargada'', ''caja'', ''tecnica'']))
      with check (public.client_portal_has_role(array[''admin'', ''encargada'', ''caja'', ''tecnica'']))';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'appointments'
      and policyname = 'client_portal_appointments_select_own_or_staff'
  ) then
    execute 'create policy client_portal_appointments_select_own_or_staff
      on public.appointments
      for select
      using (
        exists (
          select 1
          from public.clients c
          where c.id = appointments.client_id
            and c.auth_user_id = auth.uid()
        )
        or public.client_portal_has_role(array[''admin'', ''encargada'', ''caja'', ''tecnica''])
      )';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'appointments'
      and policyname = 'client_portal_appointments_manage_staff'
  ) then
    execute 'create policy client_portal_appointments_manage_staff
      on public.appointments
      for all
      using (public.client_portal_has_role(array[''admin'', ''encargada'', ''caja'', ''tecnica'']))
      with check (public.client_portal_has_role(array[''admin'', ''encargada'', ''caja'', ''tecnica'']))';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'appointment_services'
      and policyname = 'client_portal_appointment_services_select_own_or_staff'
  ) then
    execute 'create policy client_portal_appointment_services_select_own_or_staff
      on public.appointment_services
      for select
      using (
        exists (
          select 1
          from public.appointments a
          join public.clients c on c.id = a.client_id
          where a.id = appointment_services.appointment_id
            and c.auth_user_id = auth.uid()
        )
        or public.client_portal_has_role(array[''admin'', ''encargada'', ''caja'', ''tecnica''])
      )';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'appointment_services'
      and policyname = 'client_portal_appointment_services_manage_staff'
  ) then
    execute 'create policy client_portal_appointment_services_manage_staff
      on public.appointment_services
      for all
      using (public.client_portal_has_role(array[''admin'', ''encargada'', ''caja'', ''tecnica'']))
      with check (public.client_portal_has_role(array[''admin'', ''encargada'', ''caja'', ''tecnica'']))';
  end if;
end $$;

alter policy client_portal_clients_select_own_or_staff
  on public.clients
  using (
    auth_user_id = auth.uid()
    or public.client_portal_has_role(array['admin', 'encargada', 'caja', 'tecnica'])
  );

alter policy client_portal_clients_manage_staff
  on public.clients
  using (public.client_portal_has_role(array['admin', 'encargada', 'caja', 'tecnica']))
  with check (public.client_portal_has_role(array['admin', 'encargada', 'caja', 'tecnica']));

alter policy client_portal_appointments_select_own_or_staff
  on public.appointments
  using (
    exists (
      select 1
      from public.clients c
      where c.id = appointments.client_id
        and c.auth_user_id = auth.uid()
    )
    or public.client_portal_has_role(array['admin', 'encargada', 'caja', 'tecnica'])
  );

alter policy client_portal_appointments_manage_staff
  on public.appointments
  using (public.client_portal_has_role(array['admin', 'encargada', 'caja', 'tecnica']))
  with check (public.client_portal_has_role(array['admin', 'encargada', 'caja', 'tecnica']));

alter policy client_portal_appointment_services_select_own_or_staff
  on public.appointment_services
  using (
    exists (
      select 1
      from public.appointments a
      join public.clients c on c.id = a.client_id
      where a.id = appointment_services.appointment_id
        and c.auth_user_id = auth.uid()
    )
    or public.client_portal_has_role(array['admin', 'encargada', 'caja', 'tecnica'])
  );

alter policy client_portal_appointment_services_manage_staff
  on public.appointment_services
  using (public.client_portal_has_role(array['admin', 'encargada', 'caja', 'tecnica']))
  with check (public.client_portal_has_role(array['admin', 'encargada', 'caja', 'tecnica']));
