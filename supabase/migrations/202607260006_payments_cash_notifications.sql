-- Derived from .local-schema-source/source-schema-only.sql (pg_dump --schema-only).
-- Contains no exported rows or production data.
-- Pagos, caja, comisiones, membres?as, tarjetas, notificaciones y push.
-- Dependencies: Supabase Local managed schemas/roles plus previous migrations in this folder.

BEGIN;

CREATE TABLE public.cash_closings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    closing_date date NOT NULL,
    opening_cash numeric(10,2) DEFAULT 0,
    cash_income numeric(10,2) DEFAULT 0,
    cash_out numeric(10,2) DEFAULT 0,
    expected_cash numeric(10,2) DEFAULT 0,
    counted_cash numeric(10,2) DEFAULT 0,
    difference numeric(10,2) DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.cash_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    movement_date date DEFAULT CURRENT_DATE NOT NULL,
    movement_type text NOT NULL,
    amount numeric(10,2) DEFAULT 0 NOT NULL,
    payment_method text DEFAULT 'Efectivo'::text,
    concept text NOT NULL,
    notes text,
    payment_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    category text,
    updated_at timestamp with time zone DEFAULT now(),
    created_by_user_id uuid,
    created_by_email text
);

CREATE TABLE public.cashbox_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    movement_type text NOT NULL,
    concept text NOT NULL,
    amount numeric(10,2) DEFAULT 0 NOT NULL,
    payment_id uuid,
    appointment_id uuid,
    staff_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.client_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    membership_id uuid,
    code text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    status text DEFAULT 'activa'::text,
    remaining_services jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid,
    payment_id uuid,
    appointment_service_id uuid,
    base_amount numeric(10,2) DEFAULT 0,
    commission_type text DEFAULT 'percentage'::text,
    commission_value numeric(10,2) DEFAULT 0,
    commission_amount numeric(10,2) DEFAULT 0,
    status text DEFAULT 'pendiente'::text,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.gift_card_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gift_card_id uuid,
    payment_id uuid,
    transaction_type text NOT NULL,
    amount numeric(10,2) DEFAULT 0 NOT NULL,
    balance_after numeric(10,2) DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.gift_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    buyer_client_id uuid,
    recipient_name text,
    initial_amount numeric(10,2) DEFAULT 0 NOT NULL,
    current_balance numeric(10,2) DEFAULT 0 NOT NULL,
    expires_at date,
    status text DEFAULT 'activa'::text,
    design_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.membership_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_membership_id uuid,
    appointment_id uuid,
    payment_id uuid,
    service_name text,
    quantity integer DEFAULT 1,
    discount_amount numeric(10,2) DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(10,2) DEFAULT 0,
    duration_days integer DEFAULT 30,
    discount_percent numeric(10,2) DEFAULT 0,
    active boolean DEFAULT true,
    included_services jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid,
    title text NOT NULL,
    message text,
    notification_type text DEFAULT 'tarea'::text,
    related_table text,
    related_id uuid,
    is_read boolean DEFAULT false,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    recipient_auth_user_id uuid,
    recipient_email text,
    created_by_auth_user_id uuid,
    created_by_email text
);

CREATE TABLE public.payment_extra_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid,
    extra_id uuid,
    name text NOT NULL,
    quantity numeric(10,2) DEFAULT 1,
    unit_price numeric(10,2) DEFAULT 0,
    total_price numeric(10,2) DEFAULT 0,
    staff_id uuid,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.payment_service_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid,
    appointment_service_id uuid,
    service_id uuid,
    staff_id uuid,
    name text NOT NULL,
    staff_name text,
    start_time time without time zone,
    end_time time without time zone,
    quantity numeric(10,2) DEFAULT 1,
    unit_price numeric(10,2) DEFAULT 0,
    total_price numeric(10,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.payment_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tip_rule text DEFAULT 'appointment_staff'::text NOT NULL,
    allow_manual_tip_adjustment boolean DEFAULT true,
    selected_staff_ids uuid[] DEFAULT '{}'::uuid[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.payment_staff_totals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_id uuid,
    staff_id uuid,
    service_total numeric(10,2) DEFAULT 0,
    extras_total numeric(10,2) DEFAULT 0,
    commission_base numeric(10,2) DEFAULT 0,
    commission_amount numeric(10,2) DEFAULT 0,
    tip_amount numeric(10,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id uuid,
    client_id uuid,
    payment_method text NOT NULL,
    subtotal numeric(10,2) DEFAULT 0,
    discount_type text,
    discount_value numeric(10,2) DEFAULT 0,
    discount_reason text,
    discount_amount numeric(10,2) DEFAULT 0,
    total numeric(10,2) DEFAULT 0,
    paid_amount numeric(10,2) DEFAULT 0,
    balance_due numeric(10,2) DEFAULT 0,
    gift_card_code text,
    membership_code text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    deposit_amount numeric(10,2) DEFAULT 0,
    subtotal_services numeric(10,2) DEFAULT 0,
    subtotal_extras numeric(10,2) DEFAULT 0,
    tip_amount numeric(10,2) DEFAULT 0,
    total_amount numeric(10,2) DEFAULT 0,
    payment_status text DEFAULT 'pagado'::text,
    updated_at timestamp with time zone DEFAULT now(),
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    created_by_user_id uuid,
    created_by_email text
);

CREATE TABLE public.payroll_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid,
    adjustment_date date DEFAULT CURRENT_DATE NOT NULL,
    adjustment_type text NOT NULL,
    amount numeric(10,2) DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid,
    user_email text,
    staff_id uuid,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

COMMIT;
