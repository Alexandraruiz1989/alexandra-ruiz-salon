-- Derived from .local-schema-source/source-schema-only.sql (pg_dump --schema-only).
-- Contains no exported rows or production data.
-- Horarios, descansos, bloqueos y vacaciones.
-- Dependencies: Supabase Local managed schemas/roles plus previous migrations in this folder.

BEGIN;

CREATE TABLE public.schedule_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid,
    block_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    block_type text NOT NULL,
    reason text,
    force_allowed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.staff_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_day_off boolean DEFAULT false,
    has_break boolean DEFAULT false,
    break_start time without time zone,
    break_end time without time zone
);

CREATE TABLE public.staff_time_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    block_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    block_type text DEFAULT 'bloqueo'::text,
    title text DEFAULT 'Bloqueo'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_all_day boolean DEFAULT false,
    source_type text,
    source_id uuid
);

CREATE TABLE public.staff_vacations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    days_taken numeric DEFAULT 1 NOT NULL,
    status text DEFAULT 'tomada'::text,
    reason text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    event_type text DEFAULT 'vacaciones'::text,
    affects_vacation_balance boolean DEFAULT true,
    minutes_late integer DEFAULT 0,
    discount_amount numeric DEFAULT 0
);

CREATE TABLE public.vacation_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    years_from integer NOT NULL,
    years_to integer,
    days_entitled numeric NOT NULL,
    country text DEFAULT 'México'::text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

COMMIT;
