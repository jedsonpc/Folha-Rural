-- Compatibilidade dos centros de custo legados e cadastros auxiliares de RH.
alter table public.cost_centers
  add column if not exists legacy_id bigint;

with matches as (
  select center.id, min(service.group_legacy_id) as legacy_id
  from public.cost_centers center
  join public.services service
    on service.organization_id = center.organization_id
   and lower(trim(coalesce(service.group_name, ''))) =
       lower(trim(center.description))
  where service.group_legacy_id is not null
  group by center.id
)
update public.cost_centers center
set legacy_id = matches.legacy_id
from matches
where center.id = matches.id and center.legacy_id is null;

with duplicates as (
  select id, row_number() over (
    partition by organization_id, legacy_id order by created_at, id
  ) as position
  from public.cost_centers
  where legacy_id is not null
)
update public.cost_centers center
set legacy_id = null
from duplicates
where center.id = duplicates.id and duplicates.position > 1;

with maxima as (
  select organization_id, coalesce(max(legacy_id), 0) as maximum
  from public.cost_centers
  group by organization_id
),
pending as (
  select center.id,
    maxima.maximum + row_number() over (
      partition by center.organization_id order by center.created_at, center.id
    ) as legacy_id
  from public.cost_centers center
  join maxima on maxima.organization_id = center.organization_id
  where center.legacy_id is null
)
update public.cost_centers center
set legacy_id = pending.legacy_id
from pending
where center.id = pending.id;

alter table public.cost_centers
  alter column legacy_id set not null;

create unique index if not exists cost_centers_organization_legacy_idx
  on public.cost_centers (organization_id, legacy_id);

create or replace function public.folha_save_auxiliary_hr(
  p_organization_id uuid,
  p_company_legacy_ids bigint[],
  p_payload jsonb
)
returns table(ok boolean, message text, affected integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := coalesce(p_payload->>'action', '');
  v_entity text := coalesce(p_payload->>'entity', '');
  v_id uuid;
  v_legacy_id bigint;
  v_contract_id uuid;
  v_item_id uuid;
  v_count integer := 0;
begin
  if v_action = 'saveCenter' then
    if trim(coalesce(p_payload->>'description', '')) = '' then
      raise exception 'Informe a descrição.';
    end if;
    v_legacy_id := nullif(p_payload->>'id', '')::bigint;
    if v_legacy_id is null then
      select coalesce(max(legacy_id), 0) + 1 into v_legacy_id
      from public.cost_centers
      where organization_id = p_organization_id;
      insert into public.cost_centers (
        organization_id, legacy_id, description, active
      )
      values (
        p_organization_id, v_legacy_id,
        trim(p_payload->>'description'),
        coalesce((p_payload->>'active')::boolean, true)
      );
    else
      update public.cost_centers
      set description = trim(p_payload->>'description'),
          active = coalesce((p_payload->>'active')::boolean, true)
      where organization_id = p_organization_id
        and legacy_id = v_legacy_id;
      get diagnostics v_count = row_count;
      if v_count = 0 then raise exception 'Centro de custo não encontrado.'; end if;
    end if;
    return query select true, 'Registro salvo com sucesso.'::text, 1;
    return;
  end if;

  if v_action = 'saveItem' then
    if trim(coalesce(p_payload->>'description', '')) = '' then
      raise exception 'Informe a descrição.';
    end if;
    if nullif(p_payload->>'id', '') is not null then
      begin v_id := (p_payload->>'id')::uuid;
      exception when invalid_text_representation then
        raise exception 'Item inválido.';
      end;
    end if;
    if v_id is null then
      insert into public.safety_items (
        organization_id, item_type, description, supplier, ca, active
      )
      values (
        p_organization_id,
        case when p_payload->>'itemType' = 'tool' then 'tool' else 'epi' end,
        trim(p_payload->>'description'),
        nullif(trim(p_payload->>'supplier'), ''),
        nullif(trim(p_payload->>'ca'), ''),
        coalesce((p_payload->>'active')::boolean, true)
      );
    else
      update public.safety_items
      set description = trim(p_payload->>'description'),
          supplier = nullif(trim(p_payload->>'supplier'), ''),
          ca = nullif(trim(p_payload->>'ca'), ''),
          active = coalesce((p_payload->>'active')::boolean, true)
      where organization_id = p_organization_id and id = v_id;
      get diagnostics v_count = row_count;
      if v_count = 0 then raise exception 'Item não encontrado.'; end if;
    end if;
    return query select true, 'Registro salvo com sucesso.'::text, 1;
    return;
  end if;

  if v_action = 'issueItem' then
    begin
      v_item_id := (p_payload->>'itemId')::uuid;
      v_contract_id := (p_payload->>'contractId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Item ou colaborador inválido.';
    end;
    if not exists (
      select 1 from public.safety_items
      where organization_id = p_organization_id
        and id = v_item_id and active
    ) then raise exception 'Item não encontrado ou inativo.'; end if;
    if not exists (
      select 1
      from public.employment_contracts contract
      join public.companies company on company.id = contract.company_id
      where contract.organization_id = p_organization_id
        and contract.id = v_contract_id
        and contract.status = 'active'
        and (
          p_company_legacy_ids is null
          or company.legacy_id = any(p_company_legacy_ids)
        )
    ) then raise exception 'Colaborador não encontrado ou sem acesso.'; end if;

    insert into public.item_issues (
      organization_id, item_id, contract_id, issue_date, quantity,
      return_due_date, condition_notes, employee_acknowledged
    )
    values (
      p_organization_id, v_item_id, v_contract_id,
      (p_payload->>'issueDate')::date,
      greatest(0.0001, coalesce((p_payload->>'quantity')::numeric, 1)),
      nullif(p_payload->>'returnDueDate', '')::date,
      coalesce(p_payload->>'notes', ''),
      coalesce((p_payload->>'acknowledged')::boolean, false)
    );
    return query select true, 'Fornecimento registrado com sucesso.'::text, 1;
    return;
  end if;

  if v_action = 'delete' and v_entity = 'center' then
    v_legacy_id := nullif(p_payload->>'id', '')::bigint;
    if exists (
      select 1 from public.services
      where organization_id = p_organization_id
        and group_legacy_id = v_legacy_id
    ) then
      raise exception 'O registro possui vínculos e não pode ser excluído.';
    end if;
    delete from public.cost_centers
    where organization_id = p_organization_id
      and legacy_id = v_legacy_id;
    get diagnostics v_count = row_count;
    if v_count = 0 then raise exception 'Centro de custo não encontrado.'; end if;
    return query select true, 'Registro excluído.'::text, v_count;
    return;
  end if;

  if v_action = 'delete' and v_entity = 'item' then
    begin v_item_id := (p_payload->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Item inválido.';
    end;
    if exists (
      select 1 from public.item_issues
      where organization_id = p_organization_id and item_id = v_item_id
    ) then
      raise exception 'O registro possui vínculos e não pode ser excluído.';
    end if;
    delete from public.safety_items
    where organization_id = p_organization_id and id = v_item_id;
    get diagnostics v_count = row_count;
    if v_count = 0 then raise exception 'Item não encontrado.'; end if;
    return query select true, 'Registro excluído.'::text, v_count;
    return;
  end if;

  raise exception 'Ação de cadastro auxiliar inválida.';
end;
$$;

revoke all on function public.folha_save_auxiliary_hr(
  uuid, bigint[], jsonb
) from public;
grant execute on function public.folha_save_auxiliary_hr(
  uuid, bigint[], jsonb
) to service_role;
