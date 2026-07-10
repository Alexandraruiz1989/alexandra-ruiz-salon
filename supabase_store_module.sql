-- Módulo Tienda / Productos para Alexandra Ruiz Salón.
-- Ejecutar en Supabase SQL Editor antes de usar /admin/tienda.

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  brand text,
  category text,
  description text,
  cost_price numeric default 0,
  sale_price numeric default 0,
  current_stock integer default 0,
  min_stock integer default 0,
  external_owner_name text,
  active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.store_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.store_products(id) on delete set null,
  movement_type text not null check (movement_type in ('entrada', 'venta', 'ajuste', 'devolucion')),
  quantity integer not null,
  previous_stock integer default 0,
  new_stock integer default 0,
  note text,
  created_by text,
  created_at timestamp with time zone default now()
);

create table if not exists public.store_sales (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null default current_date,
  client_id uuid null,
  seller_staff_id uuid null references public.staff(id) on delete set null,
  seller_name text,
  subtotal numeric default 0,
  discount_amount numeric default 0,
  total_amount numeric default 0,
  payment_method text default 'efectivo' check (payment_method in ('efectivo', 'tarjeta', 'transferencia', 'mixto')),
  salon_commission_percent numeric default 0,
  salon_commission_amount numeric default 0,
  terminal_fee_percent numeric default 0,
  terminal_fee_amount numeric default 0,
  seller_commission_percent numeric default 0,
  seller_commission_amount numeric default 0,
  external_owner_net_amount numeric default 0,
  cash_registered boolean default false,
  notes text,
  created_by text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.store_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.store_sales(id) on delete cascade,
  product_id uuid references public.store_products(id) on delete set null,
  product_name text not null,
  quantity integer not null,
  unit_price numeric default 0,
  subtotal numeric default 0,
  created_at timestamp with time zone default now()
);

create table if not exists public.store_settings (
  id uuid primary key default gen_random_uuid(),
  salon_product_commission_percent numeric default 0,
  terminal_card_fee_percent numeric default 0,
  default_seller_commission_percent numeric default 0,
  updated_at timestamp with time zone default now()
);

insert into public.store_settings (
  salon_product_commission_percent,
  terminal_card_fee_percent,
  default_seller_commission_percent
)
select 0, 0, 0
where not exists (select 1 from public.store_settings);

create index if not exists store_products_active_idx on public.store_products(active);
create index if not exists store_products_sku_idx on public.store_products(sku);
create index if not exists store_inventory_movements_product_idx on public.store_inventory_movements(product_id, created_at desc);
create index if not exists store_sales_date_idx on public.store_sales(sale_date desc);
create index if not exists store_sale_items_sale_idx on public.store_sale_items(sale_id);

-- Rol sugerido para user_profiles.role:
-- product_owner
-- Este rol se habilita en la app para ver solo /admin/tienda.

-- Permisos y RLS para usar Tienda desde Supabase Auth.
-- Este bloque es seguro para ejecutarse más de una vez.

create or replace function public.store_current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select up.role
  from public.user_profiles up
  where up.auth_user_id = auth.uid()
    and coalesce(up.active, true) = true
  limit 1
$$;

create or replace function public.store_user_has_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.store_current_user_role() = any(allowed_roles), false)
$$;

grant usage on schema public to authenticated;

grant execute on function public.store_current_user_role() to authenticated;
grant execute on function public.store_user_has_role(text[]) to authenticated;

grant select, insert, update, delete on public.store_products to authenticated;
grant select, insert, update, delete on public.store_inventory_movements to authenticated;
grant select, insert, update, delete on public.store_sales to authenticated;
grant select, insert, update, delete on public.store_sale_items to authenticated;
grant select, insert, update, delete on public.store_settings to authenticated;

