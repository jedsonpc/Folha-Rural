-- Expansão segura do esquema Supabase para cobrir os módulos operacionais
-- atuais do Folha Rural. Esta migração é aditiva e não remove dados.

alter table public.people
  add column if not exists person_key text,
  add column if not exists identity_number text,
  add column if not exists identity_issuer text,
  add column if not exists identity_state char(2),
  add column if not exists identity_issue_date date,
  add column if not exists ctps_number text,
  add column if not exists ctps_series text,
  add column if not exists ctps_state char(2),
  add column if not exists ctps_issue_date date,
  add column if not exists voter_title_number text,
  add column if not exists voter_zone text,
  add column if not exists voter_section text,
  add column if not exists cnh_number text,
  add column if not exists cnh_category text,
  add column if not exists cnh_expiration_date date,
  add column if not exists cnh_first_issue_date date,
  add column if not exists military_certificate text,
  add column if not exists phone text,
  add column if not exists mother_name text,
  add column if not exists birth_state char(2),
  add column if not exists birth_city text,
  add column if not exists photo_data_url text,
  add column if not exists email text,
  add column if not exists sex text,
  add column if not exists education text,
  add column if not exists marital_status text,
  add column if not exists race_color text,
  add column if not exists address text,
  add column if not exists address_number text,
  add column if not exists district text,
  add column if not exists city text,
  add column if not exists state char(2),
  add column if not exists postal_code text;

create table if not exists public.unions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  cnpj text,
  description text not null,
  legal_name text,
  trade_name text,
  registration_status text,
  email text,
  phone text,
  postal_code text,
  address text,
  address_number text,
  address_complement text,
  district text,
  city text,
  state char(2),
  cnpj_checked_at timestamptz,
  contribution_cents bigint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, cnpj)
);

alter table public.employment_contracts
  add column if not exists cbo_code text,
  add column if not exists weekly_hours integer not null default 44,
  add column if not exists employment_link_code text,
  add column if not exists employment_link_description text,
  add column if not exists contract_term text not null default 'indefinite',
  add column if not exists payment_type text not null default 'production',
  add column if not exists union_member boolean not null default false,
  add column if not exists union_discount_cents bigint not null default 0,
  add column if not exists union_id uuid,
  add column if not exists union_discount_frequency text not null default 'monthly',
  add column if not exists family_dependents integer not null default 0,
  add column if not exists irrf_dependents integer not null default 0,
  add column if not exists employment_condition text not null default 'first_job',
  add column if not exists contract_type text not null default 'harvest';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'employment_contracts_union_id_fkey'
  ) then
    alter table public.employment_contracts
      add constraint employment_contracts_union_id_fkey
      foreign key (union_id) references public.unions(id) on delete set null;
  end if;
end $$;

alter table public.services
  add column if not exists group_legacy_id bigint,
  add column if not exists unit_legacy_id bigint;

create table if not exists public.job_functions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cbo_code text not null,
  official_description text not null,
  local_description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, cbo_code)
);

create table if not exists public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  description text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.union_contribution_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  union_id uuid not null references public.unions(id) on delete cascade,
  effective_from date not null,
  contribution_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, union_id, effective_from)
);

create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  file_name text not null,
  companies_count integer not null default 0,
  workers_count integer not null default 0,
  services_count integer not null default 0,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, company_id, holiday_date)
);

create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  entry_date date not null,
  contract_id uuid not null references public.employment_contracts(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  quantity numeric(18,4) not null,
  unit_price_cents bigint not null,
  amount_cents bigint not null,
  discount_cents bigint not null default 0,
  source_sequence bigint,
  notes text,
  cloned_from_id uuid references public.daily_entries(id),
  created_at timestamptz not null default now(),
  unique (organization_id, company_id, entry_date, contract_id, service_id)
);

create table if not exists public.dependents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  dependent_type text not null,
  name text not null,
  cpf text not null,
  birth_date date not null,
  disabled boolean not null default false,
  birth_certificate text,
  vaccination_proof boolean not null default false,
  school_proof boolean not null default false,
  salary_family_eligible boolean not null default false,
  irrf_dependent boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, cpf)
);

create table if not exists public.worker_payroll_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.employment_contracts(id) on delete cascade,
  salary_type text not null default 'monthly',
  base_salary_cents bigint not null default 0,
  daily_rate_cents bigint,
  advance_rate_basis_points integer not null default 4000,
  updated_at timestamptz not null default now(),
  unique (organization_id, contract_id)
);

create table if not exists public.salary_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.employment_contracts(id) on delete cascade,
  effective_date date not null,
  salary_cents bigint not null,
  reason text,
  source text not null default 'individual',
  adjustment_batch_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.vacation_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.employment_contracts(id) on delete cascade,
  accrual_start date not null,
  accrual_end date not null,
  concession_deadline date not null,
  scheduled_start date,
  scheduled_end date,
  days integer not null default 30,
  sold_days integer not null default 0,
  payment_date date,
  status text not null default 'pending',
  notes text,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.salary_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference_type text not null,
  effective_date date not null,
  value_cents bigint not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.salary_adjustment_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  effective_date date not null,
  mode text not null,
  value bigint not null,
  reason text,
  function_ids uuid[] not null default '{}',
  status text not null default 'preview',
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  competence char(7) not null,
  period_type text not null,
  status text not null default 'closed',
  totals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, company_id, competence, period_type)
);

create table if not exists public.safety_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_type text not null,
  description text not null,
  supplier text,
  ca text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.item_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_id uuid not null references public.safety_items(id) on delete restrict,
  contract_id uuid not null references public.employment_contracts(id) on delete restrict,
  issue_date date not null,
  quantity numeric(18,4) not null default 1,
  return_due_date date,
  returned_at timestamptz,
  condition_notes text,
  employee_acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.tax_brackets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tax_type text not null,
  effective_from date not null,
  effective_to date,
  lower_cents bigint not null,
  upper_cents bigint,
  rate_basis_points integer not null,
  deduction_cents bigint not null default 0,
  source_name text not null,
  source_url text not null,
  official_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, tax_type, effective_from, lower_cents)
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'unions','job_functions','cost_centers','union_contribution_rates',
    'import_runs','holidays','daily_entries','dependents',
    'worker_payroll_profiles','salary_history','vacation_periods',
    'salary_references','salary_adjustment_batches','payroll_closings',
    'safety_items','item_issues',
    'tax_brackets'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "organization members manage" on public.%I', table_name);
    execute format(
      'create policy "organization members manage" on public.%I for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id))',
      table_name
    );
  end loop;
end $$;

create index if not exists daily_entries_contract_date_idx
  on public.daily_entries (contract_id, entry_date);
create index if not exists salary_history_contract_date_idx
  on public.salary_history (contract_id, effective_date desc);
create index if not exists vacation_periods_deadline_idx
  on public.vacation_periods (organization_id, concession_deadline);
