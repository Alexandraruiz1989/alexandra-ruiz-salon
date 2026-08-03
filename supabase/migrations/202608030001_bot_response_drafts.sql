BEGIN;

CREATE TABLE IF NOT EXISTS public.bot_response_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    inbound_message_id uuid NOT NULL,
    webhook_event_id uuid NULL,
    provider text NOT NULL,
    status text NOT NULL DEFAULT 'generated',
    body text NULL,
    requires_human_review boolean DEFAULT true NOT NULL,
    error_code text NULL,
    error_message text NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bot_response_drafts_pkey PRIMARY KEY (id),
    CONSTRAINT bot_response_drafts_provider_check
      CHECK (provider IN ('meta_whatsapp')),
    CONSTRAINT bot_response_drafts_status_check
      CHECK (status IN ('generated', 'failed', 'reviewed', 'rejected')),
    CONSTRAINT bot_response_drafts_body_required_check
      CHECK (
        (status = 'failed' AND body IS NULL)
        OR (
          status IN ('generated', 'reviewed', 'rejected')
          AND length(btrim(coalesce(body, ''))) > 0
        )
      ),
    CONSTRAINT bot_response_drafts_failed_error_code_check
      CHECK (
        status <> 'failed'
        OR length(btrim(coalesce(error_code, ''))) > 0
      ),
    CONSTRAINT bot_response_drafts_conversation_id_fkey
      FOREIGN KEY (conversation_id)
      REFERENCES public.bot_conversations(id)
      ON DELETE RESTRICT,
    CONSTRAINT bot_response_drafts_inbound_message_id_fkey
      FOREIGN KEY (inbound_message_id)
      REFERENCES public.bot_messages(id)
      ON DELETE RESTRICT,
    CONSTRAINT bot_response_drafts_webhook_event_id_fkey
      FOREIGN KEY (webhook_event_id)
      REFERENCES public.bot_webhook_events(id)
      ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS bot_response_drafts_inbound_message_id_unique
  ON public.bot_response_drafts (inbound_message_id);

CREATE INDEX IF NOT EXISTS bot_response_drafts_conversation_created_idx
  ON public.bot_response_drafts (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bot_response_drafts_status_created_idx
  ON public.bot_response_drafts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS bot_response_drafts_webhook_event_idx
  ON public.bot_response_drafts (webhook_event_id)
  WHERE webhook_event_id IS NOT NULL;

ALTER TABLE public.bot_response_drafts ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES
ON TABLE public.bot_response_drafts
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.bot_response_drafts
TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
