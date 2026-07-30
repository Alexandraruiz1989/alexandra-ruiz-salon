BEGIN;

CREATE TABLE IF NOT EXISTS public.bot_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    provider_event_id text NULL,
    provider_message_id text NULL,
    phone_number_id_hash text NULL,
    wa_id_hash text NULL,
    event_type text NOT NULL,
    payload_hash text NOT NULL,
    payload_redacted jsonb NULL,
    status text NOT NULL DEFAULT 'received',
    received_at timestamp with time zone NOT NULL DEFAULT now(),
    processed_at timestamp with time zone NULL,
    error_code text NULL,
    error_message text NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT bot_webhook_events_pkey PRIMARY KEY (id),
    CONSTRAINT bot_webhook_events_provider_check
      CHECK (provider IN ('meta_whatsapp')),
    CONSTRAINT bot_webhook_events_status_check
      CHECK (status IN ('received', 'duplicate', 'ignored', 'processed', 'failed')),
    CONSTRAINT bot_webhook_events_event_type_check
      CHECK (event_type IN ('message_inbound', 'message_status', 'event_without_messages', 'unknown'))
);

CREATE UNIQUE INDEX IF NOT EXISTS bot_webhook_events_provider_event_id_unique
  ON public.bot_webhook_events (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bot_webhook_events_provider_message_id_unique
  ON public.bot_webhook_events (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bot_webhook_events_provider_payload_hash_unique
  ON public.bot_webhook_events (provider, payload_hash)
  WHERE provider_event_id IS NULL AND provider_message_id IS NULL;

CREATE INDEX IF NOT EXISTS bot_webhook_events_status_idx
  ON public.bot_webhook_events (status, received_at DESC);

CREATE INDEX IF NOT EXISTS bot_webhook_events_received_at_idx
  ON public.bot_webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS bot_webhook_events_event_type_idx
  ON public.bot_webhook_events (event_type, received_at DESC);

ALTER TABLE public.bot_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES
ON TABLE public.bot_webhook_events
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.bot_webhook_events
TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

