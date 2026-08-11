create or replace function public.folha_set_contract_mat_es(
  p_organization_id uuid,
  p_contract_id uuid,
  p_mat_es text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mat_es text := regexp_replace(coalesce(p_mat_es, ''), '\D', '', 'g');
  v_saved text;
begin
  if v_mat_es !~ '^[0-9]{1,5}$' then
    raise exception 'A Matrícula no eSocial deve ter de 1 a 5 algarismos.';
  end if;

  update public.employment_contracts
  set mat_es = v_mat_es
  where id = p_contract_id
    and organization_id = p_organization_id
  returning mat_es into v_saved;

  if v_saved is null then
    raise exception 'Contrato não encontrado para salvar a Matrícula no eSocial.';
  end if;
  return v_saved;
end;
$$;

revoke all on function public.folha_set_contract_mat_es(uuid, uuid, text) from public;
grant execute on function public.folha_set_contract_mat_es(uuid, uuid, text) to service_role;
