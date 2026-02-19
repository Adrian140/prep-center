-- Allow chat membership/creation for both company_id and direct user-owned conversations.
-- This fixes cases where one market uses company_id while another uses auth.uid().

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
        c.created_by = v_uid
        or c.client_user_id = v_uid
        or c.company_id = v_uid
        or (v_company_id is not null and c.company_id = v_company_id)
      )
  );
end;
$$;

revoke all on function public.chat_is_member(uuid) from public;
grant execute on function public.chat_is_member(uuid) to authenticated;
grant execute on function public.chat_is_member(uuid) to service_role;

drop policy if exists "chat conversations insert" on public.chat_conversations;
create policy "chat conversations insert"
  on public.chat_conversations
  for insert
  to authenticated
  with check (
    public.e_admin()
    or (
      created_by = auth.uid()
      and (
        company_id = auth.uid()
        or company_id = (select company_id from public.profiles where id = auth.uid())
      )
    )
  );
