-- Serialize payment-order creation and identity purge against the same Auth user row.
create function public.create_payment_order(
  p_user_id uuid, p_reference text, p_bundle_id text, p_credits integer,
  p_amount_subunits integer, p_currency text, p_email text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from auth.users where id = p_user_id for update;
  if not found or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Account is not available for payment';
  end if;
  insert into public.payment_orders (reference, user_id, bundle_id, credits, amount_subunits, currency, email)
    values (p_reference, p_user_id, p_bundle_id, p_credits, p_amount_subunits, upper(p_currency), p_email);
end;
$$;

create or replace function public.purge_user_data(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from auth.users where id = p_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  if exists (select 1 from public.payment_orders where user_id = p_user_id and status = 'pending') then
    raise exception 'Pending payment must be resolved before account deletion';
  end if;
  update public.payment_orders set email = 'redacted', user_id = null where user_id = p_user_id;
  update public.credit_ledger set user_id = null where user_id = p_user_id;
  delete from public.course_completions where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;
end;
$$;

revoke all on function public.create_payment_order(uuid, text, text, integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.create_payment_order(uuid, text, text, integer, integer, text, text) to service_role;
revoke all on function public.purge_user_data(uuid) from public, anon, authenticated;
grant execute on function public.purge_user_data(uuid) to service_role;
