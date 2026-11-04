-- Second layer of protection: logged-out visitors (the "anon" role) get no access at all to the
-- app's tables, sequences or functions. Row-level security already hides every row from them;
-- this removes the access itself, so a request without a login is refused straight away.
-- Nothing in the app needs it: sign-in goes through Supabase Auth, and the public Pay Now page
-- and Paystack webhooks run on the server with the service key.
-- Changes permissions only. No data is touched. Only objects owned by the current role are
-- changed (Supabase's own built-in objects are left alone), so it is safe to run more than once.

do $$
declare o record; n_tables int := 0; n_functions int := 0;
begin
  for o in
    select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') and pg_get_userbyid(c.relowner) = current_user
  loop
    execute format('revoke all on table public.%I from anon', o.relname);
    n_tables := n_tables + 1;
  end loop;
  for o in
    select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relkind = 'S' and pg_get_userbyid(c.relowner) = current_user
  loop
    execute format('revoke all on sequence public.%I from anon', o.relname);
  end loop;
  for o in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and pg_get_userbyid(p.proowner) = current_user
  loop
    execute format('revoke all on function %s from anon', o.sig);
    n_functions := n_functions + 1;
  end loop;
  raise notice 'Locked % tables and % functions for logged-out visitors', n_tables, n_functions;
end $$;

-- Also for tables, sequences and functions added later by future migrations.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Shows the result: every "anon_can_..." column should say false.
select
  has_table_privilege('anon', 'public.documents', 'select') as anon_can_read_documents,
  has_table_privilege('anon', 'public.businesses', 'select') as anon_can_read_businesses,
  has_table_privilege('anon', 'public.customers', 'select') as anon_can_read_customers,
  has_function_privilege('anon', 'public.export_my_data()', 'execute') as anon_can_export;
