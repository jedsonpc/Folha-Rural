alter table public.employment_contracts
  drop constraint if exists employment_contracts_mat_es_format;

update public.employment_contracts
set mat_es = registration_number::text
where registration_number is not null
  and mat_es = lpad(registration_number::text, 5, '0');

alter table public.employment_contracts
  add constraint employment_contracts_mat_es_format
  check (mat_es is null or mat_es ~ '^[0-9]{1,5}$');
