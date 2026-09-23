alter table public.people
  add column if not exists labor_claim_date date,
  add column if not exists labor_claim_result text;

comment on column public.people.labor_claim_date is
  'Data do processo ou reclamação trabalhista informada no cadastro.';

comment on column public.people.labor_claim_result is
  'Resultado ou observações do processo trabalhista.';
