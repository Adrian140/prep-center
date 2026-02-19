-- Reliable chat get-or-create for clients across markets (FR/DE/etc).
-- Uses SECURITY DEFINER to avoid client-side RLS dead-ends on initial conversation creation.

create or replace function public.chat_get_or_create_conversation(
  p_country text,
  p_client_display_name text default null
)
returns public.chat_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_country text := upper(coalesce(nullif(trim(p_country), ''), 'FR'));
  v_display text := coalesce(nullif(trim(p_client_display_name), ''), 'Client');
  v_row public.chat_conversations;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_country not in ('FR', 'DE', 'IT', 'ES') then
    v_country := 'FR';
  end if;

  select p.company_id
    into v_company_id
  from public.profiles p
  where p.id = v_uid;

  if v_company_id is null then
    v_company_id := v_uid;
  end if;

  insert into public.chat_conversations (
    company_id,
    client_user_id,
    client_display_name,
    country,
    created_by
  )
  values (
    v_company_id,
    v_uid,
    v_display,
    v_country,
    v_uid
  )
  on conflict (company_id, country) do update
    set client_user_id = excluded.client_user_id,
        client_display_name = coalesce(public.chat_conversations.client_display_name, excluded.client_display_name),
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.chat_get_or_create_conversation(text, text) from public;
grant execute on function public.chat_get_or_create_conversation(text, text) to authenticated;
grant execute on function public.chat_get_or_create_conversation(text, text) to service_role;
