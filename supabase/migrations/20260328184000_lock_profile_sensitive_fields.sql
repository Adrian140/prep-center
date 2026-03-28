begin;

create or replace function public.guard_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_system_role boolean := auth.role() in ('service_role', 'supabase_admin', 'supabase_auth_admin');
  is_elevated_admin boolean := public.e_admin() and not public.is_limited_admin(auth.uid());
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if is_system_role or is_elevated_admin then
    return new;
  end if;

  if new.current_balance is distinct from old.current_balance then
    raise exception 'current_balance can only be updated by an elevated admin';
  end if;

  if new.can_view_prices is distinct from old.can_view_prices then
    raise exception 'can_view_prices can only be updated by an elevated admin';
  end if;

  if new.account_type is distinct from old.account_type then
    raise exception 'account_type can only be updated by an elevated admin';
  end if;

  if new.is_admin is distinct from old.is_admin then
    raise exception 'is_admin can only be updated by an elevated admin';
  end if;

  if new.is_limited_admin is distinct from old.is_limited_admin then
    raise exception 'is_limited_admin can only be updated by an elevated admin';
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'company_id can only be updated by an elevated admin';
  end if;

  if new.affiliate_code_id is distinct from old.affiliate_code_id then
    raise exception 'affiliate_code_id can only be updated by an elevated admin';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_sensitive_fields on public.profiles;

create trigger guard_profile_sensitive_fields
before update on public.profiles
for each row
execute function public.guard_profile_sensitive_fields();

commit;
