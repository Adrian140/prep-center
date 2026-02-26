create or replace function public.client_market_user_company_id(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.company_id, p.id)
  from public.profiles p
  where p.id = p_user_id
  limit 1;
$$;

create or replace function public.client_market_is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.client_market_conversations c
    where c.id = p_conversation_id
      and (
        c.seller_user_id = auth.uid()
        or c.buyer_user_id = auth.uid()
        or public.client_market_user_company_id(c.seller_user_id) = public.client_market_user_company_id(auth.uid())
        or public.client_market_user_company_id(c.buyer_user_id) = public.client_market_user_company_id(auth.uid())
      )
  );
$$;

create or replace function public.client_market_is_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.client_market_is_conversation_participant(p_conversation_id);
$$;

drop policy if exists "client market conversations participants select" on public.client_market_conversations;
create policy "client market conversations participants select"
  on public.client_market_conversations
  for select
  to authenticated
  using (public.client_market_is_conversation_participant(id));

drop policy if exists "client market conversations participants insert" on public.client_market_conversations;
create policy "client market conversations participants insert"
  on public.client_market_conversations
  for insert
  to authenticated
  with check (
    buyer_user_id = auth.uid()
    or seller_user_id = auth.uid()
    or public.client_market_user_company_id(buyer_user_id) = public.client_market_user_company_id(auth.uid())
    or public.client_market_user_company_id(seller_user_id) = public.client_market_user_company_id(auth.uid())
  );

drop policy if exists "client market conversations participants update" on public.client_market_conversations;
create policy "client market conversations participants update"
  on public.client_market_conversations
  for update
  to authenticated
  using (public.client_market_is_conversation_participant(id))
  with check (public.client_market_is_conversation_participant(id));

drop policy if exists "client market messages participants select" on public.client_market_messages;
create policy "client market messages participants select"
  on public.client_market_messages
  for select
  to authenticated
  using (public.client_market_is_conversation_participant(conversation_id));

drop policy if exists "client market messages participants insert" on public.client_market_messages;
create policy "client market messages participants insert"
  on public.client_market_messages
  for insert
  to authenticated
  with check (
    sender_user_id = auth.uid()
    and public.client_market_is_conversation_participant(conversation_id)
  );

drop policy if exists "client market attachments participants select" on public.client_market_message_attachments;
create policy "client market attachments participants select"
  on public.client_market_message_attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.client_market_messages m
      where m.id = message_id
        and public.client_market_is_conversation_participant(m.conversation_id)
    )
  );

drop policy if exists "client market attachments participants insert" on public.client_market_message_attachments;
create policy "client market attachments participants insert"
  on public.client_market_message_attachments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.client_market_messages m
      where m.id = message_id
        and public.client_market_is_conversation_participant(m.conversation_id)
    )
  );

drop policy if exists "client market attachments participants delete" on public.client_market_message_attachments;
create policy "client market attachments participants delete"
  on public.client_market_message_attachments
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.client_market_messages m
      where m.id = message_id
        and public.client_market_is_conversation_participant(m.conversation_id)
    )
  );
