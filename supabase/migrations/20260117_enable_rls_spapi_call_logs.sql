-- Enable RLS on spapi_call_logs to satisfy lint and block client access.
begin;

-- If the table exists, enable RLS and revoke broad grants.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'spapi_call_logs') then
    execute 'alter table public.spapi_call_logs enable row level security';
    execute 'revoke all on table public.spapi_call_logs from anon, authenticated';
    -- Add a deny-all policy so lint sees a policy while keeping access locked down (service_role bypasses RLS).
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'spapi_call_logs' and policyname = 'spapi_call_logs_deny_all'
    ) then
      execute $sql$
        create policy "spapi_call_logs_deny_all"
          on public.spapi_call_logs
          as restrictive
          for all
          to authenticated, anon
          using (false)
          with check (false);
      $sql$;
    end if;
  end if;
end$$;

commit;
