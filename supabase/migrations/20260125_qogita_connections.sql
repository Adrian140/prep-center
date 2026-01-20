-- Qogita connections (Buyer API login tokens)
create table if not exists public.qogita_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  qogita_email text not null,
  access_token_encrypted text not null,
  expires_at timestamptz,
  last_sync_at timestamptz,
  status text default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists qogita_connections_user_uidx on public.qogita_connections (user_id);
create index if not exists qogita_connections_status_idx on public.qogita_connections (status);

alter table public.qogita_connections enable row level security;

-- RLS: user can manage only own connection
create policy qogita_connections_self_select on public.qogita_connections
  for select using (auth.uid() = user_id);

create policy qogita_connections_self_insert on public.qogita_connections
  for insert with check (auth.uid() = user_id);

create policy qogita_connections_self_update on public.qogita_connections
  for update using (auth.uid() = user_id);

create policy qogita_connections_self_delete on public.qogita_connections
  for delete using (auth.uid() = user_id);

-- Trigger for updated_at
create or replace function public.qogita_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

create trigger trg_qogita_connections_updated
before update on public.qogita_connections
for each row execute function public.qogita_set_updated_at();
