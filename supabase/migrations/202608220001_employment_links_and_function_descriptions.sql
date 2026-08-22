alter table public.job_functions
  drop constraint if exists job_functions_organization_id_cbo_code_key;

create unique index if not exists job_functions_org_cbo_local_description_idx
  on public.job_functions (organization_id, cbo_code, coalesce(local_description, official_description));

create table if not exists public.employment_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  description text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

grant select, insert, update, delete on public.employment_links to service_role;
