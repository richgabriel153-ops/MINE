-- Expenses (owner only). Reading stays allowed after Pro ends so nothing is lost; adding or
-- changing needs Pro. Optional receipt photos live in a private storage bucket, one folder per business.

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  amount_kobo bigint not null check (amount_kobo > 0),
  category text not null check (length(category) between 1 and 40),
  spent_on date not null,
  note text not null default '' check (length(note) <= 300),
  photo_path text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_business_date_idx on public.expenses (business_id, spent_on);
alter table public.expenses enable row level security;

create policy "owner reads expenses" on public.expenses
  for select using (public.member_role(business_id) = 'owner');
create policy "owner adds expenses (Pro)" on public.expenses
  for insert with check (public.member_role(business_id) = 'owner' and public.is_pro(business_id));
create policy "owner edits expenses (Pro)" on public.expenses
  for update using (public.member_role(business_id) = 'owner' and public.is_pro(business_id))
  with check (public.member_role(business_id) = 'owner');
create policy "owner deletes expenses (Pro)" on public.expenses
  for delete using (public.member_role(business_id) = 'owner' and public.is_pro(business_id));
grant select, insert, update, delete on public.expenses to authenticated;

-- Who logged it (set by the database, not the app).
create or replace function public._expense_author() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  new.created_by_name := coalesce(public.member_name(new.business_id), '');
  return new;
end;
$$;
create trigger expenses_author before insert on public.expenses
  for each row execute function public._expense_author();

-- Activity log entries for expenses.
create or replace function public._expense_logged() returns trigger
language plpgsql security definer set search_path = public as $$
declare e public.expenses := coalesce(new, old);
begin
  perform public._log(e.business_id,
    case tg_op when 'INSERT' then 'expense_create' when 'UPDATE' then 'expense_edit' else 'expense_delete' end,
    'expense', e.id,
    (case tg_op when 'INSERT' then 'Logged' when 'UPDATE' then 'Edited' else 'Deleted' end)
      || ' an expense of ₦' || to_char(e.amount_kobo / 100.0, 'FM999,999,999,990.00') || ' (' || e.category || ')');
  return null;
end;
$$;
create trigger expenses_logged after insert or update or delete on public.expenses
  for each row execute function public._expense_logged();

-- Custom expense categories, kept in the business settings.
create or replace function public.set_expense_categories(bid uuid, p_categories jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_owner(bid);
  if jsonb_typeof(p_categories) <> 'array' or jsonb_array_length(p_categories) > 30 then raise exception 'bad_categories'; end if;
  update public.businesses set settings = settings || jsonb_build_object('expenseCategories', p_categories), updated_at = now() where id = bid;
end;
$$;
revoke all on function public.set_expense_categories(uuid, jsonb) from public, anon;
grant execute on function public.set_expense_categories(uuid, jsonb) to authenticated;

-- Receipt photos: private bucket, path "<business id>/<expense id>.jpg", owner only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-photos', 'expense-photos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "owner reads expense photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'expense-photos' and public.member_role(((storage.foldername(name))[1])::uuid) = 'owner');
create policy "owner uploads expense photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'expense-photos' and public.member_role(((storage.foldername(name))[1])::uuid) = 'owner'
              and public.is_pro(((storage.foldername(name))[1])::uuid));
create policy "owner replaces expense photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'expense-photos' and public.member_role(((storage.foldername(name))[1])::uuid) = 'owner');
create policy "owner removes expense photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'expense-photos' and public.member_role(((storage.foldername(name))[1])::uuid) = 'owner');
