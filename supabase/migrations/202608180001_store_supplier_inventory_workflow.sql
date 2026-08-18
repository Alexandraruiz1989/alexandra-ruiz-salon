-- Supplier inventory architecture for Store.
-- Additive migration only. Do not apply remotely without review/backups.

BEGIN;

CREATE TABLE IF NOT EXISTS public.store_suppliers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  commercial_name text NOT NULL,
  legal_name text,
  contact_name text,
  phone text,
  whatsapp_phone text,
  email text,
  address text,
  rfc text,
  notes text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.store_supplier_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  supplier_id uuid NOT NULL,
  auth_user_id uuid,
  user_profile_id uuid,
  email_snapshot text,
  display_name text,
  supplier_role text DEFAULT 'supplier'::text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  invited_by_user_profile_id uuid,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.store_product_suppliers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  supplier_sku text,
  reference_cost numeric(10,2),
  ownership_model text DEFAULT 'consignment'::text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  is_default_for_sales boolean DEFAULT false NOT NULL,
  priority integer DEFAULT 100 NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.store_supplier_inventory (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_supplier_id uuid NOT NULL,
  product_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  current_stock integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.store_inventory_movement_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  supplier_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_supplier_id uuid NOT NULL,
  request_type text NOT NULL,
  quantity integer NOT NULL,
  reason text,
  notes text,
  status text DEFAULT 'pending'::text NOT NULL,
  requested_by_user_profile_id uuid,
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  reviewed_by_user_profile_id uuid,
  reviewed_at timestamp with time zone,
  rejection_reason text,
  approved_movement_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.store_inventory_approvers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_profile_id uuid NOT NULL,
  active boolean DEFAULT true NOT NULL,
  granted_by_user_profile_id uuid,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.store_sale_items
  ADD COLUMN IF NOT EXISTS supplier_id uuid,
  ADD COLUMN IF NOT EXISTS product_supplier_id uuid,
  ADD COLUMN IF NOT EXISTS supplier_name_snapshot text,
  ADD COLUMN IF NOT EXISTS ownership_model_snapshot text,
  ADD COLUMN IF NOT EXISTS unit_cost_snapshot numeric(10,2),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS gross_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS salon_commission_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS terminal_fee_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS seller_commission_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS supplier_net_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS profit_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS economic_snapshot_complete boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS snapshot_version integer DEFAULT 1 NOT NULL;

ALTER TABLE public.store_sales
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed'::text NOT NULL,
  ADD COLUMN IF NOT EXISTS sale_reference text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_profile_id uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

ALTER TABLE public.store_inventory_movements
  ADD COLUMN IF NOT EXISTS supplier_id uuid,
  ADD COLUMN IF NOT EXISTS product_supplier_id uuid,
  ADD COLUMN IF NOT EXISTS movement_request_id uuid,
  ADD COLUMN IF NOT EXISTS reference_type text,
  ADD COLUMN IF NOT EXISTS reference_id uuid,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS created_by_user_profile_id uuid,
  ADD COLUMN IF NOT EXISTS approved_by_user_profile_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_suppliers_pkey') THEN
    ALTER TABLE public.store_suppliers
      ADD CONSTRAINT store_suppliers_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_supplier_users_pkey') THEN
    ALTER TABLE public.store_supplier_users
      ADD CONSTRAINT store_supplier_users_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_product_suppliers_pkey') THEN
    ALTER TABLE public.store_product_suppliers
      ADD CONSTRAINT store_product_suppliers_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_supplier_inventory_pkey') THEN
    ALTER TABLE public.store_supplier_inventory
      ADD CONSTRAINT store_supplier_inventory_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_movement_requests_pkey') THEN
    ALTER TABLE public.store_inventory_movement_requests
      ADD CONSTRAINT store_inventory_movement_requests_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_approvers_pkey') THEN
    ALTER TABLE public.store_inventory_approvers
      ADD CONSTRAINT store_inventory_approvers_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_supplier_users_supplier_id_fkey') THEN
    ALTER TABLE public.store_supplier_users
      ADD CONSTRAINT store_supplier_users_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.store_suppliers(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_supplier_users_auth_user_id_fkey') THEN
    ALTER TABLE public.store_supplier_users
      ADD CONSTRAINT store_supplier_users_auth_user_id_fkey
      FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_supplier_users_user_profile_id_fkey') THEN
    ALTER TABLE public.store_supplier_users
      ADD CONSTRAINT store_supplier_users_user_profile_id_fkey
      FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_supplier_users_invited_by_user_profile_id_fkey') THEN
    ALTER TABLE public.store_supplier_users
      ADD CONSTRAINT store_supplier_users_invited_by_user_profile_id_fkey
      FOREIGN KEY (invited_by_user_profile_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_product_suppliers_product_id_fkey') THEN
    ALTER TABLE public.store_product_suppliers
      ADD CONSTRAINT store_product_suppliers_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.store_products(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_product_suppliers_supplier_id_fkey') THEN
    ALTER TABLE public.store_product_suppliers
      ADD CONSTRAINT store_product_suppliers_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.store_suppliers(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_product_suppliers_ownership_model_check') THEN
    ALTER TABLE public.store_product_suppliers
      ADD CONSTRAINT store_product_suppliers_ownership_model_check
      CHECK (ownership_model = ANY (ARRAY['salon_owned'::text, 'consignment'::text, 'supplier_owned'::text]));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_supplier_inventory_product_supplier_id_fkey') THEN
    ALTER TABLE public.store_supplier_inventory
      ADD CONSTRAINT store_supplier_inventory_product_supplier_id_fkey
      FOREIGN KEY (product_supplier_id) REFERENCES public.store_product_suppliers(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_supplier_inventory_product_id_fkey') THEN
    ALTER TABLE public.store_supplier_inventory
      ADD CONSTRAINT store_supplier_inventory_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.store_products(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_supplier_inventory_supplier_id_fkey') THEN
    ALTER TABLE public.store_supplier_inventory
      ADD CONSTRAINT store_supplier_inventory_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.store_suppliers(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_supplier_inventory_current_stock_check') THEN
    ALTER TABLE public.store_supplier_inventory
      ADD CONSTRAINT store_supplier_inventory_current_stock_check
      CHECK (current_stock >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_movement_requests_supplier_id_fkey') THEN
    ALTER TABLE public.store_inventory_movement_requests
      ADD CONSTRAINT store_inventory_movement_requests_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.store_suppliers(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_movement_requests_product_id_fkey') THEN
    ALTER TABLE public.store_inventory_movement_requests
      ADD CONSTRAINT store_inventory_movement_requests_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.store_products(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_movement_requests_product_supplier_id_fkey') THEN
    ALTER TABLE public.store_inventory_movement_requests
      ADD CONSTRAINT store_inventory_movement_requests_product_supplier_id_fkey
      FOREIGN KEY (product_supplier_id) REFERENCES public.store_product_suppliers(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_movement_requests_requested_by_user_profile_id_fkey') THEN
    ALTER TABLE public.store_inventory_movement_requests
      ADD CONSTRAINT store_inventory_movement_requests_requested_by_user_profile_id_fkey
      FOREIGN KEY (requested_by_user_profile_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_movement_requests_reviewed_by_user_profile_id_fkey') THEN
    ALTER TABLE public.store_inventory_movement_requests
      ADD CONSTRAINT store_inventory_movement_requests_reviewed_by_user_profile_id_fkey
      FOREIGN KEY (reviewed_by_user_profile_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_movement_requests_approved_movement_id_fkey') THEN
    ALTER TABLE public.store_inventory_movement_requests
      ADD CONSTRAINT store_inventory_movement_requests_approved_movement_id_fkey
      FOREIGN KEY (approved_movement_id) REFERENCES public.store_inventory_movements(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_movement_requests_status_check') THEN
    ALTER TABLE public.store_inventory_movement_requests
      ADD CONSTRAINT store_inventory_movement_requests_status_check
      CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text]));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_movement_requests_request_type_check') THEN
    ALTER TABLE public.store_inventory_movement_requests
      ADD CONSTRAINT store_inventory_movement_requests_request_type_check
      CHECK (request_type = ANY (ARRAY['entrada'::text, 'retiro'::text, 'correccion'::text, 'devolucion'::text, 'ajuste'::text, 'otro'::text]));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_movement_requests_quantity_check') THEN
    ALTER TABLE public.store_inventory_movement_requests
      ADD CONSTRAINT store_inventory_movement_requests_quantity_check
      CHECK (quantity > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_approvers_user_profile_id_fkey') THEN
    ALTER TABLE public.store_inventory_approvers
      ADD CONSTRAINT store_inventory_approvers_user_profile_id_fkey
      FOREIGN KEY (user_profile_id) REFERENCES public.user_profiles(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_approvers_granted_by_user_profile_id_fkey') THEN
    ALTER TABLE public.store_inventory_approvers
      ADD CONSTRAINT store_inventory_approvers_granted_by_user_profile_id_fkey
      FOREIGN KEY (granted_by_user_profile_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_sale_items_supplier_id_fkey') THEN
    ALTER TABLE public.store_sale_items
      ADD CONSTRAINT store_sale_items_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.store_suppliers(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_sale_items_product_supplier_id_fkey') THEN
    ALTER TABLE public.store_sale_items
      ADD CONSTRAINT store_sale_items_product_supplier_id_fkey
      FOREIGN KEY (product_supplier_id) REFERENCES public.store_product_suppliers(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_sale_items_ownership_model_snapshot_check') THEN
    ALTER TABLE public.store_sale_items
      ADD CONSTRAINT store_sale_items_ownership_model_snapshot_check
      CHECK (
        ownership_model_snapshot IS NULL
        OR ownership_model_snapshot = ANY (ARRAY['salon_owned'::text, 'consignment'::text, 'supplier_owned'::text, 'legacy'::text])
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_sales_status_check') THEN
    ALTER TABLE public.store_sales
      ADD CONSTRAINT store_sales_status_check
      CHECK (status = ANY (ARRAY['completed'::text, 'cancelled'::text]));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_sales_cancelled_by_user_profile_id_fkey') THEN
    ALTER TABLE public.store_sales
      ADD CONSTRAINT store_sales_cancelled_by_user_profile_id_fkey
      FOREIGN KEY (cancelled_by_user_profile_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_movements_supplier_id_fkey') THEN
    ALTER TABLE public.store_inventory_movements
      ADD CONSTRAINT store_inventory_movements_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.store_suppliers(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_movements_product_supplier_id_fkey') THEN
    ALTER TABLE public.store_inventory_movements
      ADD CONSTRAINT store_inventory_movements_product_supplier_id_fkey
      FOREIGN KEY (product_supplier_id) REFERENCES public.store_product_suppliers(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_movements_movement_request_id_fkey') THEN
    ALTER TABLE public.store_inventory_movements
      ADD CONSTRAINT store_inventory_movements_movement_request_id_fkey
      FOREIGN KEY (movement_request_id) REFERENCES public.store_inventory_movement_requests(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_movements_created_by_user_profile_id_fkey') THEN
    ALTER TABLE public.store_inventory_movements
      ADD CONSTRAINT store_inventory_movements_created_by_user_profile_id_fkey
      FOREIGN KEY (created_by_user_profile_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_inventory_movements_approved_by_user_profile_id_fkey') THEN
    ALTER TABLE public.store_inventory_movements
      ADD CONSTRAINT store_inventory_movements_approved_by_user_profile_id_fkey
      FOREIGN KEY (approved_by_user_profile_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS store_suppliers_commercial_name_active_idx
  ON public.store_suppliers (lower(commercial_name))
  WHERE active = true;

CREATE INDEX IF NOT EXISTS store_supplier_users_supplier_idx
  ON public.store_supplier_users (supplier_id);

CREATE UNIQUE INDEX IF NOT EXISTS store_supplier_users_active_auth_idx
  ON public.store_supplier_users (supplier_id, auth_user_id)
  WHERE auth_user_id IS NOT NULL AND active = true AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS store_supplier_users_active_email_idx
  ON public.store_supplier_users (supplier_id, lower(email_snapshot))
  WHERE email_snapshot IS NOT NULL AND active = true AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS store_product_suppliers_product_idx
  ON public.store_product_suppliers (product_id, active, priority);

CREATE INDEX IF NOT EXISTS store_product_suppliers_supplier_idx
  ON public.store_product_suppliers (supplier_id, active);

CREATE UNIQUE INDEX IF NOT EXISTS store_product_suppliers_active_pair_idx
  ON public.store_product_suppliers (product_id, supplier_id)
  WHERE active = true;

CREATE UNIQUE INDEX IF NOT EXISTS store_supplier_inventory_product_supplier_idx
  ON public.store_supplier_inventory (product_supplier_id);

CREATE INDEX IF NOT EXISTS store_supplier_inventory_supplier_idx
  ON public.store_supplier_inventory (supplier_id);

CREATE INDEX IF NOT EXISTS store_inventory_movement_requests_supplier_status_idx
  ON public.store_inventory_movement_requests (supplier_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS store_inventory_movement_requests_product_supplier_idx
  ON public.store_inventory_movement_requests (product_supplier_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS store_inventory_movement_requests_approved_movement_idx
  ON public.store_inventory_movement_requests (approved_movement_id)
  WHERE approved_movement_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS store_inventory_movements_request_idx
  ON public.store_inventory_movements (movement_request_id)
  WHERE movement_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS store_inventory_movements_idempotency_idx
  ON public.store_inventory_movements (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS store_sales_idempotency_key_idx
  ON public.store_sales (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS store_sale_items_supplier_idx
  ON public.store_sale_items (supplier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS store_sale_items_product_supplier_idx
  ON public.store_sale_items (product_supplier_id);

CREATE OR REPLACE FUNCTION public.store_current_user_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT up.id
  FROM public.user_profiles up
  WHERE (
      up.auth_user_id = auth.uid()
      OR lower(up.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    AND coalesce(up.active, true) = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.store_supplier_user_is_active(p_supplier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    EXISTS (
      SELECT 1
      FROM public.store_supplier_users su
      WHERE su.supplier_id = p_supplier_id
        AND su.active = true
        AND su.revoked_at IS NULL
        AND (
          su.auth_user_id = auth.uid()
          OR lower(su.email_snapshot) = lower(coalesce(auth.jwt() ->> 'email', ''))
          OR su.user_profile_id = public.store_current_user_profile_id()
        )
    ),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.store_user_has_any_active_role(allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE (
          up.auth_user_id = auth.uid()
          OR lower(up.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
        AND coalesce(up.active, true) = true
        AND up.role = ANY(allowed_roles)
    ),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.store_supplier_product_relation_matches(
  p_supplier_id uuid,
  p_product_id uuid,
  p_product_supplier_id uuid,
  p_require_active boolean DEFAULT true
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    EXISTS (
      SELECT 1
      FROM public.store_product_suppliers ps
      JOIN public.store_suppliers supplier ON supplier.id = ps.supplier_id
      WHERE ps.id = p_product_supplier_id
        AND ps.product_id = p_product_id
        AND ps.supplier_id = p_supplier_id
        AND (
          p_require_active = false
          OR (
            ps.active = true
            AND supplier.active = true
          )
        )
    ),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.store_user_can_approve_inventory()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    public.store_user_has_any_active_role(ARRAY['admin'::text])
    OR EXISTS (
      SELECT 1
      FROM public.store_inventory_approvers approver
      WHERE approver.user_profile_id = public.store_current_user_profile_id()
        AND approver.active = true
        AND approver.revoked_at IS NULL
    ),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.approve_store_inventory_movement_request(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id uuid := public.store_current_user_profile_id();
  v_request public.store_inventory_movement_requests%ROWTYPE;
  v_inventory public.store_supplier_inventory%ROWTYPE;
  v_product public.store_products%ROWTYPE;
  v_delta integer := 0;
  v_supplier_new_stock integer := 0;
  v_product_new_stock integer := 0;
  v_movement_type text := 'ajuste';
  v_movement_id uuid;
BEGIN
  IF v_profile_id IS NULL OR NOT public.store_user_can_approve_inventory() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'inventory_approval_not_allowed';
  END IF;

  SELECT *
  INTO v_request
  FROM public.store_inventory_movement_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'movement_request_not_found';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'movement_request_already_reviewed';
  END IF;

  IF NOT public.store_supplier_product_relation_matches(
    v_request.supplier_id,
    v_request.product_id,
    v_request.product_supplier_id,
    true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'product_supplier_invalid';
  END IF;

  SELECT *
  INTO v_inventory
  FROM public.store_supplier_inventory
  WHERE product_supplier_id = v_request.product_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.store_supplier_inventory (
      product_supplier_id,
      product_id,
      supplier_id,
      current_stock,
      updated_at
    )
    VALUES (
      v_request.product_supplier_id,
      v_request.product_id,
      v_request.supplier_id,
      0,
      now()
    )
    RETURNING * INTO v_inventory;
  ELSIF v_inventory.product_id <> v_request.product_id
    OR v_inventory.supplier_id <> v_request.supplier_id THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'supplier_inventory_mismatch';
  END IF;

  SELECT *
  INTO v_product
  FROM public.store_products
  WHERE id = v_request.product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'product_not_found';
  END IF;

  IF v_request.request_type = 'entrada' THEN
    v_delta := v_request.quantity;
    v_movement_type := 'entrada';
  ELSIF v_request.request_type = 'devolucion' THEN
    v_delta := v_request.quantity;
    v_movement_type := 'devolucion';
  ELSIF v_request.request_type = 'retiro' THEN
    v_delta := -v_request.quantity;
    v_movement_type := 'ajuste';
  ELSIF v_request.request_type IN ('correccion', 'ajuste') THEN
    v_delta := v_request.quantity - coalesce(v_inventory.current_stock, 0);
    v_movement_type := 'ajuste';
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'request_type_requires_manual_definition';
  END IF;

  v_supplier_new_stock := coalesce(v_inventory.current_stock, 0) + v_delta;
  v_product_new_stock := coalesce(v_product.current_stock, 0) + v_delta;

  IF v_supplier_new_stock < 0 OR v_product_new_stock < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stock_cannot_be_negative';
  END IF;

  INSERT INTO public.store_inventory_movements (
    product_id,
    movement_type,
    quantity,
    previous_stock,
    new_stock,
    note,
    created_by,
    supplier_id,
    product_supplier_id,
    movement_request_id,
    reference_type,
    reference_id,
    reason,
    created_by_user_profile_id,
    approved_by_user_profile_id,
    idempotency_key
  )
  VALUES (
    v_request.product_id,
    v_movement_type,
    v_request.quantity,
    coalesce(v_inventory.current_stock, 0),
    v_supplier_new_stock,
    v_request.notes,
    coalesce(auth.jwt() ->> 'email', null),
    v_request.supplier_id,
    v_request.product_supplier_id,
    v_request.id,
    'inventory_request',
    v_request.id,
    v_request.reason,
    v_request.requested_by_user_profile_id,
    v_profile_id,
    'inventory_request:' || v_request.id::text
  )
  RETURNING id INTO v_movement_id;

  UPDATE public.store_supplier_inventory
  SET current_stock = v_supplier_new_stock,
      updated_at = now()
  WHERE id = v_inventory.id;

  UPDATE public.store_products
  SET current_stock = v_product_new_stock,
      updated_at = now()
  WHERE id = v_product.id;

  UPDATE public.store_inventory_movement_requests
  SET status = 'approved',
      reviewed_by_user_profile_id = v_profile_id,
      reviewed_at = now(),
      approved_movement_id = v_movement_id,
      updated_at = now()
  WHERE id = v_request.id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'movement_request_concurrent_review';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'requestId', v_request.id,
    'movementId', v_movement_id,
    'supplierStock', v_supplier_new_stock,
    'productStock', v_product_new_stock
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_store_inventory_movement_request(
  p_request_id uuid,
  p_rejection_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id uuid := public.store_current_user_profile_id();
  v_request public.store_inventory_movement_requests%ROWTYPE;
  v_reason text := nullif(trim(coalesce(p_rejection_reason, '')), '');
BEGIN
  IF v_profile_id IS NULL OR NOT public.store_user_can_approve_inventory() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'inventory_rejection_not_allowed';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'rejection_reason_required';
  END IF;

  SELECT *
  INTO v_request
  FROM public.store_inventory_movement_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'movement_request_not_found';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'movement_request_already_reviewed';
  END IF;

  UPDATE public.store_inventory_movement_requests
  SET status = 'rejected',
      reviewed_by_user_profile_id = v_profile_id,
      reviewed_at = now(),
      rejection_reason = v_reason,
      updated_at = now()
  WHERE id = v_request.id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'movement_request_concurrent_review';
  END IF;

  RETURN jsonb_build_object('success', true, 'requestId', v_request.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_store_product_sale_transaction(
  p_sale_date date,
  p_source text,
  p_payment_method text,
  p_products jsonb,
  p_seller_staff_id uuid DEFAULT NULL,
  p_discount_amount numeric DEFAULT 0,
  p_notes text DEFAULT NULL,
  p_appointment_id uuid DEFAULT NULL,
  p_payment_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_seller_commission_percent numeric DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id uuid := public.store_current_user_profile_id();
  v_user_email text := nullif(auth.jwt() ->> 'email', '');
  v_seller public.staff%ROWTYPE;
  v_settings public.store_settings%ROWTYPE;
  v_item jsonb;
  v_product public.store_products%ROWTYPE;
  v_inventory public.store_supplier_inventory%ROWTYPE;
  v_has_relation boolean := false;
  v_relation_id uuid;
  v_relation_supplier_id uuid;
  v_relation_ownership_model text;
  v_relation_reference_cost numeric(10,2);
  v_relation_active boolean;
  v_relation_supplier_name text;
  v_relation_supplier_active boolean;
  v_relation_supplier_stock integer;
  v_candidate_count integer := 0;
  v_structured_relation_count integer := 0;
  v_product_id uuid;
  v_product_supplier_id uuid;
  v_quantity integer;
  v_unit_price numeric(10,2);
  v_line_subtotal numeric(10,2);
  v_subtotal numeric(10,2) := 0;
  v_discount numeric(10,2) := round(greatest(coalesce(p_discount_amount, 0), 0), 2);
  v_total numeric(10,2) := 0;
  v_payment_method text := lower(trim(coalesce(p_payment_method, 'efectivo')));
  v_salon_percent numeric(10,2) := 0;
  v_terminal_percent numeric(10,2) := 0;
  v_seller_percent numeric(10,2) := 0;
  v_salon_commission numeric(10,2) := 0;
  v_terminal_fee numeric(10,2) := 0;
  v_seller_commission numeric(10,2) := 0;
  v_external_net numeric(10,2) := 0;
  v_sale_id uuid := gen_random_uuid();
  v_sale_reference text;
  v_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_normalized_items jsonb := '[]'::jsonb;
  v_seen_products uuid[] := '{}'::uuid[];
  v_existing public.store_sales%ROWTYPE;
  v_line jsonb;
  v_ratio numeric;
  v_line_discount numeric(10,2);
  v_line_net numeric(10,2);
  v_line_salon numeric(10,2);
  v_line_terminal numeric(10,2);
  v_line_seller numeric(10,2);
  v_line_supplier_net numeric(10,2);
  v_line_profit numeric(10,2);
  v_sale_item_id uuid;
  v_product_previous_stock integer;
  v_product_new_stock integer;
  v_supplier_previous_stock integer;
  v_supplier_new_stock integer;
BEGIN
  IF v_profile_id IS NULL OR NOT public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'store_sale_not_allowed';
  END IF;

  IF v_payment_method NOT IN ('efectivo', 'tarjeta', 'transferencia', 'mixto') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'payment_method_invalid';
  END IF;

  IF p_products IS NULL OR jsonb_typeof(p_products) <> 'array' OR jsonb_array_length(p_products) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'products_required';
  END IF;

  IF v_idempotency_key IS NOT NULL THEN
    SELECT *
    INTO v_existing
    FROM public.store_sales
    WHERE idempotency_key = v_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'saleId', v_existing.id, 'idempotent', true);
    END IF;
  END IF;

  SELECT *
  INTO v_settings
  FROM public.store_settings
  LIMIT 1;

  IF p_seller_staff_id IS NOT NULL THEN
    SELECT *
    INTO v_seller
    FROM public.staff
    WHERE id = p_seller_staff_id;
  END IF;

  v_salon_percent := coalesce(v_settings.salon_product_commission_percent, 0);
  v_terminal_percent := CASE
    WHEN v_payment_method IN ('tarjeta', 'mixto') THEN coalesce(v_settings.terminal_card_fee_percent, 0)
    ELSE 0
  END;
  v_seller_percent := coalesce(
    nullif(v_seller.product_commission_percentage, 0),
    v_settings.default_seller_commission_percent,
    0
  );

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_products)
  LOOP
    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_product_supplier_id := nullif(v_item ->> 'product_supplier_id', '')::uuid;
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);
    v_has_relation := false;
    v_relation_id := NULL;
    v_relation_supplier_id := NULL;
    v_relation_ownership_model := NULL;
    v_relation_reference_cost := NULL;
    v_relation_active := NULL;
    v_relation_supplier_name := NULL;
    v_relation_supplier_active := NULL;
    v_relation_supplier_stock := NULL;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'product_id_required';
    END IF;

    IF v_product_id = ANY(v_seen_products) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'duplicate_product_line';
    END IF;

    v_seen_products := array_append(v_seen_products, v_product_id);

    SELECT *
    INTO v_product
    FROM public.store_products
    WHERE id = v_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'product_not_found';
    END IF;

    IF v_product.active = false THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'product_inactive';
    END IF;

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'quantity_invalid';
    END IF;

    v_unit_price := round(coalesce(v_product.sale_price, 0), 2);

    IF v_unit_price < 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unit_price_invalid';
    END IF;

    IF v_product_supplier_id IS NOT NULL THEN
      SELECT
        ps.id,
        ps.supplier_id,
        ps.ownership_model,
        ps.reference_cost,
        ps.active,
        supplier.commercial_name AS supplier_name,
        supplier.active AS supplier_active,
        coalesce(inventory.current_stock, 0) AS supplier_stock
      INTO
        v_relation_id,
        v_relation_supplier_id,
        v_relation_ownership_model,
        v_relation_reference_cost,
        v_relation_active,
        v_relation_supplier_name,
        v_relation_supplier_active,
        v_relation_supplier_stock
      FROM public.store_product_suppliers ps
      JOIN public.store_suppliers supplier ON supplier.id = ps.supplier_id
      LEFT JOIN public.store_supplier_inventory inventory ON inventory.product_supplier_id = ps.id
      WHERE ps.id = v_product_supplier_id
        AND ps.product_id = v_product_id
      FOR UPDATE OF ps, supplier;

      IF NOT FOUND OR coalesce(v_relation_active, false) = false OR coalesce(v_relation_supplier_active, false) = false THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'product_supplier_invalid';
      END IF;

      IF coalesce(v_relation_supplier_stock, 0) < v_quantity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'supplier_stock_insufficient';
      END IF;

      v_has_relation := true;
    ELSE
      SELECT count(*)
      INTO v_structured_relation_count
      FROM public.store_product_suppliers ps
      WHERE ps.product_id = v_product_id;

      SELECT count(*)
      INTO v_candidate_count
      FROM public.store_product_suppliers ps
      JOIN public.store_suppliers supplier ON supplier.id = ps.supplier_id
      LEFT JOIN public.store_supplier_inventory inventory ON inventory.product_supplier_id = ps.id
      WHERE ps.product_id = v_product_id
        AND ps.active = true
        AND supplier.active = true
        AND coalesce(inventory.current_stock, 0) >= v_quantity;

      IF v_candidate_count = 1 THEN
        SELECT
          ps.id,
          ps.supplier_id,
          ps.ownership_model,
          ps.reference_cost,
          ps.active,
          supplier.commercial_name AS supplier_name,
          supplier.active AS supplier_active,
          coalesce(inventory.current_stock, 0) AS supplier_stock
        INTO
          v_relation_id,
          v_relation_supplier_id,
          v_relation_ownership_model,
          v_relation_reference_cost,
          v_relation_active,
          v_relation_supplier_name,
          v_relation_supplier_active,
          v_relation_supplier_stock
        FROM public.store_product_suppliers ps
        JOIN public.store_suppliers supplier ON supplier.id = ps.supplier_id
        LEFT JOIN public.store_supplier_inventory inventory ON inventory.product_supplier_id = ps.id
        WHERE ps.product_id = v_product_id
          AND ps.active = true
          AND supplier.active = true
          AND coalesce(inventory.current_stock, 0) >= v_quantity
        LIMIT 1
        FOR UPDATE OF ps, supplier;

        IF NOT FOUND THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'product_supplier_required';
        END IF;

        v_has_relation := true;
      ELSIF v_candidate_count > 1 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'product_supplier_required';
      ELSIF v_structured_relation_count > 0 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'product_supplier_unavailable';
      END IF;
    END IF;

    IF coalesce(v_product.current_stock, 0) < v_quantity THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'product_stock_insufficient';
    END IF;

    v_line_subtotal := round(v_quantity * v_unit_price, 2);
    v_subtotal := v_subtotal + v_line_subtotal;

    v_normalized_items := v_normalized_items || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_product.id,
        'product_name', v_product.name,
        'quantity', v_quantity,
        'unit_price', v_unit_price,
        'subtotal', v_line_subtotal,
        'product_supplier_id', CASE WHEN v_has_relation THEN v_relation_id ELSE NULL END,
        'supplier_id', CASE WHEN v_has_relation THEN v_relation_supplier_id ELSE NULL END,
        'supplier_name_snapshot', CASE WHEN v_has_relation THEN v_relation_supplier_name ELSE NULL END,
        'ownership_model_snapshot', CASE WHEN v_has_relation THEN v_relation_ownership_model ELSE 'legacy' END,
        'unit_cost_snapshot', CASE
          WHEN v_has_relation THEN coalesce(v_relation_reference_cost, v_product.cost_price)
          ELSE NULL
        END,
        'supplier_stock', CASE WHEN v_has_relation THEN v_relation_supplier_stock ELSE NULL END,
        'product_stock', v_product.current_stock,
        'economic_snapshot_complete', v_has_relation
      )
    );
  END LOOP;

  IF v_subtotal <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'sale_total_invalid';
  END IF;

  v_discount := least(v_discount, v_subtotal);
  v_total := round(greatest(v_subtotal - v_discount, 0), 2);
  v_salon_commission := round(v_total * (v_salon_percent / 100), 2);
  v_terminal_fee := round(v_total * (v_terminal_percent / 100), 2);
  v_seller_commission := round(v_total * (v_seller_percent / 100), 2);
  v_external_net := 0;
  v_sale_reference := 'TV-' || to_char(coalesce(p_sale_date, current_date), 'YYYYMMDD') || '-' || upper(substr(v_sale_id::text, 1, 8));

  INSERT INTO public.store_sales (
    id,
    sale_date,
    client_id,
    seller_staff_id,
    seller_name,
    subtotal,
    discount_amount,
    total_amount,
    payment_method,
    salon_commission_percent,
    salon_commission_amount,
    terminal_fee_percent,
    terminal_fee_amount,
    seller_commission_percent,
    seller_commission_amount,
    external_owner_net_amount,
    cash_registered,
    notes,
    created_by,
    updated_at,
    appointment_id,
    payment_id,
    source,
    status,
    sale_reference,
    idempotency_key
  )
  VALUES (
    v_sale_id,
    coalesce(p_sale_date, current_date),
    p_client_id,
    v_seller.id,
    v_seller.full_name,
    v_subtotal,
    v_discount,
    v_total,
    v_payment_method,
    v_salon_percent,
    v_salon_commission,
    v_terminal_percent,
    v_terminal_fee,
    v_seller_percent,
    v_seller_commission,
    v_external_net,
    true,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_email,
    now(),
    p_appointment_id,
    p_payment_id,
    coalesce(nullif(trim(p_source), ''), 'direct_sale'),
    'completed',
    v_sale_reference,
    v_idempotency_key
  );

  FOR v_line IN
    SELECT value
    FROM jsonb_array_elements(v_normalized_items)
  LOOP
    v_ratio := CASE
      WHEN v_subtotal > 0 THEN ((v_line ->> 'subtotal')::numeric / v_subtotal)
      ELSE 0
    END;
    v_line_discount := round(v_discount * v_ratio, 2);
    v_line_net := round(greatest((v_line ->> 'subtotal')::numeric - v_line_discount, 0), 2);
    v_line_salon := round(v_salon_commission * v_ratio, 2);
    v_line_terminal := round(v_terminal_fee * v_ratio, 2);
    v_line_seller := round(v_seller_commission * v_ratio, 2);
    v_line_supplier_net := CASE
      WHEN (v_line ->> 'ownership_model_snapshot') = 'salon_owned' THEN 0
      WHEN (v_line ->> 'economic_snapshot_complete')::boolean = true THEN
        round(v_line_net - v_line_salon - v_line_terminal - v_line_seller, 2)
      ELSE NULL
    END;
    v_external_net := round(v_external_net + coalesce(v_line_supplier_net, 0), 2);
    v_line_profit := CASE
      WHEN nullif(v_line ->> 'unit_cost_snapshot', '') IS NULL THEN NULL
      ELSE round(v_line_net - (((v_line ->> 'unit_cost_snapshot')::numeric) * ((v_line ->> 'quantity')::integer)), 2)
    END;

    INSERT INTO public.store_sale_items (
      sale_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      subtotal,
      supplier_id,
      product_supplier_id,
      supplier_name_snapshot,
      ownership_model_snapshot,
      unit_cost_snapshot,
      discount_amount,
      gross_amount,
      salon_commission_amount,
      terminal_fee_amount,
      seller_commission_amount,
      supplier_net_amount,
      profit_amount,
      economic_snapshot_complete,
      snapshot_version
    )
    VALUES (
      v_sale_id,
      (v_line ->> 'product_id')::uuid,
      v_line ->> 'product_name',
      (v_line ->> 'quantity')::integer,
      (v_line ->> 'unit_price')::numeric,
      (v_line ->> 'subtotal')::numeric,
      nullif(v_line ->> 'supplier_id', '')::uuid,
      nullif(v_line ->> 'product_supplier_id', '')::uuid,
      nullif(v_line ->> 'supplier_name_snapshot', ''),
      v_line ->> 'ownership_model_snapshot',
      nullif(v_line ->> 'unit_cost_snapshot', '')::numeric,
      v_line_discount,
      (v_line ->> 'subtotal')::numeric,
      v_line_salon,
      v_line_terminal,
      v_line_seller,
      v_line_supplier_net,
      v_line_profit,
      (v_line ->> 'economic_snapshot_complete')::boolean,
      1
    )
    RETURNING id INTO v_sale_item_id;

    v_product_id := (v_line ->> 'product_id')::uuid;
    v_product_supplier_id := nullif(v_line ->> 'product_supplier_id', '')::uuid;
    v_quantity := (v_line ->> 'quantity')::integer;
    v_product_previous_stock := (v_line ->> 'product_stock')::integer;
    v_product_new_stock := v_product_previous_stock - v_quantity;

    IF v_product_supplier_id IS NOT NULL THEN
      SELECT *
      INTO v_inventory
      FROM public.store_supplier_inventory
      WHERE product_supplier_id = v_product_supplier_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'supplier_inventory_not_found';
      END IF;

      v_supplier_previous_stock := coalesce(v_inventory.current_stock, 0);
      v_supplier_new_stock := v_supplier_previous_stock - v_quantity;

      IF v_supplier_new_stock < 0 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'supplier_stock_insufficient';
      END IF;

      UPDATE public.store_supplier_inventory
      SET current_stock = v_supplier_new_stock,
          updated_at = now()
      WHERE id = v_inventory.id;
    ELSE
      v_supplier_previous_stock := NULL;
      v_supplier_new_stock := NULL;
    END IF;

    IF v_product_new_stock < 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'product_stock_insufficient';
    END IF;

    UPDATE public.store_products
    SET current_stock = v_product_new_stock,
        updated_at = now()
    WHERE id = v_product_id;

    INSERT INTO public.store_inventory_movements (
      product_id,
      movement_type,
      quantity,
      previous_stock,
      new_stock,
      note,
      created_by,
      supplier_id,
      product_supplier_id,
      reference_type,
      reference_id,
      reason,
      created_by_user_profile_id,
      idempotency_key
    )
    VALUES (
      v_product_id,
      'venta',
      v_quantity,
      coalesce(v_supplier_previous_stock, v_product_previous_stock),
      coalesce(v_supplier_new_stock, v_product_new_stock),
      'Venta de producto ' || v_sale_reference,
      v_user_email,
      nullif(v_line ->> 'supplier_id', '')::uuid,
      v_product_supplier_id,
      'store_sale_item',
      v_sale_item_id,
      'venta',
      v_profile_id,
      CASE
        WHEN v_idempotency_key IS NULL THEN NULL
        ELSE v_idempotency_key || ':item:' || v_product_id::text
      END
    );
  END LOOP;

  UPDATE public.store_sales
  SET external_owner_net_amount = v_external_net,
      updated_at = now()
  WHERE id = v_sale_id;

  IF v_total > 0 THEN
    INSERT INTO public.cash_movements (
      movement_date,
      movement_type,
      amount,
      payment_method,
      concept,
      category,
      notes,
      payment_id,
      created_by_user_id,
      created_by_email,
      updated_at
    )
    VALUES (
      coalesce(p_sale_date, current_date),
      'ingreso',
      v_total,
      CASE
        WHEN v_payment_method = 'tarjeta' THEN 'Tarjeta'
        WHEN v_payment_method = 'transferencia' THEN 'Transferencia'
        WHEN v_payment_method = 'mixto' THEN 'Mixto'
        ELSE 'Efectivo'
      END,
      CASE
        WHEN coalesce(nullif(trim(p_source), ''), 'direct_sale') = 'appointment_payment'
          THEN 'Venta de productos en cobro ' || coalesce(p_payment_id::text, v_sale_id::text)
        ELSE 'Venta de productos ' || v_sale_reference
      END,
      'venta_producto',
      'Tienda · Vendedora: ' || coalesce(v_seller.full_name, 'Sin vendedora'),
      p_payment_id,
      auth.uid(),
      v_user_email,
      now()
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'saleId', v_sale_id,
    'saleReference', v_sale_reference,
    'subtotal', v_subtotal,
    'discountAmount', v_discount,
    'total', v_total,
    'idempotent', false
  );
END;
$$;

ALTER TABLE public.store_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_supplier_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_product_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_supplier_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_inventory_movement_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_inventory_approvers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_suppliers_select_roles_or_own ON public.store_suppliers;
CREATE POLICY store_suppliers_select_roles_or_own
  ON public.store_suppliers
  FOR SELECT
  TO authenticated
  USING (
    public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text])
    OR public.store_supplier_user_is_active(id)
  );

DROP POLICY IF EXISTS store_suppliers_insert_admin_encargada ON public.store_suppliers;
CREATE POLICY store_suppliers_insert_admin_encargada
  ON public.store_suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text]));

DROP POLICY IF EXISTS store_suppliers_update_admin_encargada ON public.store_suppliers;
CREATE POLICY store_suppliers_update_admin_encargada
  ON public.store_suppliers
  FOR UPDATE
  TO authenticated
  USING (public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text]))
  WITH CHECK (public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text]));

DROP POLICY IF EXISTS store_supplier_users_select_roles_or_self ON public.store_supplier_users;
CREATE POLICY store_supplier_users_select_roles_or_self
  ON public.store_supplier_users
  FOR SELECT
  TO authenticated
  USING (
    public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text])
    OR public.store_supplier_user_is_active(supplier_id)
  );

DROP POLICY IF EXISTS store_supplier_users_insert_admin_encargada ON public.store_supplier_users;
CREATE POLICY store_supplier_users_insert_admin_encargada
  ON public.store_supplier_users
  FOR INSERT
  TO authenticated
  WITH CHECK (public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text]));

DROP POLICY IF EXISTS store_supplier_users_update_admin_encargada ON public.store_supplier_users;
CREATE POLICY store_supplier_users_update_admin_encargada
  ON public.store_supplier_users
  FOR UPDATE
  TO authenticated
  USING (public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text]))
  WITH CHECK (public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text]));

DROP POLICY IF EXISTS store_product_suppliers_select_roles_or_own ON public.store_product_suppliers;
CREATE POLICY store_product_suppliers_select_roles_or_own
  ON public.store_product_suppliers
  FOR SELECT
  TO authenticated
  USING (
    public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'product_owner'::text])
    OR public.store_supplier_user_is_active(supplier_id)
  );

DROP POLICY IF EXISTS store_product_suppliers_insert_admin_encargada ON public.store_product_suppliers;
CREATE POLICY store_product_suppliers_insert_admin_encargada
  ON public.store_product_suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text]));

DROP POLICY IF EXISTS store_product_suppliers_update_admin_encargada ON public.store_product_suppliers;
CREATE POLICY store_product_suppliers_update_admin_encargada
  ON public.store_product_suppliers
  FOR UPDATE
  TO authenticated
  USING (public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text]))
  WITH CHECK (public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text]));

DROP POLICY IF EXISTS store_supplier_inventory_select_roles_or_own ON public.store_supplier_inventory;
CREATE POLICY store_supplier_inventory_select_roles_or_own
  ON public.store_supplier_inventory
  FOR SELECT
  TO authenticated
  USING (
    public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'product_owner'::text])
    OR public.store_supplier_user_is_active(supplier_id)
  );

DROP POLICY IF EXISTS store_supplier_inventory_write_admin_encargada ON public.store_supplier_inventory;
CREATE POLICY store_supplier_inventory_write_admin_encargada
  ON public.store_supplier_inventory
  FOR ALL
  TO authenticated
  USING (public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text]))
  WITH CHECK (public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text]));

DROP POLICY IF EXISTS store_inventory_requests_select_roles_or_own ON public.store_inventory_movement_requests;
CREATE POLICY store_inventory_requests_select_roles_or_own
  ON public.store_inventory_movement_requests
  FOR SELECT
  TO authenticated
  USING (
    public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text])
    OR public.store_supplier_user_is_active(supplier_id)
  );

DROP POLICY IF EXISTS store_inventory_requests_insert_supplier_own ON public.store_inventory_movement_requests;
CREATE POLICY store_inventory_requests_insert_supplier_own
  ON public.store_inventory_movement_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'pending'
    AND public.store_supplier_user_is_active(supplier_id)
    AND public.store_supplier_product_relation_matches(
      supplier_id,
      product_id,
      product_supplier_id,
      true
    )
  );

