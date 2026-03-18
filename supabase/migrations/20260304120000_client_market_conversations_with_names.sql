create or replace function public.client_market_list_conversations_with_names(p_country text default null)
returns table (
  id uuid,
  listing_id uuid,
  country text,
  seller_user_id uuid,
  buyer_user_id uuid,
  created_at timestamptz,
  last_message_at timestamptz,
  last_message_id uuid,
  last_message_sender_user_id uuid,
  client_market_listings json,
  seller_display_name text,
  seller_company_name text,
  buyer_display_name text,
  buyer_company_name text
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.listing_id,
    c.country,
    c.seller_user_id,
    c.buyer_user_id,
    c.created_at,
    c.last_message_at,
    latest_message.id as last_message_id,
    latest_message.sender_user_id as last_message_sender_user_id,
    row_to_json(l.*) as client_market_listings,
    coalesce(
      company_owner.name,
      nullif(trim(concat_ws(' ', ps.first_name, ps.last_name)), ''),
      ps.store_name,
      ps.company_name,
      'Seller'
    ) as seller_display_name,
    company_owner.name as seller_company_name,
    coalesce(
      company_b.name,
      nullif(trim(concat_ws(' ', pb.first_name, pb.last_name)), ''),
      pb.store_name,
      pb.company_name,
      'Buyer'
    ) as buyer_display_name,
    company_b.name as buyer_company_name
  from public.client_market_conversations c
  join public.client_market_listings l on l.id = c.listing_id
  left join public.profiles ps on ps.id = c.seller_user_id
  left join public.profiles pb on pb.id = c.buyer_user_id
  left join public.companies company_owner on company_owner.id = l.owner_company_id
  left join public.companies company_b on company_b.id = public.client_market_user_company_id(c.buyer_user_id)
  left join lateral (
    select m.id, m.sender_user_id
    from public.client_market_messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) latest_message on true
  where public.client_market_is_conversation_participant(c.id)
    and (p_country is null or upper(c.country) = upper(p_country))
  order by c.last_message_at desc nulls last, c.created_at desc;
$$;

grant execute on function public.client_market_list_conversations_with_names(text) to authenticated;
grant execute on function public.client_market_list_conversations_with_names(text) to service_role;
