create table if not exists public.fbm_shipping_rates (
  id uuid primary key default uuid_generate_v4(),
  category text not null check (category in ('domestic','international')),
  region text not null,
  provider text not null,
  rates jsonb not null default '{}'::jsonb,
  info text,
  color text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists fbm_shipping_rates_unique_provider
  on public.fbm_shipping_rates(category, region, provider);

create trigger fbm_shipping_rates_updated_at
before update on public.fbm_shipping_rates
for each row
execute procedure public.set_current_timestamp_updated_at();

insert into public.fbm_shipping_rates (category, region, provider, rates, info, position, color)
values
('domestic','France','Colissimo','{"0.25":"€5.25","0.5":"€7.35","1":"€9.40","20":"—"}','24/48h',0,'#fef3c7'),
('domestic','France','Colis Privé','{"0.25":"€4.37","0.5":"€4.94","1":"€6.35","20":"—"}','3/5 Days',1,'#e0f2fe'),
('domestic','France','UPS','{"0.25":"€7.05","0.5":"€7.05","1":"€7.55","20":"€12.40"}','24/48h',2,'#ede9fe');

insert into public.fbm_shipping_rates (category, region, provider, rates, info, position, color)
values
('international','Germany/Austria','Mondial Relay','{"0.5":"€7.44","1":"€7.66","10":"€15.75","20":"€20.83"}',null,0,'#fef3c7'),
('international','Germany/Austria','UPS','{"0.5":"€9.40","1":"€10.00","10":"€17.00","20":"€30.00"}',null,1,'#ede9fe'),
('international','Germany/Austria','Chronopost','{"0.5":"€11.79","1":"€11.79","10":"—","20":"—"}',null,2,'#e0e7ff'),

('international','Spain','Mondial Relay','{"0.5":"€8.85","1":"€9.11","10":"€16.20","20":"€29.54"}',null,0,'#fef3c7'),
('international','Spain','UPS','{"0.5":"€9.40","1":"€10.00","10":"€30.00","20":"€30.00"}',null,1,'#ede9fe'),
('international','Spain','Chronopost','{"0.5":"€12.40","1":"€12.40","10":"€22.74","20":"€34.23"}',null,2,'#e0e7ff'),

('international','Italy','Mondial Relay','{"0.5":"€8.97","1":"€9.34","10":"€16.75","20":"€29.37"}',null,0,'#fef3c7'),
('international','Italy','UPS','{"0.5":"€9.40","1":"€10.00","10":"€30.00","20":"€30.00"}',null,1,'#ede9fe'),
('international','Italy','Chronopost','{"0.5":"€12.40","1":"€12.40","10":"€22.74","20":"€34.23"}',null,2,'#e0e7ff'),

('international','Belgium','Mondial Relay','{"0.5":"€7.44","1":"€7.66","10":"€15.75","20":"€20.83"}',null,0,'#fef3c7'),
('international','Belgium','UPS','{"0.5":"€9.40","1":"€17.00","10":"€22.00","20":"€30.00"}',null,1,'#ede9fe'),
('international','Belgium','Chronopost','{"0.5":"€11.79","1":"€11.79","10":"€20.87","20":"€30.96"}',null,2,'#e0e7ff'),

('international','United Kingdom','UPS','{"0.5":"€15.10","1":"€15.80","2":"€18.80","5":"€20.00"}',null,0,'#ede9fe'),
('international','United Kingdom','FedEx','{"0.5":"—","1":"—","2":"—","5":"€19.10"}',null,1,'#fee2e2');
