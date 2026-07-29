-- Derived from supabase_appointment_transaction.sql.
-- Contains no exported rows or production data.
-- Adds transactional appointment write operation table and RPC.
-- Dependencies: public clients, staff, services, schedules, appointments and appointment relation tables.

-- Creación transaccional e idempotente de citas para Alexandra Ruiz Salón.
-- ARCHIVO PARA REVISIÓN: no ejecutar sin pasar primero por staging.
-- No crea pagos, no verifica anticipos y no envía mensajes.

begin;

create extension if not exists pgcrypto;

create table if not exists public.appointment_write_operations (
  id uuid primary key default gen_random_uuid(),
  source text not null
    check (source in ('admin', 'client_portal', 'bot')),
  actor_id uuid null,
  idempotency_key text not null,
  conversation_id uuid null
    references public.bot_conversations(id) on delete restrict,
  preview_id text not null,
  confirmation_id text not null,
  status text not null default 'processing'
    check (
      status in (
        'processing',
        'created',
        'failed',
        'expired',
        'human_review'
      )
    ),
  appointment_id uuid null
    references public.appointments(id) on delete set null,
  request_hash text not null,
  result jsonb null,
  error_code text null,
  error_message text null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_write_operations_idempotency_key_unique
    unique (idempotency_key),
  constraint appointment_write_operations_confirmation_unique
    unique (source, preview_id, confirmation_id)
);

create index if not exists appointment_write_operations_source_idx
  on public.appointment_write_operations (source, created_at desc);

create index if not exists appointment_write_operations_conversation_idx
  on public.appointment_write_operations (conversation_id, created_at desc)
  where conversation_id is not null;

create index if not exists appointment_write_operations_appointment_idx
  on public.appointment_write_operations (appointment_id)
  where appointment_id is not null;

create index if not exists clients_phone_digits_idx
  on public.clients (
    regexp_replace(coalesce(phone, ''), '\D', '', 'g')
  )
  where phone is not null;

alter table public.appointment_write_operations enable row level security;

revoke all on table public.appointment_write_operations
  from public, anon, authenticated;
grant select, insert, update on table public.appointment_write_operations
  to service_role;

