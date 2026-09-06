import type { CloudUser } from "../../auth-cloud";
import { cleanCpf, isValidCpf } from "../../cpf";
import {
  getSupabaseConfig,
  supabaseAdmin,
} from "../../../db/supabase";

type Row = Record<string, any>;
const value = (row: Row, key: string) => row[key] ?? null;
const allowedFilter = (user: CloudUser | null) =>
  user?.companyIds == null
    ? ""
    : `&companies.legacy_id=in.(${user.companyIds.join(",") || "0"})`;

const personFields = (person: Row) => ({
  personId: person.id,
  name: person.full_name,
  cpf: person.cpf,
  pis: person.pis,
  birthDate: person.birth_date,
  identityNumber: person.identity_number,
  identityIssuer: person.identity_issuer,
  identityState: person.identity_state,
  identityIssueDate: person.identity_issue_date,
  ctpsNumber: person.ctps_number,
  ctpsSeries: person.ctps_series,
  ctpsState: person.ctps_state,
  ctpsIssueDate: person.ctps_issue_date,
  voterTitleNumber: person.voter_title_number,
  voterZone: person.voter_zone,
  voterSection: person.voter_section,
  cnhNumber: person.cnh_number,
  cnhCategory: person.cnh_category,
  cnhExpirationDate: person.cnh_expiration_date,
  cnhFirstIssueDate: person.cnh_first_issue_date,
  militaryCertificate: person.military_certificate,
  phone: person.phone,
  motherName: person.mother_name,
  birthState: person.birth_state,
  birthCity: person.birth_city,
  photoDataUrl: person.photo_data_url,
  email: person.email,
  sex: person.sex,
  education: person.education,
  maritalStatus: person.marital_status,
  raceColor: person.race_color,
  address: person.address,
  addressNumber: person.address_number,
  district: person.district,
  city: person.city,
  state: person.state,
  postalCode: person.postal_code,
  needsReview: person.needs_review,
});

const contractResponse = (row: Row) => ({
  id: row.id,
  companySourceId: Number(row.companies?.legacy_id),
  registrationNumber: row.registration_number,
  matEs: row.mat_es,
  legacyCode: row.legacy_code,
  sourceRegistration: row.legacy_registration,
  admissionDate: row.admission_date,
  terminationDate: row.termination_date,
  role: row.role_name,
  cboCode: row.cbo_code,
  weeklyHours: row.weekly_hours,
  employmentLinkCode: row.employment_link_code,
  employmentLinkDescription: row.employment_link_description,
  contractTerm: row.contract_term,
  employmentCondition: row.employment_condition,
  contractType: row.contract_type,
  paymentType: row.payment_type,
  unionMember: row.union_member,
  unionDiscountCents: row.union_discount_cents,
  unionId: row.union_id,
  unionDiscountFrequency: row.union_discount_frequency,
  familyDependents: row.family_dependents,
  irrfDependents: row.irrf_dependents,
  status: row.status,
  ...personFields(row.people || {}),
});

