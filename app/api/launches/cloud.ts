import {
  getSupabaseConfig,
  supabaseAdmin,
} from "../../../db/supabase";
import { authorizeCloud } from "../../auth-cloud";

type Row = Record<string, any>;
const nextMonth = (month: string) => {
  const [year, value] = month.split("-").map(Number);
  return `${value === 12 ? year + 1 : year}-${String(value === 12 ? 1 : value + 1).padStart(2, "0")}-01`;
};

export async function cloudLaunchesGet(request: Request) {
  const config = getSupabaseConfig()!;
  const url = new URL(request.url);
  const companyLegacyId = Number(url.searchParams.get("company"));
  const month =
    url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const reportOnly = url.searchParams.get("report") === "1";
  const access = await authorizeCloud(
    request,
    "Apontamentos",
    companyLegacyId,
  );
  if (access.response) return access.response;
  if (!companyLegacyId)
    return Response.json({ error: "Selecione uma empresa." }, { status: 400 });
  try {
    const companies = await supabaseAdmin.get<Array<{ id: string }>>(
      `/rest/v1/companies?select=id&organization_id=eq.${config.organizationId}&legacy_id=eq.${companyLegacyId}&limit=1`,
    );
    const companyId = companies[0]?.id;
    if (!companyId)
      return Response.json(
        { error: "Empresa não encontrada." },
        { status: 404 },
      );
    const start = `${month}-01`;
    const end = nextMonth(month);
    const [contracts, profiles, salaryHistory, services, entries, holidays] = await Promise.all([
      supabaseAdmin.get<Row[]>(
        `/rest/v1/employment_contracts?select=*,people(full_name,cpf,pis,birth_date,identity_number)&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}&order=created_at.asc`,
      ),
      supabaseAdmin.get<Row[]>(
        `/rest/v1/worker_payroll_profiles?select=contract_id,salary_type,base_salary_cents,daily_rate_cents&organization_id=eq.${config.organizationId}`,
      ),
      supabaseAdmin.get<Row[]>(
        `/rest/v1/salary_history?select=contract_id,effective_date,salary_cents&organization_id=eq.${config.organizationId}&effective_date=lt.${end}&order=effective_date.asc,created_at.asc`,
      ),
      supabaseAdmin.get<Row[]>(
        `/rest/v1/services?select=*&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}&order=description.asc`,
      ),
      supabaseAdmin.get<Row[]>(
        `/rest/v1/daily_entries?select=*&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}&entry_date=gte.${start}&entry_date=lt.${end}&order=entry_date.asc`,
      ),
      reportOnly ? Promise.resolve([]) : supabaseAdmin.get<Row[]>(
        `/rest/v1/holidays?select=*&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}&holiday_date=gte.${start}&holiday_date=lt.${end}&order=holiday_date.asc`,
      ),
    ]);
    return Response.json({
      month,
      contracts: contracts.map((row) => {
        const profile=profiles.find(profile=>profile.contract_id===row.id),latestSalary=salaryHistory.filter(item=>item.contract_id===row.id).at(-1),baseSalaryCents=Number(latestSalary?.salary_cents||profile?.base_salary_cents||0),monthly=profile?.salary_type==="monthly";
        return ({
        id: row.id,
        name: row.people?.full_name,
        cpf: row.people?.cpf,
        pis: row.people?.pis,
        birthDate: row.people?.birth_date,
        identityNumber: row.people?.identity_number,
        registrationNumber: row.registration_number,
        legacyCode: row.legacy_code,
        status: row.status,
        admissionDate: row.admission_date,
        terminationDate: row.termination_date,
        role: row.role_name,
        paymentType: monthly?"monthly":"production",
        baseSalaryCents,
        dailyRateCents: monthly?Math.round(baseSalaryCents/30):Number(profile?.daily_rate_cents||0),
      })}),
      services: services.map((row) => ({
        id: row.id,
        sourceId: row.legacy_id,
        description: row.description,
        formulaCode: row.formula_code,
        entryType: row.entry_type,
        inssIncidence: Boolean(row.inss_incidence),
        fgtsIncidence: Boolean(row.fgts_incidence),
        unitName: row.unit_name,
        affectsDsr: row.affects_dsr,
        composesProductionAverage: row.composes_production_average,
        active: row.active,
      })),
      entries: entries.map((row) => ({
        id: row.id,
        companySourceId: companyLegacyId,
        entryDate: row.entry_date,
        contractId: row.contract_id,
        serviceId: row.service_id,
        quantity: String(row.quantity),
        unitPriceCents: Number(row.unit_price_cents),
        amountCents: Number(row.amount_cents),
        discountCents: Number(row.discount_cents || 0),
        sourceSequence: row.source_sequence,
        notes: row.notes,
        clonedFromId: row.cloned_from_id,
      })),
      holidays: holidays.map((row) => ({
        id: row.id,
        companySourceId: companyLegacyId,
        holidayDate: row.holiday_date,
        name: row.name,
      })),
      dataSource: "supabase",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar apontamentos no Supabase.",
      },
      { status: 500 },
    );
  }
}

