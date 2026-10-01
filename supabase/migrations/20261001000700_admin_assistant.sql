-- InCeipt Assistant usage (daily message limit and token counts), and the admin dashboard queries.
-- Nothing here changes existing tables or data.

create table public.agent_usage (
  business_id uuid not null references public.businesses (id) on delete cascade,
  day date not null,              -- Lagos calendar day
  messages int not null default 0 check (messages >= 0),
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (business_id, day)
);
alter table public.agent_usage enable row level security;
create policy "owner reads assistant usage" on public.agent_usage
  for select using (public.member_role(business_id) = 'owner');
grant select on public.agent_usage to authenticated;

create or replace function public._lagos_today() returns date
language sql stable as $$ select (now() at time zone 'Africa/Lagos')::date $$;

-- Server only. Counts one assistant message for today. Returns the new count, or -1 when the
-- day's limit is already reached (nothing is counted then).
create or replace function public.agent_take_message(bid uuid, day_limit int) returns int
language plpgsql security definer set search_path = public as $$
declare
  used int;
begin
  insert into public.agent_usage as u (business_id, day, messages)
  values (bid, public._lagos_today(), 1)
  on conflict (business_id, day) do update set messages = u.messages + 1
    where u.messages < day_limit
  returning u.messages into used;
  if used is null or used > day_limit then
    return -1;
  end if;
  return used;
end;
$$;

-- Server only. Adds the tokens a reply used (for cost monitoring).
create or replace function public.agent_add_tokens(bid uuid, p_input bigint, p_output bigint) returns void
language sql security definer set search_path = public as $$
  update public.agent_usage
     set input_tokens = input_tokens + greatest(p_input, 0), output_tokens = output_tokens + greatest(p_output, 0)
   where business_id = bid and day = public._lagos_today();
$$;

-- Server only (admin dashboard). Totals across all accounts. No customer or document contents.
create or replace function public.admin_overview() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'users', (select count(*) from auth.users),
    'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'users_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'businesses', (select count(*) from public.businesses),
    'businesses_7d', (select count(*) from public.businesses where created_at > now() - interval '7 days'),
    'businesses_30d', (select count(*) from public.businesses where created_at > now() - interval '30 days'),
    'active_7d', (select count(distinct business_id) from public.activity_log where created_at > now() - interval '7 days'),
    'active_30d', (select count(distinct business_id) from public.activity_log where created_at > now() - interval '30 days'),
    'pro', (select count(*) from public.businesses b where public.is_pro(b.id)),
    'pro_monthly', (select count(*) from public.business_billing where plan = 'monthly' and status in ('active', 'non_renewing', 'attention') and public.is_pro(business_id) and not comp),
    'pro_yearly', (select count(*) from public.business_billing where plan = 'yearly' and status in ('active', 'non_renewing', 'attention') and public.is_pro(business_id) and not comp),
    'pro_comp', (select count(*) from public.business_billing where comp),
    'cancelling', (select count(*) from public.business_billing where status = 'non_renewing' and public.is_pro(business_id)),
    'payment_issues', (select count(*) from public.business_billing where status = 'attention'),
    'documents', (select count(*) from public.documents),
    'documents_30d', (select count(*) from public.documents where created_at > now() - interval '30 days'),
    'receipts_30d', (select count(*) from public.documents where type = 'receipt' and created_at > now() - interval '30 days'),
    'invoices_30d', (select count(*) from public.documents where type = 'invoice' and created_at > now() - interval '30 days'),
    'quotes_30d', (select count(*) from public.documents where type = 'quote' and created_at > now() - interval '30 days'),
    'online_payments_30d', (select count(*) from public.payments where source = 'paystack' and created_at > now() - interval '30 days'),
    'online_payments_kobo_30d', (select coalesce(sum(amount_kobo), 0) from public.payments where source = 'paystack' and created_at > now() - interval '30 days'),
    'payouts_connected', (select count(*) from public.business_payouts),
    'staff', (select count(*) from public.members where role = 'staff' and status = 'active'),
    'expenses_30d', (select count(*) from public.expenses where created_at > now() - interval '30 days'),
    'assistant_messages_today', (select coalesce(sum(messages), 0) from public.agent_usage where day = public._lagos_today()),
    'assistant_messages_30d', (select coalesce(sum(messages), 0) from public.agent_usage where day > public._lagos_today() - 30),
    'assistant_input_tokens_30d', (select coalesce(sum(input_tokens), 0) from public.agent_usage where day > public._lagos_today() - 30),
    'assistant_output_tokens_30d', (select coalesce(sum(output_tokens), 0) from public.agent_usage where day > public._lagos_today() - 30),
    'webhooks_7d', (select count(*) from public.paystack_events where received_at > now() - interval '7 days'),
    'webhook_errors', coalesce((
      select jsonb_agg(e order by e.received_at desc) from (
        select id, event, error, received_at from public.paystack_events
        where error is not null order by received_at desc limit 10
      ) e), '[]'::jsonb),
    'signups_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'count', d.n) order by d.day) from (
        select (created_at at time zone 'Africa/Lagos')::date as day, count(*) as n
        from public.businesses where created_at > now() - interval '30 days' group by 1
      ) d), '[]'::jsonb)
  );
$$;

-- Server only (admin dashboard). One row per business: who, plan and how much they use InCeipt.
create or replace function public.admin_businesses(p_search text default '', p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, name text, owner_email text, created_at timestamptz, plan text, billing_status text, comp boolean,
  is_pro boolean, period_end timestamptz, documents bigint, documents_30d bigint, staff bigint,
  payouts_connected boolean, assistant_messages_30d bigint, last_active timestamptz, total_count bigint
)
language sql stable security definer set search_path = public as $$
  with filtered as (
    select b.*, u.email as owner_email
    from public.businesses b
    left join auth.users u on u.id = b.owner_id
    where coalesce(p_search, '') = ''
       or coalesce(b.profile ->> 'name', '') ilike '%' || p_search || '%'
       or coalesce(u.email, '') ilike '%' || p_search || '%'
  )
  select f.id, coalesce(f.profile ->> 'name', ''), f.owner_email::text, f.created_at,
         bb.plan, coalesce(bb.status, 'none'), coalesce(bb.comp, false), public.is_pro(f.id), bb.current_period_end,
         (select count(*) from public.documents d where d.business_id = f.id),
         (select count(*) from public.documents d where d.business_id = f.id and d.created_at > now() - interval '30 days'),
         (select count(*) from public.members m where m.business_id = f.id and m.role = 'staff' and m.status = 'active'),
         exists (select 1 from public.business_payouts p where p.business_id = f.id),
         (select coalesce(sum(a.messages), 0) from public.agent_usage a where a.business_id = f.id and a.day > public._lagos_today() - 30),
         greatest(f.updated_at, (select max(l.created_at) from public.activity_log l where l.business_id = f.id)),
         count(*) over ()
  from filtered f
  left join public.business_billing bb on bb.business_id = f.id
  order by f.created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;

revoke all on function public.agent_take_message(uuid, int), public.agent_add_tokens(uuid, bigint, bigint),
  public.admin_overview(), public.admin_businesses(text, int, int), public._lagos_today()
  from public, anon, authenticated;
grant execute on function public.agent_take_message(uuid, int), public.agent_add_tokens(uuid, bigint, bigint),
  public.admin_overview(), public.admin_businesses(text, int, int), public._lagos_today()
  to service_role;