DROP POLICY IF EXISTS store_inventory_requests_update_supplier_cancel_pending ON public.store_inventory_movement_requests;
CREATE POLICY store_inventory_requests_update_supplier_cancel_pending
  ON public.store_inventory_movement_requests
  FOR UPDATE
  TO authenticated
  USING (
    status = 'pending'
    AND public.store_supplier_user_is_active(supplier_id)
  )
  WITH CHECK (
    status = 'cancelled'
    AND public.store_supplier_user_is_active(supplier_id)
    AND public.store_supplier_product_relation_matches(
      supplier_id,
      product_id,
      product_supplier_id,
      false
    )
  );

DROP POLICY IF EXISTS store_inventory_requests_update_approvers ON public.store_inventory_movement_requests;
CREATE POLICY store_inventory_requests_update_approvers
  ON public.store_inventory_movement_requests
  FOR UPDATE
  TO authenticated
  USING (public.store_user_can_approve_inventory())
  WITH CHECK (public.store_user_can_approve_inventory());

DROP POLICY IF EXISTS store_inventory_approvers_select_admin ON public.store_inventory_approvers;
CREATE POLICY store_inventory_approvers_select_admin
  ON public.store_inventory_approvers
  FOR SELECT
  TO authenticated
  USING (public.store_user_has_any_active_role(ARRAY['admin'::text, 'encargada'::text]));

