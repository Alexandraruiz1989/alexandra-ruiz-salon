-- Derived from .local-schema-source/source-schema-only.sql (pg_dump --schema-only).
-- Contains no exported rows or production data.
-- Constraints, ?ndices, funciones p?blicas, triggers, RLS y policies.
-- Dependencies: Supabase Local managed schemas/roles plus previous migrations in this folder.

BEGIN;

CREATE FUNCTION public.agenda_current_user_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select lower(coalesce(up.role, ''))
  from public.user_profiles up
  where (
      up.auth_user_id = auth.uid()
      or lower(up.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    and coalesce(up.active, true) = true
  limit 1
$$;

CREATE FUNCTION public.agenda_user_has_role(allowed_roles text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(public.agenda_current_user_role() = any(allowed_roles), false)
$$;

CREATE FUNCTION public.assign_client_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  next_number bigint;
begin
  if new.client_number is null or trim(new.client_number) = '' then
    next_number := nextval('public.clients_client_number_seq');
    new.client_number := 'CL-' || lpad(next_number::text, 4, '0');
  end if;
  return new;
end;
$$;

CREATE FUNCTION public.bot_current_user_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select lower(coalesce(up.role, ''))
  from public.user_profiles up
  where (
      up.auth_user_id = auth.uid()
      or lower(up.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    and coalesce(up.active, true) = true
  limit 1
$$;

CREATE FUNCTION public.bot_user_is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(public.bot_current_user_role() = 'admin', false)
$$;

CREATE FUNCTION public.client_portal_has_role(allowed_roles text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and coalesce(up.active, true) = true
      and lower(up.role) = any(allowed_roles)
  );
$$;

CREATE FUNCTION public.push_current_user_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select lower(coalesce(up.role, ''))
  from public.user_profiles up
  where (
      up.auth_user_id = auth.uid()
      or lower(up.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    and coalesce(up.active, true) = true
  limit 1
$$;

CREATE FUNCTION public.push_user_has_role(allowed_roles text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(public.push_current_user_role() = any(allowed_roles), false)
$$;

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION public.salon_current_user_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select lower(coalesce(up.role, ''))
  from public.user_profiles up
  where (
      up.auth_user_id = auth.uid()
      or lower(up.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    and coalesce(up.active, true) = true
  limit 1
$$;

CREATE FUNCTION public.salon_user_has_role(allowed_roles text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(public.salon_current_user_role() = any(allowed_roles), false)
$$;

CREATE FUNCTION public.set_push_subscriptions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

CREATE FUNCTION public.store_current_user_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select up.role
  from public.user_profiles up
  where (
      up.auth_user_id = auth.uid()
      or lower(up.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    and coalesce(up.active, true) = true
  limit 1
$$;

CREATE FUNCTION public.store_user_has_role(allowed_roles text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(public.store_current_user_role() = any(allowed_roles), false)
$$;

ALTER TABLE ONLY public.appointment_extra_items
    ADD CONSTRAINT appointment_extra_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.appointment_followups
    ADD CONSTRAINT appointment_followups_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.appointment_reviews
    ADD CONSTRAINT appointment_reviews_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.appointment_services
    ADD CONSTRAINT appointment_services_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bot_appointment_requests
    ADD CONSTRAINT bot_appointment_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bot_conversations
    ADD CONSTRAINT bot_conversations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bot_faqs
    ADD CONSTRAINT bot_faqs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bot_knowledge_base
    ADD CONSTRAINT bot_knowledge_base_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bot_media_assets
    ADD CONSTRAINT bot_media_assets_asset_key_key UNIQUE (asset_key);

ALTER TABLE ONLY public.bot_media_assets
    ADD CONSTRAINT bot_media_assets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bot_menu_options
    ADD CONSTRAINT bot_menu_options_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bot_messages
    ADD CONSTRAINT bot_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bot_settings
    ADD CONSTRAINT bot_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.business_settings
    ADD CONSTRAINT business_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.cash_closings
    ADD CONSTRAINT cash_closings_closing_date_key UNIQUE (closing_date);

ALTER TABLE ONLY public.cash_closings
    ADD CONSTRAINT cash_closings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.cashbox_movements
    ADD CONSTRAINT cashbox_movements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.client_memberships
    ADD CONSTRAINT client_memberships_code_key UNIQUE (code);

ALTER TABLE ONLY public.client_memberships
    ADD CONSTRAINT client_memberships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.followup_rules
    ADD CONSTRAINT followup_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.followup_rules
    ADD CONSTRAINT followup_rules_rule_key_key UNIQUE (rule_key);

ALTER TABLE ONLY public.gift_card_transactions
    ADD CONSTRAINT gift_card_transactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_code_key UNIQUE (code);

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.membership_usage
    ADD CONSTRAINT membership_usage_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_template_key_key UNIQUE (template_key);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_extra_items
    ADD CONSTRAINT payment_extra_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_service_items
    ADD CONSTRAINT payment_service_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_settings
    ADD CONSTRAINT payment_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payment_staff_totals
    ADD CONSTRAINT payment_staff_totals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payroll_adjustments
    ADD CONSTRAINT payroll_adjustments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.review_service_ratings
    ADD CONSTRAINT review_service_ratings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.review_staff_ratings
    ADD CONSTRAINT review_staff_ratings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.schedule_blocks
    ADD CONSTRAINT schedule_blocks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.service_extras
    ADD CONSTRAINT service_extras_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.service_resources
    ADD CONSTRAINT service_resources_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_auth_user_id_key UNIQUE (auth_user_id);

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_email_key UNIQUE (email);

ALTER TABLE ONLY public.staff_payroll_settings
    ADD CONSTRAINT staff_payroll_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.staff_payroll_settings
    ADD CONSTRAINT staff_payroll_settings_staff_id_key UNIQUE (staff_id);

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.staff_schedules
    ADD CONSTRAINT staff_schedules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.staff_services
    ADD CONSTRAINT staff_services_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.staff_tasks
    ADD CONSTRAINT staff_tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.staff_time_blocks
    ADD CONSTRAINT staff_time_blocks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.staff_vacations
    ADD CONSTRAINT staff_vacations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_inventory_movements
    ADD CONSTRAINT store_inventory_movements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_products
    ADD CONSTRAINT store_products_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_products
    ADD CONSTRAINT store_products_sku_key UNIQUE (sku);

ALTER TABLE ONLY public.store_sale_items
    ADD CONSTRAINT store_sale_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_sales
    ADD CONSTRAINT store_sales_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_settings
    ADD CONSTRAINT store_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_auth_user_id_key UNIQUE (auth_user_id);

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_email_key UNIQUE (email);

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.vacation_policies
    ADD CONSTRAINT vacation_policies_pkey PRIMARY KEY (id);

CREATE INDEX appointment_extra_items_appointment_id_idx ON public.appointment_extra_items USING btree (appointment_id);

CREATE INDEX appointment_extra_items_appointment_idx ON public.appointment_extra_items USING btree (appointment_id);

CREATE INDEX appointment_extra_items_extra_id_idx ON public.appointment_extra_items USING btree (extra_id);

CREATE INDEX appointment_extra_items_extra_idx ON public.appointment_extra_items USING btree (extra_id);

CREATE INDEX appointment_extra_items_staff_id_idx ON public.appointment_extra_items USING btree (staff_id);

CREATE UNIQUE INDEX appointment_reviews_unique_appointment ON public.appointment_reviews USING btree (appointment_id);

CREATE INDEX appointment_services_staff_date_time_idx ON public.appointment_services USING btree (staff_id, service_date, start_time, end_time);

CREATE INDEX appointments_client_date_idx ON public.appointments USING btree (client_id, appointment_date DESC, start_time DESC);

CREATE INDEX appointments_portal_pending_idx ON public.appointments USING btree (booking_source, confirmation_status, appointment_date DESC);

CREATE UNIQUE INDEX bot_conversations_client_phone_unique ON public.bot_conversations USING btree (client_phone);

CREATE INDEX bot_conversations_last_message_at_idx ON public.bot_conversations USING btree (last_message_at DESC);

CREATE INDEX bot_messages_conversation_created_at_idx ON public.bot_messages USING btree (conversation_id, created_at);

CREATE INDEX cash_movements_created_by_user_id_idx ON public.cash_movements USING btree (created_by_user_id);

CREATE UNIQUE INDEX clients_auth_user_id_unique ON public.clients USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);

CREATE UNIQUE INDEX clients_client_number_unique ON public.clients USING btree (client_number) WHERE (client_number IS NOT NULL);

CREATE INDEX clients_email_lower_idx ON public.clients USING btree (lower(email)) WHERE (email IS NOT NULL);

CREATE INDEX notifications_recipient_auth_user_idx ON public.notifications USING btree (recipient_auth_user_id, is_read, created_at DESC);

CREATE INDEX notifications_recipient_email_idx ON public.notifications USING btree (lower(recipient_email), is_read, created_at DESC);

CREATE INDEX notifications_staff_read_idx ON public.notifications USING btree (staff_id, is_read, created_at);

CREATE INDEX notifications_staff_unread_idx ON public.notifications USING btree (staff_id, is_read, created_at DESC);

CREATE INDEX payments_created_by_user_id_idx ON public.payments USING btree (created_by_user_id);

CREATE INDEX push_subscriptions_auth_user_active_idx ON public.push_subscriptions USING btree (auth_user_id, active);

CREATE UNIQUE INDEX push_subscriptions_endpoint_unique ON public.push_subscriptions USING btree (endpoint);

CREATE INDEX push_subscriptions_staff_active_idx ON public.push_subscriptions USING btree (staff_id, active);

CREATE INDEX push_subscriptions_user_email_active_idx ON public.push_subscriptions USING btree (lower(user_email), active);

CREATE INDEX resources_active_idx ON public.resources USING btree (active, name);

CREATE INDEX service_resources_resource_active_idx ON public.service_resources USING btree (resource_id, active);

CREATE INDEX service_resources_service_active_idx ON public.service_resources USING btree (service_id, active);

CREATE UNIQUE INDEX service_resources_service_resource_unique ON public.service_resources USING btree (service_id, resource_id);

CREATE UNIQUE INDEX services_category_name_unique ON public.services USING btree (category, name);

CREATE INDEX staff_schedules_staff_day_active_idx ON public.staff_schedules USING btree (staff_id, day_of_week, is_active);

CREATE INDEX staff_schedules_staff_day_idx ON public.staff_schedules USING btree (staff_id, day_of_week);

CREATE INDEX staff_services_service_active_idx ON public.staff_services USING btree (service_id, active);

CREATE INDEX staff_services_staff_active_idx ON public.staff_services USING btree (staff_id, active);

CREATE UNIQUE INDEX staff_services_staff_service_unique ON public.staff_services USING btree (staff_id, service_id);

CREATE INDEX staff_tasks_due_date_idx ON public.staff_tasks USING btree (due_date);

CREATE INDEX staff_tasks_staff_status_idx ON public.staff_tasks USING btree (staff_id, status);

CREATE INDEX staff_time_blocks_source_idx ON public.staff_time_blocks USING btree (source_type, source_id);

CREATE INDEX staff_time_blocks_staff_date_idx ON public.staff_time_blocks USING btree (staff_id, block_date, start_time, end_time);

CREATE INDEX staff_time_blocks_staff_date_time_idx ON public.staff_time_blocks USING btree (staff_id, block_date, start_time, end_time);

CREATE INDEX staff_vacations_staff_date_idx ON public.staff_vacations USING btree (staff_id, start_date, end_date);

CREATE INDEX store_inventory_movements_product_idx ON public.store_inventory_movements USING btree (product_id, created_at DESC);

CREATE INDEX store_products_active_idx ON public.store_products USING btree (active);

CREATE INDEX store_products_sku_idx ON public.store_products USING btree (sku);

CREATE INDEX store_sale_items_sale_idx ON public.store_sale_items USING btree (sale_id);

CREATE INDEX store_sales_appointment_idx ON public.store_sales USING btree (appointment_id);

CREATE INDEX store_sales_date_idx ON public.store_sales USING btree (sale_date DESC);

CREATE INDEX store_sales_payment_idx ON public.store_sales USING btree (payment_id);

CREATE INDEX store_sales_source_idx ON public.store_sales USING btree (source);

CREATE INDEX vacation_policies_years_idx ON public.vacation_policies USING btree (years_from, years_to);

CREATE TRIGGER set_clients_client_number BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.assign_client_number();

CREATE TRIGGER set_push_subscriptions_updated_at BEFORE UPDATE ON public.push_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_push_subscriptions_updated_at();

ALTER TABLE ONLY public.appointment_extra_items
    ADD CONSTRAINT appointment_extra_items_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.appointment_extra_items
    ADD CONSTRAINT appointment_extra_items_extra_id_fkey FOREIGN KEY (extra_id) REFERENCES public.service_extras(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.appointment_extra_items
    ADD CONSTRAINT appointment_extra_items_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.appointment_followups
    ADD CONSTRAINT appointment_followups_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.appointment_followups
    ADD CONSTRAINT appointment_followups_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.appointment_followups
    ADD CONSTRAINT appointment_followups_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.appointment_followups
    ADD CONSTRAINT appointment_followups_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.appointment_reviews
    ADD CONSTRAINT appointment_reviews_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.appointment_reviews
    ADD CONSTRAINT appointment_reviews_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.appointment_services
    ADD CONSTRAINT appointment_services_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.appointment_services
    ADD CONSTRAINT appointment_services_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id);

ALTER TABLE ONLY public.appointment_services
    ADD CONSTRAINT appointment_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);

ALTER TABLE ONLY public.appointment_services
    ADD CONSTRAINT appointment_services_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);

ALTER TABLE ONLY public.bot_appointment_requests
    ADD CONSTRAINT bot_appointment_requests_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.bot_appointment_requests
    ADD CONSTRAINT bot_appointment_requests_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.bot_conversations(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.bot_appointment_requests
    ADD CONSTRAINT bot_appointment_requests_created_appointment_id_fkey FOREIGN KEY (created_appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.bot_appointment_requests
    ADD CONSTRAINT bot_appointment_requests_preferred_staff_id_fkey FOREIGN KEY (preferred_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.bot_conversations
    ADD CONSTRAINT bot_conversations_preferred_staff_id_fkey FOREIGN KEY (preferred_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.bot_conversations
    ADD CONSTRAINT bot_conversations_selected_service_id_fkey FOREIGN KEY (selected_service_id) REFERENCES public.services(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.bot_messages
    ADD CONSTRAINT bot_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.bot_conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.cashbox_movements
    ADD CONSTRAINT cashbox_movements_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);

ALTER TABLE ONLY public.cashbox_movements
    ADD CONSTRAINT cashbox_movements_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);

ALTER TABLE ONLY public.cashbox_movements
    ADD CONSTRAINT cashbox_movements_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);

ALTER TABLE ONLY public.client_memberships
    ADD CONSTRAINT client_memberships_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);

ALTER TABLE ONLY public.client_memberships
    ADD CONSTRAINT client_memberships_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.memberships(id);

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_appointment_service_id_fkey FOREIGN KEY (appointment_service_id) REFERENCES public.appointment_services(id);

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);

ALTER TABLE ONLY public.gift_card_transactions
    ADD CONSTRAINT gift_card_transactions_gift_card_id_fkey FOREIGN KEY (gift_card_id) REFERENCES public.gift_cards(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.gift_card_transactions
    ADD CONSTRAINT gift_card_transactions_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_buyer_client_id_fkey FOREIGN KEY (buyer_client_id) REFERENCES public.clients(id);

ALTER TABLE ONLY public.membership_usage
    ADD CONSTRAINT membership_usage_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);

ALTER TABLE ONLY public.membership_usage
    ADD CONSTRAINT membership_usage_client_membership_id_fkey FOREIGN KEY (client_membership_id) REFERENCES public.client_memberships(id);

ALTER TABLE ONLY public.membership_usage
    ADD CONSTRAINT membership_usage_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payment_extra_items
    ADD CONSTRAINT payment_extra_items_extra_id_fkey FOREIGN KEY (extra_id) REFERENCES public.service_extras(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.payment_extra_items
    ADD CONSTRAINT payment_extra_items_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payment_extra_items
    ADD CONSTRAINT payment_extra_items_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.payment_service_items
    ADD CONSTRAINT payment_service_items_appointment_service_id_fkey FOREIGN KEY (appointment_service_id) REFERENCES public.appointment_services(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.payment_service_items
    ADD CONSTRAINT payment_service_items_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payment_service_items
    ADD CONSTRAINT payment_service_items_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.payment_service_items
    ADD CONSTRAINT payment_service_items_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.payment_staff_totals
    ADD CONSTRAINT payment_staff_totals_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.payment_staff_totals
    ADD CONSTRAINT payment_staff_totals_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.payroll_adjustments
    ADD CONSTRAINT payroll_adjustments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.review_service_ratings
    ADD CONSTRAINT review_service_ratings_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.appointment_reviews(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.review_service_ratings
    ADD CONSTRAINT review_service_ratings_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.review_staff_ratings
    ADD CONSTRAINT review_staff_ratings_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.appointment_reviews(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.review_staff_ratings
    ADD CONSTRAINT review_staff_ratings_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.schedule_blocks
    ADD CONSTRAINT schedule_blocks_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id);

ALTER TABLE ONLY public.service_resources
    ADD CONSTRAINT service_resources_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.service_resources
    ADD CONSTRAINT service_resources_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id);

ALTER TABLE ONLY public.staff_payroll_settings
    ADD CONSTRAINT staff_payroll_settings_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.staff_schedules
    ADD CONSTRAINT staff_schedules_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.staff_services
    ADD CONSTRAINT staff_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.staff_services
    ADD CONSTRAINT staff_services_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.staff_tasks
    ADD CONSTRAINT staff_tasks_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.staff_time_blocks
    ADD CONSTRAINT staff_time_blocks_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.staff_vacations
    ADD CONSTRAINT staff_vacations_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.store_inventory_movements
    ADD CONSTRAINT store_inventory_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.store_products(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.store_sale_items
    ADD CONSTRAINT store_sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.store_products(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.store_sale_items
    ADD CONSTRAINT store_sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.store_sales(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.store_sales
    ADD CONSTRAINT store_sales_seller_staff_id_fkey FOREIGN KEY (seller_staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE POLICY "Allow anon insert appointment reviews" ON public.appointment_reviews FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon insert service ratings" ON public.review_service_ratings FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon insert staff ratings" ON public.review_staff_ratings FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon read appointment services for reviews" ON public.appointment_services FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon read appointments for reviews" ON public.appointments FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon read clients for reviews" ON public.clients FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon read services for reviews" ON public.services FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon read staff for reviews" ON public.staff FOR SELECT TO anon USING (true);

CREATE POLICY "Allow authenticated appointment extra items access" ON public.appointment_extra_items TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated appointment services access" ON public.appointment_services TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated appointments access" ON public.appointments TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated bot appointment requests access" ON public.bot_appointment_requests TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated bot conversations access" ON public.bot_conversations TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated bot faqs access" ON public.bot_faqs TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated bot knowledge access" ON public.bot_knowledge_base TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated bot media access" ON public.bot_media_assets TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated bot menu access" ON public.bot_menu_options TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated bot messages access" ON public.bot_messages TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated bot settings access" ON public.bot_settings TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated cash closings access" ON public.cash_closings TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated cash movements access" ON public.cash_movements TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated clients access" ON public.clients TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated followup rules access" ON public.followup_rules TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated followups access" ON public.appointment_followups TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated insert business settings" ON public.business_settings FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated payment extra items access" ON public.payment_extra_items TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated payment service items access" ON public.payment_service_items TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated payment settings access" ON public.payment_settings TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated payment staff totals access" ON public.payment_staff_totals TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated payments access" ON public.payments TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated payroll adjustments access" ON public.payroll_adjustments TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated read business settings" ON public.business_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated read message templates" ON public.message_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated review access" ON public.appointment_reviews TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated service extras access" ON public.service_extras TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated service rating access" ON public.review_service_ratings TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated services access" ON public.services TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated staff access" ON public.staff TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated staff payroll settings access" ON public.staff_payroll_settings TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated staff rating access" ON public.review_staff_ratings TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated staff schedules access" ON public.staff_schedules TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated update business settings" ON public.business_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated update message templates" ON public.message_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated user profiles access" ON public.user_profiles TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role appointment extra items access" ON public.appointment_extra_items TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role appointment services access" ON public.appointment_services TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role appointments access" ON public.appointments TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role bot media access" ON public.bot_media_assets TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role clients access" ON public.clients TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role services access" ON public.services TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role staff access" ON public.staff TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role staff schedules access" ON public.staff_schedules TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.appointment_extra_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY appointment_extra_items_delete_admin_encargada ON public.appointment_extra_items FOR DELETE TO authenticated USING (public.agenda_user_has_role(ARRAY['admin'::text, 'encargada'::text]));

CREATE POLICY appointment_extra_items_insert_admin_encargada ON public.appointment_extra_items FOR INSERT TO authenticated WITH CHECK (public.agenda_user_has_role(ARRAY['admin'::text, 'encargada'::text]));

CREATE POLICY appointment_extra_items_select_agenda_roles ON public.appointment_extra_items FOR SELECT TO authenticated USING (public.agenda_user_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'tecnica'::text]));

CREATE POLICY appointment_extra_items_update_admin_encargada ON public.appointment_extra_items FOR UPDATE TO authenticated USING (public.agenda_user_has_role(ARRAY['admin'::text, 'encargada'::text])) WITH CHECK (public.agenda_user_has_role(ARRAY['admin'::text, 'encargada'::text]));

ALTER TABLE public.appointment_followups ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.appointment_reviews ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.appointment_services ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can insert clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated can manage appointment services" ON public.appointment_services TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can manage appointments" ON public.appointments TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can manage cashbox movements" ON public.cashbox_movements TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can manage client memberships" ON public.client_memberships TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can manage commissions" ON public.commissions TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can manage gift card transactions" ON public.gift_card_transactions TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can manage gift cards" ON public.gift_cards TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can manage membership usage" ON public.membership_usage TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can manage notifications" ON public.notifications TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can manage payments" ON public.payments TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can manage schedule blocks" ON public.schedule_blocks TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can manage services" ON public.services TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can manage staff" ON public.staff TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can manage staff schedules" ON public.staff_schedules TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can manage staff tasks" ON public.staff_tasks TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can manage staff time blocks" ON public.staff_time_blocks TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can manage staff vacations" ON public.staff_vacations TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can manage vacation policies" ON public.vacation_policies TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated can read clients" ON public.clients FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can read memberships" ON public.memberships FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can read promotions" ON public.promotions FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can read services" ON public.services FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can read staff" ON public.staff FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can update clients" ON public.clients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.bot_appointment_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bot_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY bot_conversations_select_admin ON public.bot_conversations FOR SELECT TO authenticated USING (public.bot_user_is_admin());

CREATE POLICY bot_conversations_update_admin ON public.bot_conversations FOR UPDATE TO authenticated USING (public.bot_user_is_admin()) WITH CHECK (public.bot_user_is_admin());

ALTER TABLE public.bot_faqs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bot_knowledge_base ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bot_media_assets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bot_menu_options ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bot_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bot_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cashbox_movements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_portal_appointment_services_manage_staff ON public.appointment_services USING (public.client_portal_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'tecnica'::text])) WITH CHECK (public.client_portal_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'tecnica'::text]));

CREATE POLICY client_portal_appointment_services_select_own_or_staff ON public.appointment_services FOR SELECT USING (((EXISTS ( SELECT 1
   FROM (public.appointments a
     JOIN public.clients c ON ((c.id = a.client_id)))
  WHERE ((a.id = appointment_services.appointment_id) AND (c.auth_user_id = auth.uid())))) OR public.client_portal_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'tecnica'::text])));

CREATE POLICY client_portal_appointments_manage_staff ON public.appointments USING (public.client_portal_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'tecnica'::text])) WITH CHECK (public.client_portal_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'tecnica'::text]));

CREATE POLICY client_portal_appointments_select_own_or_staff ON public.appointments FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.clients c
  WHERE ((c.id = appointments.client_id) AND (c.auth_user_id = auth.uid())))) OR public.client_portal_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'tecnica'::text])));

