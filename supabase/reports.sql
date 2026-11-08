-- Linkup v1: reports table.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.reports (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  reporter_session_id   text not null,
  reported_session_id   text,
  match_id              text,
  reason                text not null check (reason in ('nudity', 'harassment', 'underage', 'spam', 'other')),
  note                  text check (char_length(note) <= 500)
);

create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists reports_reported_session_idx on public.reports (reported_session_id);

-- Lock the table down. The web app writes through its own API route with the service role key,
-- which bypasses RLS, so no public policies are needed (the anon key can neither read nor write).
alter table public.reports enable row level security;
