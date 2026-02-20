drop trigger if exists trg_profiles_ensure_affiliate_code on public.profiles;

drop function if exists public.trg_ensure_profile_affiliate_code();
drop function if exists public.ensure_profile_affiliate_code(uuid);
