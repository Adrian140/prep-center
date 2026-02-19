begin;

alter table public.prep_requests
  drop constraint if exists prep_requests_destination_country_check;

alter table public.prep_requests
  add constraint prep_requests_destination_country_check
  check (
    upper(destination_country) = any (
      array['FR'::text, 'DE'::text, 'IT'::text, 'ES'::text, 'UK'::text, 'GB'::text]
    )
  ) not valid;

alter table public.prep_requests
  validate constraint prep_requests_destination_country_check;

commit;