create or replace function public.create_appointment_transaction(
  p_source text,
  p_actor_id uuid,
  p_idempotency_key text,
  p_conversation_id uuid,
  p_preview_id text,
  p_confirmation_id text,
  p_preview_version integer,
  p_preview_fingerprint text,
  p_client_id uuid default null,
  p_client_name text default null,
  p_client_phone text default null,
  p_services jsonb default '[]'::jsonb,
  p_extras jsonb default '[]'::jsonb,
  p_participant_id text default null,
  p_appointment_date date default null,
  p_start_time time without time zone default null,
  p_expected_end_time time without time zone default null,
  p_staff_id uuid default null,
  p_expected_price numeric default null,
  p_deposit_status text default 'unknown',
  p_preview_expires_at timestamptz default null,
  p_force_created boolean default false,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source text := lower(trim(coalesce(p_source, '')));
  v_request jsonb;
  v_request_hash text;
  v_operation public.appointment_write_operations%rowtype;
  v_result jsonb;
  v_conversation public.bot_conversations%rowtype;
  v_phone_digits text;
  v_client public.clients%rowtype;
  v_staff public.staff%rowtype;
  v_schedule public.staff_schedules%rowtype;
  v_service public.services%rowtype;
  v_extra public.service_extras%rowtype;
  v_resource public.resources%rowtype;
  v_item jsonb;
  v_extra_item jsonb;
  v_segment jsonb;
  v_segments jsonb := '[]'::jsonb;
  v_extra_segments jsonb := '[]'::jsonb;
  v_cursor timestamp without time zone;
  v_segment_end timestamp without time zone;
  v_end_at timestamp without time zone;
  v_now_local timestamp without time zone :=
    timezone('America/Mexico_City', now());
  v_lead_time_minutes integer := 20;
  v_estimated_total numeric := 0;
  v_service_count integer := 0;
  v_services_created integer := 0;
  v_extra_count integer := 0;
  v_extras_created integer := 0;
  v_existing_usage integer := 0;
  v_new_usage integer := 0;
  v_appointment_id uuid;
begin
  if
    v_source not in ('admin', 'client_portal', 'bot')
    or nullif(trim(coalesce(p_idempotency_key, '')), '') is null
    or (v_source = 'bot' and p_conversation_id is null)
    or (v_source in ('admin', 'client_portal') and p_actor_id is null)
    or nullif(trim(coalesce(p_preview_id, '')), '') is null
    or nullif(trim(coalesce(p_confirmation_id, '')), '') is null
    or coalesce(p_preview_version, 0) < 1
    or nullif(trim(coalesce(p_preview_fingerprint, '')), '') is null
  then
    return jsonb_build_object(
      'status', 'invalid_request',
      'appointmentId', null,
      'clientId', null,
      'idempotencyKey', coalesce(p_idempotency_key, ''),
      'isReplay', false,
      'servicesCreated', 0,
      'errorCode', 'missing_confirmation_identity',
      'errorMessage', 'La confirmación no contiene todos los identificadores requeridos.'
    );
  end if;

  if jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) < 1 then
    return jsonb_build_object(
      'status', 'invalid_request',
      'appointmentId', null,
      'clientId', null,
      'idempotencyKey', p_idempotency_key,
      'isReplay', false,
      'servicesCreated', 0,
      'errorCode', 'services_required',
      'errorMessage', 'La solicitud no contiene servicios válidos.'
    );
  end if;

  if
    jsonb_typeof(p_extras) <> 'array'
    or (v_source <> 'admin' and jsonb_array_length(p_extras) > 0)
  then
    return jsonb_build_object(
      'status', 'invalid_request',
      'appointmentId', null,
      'clientId', null,
      'idempotencyKey', p_idempotency_key,
      'isReplay', false,
      'servicesCreated', 0,
      'errorCode', 'invalid_extras',
      'errorMessage', 'Los extras enviados no son válidos para este canal.'
    );
  end if;

  v_phone_digits := regexp_replace(
    coalesce(p_client_phone, ''),
    '\D',
    '',
    'g'
  );

  v_request := jsonb_build_object(
    'source', v_source,
    'actorId', p_actor_id,
    'conversationId', p_conversation_id,
    'previewId', trim(p_preview_id),
    'confirmationId', trim(p_confirmation_id),
    'previewVersion', p_preview_version,
    'previewFingerprint', trim(p_preview_fingerprint),
    'client', jsonb_build_object(
      'id', p_client_id,
      'name', trim(coalesce(p_client_name, '')),
      'phoneDigits', v_phone_digits
    ),
    'participantId', trim(coalesce(p_participant_id, '')),
    'services', p_services,
    'extras', p_extras,
    'date', p_appointment_date,
    'startTime', p_start_time,
    'expectedEndTime', p_expected_end_time,
    'staffId', p_staff_id,
    'expectedPrice', p_expected_price,
    'depositStatus', lower(trim(coalesce(p_deposit_status, 'unknown'))),
    'previewExpiresAt', p_preview_expires_at,
    'forceCreated', coalesce(p_force_created, false),
    'notes', trim(coalesce(p_notes, ''))
  );

  v_request_hash := encode(
    extensions.digest(convert_to(v_request::text, 'UTF8'), 'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended(
      'appointment-idempotency:' || trim(p_idempotency_key),
      0
    )
  );
  perform pg_advisory_xact_lock(
    hashtextextended(
      'appointment-confirmation:'
        || v_source
        || ':'
        || trim(p_preview_id)
        || ':'
        || trim(p_confirmation_id),
      0
    )
  );

  select operation.*
  into v_operation
  from public.appointment_write_operations operation
  where
    operation.idempotency_key = trim(p_idempotency_key)
    or (
      operation.source = v_source
      and operation.preview_id = trim(p_preview_id)
      and operation.confirmation_id = trim(p_confirmation_id)
    )
  order by
    (operation.idempotency_key = trim(p_idempotency_key)) desc,
    operation.created_at asc
  limit 1
  for update;

  if found then
    if
      v_operation.idempotency_key <> trim(p_idempotency_key)
      or v_operation.request_hash <> v_request_hash
    then
      return jsonb_build_object(
        'status', 'idempotency_conflict',
        'appointmentId', v_operation.appointment_id,
        'clientId', null,
        'idempotencyKey', trim(p_idempotency_key),
        'isReplay', true,
        'servicesCreated', 0,
        'errorCode', 'idempotency_payload_mismatch',
        'errorMessage', 'La confirmación ya fue utilizada con datos diferentes.'
      );
    end if;

    if v_operation.result is not null then
      return v_operation.result || jsonb_build_object(
        'status',
          case
            when v_operation.status = 'created' then 'already_created'
            else coalesce(v_operation.result ->> 'status', 'failed')
          end,
        'isReplay', true
      );
    end if;

    return jsonb_build_object(
      'status', 'failed',
      'appointmentId', v_operation.appointment_id,
      'clientId', null,
      'idempotencyKey', v_operation.idempotency_key,
      'isReplay', true,
      'servicesCreated', 0,
      'errorCode', 'idempotency_result_missing',
      'errorMessage', 'La operación anterior no tiene un resultado verificable.'
    );
  end if;

  insert into public.appointment_write_operations (
    source,
    actor_id,
    idempotency_key,
    conversation_id,
    preview_id,
    confirmation_id,
    status,
    request_hash,
    expires_at
  )
  values (
    v_source,
    p_actor_id,
    trim(p_idempotency_key),
    p_conversation_id,
    trim(p_preview_id),
    trim(p_confirmation_id),
    'processing',
    v_request_hash,
    p_preview_expires_at
  )
  returning * into v_operation;

  begin
    if
      v_source <> 'admin'
      and (
        p_preview_expires_at is null
        or p_preview_expires_at <= now()
      )
    then
      v_result := jsonb_build_object(
        'status', 'invalid_request',
        'appointmentId', null,
        'clientId', null,
        'idempotencyKey', trim(p_idempotency_key),
        'isReplay', false,
        'servicesCreated', 0,
        'errorCode', 'preview_expired',
        'errorMessage', 'La vista previa venció y debe generarse nuevamente.'
      );
      update public.appointment_write_operations
      set
        status = 'expired',
        result = v_result,
        error_code = 'preview_expired',
        error_message = 'La vista previa venció.',
        updated_at = now()
      where id = v_operation.id;
      return v_result;
    end if;

    if v_source = 'bot' then
    select conversation.*
    into v_conversation
    from public.bot_conversations conversation
    where conversation.id = p_conversation_id
    for update;

    if
      not found
      or coalesce(v_conversation.bot_enabled, true) = false
      or coalesce(v_conversation.handoff_to_human, false) = true
    then
      v_result := jsonb_build_object(
        'status', 'human_review',
        'appointmentId', null,
        'clientId', null,
        'idempotencyKey', trim(p_idempotency_key),
        'isReplay', false,
        'servicesCreated', 0,
        'errorCode', 'conversation_not_eligible',
        'errorMessage', 'La conversación requiere revisión del equipo.'
      );
      update public.appointment_write_operations
      set
        status = 'human_review',
        result = v_result,
        error_code = 'conversation_not_eligible',
        error_message = 'La conversación no permite creación automática.',
        updated_at = now()
      where id = v_operation.id;
      return v_result;
    end if;

    if
      coalesce(
        v_conversation.conversation_context #>>
          '{conversation_engine_state,appointmentDraft,conversationId}',
        ''
      ) <> p_conversation_id::text
      or coalesce(
        v_conversation.conversation_context #>>
          '{conversation_engine_state,appointmentDraft,previewId}',
        ''
      ) <> trim(p_preview_id)
      or coalesce(
        v_conversation.conversation_context #>>
          '{conversation_engine_state,appointmentDraft,confirmation,id}',
        ''
      ) <> trim(p_confirmation_id)
      or coalesce(
        v_conversation.conversation_context #>>
          '{conversation_engine_state,appointmentDraft,confirmation,previewId}',
        ''
      ) <> trim(p_preview_id)
      or coalesce(
        v_conversation.conversation_context #>>
          '{conversation_engine_state,appointmentDraft,fingerprint}',
        ''
      ) <> trim(p_preview_fingerprint)
      or coalesce(
        v_conversation.conversation_context #>>
          '{conversation_engine_state,appointmentDraft,confirmation,fingerprint}',
        ''
      ) <> trim(p_preview_fingerprint)
      or (
        case
          when coalesce(
            v_conversation.conversation_context #>>
              '{conversation_engine_state,appointmentDraft,version}',
            ''
          ) ~ '^\d+$'
          then (
            v_conversation.conversation_context #>>
              '{conversation_engine_state,appointmentDraft,version}'
          )::integer
          else null
        end
      ) is distinct from p_preview_version
      or coalesce(
        v_conversation.conversation_context #>>
          '{conversation_engine_state,appointmentDraft,status}',
        ''
      ) not in ('customer_confirmed', 'ready_for_write')
    then
      v_result := jsonb_build_object(
        'status', 'invalid_request',
        'appointmentId', null,
        'clientId', null,
        'idempotencyKey', trim(p_idempotency_key),
        'isReplay', false,
        'servicesCreated', 0,
        'errorCode', 'persisted_confirmation_mismatch',
        'errorMessage', 'La vista previa guardada debe confirmarse nuevamente.'
      );
      update public.appointment_write_operations
      set
        status = 'failed',
        result = v_result,
        error_code = 'persisted_confirmation_mismatch',
        error_message = 'La identidad persistida no coincide con la solicitud.',
        updated_at = now()
      where id = v_operation.id;
      return v_result;
    end if;

    if not exists (
      select 1
      from public.bot_settings settings
      where coalesce(settings.active, false) = true
    ) then
      v_result := jsonb_build_object(
        'status', 'human_review',
        'appointmentId', null,
        'clientId', null,
        'idempotencyKey', trim(p_idempotency_key),
        'isReplay', false,
        'servicesCreated', 0,
        'errorCode', 'bot_inactive',
        'errorMessage', 'El bot está desactivado.'
      );
      update public.appointment_write_operations
      set
        status = 'human_review',
        result = v_result,
        error_code = 'bot_inactive',
        error_message = 'El bot está desactivado.',
        updated_at = now()
      where id = v_operation.id;
      return v_result;
    end if;
    end if;

    if coalesce(p_force_created, false) = true and v_source <> 'admin' then
      v_result := jsonb_build_object(
        'status', 'invalid_request',
        'appointmentId', null,
        'clientId', null,
        'idempotencyKey', trim(p_idempotency_key),
        'isReplay', false,
        'servicesCreated', 0,
        'errorCode', 'force_not_allowed',
        'errorMessage', 'La solicitud no permite forzar la cita.'
      );
      update public.appointment_write_operations
      set
        status = 'failed',
        result = v_result,
        error_code = 'force_not_allowed',
        error_message = 'Solo agenda administrativa puede solicitar force_created.',
        updated_at = now()
      where id = v_operation.id;
      return v_result;
    end if;

    if lower(trim(coalesce(p_deposit_status, 'unknown'))) = 'required_pending' then
      v_result := jsonb_build_object(
        'status', 'deposit_pending',
        'appointmentId', null,
        'clientId', null,
        'idempotencyKey', trim(p_idempotency_key),
        'isReplay', false,
        'servicesCreated', 0,
        'errorCode', 'deposit_pending',
        'errorMessage', 'El anticipo requerido todavía no está verificado.'
      );
      update public.appointment_write_operations
      set
        status = 'human_review',
        result = v_result,
        error_code = 'deposit_pending',
        error_message = 'El anticipo requerido todavía no está verificado.',
        updated_at = now()
      where id = v_operation.id;
      return v_result;
    end if;

    if lower(trim(coalesce(p_deposit_status, 'unknown')))
      not in ('unknown', 'not_required', 'verified')
    then
      v_result := jsonb_build_object(
        'status', 'human_review',
        'appointmentId', null,
        'clientId', null,
        'idempotencyKey', trim(p_idempotency_key),
        'isReplay', false,
        'servicesCreated', 0,
        'errorCode', 'deposit_requires_review',
        'errorMessage', 'El estado del anticipo requiere revisión del equipo.'
      );
      update public.appointment_write_operations
      set
        status = 'human_review',
        result = v_result,
        error_code = 'deposit_requires_review',
        error_message = 'El estado del anticipo no permite creación automática.',
        updated_at = now()
      where id = v_operation.id;
      return v_result;
    end if;

    if
      p_appointment_date is null
      or p_start_time is null
      or p_expected_end_time is null
      or p_staff_id is null
      or nullif(trim(coalesce(p_participant_id, '')), '') is null
      or p_appointment_date + p_start_time >=
        p_appointment_date + p_expected_end_time
    then
      v_result := jsonb_build_object(
        'status', 'invalid_request',
        'appointmentId', null,
        'clientId', null,
        'idempotencyKey', trim(p_idempotency_key),
        'isReplay', false,
        'servicesCreated', 0,
        'errorCode', 'invalid_appointment_data',
        'errorMessage', 'La fecha, horario, colaboradora o participante no son válidos.'
      );
      update public.appointment_write_operations
      set
        status = 'failed',
        result = v_result,
        error_code = 'invalid_appointment_data',
        error_message = 'Los datos mínimos de la cita no son válidos.',
        updated_at = now()
      where id = v_operation.id;
      return v_result;
    end if;

    select person.*
    into v_staff
    from public.staff person
    where person.id = p_staff_id
      and coalesce(person.active, false) = true;

    if not found then
      v_result := jsonb_build_object(
        'status', 'invalid_staff',
        'appointmentId', null,
        'clientId', null,
        'idempotencyKey', trim(p_idempotency_key),
        'isReplay', false,
        'servicesCreated', 0,
        'errorCode', 'staff_unavailable',
        'errorMessage', 'La colaboradora seleccionada ya no está disponible.'
      );
      update public.appointment_write_operations
      set
        status = 'failed',
        result = v_result,
        error_code = 'staff_unavailable',
        error_message = 'La colaboradora no existe o está inactiva.',
        updated_at = now()
      where id = v_operation.id;
      return v_result;
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(
        'appointment-staff-day:'
          || p_staff_id::text
          || ':'
          || p_appointment_date::text,
        0
      )
    );

    v_cursor := p_appointment_date + p_start_time;

    for v_item in
      select item.value
      from jsonb_array_elements(p_services) with ordinality as item(value, position)
      order by item.position
    loop
      if
        nullif(trim(coalesce(v_item ->> 'serviceId', '')), '') is null
        or (v_item ->> 'serviceId') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or trim(coalesce(v_item ->> 'participantId', '')) <>
          trim(p_participant_id)
      then
        v_result := jsonb_build_object(
          'status', 'invalid_service',
          'appointmentId', null,
          'clientId', null,
          'idempotencyKey', trim(p_idempotency_key),
          'isReplay', false,
          'servicesCreated', 0,
          'errorCode', 'invalid_service_assignment',
          'errorMessage', 'Un servicio o participante no es válido.'
        );
        update public.appointment_write_operations
        set
          status = 'failed',
          result = v_result,
          error_code = 'invalid_service_assignment',
          error_message = 'La asignación de servicios no es válida.',
          updated_at = now()
        where id = v_operation.id;
        return v_result;
      end if;

      select service.*
      into v_service
      from public.services service
      where service.id = (v_item ->> 'serviceId')::uuid;

      if
        not found
        or coalesce(v_service.active, false) = false
        or (
          v_source in ('bot', 'client_portal')
          and (
            coalesce(v_service.bot_active, false) = false
            or coalesce(v_service.bot_bookable, false) = false
            or coalesce(v_service.service_type, 'servicio') <> 'servicio'
          )
        )
      then
        v_result := jsonb_build_object(
          'status', 'invalid_service',
          'appointmentId', null,
          'clientId', null,
          'idempotencyKey', trim(p_idempotency_key),
          'isReplay', false,
          'servicesCreated', 0,
          'errorCode', 'service_unavailable',
          'errorMessage', 'Uno de los servicios ya no está disponible.'
        );
        update public.appointment_write_operations
        set
          status = 'failed',
          result = v_result,
          error_code = 'service_unavailable',
          error_message = 'El servicio no existe, está inactivo o no permite agenda por bot.',
          updated_at = now()
        where id = v_operation.id;
        return v_result;
      end if;

      if coalesce(v_service.variable_pricing, false) = true then
        v_result := jsonb_build_object(
          'status', 'human_review',
          'appointmentId', null,
          'clientId', null,
          'idempotencyKey', trim(p_idempotency_key),
          'isReplay', false,
          'servicesCreated', 0,
          'errorCode', 'variable_price_requires_review',
          'errorMessage', 'El servicio requiere valoración de precio.'
        );
        update public.appointment_write_operations
        set
          status = 'human_review',
          result = v_result,
          error_code = 'variable_price_requires_review',
          error_message = 'El servicio tiene precio variable.',
          updated_at = now()
        where id = v_operation.id;
        return v_result;
      end if;

      if
        coalesce(v_item ->> 'durationMinutes', '') !~ '^\d+$'
        or coalesce(v_item ->> 'cleanupMinutes', '') !~ '^\d+$'
        or coalesce(v_item ->> 'price', '') !~ '^-?\d+(\.\d+)?$'
        or (v_item ->> 'durationMinutes')::integer <>
          coalesce(v_service.duration_minutes, 0)
        or (v_item ->> 'cleanupMinutes')::integer <>
          coalesce(v_service.cleanup_minutes, 0)
        or (v_item ->> 'price')::numeric <>
          coalesce(v_service.base_price, 0)
      then
        v_result := jsonb_build_object(
          'status', 'invalid_request',
          'appointmentId', null,
          'clientId', null,
          'idempotencyKey', trim(p_idempotency_key),
          'isReplay', false,
          'servicesCreated', 0,
          'errorCode', 'preview_service_changed',
          'errorMessage', 'El precio o duración cambió; revisa una vista previa nueva.'
        );
        update public.appointment_write_operations
        set
          status = 'failed',
          result = v_result,
          error_code = 'preview_service_changed',
          error_message = 'El catálogo cambió después de la vista previa.',
          updated_at = now()
        where id = v_operation.id;
        return v_result;
      end if;

      if
        not (v_source = 'admin' and coalesce(p_force_created, false))
        and exists (
          select 1
          from public.staff_services configured
          where configured.service_id = v_service.id
            and coalesce(configured.active, false) = true
        )
        and not exists (
          select 1
          from public.staff_services allowed
          where allowed.service_id = v_service.id
            and allowed.staff_id = p_staff_id
            and coalesce(allowed.active, false) = true
        )
      then
        v_result := jsonb_build_object(
          'status', 'invalid_staff',
          'appointmentId', null,
          'clientId', null,
          'idempotencyKey', trim(p_idempotency_key),
          'isReplay', false,
          'servicesCreated', 0,
          'errorCode', 'staff_service_not_allowed',
          'errorMessage', 'La colaboradora no está habilitada para uno de los servicios.'
        );
        update public.appointment_write_operations
        set
          status = 'failed',
          result = v_result,
          error_code = 'staff_service_not_allowed',
          error_message = 'La relación colaboradora-servicio no es válida.',
          updated_at = now()
        where id = v_operation.id;
        return v_result;
      end if;

      if
        coalesce(v_service.duration_minutes, 0)
          + coalesce(v_service.cleanup_minutes, 0) <= 0
      then
        v_result := jsonb_build_object(
          'status', 'invalid_service',
          'appointmentId', null,
          'clientId', null,
          'idempotencyKey', trim(p_idempotency_key),
          'isReplay', false,
          'servicesCreated', 0,
          'errorCode', 'service_duration_missing',
          'errorMessage', 'Uno de los servicios no tiene duración válida.'
        );
        update public.appointment_write_operations
        set
          status = 'failed',
          result = v_result,
          error_code = 'service_duration_missing',
          error_message = 'El servicio no tiene duración válida.',
          updated_at = now()
        where id = v_operation.id;
        return v_result;
      end if;

      v_segment_end := v_cursor + make_interval(
        mins =>
          coalesce(v_service.duration_minutes, 0)
          + coalesce(v_service.cleanup_minutes, 0)
      );
      v_segments := v_segments || jsonb_build_array(
        jsonb_build_object(
          'serviceId', v_service.id,
          'serviceName', v_service.name,
          'participantId', trim(p_participant_id),
          'startTime', v_cursor::time,
          'endTime', v_segment_end::time,
          'durationMinutes', coalesce(v_service.duration_minutes, 0),
          'cleanupMinutes', coalesce(v_service.cleanup_minutes, 0),
          'price', coalesce(v_service.base_price, 0)
        )
      );
      v_estimated_total :=
        v_estimated_total + coalesce(v_service.base_price, 0);
      v_service_count := v_service_count + 1;
      v_cursor := v_segment_end;
    end loop;

    for v_extra_item in
      select item.value
      from jsonb_array_elements(p_extras) with ordinality as item(value, position)
      order by item.position
    loop
      if
        nullif(trim(coalesce(v_extra_item ->> 'extraId', '')), '') is null
        or (v_extra_item ->> 'extraId') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or coalesce(v_extra_item ->> 'quantity', '') !~ '^\d+(\.\d+)?$'
        or (v_extra_item ->> 'quantity')::numeric <= 0
        or coalesce(v_extra_item ->> 'unitPrice', '') !~ '^-?\d+(\.\d+)?$'
        or coalesce(v_extra_item ->> 'totalPrice', '') !~ '^-?\d+(\.\d+)?$'
      then
        v_result := jsonb_build_object(
          'status', 'invalid_request',
          'appointmentId', null,
          'clientId', null,
          'idempotencyKey', trim(p_idempotency_key),
          'isReplay', false,
          'servicesCreated', 0,
          'errorCode', 'invalid_extra',
          'errorMessage', 'Uno de los extras no es válido.'
        );
        update public.appointment_write_operations
        set
          status = 'failed',
          result = v_result,
          error_code = 'invalid_extra',
          error_message = 'La asignación de extras no es válida.',
          updated_at = now()
        where id = v_operation.id;
        return v_result;
      end if;

      select extra.*
      into v_extra
      from public.service_extras extra
      where extra.id = (v_extra_item ->> 'extraId')::uuid
        and coalesce(extra.active, false) = true;

      if
        not found
        or trim(coalesce(v_extra.name, '')) <>
          trim(coalesce(v_extra_item ->> 'name', ''))
        or coalesce(v_extra.price, 0) <>
          (v_extra_item ->> 'unitPrice')::numeric
        or (v_extra_item ->> 'totalPrice')::numeric <>
          round(
            (v_extra_item ->> 'quantity')::numeric *
              coalesce(v_extra.price, 0),
            2
          )
      then
        v_result := jsonb_build_object(
          'status', 'invalid_request',
          'appointmentId', null,
          'clientId', null,
          'idempotencyKey', trim(p_idempotency_key),
          'isReplay', false,
          'servicesCreated', 0,
          'errorCode', 'preview_extra_changed',
          'errorMessage', 'Un extra cambió; revisa los datos de la cita.'
        );
        update public.appointment_write_operations
        set
          status = 'failed',
          result = v_result,
          error_code = 'preview_extra_changed',
          error_message = 'El catálogo de extras cambió.',
          updated_at = now()
        where id = v_operation.id;
        return v_result;
      end if;

      if
        nullif(trim(coalesce(v_extra_item ->> 'staffId', '')), '') is not null
        and (
          (v_extra_item ->> 'staffId') !~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          or not exists (
            select 1
            from public.staff extra_staff
            where extra_staff.id = (v_extra_item ->> 'staffId')::uuid
              and coalesce(extra_staff.active, false) = true
          )
        )
      then
        v_result := jsonb_build_object(
          'status', 'invalid_staff',
          'appointmentId', null,
          'clientId', null,
          'idempotencyKey', trim(p_idempotency_key),
          'isReplay', false,
          'servicesCreated', 0,
          'errorCode', 'invalid_extra_staff',
          'errorMessage', 'La colaboradora asignada al extra no está disponible.'
        );
        update public.appointment_write_operations
        set
          status = 'failed',
          result = v_result,
          error_code = 'invalid_extra_staff',
          error_message = 'La colaboradora del extra no es válida.',
          updated_at = now()
        where id = v_operation.id;
        return v_result;
      end if;

      v_extra_segments := v_extra_segments || jsonb_build_array(
        jsonb_build_object(
          'extraId', v_extra.id,
          'name', v_extra.name,
          'staffId', nullif(trim(coalesce(v_extra_item ->> 'staffId', '')), ''),
          'quantity', (v_extra_item ->> 'quantity')::numeric,
          'unitPrice', coalesce(v_extra.price, 0),
          'totalPrice', round(
            (v_extra_item ->> 'quantity')::numeric *
              coalesce(v_extra.price, 0),
            2
          ),
          'notes', nullif(trim(coalesce(v_extra_item ->> 'notes', '')), '')
        )
      );
      v_estimated_total := v_estimated_total + round(
        (v_extra_item ->> 'quantity')::numeric * coalesce(v_extra.price, 0),
        2
      );
      v_extra_count := v_extra_count + 1;
    end loop;

    v_end_at := v_cursor;

    if
      v_end_at::date <> p_appointment_date
      or v_end_at::time <> p_expected_end_time
      or p_expected_price is null
      or v_estimated_total <> p_expected_price
    then
      v_result := jsonb_build_object(
        'status', 'invalid_request',
        'appointmentId', null,
        'clientId', null,
        'idempotencyKey', trim(p_idempotency_key),
        'isReplay', false,
        'servicesCreated', 0,
        'errorCode', 'preview_totals_changed',
        'errorMessage', 'La duración, hora final o precio cambió desde la vista previa.'
      );
      update public.appointment_write_operations
      set
        status = 'failed',
        result = v_result,
        error_code = 'preview_totals_changed',
        error_message = 'Los totales actuales no coinciden con la vista previa.',
        updated_at = now()
      where id = v_operation.id;
      return v_result;
    end if;

    select schedule.*
    into v_schedule
    from public.staff_schedules schedule
    where schedule.staff_id = p_staff_id
      and schedule.day_of_week =
        extract(dow from p_appointment_date)::integer
      and coalesce(schedule.is_active, false) = true
      and coalesce(schedule.is_day_off, false) = false
    limit 1;

    if
      not (v_source = 'admin' and coalesce(p_force_created, false))
      and (
        not found
        or p_start_time < v_schedule.start_time
        or p_expected_end_time > v_schedule.end_time
        or (
          coalesce(v_schedule.has_break, false) = true
          and v_schedule.break_start is not null
          and v_schedule.break_end is not null
          and p_start_time < v_schedule.break_end
          and p_expected_end_time > v_schedule.break_start
        )
      )
    then
      v_result := jsonb_build_object(
        'status', 'not_available',
        'appointmentId', null,
        'clientId', null,
        'idempotencyKey', trim(p_idempotency_key),
        'isReplay', false,
        'servicesCreated', 0,
        'errorCode', 'outside_staff_schedule',
        'errorMessage', 'El horario ya no está disponible.'
      );
      update public.appointment_write_operations
      set
        status = 'failed',
        result = v_result,
        error_code = 'outside_staff_schedule',
        error_message = 'El horario queda fuera de jornada o descanso.',
        updated_at = now()
      where id = v_operation.id;
      return v_result;
    end if;

    v_lead_time_minutes := case
      when lower(v_staff.full_name) like '%alexandra ruiz%' then 60
      when lower(v_staff.full_name) like '%laura canul%' then 20
      when lower(v_staff.full_name) like '%tania mendez%' then 20
      else 20
    end;

    if
      not (v_source = 'admin' and coalesce(p_force_created, false))
      and p_appointment_date + p_start_time <
        v_now_local + make_interval(mins => v_lead_time_minutes)
    then
      v_result := jsonb_build_object(
        'status', 'not_available',
        'appointmentId', null,
        'clientId', null,
        'idempotencyKey', trim(p_idempotency_key),
        'isReplay', false,
        'servicesCreated', 0,
        'errorCode', 'minimum_notice_not_met',
        'errorMessage', 'El horario ya no cumple la anticipación mínima.'
      );
      update public.appointment_write_operations
      set
        status = 'failed',
        result = v_result,
        error_code = 'minimum_notice_not_met',
        error_message = 'No se cumple la anticipación mínima.',
        updated_at = now()
      where id = v_operation.id;
      return v_result;
    end if;

    if
      not (v_source = 'admin' and coalesce(p_force_created, false))
      and exists (
      select 1
      from public.staff_time_blocks block
      where block.staff_id = p_staff_id
        and block.block_date = p_appointment_date
        and p_start_time < block.end_time
        and p_expected_end_time > block.start_time
    ) then
      v_result := jsonb_build_object(
        'status', 'not_available',
        'appointmentId', null,
        'clientId', null,
        'idempotencyKey', trim(p_idempotency_key),
        'isReplay', false,
        'servicesCreated', 0,
        'errorCode', 'staff_time_block',
        'errorMessage', 'El horario está bloqueado.'
      );
      update public.appointment_write_operations
      set
        status = 'failed',
        result = v_result,
        error_code = 'staff_time_block',
        error_message = 'Existe un bloqueo de agenda.',
        updated_at = now()
      where id = v_operation.id;
      return v_result;
    end if;

    if
      not (v_source = 'admin' and coalesce(p_force_created, false))
      and exists (
      select 1
      from public.appointment_services existing_service
      join public.appointments existing_appointment
        on existing_appointment.id = existing_service.appointment_id
      where existing_service.staff_id = p_staff_id
        and existing_service.service_date = p_appointment_date
        and lower(coalesce(existing_appointment.status, ''))
          not in ('cancelada', 'cancelado', 'cancelled', 'rechazada')
        and p_appointment_date + p_start_time <
          p_appointment_date + coalesce(
            existing_service.end_time,
            (
              p_appointment_date
              + existing_service.start_time
              + make_interval(
                mins =>
                  coalesce(existing_service.duration_minutes, 0)
                  + coalesce(existing_service.cleanup_minutes, 0)
              )
            )::time
          )
        and p_appointment_date + p_expected_end_time >
          p_appointment_date + existing_service.start_time
    ) then
      v_result := jsonb_build_object(
        'status', 'not_available',
        'appointmentId', null,
        'clientId', null,
        'idempotencyKey', trim(p_idempotency_key),
        'isReplay', false,
        'servicesCreated', 0,
        'errorCode', 'staff_overlap',
        'errorMessage', 'El horario fue ocupado por otra cita.'
      );
      update public.appointment_write_operations
      set
        status = 'failed',
        result = v_result,
        error_code = 'staff_overlap',
        error_message = 'Existe un servicio traslapado para la colaboradora.',
        updated_at = now()
      where id = v_operation.id;
      return v_result;
    end if;

    for v_resource in
      select distinct resource.*
      from public.resources resource
      join public.service_resources requirement
        on requirement.resource_id = resource.id
       and coalesce(requirement.active, false) = true
      join jsonb_array_elements(v_segments) selected(value)
        on requirement.service_id =
          (selected.value ->> 'serviceId')::uuid
      where not (
        v_source = 'admin' and coalesce(p_force_created, false)
      )
      order by resource.id
    loop
      perform pg_advisory_xact_lock(
        hashtextextended(
          'appointment-resource-day:'
            || v_resource.id::text
            || ':'
            || p_appointment_date::text,
          0
        )
      );

      if
        coalesce(v_resource.active, false) = false
        or coalesce(v_resource.quantity, 0) < 1
      then
        v_result := jsonb_build_object(
          'status', 'not_available',
          'appointmentId', null,
          'clientId', null,
          'idempotencyKey', trim(p_idempotency_key),
          'isReplay', false,
          'servicesCreated', 0,
          'errorCode', 'resource_unavailable',
          'errorMessage', 'Un recurso necesario ya no está disponible.'
        );
        update public.appointment_write_operations
        set
          status = 'failed',
          result = v_result,
          error_code = 'resource_unavailable',
          error_message = 'Un recurso requerido está inactivo o sin capacidad.',
          updated_at = now()
        where id = v_operation.id;
        return v_result;
      end if;
    end loop;

    for v_segment in
      select segment.value
      from jsonb_array_elements(v_segments) segment(value)
    loop
      for v_resource in
        select resource.*
        from public.resources resource
        join public.service_resources requirement
          on requirement.resource_id = resource.id
         and requirement.service_id =
           (v_segment ->> 'serviceId')::uuid
         and coalesce(requirement.active, false) = true
        where not (
          v_source = 'admin' and coalesce(p_force_created, false)
        )
        order by resource.id
      loop
        select coalesce(sum(requirement.quantity_required), 0)::integer
        into v_existing_usage
        from public.appointment_services existing_service
        join public.appointments existing_appointment
          on existing_appointment.id = existing_service.appointment_id
        join public.service_resources requirement
          on requirement.service_id = existing_service.service_id
         and requirement.resource_id = v_resource.id
         and coalesce(requirement.active, false) = true
        where existing_service.service_date = p_appointment_date
          and lower(coalesce(existing_appointment.status, ''))
            not in ('cancelada', 'cancelado', 'cancelled', 'rechazada')
          and (v_segment ->> 'startTime')::time <
            coalesce(existing_service.end_time, existing_service.start_time)
          and (v_segment ->> 'endTime')::time >
            existing_service.start_time;

        select coalesce(sum(requirement.quantity_required), 0)::integer
        into v_new_usage
        from jsonb_array_elements(v_segments) selected(value)
        join public.service_resources requirement
          on requirement.service_id =
            (selected.value ->> 'serviceId')::uuid
         and requirement.resource_id = v_resource.id
         and coalesce(requirement.active, false) = true
        where (v_segment ->> 'startTime')::time <
            (selected.value ->> 'endTime')::time
          and (v_segment ->> 'endTime')::time >
            (selected.value ->> 'startTime')::time;

        if
          v_existing_usage + v_new_usage >
            coalesce(v_resource.quantity, 0)
        then
          v_result := jsonb_build_object(
            'status', 'not_available',
            'appointmentId', null,
            'clientId', null,
            'idempotencyKey', trim(p_idempotency_key),
            'isReplay', false,
            'servicesCreated', 0,
            'errorCode', 'resource_capacity',
            'errorMessage', 'No hay capacidad suficiente del recurso requerido.'
          );
          update public.appointment_write_operations
          set
            status = 'failed',
            result = v_result,
            error_code = 'resource_capacity',
            error_message = 'La capacidad del recurso está ocupada.',
            updated_at = now()
          where id = v_operation.id;
          return v_result;
        end if;
      end loop;
    end loop;

    if p_client_id is not null then
      select client.*
      into v_client
      from public.clients client
      where client.id = p_client_id
      for update;

      if not found then
        v_result := jsonb_build_object(
          'status', 'invalid_request',
          'appointmentId', null,
          'clientId', null,
          'idempotencyKey', trim(p_idempotency_key),
          'isReplay', false,
          'servicesCreated', 0,
          'errorCode', 'client_not_found',
          'errorMessage', 'No se encontró la clienta seleccionada.'
        );
        update public.appointment_write_operations
        set
          status = 'failed',
          result = v_result,
          error_code = 'client_not_found',
          error_message = 'La clienta indicada no existe.',
          updated_at = now()
        where id = v_operation.id;
        return v_result;
      end if;

      if
        v_phone_digits <> ''
        and regexp_replace(coalesce(v_client.phone, ''), '\D', '', 'g') <> ''
        and regexp_replace(coalesce(v_client.phone, ''), '\D', '', 'g')
          <> v_phone_digits
      then
        v_result := jsonb_build_object(
          'status', 'invalid_request',
          'appointmentId', null,
          'clientId', null,
          'idempotencyKey', trim(p_idempotency_key),
          'isReplay', false,
          'servicesCreated', 0,
          'errorCode', 'client_phone_mismatch',
          'errorMessage', 'Los datos de la clienta no coinciden.'
        );
        update public.appointment_write_operations
        set
          status = 'failed',
          result = v_result,
          error_code = 'client_phone_mismatch',
          error_message = 'El teléfono no coincide con la clienta existente.',
          updated_at = now()
        where id = v_operation.id;
        return v_result;
      end if;
    else
      if
        length(v_phone_digits) < 8
        or nullif(trim(coalesce(p_client_name, '')), '') is null
      then
        v_result := jsonb_build_object(
          'status', 'invalid_request',
          'appointmentId', null,
          'clientId', null,
          'idempotencyKey', trim(p_idempotency_key),
          'isReplay', false,
          'servicesCreated', 0,
          'errorCode', 'client_data_incomplete',
          'errorMessage', 'Faltan nombre o teléfono válidos de la clienta.'
        );
        update public.appointment_write_operations
        set
          status = 'failed',
          result = v_result,
          error_code = 'client_data_incomplete',
          error_message = 'La clienta no tiene datos mínimos válidos.',
          updated_at = now()
        where id = v_operation.id;
        return v_result;
      end if;

      perform pg_advisory_xact_lock(
        hashtextextended('appointment-client-phone:' || v_phone_digits, 0)
      );

      select client.*
      into v_client
      from public.clients client
      where regexp_replace(coalesce(client.phone, ''), '\D', '', 'g') =
        v_phone_digits
      order by client.created_at asc nulls last, client.id
      limit 1
      for update;

      if not found then
        insert into public.clients (
          full_name,
          phone,
          updated_at
        )
        values (
          trim(p_client_name),
          trim(p_client_phone),
          now()
        )
        returning * into v_client;
      end if;
    end if;

    insert into public.appointments (
      client_id,
      staff_id,
      appointment_date,
      start_time,
      end_time,
      status,
      confirmation_status,
      attendance_status,
      booking_source,
      estimated_total,
      deposit_amount,
      force_created,
      notes,
      client_visible_notes,
      updated_at
    )
    values (
      v_client.id,
      p_staff_id,
      p_appointment_date,
      p_start_time,
      p_expected_end_time,
      'agendada',
      'pendiente',
      'pendiente',
      case
        when v_source = 'client_portal' then 'cliente_portal'
        else v_source
      end,
      v_estimated_total,
      0,
      case
        when v_source = 'admin' then coalesce(p_force_created, false)
        else false
      end,
      coalesce(
        nullif(trim(coalesce(p_notes, '')), ''),
        'Creada mediante la operación transaccional de agenda.'
      ),
      'Solicitud recibida. El equipo revisará el anticipo si corresponde.',
      now()
    )
    returning id into v_appointment_id;

    for v_segment in
      select segment.value
      from jsonb_array_elements(v_segments) segment(value)
    loop
      insert into public.appointment_services (
        appointment_id,
        service_id,
        custom_name,
        quantity,
        unit_price,
        total_price,
        price,
        staff_id,
        service_date,
        start_time,
        end_time,
        duration_minutes,
        cleanup_minutes,
        status,
        notes
      )
      values (
        v_appointment_id,
        (v_segment ->> 'serviceId')::uuid,
        v_segment ->> 'serviceName',
        1,
        (v_segment ->> 'price')::numeric,
        (v_segment ->> 'price')::numeric,
        (v_segment ->> 'price')::numeric,
        p_staff_id,
        p_appointment_date,
        (v_segment ->> 'startTime')::time,
        (v_segment ->> 'endTime')::time,
        (v_segment ->> 'durationMinutes')::integer,
        (v_segment ->> 'cleanupMinutes')::integer,
        'agendado',
        null
      );
      v_services_created := v_services_created + 1;
    end loop;

    for v_extra_item in
      select item.value
      from jsonb_array_elements(v_extra_segments) item(value)
    loop
      insert into public.appointment_extra_items (
        appointment_id,
        extra_id,
        staff_id,
        name,
        quantity,
        unit_price,
        total_price,
        notes
      )
      values (
        v_appointment_id,
        (v_extra_item ->> 'extraId')::uuid,
        nullif(v_extra_item ->> 'staffId', '')::uuid,
        v_extra_item ->> 'name',
        (v_extra_item ->> 'quantity')::numeric,
        (v_extra_item ->> 'unitPrice')::numeric,
        (v_extra_item ->> 'totalPrice')::numeric,
        nullif(v_extra_item ->> 'notes', '')
      );
      v_extras_created := v_extras_created + 1;
    end loop;

    if
      v_services_created <> v_service_count
      or (
        select count(*)
        from public.appointment_services created_service
        where created_service.appointment_id = v_appointment_id
      ) <> v_service_count
      or v_extras_created <> v_extra_count
      or (
        select count(*)
        from public.appointment_extra_items created_extra
        where created_extra.appointment_id = v_appointment_id
      ) <> v_extra_count
    then
      raise exception using
        errcode = 'P0001',
        message = 'appointment_items_count_mismatch';
    end if;

    v_result := jsonb_build_object(
      'status', 'created',
      'appointmentId', v_appointment_id,
      'clientId', v_client.id,
      'idempotencyKey', trim(p_idempotency_key),
      'requestHash', v_request_hash,
      'isReplay', false,
      'servicesCreated', v_services_created,
      'date', p_appointment_date,
      'startTime', to_char(p_start_time, 'HH24:MI'),
      'endTime', to_char(p_expected_end_time, 'HH24:MI'),
      'staffId', p_staff_id,
      'errorCode', null,
      'errorMessage', null
    );

    update public.appointment_write_operations
    set
      status = 'created',
      appointment_id = v_appointment_id,
      result = v_result,
      error_code = null,
      error_message = null,
      updated_at = now()
    where id = v_operation.id;

    return v_result;
  exception
    when others then
      v_result := jsonb_build_object(
        'status', 'failed',
        'appointmentId', null,
        'clientId', null,
        'idempotencyKey', trim(p_idempotency_key),
        'isReplay', false,
        'servicesCreated', 0,
        'errorCode', 'transaction_failed',
        'errorMessage', 'No se pudo crear la cita de forma transaccional.'
      );

      update public.appointment_write_operations
      set
        status = 'failed',
        appointment_id = null,
        result = v_result,
        error_code = 'transaction_failed',
        error_message = 'La operación transaccional fue revertida.',
        updated_at = now()
      where id = v_operation.id;

      return v_result;
  end;
end;
$$;

revoke all on function public.create_appointment_transaction(
  text,
  uuid,
  text,
  uuid,
  text,
  text,
  integer,
  text,
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  text,
  date,
  time without time zone,
  time without time zone,
  uuid,
  numeric,
  text,
  timestamptz,
  boolean,
  text
) from public, anon, authenticated;

grant execute on function public.create_appointment_transaction(
  text,
  uuid,
  text,
  uuid,
  text,
  text,
  integer,
  text,
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  text,
  date,
  time without time zone,
  time without time zone,
  uuid,
  numeric,
  text,
  timestamptz,
  boolean,
  text
) to service_role;

notify pgrst, 'reload schema';

commit;
