-- Up Migration
create table idempotency_keys (
  key text primary key,
  request_path text not null,
  request_hash text not null,
  status_code integer,
  response_body jsonb,
  created_at timestamptz not null default now()
);

-- Down Migration
drop table idempotency_keys;