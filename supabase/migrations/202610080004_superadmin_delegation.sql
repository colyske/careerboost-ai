-- All SuperAdmins can manage roles. The profile/auth triggers continue to
-- protect the primary identity and prevent any role/identity/deletion change.
create or replace function public.admin_set_user_role(p_actor_id uuid, p_target_user_id uuid, p_new_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare old_role text; target_email text;
begin
  if not exists (select 1 from public.profiles p where p.id = p_actor_id and p.role = 'owner') then
    raise exception 'SuperAdmin access required';
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

revoke all on function public.admin_set_user_role(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_user_role(uuid, uuid, text) to service_role;
