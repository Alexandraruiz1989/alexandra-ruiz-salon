BEGIN;

DROP TABLE IF EXISTS public.bot_webhook_events;

NOTIFY pgrst, 'reload schema';

COMMIT;

