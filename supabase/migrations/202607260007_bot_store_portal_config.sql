-- Derived from .local-schema-source/source-schema-only.sql (pg_dump --schema-only).
-- Contains no exported rows or production data.
-- Bot, tienda, plantillas, seguimientos y configuraciones auxiliares.
-- Dependencies: Supabase Local managed schemas/roles plus previous migrations in this folder.

BEGIN;

CREATE TABLE public.bot_appointment_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid,
    client_id uuid,
    client_name text,
    client_phone text,
    requested_service text,
    requested_date date,
    requested_time text,
    preferred_staff_id uuid,
    notes text,
    status text DEFAULT 'pendiente'::text,
    created_appointment_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    requested_services jsonb DEFAULT '[]'::jsonb,
    client_birthday date,
    deposit_required numeric DEFAULT 0,
    preferred_staff_mode text
);

CREATE TABLE public.bot_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_phone text NOT NULL,
    client_name text,
    current_step text DEFAULT 'inicio'::text,
    intent text,
    status text DEFAULT 'abierta'::text,
    last_message text,
    last_message_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    selected_service_id uuid,
    selected_service_name text,
    requested_date date,
    requested_time text,
    preferred_staff_id uuid,
    conversation_context jsonb DEFAULT '{}'::jsonb,
    selected_services jsonb DEFAULT '[]'::jsonb,
    preferred_staff_mode text,
    client_full_name text,
    client_phone_confirmed text,
    client_birthday date,
    deposit_required numeric DEFAULT 0,
    booking_step text,
    bot_enabled boolean DEFAULT true,
    handoff_to_human boolean DEFAULT false,
    assigned_to text,
    unread_count integer DEFAULT 0
);

CREATE TABLE public.bot_faqs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    keywords text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.bot_knowledge_base (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    category text DEFAULT 'General'::text,
    content text NOT NULL,
    keywords text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.bot_media_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_key text NOT NULL,
    title text NOT NULL,
    message text,
    media_type text DEFAULT 'image'::text,
    media_url text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.bot_menu_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    option_order integer DEFAULT 1,
    option_key text NOT NULL,
    option_label text NOT NULL,
    response_message text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.bot_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid,
    client_phone text,
    direction text NOT NULL,
    message_type text DEFAULT 'text'::text,
    body text,
    media_url text,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.bot_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bot_name text DEFAULT 'Asistente Alexandra Ruiz'::text,
    welcome_message text DEFAULT 'Hola 💕 Bienvenida/o a Alexandra Ruiz Salón Spa. Soy el asistente virtual del salón, ¿en qué puedo ayudarte?'::text,
    fallback_message text DEFAULT 'Disculpa, no logré entenderte bien. Puedes escribir “menú” para ver las opciones disponibles.'::text,
    human_help_message text DEFAULT 'Claro 💕 Te vamos a comunicar con una persona del salón para ayudarte mejor.'::text,
    appointment_deposit_message text DEFAULT 'Para confirmar tu cita se requiere anticipo. Envíanos tu comprobante para validarlo.'::text,
    active boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE public.clients_client_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE public.followup_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_key text NOT NULL,
    title text NOT NULL,
    keywords text NOT NULL,
    followup_days integer DEFAULT 0,
    followup_months integer DEFAULT 0,
    followup_type text DEFAULT 'reagendar'::text,
    message_body text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.message_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_key text NOT NULL,
    title text NOT NULL,
    message_body text NOT NULL,
    send_timing text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.staff_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid,
    title text NOT NULL,
    description text,
    due_date date,
    priority text DEFAULT 'media'::text,
    status text DEFAULT 'pendiente'::text,
    created_by text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.store_inventory_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    movement_type text NOT NULL,
    quantity integer NOT NULL,
    previous_stock integer DEFAULT 0,
    new_stock integer DEFAULT 0,
    note text,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT store_inventory_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['entrada'::text, 'venta'::text, 'ajuste'::text, 'devolucion'::text])))
);

CREATE TABLE public.store_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sku text,
    brand text,
    category text,
    description text,
    cost_price numeric DEFAULT 0,
    sale_price numeric DEFAULT 0,
    current_stock integer DEFAULT 0,
    min_stock integer DEFAULT 0,
    external_owner_name text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.store_sale_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_id uuid NOT NULL,
    product_id uuid,
    product_name text NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric DEFAULT 0,
    subtotal numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.store_sales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_date date DEFAULT CURRENT_DATE NOT NULL,
    client_id uuid,
    seller_staff_id uuid,
    seller_name text,
    subtotal numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    total_amount numeric DEFAULT 0,
    payment_method text DEFAULT 'efectivo'::text,
    salon_commission_percent numeric DEFAULT 0,
    salon_commission_amount numeric DEFAULT 0,
    terminal_fee_percent numeric DEFAULT 0,
    terminal_fee_amount numeric DEFAULT 0,
    seller_commission_percent numeric DEFAULT 0,
    seller_commission_amount numeric DEFAULT 0,
    external_owner_net_amount numeric DEFAULT 0,
    cash_registered boolean DEFAULT false,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    appointment_id uuid,
    payment_id uuid,
    source text DEFAULT 'direct_sale'::text,
    CONSTRAINT store_sales_payment_method_check CHECK ((payment_method = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'transferencia'::text, 'mixto'::text])))
);

CREATE TABLE public.store_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    salon_product_commission_percent numeric DEFAULT 0,
    terminal_card_fee_percent numeric DEFAULT 0,
    default_seller_commission_percent numeric DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);

COMMIT;
