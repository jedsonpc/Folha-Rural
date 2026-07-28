-- Escopo de empresas dos lotes e operações transacionais de RH.
alter table public.salary_adjustment_batches
  add column if not exists company_legacy_ids bigint[] not null default '{}';

create or replace function public.folha_save_hr(
  p_organization_id uuid,
  p_company_legacy_ids bigint[],
  p_payload jsonb
)
returns table(
  ok boolean,
  message text,
  affected integer,
  batch_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := coalesce(p_payload->>'action', '');
  v_contract_id uuid;
  v_profile record;
  v_salary bigint;
  v_daily bigint;
  v_effective date;
  v_batch_id uuid;
  v_function_ids uuid[] := '{}';
  v_company_scope bigint[] := coalesce(p_company_legacy_ids, '{}');
  v_count integer := 0;
  v_row record;
  v_next bigint;
begin
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Dados de RH inválidos.';
  end if;

  if v_action in ('saveProfile', 'saveVacation') then
    begin
      v_contract_id := (p_payload->>'contractId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Colaborador inválido.';
    end;
    if not exists (
      select 1
      from public.employment_contracts contract
      join public.companies company on company.id = contract.company_id
      where contract.id = v_contract_id
        and contract.organization_id = p_organization_id
        and (
          p_company_legacy_ids is null
          or company.legacy_id = any(p_company_legacy_ids)
        )
    ) then
      raise exception 'Colaborador não encontrado ou sem acesso.';
    end if;
  end if;

  if v_action = 'saveProfile' then
    v_salary := greatest(0, coalesce((p_payload->>'baseSalaryCents')::bigint, 0));
    v_daily := greatest(0, coalesce((p_payload->>'dailyRateCents')::bigint, round(v_salary / 30.0)));
    if v_salary = 0 then raise exception 'Informe o salário-base.'; end if;

    insert into public.worker_payroll_profiles (
      organization_id, contract_id, salary_type, base_salary_cents,
      daily_rate_cents, advance_rate_basis_points, updated_at
    )
    values (
      p_organization_id, v_contract_id,
      case when p_payload->>'salaryType' = 'daily' then 'daily' else 'monthly' end,
      v_salary, v_daily,
      greatest(0, coalesce((p_payload->>'advanceRateBasisPoints')::integer, 4000)),
      now()
    )
    on conflict (organization_id, contract_id)
    do update set
      salary_type = excluded.salary_type,
      base_salary_cents = excluded.base_salary_cents,
      daily_rate_cents = excluded.daily_rate_cents,
      advance_rate_basis_points = excluded.advance_rate_basis_points,
      updated_at = now();

    if coalesce(p_payload->>'effectiveDate', '') ~ '^\d{4}-\d{2}-\d{2}$' then
      insert into public.salary_history (
        organization_id, contract_id, effective_date, salary_cents,
        reason, source
      )
      values (
        p_organization_id, v_contract_id,
        (p_payload->>'effectiveDate')::date, v_salary,
        coalesce(nullif(trim(p_payload->>'reason'), ''), 'Cadastro/alteração salarial'),
        'individual'
      );
    end if;
    return query select true, 'Registro salvo com sucesso.'::text, 1, null::uuid;
    return;
  end if;

  if v_action = 'saveVacation' then
    begin
      insert into public.vacation_periods (
        organization_id, contract_id, accrual_start, accrual_end,
        concession_deadline, scheduled_start, scheduled_end, days, sold_days,
        payment_date, status, notes, settled_at
      )
      values (
        p_organization_id, v_contract_id,
        (p_payload->>'accrualStart')::date,
        (p_payload->>'accrualEnd')::date,
        (p_payload->>'concessionDeadline')::date,
        nullif(p_payload->>'scheduledStart', '')::date,
        nullif(p_payload->>'scheduledEnd', '')::date,
        greatest(1, coalesce((p_payload->>'days')::integer, 30)),
        greatest(0, coalesce((p_payload->>'soldDays')::integer, 0)),
        nullif(p_payload->>'paymentDate', '')::date,
        case
          when p_payload->>'status' in ('pending','scheduled','taken','paid')
            then p_payload->>'status'
          else 'pending'
        end,
        coalesce(p_payload->>'notes', ''),
        case when p_payload->>'status' = 'paid' then now() else null end
      );
    exception when invalid_datetime_format then
      raise exception 'Informe o período aquisitivo e o prazo concessivo.';
    end;
    return query select true, 'Registro salvo com sucesso.'::text, 1, null::uuid;
    return;
  end if;

  if v_action = 'saveReference' then
    begin
      v_effective := (p_payload->>'effectiveDate')::date;
    exception when invalid_datetime_format then
      raise exception 'Informe data e valor.';
    end;
    v_salary := greatest(0, coalesce((p_payload->>'valueCents')::bigint, 0));
    if v_salary = 0 then raise exception 'Informe data e valor.'; end if;
    insert into public.salary_references (
      organization_id, reference_type, effective_date, value_cents, notes
    )
    values (
      p_organization_id,
      case when p_payload->>'referenceType' = 'category' then 'category' else 'national' end,
      v_effective, v_salary, coalesce(p_payload->>'notes', '')
    );
    return query select true, 'Registro salvo com sucesso.'::text, 1, null::uuid;
    return;
  end if;

  if v_action = 'delete' and p_payload->>'entity' = 'reference' then
    delete from public.salary_references
    where organization_id = p_organization_id
      and id = (p_payload->>'id')::uuid;
    get diagnostics v_count = row_count;
    if v_count = 0 then raise exception 'Referência salarial não encontrada.'; end if;
    return query select true, 'Registro excluído.'::text, v_count, null::uuid;
    return;
  end if;

  if v_action = 'applyAdjustment' then
    begin
      v_effective := (p_payload->>'effectiveDate')::date;
      select coalesce(array_agg(value::uuid), '{}')
      into v_function_ids
      from jsonb_array_elements_text(coalesce(p_payload->'functionIds', '[]'::jsonb));
    exception when invalid_datetime_format or invalid_text_representation then
      raise exception 'Data, valor ou funções do reajuste são inválidos.';
    end;
    if coalesce((p_payload->>'valueStored')::bigint, 0) = 0 then
      raise exception 'Informe a data e o valor do reajuste.';
    end if;

    insert into public.salary_adjustment_batches (
      organization_id, effective_date, mode, value, reason, function_ids,
      company_legacy_ids, status
    )
    values (
      p_organization_id, v_effective,
      case when p_payload->>'mode' = 'percentage' then 'percentage' else 'value' end,
      (p_payload->>'valueStored')::bigint,
      coalesce(p_payload->>'reason', ''),
      v_function_ids, v_company_scope, 'applied'
    )
    returning id into v_batch_id;

    for v_row in
      select profile.contract_id, profile.base_salary_cents
      from public.worker_payroll_profiles profile
      join public.employment_contracts contract on contract.id = profile.contract_id
      join public.companies company on company.id = contract.company_id
      left join public.job_functions function on
        function.organization_id = contract.organization_id
        and contract.role_name = coalesce(
          nullif(function.local_description, ''),
          function.official_description
        )
      where profile.organization_id = p_organization_id
        and contract.status = 'active'
        and (
          p_company_legacy_ids is null
          or company.legacy_id = any(p_company_legacy_ids)
        )
        and (
          cardinality(v_function_ids) = 0
          or function.id = any(v_function_ids)
        )
    loop
      v_next := case
        when p_payload->>'mode' = 'percentage' then
          round(v_row.base_salary_cents * (
            1 + ((p_payload->>'valueStored')::numeric / 10000)
          ))
        else (p_payload->>'valueStored')::bigint
      end;
      insert into public.salary_history (
        organization_id, contract_id, effective_date, salary_cents,
        reason, source, adjustment_batch_id
      )
      values (
        p_organization_id, v_row.contract_id, v_effective, v_next,
        coalesce(nullif(trim(p_payload->>'reason'), ''), 'Reajuste salarial'),
        'batch', v_batch_id
      );
      if coalesce((p_payload->>'updateProfiles')::boolean, true) then
        update public.worker_payroll_profiles
        set base_salary_cents = v_next,
            daily_rate_cents = round(v_next / 30.0),
            updated_at = now()
        where organization_id = p_organization_id
          and contract_id = v_row.contract_id;
      end if;
      v_count := v_count + 1;
    end loop;

    if v_count = 0 then
      delete from public.salary_adjustment_batches
      where id = v_batch_id and organization_id = p_organization_id;
      raise exception 'Nenhum colaborador ativo com salário cadastrado atende ao filtro.';
    end if;
    return query
      select true,
        format('Reajuste aplicado a %s colaborador(es).', v_count),
        v_count, v_batch_id;
    return;
  end if;

  if v_action = 'undoAdjustment' then
    begin
      v_effective := (p_payload->>'effectiveDate')::date;
    exception when invalid_datetime_format then
      raise exception 'Informe a data do reajuste.';
    end;

    for v_row in
      select id
      from public.salary_adjustment_batches
      where organization_id = p_organization_id
        and effective_date = v_effective
        and status = 'applied'
        and (
          p_company_legacy_ids is null
          or (
            cardinality(company_legacy_ids) > 0
            and company_legacy_ids <@ p_company_legacy_ids
          )
        )
    loop
      for v_profile in
        select distinct contract_id
        from public.salary_history
        where organization_id = p_organization_id
          and adjustment_batch_id = v_row.id
      loop
        delete from public.salary_history
        where organization_id = p_organization_id
          and adjustment_batch_id = v_row.id
          and contract_id = v_profile.contract_id;

        select salary_cents into v_salary
        from public.salary_history
        where organization_id = p_organization_id
          and contract_id = v_profile.contract_id
        order by effective_date desc, created_at desc
        limit 1;
        if v_salary is not null then
          update public.worker_payroll_profiles
          set base_salary_cents = v_salary,
              daily_rate_cents = round(v_salary / 30.0),
              updated_at = now()
          where organization_id = p_organization_id
            and contract_id = v_profile.contract_id;
        end if;
      end loop;
      update public.salary_adjustment_batches
      set status = 'undone'
      where id = v_row.id and organization_id = p_organization_id;
      v_count := v_count + 1;
    end loop;

    if v_count = 0 then
      raise exception 'Nenhum reajuste aplicado nessa data.';
    end if;
    return query
      select true, format('%s reajuste(s) desfeito(s).', v_count),
        v_count, null::uuid;
    return;
  end if;

  raise exception 'Ação de RH inválida.';
end;
$$;

revoke all on function public.folha_save_hr(uuid, bigint[], jsonb)
  from public;
grant execute on function public.folha_save_hr(uuid, bigint[], jsonb)
  to service_role;
