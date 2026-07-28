import { and, asc, eq, gte, lt } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { authorizeCloud } from "../../auth-cloud";
import { getSupabaseConfig } from "../../../db/supabase";
import { cloudClosingGet, cloudClosingPost } from "./cloud";
import {
  dailyEntries,
  employmentContracts,
  payrollClosings,
  people,
  services,
  taxBrackets,
  dependents,
  unions,
  unionContributionRates,
} from "../../../db/schema";

const tenant = (r: Request) =>
  r.headers.get("oai-authenticated-user-email")?.toLowerCase() || "local-owner";
const bounds = (month: string, period: string) => {
  const [y, m] = month.split("-").map(Number),
    next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  return period === "advance"
    ? [`${month}-01`, `${month}-16`]
    : [`${month}-16`, next];
};
const progressive = (
  base: number,
  rows: Array<{
    lowerCents: number;
    upperCents: number | null;
    rateBasisPoints: number;
  }>,
) =>
  Math.round(
    rows.reduce((sum, r) => {
      const lower = Math.max(0, r.lowerCents - 1),
        upper = r.upperCents ?? base,
        taxable = Math.max(0, Math.min(base, upper) - lower);
      return sum + (taxable * r.rateBasisPoints) / 10000;
    }, 0),
  );

async function calculate(
  request: Request,
  company: number,
  month: string,
  period: string,
) {
  const db = getDb(),
    tenantId = tenant(request),
    [start, end] = bounds(month, period),
    effective = `${month}-01`;
  const contracts = await db
    .select({
      id: employmentContracts.id,
      personId: employmentContracts.personId,
      name: people.name,
      registrationNumber: employmentContracts.registrationNumber,
      admissionDate: employmentContracts.admissionDate,
      terminationDate: employmentContracts.terminationDate,
      unionMember: employmentContracts.unionMember,
      unionDiscountCents: employmentContracts.unionDiscountCents,
      unionId: employmentContracts.unionId,
      unionDiscountFrequency: employmentContracts.unionDiscountFrequency,
      familyDependents: employmentContracts.familyDependents,
      irrfDependents: employmentContracts.irrfDependents,
      unionContributionCents: unions.contributionCents,
    })
    .from(employmentContracts)
    .innerJoin(people, eq(employmentContracts.personId, people.id))
    .leftJoin(unions, eq(employmentContracts.unionId, unions.id))
    .where(
      and(
        eq(employmentContracts.tenantId, tenantId),
        eq(employmentContracts.companySourceId, company),
      ),
    )
    .orderBy(asc(employmentContracts.registrationNumber));
  const entries = await db
    .select({
      contractId: dailyEntries.contractId,
      amountCents: dailyEntries.amountCents,
      discountCents: dailyEntries.discountCents,
      inss: services.inss,
      irrf: services.irrf,
    })
    .from(dailyEntries)
    .innerJoin(services, eq(dailyEntries.serviceId, services.id))
    .where(
      and(
        eq(dailyEntries.tenantId, tenantId),
        eq(dailyEntries.companySourceId, company),
        gte(dailyEntries.entryDate, start),
        lt(dailyEntries.entryDate, end),
      ),
    );
  const [year, monthNumber] = month.split("-").map(Number),
    monthEnd = new Date(Date.UTC(year, monthNumber, 0)),
    daysInMonth = monthEnd.getUTCDate(),
    monthStart = `${month}-01`,
    nextMonth = `${monthNumber === 12 ? year + 1 : year}-${String(monthNumber === 12 ? 1 : monthNumber + 1).padStart(2, "0")}-01`;
  const monthlyEntries = await db
    .select({
      contractId: dailyEntries.contractId,
      amountCents: dailyEntries.amountCents,
      inss: services.inss,
      serviceDescription: services.description,
    })
    .from(dailyEntries)
    .innerJoin(services, eq(dailyEntries.serviceId, services.id))
    .where(
      and(
        eq(dailyEntries.tenantId, tenantId),
        eq(dailyEntries.companySourceId, company),
        gte(dailyEntries.entryDate, monthStart),
        lt(dailyEntries.entryDate, nextMonth),
      ),
    );
  const brackets = await db
    .select()
    .from(taxBrackets)
    .where(eq(taxBrackets.tenantId, tenantId));
  const dependentRows = await db
    .select()
    .from(dependents)
    .where(eq(dependents.tenantId, tenantId));
  const unionRates = await db
    .select()
    .from(unionContributionRates)
    .where(eq(unionContributionRates.tenantId, tenantId));
  const valid = (type: string) =>
      brackets
        .filter(
          (r) =>
            r.taxType === type &&
            r.effectiveFrom <= effective &&
            (!r.effectiveTo || r.effectiveTo >= effective),
        )
        .sort((a, b) => a.lowerCents - b.lowerCents),
    inssRows = valid("INSS"),
    irrfRows = valid("IRRF"),
    family = valid("SALARY_FAMILY")[0];
  const rows = contracts
    .map((c) => {
      const own = entries.filter((e) => e.contractId === c.id),
        familyDependentCount = dependentRows.filter((d) => {
          if (d.personId !== c.personId || !d.salaryFamilyEligible)
            return false;
          const birth = new Date(`${d.birthDate}T00:00:00Z`),
            age =
              year -
              birth.getUTCFullYear() -
              (monthNumber - 1 < birth.getUTCMonth() ||
              (monthNumber - 1 === birth.getUTCMonth() &&
                daysInMonth < birth.getUTCDate())
                ? 1
                : 0);
          return d.disabled || age < 14;
        }).length,
        irrfDependentCount = dependentRows.filter(
          (d) => d.personId === c.personId && d.irrfDependent,
        ).length,
        gross = own.reduce((a, e) => a + e.amountCents, 0),
        existingDiscounts = own.reduce((a, e) => a + e.discountCents, 0),
        inssBase = own
          .filter((e) => e.inss)
          .reduce((a, e) => a + e.amountCents, 0),
        irrfGross = own
          .filter((e) => e.irrf)
          .reduce((a, e) => a + e.amountCents, 0),
        monthlyRemuneration = monthlyEntries
          .filter((e) => e.contractId === c.id && e.inss)
          .reduce((a, e) => a + e.amountCents, 0),
        importedSalaryFamily = monthlyEntries
          .filter(
            (e) =>
              e.contractId === c.id &&
              /sal[aá]rio\s*[- ]?fam[ií]lia/i.test(e.serviceDescription),
          )
          .reduce((a, e) => a + e.amountCents, 0),
        inss = inssRows.length ? progressive(inssBase, inssRows) : 0,
        legalDeduction = inss + irrfDependentCount * 18959,
        irrfBase = Math.max(0, irrfGross - Math.max(60720, legalDeduction)),
        irrfBracket = [...irrfRows]
          .reverse()
          .find((r) => irrfBase >= r.lowerCents),
        irrfBeforeReduction = irrfBracket
          ? Math.max(
              0,
              Math.round(
                (irrfBase * irrfBracket.rateBasisPoints) / 10000 -
                  irrfBracket.deductionCents,
              ),
            )
          : 0,
        irrfReduction =
          effective >= "2026-01-01" && irrfGross <= 500000
            ? irrfBeforeReduction
            : effective >= "2026-01-01" && irrfGross <= 735000
              ? Math.min(
                  irrfBeforeReduction,
                  Math.max(0, 97862 - Math.round(irrfGross * 0.133145)),
                )
              : 0,
        irrf = Math.max(0, irrfBeforeReduction - irrfReduction),
        admissionDay = c.admissionDate?.startsWith(month)
          ? Number(c.admissionDate.slice(8, 10))
          : 1,
        terminationDay = c.terminationDate?.startsWith(month)
          ? Number(c.terminationDate.slice(8, 10))
          : daysInMonth,
        eligibleDays = Math.max(0, terminationDay - admissionDay + 1),
        salaryFamily =
          period === "balance" &&
          family &&
          importedSalaryFamily === 0 &&
          monthlyRemuneration > 0 &&
          monthlyRemuneration <= Number(family.upperCents)
            ? Math.round(
                (familyDependentCount * family.deductionCents * eligibleDays) /
                  daysInMonth,
              )
            : 0,
        effectiveUnionRate = unionRates
          .filter(
            (rate) =>
              rate.unionId === c.unionId && rate.effectiveFrom <= effective,
          )
          .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
          .at(-1)?.contributionCents,
        fullUnionContribution =
          (effectiveUnionRate ?? c.unionContributionCents) ||
          c.unionDiscountCents,
        union = !c.unionMember
          ? 0
          : c.unionDiscountFrequency === "biweekly"
            ? period === "advance"
              ? Math.floor(fullUnionContribution / 2)
              : fullUnionContribution - Math.floor(fullUnionContribution / 2)
            : period === "balance"
              ? fullUnionContribution
              : 0,
        net = gross + salaryFamily - existingDiscounts - inss - irrf - union;
      return {
        ...c,
        gross,
        inssBase,
        irrfBase,
        inss,
        irrf,
        irrfBeforeReduction,
        irrfReduction,
        salaryFamily,
        importedSalaryFamily,
        familyDependentCount,
        monthlyRemuneration,
        eligibleDays,
        union,
        existingDiscounts,
        net,
      };
    })
    .filter((r) => r.gross || r.salaryFamily || r.union);
  return {
    company,
    month,
    period,
    start,
    end,
    rows,
    officialTables: {
      inss: inssRows.length > 0,
      irrf: irrfRows.length > 0,
      salaryFamily: Boolean(family),
    },
  };
}
export async function GET(request: Request) {
  const access = await authorizeCloud(request, "Fechamento");
  if (access.response) return access.response;
  if (getSupabaseConfig()) return cloudClosingGet(request);
  try {
    await ensureDatabase();
    const u = new URL(request.url),
      company = Number(u.searchParams.get("company")),
      month =
        u.searchParams.get("month") || new Date().toISOString().slice(0, 7),
      period =
        u.searchParams.get("period") === "advance" ? "advance" : "balance";
    const companyAccess = await authorizeCloud(request, "Fechamento", company);
    if (companyAccess.response) return companyAccess.response;
    if (!company)
      return Response.json(
        { error: "Selecione uma empresa." },
        { status: 400 },
      );
    return Response.json(await calculate(request, company, month, period));
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error ? e.message : "Falha ao calcular o fechamento.",
      },
      { status: 500 },
    );
  }
}
export async function POST(request: Request) {
  const access = await authorizeCloud(request, "Fechamento");
  if (access.response) return access.response;
  if (getSupabaseConfig()) return cloudClosingPost(request);
  try {
    await ensureDatabase();
    const b = (await request.json()) as {
        companySourceId: number;
        month: string;
        period: string;
      },
      tenantId = tenant(request),
      companyAccess = await authorizeCloud(
        request,
        "Fechamento",
        Number(b.companySourceId),
      ),
      result = await calculate(
        request,
        Number(b.companySourceId),
        b.month,
        b.period,
      );
    if (companyAccess.response) return companyAccess.response;
    if (!result.officialTables.inss || !result.officialTables.irrf)
      return Response.json(
        { error: "Atualize as tabelas oficiais antes de fechar." },
        { status: 409 },
      );
    await getDb()
      .insert(payrollClosings)
      .values({
        tenantId,
        companySourceId: Number(b.companySourceId),
        competence: b.month,
        periodType: b.period,
        totalsJson: JSON.stringify(result),
      })
      .onConflictDoUpdate({
        target: [
          payrollClosings.tenantId,
          payrollClosings.companySourceId,
          payrollClosings.competence,
          payrollClosings.periodType,
        ],
        set: { totalsJson: JSON.stringify(result), status: "closed" },
      });
    return Response.json({
      ok: true,
      message: "Folha fechada e memória de cálculo registrada.",
      result,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao fechar a folha." },
      { status: 500 },
    );
  }
}
