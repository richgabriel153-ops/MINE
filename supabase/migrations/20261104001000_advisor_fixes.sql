-- Fixes from Supabase's Security and Performance Advisor (safe to run more than once).
--
-- 1. Internal helpers (names starting with "_") are only meant to be used inside the app's own
--    database functions. Signed-in users could call some of them directly through the API, e.g.
--    _next_number could burn another business's receipt numbers and _log could write fake activity.
--    Block direct calls; the app's functions still use them (they run as the database owner).
-- 2. Give the last few functions a fixed search_path.
-- 3. Faster access rules: work out the signed-in user once per query, not once per row.
-- 4. Indexes for links between tables (faster deletes and lookups as data grows).

-- 1. Internal helpers: no direct calls from the app's users.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like '\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- Supabase's own "turn on RLS automatically" event-trigger helper: it fires by itself, nobody needs to call it.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable' and p.pronargs = 0) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- New functions don't become callable by everyone by default.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

-- 2. Fixed search_path.
alter function public._lagos_today() set search_path = public, pg_temp;
alter function public._bad(text) set search_path = public, pg_temp;
alter function public._is_int(jsonb, numeric, numeric) set search_path = public, pg_temp;
alter function public._validate_profile(jsonb) set search_path = public, pg_temp;

-- 3. Access rules that check the user once per query.
drop policy if exists "members see the team" on public.members;
create policy "members see the team" on public.members
  for select using (public.member_role(business_id) is not null or user_id = (select auth.uid()));

drop policy if exists "users read own consents" on public.user_consents;
create policy "users read own consents" on public.user_consents
  for select using (user_id = (select auth.uid()));

-- 4. Indexes on links between tables.
create index if not exists activity_log_actor_idx on public.activity_log (actor_id);
create index if not exists beta_redemptions_business_idx on public.beta_redemptions (business_id);
create index if not exists beta_redemptions_user_idx on public.beta_redemptions (user_id);
create index if not exists businesses_owner_idx on public.businesses (owner_id);
create index if not exists documents_created_by_idx on public.documents (created_by);
create index if not exists documents_customer_idx on public.documents (customer_id);
create index if not exists expenses_created_by_idx on public.expenses (created_by);
create index if not exists members_invited_by_idx on public.members (invited_by);
create index if not exists payments_created_by_idx on public.payments (created_by);
