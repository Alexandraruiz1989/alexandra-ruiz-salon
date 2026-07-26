-- Derived from .local-schema-source/source-schema-only.sql (pg_dump --schema-only).
-- Contains no exported rows or production data.
-- Citas, relaciones, extras de cita y rese?as.
-- Dependencies: Supabase Local managed schemas/roles plus previous migrations in this folder.

BEGIN;

CREATE TABLE public.appointment_extra_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id uuid NOT NULL,
    extra_id uuid,
    name text NOT NULL,
    quantity numeric DEFAULT 1,
    unit_price numeric DEFAULT 0,
    total_price numeric DEFAULT 0,
    staff_id uuid,
    notes text,
    order_index integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.appointment_followups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id uuid,
    client_id uuid,
    service_id uuid,
    staff_id uuid,
    followup_type text DEFAULT 'reagendar'::text NOT NULL,
    followup_date date NOT NULL,
    followup_status text DEFAULT 'pendiente'::text NOT NULL,
    message_body text,
    sent_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.appointment_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id uuid,
    client_id uuid,
    salon_rating integer,
    overall_comment text,
    would_return boolean,
    public_testimonial boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT appointment_reviews_salon_rating_check CHECK (((salon_rating >= 1) AND (salon_rating <= 5)))
);

CREATE TABLE public.appointment_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id uuid,
    service_id uuid,
    promotion_id uuid,
    custom_name text,
    quantity integer DEFAULT 1,
    unit_price numeric(10,2) DEFAULT 0,
    total_price numeric(10,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    staff_id uuid,
    start_time time without time zone,
    end_time time without time zone,
    duration_minutes integer DEFAULT 60,
    service_date date,
    status text DEFAULT 'agendado'::text,
    notes text,
    cleanup_minutes integer DEFAULT 0,
    price numeric DEFAULT 0
);

CREATE TABLE public.appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    staff_id uuid,
    appointment_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone,
    status text DEFAULT 'pendiente'::text,
    estimated_total numeric(10,2) DEFAULT 0,
    deposit_amount numeric(10,2) DEFAULT 0,
    deposit_payment_method text,
    force_created boolean DEFAULT false,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    design_image_url text,
    design_image_path text,
    design_image_name text,
    attendance_status text DEFAULT 'pendiente'::text,
    attendance_source text,
    attendance_notes text,
    arrived_late_minutes integer,
    cancelled_at timestamp with time zone,
    no_show_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    booking_source text DEFAULT 'admin'::text,
    confirmation_status text DEFAULT 'pendiente'::text,
    client_visible_notes text
);

CREATE TABLE public.review_service_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    review_id uuid,
    service_id uuid,
    rating integer,
    comment text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT review_service_ratings_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);

CREATE TABLE public.review_staff_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    review_id uuid,
    staff_id uuid,
    rating integer,
    comment text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT review_staff_ratings_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);

COMMIT;
