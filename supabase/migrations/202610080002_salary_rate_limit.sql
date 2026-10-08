create table public.salary_rate_limits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1
);
alter table public.salary_rate_limits enable row level security;
revoke all on public.salary_rate_limits from anon, authenticated;

create function public.check_salary_rate_limit(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  insert into public.salary_rate_limits (user_id) values (p_user_id)
  on conflict (user_id) do update
    set window_started_at = case when public.salary_rate_limits.window_started_at < now() - interval '1 hour'
      then now() else public.salary_rate_limits.window_started_at end,
        request_count = case when public.salary_rate_limits.window_started_at < now() - interval '1 hour'
      then 1 else public.salary_rate_limits.request_count + 1 end;
  select request_count <= 12 into allowed from public.salary_rate_limits where user_id = p_user_id;
  return allowed;
end;
$$;
revoke all on function public.check_salary_rate_limit(uuid) from public, anon, authenticated;
grant execute on function public.check_salary_rate_limit(uuid) to service_role;