CREATE POLICY client_portal_clients_manage_staff ON public.clients USING (public.client_portal_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'tecnica'::text])) WITH CHECK (public.client_portal_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'tecnica'::text]));

CREATE POLICY client_portal_clients_select_own_or_staff ON public.clients FOR SELECT USING (((auth_user_id = auth.uid()) OR public.client_portal_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'tecnica'::text])));

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.followup_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gift_card_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.membership_usage ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_extra_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_service_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_staff_totals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions FOR DELETE TO authenticated USING (((auth_user_id = auth.uid()) OR (lower(user_email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)))));

CREATE POLICY push_subscriptions_delete_own_or_admin ON public.push_subscriptions FOR DELETE TO authenticated USING (((auth_user_id = auth.uid()) OR (lower(user_email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text))) OR public.push_user_has_role(ARRAY['admin'::text, 'encargada'::text])));

CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK (((auth_user_id = auth.uid()) OR (lower(user_email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text))) OR public.push_user_has_role(ARRAY['admin'::text, 'encargada'::text])));

CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions FOR SELECT TO authenticated USING (((auth_user_id = auth.uid()) OR (lower(user_email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)))));

CREATE POLICY push_subscriptions_select_own_or_admin ON public.push_subscriptions FOR SELECT TO authenticated USING (((auth_user_id = auth.uid()) OR (lower(user_email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text))) OR public.push_user_has_role(ARRAY['admin'::text, 'encargada'::text])));

