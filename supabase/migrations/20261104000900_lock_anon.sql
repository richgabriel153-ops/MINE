-- Second layer of protection: logged-out visitors (the "anon" role) get no access at all to the
-- app's tables, sequences or functions. Row-level security already hides every row from them;
-- this removes the access itself, so a request without a login is refused straight away.
-- Nothing in the app needs it: sign-in goes through Supabase Auth, and the public Pay Now page
-- and Paystack webhooks run on the server with the service key.
-- Changes permissions only. No data is touched.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- Also for tables, sequences and functions added later by future migrations.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
