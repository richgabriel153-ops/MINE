-- Live privacy check. Safe to run any time: it creates two pretend businesses, tries to read and
-- change one from the other, then UNDOES EVERYTHING. Nothing is kept.
-- Paste into Supabase > SQL Editor > New query > Run.
-- The result appears as an ERROR starting "TEST RESULT (rolled back)": that error is what undoes the test.
-- Every "B_..." number should be 0 and every check should say "blocked".
do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  bida uuid; bidb uuid; doc jsonb; r text := ''; n int;
  receipt jsonb := '{"type":"receipt","issueDate":"2026-11-04","dueDate":null,"customer":{"name":"Ada Okafor","phone":"+2348031234567"},"items":[{"id":"a","description":"Rice 50kg","quantity":2,"unitPriceKobo":4500000}],"discount":{"type":"percent","percent":10},"deliveryKobo":150000,"vatEnabled":true,"status":"part","amountPaidKobo":5000000,"method":"transfer","notes":"","templateId":"classic"}';
begin
  insert into auth.users (id, email, aud, role) values (ua, 'rls-test-a@example.invalid', 'authenticated', 'authenticated'),
                                                       (ub, 'rls-test-b@example.invalid', 'authenticated', 'authenticated');
  -- Business A, signed in as A
  perform set_config('request.jwt.claim.sub', ua::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'email', 'rls-test-a@example.invalid', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  bida := public.create_business('{"name":"Test A"}', 'A');
  update public.business_billing set comp = true where business_id = bida;
  get diagnostics n = row_count; r := r || 'A_gave_self_Pro=' || n;
  perform set_config('role', 'postgres', true);
  update public.business_billing set comp = true where business_id = bida;
  perform set_config('role', 'authenticated', true);
  doc := public.create_document(bida, receipt, 1, 1);
  -- Expect total 8857500 (₦88,575) and paid 5000000 (₦50,000), whatever the phone sent (1 and 1).
  r := r || ' | A_receipt=' || (doc ->> 'number') || ' total=' || (doc ->> 'total_kobo') || ' paid=' || (doc ->> 'amount_paid_kobo');

  -- Business B, signed in as B
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', ub::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'email', 'rls-test-b@example.invalid', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  bidb := public.create_business('{"name":"Test B"}', 'B');
  select count(*) into n from public.documents where business_id = bida; r := r || ' | B_sees_A_docs=' || n;
  select count(*) into n from public.payments where business_id = bida; r := r || ' B_sees_A_payments=' || n;
  select count(*) into n from public.customers where business_id = bida; r := r || ' B_sees_A_customers=' || n;
  select count(*) into n from public.businesses where id = bida; r := r || ' B_sees_A_business=' || n;
  select count(*) into n from public.business_billing where business_id = bida; r := r || ' B_sees_A_billing=' || n;
  select count(*) into n from public.activity_log where business_id = bida; r := r || ' B_sees_A_activity=' || n;
  update public.documents set total_kobo = 1 where business_id = bida; get diagnostics n = row_count; r := r || ' B_changed_A_docs=' || n;
  delete from public.documents where business_id = bida; get diagnostics n = row_count; r := r || ' B_deleted_A_docs=' || n;
  begin perform public.create_document(bida, receipt, 0, 0); r := r || ' B_create_in_A=ALLOWED!';
  exception when others then r := r || ' B_create_in_A=blocked'; end;
  begin perform public.business_summary(bida, '2026-11-04'); r := r || ' B_A_totals=ALLOWED!';
  exception when others then r := r || ' B_A_totals=blocked'; end;
  begin perform public.update_document((doc ->> 'id')::uuid, receipt, 0, 0); r := r || ' B_edit_A=ALLOWED!';
  exception when others then r := r || ' B_edit_A=blocked'; end;
  begin insert into public.documents (business_id, type, number, issue_date, status, data) values (bida, 'receipt', 'RCT-9999', '2026-11-04', 'paid', '{}');
        r := r || ' B_raw_insert=ALLOWED!';
  exception when others then r := r || ' B_raw_insert=blocked'; end;

  -- Logged-out visitor
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  begin select count(*) into n from public.documents; r := r || ' | anon_docs=' || n || ' (should be blocked)';
  exception when insufficient_privilege then r := r || ' | anon_docs=blocked'; end;
  begin select count(*) into n from public.businesses; r := r || ' anon_businesses=' || n || ' (should be blocked)';
  exception when insufficient_privilege then r := r || ' anon_businesses=blocked'; end;
  begin select count(*) into n from public.customers; r := r || ' anon_customers=' || n || ' (should be blocked)';
  exception when insufficient_privilege then r := r || ' anon_customers=blocked'; end;
  begin perform public.export_my_data(); r := r || ' anon_export=ALLOWED!';
  exception when others then r := r || ' anon_export=blocked'; end;

  raise exception 'TEST RESULT (rolled back): %', r;
end $$;
