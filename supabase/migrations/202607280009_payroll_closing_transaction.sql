-- Persiste o fechamento calculado pela API em uma única operação validada.
create or replace function public.folha_save_payroll_closing(
  p_organization_id uuid,
  p_company_legacy_id bigint,
  p_competence text,
  p_period_type text,
  p_totals jsonb
)
returns table(ok boolean, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if p_competence !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Competência inválida.';
  end if;
  if p_period_type not in ('advance', 'monthly') then
    raise exception 'Período de fechamento inválido.';
  end if;
  if p_totals is null or jsonb_typeof(p_totals) <> 'object' then
    raise exception 'Memória de cálculo inválida.';
  end if;

  select id into v_company_id
  from public.companies
  where organization_id = p_organization_id
    and legacy_id = p_company_legacy_id;
  if v_company_id is null then
    raise exception 'Empresa não encontrada.';
  end if;

  insert into public.payroll_closings (
    organization_id,
    company_id,
    competence,
    period_type,
    status,
    totals
  )
  values (
    p_organization_id,
    v_company_id,
    p_competence,
    p_period_type,
    'closed',
    p_totals
  )
  on conflict (organization_id, company_id, competence, period_type)
  do update set
    status = 'closed',
    totals = excluded.totals;

  return query
    select true, 'Folha fechada e memória de cálculo registrada.'::text;
end;
$$;

revoke all on function public.folha_save_payroll_closing(
  uuid, bigint, text, text, jsonb
) from public;
grant execute on function public.folha_save_payroll_closing(
  uuid, bigint, text, text, jsonb
) to service_role;
