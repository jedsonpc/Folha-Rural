-- Operações atômicas do módulo Apontamentos.
create or replace function public.folha_save_launches(
  p_organization_id uuid,
  p_company_legacy_id bigint,
  p_payload jsonb
)
returns table(ok boolean, message text, affected integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_action text := coalesce(p_payload->>'action','');
  v_date date;
  v_contract_id uuid;
  v_service_id uuid;
  v_quantity numeric(18,4);
  v_unit bigint;
  v_row jsonb;
  v_count integer := 0;
  v_source date;
  v_target date;
begin
  select id into v_company_id
  from public.companies
  where organization_id = p_organization_id
    and legacy_id = p_company_legacy_id;
  if v_company_id is null then raise exception 'Empresa não encontrada.'; end if;

  if v_action in ('save','saveBatch') then
    v_date := (p_payload->>'entryDate')::date;
    for v_row in
      select value from jsonb_array_elements(
        case when v_action='saveBatch' then coalesce(p_payload->'rows','[]'::jsonb)
             else jsonb_build_array(p_payload) end
      )
    loop
      v_contract_id := (v_row->>'contractId')::uuid;
      v_service_id := (v_row->>'serviceId')::uuid;
      v_quantity := (v_row->>'quantity')::numeric;
      v_unit := round((v_row->>'unitPrice')::numeric * 100);
      if v_quantity <= 0 or v_unit < 0 then continue; end if;
      if not exists (
        select 1 from public.employment_contracts
        where id=v_contract_id and organization_id=p_organization_id
          and company_id=v_company_id
      ) then raise exception 'Colaborador não pertence à empresa selecionada.'; end if;
      if not exists (
        select 1 from public.services
        where id=v_service_id and organization_id=p_organization_id and active
      ) then raise exception 'Serviço inválido ou inativo.'; end if;

      insert into public.daily_entries (
        organization_id,company_id,entry_date,contract_id,service_id,
        quantity,unit_price_cents,amount_cents,notes
      ) values (
        p_organization_id,v_company_id,v_date,v_contract_id,v_service_id,
        v_quantity,v_unit,round(v_quantity*v_unit),
        nullif(trim(v_row->>'notes'),'')
      )
      on conflict (organization_id,company_id,entry_date,contract_id,service_id)
      do update set quantity=excluded.quantity,
        unit_price_cents=excluded.unit_price_cents,
        amount_cents=excluded.amount_cents,notes=excluded.notes;
      v_count := v_count + 1;
    end loop;
    return query select true,
      case when v_count=1 then 'Lançamento salvo.'
           else v_count || ' apontamentos salvos na tabela.' end,
      v_count;
    return;
  end if;

  if v_action='delete' then
    delete from public.daily_entries
    where id=(p_payload->>'id')::uuid and organization_id=p_organization_id
      and company_id=v_company_id;
    get diagnostics v_count = row_count;
    return query select true,'Lançamento excluído.',v_count;
    return;
  end if;

  if v_action='holiday' then
    insert into public.holidays (
      organization_id,company_id,holiday_date,name
    ) values (
      p_organization_id,v_company_id,(p_payload->>'holidayDate')::date,
      trim(p_payload->>'name')
    )
    on conflict (organization_id,company_id,holiday_date)
    do update set name=excluded.name;
    return query select true,'Feriado registrado.',1;
    return;
  end if;

  if v_action='deleteHoliday' then
    delete from public.holidays
    where id=(p_payload->>'id')::uuid and organization_id=p_organization_id
      and company_id=v_company_id;
    get diagnostics v_count = row_count;
    return query select true,'Feriado excluído.',v_count;
    return;
  end if;

  if v_action='clone' then
    v_source := (p_payload->>'sourceDate')::date;
    v_target := (p_payload->>'targetDate')::date;
    if v_source=v_target then raise exception 'Informe duas datas diferentes.'; end if;
    if exists (
      select 1 from public.daily_entries
      where organization_id=p_organization_id and company_id=v_company_id
        and entry_date=v_target
    ) then raise exception 'O dia de destino já possui lançamentos. Nada foi alterado.'; end if;
    insert into public.daily_entries (
      organization_id,company_id,entry_date,contract_id,service_id,quantity,
      unit_price_cents,amount_cents,discount_cents,notes,cloned_from_id
    )
    select organization_id,company_id,v_target,contract_id,service_id,quantity,
      unit_price_cents,amount_cents,discount_cents,notes,id
    from public.daily_entries
    where organization_id=p_organization_id and company_id=v_company_id
      and entry_date=v_source;
    get diagnostics v_count = row_count;
    if v_count=0 then raise exception 'O dia de origem não possui lançamentos.'; end if;
    return query select true,v_count || ' lançamentos clonados.',v_count;
    return;
  end if;

  raise exception 'Ação inválida.';
end;
$$;

revoke all on function public.folha_save_launches(uuid,bigint,jsonb) from public;
grant execute on function public.folha_save_launches(uuid,bigint,jsonb) to service_role;
