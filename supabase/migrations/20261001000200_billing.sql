-- Subscriptions (Paystack): webhook log for de-duplication and support, plus the Paystack customer id.

alter table public.business_billing add column paystack_customer_id bigint;

create table public.paystack_events (
  id text primary key,            -- sha256 of the raw webhook body
  event text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
alter table public.paystack_events enable row level security;
-- No policies: only the server (service role) reads or writes these.
