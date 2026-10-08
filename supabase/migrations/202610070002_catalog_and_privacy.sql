create table public.courses (
  id text primary key,
  title text not null,
  category text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  description text not null,
  lesson text not null,
  quiz_question text not null,
  quiz_options jsonb not null check (jsonb_typeof(quiz_options) = 'array'),
  active boolean not null default true
);
create table public.course_answers (
  course_id text primary key references public.courses (id) on delete cascade,
  correct_option integer not null check (correct_option >= 0)
);
alter table public.courses enable row level security;
alter table public.course_answers enable row level security;
revoke all on public.courses, public.course_answers from anon, authenticated;
grant select (id, title, category, duration_minutes, description, lesson, quiz_question, quiz_options, active)
  on public.courses to authenticated;
create policy "Signed-in candidates can view active courses" on public.courses
  for select to authenticated using (active);

create table public.course_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete set null,
  course_id text not null references public.courses (id),
  completed_at timestamptz not null default now(),
  certificate_code text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  unique (user_id, course_id)
);
alter table public.course_completions enable row level security;
revoke all on public.course_completions from anon, authenticated;
grant select on public.course_completions to authenticated;
create policy "Candidates can read their own course completions" on public.course_completions
  for select to authenticated using ((select auth.uid()) = user_id);

insert into public.courses (id, title, category, duration_minutes, description, lesson, quiz_question, quiz_options) values
('distributed-leadership', 'Global Remote Leadership & Distributed Systems Management', 'Leadership', 45,
 'Practice asynchronous team operations, outcome-based KPIs, and documentation for distributed engineering teams.',
 'Distributed engineering leadership uses asynchronous clarity, outcome-based KPIs, and structured documentation. In global companies, direct micromanagement fails across time zones. Set clear acceptance criteria and use reliable shared tools.',
 'What most helps high-performing asynchronous distributed teams?',
 '["Mandatory 8-hour daily video presence", "Clear outcome-based KPIs and thorough asynchronous documentation", "Hourly micromanagement"]'),
('finops', 'FinOps & Cloud Cost Optimization', 'Cloud strategy', 60,
 'Learn resource visibility, tagging, right-sizing, and continuous cost review.',
 'FinOps helps teams manage cloud spending without sacrificing product outcomes. Core practices include making cost visible with ownership tags, choosing resources that fit real workloads, and reviewing usage continuously.',
 'Which practice makes cloud costs traceable to the teams that use them?',
 '["Turn off all monitoring", "Resource tags and ownership metadata", "Buy larger instances by default"]'),
('ai-tools', 'Applied AI for Knowledge Work', 'Artificial intelligence', 40,
 'Explore responsible LLM use for drafting, analysis, and documentation.',
 'Language models can draft and synthesize, but they can make mistakes. Keep a human reviewer responsible for facts, privacy, and final decisions. Do not submit confidential information to an AI provider unless authorized.',
 'What should a professional do before relying on AI-generated career material?',
 '["Publish it without review", "Verify factual claims and protect private information", "Assume fluent writing proves accuracy"]'),
('global-work', 'Global Contracting and Remote Work', 'Global operations', 50,
 'Understand cross-border work arrangements and questions to resolve before accepting an offer.',
 'International contractor and employment arrangements vary by country. Confirm the contracting entity, payment currency, benefits, tax responsibilities, data terms, and dispute process with qualified local advisers.',
 'What is a sound first step when assessing a cross-border offer?',
 '["Assume the same rules apply in every country", "Clarify the contracting entity, payment terms, and local obligations", "Share identity documents through an unverified recruiter"]');

insert into public.course_answers (course_id, correct_option) values
('distributed-leadership', 1), ('finops', 1), ('ai-tools', 1), ('global-work', 1);

create function public.complete_course(p_user_id uuid, p_course_id text, p_selected_option integer)
returns table(completed boolean, certificate_code text, balance integer)
language plpgsql security definer set search_path = '' as $$
declare answer integer; completion public.course_completions%rowtype; current_balance integer;
begin
  perform 1 from auth.users where id = p_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  select answers.correct_option into answer from public.course_answers answers
    join public.courses c on c.id = answers.course_id and c.active
    where answers.course_id = p_course_id;
  if answer is null then raise exception 'Course not found'; end if;
  if answer <> p_selected_option then
    select coalesce(sum(l.amount), 0)::integer into current_balance from public.credit_ledger l where l.user_id = p_user_id;
    return query select false, null::text, current_balance; return;
  end if;
  select * into completion from public.course_completions where user_id = p_user_id and course_id = p_course_id;
  if found then
    select coalesce(sum(l.amount), 0)::integer into current_balance from public.credit_ledger l where l.user_id = p_user_id;
    return query select true, completion.certificate_code, current_balance; return;
  end if;
  select coalesce(sum(l.amount), 0)::integer into current_balance from public.credit_ledger l where l.user_id = p_user_id;
  if current_balance < 1 then raise exception 'Insufficient credits'; end if;
  insert into public.course_completions (user_id, course_id) values (p_user_id, p_course_id)
    returning * into completion;
  insert into public.credit_ledger (user_id, amount, reason, idempotency_key)
    values (p_user_id, -1, 'Course completion', 'course:' || p_user_id::text || ':' || p_course_id);
  select coalesce(sum(l.amount), 0)::integer into current_balance from public.credit_ledger l where l.user_id = p_user_id;
  return query select true, completion.certificate_code, current_balance;
end;
$$;

create function public.get_credit_balance(p_user_id uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount), 0)::integer from public.credit_ledger where user_id = p_user_id;
$$;

create table public.ai_rate_limits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1
);
alter table public.ai_rate_limits enable row level security;
revoke all on public.ai_rate_limits from anon, authenticated;

create function public.check_ai_rate_limit(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  insert into public.ai_rate_limits (user_id) values (p_user_id)
  on conflict (user_id) do update
    set window_started_at = case when public.ai_rate_limits.window_started_at < now() - interval '1 hour'
      then now() else public.ai_rate_limits.window_started_at end,
        request_count = case when public.ai_rate_limits.window_started_at < now() - interval '1 hour'
      then 1 else public.ai_rate_limits.request_count + 1 end;
  select request_count <= 5 into allowed from public.ai_rate_limits where user_id = p_user_id;
  return allowed;
end;
$$;

create function public.purge_user_data(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.payment_orders set email = 'redacted', user_id = null where user_id = p_user_id;
  update public.credit_ledger set user_id = null where user_id = p_user_id;
  delete from public.course_completions where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;
end;
$$;

create or replace function public.anonymize_expired_payment_orders()
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  update public.payment_orders set email = 'redacted', user_id = null
  where ((status in ('failed', 'expired') and expires_at < now() - interval '30 days')
      or (status = 'success' and verified_at < now() - interval '90 days'))
    and email <> 'redacted';
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.complete_course(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.get_credit_balance(uuid) from public, anon, authenticated;
revoke all on function public.check_ai_rate_limit(uuid) from public, anon, authenticated;
revoke all on function public.purge_user_data(uuid) from public, anon, authenticated;
grant execute on function public.complete_course(uuid, text, integer) to service_role;
grant execute on function public.get_credit_balance(uuid) to service_role;
grant execute on function public.check_ai_rate_limit(uuid) to service_role;
grant execute on function public.purge_user_data(uuid) to service_role;
