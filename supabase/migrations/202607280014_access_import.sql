-- Importação transacional e idempotente dos bancos Access no Supabase.
create or replace function public.folha_import_access_registry(
  p_organization_id uuid,
  p_file_name text,
  p_companies jsonb,
  p_contracts jsonb,
  p_dependents jsonb,
  p_services jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_company_id uuid;
  v_person_id uuid;
  v_contract_id uuid;
  v_person_key text;
  v_cpf text;
  v_active boolean;
  v_registration bigint;
  v_target text;
  v_people integer := 0;
  v_contracts integer := 0;
  v_dependents integer := 0;
begin
  for r in select value from jsonb_array_elements(coalesce(p_companies,'[]'))
  loop
    insert into companies (
      organization_id, legacy_id, name, document, document_type, cei, city, state
    ) values (
      p_organization_id, (r->>'sourceId')::bigint, trim(r->>'name'),
      nullif(trim(r->>'document'),''), coalesce(nullif(r->>'documentType',''),'cnpj'),
      nullif(regexp_replace(coalesce(r->>'cei',''),'\D','','g'),''),
      nullif(trim(r->>'city'),''), nullif(upper(left(trim(r->>'state'),2)),'')
    )
    on conflict (organization_id, legacy_id) do update set
      name=excluded.name,
      document=coalesce(excluded.document,companies.document),
      document_type=excluded.document_type,
      cei=coalesce(excluded.cei,companies.cei),
      city=excluded.city,
      state=excluded.state;
  end loop;

  for r in select value from jsonb_array_elements(coalesce(p_contracts,'[]'))
  loop
    select id into v_company_id from companies
      where organization_id=p_organization_id
        and legacy_id=(r->>'companySourceId')::bigint;
    if v_company_id is null then continue; end if;

    v_cpf := regexp_replace(coalesce(r->>'cpf',''),'\D','','g');
    if length(v_cpf) <> 11 then v_cpf := null; end if;
    v_person_key := case when v_cpf is not null then 'CPF:'||v_cpf
      else 'LEGACY:'||(r->>'companySourceId')||':'||(r->>'sourceRegistration') end;

    select id into v_person_id from people
      where organization_id=p_organization_id
        and (person_key=v_person_key or (v_cpf is not null and cpf=v_cpf))
      order by (person_key=v_person_key) desc limit 1;
    if v_person_id is null then
      insert into people (
        organization_id, person_key, full_name, cpf, pis, birth_date,
        needs_review, sex, race_color, birth_city, birth_state, education,
        marital_status, address, district, city, state, postal_code,
        identity_number, identity_issuer, identity_state, identity_issue_date,
        voter_title_number, voter_zone, voter_section, ctps_number, ctps_series,
        ctps_issue_date, phone
      ) values (
        p_organization_id,v_person_key,trim(r->>'name'),v_cpf,
        nullif(regexp_replace(coalesce(r->>'pis',''),'\D','','g'),''),
        nullif(r->>'birthDate','')::date,v_cpf is null,
        coalesce(nullif(r->>'sex',''),'not_informed'),
        coalesce(nullif(r->>'raceColor',''),'not_informed'),
        nullif(trim(r->>'birthCity'),''),nullif(upper(left(r->>'birthState',2)),''),
        nullif(r->>'education',''),nullif(r->>'maritalStatus',''),
        nullif(trim(r->>'address'),''),nullif(trim(r->>'district'),''),
        nullif(trim(r->>'city'),''),nullif(upper(left(r->>'state',2)),''),
        nullif(regexp_replace(coalesce(r->>'postalCode',''),'\D','','g'),''),
        nullif(trim(r->>'identityNumber'),''),nullif(trim(r->>'identityIssuer'),''),
        nullif(upper(left(r->>'identityState',2)),''),
        nullif(r->>'identityIssueDate','')::date,nullif(trim(r->>'voterTitleNumber'),''),
        nullif(trim(r->>'voterZone'),''),nullif(trim(r->>'voterSection'),''),
        nullif(trim(split_part(coalesce(r->>'ctpsNumber',''), '/', 1)),''),
        coalesce(nullif(trim(r->>'ctpsSeries'),''),nullif(trim(split_part(coalesce(r->>'ctpsNumber',''), '/', 2)),'')),
        nullif(r->>'ctpsIssueDate','')::date,nullif(trim(r->>'phone'),'')
      ) returning id into v_person_id;
      v_people := v_people + 1;
    else
      update people set
        person_key=v_person_key, full_name=trim(r->>'name'),
        cpf=coalesce(v_cpf,cpf),
        pis=coalesce(nullif(regexp_replace(coalesce(r->>'pis',''),'\D','','g'),''),pis),
        birth_date=coalesce(nullif(r->>'birthDate','')::date,birth_date),
        needs_review=(v_cpf is null)
      where id=v_person_id;
    end if;

    v_active := coalesce((r->>'active')::boolean,false)
      and nullif(r->>'terminationDate','') is null;
    select id, registration_number into v_contract_id, v_registration
      from employment_contracts where company_id=v_company_id
        and legacy_registration=(r->>'sourceRegistration')::bigint;
    if v_contract_id is null then
      if v_active then
        select coalesce(max(registration_number),0)+1 into v_registration
          from employment_contracts where company_id=v_company_id;
      else v_registration := null; end if;
      insert into employment_contracts (
        organization_id,company_id,person_id,registration_number,
        legacy_registration,legacy_code,admission_date,termination_date,
        role_name,season_legacy_id,status
      ) values (
        p_organization_id,v_company_id,v_person_id,v_registration,
        (r->>'sourceRegistration')::bigint,
        case when v_active then null else
          'LEG-'||lpad(r->>'companySourceId',3,'0')||'-'||lpad(r->>'sourceRegistration',6,'0') end,
        nullif(r->>'admissionDate','')::date,nullif(r->>'terminationDate','')::date,
        nullif(trim(r->>'role'),''),nullif(r->>'seasonSourceId','')::bigint,
        case when v_active then 'active' else 'terminated' end
      ) returning id into v_contract_id;
    else
      update employment_contracts set person_id=v_person_id,
        admission_date=nullif(r->>'admissionDate','')::date,
        termination_date=nullif(r->>'terminationDate','')::date,
        role_name=nullif(trim(r->>'role'),''),
        season_legacy_id=nullif(r->>'seasonSourceId','')::bigint,
        status=case when v_active then 'active' else 'terminated' end
      where id=v_contract_id;
    end if;
    v_target := case when v_registration is not null then
      'MAT-'||lpad(v_registration::text,6,'0') else
      'LEG-'||lpad(r->>'companySourceId',3,'0')||'-'||lpad(r->>'sourceRegistration',6,'0') end;
    insert into legacy_contract_map (
      organization_id,company_id,legacy_registration,contract_id,target_code
    ) values (
      p_organization_id,v_company_id,(r->>'sourceRegistration')::bigint,
      v_contract_id,v_target
    ) on conflict (company_id,legacy_registration) do update set
      contract_id=excluded.contract_id,target_code=excluded.target_code;
    v_contracts := v_contracts + 1;
  end loop;

  for r in select value from jsonb_array_elements(coalesce(p_dependents,'[]'))
  loop
    select c.person_id into v_person_id from employment_contracts c
      join companies e on e.id=c.company_id
      where e.organization_id=p_organization_id
        and e.legacy_id=(r->>'companySourceId')::bigint
        and c.legacy_registration=(r->>'sourceRegistration')::bigint;
    if v_person_id is null or nullif(trim(r->>'name'),'') is null then continue; end if;
    v_cpf := regexp_replace(coalesce(r->>'cpf',''),'\D','','g');
    if length(v_cpf) <> 11 then
      v_cpf := 'LEGACY-DEP:'||(r->>'companySourceId')||':'||
        (r->>'sourceRegistration')||':'||(r->>'sourceId')||':'||
        coalesce(r->>'sourceDetailId','0');
    end if;
    insert into dependents (
      organization_id,person_id,dependent_type,name,cpf,birth_date
    ) values (
      p_organization_id,v_person_id,coalesce(nullif(r->>'dependentType',''),'other'),
      trim(r->>'name'),v_cpf,coalesce(nullif(r->>'birthDate','')::date,date '1900-01-01')
    ) on conflict (organization_id,cpf) do update set
      person_id=excluded.person_id,dependent_type=excluded.dependent_type,
      name=excluded.name,birth_date=excluded.birth_date;
    v_dependents := v_dependents + 1;
  end loop;

  for r in select value from jsonb_array_elements(coalesce(p_services,'[]'))
  loop
    insert into services (
      organization_id,legacy_id,description,group_legacy_id,unit_legacy_id,
      fgts_incidence,fgts_13_incidence,inss_incidence,inss_13_incidence,
      rais_incidence,formula_code,group_name,unit_name,affects_dsr,active
    ) values (
      p_organization_id,(r->>'sourceId')::bigint,trim(r->>'description'),
      nullif(r->>'groupSourceId','')::bigint,nullif(r->>'unitSourceId','')::bigint,
      coalesce((r->>'fgts')::boolean,false),coalesce((r->>'fgts13')::boolean,false),
      coalesce((r->>'inss')::boolean,false),coalesce((r->>'inss13')::boolean,false),
      coalesce((r->>'rais')::boolean,false),nullif(r->>'formulaCode',''),
      nullif(r->>'groupName',''),nullif(r->>'unitName',''),
      coalesce((r->>'affectsDsr')::boolean,false),coalesce((r->>'active')::boolean,true)
    ) on conflict (organization_id,legacy_id) do update set
      description=excluded.description,group_legacy_id=excluded.group_legacy_id,
      unit_legacy_id=excluded.unit_legacy_id,fgts_incidence=excluded.fgts_incidence,
      fgts_13_incidence=excluded.fgts_13_incidence,inss_incidence=excluded.inss_incidence,
      inss_13_incidence=excluded.inss_13_incidence,rais_incidence=excluded.rais_incidence,
      formula_code=excluded.formula_code,group_name=excluded.group_name,
      unit_name=excluded.unit_name,affects_dsr=excluded.affects_dsr,active=excluded.active;
  end loop;

  insert into import_runs (
    organization_id,file_name,companies_count,workers_count,services_count
  ) values (
    p_organization_id,left(coalesce(p_file_name,'Banco Access'),180),
    jsonb_array_length(coalesce(p_companies,'[]')),
    jsonb_array_length(coalesce(p_contracts,'[]')),
    jsonb_array_length(coalesce(p_services,'[]'))
  );
  return jsonb_build_object('ok',true,'imported',jsonb_build_object(
    'companies',jsonb_array_length(coalesce(p_companies,'[]')),
    'people',v_people,'contracts',v_contracts,
    'activeContracts',(select count(*) from jsonb_array_elements(coalesce(p_contracts,'[]')) x where coalesce((x->>'active')::boolean,false)),
    'services',jsonb_array_length(coalesce(p_services,'[]')),
    'dependents',v_dependents));
end;
$$;

create or replace function public.folha_import_access_history(
  p_organization_id uuid,
  p_entries jsonb
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  insert into daily_entries (
    organization_id,company_id,entry_date,contract_id,service_id,quantity,
    unit_price_cents,amount_cents,discount_cents,source_sequence,notes
  )
  select p_organization_id,c.company_id,(x->>'entryDate')::date,c.id,s.id,
    (x->>'quantity')::numeric,(x->>'unitPriceCents')::bigint,
    (x->>'amountCents')::bigint,(x->>'discountCents')::bigint,
    (x->>'sourceSequence')::bigint,'Importado do Access'
  from jsonb_array_elements(coalesce(p_entries,'[]')) x
  join companies co on co.organization_id=p_organization_id
    and co.legacy_id=(x->>'companySourceId')::bigint
  join employment_contracts c on c.company_id=co.id
    and c.legacy_registration=(x->>'sourceRegistration')::bigint
  join services s on s.organization_id=p_organization_id
    and s.legacy_id=(x->>'serviceSourceId')::bigint
  on conflict (organization_id,company_id,entry_date,contract_id,service_id)
  do update set quantity=excluded.quantity,unit_price_cents=excluded.unit_price_cents,
    amount_cents=excluded.amount_cents,discount_cents=excluded.discount_cents,
    source_sequence=excluded.source_sequence,notes=excluded.notes;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.folha_import_access_registry(uuid,text,jsonb,jsonb,jsonb,jsonb) from public;
revoke all on function public.folha_import_access_history(uuid,jsonb) from public;
grant execute on function public.folha_import_access_registry(uuid,text,jsonb,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.folha_import_access_history(uuid,jsonb) to service_role;
