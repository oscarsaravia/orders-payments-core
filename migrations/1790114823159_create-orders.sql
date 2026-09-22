-- Up Migration
create type order_status as enum ('pending', 'paid', 'cancelled', 'refunded');

create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  status order_status not null default 'pending',
  total_cents integer not null check (total_cents >= 0),
  currency text not null default 'GTQ',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_name text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0)
);

create index idx_order_items_order_id on order_items(order_id);
create index idx_orders_customer_id on orders(customer_id);

-- Down Migration
drop table order_items;
drop table orders;
drop type order_status;