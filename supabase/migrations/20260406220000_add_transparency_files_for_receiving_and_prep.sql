alter table if exists public.receiving_items
  add column if not exists transparency_file_path text,
  add column if not exists transparency_file_name text,
  add column if not exists transparency_uploaded_at timestamptz,
  add column if not exists transparency_uploaded_by uuid;

alter table if exists public.prep_request_items
  add column if not exists transparency_file_path text,
  add column if not exists transparency_file_name text,
  add column if not exists transparency_uploaded_at timestamptz,
  add column if not exists transparency_uploaded_by uuid;

insert into storage.buckets (id, name, public)
values ('transparency-labels', 'transparency-labels', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'transparency labels select'
      and polrelid = 'storage.objects'::regclass
  ) then
    create policy "transparency labels select"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'transparency-labels'
        and (
          public.is_admin()
          or split_part(name, '/', 1) = coalesce(public.current_company_id()::text, '')
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'transparency labels insert'
      and polrelid = 'storage.objects'::regclass
  ) then
    create policy "transparency labels insert"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'transparency-labels'
        and (
          public.is_admin()
          or split_part(name, '/', 1) = coalesce(public.current_company_id()::text, '')
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'transparency labels update'
      and polrelid = 'storage.objects'::regclass
  ) then
    create policy "transparency labels update"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'transparency-labels'
        and (
          public.is_admin()
          or split_part(name, '/', 1) = coalesce(public.current_company_id()::text, '')
        )
      )
      with check (
        bucket_id = 'transparency-labels'
        and (
          public.is_admin()
          or split_part(name, '/', 1) = coalesce(public.current_company_id()::text, '')
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'transparency labels delete'
      and polrelid = 'storage.objects'::regclass
  ) then
    create policy "transparency labels delete"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'transparency-labels'
        and (
          public.is_admin()
          or split_part(name, '/', 1) = coalesce(public.current_company_id()::text, '')
        )
      );
  end if;
end;
$$;
