-- Ensure the `returns` bucket exists and authenticated users can upload files.
insert into storage.buckets (id, name, public)
values ('returns', 'returns', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'returns_public_read') then
    create policy "returns_public_read"
      on storage.objects
      for select
      using (bucket_id = 'returns');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'returns_authenticated_insert') then
    create policy "returns_authenticated_insert"
      on storage.objects
      for insert
      with check (bucket_id = 'returns' and auth.role() in ('authenticated', 'service_role'));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'returns_authenticated_update') then
    create policy "returns_authenticated_update"
      on storage.objects
      for update
      using (bucket_id = 'returns' and auth.role() in ('authenticated', 'service_role'))
      with check (bucket_id = 'returns' and auth.role() in ('authenticated', 'service_role'));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'returns_authenticated_delete') then
    create policy "returns_authenticated_delete"
      on storage.objects
      for delete
      using (bucket_id = 'returns' and auth.role() in ('authenticated', 'service_role'));
  end if;
end$$;
