-- Quotations and proforma invoices (Pro). Quotes are documents of type 'quote' numbered QUO-0001.
-- Their workflow status lives in data.quoteStatus (draft/sent/accepted/declined); "expired" is
-- worked out from the valid-until date (issue → data.dueDate) by the app.

create or replace function public.set_quote_status(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.documents; row public.documents;
begin
  select * into d from public.documents where id = p_id;
  if not found or d.type <> 'quote' then raise exception 'not_found'; end if;
  perform public._require_member(d.business_id);
  if not public.is_pro(d.business_id) then raise exception 'pro_required' using errcode = '42501'; end if;
  if p_status not in ('draft', 'sent', 'accepted', 'declined') then raise exception 'bad_status'; end if;
  update public.documents
     set data = data || jsonb_build_object('quoteStatus', p_status, 'updatedAt', now()), updated_at = now()
   where id = p_id;
  perform public._log(d.business_id, 'status', 'quote', d.id, 'Marked ' || d.number || ' as ' || p_status);
  select * into row from public.documents where id = p_id;
  return to_jsonb(row);
end;
$$;

-- One tap: a new invoice (dated p_today, due after p_due_days) with everything copied from the quote.
create or replace function public.convert_quote(p_id uuid, p_today date, p_due_days int default 7) returns jsonb
language plpgsql security definer set search_path = public as $$
declare q public.documents; num text; iid uuid := gen_random_uuid(); row public.documents;
begin
  select * into q from public.documents where id = p_id for update;
  if not found or q.type <> 'quote' then raise exception 'not_found'; end if;
  perform public._require_member(q.business_id);
  if not public.is_pro(q.business_id) then raise exception 'pro_required' using errcode = '42501'; end if;
  if q.data ? 'invoiceId' then raise exception 'already_converted'; end if;
  num := public._next_number(q.business_id, 'invoice');
  insert into public.documents (id, business_id, type, number, issue_date, status, total_kobo, amount_paid_kobo, data, created_by, created_by_name)
  values (
    iid, q.business_id, 'invoice', num, p_today, 'unpaid', q.total_kobo, 0,
    (q.data - 'quoteTitle' - 'quoteStatus' - 'invoiceId' - 'invoiceNumber' - 'payToken') || jsonb_build_object(
      'id', iid, 'type', 'invoice', 'number', num, 'issueDate', p_today, 'dueDate', p_today + p_due_days,
      'status', 'unpaid', 'amountPaidKobo', 0, 'sourceQuoteId', q.id, 'sourceQuoteNumber', q.number,
      'createdAt', now(), 'updatedAt', now(), 'createdByName', coalesce(public.member_name(q.business_id), '')),
    auth.uid(), coalesce(public.member_name(q.business_id), '')
  );
  update public.documents
     set data = data || jsonb_build_object('invoiceId', iid, 'invoiceNumber', num, 'quoteStatus', 'accepted'), updated_at = now()
   where id = q.id;
  perform public._log(q.business_id, 'convert', 'quote', q.id, 'Turned ' || q.number || ' into ' || num);
  select * into row from public.documents where id = iid;
  return to_jsonb(row);
end;
$$;

revoke all on function public.set_quote_status(uuid, text), public.convert_quote(uuid, date, int) from public, anon;
grant execute on function public.set_quote_status(uuid, text), public.convert_quote(uuid, date, int) to authenticated;
