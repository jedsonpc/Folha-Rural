create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','payroll','pointer','viewer')),
  primary key (organization_id, user_id)
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legacy_id bigint,
  name text not null,
  document text,
  city text,
  state char(2),
  next_registration bigint not null default 1 check (next_registration > 0),
  created_at timestamptz not null default now(),
  unique (organization_id, legacy_id)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  cpf text,
  pis text,
  birth_date date,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, cpf)
);

create table public.employment_contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  person_id uuid not null references public.people(id) on delete restrict,
  registration_number bigint,
  legacy_registration bigint,
  legacy_code text,
  admission_date date,
  termination_date date,
  role_name text,
  season_legacy_id bigint,
  status text not null check (status in ('active','terminated','leave')),
  created_at timestamptz not null default now(),
  unique (company_id, registration_number),
  unique (company_id, legacy_registration),
  check ((status = 'active' and registration_number is not null) or status <> 'active')
);

create table public.legacy_contract_map (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  legacy_registration bigint not null,
  contract_id uuid not null references public.employment_contracts(id) on delete cascade,
  target_code text not null,
  unique (company_id, legacy_registration)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legacy_id bigint,
  description text not null,
  fgts_incidence boolean not null default false,
  inss_incidence boolean not null default false,
  unique (organization_id, legacy_id)
);

create or replace function public.is_organization_member(target_organization uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.organization_members m where m.organization_id = target_organization and m.user_id = auth.uid()) $$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.companies enable row level security;
alter table public.people enable row level security;
alter table public.employment_contracts enable row level security;
alter table public.legacy_contract_map enable row level security;
alter table public.services enable row level security;

create policy "members read organizations" on public.organizations for select using (public.is_organization_member(id));
create policy "members read memberships" on public.organization_members for select using (public.is_organization_member(organization_id));
create policy "members manage companies" on public.companies for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members manage people" on public.people for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members manage contracts" on public.employment_contracts for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members manage legacy map" on public.legacy_contract_map for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members manage services" on public.services for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
