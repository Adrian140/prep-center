alter table if exists public.qogita_connections
  add column if not exists refresh_token_encrypted text,
  add column if not exists refresh_expires_at timestamptz;

create index if not exists qogita_connections_refresh_idx on public.qogita_connections (refresh_expires_at);
