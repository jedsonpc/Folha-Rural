-- Estoque, custos e faturamento por empresa, com isolamento organizacional.
create table if not exists public.business_partners (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade, legacy_id integer,
  partner_type text not null check (partner_type in ('supplier','customer','both')), name text not null,
  trade_name text, document text, phone text, email text, contact_name text, active boolean not null default true,
  created_at timestamptz not null default now(), unique (organization_id, company_id, partner_type, legacy_id)
);
create table if not exists public.inventory_categories (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade, legacy_id integer, name text not null,
  created_at timestamptz not null default now(), unique (organization_id, company_id, legacy_id)
);
create table if not exists public.inventory_products (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade, category_id uuid references public.inventory_categories(id),
  legacy_id integer, sku text, description text not null, unit text not null default 'UN', minimum_stock numeric(16,4) not null default 0,
  average_cost_cents bigint not null default 0, sale_price_cents bigint not null default 0, active boolean not null default true,
  created_at timestamptz not null default now(), unique (organization_id, company_id, legacy_id)
);
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade, product_id uuid not null references public.inventory_products(id),
  partner_id uuid references public.business_partners(id), movement_type text not null check (movement_type in ('purchase','consumption','sale','positive_adjustment','negative_adjustment')),
  movement_date date not null, quantity numeric(16,4) not null check (quantity > 0), unit_value_cents bigint not null default 0,
  document_number text, crop text, cost_center text, notes text, legacy_entry_id integer, created_at timestamptz not null default now()
);
create index if not exists inventory_movements_company_date_idx on public.inventory_movements (organization_id, company_id, movement_date desc);
create unique index if not exists inventory_movements_legacy_idx on public.inventory_movements (organization_id, company_id, legacy_entry_id, product_id) where legacy_entry_id is not null;

alter table public.business_partners enable row level security;
alter table public.inventory_categories enable row level security;
alter table public.inventory_products enable row level security;
alter table public.inventory_movements enable row level security;
grant select, insert, update, delete on public.business_partners, public.inventory_categories, public.inventory_products, public.inventory_movements to service_role;

-- Corrige erros ortograficos inequívocos sem alterar nenhum codigo de serviço.
update public.services set description = case
  when lower(description) = 'diferensa de férias' then 'Diferença de férias'
  when lower(description) = 'fasendo mudas' then 'Fazendo mudas'
  when lower(description) = 'fasendo aceiro' then 'Fazendo aceiro'
  when lower(description) = 'disbrotando cacau' then 'Desbrotando cacau'
  when lower(description) = 'cutivo de mamão' then 'Cultivo de mamão'
  when lower(description) = 'conservaçao de estrada' then 'Conservação de estrada'
  when lower(description) = 'demarcaçao' then 'Demarcação'
  when lower(description) = 'folga de aviso previo' then 'Folga de aviso prévio'
  when lower(description) = 'salário familia' then 'Salário-família'
  when lower(description) = 'combate à pragas' then 'Combate a pragas'
  else trim(description) end;

-- Cada empresa possui sua própria tabela de códigos de serviço.
alter table public.services add column if not exists composes_production_average boolean not null default false;
alter table public.services add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.services drop constraint if exists services_organization_id_legacy_id_key;
do $$
declare s record; assigned_company uuid; target_company uuid; duplicated uuid;
begin
  for s in select * from public.services loop
    select e.company_id into assigned_company from public.daily_entries e where e.service_id=s.id order by e.created_at limit 1;
    if assigned_company is null then select c.id into assigned_company from public.companies c where c.organization_id=s.organization_id order by c.created_at limit 1; end if;
    update public.services set company_id=assigned_company where id=s.id;
    for target_company in select distinct e.company_id from public.daily_entries e where e.service_id=s.id and e.company_id is distinct from assigned_company loop
      insert into public.services (organization_id,company_id,legacy_id,description,fgts_incidence,inss_incidence,group_legacy_id,unit_legacy_id,fgts_13_incidence,inss_13_incidence,irrf_incidence,rais_incidence,formula_code,entry_type,group_name,unit_name,affects_dsr,composes_production_average,active)
      select organization_id,target_company,legacy_id,description,fgts_incidence,inss_incidence,group_legacy_id,unit_legacy_id,fgts_13_incidence,inss_13_incidence,irrf_incidence,rais_incidence,formula_code,entry_type,group_name,unit_name,affects_dsr,composes_production_average,active from public.services where id=s.id returning id into duplicated;
      update public.daily_entries set service_id=duplicated where service_id=s.id and company_id=target_company;
    end loop;
  end loop;
end $$;
alter table public.services alter column company_id set not null;
alter table public.services add constraint services_company_legacy_unique unique (organization_id,company_id,legacy_id);
create index if not exists services_company_description_idx on public.services(organization_id,company_id,description);

create or replace function public.folha_import_access_history(p_organization_id uuid,p_entries jsonb) returns integer
language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  insert into daily_entries (organization_id,company_id,entry_date,contract_id,service_id,quantity,unit_price_cents,amount_cents,discount_cents,source_sequence,notes)
  select p_organization_id,c.company_id,(x->>'entryDate')::date,c.id,s.id,(x->>'quantity')::numeric,(x->>'unitPriceCents')::bigint,(x->>'amountCents')::bigint,(x->>'discountCents')::bigint,(x->>'sourceSequence')::bigint,'Importado do Access'
  from jsonb_array_elements(coalesce(p_entries,'[]')) x
  join companies co on co.organization_id=p_organization_id and co.legacy_id=(x->>'companySourceId')::bigint
  join employment_contracts c on c.company_id=co.id and c.legacy_registration=(x->>'sourceRegistration')::bigint
  join services s on s.organization_id=p_organization_id and s.company_id=co.id and s.legacy_id=(x->>'serviceSourceId')::bigint
  on conflict (organization_id,company_id,entry_date,contract_id,service_id) do nothing;
  get diagnostics v_count=row_count; return v_count;
end $$;
grant execute on function public.folha_import_access_history(uuid,jsonb) to service_role;