export async function cloudDataGet(user: CloudUser | null, companySourceId: number | null = null) {
  const config = getSupabaseConfig()!;
  try {
    if (
      companySourceId &&
      user?.companyIds != null &&
      !user.companyIds.includes(companySourceId)
    )
      return Response.json({ error: "Empresa não autorizada." }, { status: 403 });
    const filter = allowedFilter(user);
    const selectedCompanyFilter = companySourceId
      ? `&companies.legacy_id=eq.${companySourceId}`
      : "";
    const [companyRows, contractRows, dependentRows, unionRows, imports] =
      await Promise.all([
        supabaseAdmin.get<Row[]>(
          `/rest/v1/companies?select=*&organization_id=eq.${config.organizationId}${user?.companyIds == null ? "" : `&legacy_id=in.(${user.companyIds.join(",") || "0"})`}&order=name.asc`,
        ),
        supabaseAdmin.get<Row[]>(
          `/rest/v1/employment_contracts?select=*,people(*),companies!inner(legacy_id)&organization_id=eq.${config.organizationId}${filter}${selectedCompanyFilter}&order=created_at.desc`,
        ),
        supabaseAdmin.get<Row[]>(
          `/rest/v1/dependents?select=*&organization_id=eq.${config.organizationId}&order=name.asc`,
        ),
        supabaseAdmin.get<Row[]>(
          `/rest/v1/unions?select=*&organization_id=eq.${config.organizationId}&order=description.asc`,
        ),
        user?.companyIds == null
          ? supabaseAdmin.get<Row[]>(
              `/rest/v1/import_runs?select=*&organization_id=eq.${config.organizationId}&order=created_at.desc&limit=5`,
            )
          : Promise.resolve([]),
      ]);
    const motherByPerson = new Map(
      dependentRows
        .filter((row) => row.dependent_type === "mother" && String(row.name || "").trim())
        .map((row) => [row.person_id, String(row.name).trim()]),
    );
    const contracts = contractRows.map(contractResponse).map((contract) => ({
      ...contract,
      motherName: contract.motherName || motherByPerson.get(contract.personId) || null,
    }));
    const visiblePeople = new Set(contracts.map((row) => row.personId));
    return Response.json(
      {
        companies: companyRows.map((row) => ({
          id: row.id,
          sourceId: Number(row.legacy_id),
          name: row.name,
          document: row.document,
          documentType: row.document_type,
          postalCode: row.postal_code,
          address: row.address,
          addressNumber: row.address_number,
          addressComplement: row.address_complement,
          district: row.district,
          city: row.city,
          state: row.state,
          active: row.active,
        })),
        contracts,
        counts: {
          people: visiblePeople.size,
          contracts: contracts.length,
          active: contracts.filter((row) => row.status === "active").length,
          review: new Set(
            contracts
              .filter((row) => row.status === "active" && row.needsReview)
              .map((row) => row.personId),
          ).size,
        },
        imports,
        dependents: dependentRows
          .filter((row) => visiblePeople.has(row.person_id))
          .map((row) => ({
            id: row.id,
            personId: row.person_id,
            dependentType: row.dependent_type,
            name: row.name,
            cpf: String(row.cpf || "").startsWith("LEGACY-DEP:")
              ? ""
              : row.cpf,
            birthDate: row.birth_date,
            disabled: row.disabled,
            birthCertificate: row.birth_certificate,
            vaccinationProof: row.vaccination_proof,
            schoolProof: row.school_proof,
            salaryFamilyEligible: row.salary_family_eligible,
            irrfDependent: row.irrf_dependent,
          })),
        unions: unionRows.map((row) => ({
          id: row.id,
          code: row.code,
          description: row.description,
          contributionCents: row.contribution_cents,
          active: row.active,
        })),
        dataSource: "supabase",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível consultar os colaboradores no Supabase.",
      },
      { status: 500 },
    );
  }
}

const validPersonPayload = (body: Row) => {
  const email = String(body.email || "").trim().toLowerCase();
  const photo = String(body.photoDataUrl || "");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return "Informe um e-mail válido.";
  if (
    photo &&
    (!/^data:image\/(jpeg|png|webp);base64,/.test(photo) ||
      photo.length > 1500000)
  )
    return "A foto deve ser JPG, PNG ou WebP e ter tamanho reduzido.";
  const cpf = cleanCpf(body.cpf);
  if (!isValidCpf(cpf)) return "Informe um CPF válido para o colaborador.";
  if (String(body.name || "").trim().length < 3)
    return "Informe o nome completo do colaborador.";
  return null;
};

async function callWorkerRpc(body: Row, user: CloudUser | null) {
  const config = getSupabaseConfig()!;
  const companySourceId = Number(body.companySourceId || 0);
  if (
    companySourceId &&
    user?.companyIds != null &&
    !user.companyIds.includes(companySourceId)
  )
    return Response.json({ error: "Empresa não autorizada." }, { status: 403 });
  const matEs = String(body.matEs || "").replace(/\D/g, "");
  if (matEs && !/^\d{1,5}$/.test(matEs))
    return Response.json(
      { error: "A Matrícula no eSocial deve ter de 1 a 5 algarismos." },
      { status: 400 },
    );
  const result = await supabaseAdmin.post<
    Array<{ ok: boolean; message: string; contract_id?: string }>
  >("/rest/v1/rpc/folha_save_worker", {
    p_organization_id: config.organizationId,
    p_payload: body,
  });
  const saved = result[0];
  const contractId = String(body.contractId || saved?.contract_id || "");
  if (body.action !== "terminate") {
    if (!contractId)
      throw new Error(
        "Não foi possível identificar o contrato para salvar a Matrícula no eSocial.",
      );
    let finalMatEs = matEs;
    if (!finalMatEs) {
      const rows = await supabaseAdmin.get<Row[]>(
        `/rest/v1/employment_contracts?select=registration_number&id=eq.${contractId}&organization_id=eq.${config.organizationId}&limit=1`,
      );
      finalMatEs = String(rows[0]?.registration_number || "").slice(0, 5);
    }
    const persisted = await supabaseAdmin.post<string>(
      "/rest/v1/rpc/folha_set_contract_mat_es",
      {
        p_organization_id: config.organizationId,
        p_contract_id: contractId,
        p_mat_es: finalMatEs,
      },
    );
    if (String(persisted) !== finalMatEs)
      throw new Error("Não foi possível confirmar a Matrícula no eSocial.");
  }
  return Response.json(result[0] || { ok: true });
}

