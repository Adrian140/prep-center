create schema if not exists extensions;

do $$
begin
  if exists (
    select 1
    from pg_extension
    where extname = 'pg_trgm'
  ) then
    execute 'alter extension pg_trgm set schema extensions';
  else
    execute 'create extension if not exists pg_trgm with schema extensions';
  end if;
end;
$$;
