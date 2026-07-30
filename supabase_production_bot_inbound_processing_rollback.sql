BEGIN;

-- Rollback estructural para esta fase.
--
-- Usar solo antes de almacenar mensajes reales con
-- BOT_INBOUND_PROCESSING_ENABLED=true.
--
-- Después de una prueba real, el rollback seguro recomendado es:
-- 1. apagar BOT_WEBHOOK_RECEIVE_ENABLED;
-- 2. apagar BOT_INBOUND_PROCESSING_ENABLED;
-- 3. volver al código anterior;
-- 4. conservar columnas y datos para no perder trazabilidad histórica.

DROP INDEX IF EXISTS public.bot_messages_provider_received_idx;
DROP INDEX IF EXISTS public.bot_messages_provider_message_id_unique;
DROP INDEX IF EXISTS public.bot_conversations_provider_last_inbound_idx;
DROP INDEX IF EXISTS public.bot_conversations_provider_conversation_key_unique;

ALTER TABLE public.bot_messages
  DROP CONSTRAINT IF EXISTS bot_messages_provider_check,
  DROP COLUMN IF EXISTS requires_human_review,
  DROP COLUMN IF EXISTS received_at,
  DROP COLUMN IF EXISTS delivery_status,
  DROP COLUMN IF EXISTS provider_message_id,
  DROP COLUMN IF EXISTS provider;

ALTER TABLE public.bot_conversations
  DROP CONSTRAINT IF EXISTS bot_conversations_provider_check,
  DROP COLUMN IF EXISTS requires_human_review,
  DROP COLUMN IF EXISTS last_inbound_at,
  DROP COLUMN IF EXISTS wa_id_hash,
  DROP COLUMN IF EXISTS provider_conversation_key,
  DROP COLUMN IF EXISTS provider;

NOTIFY pgrst, 'reload schema';

COMMIT;
