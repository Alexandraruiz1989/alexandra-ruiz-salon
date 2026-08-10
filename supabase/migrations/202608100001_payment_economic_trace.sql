-- Economic traceability for payments, service-bound extras and commission snapshots.
-- This migration is prepared for review and must not be applied remotely from Codex.

BEGIN;

ALTER TABLE public.appointment_extra_items
  ADD COLUMN IF NOT EXISTS appointment_service_id uuid;

ALTER TABLE public.payment_extra_items
  ADD COLUMN IF NOT EXISTS appointment_service_id uuid,
  ADD COLUMN IF NOT EXISTS appointment_extra_item_id uuid;

ALTER TABLE public.payment_staff_totals
  ADD COLUMN IF NOT EXISTS commission_snapshot_complete boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointment_extra_items_appointment_service_id_fkey'
  ) THEN
    ALTER TABLE public.appointment_extra_items
      ADD CONSTRAINT appointment_extra_items_appointment_service_id_fkey
      FOREIGN KEY (appointment_service_id)
      REFERENCES public.appointment_services(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_extra_items_appointment_service_id_fkey'
  ) THEN
    ALTER TABLE public.payment_extra_items
      ADD CONSTRAINT payment_extra_items_appointment_service_id_fkey
      FOREIGN KEY (appointment_service_id)
      REFERENCES public.appointment_services(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_extra_items_appointment_extra_item_id_fkey'
  ) THEN
    ALTER TABLE public.payment_extra_items
      ADD CONSTRAINT payment_extra_items_appointment_extra_item_id_fkey
      FOREIGN KEY (appointment_extra_item_id)
      REFERENCES public.appointment_extra_items(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS appointment_extra_items_appointment_service_idx
  ON public.appointment_extra_items(appointment_service_id);

CREATE INDEX IF NOT EXISTS payment_extra_items_appointment_service_idx
  ON public.payment_extra_items(appointment_service_id);

CREATE INDEX IF NOT EXISTS payment_extra_items_appointment_extra_item_idx
  ON public.payment_extra_items(appointment_extra_item_id);

CREATE OR REPLACE FUNCTION public.create_payment_transaction(
  p_appointment_id uuid,
  p_payment_date date,
  p_payment_method text,
  p_discount_amount numeric,
  p_tip_allocations jsonb,
  p_extra_items jsonb,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_payment_id uuid := gen_random_uuid();
  v_service_total numeric(10,2) := 0;
  v_extra_total numeric(10,2) := 0;
  v_tip_total numeric(10,2) := 0;
  v_discount numeric(10,2) := round(greatest(coalesce(p_discount_amount, 0), 0), 2);
  v_deposit numeric(10,2) := 0;
  v_services_payment_total numeric(10,2) := 0;
  v_total_amount numeric(10,2) := 0;
  v_extra jsonb;
  v_tip jsonb;
  v_normalized_extras jsonb := '[]'::jsonb;
  v_service public.appointment_services%ROWTYPE;
  v_original_extra public.appointment_extra_items%ROWTYPE;
  v_extra_quantity numeric(10,2);
  v_extra_unit_price numeric(10,2);
  v_extra_line_total numeric(10,2);
  v_tip_amount numeric(10,2);
  v_tip_staff_id uuid;
  v_seen_tip_staff uuid[] := '{}'::uuid[];
  v_created_by_user_id uuid := auth.uid();
  v_created_by_email text := nullif(auth.jwt() ->> 'email', '');
BEGIN
  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'appointment_id_required';
  END IF;

  IF nullif(trim(coalesce(p_payment_method, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'payment_method_required';
  END IF;

  SELECT appointment.*
  INTO v_appointment
  FROM public.appointments appointment
  WHERE appointment.id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'appointment_not_found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_appointment_id::text, 0));

  IF EXISTS (
    SELECT 1
    FROM public.payments existing_payment
    WHERE existing_payment.appointment_id = p_appointment_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'appointment_already_paid';
  END IF;

  SELECT round(
    coalesce(sum(coalesce(nullif(service.total_price, 0), service.price, 0)), 0),
    2
  )
  INTO v_service_total
  FROM public.appointment_services service
  WHERE service.appointment_id = p_appointment_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.appointment_services service
    WHERE service.appointment_id = p_appointment_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'appointment_services_required';
  END IF;

  FOR v_extra IN
    SELECT value
    FROM jsonb_array_elements(coalesce(p_extra_items, '[]'::jsonb))
  LOOP
    IF nullif(v_extra ->> 'appointmentServiceId', '') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'extra_appointment_service_required';
    END IF;

    SELECT service.*
    INTO v_service
    FROM public.appointment_services service
    WHERE service.id = (v_extra ->> 'appointmentServiceId')::uuid
      AND service.appointment_id = p_appointment_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'extra_appointment_service_invalid';
    END IF;

    v_extra_quantity := round(coalesce((v_extra ->> 'quantity')::numeric, 0), 2);
    v_extra_unit_price := round(coalesce((v_extra ->> 'unitPrice')::numeric, 0), 2);
    v_extra_line_total := round(v_extra_quantity * v_extra_unit_price, 2);

    IF v_extra_quantity <= 0 OR v_extra_unit_price < 0 OR v_extra_line_total <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'extra_amount_invalid';
    END IF;

    IF nullif(trim(coalesce(v_extra ->> 'name', '')), '') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'extra_name_required';
    END IF;

    IF nullif(v_extra ->> 'appointmentExtraItemId', '') IS NOT NULL THEN
      SELECT original_extra.*
      INTO v_original_extra
      FROM public.appointment_extra_items original_extra
      WHERE original_extra.id = (v_extra ->> 'appointmentExtraItemId')::uuid
        AND original_extra.appointment_id = p_appointment_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'appointment_extra_item_invalid';
      END IF;

      IF v_original_extra.appointment_service_id IS NOT NULL
        AND v_original_extra.appointment_service_id <> v_service.id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'appointment_extra_service_mismatch';
      END IF;

      UPDATE public.appointment_extra_items
      SET
        appointment_service_id = v_service.id,
        staff_id = v_service.staff_id,
        updated_at = now()
      WHERE id = v_original_extra.id;
    END IF;

    v_normalized_extras := v_normalized_extras || jsonb_build_array(
      jsonb_build_object(
        'appointmentExtraItemId', nullif(v_extra ->> 'appointmentExtraItemId', ''),
        'appointmentServiceId', v_service.id,
        'extraId', nullif(v_extra ->> 'extraId', ''),
        'staffId', v_service.staff_id,
        'name', trim(v_extra ->> 'name'),
        'quantity', v_extra_quantity,
        'unitPrice', v_extra_unit_price,
        'totalPrice', v_extra_line_total
      )
    );
    v_extra_total := v_extra_total + v_extra_line_total;
  END LOOP;

  FOR v_tip IN
    SELECT value
    FROM jsonb_array_elements(coalesce(p_tip_allocations, '[]'::jsonb))
  LOOP
    IF nullif(v_tip ->> 'staffId', '') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'tip_staff_required';
    END IF;

    v_tip_staff_id := (v_tip ->> 'staffId')::uuid;
    v_tip_amount := round(coalesce((v_tip ->> 'amount')::numeric, 0), 2);

    IF v_tip_staff_id = ANY(v_seen_tip_staff) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'duplicate_tip_staff';
    END IF;

    IF v_tip_amount < 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'tip_amount_invalid';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.appointment_services service
      WHERE service.appointment_id = p_appointment_id
        AND service.staff_id = v_tip_staff_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'tip_staff_not_in_appointment';
    END IF;

    v_seen_tip_staff := array_append(v_seen_tip_staff, v_tip_staff_id);
    v_tip_total := v_tip_total + v_tip_amount;
  END LOOP;

  v_tip_total := round(v_tip_total, 2);
  v_extra_total := round(v_extra_total, 2);
  v_deposit := round(greatest(coalesce(v_appointment.deposit_amount, 0), 0), 2);
  v_services_payment_total := round(
    greatest(v_service_total + v_extra_total - v_discount - v_deposit + v_tip_total, 0),
    2
  );
  v_total_amount := v_services_payment_total;

  INSERT INTO public.payments (
    id,
    appointment_id,
    client_id,
    payment_date,
    payment_method,
    subtotal,
    discount_amount,
    total,
    paid_amount,
    balance_due,
    deposit_amount,
    subtotal_services,
    subtotal_extras,
    tip_amount,
    total_amount,
    payment_status,
    notes,
    created_by_user_id,
    created_by_email,
    updated_at
  )
  VALUES (
    v_payment_id,
    v_appointment.id,
    v_appointment.client_id,
    coalesce(p_payment_date, current_date),
    trim(p_payment_method),
    round(v_service_total + v_extra_total, 2),
    v_discount,
    v_total_amount,
    v_total_amount,
    0,
    v_deposit,
    v_service_total,
    v_extra_total,
    v_tip_total,
    v_total_amount,
    'pagado',
    nullif(trim(coalesce(p_notes, '')), ''),
    v_created_by_user_id,
    v_created_by_email,
    now()
  );

  INSERT INTO public.payment_service_items (
    payment_id,
    appointment_service_id,
    service_id,
    staff_id,
    name,
    staff_name,
    start_time,
    end_time,
    quantity,
    unit_price,
    total_price
  )
  SELECT
    v_payment_id,
    service.id,
    service.service_id,
    service.staff_id,
    coalesce(nullif(service.custom_name, ''), catalog.name, 'Servicio'),
    staff.full_name,
    service.start_time,
    service.end_time,
    coalesce(service.quantity, 1),
    coalesce(
      nullif(service.unit_price, 0),
      nullif(service.price, 0),
      service.total_price,
      0
    ),
    coalesce(nullif(service.total_price, 0), service.price, 0)
  FROM public.appointment_services service
  LEFT JOIN public.services catalog ON catalog.id = service.service_id
  LEFT JOIN public.staff staff ON staff.id = service.staff_id
  WHERE service.appointment_id = p_appointment_id;

  INSERT INTO public.payment_extra_items (
    payment_id,
    appointment_extra_item_id,
    appointment_service_id,
    extra_id,
    staff_id,
    name,
    quantity,
    unit_price,
    total_price
  )
  SELECT
    v_payment_id,
    nullif(extra.value ->> 'appointmentExtraItemId', '')::uuid,
    (extra.value ->> 'appointmentServiceId')::uuid,
    nullif(extra.value ->> 'extraId', '')::uuid,
    nullif(extra.value ->> 'staffId', '')::uuid,
    extra.value ->> 'name',
    (extra.value ->> 'quantity')::numeric,
    (extra.value ->> 'unitPrice')::numeric,
    (extra.value ->> 'totalPrice')::numeric
  FROM jsonb_array_elements(v_normalized_extras) extra(value);

  WITH service_totals AS (
    SELECT
      item.staff_id,
      round(sum(item.total_price), 2) AS service_total
    FROM public.payment_service_items item
    WHERE item.payment_id = v_payment_id
      AND item.staff_id IS NOT NULL
    GROUP BY item.staff_id
  ),
  extra_totals AS (
    SELECT
      item.staff_id,
      round(sum(item.total_price), 2) AS extras_total
    FROM public.payment_extra_items item
    WHERE item.payment_id = v_payment_id
      AND item.staff_id IS NOT NULL
    GROUP BY item.staff_id
  ),
  tip_totals AS (
    SELECT
      (tip.value ->> 'staffId')::uuid AS staff_id,
      round((tip.value ->> 'amount')::numeric, 2) AS tip_amount
    FROM jsonb_array_elements(coalesce(p_tip_allocations, '[]'::jsonb)) tip(value)
  ),
  staff_ids AS (
    SELECT staff_id FROM service_totals
    UNION
    SELECT staff_id FROM extra_totals
    UNION
    SELECT staff_id FROM tip_totals
  )
  INSERT INTO public.payment_staff_totals (
    payment_id,
    staff_id,
    service_total,
    extras_total,
    commission_base,
    commission_amount,
    tip_amount,
    commission_snapshot_complete
  )
  SELECT
    v_payment_id,
    ids.staff_id,
    coalesce(services.service_total, 0),
    coalesce(extras.extras_total, 0),
    round(coalesce(services.service_total, 0) + coalesce(extras.extras_total, 0), 2),
    round(
      (coalesce(services.service_total, 0) + coalesce(extras.extras_total, 0))
      * coalesce(
          nullif(staff.service_commission_percentage, 0),
          nullif(staff.commission_percentage, 0),
          0
        ) / 100,
      2
    ),
    coalesce(tips.tip_amount, 0),
    true
  FROM staff_ids ids
  LEFT JOIN service_totals services ON services.staff_id = ids.staff_id
  LEFT JOIN extra_totals extras ON extras.staff_id = ids.staff_id
  LEFT JOIN tip_totals tips ON tips.staff_id = ids.staff_id
  LEFT JOIN public.staff staff ON staff.id = ids.staff_id;

  IF v_services_payment_total > 0 THEN
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
      coalesce(p_payment_date, current_date),
      'ingreso',
      v_services_payment_total,
      trim(p_payment_method),
      'Cobro de cita - ' || coalesce(
        (SELECT client.full_name FROM public.clients client WHERE client.id = v_appointment.client_id),
        'Clienta'
      ),
      'servicio',
      nullif(trim(coalesce(p_notes, '')), ''),
      v_payment_id,
      v_created_by_user_id,
      v_created_by_email,
      now()
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'paymentId', v_payment_id,
    'subtotalServices', v_service_total,
    'subtotalExtras', v_extra_total,
    'discountAmount', v_discount,
    'depositAmount', v_deposit,
    'tipAmount', v_tip_total,
    'servicesPaymentTotal', v_services_payment_total,
    'totalAmount', v_total_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment_transaction(
  uuid, date, text, numeric, jsonb, jsonb, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_payment_transaction(
  uuid, date, text, numeric, jsonb, jsonb, text
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