CREATE POLICY push_subscriptions_update_own ON public.push_subscriptions FOR UPDATE TO authenticated USING (((auth_user_id = auth.uid()) OR (lower(user_email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text))))) WITH CHECK (((auth_user_id = auth.uid()) OR (lower(user_email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)))));

CREATE POLICY push_subscriptions_update_own_or_admin ON public.push_subscriptions FOR UPDATE TO authenticated USING (((auth_user_id = auth.uid()) OR (lower(user_email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text))) OR public.push_user_has_role(ARRAY['admin'::text, 'encargada'::text]))) WITH CHECK (((auth_user_id = auth.uid()) OR (lower(user_email) = lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text))) OR public.push_user_has_role(ARRAY['admin'::text, 'encargada'::text])));

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY resources_manage_admin_encargada ON public.resources TO authenticated USING (public.salon_user_has_role(ARRAY['admin'::text, 'encargada'::text])) WITH CHECK (public.salon_user_has_role(ARRAY['admin'::text, 'encargada'::text]));

CREATE POLICY resources_select_agenda_roles ON public.resources FOR SELECT TO authenticated USING (public.salon_user_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'tecnica'::text]));

ALTER TABLE public.review_service_ratings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.review_staff_ratings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.service_extras ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.service_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_resources_manage_admin_encargada ON public.service_resources TO authenticated USING (public.salon_user_has_role(ARRAY['admin'::text, 'encargada'::text])) WITH CHECK (public.salon_user_has_role(ARRAY['admin'::text, 'encargada'::text]));

