create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'candidate' check (role in ('candidate', 'admin', 'owner')),
  full_name text not null default '' check (length(full_name) <= 160),
  linkedin_url text not null default '',
  target_role text not null default '' check (length(target_role) <= 240),
  target_region text not null default '' check (length(target_region) <= 240),
  target_salary text not null default '' check (length(target_salary) <= 240),
  languages text not null default '' check (length(languages) <= 300),
  nationality text not null default '' check (length(nationality) <= 300),
  skills text not null default '' check (length(skills) <= 1600),
  resume_bio text not null default '' check (length(resume_bio) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  insert into public.credit_ledger (user_id, amount, reason, idempotency_key)
  values (new.id, 5, 'Welcome credits', 'welcome:' || new.id::text);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, linkedin_url, target_role, target_region, target_salary, languages, nationality, skills, resume_bio)
  on public.profiles to authenticated;
create policy "Candidates can read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "Candidates can update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  amount integer not null check (amount <> 0),
  reason text not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index credit_ledger_user_created_idx on public.credit_ledger (user_id, created_at desc);
alter table public.credit_ledger enable row level security;
revoke all on public.credit_ledger from anon, authenticated;
grant select on public.credit_ledger to authenticated;
create policy "Candidates can read their own credit history" on public.credit_ledger
  for select to authenticated using ((select auth.uid()) = user_id);

create table public.payment_orders (
  reference text primary key,
  user_id uuid references auth.users (id) on delete set null,
  bundle_id text not null check (bundle_id in ('starter', 'pro', 'executive')),
  credits integer not null check (credits in (10, 30, 75)),
  amount_subunits integer not null check (amount_subunits > 0),
  currency text not null check (currency in ('KES', 'NGN', 'GHS', 'ZAR', 'USD')),
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'expired')),
  provider_transaction_id text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create unique index payment_orders_provider_transaction_unique
  on public.payment_orders (provider_transaction_id) where provider_transaction_id is not null;
create index payment_orders_pending_expiry_idx on public.payment_orders (expires_at) where status = 'pending';
alter table public.payment_orders enable row level security;
revoke all on public.payment_orders from anon, authenticated;

create table public.payment_rate_limits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1
);
alter table public.payment_rate_limits enable row level security;
revoke all on public.payment_rate_limits from anon, authenticated;

create function public.check_payment_rate_limit(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  insert into public.payment_rate_limits (user_id) values (p_user_id)
  on conflict (user_id) do update
    set window_started_at = case when public.payment_rate_limits.window_started_at < now() - interval '1 hour'
      then now() else public.payment_rate_limits.window_started_at end,
        request_count = case when public.payment_rate_limits.window_started_at < now() - interval '1 hour'
      then 1 else public.payment_rate_limits.request_count + 1 end;
  select request_count <= 10 into allowed from public.payment_rate_limits where user_id = p_user_id;
  return allowed;
end;
$$;

create function public.consume_credits(p_user_id uuid, p_amount integer, p_reason text, p_idempotency_key text)
returns integer language plpgsql security definer set search_path = '' as $$
declare current_balance integer;
begin
  if p_amount <= 0 or p_amount > 20 or length(p_idempotency_key) < 16 then
    raise exception 'Invalid credit operation';
  end if;
  if exists (select 1 from public.credit_ledger where idempotency_key = p_idempotency_key) then
    select coalesce(sum(amount), 0)::integer into current_balance from public.credit_ledger where user_id = p_user_id;
    return current_balance;
  end if;
  perform 1 from auth.users where id = p_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  select coalesce(sum(amount), 0)::integer into current_balance
    from public.credit_ledger where user_id = p_user_id;
  if current_balance < p_amount then raise exception 'Insufficient credits'; end if;
  insert into public.credit_ledger (user_id, amount, reason, idempotency_key)
    values (p_user_id, -p_amount, p_reason, p_idempotency_key);
  return current_balance - p_amount;
end;
$$;

create function public.apply_verified_payment(
  p_reference text, p_provider_transaction_id text, p_amount_subunits integer, p_currency text
) returns integer language plpgsql security definer set search_path = '' as $$
declare order_row public.payment_orders%rowtype;
begin
  select * into order_row from public.payment_orders where reference = p_reference for update;
  if not found then raise exception 'Payment order not found'; end if;
  if order_row.status = 'success' then
    return (select coalesce(sum(amount), 0)::integer from public.credit_ledger where user_id = order_row.user_id);
  end if;
  if order_row.status <> 'pending' or order_row.user_id is null or order_row.expires_at < now() then
    raise exception 'Payment order is not eligible for credit';
  end if;
  if order_row.amount_subunits <> p_amount_subunits or order_row.currency <> upper(p_currency) then
    raise exception 'Verified amount or currency does not match the order';
  end if;
  if exists (select 1 from public.payment_orders where provider_transaction_id = p_provider_transaction_id) then
    raise exception 'Transaction has already been applied';
  end if;
  insert into public.credit_ledger (user_id, amount, reason, idempotency_key)
    values (order_row.user_id, order_row.credits, 'Paystack credit purchase', 'paystack:' || p_reference);
  update public.payment_orders set status = 'success', provider_transaction_id = p_provider_transaction_id,
    verified_at = now() where reference = p_reference;
  return (select coalesce(sum(amount), 0)::integer from public.credit_ledger where user_id = order_row.user_id);
end;
$$;

create function public.anonymize_expired_payment_orders()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  update public.payment_orders set email = 'redacted', user_id = null
  where status in ('failed', 'expired') and expires_at < now() - interval '30 days' and email <> 'redacted';
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.check_payment_rate_limit(uuid) from public, anon, authenticated;
revoke all on function public.consume_credits(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.apply_verified_payment(text, text, integer, text) from public, anon, authenticated;
revoke all on function public.anonymize_expired_payment_orders() from public, anon, authenticated;
grant execute on function public.check_payment_rate_limit(uuid) to service_role;
grant execute on function public.consume_credits(uuid, integer, text, text) to service_role;
grant execute on function public.apply_verified_payment(text, text, integer, text) to service_role;
grant execute on function public.anonymize_expired_payment_orders() to service_role;
