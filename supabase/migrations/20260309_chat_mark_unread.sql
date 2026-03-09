-- Create function to mark chat as unread for current user
create or replace function public.chat_mark_unread(p_conversation_id uuid)
returns integer
language plpgsql
as $$
declare
  deleted_count integer := 0;
begin
  delete from public.chat_message_reads r
  using public.chat_messages m
  where r.message_id = m.id
    and m.conversation_id = p_conversation_id
    and r.user_id = auth.uid();

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