CREATE POLICY service_resources_select_agenda_roles ON public.service_resources FOR SELECT TO authenticated USING (public.salon_user_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'tecnica'::text]));

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff_payroll_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff_schedules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_services_manage_admin_encargada ON public.staff_services TO authenticated USING (public.salon_user_has_role(ARRAY['admin'::text, 'encargada'::text])) WITH CHECK (public.salon_user_has_role(ARRAY['admin'::text, 'encargada'::text]));

CREATE POLICY staff_services_select_agenda_roles ON public.staff_services FOR SELECT TO authenticated USING (public.salon_user_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'tecnica'::text]));

ALTER TABLE public.staff_tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff_time_blocks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff_vacations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_inventory_movements_delete_admin ON public.store_inventory_movements FOR DELETE TO authenticated USING (public.store_user_has_role(ARRAY['admin'::text]));

CREATE POLICY store_inventory_movements_insert_staff_tienda ON public.store_inventory_movements FOR INSERT TO authenticated WITH CHECK (public.store_user_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text]));

CREATE POLICY store_inventory_movements_select_tienda_roles ON public.store_inventory_movements FOR SELECT TO authenticated USING (public.store_user_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'product_owner'::text]));

ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_products_delete_admin ON public.store_products FOR DELETE TO authenticated USING (public.store_user_has_role(ARRAY['admin'::text]));

