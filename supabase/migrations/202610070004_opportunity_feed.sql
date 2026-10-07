alter table public.admin_audit_log drop constraint admin_audit_log_action_check;
alter table public.admin_audit_log add constraint admin_audit_log_action_check
  check (action in ('credit_adjustment', 'role_change', 'job_create', 'job_archive'));

create table public.job_listings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 4 and 180),
  company text not null check (length(company) between 2 and 180),
  region text not null check (length(region) between 2 and 180),
  salary_range text not null default '' check (length(salary_range) <= 180),
  description text not null check (length(description) between 20 and 5000),
  required_skills text[] not null default '{}',
  application_url text not null check (application_url ~ '^https://[^[:space:]]+$'),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index job_listings_active_created_idx on public.job_listings (created_at desc) where active;
alter table public.job_listings enable row level security;
revoke all on public.job_listings from anon, authenticated;

create table public.job_unlocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.job_listings (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, job_id)
);
alter table public.job_unlocks enable row level security;
revoke all on public.job_unlocks from anon, authenticated;

create function public.list_available_jobs(p_user_id uuid)
returns table(id uuid, title text, company text, region text, salary_range text, description text,
  required_skills text[], application_url text, unlocked boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'Account not found'; end if;
  return query select j.id, j.title,
    case when u.job_id is not null then j.company else 'Company revealed after unlock' end,
    j.region, j.salary_range,
    case when u.job_id is not null then j.description else 'Unlock to view the full role description.' end,
    case when u.job_id is not null then j.required_skills else '{}'::text[] end,
    case when u.job_id is not null then j.application_url else null end,
    (u.job_id is not null), j.created_at
  from public.job_listings j left join public.job_unlocks u on u.job_id = j.id and u.user_id = p_user_id
  where j.active order by j.created_at desc limit 100;
end;
$$;

create function public.unlock_job(p_user_id uuid, p_job_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare current_balance integer;
begin
  perform 1 from auth.users where id = p_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  if not exists (select 1 from public.job_listings where id = p_job_id and active) then raise exception 'Job not found'; end if;
  if exists (select 1 from public.job_unlocks where user_id = p_user_id and job_id = p_job_id) then
    select coalesce(sum(amount), 0)::integer into current_balance from public.credit_ledger where user_id = p_user_id;
    return current_balance;
  end if;
  select coalesce(sum(amount), 0)::integer into current_balance from public.credit_ledger where user_id = p_user_id;
  if current_balance < 1 then raise exception 'Insufficient credits'; end if;
  insert into public.job_unlocks (user_id, job_id) values (p_user_id, p_job_id);
  insert into public.credit_ledger (user_id, amount, reason, idempotency_key)
    values (p_user_id, -1, 'Job details unlocked', 'job:' || p_user_id::text || ':' || p_job_id::text);
  return current_balance - 1;
end;
$$;

create function public.admin_create_job(
  p_actor_id uuid, p_title text, p_company text, p_region text, p_salary_range text,
  p_description text, p_required_skills text[], p_application_url text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare job_id uuid;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and role in ('admin', 'owner')) then raise exception 'Administrator access required'; end if;
  if p_application_url !~ '^https://[^[:space:]]+$' then raise exception 'Secure application URL required'; end if;
  insert into public.job_listings (title, company, region, salary_range, description, required_skills, application_url, created_by)
    values (p_title, p_company, p_region, coalesce(p_salary_range, ''), p_description,
      coalesce(p_required_skills, '{}'), p_application_url, p_actor_id) returning id into job_id;
  insert into public.admin_audit_log (actor_id, action, details)
    values (p_actor_id, 'job_create', jsonb_build_object('job_id', job_id, 'title', p_title));
  return job_id;
end;
$$;

create function public.admin_archive_job(p_actor_id uuid, p_job_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and role in ('admin', 'owner')) then raise exception 'Administrator access required'; end if;
  update public.job_listings set active = false where id = p_job_id and active;
  if not found then raise exception 'Active job not found'; end if;
  insert into public.admin_audit_log (actor_id, action, details)
    values (p_actor_id, 'job_archive', jsonb_build_object('job_id', p_job_id));
end;
$$;

revoke all on function public.list_available_jobs(uuid) from public, anon, authenticated;
revoke all on function public.unlock_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_create_job(uuid, text, text, text, text, text, text[], text) from public, anon, authenticated;
revoke all on function public.admin_archive_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_available_jobs(uuid) to service_role;
grant execute on function public.unlock_job(uuid, uuid) to service_role;
grant execute on function public.admin_create_job(uuid, text, text, text, text, text, text[], text) to service_role;
grant execute on function public.admin_archive_job(uuid, uuid) to service_role;
