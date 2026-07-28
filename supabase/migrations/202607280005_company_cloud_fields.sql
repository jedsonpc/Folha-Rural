-- Campos do cadastro completo de empresas usados pela API Vercel/Supabase.
-- Migração aditiva: preserva todas as empresas e identificadores importados.

alter table public.companies
  add column if not exists document_type text not null default 'cnpj',
  add column if not exists owner_cpf text,
  add column if not exists cei text,
  add column if not exists legal_name text,
  add column if not exists trade_name text,
  add column if not exists registration_status text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists postal_code text,
  add column if not exists address text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists district text,
  add column if not exists checked_at timestamptz,
  add column if not exists active boolean not null default true;

create unique index if not exists companies_organization_document_idx
  on public.companies (organization_id, document)
  where document is not null and document <> '';

create index if not exists companies_organization_name_idx
  on public.companies (organization_id, name);
