import { and, count, desc, eq, sql } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import {
  companies,
  employmentContracts,
  importRuns,
  legacyContractMap,
  people,
  services,
  dependents,
} from "../../../db/schema";
import { requireCloudAdmin } from "../../auth-cloud";
import { getSupabaseConfig } from "../../../db/supabase";
import {
  cloudImportAccessGet,
  cloudImportAccessPost,
} from "./cloud";

type CompanyInput = {
  sourceId: number;
  name: string;
  document?: string | null;
  documentType?: string | null;
  cei?: string | null;
  city?: string | null;
  state?: string | null;
};
type ContractInput = {
  sourceRegistration: number;
  companySourceId: number;
  name: string;
  cpf?: string | null;
  pis?: string | null;
  birthDate?: string | null;
  sex?: string | null;
  raceColor?: string | null;
  birthCity?: string | null;
  birthState?: string | null;
  education?: string | null;
  maritalStatus?: string | null;
  address?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  identityNumber?: string | null;
  identityIssuer?: string | null;
  identityState?: string | null;
  identityIssueDate?: string | null;
  voterTitleNumber?: string | null;
  voterZone?: string | null;
  voterSection?: string | null;
  ctpsNumber?: string | null;
  ctpsSeries?: string | null;
  ctpsIssueDate?: string | null;
  phone?: string | null;
  admissionDate?: string | null;
  terminationDate?: string | null;
  role?: string | null;
  seasonSourceId?: number | null;
  active?: boolean;
};
type DependentInput = {
  sourceId: number;
  sourceDetailId?: number;
  companySourceId: number;
  sourceRegistration: number;
  name?: string | null;
  birthDate?: string | null;
  dependentType?: string | null;
  cpf?: string | null;
};
type ServiceInput = {
  sourceId: number;
  groupSourceId?: number | null;
  description: string;
  unitSourceId?: number | null;
  fgts?: boolean;
  fgts13?: boolean;
  inss?: boolean;
  inss13?: boolean;
  rais?: boolean;
  formulaCode?: string | null;
  groupName?: string | null;
  unitName?: string | null;
  affectsDsr?: boolean;
  active?: boolean;
};
const tenant = (request: Request) =>
  request.headers.get("oai-authenticated-user-email")?.toLowerCase() ||
  "local-owner";
const chunks = <T>(rows: T[], size = 12) => {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
};
const digits = (value: string | null | undefined) =>
  (value || "").replace(/\D/g, "");
const personKey = (r: ContractInput) => {
  const cpf = digits(r.cpf);
  return cpf.length === 11
    ? `CPF:${cpf}`
    : `LEGACY:${r.companySourceId}:${r.sourceRegistration}`;
};
const dateValue = (value?: string | null) => value || "9999-12-31";
const legacyCode = (company: number, registration: number) =>
  `LEG-${String(company).padStart(3, "0")}-${String(registration).padStart(6, "0")}`;

