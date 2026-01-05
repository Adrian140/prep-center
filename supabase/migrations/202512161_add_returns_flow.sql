-- Returns workflow: return requests + items + files (labels / inside docs)

-- Drop any previous attempt to avoid type mismatches
drop table if exists public.return_files cascade;
drop table if exists public.return_items cascade;
drop table if exists public.returns cascade;

create table if not exists public.returns (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  user_id uuid,
  marketplace text,
  status text not null default 'pending' check (status in ('pending','processing','done','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.return_items (
  id bigint generated always as identity primary key,
  return_id bigint not null references public.returns(id) on delete cascade,
  stock_item_id uuid,
  asin text,
  sku text,
  qty integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.return_files (
  id bigint generated always as identity primary key,
  return_id bigint not null references public.returns(id) on delete cascade,
  file_type text not null check (file_type in ('inside','label')),
  name text,
  url text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create index if not exists returns_company_status_idx on public.returns (company_id, status);
create index if not exists return_items_return_idx on public.return_items (return_id);
create index if not exists return_files_return_idx on public.return_files (return_id);

alter table public.returns enable row level security;
alter table public.return_items enable row level security;
alter table public.return_files enable row level security;

-- Policies: users can manage their own company data; admins full access.
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'returns' and policyname = 'returns_select_company') then
    create policy "returns_select_company"
      on public.returns
      for select
      using (company_id in (select profiles.company_id from public.profiles where profiles.id = auth.uid()) or public.is_admin(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'returns' and policyname = 'returns_write_company') then
    create policy "returns_write_company"
      on public.returns
      for all
      using (company_id in (select profiles.company_id from public.profiles where profiles.id = auth.uid()) or public.is_admin(auth.uid()))
      with check (company_id in (select profiles.company_id from public.profiles where profiles.id = auth.uid()) or public.is_admin(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'return_items' and policyname = 'return_items_company') then
    create policy "return_items_company"
      on public.return_items
      for all
      using (return_id in (select id from public.returns where company_id in (select profiles.company_id from public.profiles where profiles.id = auth.uid()) or public.is_admin(auth.uid())))
      with check (return_id in (select id from public.returns where company_id in (select profiles.company_id from public.profiles where profiles.id = auth.uid()) or public.is_admin(auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'return_files' and policyname = 'return_files_company') then
    create policy "return_files_company"
      on public.return_files
      for all
      using (return_id in (select id from public.returns where company_id in (select profiles.company_id from public.profiles where profiles.id = auth.uid()) or public.is_admin(auth.uid())))
      with check (return_id in (select id from public.returns where company_id in (select profiles.company_id from public.profiles where profiles.id = auth.uid()) or public.is_admin(auth.uid())));
  end if;
end$$;
