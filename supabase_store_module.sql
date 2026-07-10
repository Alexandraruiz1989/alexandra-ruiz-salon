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
