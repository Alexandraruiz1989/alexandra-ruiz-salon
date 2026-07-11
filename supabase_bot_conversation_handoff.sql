-- Campos necesarios para gestionar conversaciones del bot en modo bandeja/humano.
-- Ejecutar en Supabase SQL Editor si estas columnas aún no existen.

alter table public.bot_conversations
  add column if not exists bot_enabled boolean default true,
  add column if not exists handoff_to_human boolean default false,
  add column if not exists assigned_to text,
  add column if not exists unread_count integer default 0,
  add column if not exists status text default 'bot',
  add column if not exists last_message_at timestamp with time zone,
  add column if not exists updated_at timestamp with time zone default now();

update public.bot_conversations
set
  bot_enabled = coalesce(bot_enabled, true),
  handoff_to_human = coalesce(handoff_to_human, false),
  unread_count = coalesce(unread_count, 0),
  status = coalesce(status, 'bot'),
  updated_at = coalesce(updated_at, now());

update public.bot_conversations
set status = 'human'
where bot_enabled = false
   or handoff_to_human = true
   or lower(coalesce(status, '')) = 'humano';

create index if not exists bot_conversations_last_message_at_idx
  on public.bot_conversations (last_message_at desc);

create index if not exists bot_messages_conversation_created_at_idx
  on public.bot_messages (conversation_id, created_at);

create or replace function public.bot_current_user_role()
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

create or replace function public.bot_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.bot_current_user_role() = 'admin', false)
$$;

grant usage on schema public to authenticated;
grant execute on function public.bot_current_user_role() to authenticated;
grant execute on function public.bot_user_is_admin() to authenticated;
grant select, update on public.bot_conversations to authenticated;

alter table public.bot_conversations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bot_conversations'
      and policyname = 'bot_conversations_select_admin'
  ) then
    execute 'create policy bot_conversations_select_admin
      on public.bot_conversations
      for select
      to authenticated
      using (public.bot_user_is_admin())';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bot_conversations'
      and policyname = 'bot_conversations_update_admin'
  ) then
    execute 'create policy bot_conversations_update_admin
      on public.bot_conversations
      for update
      to authenticated
      using (public.bot_user_is_admin())
      with check (public.bot_user_is_admin())';
  end if;
end $$;

alter policy bot_conversations_select_admin
  on public.bot_conversations
  using (public.bot_user_is_admin());

alter policy bot_conversations_update_admin
  on public.bot_conversations
  using (public.bot_user_is_admin())
  with check (public.bot_user_is_admin());

notify pgrst, 'reload schema';
