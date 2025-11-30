create table if not exists public.integration_media (
  lang text not null,
  card_key text not null,
  image_url text,
  updated_at timestamptz default now(),
  primary key (lang, card_key)
);

alter table public.integration_media enable row level security;

create policy "Public read integration media" on public.integration_media
for select using (true);

create policy "Service role write integration media" on public.integration_media
for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

comment on table public.integration_media is 'Images for Integrations cards, per language and card key';