DROP POLICY IF EXISTS store_inventory_approvers_write_admin ON public.store_inventory_approvers;
CREATE POLICY store_inventory_approvers_write_admin
  ON public.store_inventory_approvers
  FOR ALL
  TO authenticated
  USING (public.store_user_has_any_active_role(ARRAY['admin'::text]))
  WITH CHECK (public.store_user_has_any_active_role(ARRAY['admin'::text]));

REVOKE ALL PRIVILEGES
ON TABLE
  public.store_suppliers,
  public.store_supplier_users,
  public.store_product_suppliers,
  public.store_supplier_inventory,
  public.store_inventory_movement_requests,
  public.store_inventory_approvers
FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE
ON TABLE
  public.store_suppliers,
  public.store_supplier_users,
  public.store_product_suppliers,
  public.store_supplier_inventory,
  public.store_inventory_movement_requests,
  public.store_inventory_approvers
TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.approve_store_inventory_movement_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_store_inventory_movement_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_store_product_sale_transaction(
  date, text, text, jsonb, uuid, numeric, text, uuid, uuid, uuid, numeric, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.approve_store_inventory_movement_request(uuid)
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.reject_store_inventory_movement_request(uuid, text)
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_store_product_sale_transaction(
  date, text, text, jsonb, uuid, numeric, text, uuid, uuid, uuid, numeric, text
)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
