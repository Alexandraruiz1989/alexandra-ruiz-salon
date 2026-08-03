BEGIN;

DROP TABLE IF EXISTS public.bot_response_drafts;

NOTIFY pgrst, 'reload schema';

COMMIT;
