import { and, asc, eq, gte, lt } from "drizzle-orm";
import { ensureDatabase, getDb, getRuntimeDatabase } from "../../../db";
import { authorizeCloud } from "../../auth-cloud";
import { getSupabaseConfig } from "../../../db/supabase";
import { cloudClosingGet, cloudClosingPost } from "./cloud";
import { brazilMonth } from "../../br-date";
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
    : [`${month}-01`, next];
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

const isInssService = (description: string) =>
  /(?:^|\b)I\.?\s*N\.?\s*S\.?\s*S\.?(?:\b|$)/i.test(description);

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
      entryDate: dailyEntries.entryDate,
      amountCents: dailyEntries.amountCents,
      discountCents: dailyEntries.discountCents,
      notes: dailyEntries.notes,
      serviceSourceId: services.sourceId,
      inss: services.inss,
      irrf: services.irrf,
      inss13: services.inss13,
      fgts13: services.fgts13,
      inssVacation: services.inssVacation,
      irrfVacation: services.irrfVacation,
      composesProductionAverage: services.composesProductionAverage,
      serviceDescription: services.description,
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
      entryDate: dailyEntries.entryDate,
      amountCents: dailyEntries.amountCents,
      discountCents: dailyEntries.discountCents,
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
  const profileRows=await getRuntimeDatabase().prepare("SELECT contract_id,daily_rate_cents,base_salary_cents FROM worker_payroll_profiles WHERE tenant_id=?").bind(tenantId).all<{contract_id:number;daily_rate_cents:number|null;base_salary_cents:number}>(),profileByContract=new Map(profileRows.results.map((row)=>[row.contract_id,row]));
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
      const ownEntries = entries.filter((e) => e.contractId === c.id),
        own = period==="vacation"?ownEntries.filter((e)=>e.inssVacation||e.irrfVacation):period==="thirteenth"?ownEntries.filter((e)=>e.inss13||e.fgts13):ownEntries.filter((e)=>e.serviceSourceId!==120),
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
        firstHalfGross = monthlyEntries
          .filter((e) => e.contractId === c.id && e.entryDate < `${month}-16`)
          .reduce((a, e) => a + e.amountCents, 0),
        firstHalfDiscounts = monthlyEntries
          .filter((e) => e.contractId === c.id && e.entryDate < `${month}-16`)
          .reduce((a, e) => a + e.discountCents, 0),
        advanceDiscount = period === "balance" ? Math.max(0, firstHalfGross - firstHalfDiscounts) : 0,
        existingDiscounts = own
          .filter((e) => !String(e.notes || "").startsWith("Gerado automaticamente -"))
          .reduce((a, e) => a + e.discountCents, 0),
        inssBase = own
          .filter((e) => period === "vacation" ? e.inssVacation : period === "thirteenth" ? e.inss13 : e.inss)
          .reduce((a, e) => a + e.amountCents, 0),
        irrfGross = own
          .filter((e) => period === "vacation" ? e.irrfVacation : period === "thirteenth" ? (e.inss13 || e.fgts13) : e.irrf)
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
        inssFull = inssRows.length ? progressive(inssBase, inssRows) : 0,
        priorInss = period === "balance" ? monthlyEntries.filter(e=>e.contractId===c.id && e.entryDate<`${month}-16` && isInssService(e.serviceDescription) && e.discountCents>0).reduce((a,e)=>a+e.discountCents,0) : 0,
        inss = Math.max(0,inssFull-priorInss),
        legalDeduction = inssFull + irrfDependentCount * 18959,
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
        irrfFull = Math.max(0, irrfBeforeReduction - irrfReduction),
        priorIrrf = period === "balance" ? monthlyEntries.filter(e=>e.contractId===c.id && e.entryDate<`${month}-16` && /IRRF|IMPOSTO.*RENDA/i.test(e.serviceDescription) && e.discountCents>0).reduce((a,e)=>a+e.discountCents,0) : 0,
        irrf = Math.max(0,irrfFull-priorIrrf),
        admissionDay = c.admissionDate?.startsWith(month)
          ? Number(c.admissionDate.slice(8, 10))
          : 1,
        terminationDay = c.terminationDate?.startsWith(month)
          ? Number(c.terminationDate.slice(8, 10))
          : daysInMonth,
        eligibleDays = Math.max(0, terminationDay - admissionDay + 1),
        salaryFamily =
          !["vacation","thirteenth"].includes(period) &&
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
        union = ["vacation","thirteenth"].includes(period) || !c.unionMember
          ? 0
          : c.unionDiscountFrequency === "biweekly"
            ? period === "advance"
              ? Math.floor(fullUnionContribution / 2)
              : fullUnionContribution - Math.floor(fullUnionContribution / 2)
            : period === "balance"
              ? fullUnionContribution
              : 0,
        profile=profileByContract.get(c.id),dailyRateCents=Number(profile?.daily_rate_cents||Math.round(Number(profile?.base_salary_cents||0)/30)),
        productionAverageTotal=own.filter((e)=>e.composesProductionAverage).reduce((sum,e)=>sum+e.amountCents,0),
        productionAverageDays=(period==="balance"||period==="monthly")&&dailyRateCents>0?Math.max(0,productionAverageTotal/dailyRateCents-30):0,
        net = gross + salaryFamily - existingDiscounts - advanceDiscount - inss - irrf - union;
      return {
        ...c,
        gross,
        advanceDiscount,
        firstHalfDiscounts,
        inssBase,
        irrfBase,
        inss,
        inssFull,
        priorInss,
        irrf,
        irrfFull,
        priorIrrf,
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
        dailyRateCents,
        productionAverageTotal,
        productionAverageDays,
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
async function saveTaxEntries(request:Request,company:number,month:string,period:string,result:Awaited<ReturnType<typeof calculate>>){
  const db=getDb(),tenantId=tenant(request),serviceRows=await db.select({id:services.id,sourceId:services.sourceId,description:services.description,entryType:services.entryType}).from(services).where(eq(services.tenantId,tenantId));
  const find=(pattern:RegExp)=>serviceRows.find(s=>s.entryType==="deduction"&&pattern.test(s.description))?.id;
  const special=period==="vacation"?"Férias":period==="thirteenth"?"13º Salário":"",inssDescription=special?`INSS sobre ${special}`:"INSS",irrfDescription=special?`IRPF sobre ${special}`:"IRRF";
  const ids:Record<"inss"|"irrf"|"union"|"advance"|"productionAverage",number|undefined>={inss:special?find(new RegExp(`INSS.*${period==="vacation"?"F[EÉ]RIAS":"13"}`,"i")):serviceRows.find(s=>s.sourceId===600)?.id||find(/\bINSS\b/i),irrf:special?find(new RegExp(`IR(R?F|PF).*${period==="vacation"?"F[EÉ]RIAS":"13"}`,"i")):find(/IRRF|IMPOSTO.*RENDA/i),union:find(/CONTRIBUI.*SINDICAL|SINDICATO/i),advance:find(/ADIANTAMENTO|VALE\s*SAL[AÁ]RIO/i),productionAverage:serviceRows.find(s=>s.sourceId===120)?.id};
  const needed=[{kind:"inss" as const,description:inssDescription,use:result.rows.some(r=>r.inss>0)},{kind:"irrf" as const,description:irrfDescription,use:result.rows.some(r=>r.irrf>0)},{kind:"union" as const,description:"Contribuição sindical",use:!special&&result.rows.some(r=>r.union>0)},{kind:"advance" as const,description:"Adiantamento salarial",use:!special&&period!=="advance"&&result.rows.some(r=>r.advanceDiscount>0)}];
  let nextSource=Math.max(0,...serviceRows.map(row=>row.sourceId))+1;
  if(nextSource===120)nextSource++;
  for(const item of needed)if(item.use&&!ids[item.kind]){const sourceId=item.kind==="inss"&&!special?600:nextSource++;const created=await db.insert(services).values({tenantId,sourceId,description:item.description,entryType:"deduction"}).returning({id:services.id});ids[item.kind]=created[0]?.id}
  if(period==="monthly"||period==="balance"){
    if(!ids.productionAverage){const created=await db.insert(services).values({tenantId,sourceId:120,description:"Média de produção em diárias",entryType:"special",active:true}).returning({id:services.id});ids.productionAverage=created[0]?.id}
    else await db.update(services).set({description:"Média de produção em diárias",entryType:"special",active:true}).where(and(eq(services.tenantId,tenantId),eq(services.id,ids.productionAverage)));
  }
  const [year,value]=month.split("-").map(Number),lastDay=new Date(Date.UTC(year,value,0)).getUTCDate(),entryDate=period==="advance"?`${month}-15`:`${month}-${String(lastDay).padStart(2,"0")}`;
  const periodLabel=period==="advance"?"quinzenal":period==="vacation"?"férias":period==="thirteenth"?"13º salário":"mensal";
  for(const tax of ["INSS","IRRF"] as const){const note=`Gerado automaticamente - ${tax} ${periodLabel}`;await db.delete(dailyEntries).where(and(eq(dailyEntries.tenantId,tenantId),eq(dailyEntries.companySourceId,company),eq(dailyEntries.entryDate,entryDate),eq(dailyEntries.notes,note)))}
  if(ids.productionAverage&&(period==="monthly"||period==="balance"))await db.delete(dailyEntries).where(and(eq(dailyEntries.tenantId,tenantId),eq(dailyEntries.companySourceId,company),eq(dailyEntries.entryDate,entryDate),eq(dailyEntries.serviceId,ids.productionAverage)));
  for(const row of result.rows){
    for(const [kind,amount] of [["inss",row.inss],["irrf",row.irrf],["union",row.union],["advance",row.advanceDiscount]] as const){const serviceId=ids[kind];if(!serviceId||amount<=0||(kind==="advance"&&period==="advance"))continue;await db.insert(dailyEntries).values({tenantId,companySourceId:company,entryDate,contractId:row.id,serviceId,quantity:"1",unitPriceCents:0,amountCents:0,discountCents:amount,notes:`Gerado automaticamente - ${kind.toUpperCase()} ${periodLabel}`}).onConflictDoUpdate({target:[dailyEntries.tenantId,dailyEntries.companySourceId,dailyEntries.entryDate,dailyEntries.contractId,dailyEntries.serviceId],set:{quantity:"1",unitPriceCents:0,amountCents:0,discountCents:amount,notes:`Gerado automaticamente - ${kind.toUpperCase()} ${periodLabel}`}})}
    if(ids.productionAverage&&(period==="monthly"||period==="balance")){const quantity=Math.max(0,Number(row.productionAverageDays||0)),unit=Math.max(0,Number(row.dailyRateCents||0)),amount=Math.round(quantity*unit),notes="Acumulador histórico - Média de produção em diárias";if(amount>0)await db.insert(dailyEntries).values({tenantId,companySourceId:company,entryDate,contractId:row.id,serviceId:ids.productionAverage,quantity:quantity.toFixed(4),unitPriceCents:unit,amountCents:amount,discountCents:0,notes})}
  }
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
        u.searchParams.get("month") || brazilMonth(),
      requestedPeriod=u.searchParams.get("period"),
      period=requestedPeriod==="advance"?"advance":requestedPeriod==="vacation"?"vacation":requestedPeriod==="thirteenth"?"thirteenth":"balance";
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
    await saveTaxEntries(request,Number(b.companySourceId),b.month,b.period,result);
    return Response.json({
      ok: true,
      message: "Tributos gerados e lançados na folha. O INSS automático foi vinculado ao serviço 600; lançamentos automáticos anteriores da competência foram substituídos.",
      result,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao fechar a folha." },
      { status: 500 },
    );
  }
}
