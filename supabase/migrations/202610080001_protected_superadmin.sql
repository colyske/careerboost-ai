-- Permanently protect the verified CareerBoost SuperAdmin identity.
-- The UUID is learned from Auth at runtime; email is used only to bootstrap it.
create or replace function public.assign_protected_superadmin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(coalesce(new.email, '')) = 'colyske@gmail.com'
     and new.email_confirmed_at is not null then
    insert into public.profiles (id, email, full_name, role)
    values (new.id, lower(new.email), left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 160), 'owner')
    on conflict (id) do update set email = excluded.email, role = 'owner';
  end if;
  return new;
end;
$$;

create trigger auth_user_assign_protected_superadmin_insert
  after insert on auth.users
  for each row execute procedure public.assign_protected_superadmin();

create trigger auth_user_assign_protected_superadmin_update
  after update of email, email_confirmed_at on auth.users
  for each row execute procedure public.assign_protected_superadmin();

-- Backfill an already verified account (and keep its existing profile fields).
update public.profiles p set role = 'owner', email = lower(u.email)
from auth.users u
where p.id = u.id and lower(u.email) = 'colyske@gmail.com' and u.email_confirmed_at is not null;

create or replace function public.protect_superadmin_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' then raise exception 'SuperAdmin account is protected'; end if;
    return old;
  end if;
  if old.role = 'owner' and (new.role <> 'owner' or new.id <> old.id or lower(new.email) <> lower(old.email)) then
    raise exception 'SuperAdmin role and identity are permanent';
  end if;
  if new.role = 'owner' and not exists (
    select 1 from auth.users u where u.id = new.id
      and lower(u.email) = 'colyske@gmail.com' and u.email_confirmed_at is not null
  ) then
    raise exception 'Only the verified SuperAdmin identity can hold the owner role';
  end if;
  return new;
end;
$$;

create trigger protect_superadmin_profile
  before update or delete on public.profiles
  for each row execute procedure public.protect_superadmin_profile();

create or replace function public.protect_superadmin_auth_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.profiles p where p.id = old.id and p.role = 'owner') then
      raise exception 'SuperAdmin account is protected';
    end if;
    return old;
  end if;
  if old.email is distinct from new.email
    and exists (select 1 from public.profiles p where p.id = old.id and p.role = 'owner') then
    raise exception 'SuperAdmin identity cannot be changed';
  end if;
  return new;
end;
$$;

create trigger protect_superadmin_auth_delete
  before delete on auth.users
  for each row execute procedure public.protect_superadmin_auth_identity();

create trigger protect_superadmin_auth_email
  before update of email on auth.users
  for each row execute procedure public.protect_superadmin_auth_identity();

revoke all on function public.assign_protected_superadmin() from public, anon, authenticated;
revoke all on function public.protect_superadmin_profile() from public, anon, authenticated;
revoke all on function public.protect_superadmin_auth_identity() from public, anon, authenticated;
