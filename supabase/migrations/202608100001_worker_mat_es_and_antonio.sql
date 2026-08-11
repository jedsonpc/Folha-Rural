alter table public.employment_contracts add column if not exists mat_es text;

update public.employment_contracts
set mat_es = lpad(registration_number::text, 5, '0')
where registration_number is not null and nullif(trim(mat_es), '') is null;

alter table public.employment_contracts
  drop constraint if exists employment_contracts_mat_es_format;
alter table public.employment_contracts
  add constraint employment_contracts_mat_es_format
  check (mat_es is null or mat_es ~ '^[0-9]{5}$');

create unique index if not exists employment_contracts_company_mat_es_idx
  on public.employment_contracts (company_id, mat_es) where mat_es is not null;

do $$
declare
  v_company_id uuid;
begin
  select c.id into v_company_id
  from public.companies c
  where translate(lower(c.name),
    'áàãâäéèêëíìîïóòõôöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc') like '%antonio de jesus neri de oliveira%'
  order by c.created_at limit 1;

  if v_company_id is null then
    raise notice 'Empresa Antônio de Jesus Neri de Oliveira não localizada.';
    return;
  end if;

  update public.employment_contracts c
  set admission_date = case
        when lower(p.full_name) like 'caio henrique%' then date '2024-10-16'
        when lower(p.full_name) like 'jailton bezerra%' then date '2024-12-02' end,
      registration_number = case
        when lower(p.full_name) like 'caio henrique%' then 1
        when lower(p.full_name) like 'jailton bezerra%' then 2 end,
      mat_es = case
        when lower(p.full_name) like 'caio henrique%' then '00001'
        when lower(p.full_name) like 'jailton bezerra%' then '00002' end,
      termination_date = null,
      status = 'active'
  from public.people p
  where c.person_id = p.id and c.company_id = v_company_id
    and ((lower(p.full_name) like 'caio henrique%'
          and c.admission_date = date '2024-10-16')
      or (lower(p.full_name) like 'jailton bezerra%'
          and c.admission_date = date '2024-12-02'));
end $$;
