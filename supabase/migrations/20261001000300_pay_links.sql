-- Pay Now links: each business gets a Paystack subaccount (their bank account), and invoices get a
-- private link that customers open to pay online. Payments arrive by webhook (server, service role).

create table public.business_payouts (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  subaccount_code text not null,
  bank_code text not null,
  bank_name text not null,
  account_number text not null check (account_number ~ '^[0-9]{10}$'),
  account_name text not null,
  updated_at timestamptz not null default now()
);
alter table public.business_payouts enable row level security;
create policy "owner reads payouts" on public.business_payouts
  for select using (public.member_role(business_id) = 'owner');
grant select on public.business_payouts to authenticated;

alter table public.documents add column pay_token text unique;

-- my_access now also says whether online payments are set up (staff need to know, not the details).
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
    'pending_plan', case when r = 'owner' then b.pending_plan end,
    'payouts_connected', r is not null and exists (select 1 from public.business_payouts p where p.business_id = bid)
  );
end;
$$;

-- Give an invoice a Pay Now link (Pro; owner or staff). Returns the link code.
create or replace function public.create_pay_link(p_doc_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare d public.documents; token text;
begin
  select * into d from public.documents where id = p_doc_id for update;
  if not found then raise exception 'not_found'; end if;
  perform public._require_member(d.business_id);
  if not public.is_pro(d.business_id) then raise exception 'pro_required' using errcode = '42501'; end if;
  if d.type <> 'invoice' then raise exception 'bad_type'; end if;
  if d.total_kobo - d.amount_paid_kobo <= 0 then raise exception 'nothing_to_pay'; end if;
  if not exists (select 1 from public.business_payouts where business_id = d.business_id) then
    raise exception 'payouts_not_connected';
  end if;
  if d.pay_token is not null then return d.pay_token; end if;
  loop
    token := substr(replace(gen_random_uuid()::text, '-', ''), 1, 14);
    begin
      update public.documents
         set pay_token = token, data = data || jsonb_build_object('payToken', token), updated_at = now()
       where id = p_doc_id;
      exit;
    exception when unique_violation then
      -- try another code
    end;
  end loop;
  perform public._log(d.business_id, 'edit', 'invoice', d.id, 'Added a Pay Now link to ' || d.number);
  return token;
end;
$$;

revoke all on function public.create_pay_link(uuid) from public, anon;
grant execute on function public.create_pay_link(uuid), public.my_access(uuid) to authenticated;
