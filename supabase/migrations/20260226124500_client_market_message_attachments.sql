create table if not exists public.client_market_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.client_market_messages(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists client_market_message_attachments_message_idx
  on public.client_market_message_attachments (message_id);

alter table public.client_market_message_attachments enable row level security;

create or replace function public.client_market_is_participant(p_conversation_id uuid)
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
      and (c.seller_user_id = auth.uid() or c.buyer_user_id = auth.uid())
  );
$$;

drop policy if exists "client market attachments participants select" on public.client_market_message_attachments;
create policy "client market attachments participants select"
  on public.client_market_message_attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.client_market_messages m
      join public.client_market_conversations c on c.id = m.conversation_id
      where m.id = message_id
        and (c.seller_user_id = auth.uid() or c.buyer_user_id = auth.uid())
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
      join public.client_market_conversations c on c.id = m.conversation_id
      where m.id = message_id
        and (c.seller_user_id = auth.uid() or c.buyer_user_id = auth.uid())
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
      join public.client_market_conversations c on c.id = m.conversation_id
      where m.id = message_id
        and (c.seller_user_id = auth.uid() or c.buyer_user_id = auth.uid())
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'client market attachments service role'
      and polrelid = 'public.client_market_message_attachments'::regclass
  ) then
    create policy "client market attachments service role"
      on public.client_market_message_attachments
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end;
$$;

insert into storage.buckets (id, name, public)
values ('client-market-attachments', 'client-market-attachments', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'client market attachments storage select'
      and polrelid = 'storage.objects'::regclass
  ) then
    create policy "client market attachments storage select"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'client-market-attachments'
        and public.client_market_is_participant(public.safe_uuid(split_part(name, '/', 2)))
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'client market attachments storage insert'
      and polrelid = 'storage.objects'::regclass
  ) then
    create policy "client market attachments storage insert"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'client-market-attachments'
        and public.client_market_is_participant(public.safe_uuid(split_part(name, '/', 2)))
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'client market attachments storage delete'
      and polrelid = 'storage.objects'::regclass
  ) then
    create policy "client market attachments storage delete"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'client-market-attachments'
        and public.client_market_is_participant(public.safe_uuid(split_part(name, '/', 2)))
      );
  end if;
end;
$$;
