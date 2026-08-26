import {
  getSupabaseConfig,
  supabaseAdmin,
} from "../../../db/supabase";
import { authorizeCloud } from "../../auth-cloud";

type Row = Record<string, any>;
type TaxBracket = {
  taxType: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  lowerCents: number;
  upperCents: number | null;
  rateBasisPoints: number;
  deductionCents: number;
};

const nextMonth = (month: string) => {
  const [year, value] = month.split("-").map(Number);
  return `${value === 12 ? year + 1 : year}-${String(value === 12 ? 1 : value + 1).padStart(2, "0")}-01`;
};

const bounds = (month: string, period: string) =>
  period === "advance"
    ? [`${month}-01`, `${month}-16`]
    : [`${month}-01`, nextMonth(month)];

const progressive = (
  base: number,
  rows: Array<{
    lowerCents: number;
    upperCents: number | null;
    rateBasisPoints: number;
  }>,
) =>
  Math.round(
    rows.reduce((sum, row) => {
      const lower = Math.max(0, row.lowerCents - 1);
      const upper = row.upperCents ?? base;
      const taxable = Math.max(0, Math.min(base, upper) - lower);
      return sum + (taxable * row.rateBasisPoints) / 10000;
    }, 0),
  );

async function pagedGet(path: string) {
  const rows: Row[] = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let offset = 0; ; offset += 1000) {
    const page = await supabaseAdmin.get<Row[]>(
      `${path}${separator}limit=1000&offset=${offset}`,
    );
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function companyId(organizationId: string, legacyId: number) {
  const rows = await supabaseAdmin.get<Array<{ id: string }>>(
    `/rest/v1/companies?select=id&organization_id=eq.${organizationId}&legacy_id=eq.${legacyId}&limit=1`,
  );
  return rows[0]?.id;
}

async function calculateCloud(
  companyLegacyId: number,
  month: string,
  requestedPeriod: string,
) {
  const config = getSupabaseConfig()!;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("Competência inválida.");
  const resolvedCompanyId = await companyId(
    config.organizationId,
    companyLegacyId,
  );
  if (!resolvedCompanyId) throw new Error("Empresa não encontrada.");

  const period = requestedPeriod === "advance" ? "advance" : "balance";
  const [start, end] = bounds(month, period);
  const monthStart = `${month}-01`;
  const monthEnd = nextMonth(month);
  const effective = monthStart;
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  const [contracts, services, monthlyEntries, brackets, dependentRows, rates] =
    await Promise.all([
      pagedGet(
        `/rest/v1/employment_contracts?select=id,person_id,registration_number,admission_date,termination_date,union_member,union_discount_cents,union_id,union_discount_frequency,family_dependents,irrf_dependents,people(full_name),unions(contribution_cents)&organization_id=eq.${config.organizationId}&company_id=eq.${resolvedCompanyId}&order=registration_number.asc.nullslast`,
      ),
      pagedGet(
        `/rest/v1/services?select=id,description,inss_incidence,irrf_incidence&organization_id=eq.${config.organizationId}`,
      ),
      pagedGet(
        `/rest/v1/daily_entries?select=contract_id,service_id,entry_date,amount_cents,discount_cents,notes&organization_id=eq.${config.organizationId}&company_id=eq.${resolvedCompanyId}&entry_date=gte.${monthStart}&entry_date=lt.${monthEnd}&order=entry_date.asc`,
      ),
      pagedGet(
        `/rest/v1/tax_brackets?select=tax_type,effective_from,effective_to,lower_cents,upper_cents,rate_basis_points,deduction_cents&organization_id=eq.${config.organizationId}`,
      ),
      pagedGet(
        `/rest/v1/dependents?select=person_id,birth_date,disabled,salary_family_eligible,irrf_dependent&organization_id=eq.${config.organizationId}`,
      ),
      pagedGet(
        `/rest/v1/union_contribution_rates?select=union_id,effective_from,contribution_cents&organization_id=eq.${config.organizationId}`,
      ),
    ]);

  const serviceById = new Map(services.map((row) => [row.id, row]));
  const entries = monthlyEntries.filter(
    (row) => row.entry_date >= start && row.entry_date < end,
  );
  const normalizedBrackets: TaxBracket[] = brackets.map((row) => ({
    taxType: row.tax_type,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    lowerCents: Number(row.lower_cents),
    upperCents: row.upper_cents == null ? null : Number(row.upper_cents),
    rateBasisPoints: Number(row.rate_basis_points),
    deductionCents: Number(row.deduction_cents),
  }));
  const valid = (type: string) =>
    normalizedBrackets
      .filter(
        (row) =>
          row.taxType === type &&
          row.effectiveFrom <= effective &&
          (!row.effectiveTo || row.effectiveTo >= effective),
      )
      .sort((a, b) => a.lowerCents - b.lowerCents);
  const inssRows = valid("INSS");
  const irrfRows = valid("IRRF");
  const family = valid("SALARY_FAMILY")[0];
  const groupBy = <T extends Row>(rows: T[], key: (row: T) => string) => {
    const grouped = new Map<string, T[]>();
    for (const row of rows) {
      const value = key(row), list = grouped.get(value);
      if (list) list.push(row);
      else grouped.set(value, [row]);
    }
    return grouped;
  };
  const entriesByContract = groupBy(entries, (row) => String(row.contract_id));
  const monthlyByContract = groupBy(monthlyEntries, (row) => String(row.contract_id));
  const dependentsByPerson = groupBy(dependentRows, (row) => String(row.person_id));
  const ratesByUnion = groupBy(rates, (row) => String(row.union_id));

  const resultRows = contracts
    .map((contract) => {
      const own = entriesByContract.get(String(contract.id)) || [];
      const contractMonthlyEntries = monthlyByContract.get(String(contract.id)) || [];
      const contractDependents = dependentsByPerson.get(String(contract.person_id)) || [];
      const familyDependentCount = contractDependents.filter((dependent) => {
        if (
          dependent.person_id !== contract.person_id ||
          !dependent.salary_family_eligible
        )
          return false;
        if (dependent.disabled) return true;
        if (!dependent.birth_date) return false;
        const birth = new Date(`${dependent.birth_date}T00:00:00Z`);
        const age =
          year -
          birth.getUTCFullYear() -
          (monthNumber - 1 < birth.getUTCMonth() ||
          (monthNumber - 1 === birth.getUTCMonth() &&
            daysInMonth < birth.getUTCDate())
            ? 1
            : 0);
        return age < 14;
      }).length;
      const irrfDependentCount = contractDependents.filter(
        (dependent) =>
          dependent.person_id === contract.person_id &&
          dependent.irrf_dependent,
      ).length;
      const gross = own.reduce(
        (sum, entry) => sum + Number(entry.amount_cents),
        0,
      );
      const firstHalfGross = contractMonthlyEntries
        .filter((entry) => entry.entry_date < `${month}-16`)
        .reduce((sum, entry) => sum + Number(entry.amount_cents), 0);
      const firstHalfDiscounts = contractMonthlyEntries
        .filter((entry) => entry.entry_date < `${month}-16`)
        .reduce((sum, entry) => sum + Number(entry.discount_cents || 0), 0);
      const advanceDiscount = period === "balance" ? Math.max(0, firstHalfGross - firstHalfDiscounts) : 0;
      const existingDiscounts = own.reduce(
        (sum, entry) => String(entry.notes || "").startsWith("Gerado automaticamente -") ? sum : sum + Number(entry.discount_cents || 0),
        0,
      );
      const inssBase = own
        .filter((entry) => serviceById.get(entry.service_id)?.inss_incidence)
        .reduce((sum, entry) => sum + Number(entry.amount_cents), 0);
      const irrfGross = own
        .filter((entry) => serviceById.get(entry.service_id)?.irrf_incidence)
        .reduce((sum, entry) => sum + Number(entry.amount_cents), 0);
      const monthlyRemuneration = contractMonthlyEntries
        .filter((entry) => serviceById.get(entry.service_id)?.inss_incidence)
        .reduce((sum, entry) => sum + Number(entry.amount_cents), 0);
      const importedSalaryFamily = contractMonthlyEntries
        .filter((entry) =>
          /sal[aá]rio\s*[- ]?fam[ií]lia/i.test(
            String(serviceById.get(entry.service_id)?.description || ""),
          ),
        )
        .reduce((sum, entry) => sum + Number(entry.amount_cents), 0);
      const inssFull = inssRows.length ? progressive(inssBase, inssRows) : 0;
      const priorInss = period === "balance" ? own.filter(entry=>entry.entry_date<`${month}-16`&&/\bINSS\b/i.test(String(serviceById.get(entry.service_id)?.description||""))&&Number(entry.discount_cents)>0).reduce((sum,entry)=>sum+Number(entry.discount_cents),0):0;
      const inss = Math.max(0,inssFull-priorInss);
      const legalDeduction = inssFull + irrfDependentCount * 18959;
      const irrfBase = Math.max(0, irrfGross - Math.max(60720, legalDeduction));
      const irrfBracket = [...irrfRows]
        .reverse()
        .find((row) => irrfBase >= row.lowerCents);
      const irrfBeforeReduction = irrfBracket
        ? Math.max(
            0,
            Math.round(
              (irrfBase * irrfBracket.rateBasisPoints) / 10000 -
                irrfBracket.deductionCents,
            ),
          )
        : 0;
      const irrfReduction =
        effective >= "2026-01-01" && irrfGross <= 500000
          ? irrfBeforeReduction
          : effective >= "2026-01-01" && irrfGross <= 735000
            ? Math.min(
                irrfBeforeReduction,
                Math.max(0, 97862 - Math.round(irrfGross * 0.133145)),
              )
            : 0;
      const irrfFull = Math.max(0, irrfBeforeReduction - irrfReduction);
      const priorIrrf = period === "balance" ? own.filter(entry=>entry.entry_date<`${month}-16`&&/IRRF|IMPOSTO.*RENDA/i.test(String(serviceById.get(entry.service_id)?.description||""))&&Number(entry.discount_cents)>0).reduce((sum,entry)=>sum+Number(entry.discount_cents),0):0;
      const irrf = Math.max(0,irrfFull-priorIrrf);
      const admissionDay = contract.admission_date?.startsWith(month)
        ? Number(contract.admission_date.slice(8, 10))
        : 1;
      const terminationDay = contract.termination_date?.startsWith(month)
        ? Number(contract.termination_date.slice(8, 10))
        : daysInMonth;
      const eligibleDays = Math.max(0, terminationDay - admissionDay + 1);
      const salaryFamily =
        period === "balance" &&
        family &&
        importedSalaryFamily === 0 &&
        monthlyRemuneration > 0 &&
        monthlyRemuneration <= Number(family.upperCents)
          ? Math.round(
              (familyDependentCount * family.deductionCents * eligibleDays) /
                daysInMonth,
            )
          : 0;
      const effectiveUnionRate = (ratesByUnion.get(String(contract.union_id)) || [])
        .filter((rate) => rate.effective_from <= effective)
        .sort((a, b) =>
          String(a.effective_from).localeCompare(String(b.effective_from)),
        )
        .at(-1)?.contribution_cents;
      const fullUnionContribution =
        Number(
          effectiveUnionRate ?? contract.unions?.contribution_cents ?? 0,
        ) || Number(contract.union_discount_cents || 0);
      const union = !contract.union_member
        ? 0
        : contract.union_discount_frequency === "biweekly"
          ? period === "advance"
            ? Math.floor(fullUnionContribution / 2)
            : fullUnionContribution - Math.floor(fullUnionContribution / 2)
          : period === "balance"
            ? fullUnionContribution
            : 0;
      const net =
        gross + salaryFamily - existingDiscounts - advanceDiscount - inss - irrf - union;
      return {
        id: contract.id,
        personId: contract.person_id,
        name: contract.people?.full_name,
        registrationNumber: contract.registration_number,
        admissionDate: contract.admission_date,
        terminationDate: contract.termination_date,
        unionMember: contract.union_member,
        unionDiscountCents: Number(contract.union_discount_cents),
        unionId: contract.union_id,
        unionDiscountFrequency: contract.union_discount_frequency,
        familyDependents: Number(contract.family_dependents),
        irrfDependents: Number(contract.irrf_dependents),
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
      };
    })
    .filter((row) => row.gross || row.salaryFamily || row.union);

  return {
    company: companyLegacyId,
    month,
    period,
    start,
    end,
    rows: resultRows,
    officialTables: {
      inss: inssRows.length > 0,
      irrf: irrfRows.length > 0,
      salaryFamily: Boolean(family),
    },
    dataSource: "supabase",
  };
}
async function saveCloudTaxEntries(companyLegacyId:number,month:string,period:string,result:Awaited<ReturnType<typeof calculateCloud>>){
 const config=getSupabaseConfig()!,resolvedCompanyId=await companyId(config.organizationId,companyLegacyId);if(!resolvedCompanyId)throw new Error("Empresa não encontrada.");
 const serviceRows=await pagedGet(`/rest/v1/services?select=id,legacy_id,description,entry_type&organization_id=eq.${config.organizationId}&company_id=eq.${resolvedCompanyId}`),find=(pattern:RegExp)=>serviceRows.find(s=>s.entry_type==="deduction"&&pattern.test(String(s.description)))?.id,ids:Record<"inss"|"irrf"|"union"|"advance",string|undefined>={inss:serviceRows.find(s=>Number(s.legacy_id)===600)?.id||find(/\bINSS\b/i),irrf:find(/IRRF|IMPOSTO.*RENDA/i),union:find(/CONTRIBUI.*SINDICAL|SINDICATO/i),advance:find(/ADIANTAMENTO|VALE\s*SAL[AÁ]RIO/i)};
 const needed=[{kind:"inss" as const,description:"INSS",use:result.rows.some(r=>r.inss>0)},{kind:"irrf" as const,description:"IRRF",use:result.rows.some(r=>r.irrf>0)},{kind:"union" as const,description:"Contribuição sindical",use:result.rows.some(r=>r.union>0)},{kind:"advance" as const,description:"Adiantamento salarial",use:period!=="advance"&&result.rows.some(r=>r.advanceDiscount>0)}];
 let nextLegacy=Math.max(0,...serviceRows.map(row=>Number(row.legacy_id)||0))+1;
 for(const item of needed)if(item.use&&!ids[item.kind]){const legacyId=item.kind==="inss"?600:nextLegacy++;const created=await supabaseAdmin.post<Row[]>("/rest/v1/services",{organization_id:config.organizationId,company_id:resolvedCompanyId,legacy_id:legacyId,description:item.description,entry_type:"deduction",fgts_incidence:false,inss_incidence:false,irrf_incidence:false,affects_dsr:false,composes_production_average:false,active:true},{prefer:"return=representation"});ids[item.kind]=created[0]?.id;if(!ids[item.kind])throw new Error(`Não foi possível criar automaticamente o evento ${item.description}.`)}
 const [year,value]=month.split("-").map(Number),lastDay=new Date(Date.UTC(year,value,0)).getUTCDate(),entryDate=period==="advance"?`${month}-15`:`${month}-${String(lastDay).padStart(2,"0")}`,rows=[] as Row[];
 const inssNote=`Gerado automaticamente - INSS ${period==="advance"?"quinzenal":"mensal"}`;
 await supabaseAdmin.delete(`/rest/v1/daily_entries?organization_id=eq.${config.organizationId}&company_id=eq.${resolvedCompanyId}&entry_date=eq.${entryDate}&notes=eq.${encodeURIComponent(inssNote)}`);
 for(const row of result.rows)for(const [kind,amount] of [["inss",row.inss],["irrf",row.irrf],["union",row.union],["advance",row.advanceDiscount]] as const){const serviceId=ids[kind];if(serviceId&&amount>0&&!(kind==="advance"&&period==="advance"))rows.push({organization_id:config.organizationId,company_id:resolvedCompanyId,entry_date:entryDate,contract_id:row.id,service_id:serviceId,quantity:1,unit_price_cents:0,amount_cents:0,discount_cents:amount,notes:`Gerado automaticamente - ${kind.toUpperCase()} ${period==="advance"?"quinzenal":"mensal"}`})}
 if(rows.length)await supabaseAdmin.post("/rest/v1/daily_entries?on_conflict=organization_id,company_id,entry_date,contract_id,service_id",rows,{prefer:"resolution=merge-duplicates,return=minimal"});
}

export async function cloudClosingGet(request: Request) {
  const url = new URL(request.url);
  const company = Number(url.searchParams.get("company"));
  const month =
    url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const period =
    url.searchParams.get("period") === "advance" ? "advance" : "monthly";
  const access = await authorizeCloud(request, "Fechamento", company);
  if (access.response) return access.response;
  if (!company)
    return Response.json({ error: "Selecione uma empresa." }, { status: 400 });
  try {
    return Response.json(await calculateCloud(company, month, period));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao calcular o fechamento.";
    return Response.json(
      { error: message.replace(/^Supabase \d+:\s*/, "") },
      { status: /não encontrad/i.test(message) ? 404 : 500 },
    );
  }
}

export async function cloudClosingPost(request: Request) {
  const config = getSupabaseConfig()!;
  try {
    const body = (await request.json()) as {
      companySourceId: number;
      month: string;
      period: string;
    };
    const company = Number(body.companySourceId);
    const period = body.period === "advance" ? "advance" : "monthly";
    const access = await authorizeCloud(request, "Fechamento", company);
    if (access.response) return access.response;
    if (!company)
      return Response.json({ error: "Selecione uma empresa." }, { status: 400 });
    const result = await calculateCloud(company, body.month, period);
    if (!result.officialTables.inss || !result.officialTables.irrf)
      return Response.json(
        { error: "Atualize as tabelas oficiais antes de fechar." },
        { status: 409 },
      );
    const saved = await supabaseAdmin.post<
      Array<{ ok: boolean; message: string }>
    >("/rest/v1/rpc/folha_save_payroll_closing", {
      p_organization_id: config.organizationId,
      p_company_legacy_id: company,
      p_competence: body.month,
      p_period_type: period,
      p_totals: result,
    });
    await saveCloudTaxEntries(company,body.month,period,result);
    return Response.json({
      ...(saved[0] || { ok: true }),message:"Tributos gerados e lançados na folha. O INSS automático foi vinculado ao serviço 600; lançamentos automáticos anteriores da competência foram substituídos.",
      result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao fechar a folha.";
    return Response.json(
      { error: message.replace(/^Supabase \d+:\s*/, "") },
      { status: /tabelas oficiais/i.test(message) ? 409 : 500 },
    );
  }
}
