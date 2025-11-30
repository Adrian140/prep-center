create table if not exists public.integration_page_content (
  lang text primary key,
  hero_title text,
  hero_subtitle text,
  feature1_title text,
  feature1_body text,
  feature2_title text,
  feature2_body text,
  feature3_title text,
  feature3_body text,
  screenshot1_url text,
  screenshot2_url text,
  flow_title text,
  flow_step1 text,
  flow_step2 text,
  flow_step3 text,
  faq_title text,
  faq_q1 text,
  faq_a1 text,
  cta_title text,
  cta_subtitle text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.integration_page_content enable row level security;

create policy "Public read integration page" on public.integration_page_content
for select using (true);

create policy "Service role write integration page" on public.integration_page_content
for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

comment on table public.integration_page_content is 'Content for Integrations presentation page, per language';
