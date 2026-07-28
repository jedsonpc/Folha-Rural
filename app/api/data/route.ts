import { and, asc, count, desc, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import {
  companies,
  employmentContracts,
  importRuns,
  legacyContractMap,
  people,
  dependents,
  unions,
} from "../../../db/schema";
import { cleanCpf, isValidCpf } from "../../cpf";

const tenant = (request: Request) =>
  request.headers.get("oai-authenticated-user-email")?.toLowerCase() ||
  "local-owner";
const emailValid = (value: string) =>
  !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const photoValid = (value: string) =>
  !value ||
  (/^data:image\/(jpeg|png|webp);base64,/.test(value) &&
    value.length <= 1500000);

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const db = getDb();
    const tenantId = tenant(request);
    const [
      companyRows,
      contracts,
      personTotals,
      reviewTotals,
      imports,
      dependentRows,
      unionRows,
    ] = await Promise.all([
      db
        .select()
        .from(companies)
        .where(eq(companies.tenantId, tenantId))
        .orderBy(asc(companies.name)),
      db
        .select({
          id: employmentContracts.id,
          companySourceId: employmentContracts.companySourceId,
          registrationNumber: employmentContracts.registrationNumber,
          legacyCode: employmentContracts.legacyCode,
          sourceRegistration: employmentContracts.sourceRegistration,
          admissionDate: employmentContracts.admissionDate,
          terminationDate: employmentContracts.terminationDate,
          role: employmentContracts.role,
          cboCode: employmentContracts.cboCode,
          weeklyHours: employmentContracts.weeklyHours,
          employmentLinkCode: employmentContracts.employmentLinkCode,
          employmentLinkDescription: employmentContracts.employmentLinkDescription,
          contractTerm: employmentContracts.contractTerm,
          employmentCondition: employmentContracts.employmentCondition,
          contractType: employmentContracts.contractType,
          paymentType: employmentContracts.paymentType,
          unionMember: employmentContracts.unionMember,
          unionDiscountCents: employmentContracts.unionDiscountCents,
          unionId: employmentContracts.unionId,
          unionDiscountFrequency: employmentContracts.unionDiscountFrequency,
          familyDependents: employmentContracts.familyDependents,
          irrfDependents: employmentContracts.irrfDependents,
          status: employmentContracts.status,
          personId: people.id,
          name: people.name,
          cpf: people.cpf,
          pis: people.pis,
          birthDate: people.birthDate,
          identityNumber: people.identityNumber,
          identityIssuer: people.identityIssuer,
          identityState: people.identityState,
          identityIssueDate: people.identityIssueDate,
          ctpsNumber: people.ctpsNumber,
          ctpsSeries: people.ctpsSeries,
          ctpsState: people.ctpsState,
          ctpsIssueDate: people.ctpsIssueDate,
          voterTitleNumber: people.voterTitleNumber,
          voterZone: people.voterZone,
          voterSection: people.voterSection,
          cnhNumber: people.cnhNumber,
          cnhCategory: people.cnhCategory,
          cnhExpirationDate: people.cnhExpirationDate,
          cnhFirstIssueDate: people.cnhFirstIssueDate,
          militaryCertificate: people.militaryCertificate,
          phone: people.phone,
          motherName: people.motherName,
          birthState: people.birthState,
          birthCity: people.birthCity,
          photoDataUrl: people.photoDataUrl,
          email: people.email,
          sex: people.sex,
          education: people.education,
          maritalStatus: people.maritalStatus,
          raceColor: people.raceColor,
          address: people.address,
          addressNumber: people.addressNumber,
          district: people.district,
          city: people.city,
          state: people.state,
          postalCode: people.postalCode,
          needsReview: people.needsReview,
        })
        .from(employmentContracts)
        .innerJoin(people, eq(employmentContracts.personId, people.id))
        .where(
          and(
            eq(employmentContracts.tenantId, tenantId),
            eq(people.tenantId, tenantId),
          ),
        )
        .orderBy(asc(people.name), desc(employmentContracts.admissionDate)),
      db
        .select({ value: count() })
        .from(people)
        .where(eq(people.tenantId, tenantId)),
      db
        .select({ value: count() })
        .from(people)
        .where(and(eq(people.tenantId, tenantId), eq(people.needsReview, true))),
      db
        .select()
        .from(importRuns)
        .where(eq(importRuns.tenantId, tenantId))
        .orderBy(desc(importRuns.id))
        .limit(5),
      db
        .select()
        .from(dependents)
        .where(eq(dependents.tenantId, tenantId))
        .orderBy(asc(dependents.name)),
      db
        .select()
        .from(unions)
        .where(eq(unions.tenantId, tenantId))
        .orderBy(asc(unions.description)),
    ]);
    const [personTotal] = personTotals;
    const [reviewTotal] = reviewTotals;
    return Response.json(
      {
        companies: companyRows,
        contracts,
        counts: {
          people: personTotal.value,
          contracts: contracts.length,
          active: contracts.filter((row) => row.status === "active").length,
          review: reviewTotal.value,
        },
        imports,
        dependents: (dependentRows || []).map((row) => ({
          ...row,
          cpf: row.cpf.startsWith("LEGACY-DEP:") ? "" : row.cpf,
        })),
        unions: unionRows || [],
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível consultar os dados importados.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    await ensureDatabase();
    const db = getDb();
    const tenantId = tenant(request);
    const body = (await request.json()) as Record<string, unknown>;
    const personId = Number(body.personId),
      contractId = Number(body.contractId);
    const [person] = await db
      .select()
      .from(people)
      .where(and(eq(people.id, personId), eq(people.tenantId, tenantId)))
      .limit(1);
    const [contract] = await db
      .select()
      .from(employmentContracts)
      .where(
        and(
          eq(employmentContracts.id, contractId),
          eq(employmentContracts.tenantId, tenantId),
          eq(employmentContracts.personId, personId),
        ),
      )
      .limit(1);
    if (!person || !contract)
      return Response.json(
        { error: "Cadastro ou contrato não encontrado." },
        { status: 404 },
      );
    if (body.action === "terminate") {
      const terminationDate = String(body.terminationDate || "");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(terminationDate) ||
        (contract.admissionDate && terminationDate < contract.admissionDate)
      )
        return Response.json(
          {
            error:
              "Informe uma data de desligamento válida e posterior à admissão.",
          },
          { status: 400 },
        );
      await db
        .update(employmentContracts)
        .set({ terminationDate, status: "terminated" })
        .where(
          and(
            eq(employmentContracts.id, contract.id),
            eq(employmentContracts.tenantId, tenantId),
          ),
        );
      return Response.json({
        ok: true,
        message: "Contrato encerrado com sucesso.",
      });
    }
    const name = String(body.name || "").trim();
    const cpf = cleanCpf(body.cpf);
    const admissionDate = String(body.admissionDate || "");
    const email = String(body.email || "")
        .trim()
        .toLowerCase(),
      photoDataUrl = String(body.photoDataUrl || "");
    if (!emailValid(email))
      return Response.json(
        { error: "Informe um e-mail válido." },
        { status: 400 },
      );
    if (!photoValid(photoDataUrl))
      return Response.json(
        { error: "A foto deve ser JPG, PNG ou WebP e ter tamanho reduzido." },
        { status: 400 },
      );
    if (name.length < 3)
      return Response.json(
        { error: "Informe o nome completo do colaborador." },
        { status: 400 },
      );
    if (!isValidCpf(cpf))
      return Response.json(
        { error: "Informe um CPF válido para o colaborador." },
        { status: 400 },
      );
    if (admissionDate && !/^\d{4}-\d{2}-\d{2}$/.test(admissionDate))
      return Response.json(
        { error: "A data de admissão é inválida." },
        { status: 400 },
      );
    if (cpf) {
      const [duplicate] = await db
        .select()
        .from(people)
        .where(
          and(
            eq(people.tenantId, tenantId),
            eq(people.personKey, `CPF:${cpf}`),
          ),
        )
        .limit(1);
      if (duplicate && duplicate.id !== person.id)
        return Response.json(
          { error: "Já existe outra pessoa cadastrada com este CPF." },
          { status: 409 },
        );
      const [dependentDuplicate] = await db
        .select()
        .from(dependents)
        .where(and(eq(dependents.tenantId, tenantId), eq(dependents.cpf, cpf)))
        .limit(1);
      if (dependentDuplicate)
        return Response.json(
          { error: "Este CPF já pertence a um dependente cadastrado." },
          { status: 409 },
        );
    }
    await db
      .update(people)
      .set({
        name,
        cpf: cpf || null,
        personKey: cpf ? `CPF:${cpf}` : person.personKey,
        pis: String(body.pis || "").replace(/\D/g, "") || null,
        birthDate: String(body.birthDate || "") || null,
        identityNumber: String(body.identityNumber || "").trim() || null,
        identityIssuer: String(body.identityIssuer || "").trim() || null,
        identityState: String(body.identityState || "").trim() || null,
        identityIssueDate: String(body.identityIssueDate || "").trim() || null,
        ctpsNumber: String(body.ctpsNumber || "").trim() || null,
        ctpsSeries: String(body.ctpsSeries || "").trim() || null,
        ctpsState: String(body.ctpsState || "").trim() || null,
        ctpsIssueDate: String(body.ctpsIssueDate || "").trim() || null,
        voterTitleNumber:
          String(body.voterTitleNumber || "")
            .replace(/\D/g, "")
            .slice(0, 12) || null,
        voterZone:
          String(body.voterZone || "")
            .replace(/\D/g, "")
            .slice(0, 4) || null,
        voterSection:
          String(body.voterSection || "")
            .replace(/\D/g, "")
            .slice(0, 4) || null,
        cnhNumber:
          String(body.cnhNumber || "")
            .replace(/\D/g, "")
            .slice(0, 11) || null,
        cnhCategory:
          String(body.cnhCategory || "")
            .trim()
            .toUpperCase()
            .slice(0, 5) || null,
        cnhExpirationDate: String(body.cnhExpirationDate || "").trim() || null,
        cnhFirstIssueDate: String(body.cnhFirstIssueDate || "").trim() || null,
        militaryCertificate:
          String(body.militaryCertificate || "").trim() || null,
        phone: String(body.phone || "").trim() || null,
        motherName: String(body.motherName || "").trim() || null,
        birthState:
          String(body.birthState || "")
            .trim()
            .toUpperCase()
            .slice(0, 2) || null,
        birthCity: String(body.birthCity || "").trim() || null,
        photoDataUrl: photoDataUrl || null,
        email: email || null,
        sex: String(body.sex || "") || null,
        education: String(body.education || "") || null,
        maritalStatus: String(body.maritalStatus || "") || null,
        raceColor: String(body.raceColor || "") || null,
        address: String(body.address || "").trim() || null,
        addressNumber: String(body.addressNumber || "").trim() || null,
        district: String(body.district || "").trim() || null,
        city: String(body.city || "").trim() || null,
        state:
          String(body.state || "")
            .trim()
            .toUpperCase()
            .slice(0, 2) || null,
        postalCode: String(body.postalCode || "").replace(/\D/g, "") || null,
        needsReview: !cpf,
      })
      .where(and(eq(people.id, person.id), eq(people.tenantId, tenantId)));
    await db
      .update(employmentContracts)
      .set({
        admissionDate: admissionDate || null,
        role: String(body.role || "").trim() || null,
        cboCode: String(body.cboCode || "").replace(/\D/g, "") || null,
        weeklyHours: Math.min(44, Math.max(1, Number(body.weeklyHours) || 44)),
        employmentLinkCode: String(body.employmentLinkCode || "").trim() || null,
        employmentLinkDescription:
          String(body.employmentLinkDescription || "").trim() || null,
        contractTerm:
          body.contractTerm === "determined" ? "determined" : "indefinite",
        seasonSourceId: body.seasonSourceId
          ? Number(body.seasonSourceId)
          : null,
        paymentType: body.paymentType === "monthly" ? "monthly" : "production",
        employmentCondition:
          body.employmentCondition === "reemployment"
            ? "reemployment"
            : "first_job",
        contractType: ["harvest", "offseason", "indefinite"].includes(
          String(body.contractType),
        )
          ? String(body.contractType)
          : "harvest",
        unionMember: Boolean(body.unionMember),
        unionId: body.unionMember && body.unionId ? Number(body.unionId) : null,
        unionDiscountFrequency:
          body.unionDiscountFrequency === "biweekly" ? "biweekly" : "monthly",
        unionDiscountCents: Math.max(
          0,
          Math.round(Number(body.unionDiscount || 0) * 100),
        ),
        familyDependents: Math.max(0, Number(body.familyDependents) || 0),
        irrfDependents: Math.max(0, Number(body.irrfDependents) || 0),
      })
      .where(
        and(
          eq(employmentContracts.id, contract.id),
          eq(employmentContracts.tenantId, tenantId),
        ),
      );
    return Response.json({
      ok: true,
      message: "Cadastro e contrato atualizados com sucesso.",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar o cadastro.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const db = getDb();
    const tenantId = tenant(request);
    const body = (await request.json()) as {
      action?: string;
      personId?: number;
      companySourceId?: number;
      admissionDate?: string;
      role?: string;
      seasonSourceId?: number | null;
      name?: string;
      cpf?: string;
      paymentType?: string;
      unionMember?: boolean;
      unionDiscount?: number;
      unionDiscountFrequency?: string;
      familyDependents?: number;
      irrfDependents?: number;
      [key: string]: unknown;
    };
    if (body.action === "saveDependent") {
      const personId = Number(body.personId),
        dependentType = String(body.dependentType || ""),
        name = String(body.name || "").trim(),
        cpf = cleanCpf(body.cpf),
        birthDate = String(body.birthDate || "");
      if (
        !personId ||
        !dependentType ||
        name.length < 3 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)
      )
        return Response.json(
          { error: "Preencha tipo, nome e nascimento do dependente." },
          { status: 400 },
        );
      if (!isValidCpf(cpf))
        return Response.json(
          { error: "Informe um CPF válido e obrigatório para o dependente." },
          { status: 400 },
        );
      const [personCpf] = await db
        .select()
        .from(people)
        .where(and(eq(people.tenantId, tenantId), eq(people.cpf, cpf)))
        .limit(1);
      if (personCpf)
        return Response.json(
          { error: "Este CPF já pertence a um colaborador." },
          { status: 409 },
        );
      const [dependentCpf] = await db
        .select()
        .from(dependents)
        .where(and(eq(dependents.tenantId, tenantId), eq(dependents.cpf, cpf)))
        .limit(1);
      if (dependentCpf && dependentCpf.id !== Number(body.id))
        return Response.json(
          { error: "Este CPF já pertence a outro dependente." },
          { status: 409 },
        );
      const [owner] = await db
        .select()
        .from(people)
        .where(and(eq(people.id, personId), eq(people.tenantId, tenantId)))
        .limit(1);
      if (!owner)
        return Response.json(
          { error: "Colaborador não encontrado." },
          { status: 404 },
        );
      const child = dependentType === "child",
        disabled = Boolean(body.disabled),
        age = Math.floor(
          (Date.now() - new Date(`${birthDate}T12:00:00`).getTime()) /
            31557600000,
        ),
        vaccinationProof = Boolean(body.vaccinationProof),
        schoolProof = Boolean(body.schoolProof),
        birthCertificate = String(body.birthCertificate || "").trim();
      if (child && !birthCertificate)
        return Response.json(
          { error: "Informe a certidão de nascimento do filho." },
          { status: 400 },
        );
      if (child && age <= 6 && !vaccinationProof)
        return Response.json(
          {
            error:
              "Marque a comprovação de vacinação para filho de até 6 anos.",
          },
          { status: 400 },
        );
      if (child && age >= 7 && age <= 14 && !schoolProof)
        return Response.json(
          {
            error:
              "Marque a comprovação de frequência escolar para filho de 7 a 14 anos.",
          },
          { status: 400 },
        );
      const values = {
        tenantId,
        personId,
        dependentType,
        name,
        cpf,
        birthDate,
        disabled,
        birthCertificate: birthCertificate || null,
        vaccinationProof,
        schoolProof,
        salaryFamilyEligible:
          child && (age < 14 || disabled) && Boolean(body.salaryFamilyEligible),
        irrfDependent: Boolean(body.irrfDependent),
      };
      const id = Number(body.id);
      if (id)
        await db
          .update(dependents)
          .set(values)
          .where(
            and(
              eq(dependents.id, id),
              eq(dependents.tenantId, tenantId),
              eq(dependents.personId, personId),
            ),
          );
      else await db.insert(dependents).values(values);
      return Response.json({
        ok: true,
        message: "Dependente salvo com sucesso.",
      });
    }
    if (body.action === "deleteDependent") {
      await db
        .delete(dependents)
        .where(
          and(
            eq(dependents.id, Number(body.id)),
            eq(dependents.tenantId, tenantId),
            eq(dependents.personId, Number(body.personId)),
          ),
        );
      return Response.json({ ok: true, message: "Dependente excluído." });
    }
    if (body.action === "create") {
      const name = String(body.name || "").trim(),
        cpf = cleanCpf(body.cpf),
        companyId = Number(body.companySourceId),
        admission = String(body.admissionDate || "");
      const email = String(body.email || "")
          .trim()
          .toLowerCase(),
        photoDataUrl = String(body.photoDataUrl || "");
      if (!emailValid(email))
        return Response.json(
          { error: "Informe um e-mail válido." },
          { status: 400 },
        );
      if (!photoValid(photoDataUrl))
        return Response.json(
          { error: "A foto deve ser JPG, PNG ou WebP e ter tamanho reduzido." },
          { status: 400 },
        );
      if (
        name.length < 3 ||
        !companyId ||
        !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(admission)
      )
        return Response.json(
          { error: "Informe nome, empresa e data de admissão." },
          { status: 400 },
        );
      if (!isValidCpf(cpf))
        return Response.json(
          { error: "Informe um CPF válido e obrigatório para o colaborador." },
          { status: 400 },
        );
      let existingPerson: typeof people.$inferSelect | undefined;
      if (cpf) {
        const [duplicate] = await db
          .select()
          .from(people)
          .where(
            and(
              eq(people.tenantId, tenantId),
              eq(people.personKey, `CPF:${cpf}`),
            ),
          )
          .limit(1);
        existingPerson = duplicate;
        const [dependentDuplicate] = await db
          .select()
          .from(dependents)
          .where(
            and(eq(dependents.tenantId, tenantId), eq(dependents.cpf, cpf)),
          )
          .limit(1);
        if (dependentDuplicate)
          return Response.json(
            { error: "Este CPF já pertence a um dependente cadastrado." },
            { status: 409 },
          );
      }
      if (existingPerson) {
        const [sameAdmission] = await db
          .select()
          .from(employmentContracts)
          .where(
            and(
              eq(employmentContracts.tenantId, tenantId),
              eq(employmentContracts.personId, existingPerson.id),
              eq(employmentContracts.companySourceId, companyId),
              eq(employmentContracts.admissionDate, admission),
            ),
          )
          .limit(1);
        if (sameAdmission)
          return Response.json(
            {
              error:
                "Já existe um contrato deste CPF, nesta empresa, com a mesma data de admissão.",
            },
            { status: 409 },
          );
      }
      const pendingDependents = Array.isArray(body.dependents)
          ? (body.dependents as Array<Record<string, unknown>>)
          : [],
        pendingCpfs = new Set<string>();
      for (const item of pendingDependents) {
        const dc = cleanCpf(item.cpf),
          dn = String(item.name || "").trim(),
          dt = String(item.dependentType || ""),
          dbirth = String(item.birthDate || "");
        if (
          !isValidCpf(dc) ||
          dn.length < 3 ||
          !dt ||
          !/^\d{4}-\d{2}-\d{2}$/.test(dbirth)
        )
          return Response.json(
            {
              error: `Dependente ${dn || "sem nome"}: confira CPF, tipo e nascimento.`,
            },
            { status: 400 },
          );
        if (dc === cpf || pendingCpfs.has(dc))
          return Response.json(
            {
              error: "Há CPF repetido entre o colaborador e seus dependentes.",
            },
            { status: 400 },
          );
        pendingCpfs.add(dc);
        const [personUsed] = await db
            .select()
            .from(people)
            .where(and(eq(people.tenantId, tenantId), eq(people.cpf, dc)))
            .limit(1),
          [dependentUsed] = await db
            .select()
            .from(dependents)
            .where(
              and(eq(dependents.tenantId, tenantId), eq(dependents.cpf, dc)),
            )
            .limit(1);
        if (personUsed || dependentUsed)
          return Response.json(
            { error: `O CPF do dependente ${dn} já está cadastrado.` },
            { status: 409 },
          );
        if (dt === "child") {
          const age = Math.floor(
            (Date.now() - new Date(`${dbirth}T12:00:00`).getTime()) /
              31557600000,
          );
          if (!String(item.birthCertificate || "").trim())
            return Response.json(
              { error: `Informe a certidão de nascimento de ${dn}.` },
              { status: 400 },
            );
          if (age <= 6 && !item.vaccinationProof)
            return Response.json(
              { error: `Informe a vacinação de ${dn}.` },
              { status: 400 },
            );
          if (age >= 7 && age <= 14 && !item.schoolProof)
            return Response.json(
              { error: `Informe a frequência escolar de ${dn}.` },
              { status: 400 },
            );
        }
      }
      const [company] = await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.tenantId, tenantId),
            eq(companies.sourceId, companyId),
          ),
        )
        .limit(1);
      if (!company)
        return Response.json(
          { error: "Empresa não encontrada." },
          { status: 404 },
        );
      const [lastSource] = await db
        .select({ value: employmentContracts.sourceRegistration })
        .from(employmentContracts)
        .where(
          and(
            eq(employmentContracts.tenantId, tenantId),
            eq(employmentContracts.companySourceId, companyId),
          ),
        )
        .orderBy(desc(employmentContracts.sourceRegistration))
        .limit(1);
      const [lastRegistration] = await db
        .select({ value: employmentContracts.registrationNumber })
        .from(employmentContracts)
        .where(
          and(
            eq(employmentContracts.tenantId, tenantId),
            eq(employmentContracts.companySourceId, companyId),
          ),
        )
        .orderBy(desc(employmentContracts.registrationNumber))
        .limit(1);
      const sourceRegistration = (lastSource?.value || 0) + 1,
        registrationNumber = (lastRegistration?.value || 0) + 1;
      let person = existingPerson;
      if (!person) {
        [person] = await db
          .insert(people)
          .values({
            tenantId,
            personKey: cpf ? `CPF:${cpf}` : `NEW:${Date.now()}`,
            name,
            cpf: cpf || null,
            pis: String(body.pis || "").replace(/\D/g, "") || null,
            birthDate: String(body.birthDate || "") || null,
            identityNumber: String(body.identityNumber || "").trim() || null,
            identityIssuer: String(body.identityIssuer || "").trim() || null,
            identityState: String(body.identityState || "").trim() || null,
            identityIssueDate:
              String(body.identityIssueDate || "").trim() || null,
            ctpsNumber: String(body.ctpsNumber || "").trim() || null,
            ctpsSeries: String(body.ctpsSeries || "").trim() || null,
            ctpsState: String(body.ctpsState || "").trim() || null,
            ctpsIssueDate: String(body.ctpsIssueDate || "").trim() || null,
            voterTitleNumber:
              String(body.voterTitleNumber || "")
                .replace(/\D/g, "")
                .slice(0, 12) || null,
            voterZone:
              String(body.voterZone || "")
                .replace(/\D/g, "")
                .slice(0, 4) || null,
            voterSection:
              String(body.voterSection || "")
                .replace(/\D/g, "")
                .slice(0, 4) || null,
            cnhNumber:
              String(body.cnhNumber || "")
                .replace(/\D/g, "")
                .slice(0, 11) || null,
            cnhCategory:
              String(body.cnhCategory || "")
                .trim()
                .toUpperCase()
                .slice(0, 5) || null,
            cnhExpirationDate:
              String(body.cnhExpirationDate || "").trim() || null,
            cnhFirstIssueDate:
              String(body.cnhFirstIssueDate || "").trim() || null,
            militaryCertificate:
              String(body.militaryCertificate || "").trim() || null,
            phone: String(body.phone || "").trim() || null,
            motherName: String(body.motherName || "").trim() || null,
            birthState:
              String(body.birthState || "")
                .trim()
                .toUpperCase()
                .slice(0, 2) || null,
            birthCity: String(body.birthCity || "").trim() || null,
            photoDataUrl: photoDataUrl || null,
            email: email || null,
            sex: String(body.sex || "") || null,
            education: String(body.education || "") || null,
            maritalStatus: String(body.maritalStatus || "") || null,
            raceColor: String(body.raceColor || "") || null,
            address: String(body.address || "").trim() || null,
            addressNumber: String(body.addressNumber || "").trim() || null,
            district: String(body.district || "").trim() || null,
            city: String(body.city || "").trim() || null,
            state:
              String(body.state || "")
                .trim()
                .toUpperCase()
                .slice(0, 2) || null,
            postalCode:
              String(body.postalCode || "").replace(/\D/g, "") || null,
            needsReview: false,
          })
          .returning();
      }
      const [contract] = await db
        .insert(employmentContracts)
        .values({
          tenantId,
          personId: person.id,
          companySourceId: companyId,
          sourceRegistration,
          registrationNumber,
          admissionDate: admission,
          role: String(body.role || "").trim() || null,
          cboCode: String(body.cboCode || "").replace(/\D/g, "") || null,
          weeklyHours: Math.min(44, Math.max(1, Number(body.weeklyHours) || 44)),
          employmentLinkCode:
            String(body.employmentLinkCode || "").trim() || null,
          employmentLinkDescription:
            String(body.employmentLinkDescription || "").trim() || null,
          contractTerm:
            body.contractTerm === "determined" ? "determined" : "indefinite",
          status: "active",
          paymentType:
            body.paymentType === "monthly" ? "monthly" : "production",
          employmentCondition:
            body.employmentCondition === "reemployment"
              ? "reemployment"
              : "first_job",
          contractType: ["harvest", "offseason", "indefinite"].includes(
            String(body.contractType),
          )
            ? String(body.contractType)
            : "harvest",
          unionMember: Boolean(body.unionMember),
          unionId:
            body.unionMember && body.unionId ? Number(body.unionId) : null,
          unionDiscountFrequency:
            body.unionDiscountFrequency === "biweekly" ? "biweekly" : "monthly",
          unionDiscountCents: Math.max(
            0,
            Math.round(Number(body.unionDiscount || 0) * 100),
          ),
          familyDependents: Math.max(0, Number(body.familyDependents) || 0),
          irrfDependents: Math.max(0, Number(body.irrfDependents) || 0),
        })
        .returning();
      await db.insert(legacyContractMap).values({
        tenantId,
        companySourceId: companyId,
        sourceRegistration,
        contractId: contract.id,
        targetCode: `MAT-${String(registrationNumber).padStart(6, "0")}`,
      });
      const newDependents = Array.isArray(body.dependents)
        ? (body.dependents as Array<Record<string, unknown>>)
        : [];
      for (const item of newDependents) {
        const dependentCpf = cleanCpf(item.cpf),
          dependentType = String(item.dependentType || ""),
          dependentName = String(item.name || "").trim(),
          dependentBirth = String(item.birthDate || "");
        if (
          !isValidCpf(dependentCpf) ||
          !dependentType ||
          dependentName.length < 3 ||
          !/^\d{4}-\d{2}-\d{2}$/.test(dependentBirth)
        )
          return Response.json(
            {
              error: `Dependente ${dependentName || "sem nome"}: confira CPF, tipo e nascimento.`,
            },
            { status: 400 },
          );
        if (dependentCpf === cpf)
          return Response.json(
            { error: "O dependente não pode usar o mesmo CPF do colaborador." },
            { status: 400 },
          );
        const child = dependentType === "child",
          age = Math.floor(
            (Date.now() - new Date(`${dependentBirth}T12:00:00`).getTime()) /
              31557600000,
          ),
          disabled = Boolean(item.disabled),
          birthCertificate = String(item.birthCertificate || "").trim(),
          vaccinationProof = Boolean(item.vaccinationProof),
          schoolProof = Boolean(item.schoolProof);
        if (child && !birthCertificate)
          return Response.json(
            { error: `Informe a certidão de nascimento de ${dependentName}.` },
            { status: 400 },
          );
        if (child && age <= 6 && !vaccinationProof)
          return Response.json(
            { error: `Informe a vacinação de ${dependentName}.` },
            { status: 400 },
          );
        if (child && age >= 7 && age <= 14 && !schoolProof)
          return Response.json(
            { error: `Informe a frequência escolar de ${dependentName}.` },
            { status: 400 },
          );
        await db.insert(dependents).values({
          tenantId,
          personId: person.id,
          dependentType,
          name: dependentName,
          cpf: dependentCpf,
          birthDate: dependentBirth,
          disabled,
          birthCertificate: birthCertificate || null,
          vaccinationProof,
          schoolProof,
          salaryFamilyEligible:
            child &&
            (age < 14 || disabled) &&
            Boolean(item.salaryFamilyEligible),
          irrfDependent: Boolean(item.irrfDependent),
        });
      }
      return Response.json({
        ok: true,
        message: `Colaborador cadastrado com a matrícula ${registrationNumber}.`,
      });
    }
    if (
      !Number.isInteger(body.personId) ||
      !Number.isInteger(body.companySourceId) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.admissionDate || "")
    ) {
      return Response.json(
        {
          error:
            "Informe o colaborador, a empresa e uma data de admissão válida.",
        },
        { status: 400 },
      );
    }
    const [person] = await db
      .select()
      .from(people)
      .where(and(eq(people.id, body.personId!), eq(people.tenantId, tenantId)))
      .limit(1);
    const [company] = await db
      .select()
      .from(companies)
      .where(
        and(
          eq(companies.sourceId, body.companySourceId!),
          eq(companies.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (!person || !company)
      return Response.json(
        { error: "Colaborador ou empresa não encontrado." },
        { status: 404 },
      );
    const [sameAdmission] = await db
      .select()
      .from(employmentContracts)
      .where(
        and(
          eq(employmentContracts.tenantId, tenantId),
          eq(employmentContracts.personId, person.id),
          eq(employmentContracts.companySourceId, company.sourceId),
          eq(employmentContracts.admissionDate, body.admissionDate!),
        ),
      )
      .limit(1);
    if (sameAdmission)
      return Response.json(
        {
          error: `${person.name} já possui contrato nesta empresa com a mesma data de admissão.`,
        },
        { status: 409 },
      );
    const [lastSource] = await db
      .select({ value: employmentContracts.sourceRegistration })
      .from(employmentContracts)
      .where(
        and(
          eq(employmentContracts.tenantId, tenantId),
          eq(employmentContracts.companySourceId, company.sourceId),
        ),
      )
      .orderBy(desc(employmentContracts.sourceRegistration))
      .limit(1);
    const [lastRegistration] = await db
      .select({ value: employmentContracts.registrationNumber })
      .from(employmentContracts)
      .where(
        and(
          eq(employmentContracts.tenantId, tenantId),
          eq(employmentContracts.companySourceId, company.sourceId),
        ),
      )
      .orderBy(desc(employmentContracts.registrationNumber))
      .limit(1);
    const sourceRegistration = (lastSource?.value || 0) + 1;
    const registrationNumber = (lastRegistration?.value || 0) + 1;
    const [contract] = await db
      .insert(employmentContracts)
      .values({
        tenantId,
        personId: person.id,
        companySourceId: company.sourceId,
        sourceRegistration,
        registrationNumber,
        legacyCode: null,
        admissionDate: body.admissionDate!,
        terminationDate: null,
        role: body.role?.trim() || null,
        cboCode: String(body.cboCode || "").replace(/\D/g, "") || null,
        weeklyHours: Math.min(44, Math.max(1, Number(body.weeklyHours) || 44)),
        employmentLinkCode: body.employmentLinkCode?.trim() || null,
        employmentLinkDescription:
          body.employmentLinkDescription?.trim() || null,
        contractTerm:
          body.contractTerm === "determined" ? "determined" : "indefinite",
        seasonSourceId: body.seasonSourceId || null,
        status: "active",
        paymentType: body.paymentType === "monthly" ? "monthly" : "production",
        employmentCondition:
          body.employmentCondition === "reemployment"
            ? "reemployment"
            : "first_job",
        contractType: ["harvest", "offseason", "indefinite"].includes(
          String(body.contractType),
        )
          ? String(body.contractType)
          : "harvest",
        unionMember: Boolean(body.unionMember),
        unionDiscountFrequency:
          body.unionDiscountFrequency === "biweekly" ? "biweekly" : "monthly",
        unionDiscountCents: Math.max(
          0,
          Math.round(Number(body.unionDiscount || 0) * 100),
        ),
        familyDependents: Math.max(0, Number(body.familyDependents) || 0),
        irrfDependents: Math.max(0, Number(body.irrfDependents) || 0),
      })
      .returning();
    await db.insert(legacyContractMap).values({
      tenantId,
      companySourceId: company.sourceId,
      sourceRegistration,
      contractId: contract.id,
      targetCode: `MAT-${String(registrationNumber).padStart(6, "0")}`,
    });
    return Response.json({
      ok: true,
      contract,
      message: `Novo contrato criado com a matrícula ${registrationNumber}.`,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível criar a nova admissão.",
      },
      { status: 500 },
    );
  }
}
