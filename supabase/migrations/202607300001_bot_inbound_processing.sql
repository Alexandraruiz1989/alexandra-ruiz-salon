BEGIN;

ALTER TABLE public.bot_conversations
  ADD COLUMN IF NOT EXISTS provider text NULL,
  ADD COLUMN IF NOT EXISTS provider_conversation_key text NULL,
  ADD COLUMN IF NOT EXISTS wa_id_hash text NULL,
  ADD COLUMN IF NOT EXISTS last_inbound_at timestamp with time zone NULL,
  ADD COLUMN IF NOT EXISTS requires_human_review boolean DEFAULT false;

ALTER TABLE public.bot_messages
  ADD COLUMN IF NOT EXISTS provider text NULL,
  ADD COLUMN IF NOT EXISTS provider_message_id text NULL,
  ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS received_at timestamp with time zone NULL,
  ADD COLUMN IF NOT EXISTS requires_human_review boolean DEFAULT false;

UPDATE public.bot_conversations
SET requires_human_review = false
WHERE requires_human_review IS NULL;

UPDATE public.bot_messages
SET requires_human_review = false
WHERE requires_human_review IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bot_conversations_provider_conversation_key_unique
  ON public.bot_conversations (provider, provider_conversation_key)
  WHERE provider IS NOT NULL
    AND provider_conversation_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bot_messages_provider_message_id_unique
  ON public.bot_messages (provider, provider_message_id)
  WHERE provider IS NOT NULL
    AND provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bot_conversations_provider_last_inbound_idx
  ON public.bot_conversations (provider, last_inbound_at DESC)
  WHERE provider IS NOT NULL;

CREATE INDEX IF NOT EXISTS bot_messages_provider_received_idx
  ON public.bot_messages (provider, received_at DESC)
  WHERE provider IS NOT NULL;

ALTER TABLE public.bot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES
ON TABLE public.bot_conversations, public.bot_messages
FROM anon;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.bot_conversations, public.bot_messages
TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