CREATE POLICY store_products_insert_admin_encargada ON public.store_products FOR INSERT TO authenticated WITH CHECK (public.store_user_has_role(ARRAY['admin'::text, 'encargada'::text]));

CREATE POLICY store_products_select_tienda_roles ON public.store_products FOR SELECT TO authenticated USING (public.store_user_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'product_owner'::text, 'tecnica'::text]));

CREATE POLICY store_products_update_admin_encargada_caja ON public.store_products FOR UPDATE TO authenticated USING (public.store_user_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text])) WITH CHECK (public.store_user_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text]));

ALTER TABLE public.store_sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_sale_items_delete_admin ON public.store_sale_items FOR DELETE TO authenticated USING (public.store_user_has_role(ARRAY['admin'::text]));

CREATE POLICY store_sale_items_insert_staff_tienda ON public.store_sale_items FOR INSERT TO authenticated WITH CHECK (public.store_user_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text]));

CREATE POLICY store_sale_items_select_tienda_roles ON public.store_sale_items FOR SELECT TO authenticated USING (public.store_user_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'product_owner'::text]));

CREATE POLICY store_sale_items_update_admin_encargada ON public.store_sale_items FOR UPDATE TO authenticated USING (public.store_user_has_role(ARRAY['admin'::text, 'encargada'::text])) WITH CHECK (public.store_user_has_role(ARRAY['admin'::text, 'encargada'::text]));

