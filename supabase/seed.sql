-- Seed local desechable para Supabase Local.
-- Contiene únicamente datos ficticios para pruebas técnicas.
-- No contiene datos reales del salón, conversaciones, pagos, comprobantes ni citas históricas.

insert into public.staff (
  id,
  full_name,
  email,
  phone,
  role,
  active,
  color,
  work_days,
  work_schedule,
  break_schedule,
  notes
) values (
  '10000000-0000-4000-8000-000000000001',
  'Técnica Prueba Local',
  'tecnica.prueba.local@example.invalid',
  '0000000000',
  'tecnica',
  true,
  '#1A5CFF',
  '[1,2,3,4,5]'::jsonb,
  '{"start":"09:00","end":"18:00"}'::jsonb,
  '{"start":"13:00","end":"14:00"}'::jsonb,
  'Registro ficticio para Supabase Local'
) on conflict (id) do nothing;

insert into public.user_profiles (
  id,
  email,
  full_name,
  role,
  staff_id,
  active
) values (
  '10000000-0000-4000-8000-000000000002',
  'administradora.prueba.local@example.invalid',
  'Administradora Prueba Local',
  'admin',
  '10000000-0000-4000-8000-000000000001',
  true
) on conflict (id) do nothing;

insert into public.clients (
  id,
  full_name,
  phone,
  email,
  notes
) values (
  '10000000-0000-4000-8000-000000000003',
  'Clienta Prueba Local',
  '0000000001',
  'clienta.prueba.local@example.invalid',
  'Registro ficticio para pruebas locales'
) on conflict (id) do nothing;

insert into public.services (
  id,
  category,
  name,
  base_price,
  duration_minutes,
  active,
  commission_type,
  commission_value,
  description,
  cleanup_minutes,
  service_type,
  variable_pricing,
  pricing_notes,
  bot_active,
  bot_bookable
) values
(
  '10000000-0000-4000-8000-000000000004',
  'Pruebas Locales',
  'Servicio Prueba Uno',
  100.00,
  60,
  true,
  'percentage',
  0,
  'Servicio ficticio para Supabase Local',
  0,
  'servicio',
  false,
  'Precio ficticio local',
  false,
  true
),
(
  '10000000-0000-4000-8000-000000000005',
  'Pruebas Locales',
  'Servicio Prueba Dos',
  150.00,
  45,
  true,
  'percentage',
  0,
  'Servicio ficticio para Supabase Local',
  0,
  'servicio',
  false,
  'Precio ficticio local',
  false,
  true
) on conflict (id) do nothing;

insert into public.service_extras (
  id,
  name,
  category,
  price,
  pricing_type,
  active,
  notes
) values (
  '10000000-0000-4000-8000-000000000006',
  'Extra Prueba Local',
  'Pruebas Locales',
  25.00,
  'fixed',
  true,
  'Extra ficticio para Supabase Local'
) on conflict (id) do nothing;

insert into public.resources (
  id,
  name,
  quantity,
  active,
  notes
) values (
  '10000000-0000-4000-8000-000000000007',
  'Recurso Prueba Local',
  1,
  true,
  'Recurso ficticio para Supabase Local'
) on conflict (id) do nothing;

insert into public.staff_services (
  id,
  staff_id,
  service_id,
  active
) values
(
  '10000000-0000-4000-8000-000000000008',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000004',
  true
),
(
  '10000000-0000-4000-8000-000000000009',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000005',
  true
) on conflict (id) do nothing;

insert into public.service_resources (
  id,
  service_id,
  resource_id,
  quantity_required,
  active
) values (
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000007',
  1,
  true
) on conflict (id) do nothing;

insert into public.staff_schedules (
  id,
  staff_id,
  day_of_week,
  start_time,
  end_time,
  is_active,
  is_day_off,
  has_break,
  break_start,
  break_end
) values
(
  '10000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000001',
  1,
  '09:00',
  '18:00',
  true,
  false,
  true,
  '13:00',
  '14:00'
),
(
  '10000000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000001',
  2,
  '09:00',
  '18:00',
  true,
  false,
  true,
  '13:00',
  '14:00'
),
(
  '10000000-0000-4000-8000-000000000013',
  '10000000-0000-4000-8000-000000000001',
  3,
  '09:00',
  '18:00',
  true,
  false,
  true,
  '13:00',
  '14:00'
),
(
  '10000000-0000-4000-8000-000000000014',
  '10000000-0000-4000-8000-000000000001',
  4,
  '09:00',
  '18:00',
  true,
  false,
  true,
  '13:00',
  '14:00'
),
(
  '10000000-0000-4000-8000-000000000015',
  '10000000-0000-4000-8000-000000000001',
  5,
  '09:00',
  '18:00',
  true,
  false,
  true,
  '13:00',
  '14:00'
) on conflict (id) do nothing;

insert into public.business_settings (
  id,
  business_name,
  whatsapp_phone
) values (
  '10000000-0000-4000-8000-000000000016',
  'Negocio Prueba Local',
  '0000000002'
) on conflict (id) do nothing;

insert into public.bot_settings (
  id,
  bot_name,
  welcome_message,
  fallback_message,
  human_help_message,
  appointment_deposit_message,
  active
) values (
  '10000000-0000-4000-8000-000000000017',
  'Bot Prueba Local',
  'Mensaje ficticio local de bienvenida.',
  'Mensaje ficticio local de respuesta no disponible.',
  'Mensaje ficticio local para seguimiento humano.',
  'Mensaje ficticio local de anticipo.',
  false
) on conflict (id) do nothing;
