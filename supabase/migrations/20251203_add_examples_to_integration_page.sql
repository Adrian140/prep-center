alter table public.integration_page_content
  add column if not exists examples_title text,
  add column if not exists examples_body text;
