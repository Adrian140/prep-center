-- Chat conversations/messages with per-country support, reads, attachments, and audit log

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  client_user_id uuid not null,
  client_display_name text not null,
  country text not null check (country in ('FR','DE','IT','ES')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_id uuid
);

create unique index if not exists chat_conversations_company_country_idx
  on public.chat_conversations (company_id, country);

create index if not exists chat_conversations_last_message_idx
  on public.chat_conversations (last_message_at desc nulls last);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null,
  sender_role text not null default 'client',
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists chat_messages_conversation_idx
  on public.chat_messages (conversation_id, created_at desc);

create table if not exists public.chat_message_reads (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists chat_message_reads_user_idx
  on public.chat_message_reads (user_id, read_at desc);

create table if not exists public.chat_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes integer,
  created_at timestamptz not null default now()
);

create index if not exists chat_message_attachments_message_idx
  on public.chat_message_attachments (message_id);

create table if not exists public.chat_message_audit (
  id uuid primary key default gen_random_uuid(),
  message_id uuid,
  conversation_id uuid,
  action text not null check (action in ('edit','delete')),
  actor_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists chat_message_audit_conversation_idx
  on public.chat_message_audit (conversation_id, created_at desc);

-- helper to safely parse UUID from text
create or replace function public.safe_uuid(p_value text)
returns uuid
language plpgsql
set search_path = public
immutable
as $$
begin
  return p_value::uuid;
exception
  when others then
    return null;
end;
$$;

-- membership check
create or replace function public.chat_is_member(p_conversation_id uuid)
returns boolean
language sql
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.chat_conversations c
    left join public.profiles p on p.id = auth.uid()
    where c.id = p_conversation_id
      and (
        public.e_admin()
        or (p.company_id is not null and c.company_id = p.company_id)
        or (c.created_by = auth.uid())
        or (c.client_user_id = auth.uid())
      )
  );
$$;

-- unread count for current user
create or replace function public.chat_unread_count(p_conversation_id uuid)
returns integer
language sql
set search_path = public
stable
as $$
  select count(*)
  from public.chat_messages m
  left join public.chat_message_reads r
    on r.message_id = m.id
    and r.user_id = auth.uid()
  where m.conversation_id = p_conversation_id
    and m.sender_id <> auth.uid()
    and r.message_id is null;
$$;

-- mark all as read
create or replace function public.chat_mark_read(p_conversation_id uuid)
returns integer
language plpgsql
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  insert into public.chat_message_reads (message_id, user_id, read_at)
  select m.id, auth.uid(), now()
  from public.chat_messages m
  left join public.chat_message_reads r
    on r.message_id = m.id and r.user_id = auth.uid()
  where m.conversation_id = p_conversation_id
    and m.sender_id <> auth.uid()
    and r.message_id is null;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

-- security definer: create or return a conversation for the current user
create or replace function public.chat_create_conversation(
  p_company_id uuid,
  p_country text,
  p_client_display_name text
)
returns public.chat_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country text := upper(coalesce(p_country, 'FR'));
  v_display text := coalesce(nullif(trim(p_client_display_name), ''), 'Client');
  v_row public.chat_conversations;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if v_country not in ('FR','DE','IT','ES') then
    raise exception 'INVALID_COUNTRY';
  end if;

  insert into public.chat_conversations (
    company_id,
    client_user_id,
    client_display_name,
    country,
    created_by
  ) values (
    p_company_id,
    auth.uid(),
    v_display,
    v_country,
    auth.uid()
  )
  on conflict (company_id, country)
  do update set updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- Trigger: update conversation last message
create or replace function public.chat_update_conversation_on_message()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.chat_conversations
  set last_message_at = new.created_at,
      last_message_id = new.id,
      updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

-- Trigger: audit + edited_at
create or replace function public.chat_audit_message_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.body is distinct from old.body then
    insert into public.chat_message_audit (message_id, conversation_id, action, actor_id)
    values (new.id, new.conversation_id, 'edit', auth.uid());
    new.edited_at = now();
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.chat_audit_message_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.chat_message_audit (message_id, conversation_id, action, actor_id)
  values (old.id, old.conversation_id, 'delete', auth.uid());
  return old;
end;
$$;

create or replace function public.chat_touch_message_on_attachment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.chat_messages
  set updated_at = now()
  where id = new.message_id;
  return new;
end;
$$;

drop trigger if exists chat_messages_after_insert on public.chat_messages;
create trigger chat_messages_after_insert
after insert on public.chat_messages
for each row
execute function public.chat_update_conversation_on_message();

drop trigger if exists chat_messages_before_update on public.chat_messages;
create trigger chat_messages_before_update
before update on public.chat_messages
for each row
execute function public.chat_audit_message_update();

drop trigger if exists chat_messages_before_delete on public.chat_messages;
create trigger chat_messages_before_delete
before delete on public.chat_messages
for each row
execute function public.chat_audit_message_delete();

drop trigger if exists chat_message_attachments_after_insert on public.chat_message_attachments;
create trigger chat_message_attachments_after_insert
after insert on public.chat_message_attachments
for each row
execute function public.chat_touch_message_on_attachment();

-- Enable RLS
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_reads enable row level security;
alter table public.chat_message_attachments enable row level security;
alter table public.chat_message_audit enable row level security;

