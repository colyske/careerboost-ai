-- Keep the original verified identity permanently protected while allowing
-- the primary SuperAdmin to appoint and manage additional SuperAdmins.
create or replace function public.protect_superadmin_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if lower(old.email) = 'colyske@gmail.com' and old.role = 'owner' then
      raise exception 'Primary SuperAdmin account is protected';
    end if;
    return old;
  end if;

  if lower(old.email) = 'colyske@gmail.com' and old.role = 'owner'
    and (new.role <> 'owner' or new.id <> old.id or lower(new.email) <> lower(old.email)) then
    raise exception 'Primary SuperAdmin role and identity are permanent';
  end if;

  if new.role = 'owner' and not exists (
    select 1 from auth.users u where u.id = new.id and u.email_confirmed_at is not null
  ) then
    raise exception 'Only verified accounts can hold the SuperAdmin role';
  end if;
  return new;
end;
$$;

create or replace function public.protect_superadmin_auth_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if lower(old.email) = 'colyske@gmail.com' and exists (
      select 1 from public.profiles p where p.id = old.id and p.role = 'owner'
    ) then raise exception 'Primary SuperAdmin account is protected'; end if;
    return old;
  end if;

  if old.email is distinct from new.email and lower(old.email) = 'colyske@gmail.com'
    and exists (select 1 from public.profiles p where p.id = old.id and p.role = 'owner') then
    raise exception 'Primary SuperAdmin identity cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function public.admin_adjust_credits(p_actor_id uuid, p_target_user_id uuid, p_amount integer, p_request_id text)
returns integer language plpgsql security definer set search_path = '' as $$
declare new_balance integer;
begin
  if not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role in ('admin', 'owner')) then
    raise exception 'Administrator access required';
  end if;
  if p_amount < 1 or p_amount > 1000 or length(p_request_id) < 16 then raise exception 'Invalid adjustment'; end if;
  if p_actor_id = p_target_user_id then raise exception 'Self credit adjustment is not permitted'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_target_user_id and not (p.role = 'owner' and lower(p.email) = 'colyske@gmail.com')) then
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

create or replace function public.admin_set_user_role(p_actor_id uuid, p_target_user_id uuid, p_new_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare old_role text; target_email text;
begin
  if not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role = 'owner' and lower(p.email) = 'colyske@gmail.com') then
    raise exception 'Primary SuperAdmin access required';
  end if;
  if p_actor_id = p_target_user_id or p_new_role not in ('candidate', 'admin', 'owner') then
    raise exception 'Role change is not permitted';
  end if;
  select role, email into old_role, target_email from public.profiles where id = p_target_user_id for update;
  if old_role is null or (old_role = 'owner' and lower(target_email) = 'colyske@gmail.com') then
    raise exception 'Account not found or protected';
  end if;
  if p_new_role = 'owner' and not exists (
    select 1 from auth.users where id = p_target_user_id and email_confirmed_at is not null
  ) then raise exception 'SuperAdmin accounts must have a verified email'; end if;
  update public.profiles set role = p_new_role where id = p_target_user_id;
  insert into public.admin_audit_log (actor_id, target_user_id, action, details)
    values (p_actor_id, p_target_user_id, 'role_change', jsonb_build_object('from', old_role, 'to', p_new_role));
end;
$$;

revoke all on function public.admin_adjust_credits(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.admin_set_user_role(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_adjust_credits(uuid, uuid, integer, text) to service_role;
grant execute on function public.admin_set_user_role(uuid, uuid, text) to service_role;
