create or replace function public.client_market_touch_conversation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.client_market_conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end;
$$;