export async function GET(request: Request) {
  try {
    if (getSupabaseConfig()) {
      if (!(await requireCloudAdmin(request)))
        return Response.json(
          { error: "A importação do Access é exclusiva de administradores." },
          { status: 403 },
        );
      return cloudImportAccessGet();
    }
    const db = getDb(),
      tenantId = tenant(request);
    const [personTotal] = await db
      .select({ value: count() })
      .from(people)
      .where(eq(people.tenantId, tenantId));
    const [contractTotal] = await db
      .select({ value: count() })
      .from(employmentContracts)
      .where(eq(employmentContracts.tenantId, tenantId));
    const [activeTotal] = await db
      .select({ value: count() })
      .from(employmentContracts)
      .where(
        and(
          eq(employmentContracts.tenantId, tenantId),
          eq(employmentContracts.status, "active"),
        ),
      );
    const imports = await db
      .select()
      .from(importRuns)
      .where(eq(importRuns.tenantId, tenantId))
      .orderBy(desc(importRuns.id))
      .limit(5);
    return Response.json({
      counts: {
        people: personTotal.value,
        contracts: contractTotal.value,
        activeContracts: activeTotal.value,
      },
      imports,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Falha ao consultar dados",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    if (getSupabaseConfig()) {
      if (!(await requireCloudAdmin(request)))
        return Response.json(
          { error: "A importação do Access é exclusiva de administradores." },
          { status: 403 },
        );
      return cloudImportAccessPost(request);
    }
    await ensureDatabase();
    const tenantId = tenant(request),
      payload = (await request.json()) as {
        fileName?: string;
        companies?: CompanyInput[];
        contracts?: ContractInput[];
        services?: ServiceInput[];
        dependents?: DependentInput[];
      };
    const companyRows = (payload.companies || [])
        .filter((r) => Number.isFinite(r.sourceId) && r.name?.trim())
        .slice(0, 1000),
      contractRows = (payload.contracts || [])
        .filter(
          (r) =>
            Number.isFinite(r.sourceRegistration) &&
            Number.isFinite(r.companySourceId) &&
            r.name?.trim(),
        )
        .slice(0, 5000),
      serviceRows = (payload.services || [])
        .filter((r) => Number.isFinite(r.sourceId) && r.description?.trim())
        .slice(0, 1000),
      dependentRows = (payload.dependents || [])
        .filter(
          (r) =>
            Number.isFinite(r.sourceId) &&
            Number.isFinite(r.companySourceId) &&
            Number.isFinite(r.sourceRegistration) &&
            r.name?.trim(),
        )
        .slice(0, 5000);
    if (!companyRows.length && !contractRows.length && !serviceRows.length)
      return Response.json(
        { error: "Nenhum registro válido foi recebido." },
        { status: 400 },
      );
    const db = getDb();
    const splitCtps = (number?: string | null, series?: string | null) => {
      const raw = String(number || "").trim();
      const slash = raw.indexOf("/");
      return slash >= 0
        ? {
            number: raw.slice(0, slash).trim() || null,
            series:
              String(series || "").trim() || raw.slice(slash + 1).trim() || null,
          }
        : {
            number: raw || null,
            series: String(series || "").trim() || null,
          };
    };
    for (const group of chunks(companyRows))
      await db
        .insert(companies)
        .values(group.map((r) => ({ ...r, tenantId, name: r.name.trim() })))
        .onConflictDoUpdate({
          target: [companies.tenantId, companies.sourceId],
          set: {
            name: sql`excluded.name`,
            document: sql`CASE
              WHEN length(replace(replace(replace(replace(COALESCE(${companies.document}, ''), '.', ''), '/', ''), '-', ''), ' ', '')) IN (0, 12)
              THEN excluded.document
              ELSE ${companies.document}
            END`,
            documentType: sql`CASE
              WHEN length(replace(replace(replace(replace(COALESCE(${companies.document}, ''), '.', ''), '/', ''), '-', ''), ' ', '')) IN (0, 12)
              THEN excluded.document_type
              ELSE ${companies.documentType}
            END`,
            cei: sql`COALESCE(${companies.cei}, excluded.cei)`,
            city: sql`excluded.city`,
            state: sql`excluded.state`,
          },
        });
    const uniquePeople = new Map<string, ContractInput>();
    for (const row of contractRows) {
      const key = personKey(row),
        current = uniquePeople.get(key);
      if (
        !current ||
        dateValue(row.admissionDate) < dateValue(current.admissionDate)
      )
        uniquePeople.set(key, row);
    }
    // Cada colaborador possui muitos campos cadastrais. Lotes de três mantêm
    // a consulta abaixo do limite de parâmetros do SQLite/D1 local.
    for (const group of chunks([...uniquePeople.entries()], 3))
      await db
        .insert(people)
        .values(
          group.map(([key, r]) => {
            const ctps = splitCtps(r.ctpsNumber, r.ctpsSeries);
            return {
            tenantId,
            personKey: key,
            name: r.name.trim(),
            cpf: digits(r.cpf).length === 11 ? digits(r.cpf) : null,
            pis: digits(r.pis) || null,
            birthDate: r.birthDate || null,
            sex: r.sex || "not_informed",
            raceColor: r.raceColor || "not_informed",
            birthCity: r.birthCity || null,
            birthState: r.birthState || null,
            education: r.education || null,
            maritalStatus: r.maritalStatus || null,
            address: r.address || null,
            district: r.district || null,
            city: r.city || null,
            state: r.state || null,
            postalCode: r.postalCode || null,
            identityNumber: r.identityNumber || null,
            identityIssuer: r.identityIssuer || null,
            identityState: r.identityState || null,
            identityIssueDate: r.identityIssueDate || null,
            voterTitleNumber: r.voterTitleNumber || null,
            voterZone: r.voterZone || null,
            voterSection: r.voterSection || null,
            ctpsNumber: ctps.number,
            ctpsSeries: ctps.series,
            ctpsIssueDate: r.ctpsIssueDate || null,
            phone: r.phone || null,
            needsReview: key.startsWith("LEGACY:"),
            };
          }),
        )
        .onConflictDoUpdate({
          target: [people.tenantId, people.personKey],
          set: {
            name: sql`excluded.name`,
            cpf: sql`excluded.cpf`,
            pis: sql`excluded.pis`,
            birthDate: sql`excluded.birth_date`,
            sex: sql`COALESCE(${people.sex}, excluded.sex)`,
            raceColor: sql`COALESCE(${people.raceColor}, excluded.race_color)`,
            birthCity: sql`COALESCE(excluded.birth_city, ${people.birthCity})`,
            birthState: sql`COALESCE(excluded.birth_state, ${people.birthState})`,
            education: sql`COALESCE(excluded.education, ${people.education})`,
            maritalStatus: sql`COALESCE(excluded.marital_status, ${people.maritalStatus})`,
            address: sql`COALESCE(excluded.address, ${people.address})`,
            district: sql`COALESCE(excluded.district, ${people.district})`,
            city: sql`COALESCE(excluded.city, ${people.city})`,
            state: sql`COALESCE(excluded.state, ${people.state})`,
            postalCode: sql`COALESCE(excluded.postal_code, ${people.postalCode})`,
            identityNumber: sql`COALESCE(excluded.identity_number, ${people.identityNumber})`,
            identityIssuer: sql`COALESCE(excluded.identity_issuer, ${people.identityIssuer})`,
            identityState: sql`COALESCE(excluded.identity_state, ${people.identityState})`,
            identityIssueDate: sql`COALESCE(excluded.identity_issue_date, ${people.identityIssueDate})`,
            voterTitleNumber: sql`COALESCE(excluded.voter_title_number, ${people.voterTitleNumber})`,
            voterZone: sql`COALESCE(excluded.voter_zone, ${people.voterZone})`,
            voterSection: sql`COALESCE(excluded.voter_section, ${people.voterSection})`,
            ctpsNumber: sql`COALESCE(excluded.ctps_number, ${people.ctpsNumber})`,
            ctpsSeries: sql`COALESCE(excluded.ctps_series, ${people.ctpsSeries})`,
            ctpsIssueDate: sql`COALESCE(excluded.ctps_issue_date, ${people.ctpsIssueDate})`,
            phone: sql`COALESCE(excluded.phone, ${people.phone})`,
            needsReview: sql`excluded.needs_review`,
          },
        });
    const savedPeople = await db
        .select({ id: people.id, key: people.personKey })
        .from(people)
        .where(eq(people.tenantId, tenantId)),
      personIds = new Map(savedPeople.map((r) => [r.key, r.id]));
    const existing = await db
        .select()
        .from(employmentContracts)
        .where(eq(employmentContracts.tenantId, tenantId)),
      existingBySource = new Map(
        existing.map((r) => [
          `${r.companySourceId}:${r.sourceRegistration}`,
          r,
        ]),
      ),
      nextByCompany = new Map<number, number>();
    for (const row of existing)
      if (row.registrationNumber)
        nextByCompany.set(
          row.companySourceId,
          Math.max(
            nextByCompany.get(row.companySourceId) || 0,
            row.registrationNumber,
          ),
        );
    const sorted = [...contractRows].sort(
      (a, b) =>
        a.companySourceId - b.companySourceId ||
        dateValue(a.admissionDate).localeCompare(dateValue(b.admissionDate)) ||
        a.sourceRegistration - b.sourceRegistration,
    );
    const prepared = sorted.map((r) => {
      const prior = existingBySource.get(
          `${r.companySourceId}:${r.sourceRegistration}`,
        ),
        active = r.active === true && !r.terminationDate;
      let registrationNumber = prior?.registrationNumber || null;
      if (active && !registrationNumber) {
        const next = (nextByCompany.get(r.companySourceId) || 0) + 1;
        nextByCompany.set(r.companySourceId, next);
        registrationNumber = next;
      }
      return {
        tenantId,
        personId: personIds.get(personKey(r))!,
        companySourceId: r.companySourceId,
        sourceRegistration: r.sourceRegistration,
        registrationNumber,
        legacyCode: active
          ? null
          : legacyCode(r.companySourceId, r.sourceRegistration),
        admissionDate: r.admissionDate || null,
        terminationDate: r.terminationDate || null,
        role: r.role || null,
        seasonSourceId: r.seasonSourceId || null,
        status: active ? "active" : "terminated",
      };
    });
    // Contratos possuem até 20 parâmetros por registro. Quatro por lote
    // mantêm a operação abaixo do limite do banco local.
    for (const group of chunks(prepared, 4))
      await db
        .insert(employmentContracts)
        .values(group)
        .onConflictDoUpdate({
          target: [
            employmentContracts.tenantId,
            employmentContracts.companySourceId,
            employmentContracts.sourceRegistration,
          ],
          set: {
            personId: sql`excluded.person_id`,
            registrationNumber: sql`COALESCE(${employmentContracts.registrationNumber}, excluded.registration_number)`,
            legacyCode: sql`excluded.legacy_code`,
            admissionDate: sql`excluded.admission_date`,
            terminationDate: sql`excluded.termination_date`,
            role: sql`excluded.role`,
            seasonSourceId: sql`excluded.season_source_id`,
            status: sql`excluded.status`,
          },
        });
    const contracts = await db
      .select()
      .from(employmentContracts)
      .where(eq(employmentContracts.tenantId, tenantId));
    const contractPersonIds = new Map(
      contracts.map((r) => [
        `${r.companySourceId}:${r.sourceRegistration}`,
        r.personId,
      ]),
    );
    const preparedDependents = dependentRows
      .map((r) => {
        const personId = contractPersonIds.get(
          `${r.companySourceId}:${r.sourceRegistration}`,
        );
        if (!personId) return null;
        const cpf = digits(r.cpf);
        return {
          tenantId,
          personId,
          dependentType: r.dependentType || "other",
          name: r.name!.trim(),
          cpf:
            cpf.length === 11
              ? cpf
              : `LEGACY-DEP:${r.companySourceId}:${r.sourceRegistration}:${r.sourceId}:${r.sourceDetailId || 0}`,
          birthDate: r.birthDate || "",
          disabled: false,
          vaccinationProof: false,
          schoolProof: false,
          salaryFamilyEligible: false,
          irrfDependent: false,
        };
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    for (const group of chunks(preparedDependents, 5))
      await db
        .insert(dependents)
        .values(group)
        .onConflictDoUpdate({
          target: [dependents.tenantId, dependents.cpf],
          set: {
            personId: sql`excluded.person_id`,
            dependentType: sql`excluded.dependent_type`,
            name: sql`excluded.name`,
            birthDate: sql`excluded.birth_date`,
          },
        });
    for (const group of chunks(contracts, 10))
      await db
        .insert(legacyContractMap)
        .values(
          group.map((r) => ({
            tenantId,
            companySourceId: r.companySourceId,
            sourceRegistration: r.sourceRegistration,
            contractId: r.id,
            targetCode: r.registrationNumber
              ? `MAT-${String(r.registrationNumber).padStart(6, "0")}`
              : r.legacyCode!,
          })),
        )
        .onConflictDoUpdate({
          target: [
            legacyContractMap.tenantId,
            legacyContractMap.companySourceId,
            legacyContractMap.sourceRegistration,
          ],
          set: {
            contractId: sql`excluded.contract_id`,
            targetCode: sql`excluded.target_code`,
          },
        });
    for (const group of chunks(serviceRows, 5))
      await db
        .insert(services)
        .values(
          group.map((r) => ({
            ...r,
            tenantId,
            description: r.description.trim(),
            fgts: !!r.fgts,
            fgts13: !!r.fgts13,
            inss: !!r.inss,
            inss13: !!r.inss13,
            rais: !!r.rais,
            affectsDsr: !!r.affectsDsr,
            active: r.active !== false,
          })),
        )
        .onConflictDoUpdate({
          target: [services.tenantId, services.sourceId],
          set: {
            groupSourceId: sql`excluded.group_source_id`,
            description: sql`excluded.description`,
            unitSourceId: sql`excluded.unit_source_id`,
            fgts: sql`excluded.fgts`,
            fgts13: sql`excluded.fgts_13`,
            inss: sql`excluded.inss`,
            inss13: sql`excluded.inss_13`,
            rais: sql`excluded.rais`,
            formulaCode: sql`excluded.formula_code`,
            groupName: sql`excluded.group_name`,
            unitName: sql`excluded.unit_name`,
            affectsDsr: sql`excluded.affects_dsr`,
            active: sql`excluded.active`,
          },
        });
    await db.insert(importRuns).values({
      tenantId,
      fileName: (payload.fileName || "Banco Access").slice(0, 180),
      companiesCount: companyRows.length,
      workersCount: contractRows.length,
      servicesCount: serviceRows.length,
    });
    return Response.json({
      ok: true,
      imported: {
        companies: companyRows.length,
        people: uniquePeople.size,
        contracts: contractRows.length,
        activeContracts: prepared.filter((r) => r.status === "active").length,
        services: serviceRows.length,
        dependents: preparedDependents.length,
      },
      registrations: Object.fromEntries(
        [...nextByCompany.entries()].map(([company, last]) => [
          company,
          `1–${last}`,
        ]),
      ),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Falha durante a importação",
      },
      { status: 500 },
    );
  }
}
