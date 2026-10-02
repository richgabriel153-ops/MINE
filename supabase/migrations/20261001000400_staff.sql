-- Staff accounts: the owner invites staff by email, can deactivate/reactivate them, and every change
-- is logged. Staff sign in with the invited email; my_businesses() links the invite to their account.

create or replace function public.invite_staff(bid uuid, p_email text, p_name text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare em text := lower(trim(p_email)); mid uuid; existing public.members;
begin
  perform public._require_owner(bid);
  if not public.is_pro(bid) then raise exception 'pro_required' using errcode = '42501'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email'; end if;
  select * into existing from public.members where business_id = bid and email = em;
  if found then
    if existing.role = 'owner' then raise exception 'is_owner'; end if;
    update public.members
       set status = case when user_id is null then 'invited' else 'active' end,
           name = coalesce(nullif(trim(p_name), ''), name), updated_at = now()
     where id = existing.id
    returning id into mid;
  else
    insert into public.members (business_id, email, name, role, status, invited_by)
    values (bid, em, coalesce(trim(p_name), ''), 'staff', 'invited', auth.uid())
    returning id into mid;
  end if;
  perform public._log(bid, 'staff_invite', 'member', mid, 'Invited ' || coalesce(nullif(trim(p_name), ''), em));
  return mid;
end;
$$;

-- Turn a staff member's access off or back on. Their past records stay.
create or replace function public.set_staff_active(p_member_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare m public.members;
begin
  select * into m from public.members where id = p_member_id;
  if not found then raise exception 'not_found'; end if;
  perform public._require_owner(m.business_id);
  if m.role = 'owner' then raise exception 'is_owner'; end if;
  update public.members
     set status = case when not p_active then 'deactivated' when user_id is null then 'invited' else 'active' end,
         updated_at = now()
   where id = p_member_id;
  perform public._log(m.business_id, case when p_active then 'staff_reactivate' else 'staff_deactivate' end, 'member', m.id,
                      case when p_active then 'Turned on access for ' else 'Turned off access for ' end || coalesce(nullif(m.name, ''), m.email));
end;
$$;

-- The caller's own display name (shown on records they create and in the activity log).
create or replace function public.set_my_name(bid uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_member(bid);
  update public.members set name = trim(p_name), updated_at = now() where business_id = bid and user_id = auth.uid();
end;
$$;

-- Owners see payment history per document (staff only see each document's paid amount).
create or replace function public.document_payments(p_doc_id uuid)
returns table (amount_kobo bigint, method text, paid_on date, source text, created_by_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare bid uuid;
begin
  select business_id into bid from public.documents where id = p_doc_id;
  if public.member_role(bid) is distinct from 'owner' then return; end if;
  return query
    select p.amount_kobo, p.method, p.paid_on, p.source, p.created_by_name, p.created_at
    from public.payments p where p.document_id = p_doc_id order by p.created_at;
end;
$$;

revoke all on function public.invite_staff(uuid, text, text), public.set_staff_active(uuid, boolean),
  public.set_my_name(uuid, text), public.document_payments(uuid) from public, anon;
grant execute on function public.invite_staff(uuid, text, text), public.set_staff_active(uuid, boolean),
  public.set_my_name(uuid, text), public.document_payments(uuid) to authenticated;
