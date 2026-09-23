-- Up Migration
create type payment_status as enum ('pending', 'succeeded', 'failed');

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  stripe_payment_intent_id text not null unique,
  status payment_status not null default 'pending',
  amount_cents integer not null check (amount_cents >= 0),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_payments_order_id on payments(order_id);

-- Down Migration
drop table payments;
drop type payment_status;