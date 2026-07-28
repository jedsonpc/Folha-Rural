-- Cadastro transacional de sindicatos e histórico de contribuições.
create or replace function public.folha_save_union(
  p_organization_id uuid,
  p_payload jsonb
)
returns table(ok boolean, message text, union_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := coalesce(p_payload->>'action', 'save');
  v_id uuid;
  v_code text;
  v_cnpj text;
  v_description text;
  v_contribution bigint;
  v_effective_from date;
  v_duplicate record;
  v_has_processed_discount boolean;
begin
  if nullif(p_payload->>'id', '') is not null then
    begin
      v_id := (p_payload->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Identificador do sindicato inválido.';
    end;
  end if;

  if v_action = 'delete' then
    if v_id is null then
      raise exception 'Identificador do sindicato inválido.';
    end if;
    if not exists (
      select 1 from public.unions
      where id = v_id and organization_id = p_organization_id
    ) then
      raise exception 'Sindicato não encontrado.';
    end if;

    select exists (
      select 1
      from public.payroll_closings closing
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(closing.totals->'rows') = 'array'
            then closing.totals->'rows'
          else '[]'::jsonb
        end
      ) item
      where closing.organization_id = p_organization_id
        and coalesce(
          case
            when coalesce(item->>'union', '') ~ '^[0-9]+(\.[0-9]+)?$'
              then (item->>'union')::numeric
            else 0
          end,
          0
        ) > 0
        and (
          item->>'unionId' = v_id::text
          or coalesce(item->>'unionId', '') !~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        )
    ) into v_has_processed_discount;

    if v_has_processed_discount then
      raise exception 'Não é possível excluir: existem descontos processados para este sindicato. Inative o cadastro para preservar o histórico.';
    end if;

    update public.employment_contracts
    set union_member = false, union_id = null
    where organization_id = p_organization_id and union_id = v_id;

    delete from public.union_contribution_rates
    where organization_id = p_organization_id and union_id = v_id;

    delete from public.unions
    where organization_id = p_organization_id and id = v_id;

    return query select true, 'Sindicato excluído.'::text, v_id;
    return;
  end if;

  if v_action <> 'save' then
    raise exception 'Ação inválida.';
  end if;

  v_code := upper(trim(coalesce(p_payload->>'code', '')));
  v_cnpj := regexp_replace(coalesce(p_payload->>'cnpj', ''), '[^0-9]', '', 'g');
  v_description := trim(coalesce(p_payload->>'description', ''));
  v_contribution := greatest(
    0,
    coalesce((p_payload->>'contributionCents')::bigint, 0)
  );

  if v_code = '' or v_description = '' or v_cnpj !~ '^[0-9]{14}$' then
    raise exception 'Informe código, CNPJ válido e descrição do sindicato.';
  end if;
  if v_id is not null and not exists (
    select 1 from public.unions
    where id = v_id and organization_id = p_organization_id
  ) then
    raise exception 'Sindicato não encontrado.';
  end if;

  select id, code, cnpj into v_duplicate
  from public.unions
  where organization_id = p_organization_id
    and (v_id is null or id <> v_id)
    and (code = v_code or cnpj = v_cnpj)
  limit 1;
  if v_duplicate.id is not null then
    if v_duplicate.code = v_code then
      raise exception 'O código % já pertence a outro sindicato.', v_code;
    end if;
    raise exception 'Este CNPJ já está cadastrado em outro sindicato.';
  end if;

  if v_contribution > 0 then
    begin
      v_effective_from := (p_payload->>'effectiveFrom')::date;
    exception when invalid_datetime_format then
      raise exception 'Informe a data de início do valor mensal.';
    end;
    if v_effective_from is null then
      raise exception 'Informe a data de início do valor mensal.';
    end if;
  end if;

  if v_id is null then
    insert into public.unions (
      organization_id, code, cnpj, description, legal_name, trade_name,
      registration_status, email, phone, postal_code, address, address_number,
      address_complement, district, city, state, cnpj_checked_at,
      contribution_cents, active
    )
    values (
      p_organization_id, v_code, v_cnpj, v_description,
      nullif(p_payload->>'legalName', ''),
      nullif(p_payload->>'tradeName', ''),
      nullif(p_payload->>'registrationStatus', ''),
      nullif(p_payload->>'email', ''),
      nullif(p_payload->>'phone', ''),
      nullif(p_payload->>'postalCode', ''),
      nullif(p_payload->>'address', ''),
      nullif(p_payload->>'addressNumber', ''),
      nullif(p_payload->>'addressComplement', ''),
      nullif(p_payload->>'district', ''),
      nullif(p_payload->>'city', ''),
      nullif(p_payload->>'state', ''),
      nullif(p_payload->>'cnpjCheckedAt', '')::timestamptz,
      v_contribution,
      coalesce((p_payload->>'active')::boolean, true)
    )
    returning id into v_id;
  else
    update public.unions
    set
      code = v_code,
      cnpj = v_cnpj,
      description = v_description,
      legal_name = nullif(p_payload->>'legalName', ''),
      trade_name = nullif(p_payload->>'tradeName', ''),
      registration_status = nullif(p_payload->>'registrationStatus', ''),
      email = nullif(p_payload->>'email', ''),
      phone = nullif(p_payload->>'phone', ''),
      postal_code = nullif(p_payload->>'postalCode', ''),
      address = nullif(p_payload->>'address', ''),
      address_number = nullif(p_payload->>'addressNumber', ''),
      address_complement = nullif(p_payload->>'addressComplement', ''),
      district = nullif(p_payload->>'district', ''),
      city = nullif(p_payload->>'city', ''),
      state = nullif(p_payload->>'state', ''),
      cnpj_checked_at = nullif(p_payload->>'cnpjCheckedAt', '')::timestamptz,
      contribution_cents = v_contribution,
      active = coalesce((p_payload->>'active')::boolean, true)
    where id = v_id and organization_id = p_organization_id;
  end if;

  if v_contribution > 0 then
    insert into public.union_contribution_rates (
      organization_id, union_id, effective_from, contribution_cents
    )
    values (
      p_organization_id, v_id, v_effective_from, v_contribution
    )
    on conflict (organization_id, union_id, effective_from)
    do update set contribution_cents = excluded.contribution_cents;
  end if;

  return query select true, 'Sindicato salvo com sucesso.'::text, v_id;
end;
$$;

revoke all on function public.folha_save_union(uuid, jsonb) from public;
grant execute on function public.folha_save_union(uuid, jsonb) to service_role;