-- Policies: conversations
do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat conversations select'
      and polrelid = 'public.chat_conversations'::regclass
  ) then
    create policy "chat conversations select"
      on public.chat_conversations
      for select
      to authenticated
      using (public.chat_is_member(id));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat conversations insert'
      and polrelid = 'public.chat_conversations'::regclass
  ) then
    create policy "chat conversations insert"
      on public.chat_conversations
      for insert
      to authenticated
      with check (
        public.e_admin()
        or (
          created_by = auth.uid()
          and (
            company_id = (select company_id from public.profiles where id = auth.uid())
            or company_id = auth.uid()
          )
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat conversations update'
      and polrelid = 'public.chat_conversations'::regclass
  ) then
    create policy "chat conversations update"
      on public.chat_conversations
      for update
      to authenticated
      using (public.chat_is_member(id))
      with check (public.chat_is_member(id));
  end if;
end;
$$;

-- Policies: messages
do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat messages select'
      and polrelid = 'public.chat_messages'::regclass
  ) then
    create policy "chat messages select"
      on public.chat_messages
      for select
      to authenticated
      using (public.chat_is_member(conversation_id));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat messages insert'
      and polrelid = 'public.chat_messages'::regclass
  ) then
    create policy "chat messages insert"
      on public.chat_messages
      for insert
      to authenticated
      with check (
        public.chat_is_member(conversation_id)
        and sender_id = auth.uid()
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat messages update'
      and polrelid = 'public.chat_messages'::regclass
  ) then
    create policy "chat messages update"
      on public.chat_messages
      for update
      to authenticated
      using (
        public.e_admin()
        or (sender_id = auth.uid() and created_at > now() - interval '60 minutes')
      )
      with check (
        public.e_admin()
        or (sender_id = auth.uid() and created_at > now() - interval '60 minutes')
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat messages delete'
      and polrelid = 'public.chat_messages'::regclass
  ) then
    create policy "chat messages delete"
      on public.chat_messages
      for delete
      to authenticated
      using (
        public.e_admin()
        or (sender_id = auth.uid() and created_at > now() - interval '60 minutes')
      );
  end if;
end;
$$;

-- Policies: message reads
do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat message reads select'
      and polrelid = 'public.chat_message_reads'::regclass
  ) then
    create policy "chat message reads select"
      on public.chat_message_reads
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.chat_messages m
          where m.id = message_id
            and public.chat_is_member(m.conversation_id)
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat message reads insert'
      and polrelid = 'public.chat_message_reads'::regclass
  ) then
    create policy "chat message reads insert"
      on public.chat_message_reads
      for insert
      to authenticated
      with check (
        user_id = auth.uid()
        and exists (
          select 1
          from public.chat_messages m
          where m.id = message_id
            and public.chat_is_member(m.conversation_id)
        )
      );
  end if;
end;
$$;

-- Policies: attachments
do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat message attachments select'
      and polrelid = 'public.chat_message_attachments'::regclass
  ) then
    create policy "chat message attachments select"
      on public.chat_message_attachments
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.chat_messages m
          where m.id = message_id
            and public.chat_is_member(m.conversation_id)
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat message attachments insert'
      and polrelid = 'public.chat_message_attachments'::regclass
  ) then
    create policy "chat message attachments insert"
      on public.chat_message_attachments
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.chat_messages m
          where m.id = message_id
            and (m.sender_id = auth.uid() or public.e_admin())
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat message attachments delete'
      and polrelid = 'public.chat_message_attachments'::regclass
  ) then
    create policy "chat message attachments delete"
      on public.chat_message_attachments
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.chat_messages m
          where m.id = message_id
            and (
              public.e_admin()
              or (m.sender_id = auth.uid() and m.created_at > now() - interval '60 minutes')
            )
        )
      );
  end if;
end;
$$;

-- Policies: audit (admin read; inserts allowed for actors)
do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat message audit insert'
      and polrelid = 'public.chat_message_audit'::regclass
  ) then
    create policy "chat message audit insert"
      on public.chat_message_audit
      for insert
      to authenticated
      with check (actor_id = auth.uid() or public.e_admin());
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat message audit select'
      and polrelid = 'public.chat_message_audit'::regclass
  ) then
    create policy "chat message audit select"
      on public.chat_message_audit
      for select
      to authenticated
      using (public.e_admin());
  end if;
end;
$$;

-- Service role / system access
do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat conversations service role'
      and polrelid = 'public.chat_conversations'::regclass
  ) then
    create policy "chat conversations service role"
      on public.chat_conversations
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat messages service role'
      and polrelid = 'public.chat_messages'::regclass
  ) then
    create policy "chat messages service role"
      on public.chat_messages
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat reads service role'
      and polrelid = 'public.chat_message_reads'::regclass
  ) then
    create policy "chat reads service role"
      on public.chat_message_reads
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat attachments service role'
      and polrelid = 'public.chat_message_attachments'::regclass
  ) then
    create policy "chat attachments service role"
      on public.chat_message_attachments
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat audit service role'
      and polrelid = 'public.chat_message_audit'::regclass
  ) then
    create policy "chat audit service role"
      on public.chat_message_audit
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end;
$$;

-- Storage bucket for attachments
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- Storage policies for attachments
do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat attachments storage select'
      and polrelid = 'storage.objects'::regclass
  ) then
    create policy "chat attachments storage select"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'chat-attachments'
        and public.chat_is_member(public.safe_uuid(split_part(name, '/', 2)))
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat attachments storage insert'
      and polrelid = 'storage.objects'::regclass
  ) then
    create policy "chat attachments storage insert"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'chat-attachments'
        and public.chat_is_member(public.safe_uuid(split_part(name, '/', 2)))
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'chat attachments storage delete'
      and polrelid = 'storage.objects'::regclass
  ) then
    create policy "chat attachments storage delete"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'chat-attachments'
        and public.chat_is_member(public.safe_uuid(split_part(name, '/', 2)))
      );
  end if;
end;
$$;
