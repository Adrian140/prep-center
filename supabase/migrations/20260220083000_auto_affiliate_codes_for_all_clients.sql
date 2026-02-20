create or replace function public.ensure_profile_affiliate_code(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles%rowtype;
  v_existing public.affiliate_codes%rowtype;
  v_label text;
  v_base text;
  v_candidate text;
  v_inserted_id uuid;
  v_try integer := 0;
begin
  if p_profile_id is null then
    return null;
  end if;

  select *
  into v_profile
  from public.profiles
  where id = p_profile_id;

  if not found then
    return null;
  end if;

  if coalesce(v_profile.account_type, 'client') = 'admin' then
    return null;
  end if;

  select *
  into v_existing
  from public.affiliate_codes
  where owner_profile_id = p_profile_id
  order by created_at asc
  limit 1;

  if found then
    return v_existing.id;
  end if;

  v_label := coalesce(
    nullif(trim(v_profile.company_name), ''),
    nullif(trim(v_profile.store_name), ''),
    nullif(trim(concat_ws(' ', v_profile.first_name, v_profile.last_name)), ''),
    'Affiliate'
  );

  v_base := upper(regexp_replace(v_label, '[^A-Za-z0-9]+', '', 'g'));
  v_base := left(v_base, 8);
  if v_base is null or v_base = '' then
    v_base := 'AF';
  end if;

  while v_try < 25 loop
    v_try := v_try + 1;
    if v_try = 1 then
      v_candidate := v_base || right(replace(p_profile_id::text, '-', ''), 4);
    else
      v_candidate := v_base || substr(upper(replace(gen_random_uuid()::text, '-', '')), 1, 6);
    end if;

    insert into public.affiliate_codes (code, label, owner_profile_id, active)
    values (v_candidate, v_label, p_profile_id, true)
    on conflict (code) do nothing
    returning id into v_inserted_id;

    if v_inserted_id is not null then
      return v_inserted_id;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.trg_ensure_profile_affiliate_code()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.ensure_profile_affiliate_code(new.id);
  return new;
end;
$$;

drop trigger if exists trg_profiles_ensure_affiliate_code on public.profiles;
create trigger trg_profiles_ensure_affiliate_code
after insert or update of account_type on public.profiles
for each row
execute function public.trg_ensure_profile_affiliate_code();

do $$
declare
  v_profile_id uuid;
begin
  for v_profile_id in
    select p.id
    from public.profiles p
    left join public.affiliate_codes ac
      on ac.owner_profile_id = p.id
    where ac.id is null
      and coalesce(p.account_type, 'client') <> 'admin'
  loop
    perform public.ensure_profile_affiliate_code(v_profile_id);
  end loop;
end;
$$;

grant execute on function public.ensure_profile_affiliate_code(uuid) to authenticated;