ALTER TABLE public.store_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_sales_delete_admin ON public.store_sales FOR DELETE TO authenticated USING (public.store_user_has_role(ARRAY['admin'::text]));

CREATE POLICY store_sales_insert_staff_tienda ON public.store_sales FOR INSERT TO authenticated WITH CHECK (public.store_user_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text]));

CREATE POLICY store_sales_select_tienda_roles ON public.store_sales FOR SELECT TO authenticated USING (public.store_user_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'product_owner'::text]));

CREATE POLICY store_sales_update_admin_encargada ON public.store_sales FOR UPDATE TO authenticated USING (public.store_user_has_role(ARRAY['admin'::text, 'encargada'::text])) WITH CHECK (public.store_user_has_role(ARRAY['admin'::text, 'encargada'::text]));

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_settings_delete_admin ON public.store_settings FOR DELETE TO authenticated USING (public.store_user_has_role(ARRAY['admin'::text]));

CREATE POLICY store_settings_insert_admin ON public.store_settings FOR INSERT TO authenticated WITH CHECK (public.store_user_has_role(ARRAY['admin'::text]));

CREATE POLICY store_settings_select_tienda_roles ON public.store_settings FOR SELECT TO authenticated USING (public.store_user_has_role(ARRAY['admin'::text, 'encargada'::text, 'caja'::text, 'product_owner'::text]));

CREATE POLICY store_settings_update_admin ON public.store_settings FOR UPDATE TO authenticated USING (public.store_user_has_role(ARRAY['admin'::text])) WITH CHECK (public.store_user_has_role(ARRAY['admin'::text]));

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vacation_policies ENABLE ROW LEVEL SECURITY;

CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
         WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
   EXECUTE FUNCTION public.rls_auto_enable();

COMMIT;
