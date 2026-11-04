-- Beta hardening. Adds only; deletes nothing.
--  1. The server re-calculates every document total itself and checks every field (no trust in the phone).
--  2. Customers table (one list per business), linked to documents.
--  3. Fast totals for the home screen (calculated in the database, not on the phone).
--  4. Consent records, "download my data", and account deletion support (NDPA 2023).
--  5. Beta invite codes managed in a table, and a shared rate limiter for server routes.

-- ---------------------------------------------------------------------------
-- 1. Rate limiter (server routes and code redemption). Fixed windows, shared by all servers.
-- ---------------------------------------------------------------------------

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;
-- No policies: only security-definer functions and the service role touch it.

-- True when this hit is allowed; false when the limit for the window is used up.
create or replace function public.rate_limit_hit(p_key text, p_window_seconds int, p_max int) returns boolean
language plpgsql security definer set search_path = public as $$
declare w timestamptz; n int;
begin
  w := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (key, window_start, hits) values (left(p_key, 200), w, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into n;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
  return n <= p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Document checks and server-side totals
-- ---------------------------------------------------------------------------

-- Same maths as src/lib/totals.ts: kobo integers, quantities to 2 decimals, half-up rounding.
create or replace function public._doc_totals(p_doc jsonb, out subtotal_kobo bigint, out total_kobo bigint, out paid_kobo bigint)
language plpgsql immutable set search_path = public as $$
declare
  item jsonb; q numeric; price numeric; sub numeric := 0; disc numeric := 0; taxable numeric; vat numeric := 0;
  delivery numeric; bp numeric; tot numeric; st text := coalesce(p_doc ->> 'status', 'unpaid');
begin
  for item in select * from jsonb_array_elements(coalesce(p_doc -> 'items', '[]'::jsonb)) loop
    q := round(greatest(coalesce((item ->> 'quantity')::numeric, 0), 0) * 100);
    price := greatest(coalesce((item ->> 'unitPriceKobo')::numeric, 0), 0);
    sub := sub + div(price * q * 2 + 100, 200);
  end loop;
  if jsonb_typeof(p_doc -> 'discount') = 'object' then
    if p_doc -> 'discount' ->> 'type' = 'amount' then
      disc := greatest(coalesce((p_doc -> 'discount' ->> 'kobo')::numeric, 0), 0);
    elsif p_doc -> 'discount' ->> 'type' = 'percent' then
      bp := round(least(100, greatest(0, coalesce((p_doc -> 'discount' ->> 'percent')::numeric, 0))) * 100);
      disc := div(sub * bp * 2 + 10000, 20000);
    end if;
    disc := least(disc, sub);
  end if;
  taxable := sub - disc;
  if coalesce((p_doc ->> 'vatEnabled')::boolean, false) then
    vat := div(taxable * 750 * 2 + 10000, 20000); -- 7.5%
  end if;
  delivery := greatest(coalesce((p_doc ->> 'deliveryKobo')::numeric, 0), 0);
  tot := taxable + vat + delivery;
  subtotal_kobo := sub;
  total_kobo := tot;
  paid_kobo := case
    when p_doc ->> 'type' = 'quote' then 0
    when st = 'paid' then tot
    when st = 'part' then least(greatest(coalesce((p_doc ->> 'amountPaidKobo')::numeric, 0), 0), tot)
    else 0 end;
end;
$$;

create or replace function public._bad(field text) returns void language plpgsql as $$
begin
  raise exception 'invalid_input:%', field using errcode = '22023';
end;
$$;

create or replace function public._is_int(v jsonb, lo numeric, hi numeric) returns boolean language sql immutable as $$
  select jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
         and (v #>> '{}')::numeric between lo and hi;
$$;

-- Checks a document from the app. Raises invalid_input:<field> with the first problem found.
create or replace function public._validate_doc(p_doc jsonb) returns void
language plpgsql immutable set search_path = public as $$
declare item jsonb; n int := 0; t text := p_doc ->> 'type'; tot record; max_kobo numeric := 1000000000000;
begin
  if jsonb_typeof(p_doc) <> 'object' then perform public._bad('document'); end if;
  if octet_length(p_doc::text) > 100000 then perform public._bad('too_large'); end if;
  if t is null or t not in ('receipt', 'invoice', 'quote') then perform public._bad('type'); end if;
  if jsonb_typeof(p_doc -> 'items') <> 'array' then perform public._bad('items'); end if;
  for item in select * from jsonb_array_elements(p_doc -> 'items') loop
    n := n + 1;
    if jsonb_typeof(item) <> 'object'
       or jsonb_typeof(item -> 'description') <> 'string'
       or length(btrim(item ->> 'description')) not between 1 and 300 then perform public._bad('item_description'); end if;
    if jsonb_typeof(item -> 'quantity') <> 'number'
       or (item ->> 'quantity')::numeric <= 0 or (item ->> 'quantity')::numeric > 1000000 then perform public._bad('item_quantity'); end if;
    if not public._is_int(item -> 'unitPriceKobo', 0, max_kobo) then perform public._bad('item_price'); end if;
  end loop;
  if n = 0 or n > 200 then perform public._bad('items'); end if;
  if jsonb_typeof(p_doc -> 'customer') <> 'object'
     or length(coalesce(p_doc -> 'customer' ->> 'name', '')) > 120 then perform public._bad('customer_name'); end if;
  if coalesce(p_doc -> 'customer' ->> 'phone', '') !~ '^(\+234[789][01][0-9]{8})?$' then perform public._bad('customer_phone'); end if;
  if jsonb_typeof(p_doc -> 'discount') = 'object' then
    if p_doc -> 'discount' ->> 'type' = 'amount' then
      if not public._is_int(p_doc -> 'discount' -> 'kobo', 0, max_kobo) then perform public._bad('discount'); end if;
    elsif p_doc -> 'discount' ->> 'type' = 'percent' then
      if jsonb_typeof(p_doc -> 'discount' -> 'percent') <> 'number'
         or (p_doc -> 'discount' ->> 'percent')::numeric not between 0 and 100 then perform public._bad('discount'); end if;
    else perform public._bad('discount'); end if;
  elsif coalesce(jsonb_typeof(p_doc -> 'discount'), 'null') <> 'null' then perform public._bad('discount'); end if;
  if not public._is_int(coalesce(p_doc -> 'deliveryKobo', '0'::jsonb), 0, max_kobo) then perform public._bad('delivery'); end if;
  if coalesce(jsonb_typeof(p_doc -> 'vatEnabled'), 'boolean') <> 'boolean' then perform public._bad('vat'); end if;
  if coalesce(p_doc ->> 'status', 'unpaid') not in ('paid', 'part', 'unpaid') then perform public._bad('status'); end if;
  if coalesce(p_doc ->> 'method', 'transfer') not in ('transfer', 'cash', 'pos') then perform public._bad('method'); end if;
  if length(coalesce(p_doc ->> 'notes', '')) > 1000 then perform public._bad('notes'); end if;
  if coalesce(p_doc ->> 'templateId', 'classic') not in ('classic', 'modern', 'compact', 'bold', 'elegant') then perform public._bad('template'); end if;
  if coalesce(p_doc ->> 'issueDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then perform public._bad('issue_date'); end if;
  begin
    perform (p_doc ->> 'issueDate')::date;
    if p_doc ->> 'dueDate' is not null then
      if (p_doc ->> 'dueDate')::date < (p_doc ->> 'issueDate')::date then perform public._bad('due_date'); end if;
    end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    perform public._bad('date');
  end;
  if t = 'quote' then
    if coalesce(p_doc ->> 'quoteTitle', 'quotation') not in ('quotation', 'proforma') then perform public._bad('quote_title'); end if;
    if coalesce(p_doc ->> 'quoteStatus', 'draft') not in ('draft', 'sent', 'accepted', 'declined') then perform public._bad('quote_status'); end if;
  end if;
  if p_doc ->> 'status' = 'part' and t <> 'quote' then
    select * into tot from public._doc_totals(p_doc);
    if not public._is_int(p_doc -> 'amountPaidKobo', 1, max_kobo) or (p_doc ->> 'amountPaidKobo')::numeric >= tot.total_kobo then
      perform public._bad('amount_paid');
    end if;
  end if;
end;
$$;

-- Business details: size cap, and only safe values in the fields that end up in images and styles.
create or replace function public._validate_profile(p jsonb) returns void language plpgsql immutable as $$
declare k text;
begin
  if jsonb_typeof(p) <> 'object' then perform public._bad('profile'); end if;
  if octet_length(p::text) > 400000 then perform public._bad('logo_too_large'); end if;
  if coalesce(p ->> 'logo', '') !~ '^(data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+)?$' then perform public._bad('logo'); end if;
  if coalesce(p ->> 'brandColor', '#000000') !~ '^#[0-9a-fA-F]{6}$' then perform public._bad('brand_color'); end if;
  if coalesce(p ->> 'accountNumber', '') !~ '^([0-9]{10})?$' then perform public._bad('account_number'); end if;
  foreach k in array array['name', 'phone', 'whatsapp', 'address', 'email', 'bankName', 'accountName', 'instagram'] loop
    if length(coalesce(p ->> k, '')) > 200 then perform public._bad(k); end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Customers
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null default '' check (length(name) <= 120),
  phone text not null default '' check (phone ~ '^(\+234[789][01][0-9]{8})?$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customers_business_phone_idx on public.customers (business_id, phone) where phone <> '';
create unique index customers_business_name_nophone_idx on public.customers (business_id, lower(name)) where phone = '';
create index customers_business_name_idx on public.customers (business_id, lower(name));
alter table public.customers enable row level security;
create policy "members read customers" on public.customers
  for select using (public.member_role(business_id) is not null);
grant select on public.customers to authenticated;

alter table public.documents add column customer_id uuid references public.customers (id) on delete set null;
alter table public.documents add column customer_name text not null default '';
create index documents_business_customer_idx on public.documents (business_id, customer_id);
create index documents_business_issue_idx on public.documents (business_id, issue_date desc);
create index documents_business_owing_idx on public.documents (business_id) where status <> 'paid' and type <> 'quote';
create index documents_business_type_created_idx on public.documents (business_id, type, created_at desc);

-- Find or add the customer for a document (by phone, or by name when there's no phone).
create or replace function public._upsert_customer(bid uuid, p_name text, p_phone text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; nm text := left(btrim(coalesce(p_name, '')), 120);
        ph text := case when coalesce(p_phone, '') ~ '^\+234[789][01][0-9]{8}$' then p_phone else '' end;
begin
  if nm = '' and ph = '' then return null; end if;
  if ph <> '' then
    select id into cid from public.customers where business_id = bid and phone = ph;
    if cid is null then
      insert into public.customers (business_id, name, phone) values (bid, nm, ph)
      on conflict (business_id, phone) where phone <> '' do update set updated_at = now()
      returning id into cid;
    elsif nm <> '' then
      update public.customers set name = nm, updated_at = now() where id = cid and name <> nm;
    end if;
  else
    select id into cid from public.customers where business_id = bid and phone = '' and lower(name) = lower(nm);
    if cid is null then
      insert into public.customers (business_id, name) values (bid, nm)
      on conflict (business_id, lower(name)) where phone = '' do update set updated_at = now()
      returning id into cid;
    end if;
  end if;
  return cid;
end;
$$;

-- Add or change a customer from the Customers screen (owner or staff).
create or replace function public.save_customer(bid uuid, p_id uuid, p_name text, p_phone text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  perform public._require_member(bid);
  if length(btrim(coalesce(p_name, ''))) not between 1 and 120 then perform public._bad('customer_name'); end if;
  if coalesce(p_phone, '') !~ '^(\+234[789][01][0-9]{8})?$' then perform public._bad('customer_phone'); end if;
  if p_id is null then
    return public._upsert_customer(bid, p_name, p_phone);
  end if;
  update public.customers set name = btrim(p_name), phone = coalesce(p_phone, ''), updated_at = now()
   where id = p_id and business_id = bid
  returning id into cid;
  if cid is null then raise exception 'not_found'; end if;
  return cid;
exception when unique_violation then
  raise exception 'invalid_input:customer_exists' using errcode = '22023';
end;
$$;

-- Owner removes a customer from the list (their documents keep the name and phone).
create or replace function public.delete_customer(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  select business_id into bid from public.customers where id = p_id;
  if bid is null then return; end if;
  perform public._require_owner(bid);
  delete from public.customers where id = p_id;
end;
$$;

-- Backfill: one customer per distinct phone/name in existing documents.
do $$
declare d record;
begin
  for d in select id, business_id, data from public.documents loop
    update public.documents
       set customer_id = public._upsert_customer(d.business_id, d.data -> 'customer' ->> 'name', d.data -> 'customer' ->> 'phone'),
           customer_name = left(coalesce(d.data -> 'customer' ->> 'name', ''), 120)
     where id = d.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Create / update documents: checked and totalled on the server.
-- (The total and paid numbers sent by the app are ignored; the same signatures are kept.)
-- ---------------------------------------------------------------------------

create or replace function public.create_document(bid uuid, p_doc jsonb, p_total bigint, p_paid bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  doc_type text := p_doc ->> 'type';
  new_id uuid := gen_random_uuid();
  num text; row public.documents; tot record; cid uuid;
  who text;
begin
  perform public._require_member(bid);
  if doc_type = 'quote' and not public.is_pro(bid) then raise exception 'pro_required' using errcode = '42501'; end if;
  if p_doc ->> 'status' = 'part' and not public.is_pro(bid) then raise exception 'pro_required' using errcode = '42501'; end if;
  perform public._validate_doc(p_doc);
  select * into tot from public._doc_totals(p_doc);
  who := coalesce(public.member_name(bid), '');
  cid := public._upsert_customer(bid, p_doc -> 'customer' ->> 'name', p_doc -> 'customer' ->> 'phone');
  num := public._next_number(bid, doc_type);
  insert into public.documents (id, business_id, type, number, issue_date, status, total_kobo, data, created_by, created_by_name,
                                customer_id, customer_name)
  values (
    new_id, bid, doc_type, num, (p_doc ->> 'issueDate')::date,
    case when doc_type = 'quote' then 'unpaid' else coalesce(p_doc ->> 'status', 'unpaid') end, tot.total_kobo,
    (p_doc - 'id' - 'number' - 'createdAt' - 'updatedAt' - 'createdByName' - 'receiptId' - 'sourceInvoiceId' - 'sourceInvoiceNumber'
           - 'payToken' - 'invoiceId' - 'invoiceNumber' - 'sourceQuoteId' - 'sourceQuoteNumber')
      || jsonb_build_object('id', new_id, 'number', num, 'schemaVersion', 1, 'createdAt', now(), 'updatedAt', now(), 'createdByName', who),
    auth.uid(), who, cid, left(coalesce(p_doc -> 'customer' ->> 'name', ''), 120)
  );
  if doc_type <> 'quote' and tot.paid_kobo > 0 then
    insert into public.payments (business_id, document_id, amount_kobo, method, paid_on, kind, created_by, created_by_name)
    values (bid, new_id, tot.paid_kobo, coalesce(p_doc ->> 'method', 'cash'), (p_doc ->> 'issueDate')::date, 'form', auth.uid(), who);
  end if;
  perform public._log(bid, 'create', doc_type, new_id, 'Created ' || num);
  select * into row from public.documents where id = new_id;
  return to_jsonb(row);
end;
$$;

create or replace function public.update_document(p_id uuid, p_doc jsonb, p_total bigint, p_paid bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.documents; other_paid bigint; row public.documents; tot record; merged jsonb; cid uuid;
begin
  select * into d from public.documents where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  perform public._require_owner(d.business_id);
  -- The type can't change, so check the edit as the stored type.
  merged := p_doc || jsonb_build_object('type', d.type);
  perform public._validate_doc(merged);
  if merged ->> 'status' = 'part' and d.status <> 'part' and not public.is_pro(d.business_id) then
    raise exception 'pro_required' using errcode = '42501';
  end if;
  select * into tot from public._doc_totals(merged);
  cid := public._upsert_customer(d.business_id, merged -> 'customer' ->> 'name', merged -> 'customer' ->> 'phone');
  update public.documents
     set issue_date = (merged ->> 'issueDate')::date,
         status = case when d.type = 'quote' then 'unpaid' else coalesce(merged ->> 'status', status) end,
         total_kobo = tot.total_kobo,
         customer_id = cid,
         customer_name = left(coalesce(merged -> 'customer' ->> 'name', ''), 120),
         -- Merge: fields from the form win; links (receipt, pay link, quote…) stay.
         data = d.data || (merged - 'type' - 'number' - 'id' - 'receiptId' - 'sourceInvoiceId' - 'sourceInvoiceNumber' - 'payToken'
                                  - 'invoiceId' - 'invoiceNumber' - 'sourceQuoteId' - 'sourceQuoteNumber')
                || jsonb_build_object(
                  'id', d.id, 'type', d.type, 'number', d.number, 'schemaVersion', 1,
                  'createdAt', d.data -> 'createdAt', 'updatedAt', now(),
                  'createdByName', d.data -> 'createdByName'),
         updated_at = now()
   where id = p_id;
  if d.type <> 'quote' then
    -- The form's "amount paid" replaces the old form amount; payments recorded later stay.
    delete from public.payments where document_id = p_id and kind = 'form';
    select coalesce(sum(amount_kobo), 0) into other_paid from public.payments where document_id = p_id;
    if tot.paid_kobo - other_paid > 0 then
      insert into public.payments (business_id, document_id, amount_kobo, method, paid_on, kind, created_by, created_by_name)
      values (d.business_id, p_id, tot.paid_kobo - other_paid, coalesce(merged ->> 'method', 'cash'),
              (merged ->> 'issueDate')::date, 'form', auth.uid(), coalesce(public.member_name(d.business_id), ''));
    end if;
    perform public._sync_document(p_id);
  end if;
  perform public._log(d.business_id, 'edit', d.type, p_id, 'Edited ' || d.number);
  select * into row from public.documents where id = p_id;
  return to_jsonb(row);
end;
$$;

-- First upload of records from a phone: each record is checked and totalled on the server too.
create or replace function public.import_local(bid uuid, p_docs jsonb, p_counters jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare item jsonb; d jsonb; added int := 0; tot record; n int := 0;
begin
  perform public._require_owner(bid);
  if jsonb_typeof(coalesce(p_docs, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_docs, '[]'::jsonb)) > 5000 then
    perform public._bad('import');
  end if;
  for item in select * from jsonb_array_elements(coalesce(p_docs, '[]'::jsonb)) loop
    d := item -> 'doc';
    n := n + 1;
    if coalesce(d ->> 'number', '') !~ '^(RCT|INV|QUO)-[0-9]{4,}$' then perform public._bad('number'); end if;
    perform public._validate_doc(d);
    select * into tot from public._doc_totals(d);
    insert into public.documents (id, business_id, type, number, issue_date, status, total_kobo, data, created_by, created_by_name,
                                  created_at, updated_at, customer_id, customer_name)
    values ((d ->> 'id')::uuid, bid, d ->> 'type', d ->> 'number', (d ->> 'issueDate')::date,
            case when d ->> 'type' = 'quote' then 'unpaid' else coalesce(d ->> 'status', 'unpaid') end,
            tot.total_kobo, d - 'payToken', auth.uid(), coalesce(public.member_name(bid), ''),
            coalesce((d ->> 'createdAt')::timestamptz, now()), now(),
            public._upsert_customer(bid, d -> 'customer' ->> 'name', d -> 'customer' ->> 'phone'),
            left(coalesce(d -> 'customer' ->> 'name', ''), 120))
    on conflict do nothing;
    if found then
      added := added + 1;
      if tot.paid_kobo > 0 and d ->> 'type' <> 'quote' and not (d ? 'sourceInvoiceId') then
        insert into public.payments (business_id, document_id, amount_kobo, method, paid_on, kind, source)
        values (bid, (d ->> 'id')::uuid, tot.paid_kobo, coalesce(d ->> 'method', 'cash'), (d ->> 'issueDate')::date, 'form', 'import');
      end if;
    end if;
  end loop;
  update public.businesses b
     set counters = jsonb_build_object(
           'receipt', greatest(coalesce((b.counters ->> 'receipt')::int, 0), least(coalesce((p_counters ->> 'receipt')::int, 0), 1000000)),
           'invoice', greatest(coalesce((b.counters ->> 'invoice')::int, 0), least(coalesce((p_counters ->> 'invoice')::int, 0), 1000000)),
           'quote', greatest(coalesce((b.counters ->> 'quote')::int, 0), least(coalesce((p_counters ->> 'quote')::int, 0), 1000000)))
   where b.id = bid;
  perform public._log(bid, 'settings', 'business', bid, 'Copied ' || added || ' records from this phone');
  return added;
end;
$$;

create or replace function public.create_business(p_profile jsonb, p_owner_name text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare bid uuid; uid uuid := auth.uid(); em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  perform public._validate_profile(coalesce(p_profile, '{}'::jsonb));
  if length(coalesce(p_owner_name, '')) > 120 then perform public._bad('name'); end if;
  if (select count(*) from public.businesses where owner_id = uid) >= 5 then perform public._bad('too_many_businesses'); end if;
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
  perform public._validate_profile(p_profile);
  update public.businesses set profile = p_profile, updated_at = now() where id = bid;
  perform public._log(bid, 'settings', 'business', bid, 'Updated business details');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Home screen totals, calculated in the database (owner only)
-- ---------------------------------------------------------------------------

create or replace function public.business_summary(bid uuid, p_today date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare week_start date := p_today - ((extract(isodow from p_today)::int) - 1);
        month_start date := date_trunc('month', p_today)::date;
        result jsonb;
begin
  perform public._require_owner(bid);
  select jsonb_build_object(
    'week_kobo', coalesce((select sum(amount_kobo) from public.payments
                           where business_id = bid and paid_on between week_start and p_today), 0),
    'month_kobo', coalesce((select sum(amount_kobo) from public.payments
                            where business_id = bid and paid_on between month_start and p_today), 0),
    'owing_kobo', coalesce(sum(greatest(d.total_kobo - d.amount_paid_kobo, 0)), 0),
    'owing_count', count(*) filter (where d.total_kobo - d.amount_paid_kobo > 0)
  ) into result
  from public.documents d
  where d.business_id = bid and d.status <> 'paid' and d.type <> 'quote' and not (d.type = 'invoice' and d.data ? 'receiptId');
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Consent, beta codes, data export, account deletion
-- ---------------------------------------------------------------------------

create table public.user_consents (
  user_id uuid not null references auth.users (id) on delete cascade,
  document text not null check (document in ('terms', 'privacy')),
  version text not null check (length(version) between 1 and 40),
  accepted_at timestamptz not null default now(),
  primary key (user_id, document, version)
);
alter table public.user_consents enable row level security;
create policy "users read own consents" on public.user_consents for select using (user_id = auth.uid());
grant select on public.user_consents to authenticated;

create or replace function public.record_consent(p_version text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  insert into public.user_consents (user_id, document, version) values (auth.uid(), 'terms', p_version), (auth.uid(), 'privacy', p_version)
  on conflict do nothing;
end;
$$;

-- Beta invite codes. Manage them in the Supabase Table Editor (table "beta_codes").
create table public.beta_codes (
  code text primary key check (code = upper(code) and length(code) between 4 and 40),
  note text not null default '',
  max_uses int not null default 1 check (max_uses >= 1),
  used_count int not null default 0,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.beta_redemptions (
  code text not null references public.beta_codes (code) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  redeemed_at timestamptz not null default now(),
  primary key (code, business_id)
);
alter table public.beta_codes enable row level security;
alter table public.beta_redemptions enable row level security;
-- No policies: testers can't list codes; only redeem_beta_code and the dashboard can read them.

-- Returns 'ok', 'invalid_code', 'code_used_up' or 'rate_limited'. It never raises for a wrong
-- code, so every attempt is counted by the rate limiter (a raised error would undo the count).
create or replace function public.redeem_beta_code(bid uuid, p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare c public.beta_codes; code_in text := upper(btrim(coalesce(p_code, '')));
begin
  perform public._require_owner(bid);
  if not public.rate_limit_hit('beta:' || auth.uid()::text, 3600, 10) then
    return 'rate_limited';
  end if;
  select * into c from public.beta_codes where code = code_in for update;
  if not found or not c.active or (c.expires_at is not null and c.expires_at < now()) then
    return 'invalid_code';
  end if;
  if exists (select 1 from public.beta_redemptions where code = code_in and business_id = bid) then
    return 'ok';
  end if;
  if c.used_count >= c.max_uses then return 'code_used_up'; end if;
  update public.beta_codes set used_count = used_count + 1 where code = code_in;
  insert into public.beta_redemptions (code, business_id, user_id) values (code_in, bid, auth.uid());
  update public.business_billing set comp = true, comp_reason = 'beta:' || code_in, updated_at = now() where business_id = bid;
  perform public._log(bid, 'settings', 'business', bid, 'Pro unlocked with a beta code');
  return 'ok';
end;
$$;

-- Everything InCeipt holds about the caller (NDPA right of access / portability).
-- Full business records only for businesses the caller owns.
create or replace function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at) from auth.users u where u.id = uid),
    'consents', coalesce((select jsonb_agg(to_jsonb(c)) from public.user_consents c where c.user_id = uid), '[]'::jsonb),
    'memberships', coalesce((select jsonb_agg(jsonb_build_object('business_id', m.business_id, 'role', m.role, 'status', m.status,
                                                                 'name', m.name, 'email', m.email))
                             from public.members m where m.user_id = uid), '[]'::jsonb),
    'businesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'profile', b.profile, 'settings', b.settings, 'created_at', b.created_at,
        'billing', (select to_jsonb(x) - 'paystack_email_token' from public.business_billing x where x.business_id = b.id),
        'customers', coalesce((select jsonb_agg(to_jsonb(c)) from public.customers c where c.business_id = b.id), '[]'::jsonb),
        'documents', coalesce((select jsonb_agg(d.data order by d.created_at) from public.documents d where d.business_id = b.id), '[]'::jsonb),
        'payments', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.payments p where p.business_id = b.id), '[]'::jsonb),
        'expenses', coalesce((select jsonb_agg(to_jsonb(e) order by e.spent_on) from public.expenses e where e.business_id = b.id), '[]'::jsonb),
        'staff', coalesce((select jsonb_agg(jsonb_build_object('email', m.email, 'name', m.name, 'role', m.role, 'status', m.status))
                           from public.members m where m.business_id = b.id), '[]'::jsonb),
        'activity', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.activity_log a where a.business_id = b.id), '[]'::jsonb)
      ))
      from public.businesses b where b.owner_id = uid), '[]'::jsonb)
  );
end;
$$;

-- Server only (the /api/account route, after checking the signed-in user).
-- Removes the businesses the user owns (and everything in them) and their staff memberships.
-- The auth user itself is then deleted by the route through Supabase's admin API.
create or replace function public.delete_account_data(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare owned uuid[];
begin
  select coalesce(array_agg(id), '{}') into owned from public.businesses where owner_id = p_user;
  delete from public.businesses where owner_id = p_user;
  delete from public.members where user_id = p_user;
  return jsonb_build_object('deleted_businesses', to_jsonb(owned));
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------

revoke all on function
  public.rate_limit_hit(text, int, int), public._doc_totals(jsonb), public._bad(text), public._is_int(jsonb, numeric, numeric),
  public._validate_doc(jsonb), public._validate_profile(jsonb), public._upsert_customer(uuid, text, text),
  public.save_customer(uuid, uuid, text, text), public.delete_customer(uuid), public.business_summary(uuid, date),
  public.record_consent(text), public.redeem_beta_code(uuid, text), public.export_my_data(), public.delete_account_data(uuid)
from public, anon;
revoke all on function public.rate_limit_hit(text, int, int), public.delete_account_data(uuid), public._upsert_customer(uuid, text, text)
from authenticated;
grant execute on function
  public.save_customer(uuid, uuid, text, text), public.delete_customer(uuid), public.business_summary(uuid, date),
  public.record_consent(text), public.redeem_beta_code(uuid, text), public.export_my_data()
to authenticated;
grant execute on function public.rate_limit_hit(text, int, int), public.delete_account_data(uuid) to service_role;