alter table public.store_products enable row level security;
alter table public.store_inventory_movements enable row level security;
alter table public.store_sales enable row level security;
alter table public.store_sale_items enable row level security;
alter table public.store_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_products'
      and policyname = 'store_products_select_tienda_roles'
  ) then
    execute 'create policy store_products_select_tienda_roles
      on public.store_products
      for select
      to authenticated
      using (public.store_user_has_role(array[''admin'', ''encargada'', ''caja'', ''product_owner'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_products'
      and policyname = 'store_products_insert_admin_encargada'
  ) then
    execute 'create policy store_products_insert_admin_encargada
      on public.store_products
      for insert
      to authenticated
      with check (public.store_user_has_role(array[''admin'', ''encargada'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_products'
      and policyname = 'store_products_update_admin_encargada_caja'
  ) then
    execute 'create policy store_products_update_admin_encargada_caja
      on public.store_products
      for update
      to authenticated
      using (public.store_user_has_role(array[''admin'', ''encargada'', ''caja'']))
      with check (public.store_user_has_role(array[''admin'', ''encargada'', ''caja'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_products'
      and policyname = 'store_products_delete_admin'
  ) then
    execute 'create policy store_products_delete_admin
      on public.store_products
      for delete
      to authenticated
      using (public.store_user_has_role(array[''admin'']))';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_inventory_movements'
      and policyname = 'store_inventory_movements_select_tienda_roles'
  ) then
    execute 'create policy store_inventory_movements_select_tienda_roles
      on public.store_inventory_movements
      for select
      to authenticated
      using (public.store_user_has_role(array[''admin'', ''encargada'', ''caja'', ''product_owner'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_inventory_movements'
      and policyname = 'store_inventory_movements_insert_staff_tienda'
  ) then
    execute 'create policy store_inventory_movements_insert_staff_tienda
      on public.store_inventory_movements
      for insert
      to authenticated
      with check (public.store_user_has_role(array[''admin'', ''encargada'', ''caja'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_inventory_movements'
      and policyname = 'store_inventory_movements_delete_admin'
  ) then
    execute 'create policy store_inventory_movements_delete_admin
      on public.store_inventory_movements
      for delete
      to authenticated
      using (public.store_user_has_role(array[''admin'']))';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_sales'
      and policyname = 'store_sales_select_tienda_roles'
  ) then
    execute 'create policy store_sales_select_tienda_roles
      on public.store_sales
      for select
      to authenticated
      using (public.store_user_has_role(array[''admin'', ''encargada'', ''caja'', ''product_owner'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_sales'
      and policyname = 'store_sales_insert_staff_tienda'
  ) then
    execute 'create policy store_sales_insert_staff_tienda
      on public.store_sales
      for insert
      to authenticated
      with check (public.store_user_has_role(array[''admin'', ''encargada'', ''caja'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_sales'
      and policyname = 'store_sales_update_admin_encargada'
  ) then
    execute 'create policy store_sales_update_admin_encargada
      on public.store_sales
      for update
      to authenticated
      using (public.store_user_has_role(array[''admin'', ''encargada'']))
      with check (public.store_user_has_role(array[''admin'', ''encargada'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_sales'
      and policyname = 'store_sales_delete_admin'
  ) then
    execute 'create policy store_sales_delete_admin
      on public.store_sales
      for delete
      to authenticated
      using (public.store_user_has_role(array[''admin'']))';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_sale_items'
      and policyname = 'store_sale_items_select_tienda_roles'
  ) then
    execute 'create policy store_sale_items_select_tienda_roles
      on public.store_sale_items
      for select
      to authenticated
      using (public.store_user_has_role(array[''admin'', ''encargada'', ''caja'', ''product_owner'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_sale_items'
      and policyname = 'store_sale_items_insert_staff_tienda'
  ) then
    execute 'create policy store_sale_items_insert_staff_tienda
      on public.store_sale_items
      for insert
      to authenticated
      with check (public.store_user_has_role(array[''admin'', ''encargada'', ''caja'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_sale_items'
      and policyname = 'store_sale_items_update_admin_encargada'
  ) then
    execute 'create policy store_sale_items_update_admin_encargada
      on public.store_sale_items
      for update
      to authenticated
      using (public.store_user_has_role(array[''admin'', ''encargada'']))
      with check (public.store_user_has_role(array[''admin'', ''encargada'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_sale_items'
      and policyname = 'store_sale_items_delete_admin'
  ) then
    execute 'create policy store_sale_items_delete_admin
      on public.store_sale_items
      for delete
      to authenticated
      using (public.store_user_has_role(array[''admin'']))';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_settings'
      and policyname = 'store_settings_select_tienda_roles'
  ) then
    execute 'create policy store_settings_select_tienda_roles
      on public.store_settings
      for select
      to authenticated
      using (public.store_user_has_role(array[''admin'', ''encargada'', ''caja'', ''product_owner'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_settings'
      and policyname = 'store_settings_insert_admin'
  ) then
    execute 'create policy store_settings_insert_admin
      on public.store_settings
      for insert
      to authenticated
      with check (public.store_user_has_role(array[''admin'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_settings'
      and policyname = 'store_settings_update_admin'
  ) then
    execute 'create policy store_settings_update_admin
      on public.store_settings
      for update
      to authenticated
      using (public.store_user_has_role(array[''admin'']))
      with check (public.store_user_has_role(array[''admin'']))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_settings'
      and policyname = 'store_settings_delete_admin'
  ) then
    execute 'create policy store_settings_delete_admin
      on public.store_settings
      for delete
      to authenticated
      using (public.store_user_has_role(array[''admin'']))';
  end if;
end $$;
