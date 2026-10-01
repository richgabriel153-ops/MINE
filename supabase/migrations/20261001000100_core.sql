-- InCeipt core schema: businesses, members, documents, payments, activity log, billing.
--
-- Security model
--   * Row Level Security is on for every table. Tables only have SELECT policies.
--   * Every write goes through a SECURITY DEFINER function below, which checks the caller's role
--     (owner / staff) and Pro status before changing anything. Webhooks use the service role.
--   * Staff only count as members while the business is Pro; owners always do.


-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete restrict,
  -- BusinessProfile (name, logo, phone, bank details, brand colour, …)
  profile jsonb not null default '{}'::jsonb,
  -- Last number used per document type, e.g. {"receipt": 12, "invoice": 4, "quote": 0}
  counters jsonb not null default '{"receipt": 0, "invoice": 0, "quote": 0}'::jsonb,
  -- Small business settings (custom expense categories, …)
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Null until an invited person signs in with this email.
  user_id uuid references auth.users (id) on delete set null,
  email text not null check (email = lower(email)),
  name text not null default '',
  role text not null check (role in ('owner', 'staff')),
  status text not null default 'active' check (status in ('invited', 'active', 'deactivated')),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, email)
);
create index members_user_idx on public.members (user_id);

create table public.business_billing (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  plan text check (plan in ('monthly', 'yearly')),
  -- none | active | non_renewing (cancelled, runs to period end) | attention (renewal failed) | cancelled
  status text not null default 'none' check (status in ('none', 'active', 'non_renewing', 'attention', 'cancelled')),
  current_period_end timestamptz,
  -- Honoured Pro (e.g. people who unlocked Pro with a code before subscriptions)
  comp boolean not null default false,
  comp_reason text,
  pending_plan text check (pending_plan in ('monthly', 'yearly')),
  paystack_customer_code text unique,
  paystack_subscription_code text,
  paystack_email_token text,
  paystack_pending_subscription_code text,
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  type text not null check (type in ('receipt', 'invoice', 'quote')),
  number text not null,
  issue_date date not null,
  status text not null,
  total_kobo bigint not null default 0 check (total_kobo >= 0),
  amount_paid_kobo bigint not null default 0 check (amount_paid_kobo >= 0),
  -- The full document as the app uses it (items, customer, discount, notes, template, …)
  data jsonb not null,
  created_by uuid references auth.users (id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, number)
);
create index documents_business_created_idx on public.documents (business_id, created_at desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  amount_kobo bigint not null check (amount_kobo > 0),
  method text not null check (method in ('transfer', 'cash', 'pos', 'online')),
  paid_on date not null,
  -- form: the "amount paid" typed on the receipt/invoice form; payment: recorded later
  kind text not null default 'payment' check (kind in ('form', 'payment')),
  source text not null default 'manual' check (source in ('manual', 'paystack', 'import')),
  -- Paystack transaction reference (unique, so a webhook delivered twice is only counted once)
  reference text unique,
  created_by uuid references auth.users (id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now()
);
create index payments_business_paid_on_idx on public.payments (business_id, paid_on);
create index payments_document_idx on public.payments (document_id);

create table public.activity_log (
  id bigserial primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text not null default '',
  -- create | edit | delete | delete_attempt | payment | mark_paid | convert | status | staff_invite | staff_deactivate | staff_reactivate | expense_create | expense_edit | expense_delete | settings
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null default '',
  created_at timestamptz not null default now()
);
create index activity_business_created_idx on public.activity_log (business_id, created_at desc);

alter table public.businesses enable row level security;
alter table public.members enable row level security;
alter table public.business_billing enable row level security;
alter table public.documents enable row level security;
alter table public.payments enable row level security;
alter table public.activity_log enable row level security;

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

-- Pro = honoured (comp), or a subscription whose paid period (plus 3 days' grace) hasn't ended.
create or replace function public.is_pro(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select b.comp
        or (b.status in ('active', 'non_renewing', 'attention')
            and b.current_period_end is not null
            and b.current_period_end + interval '3 days' > now())
    from public.business_billing b
    where b.business_id = bid
  ), false);
$$;

-- The caller's role in a business, or null. Staff lose access while the business isn't Pro.
create or replace function public.member_role(bid uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.role
  from public.members m
  where m.business_id = bid
    and m.user_id = auth.uid()
    and m.status = 'active'
    and (m.role = 'owner' or public.is_pro(bid))
  limit 1;
$$;

create or replace function public.member_name(bid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(m.name, ''), m.email)
  from public.members m
  where m.business_id = bid and m.user_id = auth.uid()
  limit 1;
$$;

create or replace function public._require_member(bid uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare r text := public.member_role(bid);
begin
  if r is null then raise exception 'not_member' using errcode = '42501'; end if;
  return r;
end;
$$;

create or replace function public._require_owner(bid uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.member_role(bid) is distinct from 'owner' then
    raise exception 'owner_only' using errcode = '42501';
  end if;
end;
$$;

create or replace function public._log(bid uuid, p_action text, p_entity_type text, p_entity_id uuid, p_summary text)
returns void language sql security definer set search_path = public as $$
  insert into public.activity_log (business_id, actor_id, actor_name, action, entity_type, entity_id, summary)
  values (bid, auth.uid(), coalesce(public.member_name(bid), 'System'), p_action, p_entity_type, p_entity_id, p_summary);
$$;

-- ---------------------------------------------------------------------------
-- Read policies
-- ---------------------------------------------------------------------------

create policy "members read their business" on public.businesses
  for select using (public.member_role(id) is not null);

create policy "members see the team" on public.members
  for select using (public.member_role(business_id) is not null or user_id = auth.uid());

create policy "owner reads billing" on public.business_billing
  for select using (public.member_role(business_id) = 'owner');

create policy "members read documents" on public.documents
  for select using (public.member_role(business_id) is not null);

-- Payments add up to revenue, so only the owner reads them. Staff see each document's paid amount.
create policy "owner reads payments" on public.payments
  for select using (public.member_role(business_id) = 'owner');

create policy "owner reads activity" on public.activity_log
  for select using (public.member_role(business_id) = 'owner');

-- ---------------------------------------------------------------------------
-- Numbering and payment totals
-- ---------------------------------------------------------------------------

create or replace function public._next_number(bid uuid, doc_type text) returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.businesses
     set counters = jsonb_set(counters, array[doc_type], to_jsonb(coalesce((counters ->> doc_type)::int, 0) + 1)),
         updated_at = now()
   where id = bid
  returning (counters ->> doc_type)::int into n;
  return (case doc_type when 'receipt' then 'RCT' when 'invoice' then 'INV' else 'QUO' end)
         || '-' || (case when n >= 1000 then n::text else lpad(n::text, 4, '0') end);
end;
$$;

-- Keep a document's paid amount and status in step with its payments.
-- Receipts made from an invoice and quotations don't carry payments of their own.
create or replace function public._sync_document(doc_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d public.documents; paid bigint; new_status text;
begin
  select * into d from public.documents where id = doc_id for update;
  if not found or d.type = 'quote' or (d.data ? 'sourceInvoiceId') then return; end if;
  select coalesce(sum(amount_kobo), 0) into paid from public.payments where document_id = doc_id;
  new_status := case
    when d.total_kobo > 0 and paid >= d.total_kobo then 'paid'
    when paid > 0 then 'part'
    when d.total_kobo = 0 then d.status
    else 'unpaid' end;
  update public.documents
     set amount_paid_kobo = paid,
         status = new_status,
         data = data || jsonb_build_object('status', new_status, 'amountPaidKobo', case when new_status = 'part' then paid else 0 end)
   where id = doc_id;
end;
$$;

create or replace function public._payments_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._sync_document(coalesce(new.document_id, old.document_id));
  return null;
end;
$$;

create trigger payments_sync after insert or update or delete on public.payments
  for each row execute function public._payments_changed();

-- ---------------------------------------------------------------------------
-- Business
-- ---------------------------------------------------------------------------

create or replace function public.create_business(p_profile jsonb, p_owner_name text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare bid uuid; uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  insert into public.businesses (owner_id, profile) values (uid, coalesce(p_profile, '{}'::jsonb)) returning id into bid;
  insert into public.members (business_id, user_id, email, name, role, status)
  values (bid, uid, em, coalesce(p_owner_name, ''), 'owner', 'active');
  insert into public.business_billing (business_id) values (bid);
  return bid;
end;
$$;

create or replace function public.update_business_profile(bid uuid, p_profile jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_owner(bid);
  update public.businesses set profile = p_profile, updated_at = now() where id = bid;
  perform public._log(bid, 'settings', 'business', bid, 'Updated business details');
end;
$$;

-- Businesses the caller belongs to (after linking any invites sent to their email).
create or replace function public.my_businesses()
returns table (business_id uuid, name text, role text, status text, is_pro boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then return; end if;
  update public.members
     set user_id = auth.uid(), status = 'active', updated_at = now()
   where user_id is null and email = em and status = 'invited';
  return query
    select m.business_id, coalesce(b.profile ->> 'name', ''), m.role, m.status, public.is_pro(m.business_id)
    from public.members m join public.businesses b on b.id = m.business_id
    where m.user_id = auth.uid()
    order by m.role, b.created_at;
end;
$$;

-- What the app needs to decide what to show.
create or replace function public.my_access(bid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r text := public.member_role(bid); b public.business_billing;
begin
  select * into b from public.business_billing where business_id = bid;
  return jsonb_build_object(
    'role', r,
    'member_status', (select status from public.members where business_id = bid and user_id = auth.uid() limit 1),
    'is_pro', public.is_pro(bid),
    'comp', coalesce(b.comp, false),
    'plan', case when r = 'owner' then b.plan end,
    'status', case when r = 'owner' then b.status end,
    'current_period_end', case when r = 'owner' then b.current_period_end end,
    'pending_plan', case when r = 'owner' then b.pending_plan end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------

-- p_doc: the document as the app uses it. p_total / p_paid: totals worked out by the app (kobo).
create or replace function public.create_document(bid uuid, p_doc jsonb, p_total bigint, p_paid bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  doc_type text := p_doc ->> 'type';
  new_id uuid := gen_random_uuid();
  num text;
  row public.documents;
begin
  perform public._require_member(bid);
  if doc_type not in ('receipt', 'invoice', 'quote') then raise exception 'bad_type'; end if;
  if doc_type = 'quote' and not public.is_pro(bid) then raise exception 'pro_required' using errcode = '42501'; end if;
  if p_doc ->> 'status' = 'part' and not public.is_pro(bid) then raise exception 'pro_required' using errcode = '42501'; end if;
  num := public._next_number(bid, doc_type);
  insert into public.documents (id, business_id, type, number, issue_date, status, total_kobo, data, created_by, created_by_name)
  values (
    new_id, bid, doc_type, num, (p_doc ->> 'issueDate')::date, coalesce(p_doc ->> 'status', 'unpaid'), greatest(p_total, 0),
    p_doc || jsonb_build_object('id', new_id, 'number', num, 'schemaVersion', 1, 'createdAt', now(), 'updatedAt', now(),
                                'createdByName', coalesce(public.member_name(bid), '')),
    auth.uid(), coalesce(public.member_name(bid), '')
  );
  if doc_type <> 'quote' and p_paid > 0 then
    insert into public.payments (business_id, document_id, amount_kobo, method, paid_on, kind, created_by, created_by_name)
    values (bid, new_id, least(p_paid, p_total), coalesce(p_doc ->> 'method', 'cash'), (p_doc ->> 'issueDate')::date, 'form',
            auth.uid(), coalesce(public.member_name(bid), ''));
  end if;
  perform public._log(bid, 'create', doc_type, new_id, 'Created ' || num);
  select * into row from public.documents where id = new_id;
  return to_jsonb(row);
end;
$$;

-- Owner only: change a past record. Its number, type and creator stay the same.
create or replace function public.update_document(p_id uuid, p_doc jsonb, p_total bigint, p_paid bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.documents; other_paid bigint; row public.documents;
begin
  select * into d from public.documents where id = p_id;
  if not found then raise exception 'not_found'; end if;
  perform public._require_owner(d.business_id);
  if p_doc ->> 'status' = 'part' and d.status <> 'part' and not public.is_pro(d.business_id) then
    raise exception 'pro_required' using errcode = '42501';
  end if;
  update public.documents
     set issue_date = (p_doc ->> 'issueDate')::date,
         status = coalesce(p_doc ->> 'status', status),
         total_kobo = greatest(p_total, 0),
         -- Merge: fields from the form win; links (receipt, pay link, quote…) stay.
         data = d.data || (p_doc - 'type' - 'number' - 'id') || jsonb_build_object(
                  'id', d.id, 'type', d.type, 'number', d.number, 'schemaVersion', 1,
                  'createdAt', d.data -> 'createdAt', 'updatedAt', now(),
                  'createdByName', d.data -> 'createdByName'),
         updated_at = now()
   where id = p_id;
  if d.type <> 'quote' then
    -- The form's "amount paid" replaces the old form amount; payments recorded later stay.
    delete from public.payments where document_id = p_id and kind = 'form';
    select coalesce(sum(amount_kobo), 0) into other_paid from public.payments where document_id = p_id;
    if p_paid - other_paid > 0 then
      insert into public.payments (business_id, document_id, amount_kobo, method, paid_on, kind, created_by, created_by_name)
      values (d.business_id, p_id, least(p_paid, p_total) - other_paid, coalesce(p_doc ->> 'method', 'cash'),
              (p_doc ->> 'issueDate')::date, 'form', auth.uid(), coalesce(public.member_name(d.business_id), ''));
    end if;
    perform public._sync_document(p_id);
  end if;
  perform public._log(d.business_id, 'edit', d.type, p_id, 'Edited ' || d.number);
  select * into row from public.documents where id = p_id;
  return to_jsonb(row);
end;
$$;

-- Owner deletes. A staff member's attempt is refused and written to the activity log.
create or replace function public.delete_document(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare d public.documents; r text;
begin
  select * into d from public.documents where id = p_id;
  if not found then return false; end if;
  r := public._require_member(d.business_id);
  if r <> 'owner' then
    perform public._log(d.business_id, 'delete_attempt', d.type, p_id, 'Tried to delete ' || d.number);
    return false;
  end if;
  -- A receipt made from an invoice: the invoice stays Paid but forgets the link.
  if d.data ? 'sourceInvoiceId' then
    update public.documents set data = data - 'receiptId', updated_at = now()
     where id = (d.data ->> 'sourceInvoiceId')::uuid and data ->> 'receiptId' = p_id::text;
  end if;
  delete from public.documents where id = p_id;
  perform public._log(d.business_id, 'delete', d.type, p_id, 'Deleted ' || d.number);
  return true;
end;
$$;

-- Record money received against an invoice or receipt (Pro; staff allowed).
create or replace function public.record_payment(p_document_id uuid, p_amount bigint, p_method text, p_paid_on date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.documents; row public.documents;
begin
  select * into d from public.documents where id = p_document_id;
  if not found then raise exception 'not_found'; end if;
  perform public._require_member(d.business_id);
  if not public.is_pro(d.business_id) then raise exception 'pro_required' using errcode = '42501'; end if;
  if d.type = 'quote' then raise exception 'bad_type'; end if;
  if p_amount <= 0 or p_amount > d.total_kobo - d.amount_paid_kobo then raise exception 'bad_amount'; end if;
  insert into public.payments (business_id, document_id, amount_kobo, method, paid_on, kind, created_by, created_by_name)
  values (d.business_id, d.id, p_amount, p_method, p_paid_on, 'payment', auth.uid(), coalesce(public.member_name(d.business_id), ''));
  perform public._log(d.business_id, 'payment', d.type, d.id,
                      'Recorded ₦' || to_char(p_amount / 100.0, 'FM999,999,999,990.00') || ' on ' || d.number);
  select * into row from public.documents where id = d.id;
  return to_jsonb(row);
end;
$$;

-- Invoice paid in full: record the remaining balance and make a linked receipt dated p_today.
create or replace function public.mark_invoice_paid(p_invoice_id uuid, p_method text, p_today date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv public.documents; balance bigint; num text; rid uuid := gen_random_uuid(); row public.documents;
begin
  select * into inv from public.documents where id = p_invoice_id for update;
  if not found or inv.type <> 'invoice' then raise exception 'not_found'; end if;
  perform public._require_member(inv.business_id);
  if inv.data ? 'receiptId' then raise exception 'already_paid'; end if;
  balance := inv.total_kobo - inv.amount_paid_kobo;
  if balance > 0 then
    insert into public.payments (business_id, document_id, amount_kobo, method, paid_on, kind, created_by, created_by_name)
    values (inv.business_id, inv.id, balance, p_method, p_today, 'payment', auth.uid(), coalesce(public.member_name(inv.business_id), ''));
  end if;
  num := public._next_number(inv.business_id, 'receipt');
  insert into public.documents (id, business_id, type, number, issue_date, status, total_kobo, amount_paid_kobo, data, created_by, created_by_name)
  values (
    rid, inv.business_id, 'receipt', num, p_today, 'paid', inv.total_kobo, 0,
    (inv.data - 'receiptId' - 'payToken' - 'sourceQuoteId' - 'sourceQuoteNumber') || jsonb_build_object(
      'id', rid, 'type', 'receipt', 'number', num, 'issueDate', p_today, 'dueDate', null, 'status', 'paid',
      'amountPaidKobo', 0, 'method', p_method, 'sourceInvoiceId', inv.id, 'sourceInvoiceNumber', inv.number,
      'createdAt', now(), 'updatedAt', now(), 'createdByName', coalesce(public.member_name(inv.business_id), '')),
    auth.uid(), coalesce(public.member_name(inv.business_id), '')
  );
  update public.documents
     set data = data || jsonb_build_object('receiptId', rid, 'method', p_method), updated_at = now()
   where id = inv.id;
  perform public._log(inv.business_id, 'mark_paid', 'invoice', inv.id, 'Marked ' || inv.number || ' paid, made ' || num);
  select * into row from public.documents where id = rid;
  return to_jsonb(row);
end;
$$;

-- Which template a document uses (any member; not a change to the record's content).
create or replace function public.set_document_template(p_id uuid, p_template text) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  select business_id into bid from public.documents where id = p_id;
  if bid is null then return; end if;
  perform public._require_member(bid);
  update public.documents set data = data || jsonb_build_object('templateId', p_template) where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- First-time upload of records saved on the owner's phone
-- p_docs: [{ doc: <DocumentRecord>, total: <kobo>, paid: <kobo> }, …]
-- ---------------------------------------------------------------------------

create or replace function public.import_local(bid uuid, p_docs jsonb, p_counters jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare item jsonb; d jsonb; added int := 0;
begin
  perform public._require_owner(bid);
  for item in select * from jsonb_array_elements(coalesce(p_docs, '[]'::jsonb)) loop
    d := item -> 'doc';
    insert into public.documents (id, business_id, type, number, issue_date, status, total_kobo, data, created_by, created_by_name, created_at, updated_at)
    values ((d ->> 'id')::uuid, bid, d ->> 'type', d ->> 'number', (d ->> 'issueDate')::date, d ->> 'status',
            greatest((item ->> 'total')::bigint, 0), d, auth.uid(), coalesce(public.member_name(bid), ''),
            coalesce((d ->> 'createdAt')::timestamptz, now()), now())
    on conflict do nothing;
    if found then
      added := added + 1;
      if (item ->> 'paid')::bigint > 0 and d ->> 'type' <> 'quote' and not (d ? 'sourceInvoiceId') then
        insert into public.payments (business_id, document_id, amount_kobo, method, paid_on, kind, source)
        values (bid, (d ->> 'id')::uuid, least((item ->> 'paid')::bigint, greatest((item ->> 'total')::bigint, 1)),
                coalesce(d ->> 'method', 'cash'), (d ->> 'issueDate')::date, 'form', 'import');
      end if;
    end if;
  end loop;
  update public.businesses b
     set counters = jsonb_build_object(
           'receipt', greatest(coalesce((b.counters ->> 'receipt')::int, 0), coalesce((p_counters ->> 'receipt')::int, 0)),
           'invoice', greatest(coalesce((b.counters ->> 'invoice')::int, 0), coalesce((p_counters ->> 'invoice')::int, 0)),
           'quote', greatest(coalesce((b.counters ->> 'quote')::int, 0), coalesce((p_counters ->> 'quote')::int, 0)))
   where b.id = bid;
  perform public._log(bid, 'settings', 'business', bid, 'Copied ' || added || ' records from this phone');
  return added;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

revoke all on all functions in schema public from public, anon;
grant execute on function
  public.is_pro(uuid), public.member_role(uuid), public.my_access(uuid), public.my_businesses(),
  public.create_business(jsonb, text), public.update_business_profile(uuid, jsonb),
  public.create_document(uuid, jsonb, bigint, bigint), public.update_document(uuid, jsonb, bigint, bigint),
  public.delete_document(uuid), public.record_payment(uuid, bigint, text, date),
  public.mark_invoice_paid(uuid, text, date), public.set_document_template(uuid, text),
  public.import_local(uuid, jsonb, jsonb)
to authenticated;
grant select on public.businesses, public.members, public.business_billing, public.documents, public.payments, public.activity_log to authenticated;
