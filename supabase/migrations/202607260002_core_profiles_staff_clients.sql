-- Derived from .local-schema-source/source-schema-only.sql (pg_dump --schema-only).
-- Contains no exported rows or production data.
-- Perfiles, configuraci?n del negocio, clientas y personal.
-- Dependencies: Supabase Local managed schemas/roles plus previous migrations in this folder.

BEGIN;

CREATE TABLE public.business_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_name text DEFAULT 'Alexandra Ruiz Salón Spa'::text,
    whatsapp_phone text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    phone text NOT NULL,
    email text,
    birthday date,
    gender text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    client_number text,
    auth_user_id uuid
);

CREATE TABLE public.staff (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    email text,
    phone text,
    role text DEFAULT 'tecnica'::text,
    active boolean DEFAULT true,
    work_days jsonb DEFAULT '[]'::jsonb,
    work_schedule jsonb DEFAULT '{}'::jsonb,
    break_schedule jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    auth_user_id uuid,
    color text,
    notes text,
    birthday date,
    hire_date date,
    vacation_days_adjustment numeric DEFAULT 0,
    vacation_notes text,
    commission_percentage numeric DEFAULT 0,
    commission_notes text,
    service_commission_percentage numeric DEFAULT 0,
    product_commission_percentage numeric DEFAULT 0,
    product_commission_notes text,
    photo_url text,
    google_calendar_email text
);

CREATE TABLE public.staff_payroll_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid,
    weekly_salary numeric(10,2) DEFAULT 0,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.user_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid,
    email text NOT NULL,
    full_name text,
    role text DEFAULT 'tecnica'::text NOT NULL,
    staff_id uuid,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

COMMIT;
