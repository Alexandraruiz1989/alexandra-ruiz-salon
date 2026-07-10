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

create index if not exists bot_conversations_last_message_at_idx
  on public.bot_conversations (last_message_at desc);

create index if not exists bot_messages_conversation_created_at_idx
  on public.bot_messages (conversation_id, created_at);
