-- Servicios por técnica y recursos/mobiliario para Agenda.
-- Seguro para ejecutar varias veces en Supabase SQL Editor.
-- No borra tablas ni elimina datos existentes.

create extension if not exists pgcrypto;

create table if not exists public.staff_services (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.staff_services
  add column if not exists staff_id uuid,
  add column if not exists service_id uuid,
  add column if not exists active boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists staff_services_staff_service_unique
  on public.staff_services(staff_id, service_id);

create index if not exists staff_services_staff_active_idx
  on public.staff_services(staff_id, active);

create index if not exists staff_services_service_active_idx
  on public.staff_services(service_id, active);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quantity integer default 1,
  active boolean default true,
  notes text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.resources
  add column if not exists name text,
  add column if not exists quantity integer default 1,
  add column if not exists active boolean default true,
  add column if not exists notes text null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists resources_active_idx
  on public.resources(active, name);

create table if not exists public.service_resources (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  quantity_required integer default 1,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.service_resources
  add column if not exists service_id uuid,
  add column if not exists resource_id uuid,
  add column if not exists quantity_required integer default 1,
  add column if not exists active boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists service_resources_service_resource_unique
  on public.service_resources(service_id, resource_id);

create index if not exists service_resources_service_active_idx
  on public.service_resources(service_id, active);

create index if not exists service_resources_resource_active_idx
  on public.service_resources(resource_id, active);

alter table public.notifications
  add column if not exists recipient_auth_user_id uuid null,
  add column if not exists recipient_email text null,
  add column if not exists created_by_auth_user_id uuid null,
  add column if not exists created_by_email text null;

create index if not exists notifications_recipient_auth_user_idx
  on public.notifications(recipient_auth_user_id, is_read, created_at desc);

create index if not exists notifications_recipient_email_idx
  on public.notifications(lower(recipient_email), is_read, created_at desc);

create or replace function public.salon_current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(up.role, ''))
  from public.user_profiles up
  where (
      up.auth_user_id = auth.uid()
      or lower(up.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    and coalesce(up.active, true) = true
  limit 1
$$;

create or replace function public.salon_user_has_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.salon_current_user_role() = any(allowed_roles), false)
$$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.staff_services to authenticated;
grant select, insert, update, delete on public.resources to authenticated;
grant select, insert, update, delete on public.service_resources to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;
grant all on public.staff_services to service_role;
grant all on public.resources to service_role;
grant all on public.service_resources to service_role;
grant all on public.notifications to service_role;
grant execute on function public.salon_current_user_role() to authenticated;
grant execute on function public.salon_user_has_role(text[]) to authenticated;

alter table public.staff_services enable row level security;
alter table public.resources enable row level security;
alter table public.service_resources enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'staff_services'
      and policyname = 'staff_services_select_agenda_roles'
  ) then
    execute 'create policy staff_services_select_agenda_roles
      on public.staff_services
      for select
      to authenticated
      using (public.salon_user_has_role(array[''admin'', ''encargada'', ''caja'', ''tecnica'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'staff_services'
      and policyname = 'staff_services_manage_admin_encargada'
  ) then
    execute 'create policy staff_services_manage_admin_encargada
      on public.staff_services
      for all
      to authenticated
      using (public.salon_user_has_role(array[''admin'', ''encargada'']))
      with check (public.salon_user_has_role(array[''admin'', ''encargada'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'resources'
      and policyname = 'resources_select_agenda_roles'
  ) then
    execute 'create policy resources_select_agenda_roles
      on public.resources
      for select
      to authenticated
      using (public.salon_user_has_role(array[''admin'', ''encargada'', ''caja'', ''tecnica'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'resources'
      and policyname = 'resources_manage_admin_encargada'
  ) then
    execute 'create policy resources_manage_admin_encargada
      on public.resources
      for all
      to authenticated
      using (public.salon_user_has_role(array[''admin'', ''encargada'']))
      with check (public.salon_user_has_role(array[''admin'', ''encargada'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'service_resources'
      and policyname = 'service_resources_select_agenda_roles'
  ) then
    execute 'create policy service_resources_select_agenda_roles
      on public.service_resources
      for select
      to authenticated
      using (public.salon_user_has_role(array[''admin'', ''encargada'', ''caja'', ''tecnica'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'service_resources'
      and policyname = 'service_resources_manage_admin_encargada'
  ) then
    execute 'create policy service_resources_manage_admin_encargada
      on public.service_resources
      for all
      to authenticated
      using (public.salon_user_has_role(array[''admin'', ''encargada'']))
      with check (public.salon_user_has_role(array[''admin'', ''encargada'']))';
  end if;
end $$;

alter policy staff_services_select_agenda_roles
  on public.staff_services
  using (public.salon_user_has_role(array['admin', 'encargada', 'caja', 'tecnica']));

alter policy staff_services_manage_admin_encargada
  on public.staff_services
  using (public.salon_user_has_role(array['admin', 'encargada']))
  with check (public.salon_user_has_role(array['admin', 'encargada']));

alter policy resources_select_agenda_roles
  on public.resources
  using (public.salon_user_has_role(array['admin', 'encargada', 'caja', 'tecnica']));

alter policy resources_manage_admin_encargada
  on public.resources
  using (public.salon_user_has_role(array['admin', 'encargada']))
  with check (public.salon_user_has_role(array['admin', 'encargada']));

alter policy service_resources_select_agenda_roles
  on public.service_resources
  using (public.salon_user_has_role(array['admin', 'encargada', 'caja', 'tecnica']));

alter policy service_resources_manage_admin_encargada
  on public.service_resources
  using (public.salon_user_has_role(array['admin', 'encargada']))
  with check (public.salon_user_has_role(array['admin', 'encargada']));

notify pgrst, 'reload schema';
