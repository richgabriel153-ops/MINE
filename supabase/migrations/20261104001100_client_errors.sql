-- App problems testers hit (crashes, failed loads), so the owner of InCeipt can see and fix them.
-- No personal data: only the error message, the page, the browser and a short technical trace.
-- Written by the server (service role) only; nobody can read it through the app's API.

create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  kind text not null default 'error' check (length(kind) <= 40),
  message text not null check (length(message) <= 500),
  page text not null default '' check (length(page) <= 300),
  digest text not null default '' check (length(digest) <= 100),
  trace text not null default '' check (length(trace) <= 2000),
  user_agent text not null default '' check (length(user_agent) <= 300),
  app_version text not null default '' check (length(app_version) <= 40)
);
create index if not exists client_errors_created_idx on public.client_errors (created_at desc);
create index if not exists client_errors_user_idx on public.client_errors (user_id);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from public, anon, authenticated;
grant all on public.client_errors to service_role;

-- Keep only the last 30 days; called by the server after each insert (cheap thanks to the index).
create or replace function public._prune_client_errors() returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from public.client_errors where created_at < now() - interval '30 days';
$$;
revoke execute on function public._prune_client_errors() from public, anon, authenticated;
grant execute on function public._prune_client_errors() to service_role;
