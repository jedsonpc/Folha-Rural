-- Atualiza as tabelas oficiais versionadas em uma única operação.
create or replace function public.folha_sync_tax_brackets(
  p_organization_id uuid,
  p_rows jsonb
)
returns table(ok boolean, message text, affected integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Tabelas oficiais inválidas.';
  end if;

  for v_row in
    select *
    from jsonb_to_recordset(p_rows) as x(
      "taxType" text,
      "effectiveFrom" date,
      "lowerCents" bigint,
      "upperCents" bigint,
      "rateBasisPoints" integer,
      "deductionCents" bigint,
      "sourceName" text,
      "sourceUrl" text,
      "officialUpdatedAt" timestamptz
    )
  loop
    if v_row."taxType" not in ('INSS', 'IRRF', 'SALARY_FAMILY')
       or v_row."effectiveFrom" is null
       or v_row."lowerCents" is null
       or v_row."rateBasisPoints" is null
       or coalesce(v_row."sourceUrl", '') !~ '^https://www\.gov\.br/' then
      raise exception 'Parâmetro oficial inválido.';
    end if;

    insert into public.tax_brackets (
      organization_id,
      tax_type,
      effective_from,
      lower_cents,
      upper_cents,
      rate_basis_points,
      deduction_cents,
      source_name,
      source_url,
      official_updated_at
    )
    values (
      p_organization_id,
      v_row."taxType",
      v_row."effectiveFrom",
      v_row."lowerCents",
      v_row."upperCents",
      v_row."rateBasisPoints",
      coalesce(v_row."deductionCents", 0),
      v_row."sourceName",
      v_row."sourceUrl",
      v_row."officialUpdatedAt"
    )
    on conflict (organization_id, tax_type, effective_from, lower_cents)
    do update set
      upper_cents = excluded.upper_cents,
      rate_basis_points = excluded.rate_basis_points,
      deduction_cents = excluded.deduction_cents,
      source_name = excluded.source_name,
      source_url = excluded.source_url,
      official_updated_at = excluded.official_updated_at;

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Nenhuma faixa oficial foi informada.';
  end if;

  return query
    select true, 'Tabelas oficiais conferidas e atualizadas.'::text, v_count;
end;
$$;

revoke all on function public.folha_sync_tax_brackets(uuid, jsonb)
  from public;
grant execute on function public.folha_sync_tax_brackets(uuid, jsonb)
  to service_role;
