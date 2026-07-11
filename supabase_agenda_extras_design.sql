-- Correcciones seguras para extras e imagen de diseño en Agenda.
-- Ejecutar en Supabase SQL Editor. No borra tablas ni datos existentes.

alter table public.appointments
  add column if not exists design_image_url text;

create table if not exists public.appointment_extra_items (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  extra_id uuid null,
  staff_id uuid null,
  name text not null,
  quantity numeric default 1,
  unit_price numeric default 0,
  total_price numeric default 0,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.appointment_extra_items
  add column if not exists appointment_id uuid,
  add column if not exists extra_id uuid null,
  add column if not exists staff_id uuid null,
  add column if not exists name text,
  add column if not exists quantity numeric default 1,
  add column if not exists unit_price numeric default 0,
  add column if not exists total_price numeric default 0,
  add column if not exists notes text,
  add column if not exists created_at timestamp with time zone default now(),
  add column if not exists updated_at timestamp with time zone default now();

create index if not exists appointment_extra_items_appointment_idx
  on public.appointment_extra_items(appointment_id);

create index if not exists appointment_extra_items_extra_idx
  on public.appointment_extra_items(extra_id);

grant usage on schema public to authenticated;
grant select on public.appointments to authenticated;
grant update (design_image_url) on public.appointments to authenticated;
grant select, insert, update, delete on public.appointment_extra_items to authenticated;

create or replace function public.agenda_current_user_role()
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

create or replace function public.agenda_user_has_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.agenda_current_user_role() = any(allowed_roles), false)
$$;

grant execute on function public.agenda_current_user_role() to authenticated;
grant execute on function public.agenda_user_has_role(text[]) to authenticated;

alter table public.appointment_extra_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'appointment_extra_items'
      and policyname = 'appointment_extra_items_select_agenda_roles'
  ) then
    execute 'create policy appointment_extra_items_select_agenda_roles
      on public.appointment_extra_items
      for select
      to authenticated
      using (public.agenda_user_has_role(array[''admin'', ''encargada'', ''caja'', ''tecnica'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'appointment_extra_items'
      and policyname = 'appointment_extra_items_insert_admin_encargada'
  ) then
    execute 'create policy appointment_extra_items_insert_admin_encargada
      on public.appointment_extra_items
      for insert
      to authenticated
      with check (public.agenda_user_has_role(array[''admin'', ''encargada'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'appointment_extra_items'
      and policyname = 'appointment_extra_items_update_admin_encargada'
  ) then
    execute 'create policy appointment_extra_items_update_admin_encargada
      on public.appointment_extra_items
      for update
      to authenticated
      using (public.agenda_user_has_role(array[''admin'', ''encargada'']))
      with check (public.agenda_user_has_role(array[''admin'', ''encargada'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'appointment_extra_items'
      and policyname = 'appointment_extra_items_delete_admin_encargada'
  ) then
    execute 'create policy appointment_extra_items_delete_admin_encargada
      on public.appointment_extra_items
      for delete
      to authenticated
      using (public.agenda_user_has_role(array[''admin'', ''encargada'']))';
  end if;
end $$;

alter policy appointment_extra_items_select_agenda_roles
  on public.appointment_extra_items
  using (public.agenda_user_has_role(array['admin', 'encargada', 'caja', 'tecnica']));

alter policy appointment_extra_items_insert_admin_encargada
  on public.appointment_extra_items
  with check (public.agenda_user_has_role(array['admin', 'encargada']));

alter policy appointment_extra_items_update_admin_encargada
  on public.appointment_extra_items
  using (public.agenda_user_has_role(array['admin', 'encargada']))
  with check (public.agenda_user_has_role(array['admin', 'encargada']));

alter policy appointment_extra_items_delete_admin_encargada
  on public.appointment_extra_items
  using (public.agenda_user_has_role(array['admin', 'encargada']));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'appointment-designs',
  'appointment-designs',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'appointment_designs_public_select'
  ) then
    execute 'create policy appointment_designs_public_select
      on storage.objects
      for select
      using (bucket_id = ''appointment-designs'')';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'appointment_designs_insert_admin_encargada'
  ) then
    execute 'create policy appointment_designs_insert_admin_encargada
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = ''appointment-designs''
        and public.agenda_user_has_role(array[''admin'', ''encargada''])
      )';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'appointment_designs_update_admin_encargada'
  ) then
    execute 'create policy appointment_designs_update_admin_encargada
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = ''appointment-designs''
        and public.agenda_user_has_role(array[''admin'', ''encargada''])
      )
      with check (
        bucket_id = ''appointment-designs''
        and public.agenda_user_has_role(array[''admin'', ''encargada''])
      )';
  end if;
end $$;

notify pgrst, 'reload schema';
