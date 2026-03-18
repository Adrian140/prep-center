create or replace function public.chat_unread_counts(p_conversation_ids uuid[])
returns table (
  conversation_id uuid,
  unread_count integer
)
language sql
stable
set search_path = public
as $$
  with requested_ids as (
    select unnest(coalesce(p_conversation_ids, '{}'::uuid[])) as conversation_id
  )
  select
    ids.conversation_id,
    coalesce(
      count(m.id) filter (
        where m.sender_id <> auth.uid()
          and r.message_id is null
      ),
      0
    )::integer as unread_count
  from requested_ids ids
  left join public.chat_messages m
    on m.conversation_id = ids.conversation_id
  left join public.chat_message_reads r
    on r.message_id = m.id
   and r.user_id = auth.uid()
  group by ids.conversation_id;
$$;

grant execute on function public.chat_unread_counts(uuid[]) to authenticated;
grant execute on function public.chat_unread_counts(uuid[]) to service_role;
