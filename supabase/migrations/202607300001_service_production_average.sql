alter table public.services
  add column if not exists composes_production_average boolean not null default false;
