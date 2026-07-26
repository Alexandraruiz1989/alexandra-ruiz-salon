-- Derived from .local-schema-source/source-schema-only.sql (pg_dump --schema-only).
-- Contains no exported rows or production data.
-- Cat?logo de servicios, extras, recursos y asignaciones.
-- Dependencies: Supabase Local managed schemas/roles plus previous migrations in this folder.

BEGIN;

CREATE TABLE public.promotions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    promo_price numeric(10,2) DEFAULT 0 NOT NULL,
    valid_from date,
    valid_to date,
    active boolean DEFAULT true,
    included_services jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    quantity integer DEFAULT 1,
    active boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.service_extras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'Decoración'::text,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    pricing_type text DEFAULT 'fixed'::text NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    notes text
);

CREATE TABLE public.service_resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid NOT NULL,
    resource_id uuid NOT NULL,
    quantity_required integer DEFAULT 1,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    name text NOT NULL,
    base_price numeric(10,2) DEFAULT 0 NOT NULL,
    duration_minutes integer DEFAULT 60,
    active boolean DEFAULT true,
    commission_type text DEFAULT 'percentage'::text,
    commission_value numeric(10,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    description text,
    cleanup_minutes integer DEFAULT 0,
    service_type text DEFAULT 'servicio'::text,
    variable_pricing boolean DEFAULT false,
    pricing_notes text,
    bot_description text,
    bot_keywords text,
    bot_active boolean DEFAULT true,
    bot_service_group text,
    bot_bookable boolean DEFAULT true
);

CREATE TABLE public.staff_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    service_id uuid NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

COMMIT;
