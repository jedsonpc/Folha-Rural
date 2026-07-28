-- Campos completos do cadastro de serviços usados na API Vercel/Supabase.
alter table public.services
  add column if not exists fgts_13_incidence boolean not null default false,
  add column if not exists inss_13_incidence boolean not null default false,
  add column if not exists irrf_incidence boolean not null default false,
  add column if not exists rais_incidence boolean not null default false,
  add column if not exists formula_code text,
  add column if not exists entry_type text not null default 'earning',
  add column if not exists group_name text,
  add column if not exists unit_name text,
  add column if not exists affects_dsr boolean not null default false,
  add column if not exists active boolean not null default true;

create index if not exists services_organization_description_idx
  on public.services (organization_id, description);
