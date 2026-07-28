create table if not exists public.user_company_access (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id, company_id)
);

create index if not exists user_company_access_user_idx
  on public.user_company_access (user_id, organization_id);

alter table public.user_company_access enable row level security;

drop policy if exists "users read own company access" on public.user_company_access;
create policy "users read own company access"
  on public.user_company_access for select
  using (user_id = auth.uid());

drop policy if exists "organization admins manage company access" on public.user_company_access;
create policy "organization admins manage company access"
  on public.user_company_access for all
  using (
    exists (
      select 1 from public.organization_members member
      where member.organization_id = user_company_access.organization_id
        and member.user_id = auth.uid()
        and member.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.organization_members member
      where member.organization_id = user_company_access.organization_id
        and member.user_id = auth.uid()
        and member.role in ('owner', 'admin')
    )
  );

grant select on public.user_company_access to authenticated;
grant select, insert, update, delete on public.user_company_access to service_role;
