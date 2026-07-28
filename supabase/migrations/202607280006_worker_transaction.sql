-- Gravação atômica de pessoa + contrato + dependentes para a API Vercel.
-- Funções PostgreSQL executam em uma única transação: qualquer erro desfaz tudo.

create or replace function public.folha_save_worker(
  p_organization_id uuid,
  p_payload jsonb
)
returns table(ok boolean, message text, contract_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation text := coalesce(p_payload->>'operation', '');
  v_person_id uuid;
  v_contract_id uuid;
  v_company_id uuid;
  v_company_legacy bigint;
  v_registration bigint;
  v_legacy_registration bigint;
  v_cpf text := regexp_replace(coalesce(p_payload->>'cpf',''), '\D', '', 'g');
  v_name text := trim(coalesce(p_payload->>'name',''));
  v_admission date;
  v_dependent jsonb;
begin
  if v_operation = 'update' then
    v_person_id := (p_payload->>'personId')::uuid;
    v_contract_id := (p_payload->>'contractId')::uuid;

    if not exists (
      select 1
      from public.employment_contracts c
      where c.id = v_contract_id
        and c.person_id = v_person_id
        and c.organization_id = p_organization_id
    ) then
      raise exception 'Cadastro ou contrato não encontrado.';
    end if;

    if p_payload->>'action' = 'terminate' then
      update public.employment_contracts
      set termination_date = (p_payload->>'terminationDate')::date,
          status = 'terminated'
      where id = v_contract_id and organization_id = p_organization_id;
      return query select true, 'Contrato encerrado com sucesso.', v_contract_id;
      return;
    end if;

    update public.people
    set full_name = v_name,
        cpf = nullif(v_cpf,''),
        person_key = case when v_cpf <> '' then 'CPF:' || v_cpf else person_key end,
        pis = nullif(regexp_replace(coalesce(p_payload->>'pis',''), '\D','','g'),''),
        birth_date = nullif(p_payload->>'birthDate','')::date,
        identity_number = nullif(trim(p_payload->>'identityNumber'),''),
        identity_issuer = nullif(trim(p_payload->>'identityIssuer'),''),
        identity_state = nullif(upper(left(trim(p_payload->>'identityState'),2)),''),
        identity_issue_date = nullif(p_payload->>'identityIssueDate','')::date,
        ctps_number = nullif(trim(p_payload->>'ctpsNumber'),''),
        ctps_series = nullif(trim(p_payload->>'ctpsSeries'),''),
        ctps_state = nullif(upper(left(trim(p_payload->>'ctpsState'),2)),''),
        ctps_issue_date = nullif(p_payload->>'ctpsIssueDate','')::date,
        voter_title_number = nullif(regexp_replace(coalesce(p_payload->>'voterTitleNumber',''),'\D','','g'),''),
        voter_zone = nullif(regexp_replace(coalesce(p_payload->>'voterZone',''),'\D','','g'),''),
        voter_section = nullif(regexp_replace(coalesce(p_payload->>'voterSection',''),'\D','','g'),''),
        cnh_number = nullif(regexp_replace(coalesce(p_payload->>'cnhNumber',''),'\D','','g'),''),
        cnh_category = nullif(upper(trim(p_payload->>'cnhCategory')),''),
        cnh_expiration_date = nullif(p_payload->>'cnhExpirationDate','')::date,
        cnh_first_issue_date = nullif(p_payload->>'cnhFirstIssueDate','')::date,
        military_certificate = nullif(trim(p_payload->>'militaryCertificate'),''),
        phone = nullif(trim(p_payload->>'phone'),''),
        mother_name = nullif(trim(p_payload->>'motherName'),''),
        birth_state = nullif(upper(left(trim(p_payload->>'birthState'),2)),''),
        birth_city = nullif(trim(p_payload->>'birthCity'),''),
        photo_data_url = nullif(p_payload->>'photoDataUrl',''),
        email = nullif(lower(trim(p_payload->>'email')),''),
        sex = nullif(p_payload->>'sex',''),
        education = nullif(p_payload->>'education',''),
        marital_status = nullif(p_payload->>'maritalStatus',''),
        race_color = nullif(p_payload->>'raceColor',''),
        address = nullif(trim(p_payload->>'address'),''),
        address_number = nullif(trim(p_payload->>'addressNumber'),''),
        district = nullif(trim(p_payload->>'district'),''),
        city = nullif(trim(p_payload->>'city'),''),
        state = nullif(upper(left(trim(p_payload->>'state'),2)),''),
        postal_code = nullif(regexp_replace(coalesce(p_payload->>'postalCode',''),'\D','','g'),''),
        needs_review = false
    where id = v_person_id and organization_id = p_organization_id;

    update public.employment_contracts
    set admission_date = nullif(p_payload->>'admissionDate','')::date,
        role_name = nullif(trim(p_payload->>'role'),''),
        cbo_code = nullif(regexp_replace(coalesce(p_payload->>'cboCode',''),'\D','','g'),''),
        weekly_hours = least(44, greatest(1, coalesce((p_payload->>'weeklyHours')::integer,44))),
        employment_link_code = nullif(trim(p_payload->>'employmentLinkCode'),''),
        employment_link_description = nullif(trim(p_payload->>'employmentLinkDescription'),''),
        contract_term = case when p_payload->>'contractTerm' = 'determined' then 'determined' else 'indefinite' end,
        payment_type = case when p_payload->>'paymentType' = 'monthly' then 'monthly' else 'production' end,
        employment_condition = case when p_payload->>'employmentCondition' = 'reemployment' then 'reemployment' else 'first_job' end,
        contract_type = case when p_payload->>'contractType' in ('harvest','offseason','indefinite') then p_payload->>'contractType' else 'harvest' end,
        union_member = coalesce((p_payload->>'unionMember')::boolean,false),
        union_id = nullif(p_payload->>'unionId','')::uuid,
        union_discount_frequency = case when p_payload->>'unionDiscountFrequency' = 'biweekly' then 'biweekly' else 'monthly' end,
        union_discount_cents = greatest(0, round(coalesce((p_payload->>'unionDiscount')::numeric,0) * 100)),
        family_dependents = greatest(0, coalesce((p_payload->>'familyDependents')::integer,0)),
        irrf_dependents = greatest(0, coalesce((p_payload->>'irrfDependents')::integer,0))
    where id = v_contract_id and organization_id = p_organization_id;

    return query select true, 'Cadastro e contrato atualizados com sucesso.', v_contract_id;
    return;
  end if;

  v_company_legacy := (p_payload->>'companySourceId')::bigint;
  select c.id into v_company_id
  from public.companies c
  where c.organization_id = p_organization_id
    and c.legacy_id = v_company_legacy;
  if v_company_id is null then
    raise exception 'Empresa não encontrada.';
  end if;
  v_admission := (p_payload->>'admissionDate')::date;

  if v_operation = 'create' then
    select p.id into v_person_id
    from public.people p
    where p.organization_id = p_organization_id and p.cpf = v_cpf
    limit 1;

    if v_person_id is null then
      insert into public.people (
        organization_id, person_key, full_name, cpf, pis, birth_date,
        identity_number, identity_issuer, identity_state, identity_issue_date,
        ctps_number, ctps_series, ctps_state, ctps_issue_date,
        voter_title_number, voter_zone, voter_section, cnh_number, cnh_category,
        cnh_expiration_date, cnh_first_issue_date, military_certificate, phone,
        mother_name, birth_state, birth_city, photo_data_url, email, sex,
        education, marital_status, race_color, address, address_number,
        district, city, state, postal_code, needs_review
      ) values (
        p_organization_id, 'CPF:' || v_cpf, v_name, v_cpf,
        nullif(regexp_replace(coalesce(p_payload->>'pis',''),'\D','','g'),''),
        nullif(p_payload->>'birthDate','')::date,
        nullif(trim(p_payload->>'identityNumber'),''),
        nullif(trim(p_payload->>'identityIssuer'),''),
        nullif(upper(left(trim(p_payload->>'identityState'),2)),''),
        nullif(p_payload->>'identityIssueDate','')::date,
        nullif(trim(p_payload->>'ctpsNumber'),''),
        nullif(trim(p_payload->>'ctpsSeries'),''),
        nullif(upper(left(trim(p_payload->>'ctpsState'),2)),''),
        nullif(p_payload->>'ctpsIssueDate','')::date,
        nullif(regexp_replace(coalesce(p_payload->>'voterTitleNumber',''),'\D','','g'),''),
        nullif(regexp_replace(coalesce(p_payload->>'voterZone',''),'\D','','g'),''),
        nullif(regexp_replace(coalesce(p_payload->>'voterSection',''),'\D','','g'),''),
        nullif(regexp_replace(coalesce(p_payload->>'cnhNumber',''),'\D','','g'),''),
        nullif(upper(trim(p_payload->>'cnhCategory')),''),
        nullif(p_payload->>'cnhExpirationDate','')::date,
        nullif(p_payload->>'cnhFirstIssueDate','')::date,
        nullif(trim(p_payload->>'militaryCertificate'),''),
        nullif(trim(p_payload->>'phone'),''),
        nullif(trim(p_payload->>'motherName'),''),
        nullif(upper(left(trim(p_payload->>'birthState'),2)),''),
        nullif(trim(p_payload->>'birthCity'),''),
        nullif(p_payload->>'photoDataUrl',''),
        nullif(lower(trim(p_payload->>'email')),''),
        nullif(p_payload->>'sex',''), nullif(p_payload->>'education',''),
        nullif(p_payload->>'maritalStatus',''), nullif(p_payload->>'raceColor',''),
        nullif(trim(p_payload->>'address'),''),
        nullif(trim(p_payload->>'addressNumber'),''),
        nullif(trim(p_payload->>'district'),''),
        nullif(trim(p_payload->>'city'),''),
        nullif(upper(left(trim(p_payload->>'state'),2)),''),
        nullif(regexp_replace(coalesce(p_payload->>'postalCode',''),'\D','','g'),''),
        false
      ) returning id into v_person_id;
    end if;
  else
    v_person_id := (p_payload->>'personId')::uuid;
  end if;

  if exists (
    select 1 from public.employment_contracts c
    where c.organization_id = p_organization_id
      and c.person_id = v_person_id
      and c.company_id = v_company_id
      and c.admission_date = v_admission
  ) then
    raise exception 'Já existe contrato nesta empresa com a mesma admissão.';
  end if;

  select coalesce(max(c.registration_number),0) + 1,
         coalesce(max(c.legacy_registration),0) + 1
    into v_registration, v_legacy_registration
  from public.employment_contracts c
  where c.organization_id = p_organization_id and c.company_id = v_company_id;

  insert into public.employment_contracts (
    organization_id, company_id, person_id, registration_number,
    legacy_registration, admission_date, role_name, cbo_code, weekly_hours,
    employment_link_code, employment_link_description, contract_term, status,
    payment_type, employment_condition, contract_type, union_member, union_id,
    union_discount_frequency, union_discount_cents, family_dependents,
    irrf_dependents
  ) values (
    p_organization_id, v_company_id, v_person_id, v_registration,
    v_legacy_registration, v_admission, nullif(trim(p_payload->>'role'),''),
    nullif(regexp_replace(coalesce(p_payload->>'cboCode',''),'\D','','g'),''),
    least(44,greatest(1,coalesce((p_payload->>'weeklyHours')::integer,44))),
    nullif(trim(p_payload->>'employmentLinkCode'),''),
    nullif(trim(p_payload->>'employmentLinkDescription'),''),
    case when p_payload->>'contractTerm'='determined' then 'determined' else 'indefinite' end,
    'active',
    case when p_payload->>'paymentType'='monthly' then 'monthly' else 'production' end,
    case when p_payload->>'employmentCondition'='reemployment' then 'reemployment' else 'first_job' end,
    case when p_payload->>'contractType' in ('harvest','offseason','indefinite') then p_payload->>'contractType' else 'harvest' end,
    coalesce((p_payload->>'unionMember')::boolean,false),
    nullif(p_payload->>'unionId','')::uuid,
    case when p_payload->>'unionDiscountFrequency'='biweekly' then 'biweekly' else 'monthly' end,
    greatest(0,round(coalesce((p_payload->>'unionDiscount')::numeric,0)*100)),
    greatest(0,coalesce((p_payload->>'familyDependents')::integer,0)),
    greatest(0,coalesce((p_payload->>'irrfDependents')::integer,0))
  ) returning id into v_contract_id;

  insert into public.legacy_contract_map (
    organization_id, company_id, legacy_registration, contract_id, target_code
  ) values (
    p_organization_id, v_company_id, v_legacy_registration, v_contract_id,
    'MAT-' || lpad(v_registration::text,6,'0')
  );

  if v_operation = 'create' and jsonb_typeof(p_payload->'dependents') = 'array' then
    for v_dependent in select value from jsonb_array_elements(p_payload->'dependents')
    loop
      insert into public.dependents (
        organization_id, person_id, dependent_type, name, cpf, birth_date,
        disabled, birth_certificate, vaccination_proof, school_proof,
        salary_family_eligible, irrf_dependent
      ) values (
        p_organization_id, v_person_id, v_dependent->>'dependentType',
        trim(v_dependent->>'name'),
        regexp_replace(coalesce(v_dependent->>'cpf',''),'\D','','g'),
        (v_dependent->>'birthDate')::date,
        coalesce((v_dependent->>'disabled')::boolean,false),
        nullif(trim(v_dependent->>'birthCertificate'),''),
        coalesce((v_dependent->>'vaccinationProof')::boolean,false),
        coalesce((v_dependent->>'schoolProof')::boolean,false),
        coalesce((v_dependent->>'salaryFamilyEligible')::boolean,false),
        coalesce((v_dependent->>'irrfDependent')::boolean,false)
      );
    end loop;
  end if;

  return query select true,
    'Colaborador cadastrado com a matrícula ' || v_registration || '.',
    v_contract_id;
end;
$$;

revoke all on function public.folha_save_worker(uuid,jsonb) from public;
grant execute on function public.folha_save_worker(uuid,jsonb) to service_role;
