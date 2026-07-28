create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  username text not null,
  permissions text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_profiles_username_idx
  on public.user_profiles (lower(username));

alter table public.user_profiles enable row level security;

drop policy if exists "users read own profile" on public.user_profiles;
create policy "users read own profile"
  on public.user_profiles for select
  using (user_id = auth.uid());

drop policy if exists "organization admins manage profiles" on public.user_profiles;
create policy "organization admins manage profiles"
  on public.user_profiles for all
  using (
    exists (
      select 1
      from public.organization_members member
      where member.user_id = auth.uid()
        and member.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.organization_members member
      where member.user_id = auth.uid()
        and member.role in ('owner', 'admin')
    )
  );

grant select on public.user_profiles to authenticated;
grant select, insert, update, delete on public.user_profiles to service_role;