export async function cloudDataPut(
  request: Request,
  user: CloudUser | null,
) {
  try {
    const body = (await request.json()) as Row;
    if (body.action === "deleteWorker") {
      if (user?.role !== "admin" || user.email !== "jedsonpc@hotmail.com")
        return Response.json(
          { error: "Somente o administrador jedsonpc@hotmail.com pode excluir colaboradores." },
          { status: 403 },
        );
      const config = getSupabaseConfig()!;
      const contractId = String(body.contractId || "");
      const rows = contractId
        ? await supabaseAdmin.get<Row[]>(
            `/rest/v1/employment_contracts?select=id,person_id,companies!inner(legacy_id)&organization_id=eq.${config.organizationId}&id=eq.${contractId}&limit=1`,
          )
        : [];
      if (!rows.length)
        return Response.json({ error: "Colaborador não encontrado." }, { status: 404 });
      const companyId = Number(rows[0].companies?.legacy_id);
      if (user.companyIds !== null && !user.companyIds.includes(companyId))
        return Response.json({ error: "Empresa não autorizada." }, { status: 403 });
      for (const table of [
        "daily_entries",
        "legacy_contract_map",
        "worker_payroll_profiles",
        "salary_history",
        "vacation_periods",
        "item_issues",
      ])
        await supabaseAdmin.delete(
          `/rest/v1/${table}?organization_id=eq.${config.organizationId}&contract_id=eq.${contractId}`,
        );
      await supabaseAdmin.delete(
        `/rest/v1/employment_contracts?organization_id=eq.${config.organizationId}&id=eq.${contractId}`,
      );
      const personId = String(rows[0].person_id);
      const remaining = await supabaseAdmin.get<Row[]>(
        `/rest/v1/employment_contracts?select=id&organization_id=eq.${config.organizationId}&person_id=eq.${personId}&limit=1`,
      );
      if (!remaining.length) {
        await supabaseAdmin.delete(`/rest/v1/dependents?organization_id=eq.${config.organizationId}&person_id=eq.${personId}`);
        await supabaseAdmin.delete(`/rest/v1/people?organization_id=eq.${config.organizationId}&id=eq.${personId}`);
      }
      return Response.json({ ok: true, message: "Colaborador e todos os dados vinculados foram excluídos." });
    }
    if (body.action !== "terminate") {
      const validation = validPersonPayload(body);
      if (validation)
        return Response.json({ error: validation }, { status: 400 });
    }
    return await callWorkerRpc({ ...body, operation: "update" }, user);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar o colaborador.",
      },
      { status: 500 },
    );
  }
}

export async function cloudDataPost(
  request: Request,
  user: CloudUser | null,
) {
  const config = getSupabaseConfig()!;
  try {
    const body = (await request.json()) as Row;
    if (body.action === "saveDependent") {
      const dependentType = String(body.dependentType || ""),
        informedCpf = cleanCpf(body.cpf),
        parentWithoutCpf = ["father", "mother"].includes(dependentType) && !informedCpf,
        cpf = parentWithoutCpf ? `LEGACY-DEP:PARENT:${body.personId}:${dependentType}` : informedCpf;
      if (!parentWithoutCpf && !isValidCpf(cpf))
        return Response.json(
          { error: "Informe um CPF válido para o dependente." },
          { status: 400 },
        );
      const payload = {
        organization_id: config.organizationId,
        person_id: body.personId,
        dependent_type: dependentType,
        name: String(body.name || "").trim(),
        cpf,
        birth_date: body.birthDate || null,
        disabled: Boolean(body.disabled),
        birth_certificate: String(body.birthCertificate || "").trim() || null,
        vaccination_proof: Boolean(body.vaccinationProof),
        school_proof: Boolean(body.schoolProof),
        salary_family_eligible: Boolean(body.salaryFamilyEligible),
        irrf_dependent: Boolean(body.irrfDependent),
      };
      if (body.id)
        await supabaseAdmin.patch(
          `/rest/v1/dependents?id=eq.${body.id}&organization_id=eq.${config.organizationId}&person_id=eq.${body.personId}`,
          payload,
          { prefer: "return=minimal" },
        );
      else
        await supabaseAdmin.post("/rest/v1/dependents", payload, {
          prefer: "return=minimal",
        });
      return Response.json({
        ok: true,
        message: "Dependente salvo com sucesso.",
      });
    }
    if (body.action === "deleteDependent") {
      await supabaseAdmin.delete(
        `/rest/v1/dependents?id=eq.${body.id}&organization_id=eq.${config.organizationId}&person_id=eq.${body.personId}`,
      );
      return Response.json({ ok: true, message: "Dependente excluído." });
    }
    if (body.action === "create") {
      const validation = validPersonPayload(body);
      if (validation)
        return Response.json({ error: validation }, { status: 400 });
    }
    return await callWorkerRpc(
      {
        ...body,
        operation: body.action === "create" ? "create" : "new_contract",
      },
      user,
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o colaborador.",
      },
      { status: 500 },
    );
  }
}