export async function cloudLaunchesPost(request: Request) {
  const config = getSupabaseConfig()!;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const companyLegacyId = Number(body.companySourceId);
    const access = await authorizeCloud(
      request,
      "Apontamentos",
      companyLegacyId,
    );
    if (access.response) return access.response;
    if (!companyLegacyId)
      return Response.json({ error: "Selecione uma empresa." }, { status: 400 });
    if(body.action==="clone"){
      const source=String(body.sourceDate||""),target=String(body.targetDate||"");
      if(!/^20\d{2}-\d{2}-\d{2}$/.test(source)||!/^20\d{2}-\d{2}-\d{2}$/.test(target)||Number(target.slice(0,4))>2100||source===target)return Response.json({error:"Informe duas datas válidas e diferentes, entre os anos 2000 e 2100."},{status:400});
      const companies=await supabaseAdmin.get<Array<{id:string}>>(`/rest/v1/companies?select=id&organization_id=eq.${config.organizationId}&legacy_id=eq.${companyLegacyId}&limit=1`),companyId=companies[0]?.id;
      if(!companyId)return Response.json({error:"Empresa não encontrada."},{status:404});
      const sourceRows=await supabaseAdmin.get<Row[]>(`/rest/v1/daily_entries?select=id,contract_id,service_id,quantity,unit_price_cents,amount_cents,discount_cents,notes&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}&entry_date=eq.${source}`);
      if(!sourceRows.length)return Response.json({error:"O dia de origem não possui lançamentos salvos."},{status:404});
      await supabaseAdmin.post("/rest/v1/daily_entries?on_conflict=organization_id,company_id,entry_date,contract_id,service_id",sourceRows.map(row=>({organization_id:config.organizationId,company_id:companyId,entry_date:target,contract_id:row.contract_id,service_id:row.service_id,quantity:row.quantity,unit_price_cents:Number(row.unit_price_cents),amount_cents:Number(row.amount_cents),discount_cents:Number(row.discount_cents||0),notes:row.notes,cloned_from_id:row.id})),{Prefer:"resolution=merge-duplicates,return=minimal"});
      return Response.json({ok:true,message:`${sourceRows.length} lançamentos clonados ou atualizados em ${target.split("-").reverse().join("/")}.`,affected:sourceRows.length});
    }
    if(body.action==="updateEntry"){
      const id=String(body.id||""),date=String(body.entryDate||""),contractId=String(body.contractId||""),serviceId=String(body.serviceId||""),quantity=Number(body.quantity),unit=Math.round(Number(body.unitPrice)*100);
      if(!id||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||!contractId||!serviceId||quantity<=0||unit<0)return Response.json({error:"Preencha data, colaborador, serviço, quantidade e valor."},{status:400});
      const companies=await supabaseAdmin.get<Array<{id:string}>>(`/rest/v1/companies?select=id&organization_id=eq.${config.organizationId}&legacy_id=eq.${companyLegacyId}&limit=1`),companyId=companies[0]?.id;
      if(!companyId)return Response.json({error:"Empresa não encontrada."},{status:404});
      await supabaseAdmin.patch(`/rest/v1/daily_entries?id=eq.${id}&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}`,{entry_date:date,contract_id:contractId,service_id:serviceId,quantity,unit_price_cents:unit,amount_cents:Math.round(quantity*unit)});
      return Response.json({ok:true,message:"Apontamento atualizado."});
    }
    if(body.action==="delete"){
      const id=String(body.id||"");
      if(!id)return Response.json({error:"Lançamento inválido para exclusão."},{status:400});
      const companies=await supabaseAdmin.get<Array<{id:string}>>(`/rest/v1/companies?select=id&organization_id=eq.${config.organizationId}&legacy_id=eq.${companyLegacyId}&limit=1`),companyId=companies[0]?.id;
      if(!companyId)return Response.json({error:"Empresa não encontrada."},{status:404});
      await supabaseAdmin.patch(`/rest/v1/daily_entries?organization_id=eq.${config.organizationId}&company_id=eq.${companyId}&cloned_from_id=eq.${id}`,{cloned_from_id:null});
      await supabaseAdmin.delete(`/rest/v1/daily_entries?id=eq.${id}&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}`);
      return Response.json({ok:true,message:"Lançamento excluído. Os apontamentos clonados foram preservados."});
    }
    const result = await supabaseAdmin.post<
      Array<{ ok: boolean; message: string; affected: number }>
    >("/rest/v1/rpc/folha_save_launches", {
      p_organization_id: config.organizationId,
      p_company_legacy_id: companyLegacyId,
      p_payload: body,
    });
    return Response.json(result[0] || { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = /destino já possui/i.test(message)
      ? 409
      : /origem não possui|não encontrad/i.test(message)
        ? 404
        : 500;
    return Response.json(
      {
        error:
          message.replace(/^Supabase \d+:\s*/, "") ||
          "Falha ao gravar apontamentos no Supabase.",
      },
      { status },
    );
  }
}
