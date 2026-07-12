-- Notificaciones push para Alexandra Ruiz Salón.
-- Seguro para ejecutar varias veces en Supabase SQL Editor.
-- No borra tablas ni elimina datos existentes.

create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid null,
  user_email text null,
  staff_id uuid null references public.staff(id) on delete set null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text null,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.push_subscriptions
  add column if not exists auth_user_id uuid null,
  add column if not exists user_email text null,
  add column if not exists staff_id uuid null,
  add column if not exists endpoint text,
  add column if not exists p256dh text,
  add column if not exists auth text,
  add column if not exists user_agent text null,
  add column if not exists active boolean default true,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.push_subscriptions
  alter column active set default true,
  alter column created_at set default now(),
  alter column updated_at set default now();

update public.push_subscriptions
set active = true
where active is null;

create unique index if not exists push_subscriptions_endpoint_unique
  on public.push_subscriptions(endpoint);

create index if not exists push_subscriptions_auth_user_active_idx
  on public.push_subscriptions(auth_user_id, active);

create index if not exists push_subscriptions_staff_active_idx
  on public.push_subscriptions(staff_id, active);

create index if not exists push_subscriptions_user_email_active_idx
  on public.push_subscriptions(lower(user_email), active);

create or replace function public.set_push_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_push_subscriptions_updated_at'
  ) then
    create trigger set_push_subscriptions_updated_at
    before update on public.push_subscriptions
    for each row
    execute function public.set_push_subscriptions_updated_at();
  end if;
end $$;

create or replace function public.push_current_user_role()
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

create or replace function public.push_user_has_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.push_current_user_role() = any(allowed_roles), false)
$$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant execute on function public.set_push_subscriptions_updated_at() to authenticated;
grant execute on function public.push_current_user_role() to authenticated;
grant execute on function public.push_user_has_role(text[]) to authenticated;

alter table public.push_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'push_subscriptions'
      and policyname = 'push_subscriptions_select_own_or_admin'
  ) then
    execute 'create policy push_subscriptions_select_own_or_admin
      on public.push_subscriptions
      for select
      to authenticated
      using (
        auth_user_id = auth.uid()
        or lower(user_email) = lower(coalesce(auth.jwt() ->> ''email'', ''''))
        or public.push_user_has_role(array[''admin'', ''encargada''])
      )';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'push_subscriptions'
      and policyname = 'push_subscriptions_insert_own'
  ) then
    execute 'create policy push_subscriptions_insert_own
      on public.push_subscriptions
      for insert
      to authenticated
      with check (
        auth_user_id = auth.uid()
        or lower(user_email) = lower(coalesce(auth.jwt() ->> ''email'', ''''))
        or public.push_user_has_role(array[''admin'', ''encargada''])
      )';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'push_subscriptions'
      and policyname = 'push_subscriptions_update_own_or_admin'
  ) then
    execute 'create policy push_subscriptions_update_own_or_admin
      on public.push_subscriptions
      for update
      to authenticated
      using (
        auth_user_id = auth.uid()
        or lower(user_email) = lower(coalesce(auth.jwt() ->> ''email'', ''''))
        or public.push_user_has_role(array[''admin'', ''encargada''])
      )
      with check (
        auth_user_id = auth.uid()
        or lower(user_email) = lower(coalesce(auth.jwt() ->> ''email'', ''''))
        or public.push_user_has_role(array[''admin'', ''encargada''])
      )';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'push_subscriptions'
      and policyname = 'push_subscriptions_delete_own_or_admin'
  ) then
    execute 'create policy push_subscriptions_delete_own_or_admin
      on public.push_subscriptions
      for delete
      to authenticated
      using (
        auth_user_id = auth.uid()
        or lower(user_email) = lower(coalesce(auth.jwt() ->> ''email'', ''''))
        or public.push_user_has_role(array[''admin'', ''encargada''])
      )';
  end if;
end $$;

alter policy push_subscriptions_select_own_or_admin
  on public.push_subscriptions
  using (
    auth_user_id = auth.uid()
    or lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.push_user_has_role(array['admin', 'encargada'])
  );

alter policy push_subscriptions_insert_own
  on public.push_subscriptions
  with check (
    auth_user_id = auth.uid()
    or lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.push_user_has_role(array['admin', 'encargada'])
  );

alter policy push_subscriptions_update_own_or_admin
  on public.push_subscriptions
  using (
    auth_user_id = auth.uid()
    or lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.push_user_has_role(array['admin', 'encargada'])
  )
  with check (
    auth_user_id = auth.uid()
    or lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.push_user_has_role(array['admin', 'encargada'])
  );

alter policy push_subscriptions_delete_own_or_admin
  on public.push_subscriptions
  using (
    auth_user_id = auth.uid()
    or lower(user_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.push_user_has_role(array['admin', 'encargada'])
  );

notify pgrst, 'reload schema';
