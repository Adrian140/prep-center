-- Fix RLS recursion for chat_conversations policies.
-- chat_is_member() is used inside policies on chat_conversations/chat_messages,
-- so it must bypass RLS when checking membership.

create or replace function public.chat_is_member(p_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
begin
  if v_uid is null then
    return false;
  end if;

  if public.e_admin() then
    return true;
  end if;

  select p.company_id
    into v_company_id
  from public.profiles p
  where p.id = v_uid;

  return exists (
    select 1
    from public.chat_conversations c
    where c.id = p_conversation_id
      and (
        (v_company_id is not null and c.company_id = v_company_id)
        or c.created_by = v_uid
      )
  );
end;
$$;

revoke all on function public.chat_is_member(uuid) from public;
grant execute on function public.chat_is_member(uuid) to authenticated;
grant execute on function public.chat_is_member(uuid) to service_role;
