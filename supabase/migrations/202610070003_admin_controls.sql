create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  target_user_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('credit_adjustment', 'role_change')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;

create function public.admin_list_users(p_actor_id uuid, p_limit integer default 100, p_offset integer default 0)
returns table(id uuid, email text, full_name text, role text, credits integer, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role in ('admin', 'owner')) then
    raise exception 'Administrator access required';
  end if;
  return query
    select p.id, p.email, p.full_name, p.role,
      coalesce(sum(l.amount), 0)::integer as credits, p.created_at
    from public.profiles p left join public.credit_ledger l on l.user_id = p.id
    group by p.id order by p.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end;
$$;

create function public.admin_adjust_credits(p_actor_id uuid, p_target_user_id uuid, p_amount integer, p_request_id text)
returns integer language plpgsql security definer set search_path = '' as $$
declare new_balance integer;
begin
  if not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role in ('admin', 'owner')) then
    raise exception 'Administrator access required';
  end if;
  if p_amount < 1 or p_amount > 1000 or length(p_request_id) < 16 then raise exception 'Invalid adjustment'; end if;
  if p_actor_id = p_target_user_id then raise exception 'Self credit adjustment is not permitted'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_target_user_id and p.role <> 'owner') then
    raise exception 'Account not found or protected';
  end if;
  perform 1 from auth.users where id = p_target_user_id for update;
  if not exists (select 1 from public.credit_ledger l where l.idempotency_key = 'admin:' || p_request_id) then
    insert into public.credit_ledger (user_id, amount, reason, idempotency_key)
      values (p_target_user_id, p_amount, 'Administrator credit adjustment', 'admin:' || p_request_id);
    insert into public.admin_audit_log (actor_id, target_user_id, action, details)
      values (p_actor_id, p_target_user_id, 'credit_adjustment', jsonb_build_object('amount', p_amount));
  end if;
  select coalesce(sum(l.amount), 0)::integer into new_balance from public.credit_ledger l where l.user_id = p_target_user_id;
  return new_balance;
end;
$$;

create function public.admin_set_user_role(p_actor_id uuid, p_target_user_id uuid, p_new_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare old_role text;
begin
  if not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role = 'owner') then
    raise exception 'Owner access required';
  end if;
  if p_actor_id = p_target_user_id or p_new_role not in ('candidate', 'admin') then
    raise exception 'Role change is not permitted';
  end if;
  select role into old_role from public.profiles where id = p_target_user_id for update;
  if old_role is null or old_role = 'owner' then raise exception 'Account not found or protected'; end if;
  update public.profiles set role = p_new_role where id = p_target_user_id;
  insert into public.admin_audit_log (actor_id, target_user_id, action, details)
    values (p_actor_id, p_target_user_id, 'role_change', jsonb_build_object('from', old_role, 'to', p_new_role));
end;
$$;

revoke all on function public.admin_list_users(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_adjust_credits(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.admin_set_user_role(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_list_users(uuid, integer, integer) to service_role;
grant execute on function public.admin_adjust_credits(uuid, uuid, integer, text) to service_role;
grant execute on function public.admin_set_user_role(uuid, uuid, text) to service_role;
