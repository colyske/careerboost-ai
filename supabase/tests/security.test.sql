begin;
select plan(17);

select has_table('public', 'profiles', 'candidate profiles table exists');
select has_table('public', 'credit_ledger', 'immutable credit ledger exists');
select has_table('public', 'payment_orders', 'payment order table exists');
select has_table('public', 'course_answers', 'course answer key table exists');

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profile row security is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.credit_ledger'::regclass), 'credit ledger row security is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.payment_orders'::regclass), 'payment order row security is enabled');

select ok(not has_table_privilege('anon', 'public.profiles', 'select'), 'anonymous visitors cannot read profiles');
select ok(not has_table_privilege('authenticated', 'public.payment_orders', 'select'), 'candidates cannot read raw payment orders');
select ok(not has_table_privilege('authenticated', 'public.course_answers', 'select'), 'candidates cannot read course answer keys');
select ok(not has_function_privilege('authenticated', 'public.apply_verified_payment(text,text,integer,text)', 'execute'), 'candidate sessions cannot grant payment credits');
select ok(not has_function_privilege('authenticated', 'public.admin_adjust_credits(uuid,uuid,integer,text)', 'execute'), 'candidate sessions cannot call admin credit adjustment');
select ok(not has_function_privilege('authenticated', 'public.list_available_jobs(uuid)', 'execute'), 'candidate sessions cannot bypass the scoped job listing API');
select ok(not has_function_privilege('authenticated', 'public.unlock_job(uuid,uuid)', 'execute'), 'candidate sessions cannot directly invoke the credit unlock RPC');
select ok(not has_function_privilege('authenticated', 'public.admin_list_users(uuid,integer,integer)', 'execute'), 'candidate sessions cannot call admin user listing');
select ok(not has_function_privilege('authenticated', 'public.create_payment_order(uuid,text,text,integer,integer,text,text)', 'execute'), 'candidate sessions cannot create payment orders directly');
select ok(not has_function_privilege('authenticated', 'public.purge_user_data(uuid)', 'execute'), 'candidate sessions cannot invoke account deletion internals directly');

select * from finish();
rollback;
