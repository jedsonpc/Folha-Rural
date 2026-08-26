import { and, asc, eq, max } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { authorizeCloud } from "../../auth-cloud";
import { dailyEntries, services } from "../../../db/schema";
import {
  getSupabaseConfig,
  supabaseAdmin,
} from "../../../db/supabase";
const tenant = (r: Request) =>
  r.headers.get("oai-authenticated-user-email")?.toLowerCase() || "local-owner";
export async function GET(r: Request) {
  const access = await authorizeCloud(r, "Serviços");
  if (access.response) return access.response;
  const company = Number(new URL(r.url).searchParams.get("company"));
  if (getSupabaseConfig()) {
    if (!company || (access.user?.companyIds && !access.user.companyIds.includes(company))) return Response.json({ error: "Empresa não autorizada." }, { status: 403 });
    return cloudServicesGet(company);
  }
  try {
    await ensureDatabase();
    const db = getDb(),
      tenantId = tenant(r);
    const legacyVacationThird = await db.select({id:services.id,description:services.description}).from(services).where(and(eq(services.tenantId,tenantId),eq(services.sourceId,103)));
    const reserved105 = await db.select({id:services.id}).from(services).where(and(eq(services.tenantId,tenantId),eq(services.sourceId,105)));
    if (!reserved105.length && legacyVacationThird.some((service)=>/1\s*\/\s*3\s+de\s+f[eé]rias/i.test(service.description)))
      await db.update(services).set({sourceId:105}).where(and(eq(services.tenantId,tenantId),eq(services.id,legacyVacationThird[0].id)));
    const
      rows = await db
        .select()
        .from(services)
        .where(eq(services.tenantId, tenantId))
        .orderBy(asc(services.description)),
      entries = await db
        .select({ serviceId: dailyEntries.serviceId })
        .from(dailyEntries)
        .where(eq(dailyEntries.tenantId, tenantId)),
      usage = new Map<number, number>();
    entries.forEach((e) =>
      usage.set(e.serviceId, (usage.get(e.serviceId) || 0) + 1),
    );
    return Response.json({
      services: rows.map((s) => {
        const entryType = normalizeNature(s.entryType);
        return {
          ...s,
          entryType,
          nature: entryType,
          usageCount: usage.get(s.id) || 0,
        };
      }),
    });
  } catch (e) {
    return Response.json(
      {
        error: e instanceof Error ? e.message : "Falha ao consultar serviços.",
      },
      { status: 500 },
    );
  }
}
const normalizeNature = (value: unknown) => {
  const nature = String(value || "earning")
    .trim()
    .toLowerCase();
  if (["special", "especial", "e", "3"].includes(nature)) return "special";
  return ["deduction", "desconto", "discount", "d", "2"].includes(nature)
    ? "deduction"
    : "earning";
};
const INSS_VACATION_MARKER="[INSS_FERIAS]",IRRF_VACATION_MARKER="[IRPF_FERIAS]";
const formulaWithoutVacationMarkers=(value:unknown)=>String(value||"").replaceAll(INSS_VACATION_MARKER,"").replaceAll(IRRF_VACATION_MARKER,"").trim();
const formulaWithVacationMarkers=(value:unknown,inssVacation:boolean,irrfVacation:boolean)=>[formulaWithoutVacationMarkers(value),inssVacation?INSS_VACATION_MARKER:"",irrfVacation?IRRF_VACATION_MARKER:""].filter(Boolean).join(" ");
export async function POST(r: Request) {
  const access = await authorizeCloud(r, "Serviços");
  if (access.response) return access.response;
  if (getSupabaseConfig()) return cloudServicesPost(r, access.user?.companyIds);
  try {
    await ensureDatabase();
    const db = getDb(),
      tenantId = tenant(r),
      b = (await r.json()) as Record<string, unknown>,
      action = String(b.action || "save");
    if (action === "delete") {
      const id = Number(b.id),
        used = await db
          .select({ id: dailyEntries.id })
          .from(dailyEntries)
          .where(
            and(
              eq(dailyEntries.tenantId, tenantId),
              eq(dailyEntries.serviceId, id),
            ),
          )
          .limit(1);
      if (used.length)
        return Response.json(
          {
            error:
              "Este serviço possui lançamentos e não pode ser excluído. Você pode inativá-lo.",
          },
          { status: 409 },
        );
      await db
        .delete(services)
        .where(and(eq(services.tenantId, tenantId), eq(services.id, id)));
      return Response.json({ ok: true });
    }
    const description = String(b.description || "").trim();
    if (!description)
      return Response.json(
        { error: "Informe a descrição do serviço." },
        { status: 400 },
      );
    const id = Number(b.id),requestedSourceId=Number(b.sourceId||0);
    if (b.sourceId!==undefined && b.sourceId!=="" && (!Number.isInteger(requestedSourceId)||requestedSourceId<=0))
      return Response.json({error:"Informe um código de serviço inteiro e maior que zero."},{status:400});
    if (requestedSourceId) {
      const duplicate=await db.select({id:services.id}).from(services).where(and(eq(services.tenantId,tenantId),eq(services.sourceId,requestedSourceId)));
      if (duplicate.some((service)=>service.id!==id)) return Response.json({error:`O código ${requestedSourceId} já está sendo usado por outro serviço.`},{status:409});
    }
    const values = {
      groupSourceId: Number(b.groupSourceId) || null,
      description,
      unitSourceId: Number(b.unitSourceId) || null,
      fgts: !!b.fgts,
      fgts13: !!b.fgts13,
      inss: !!b.inss,
      inss13: !!b.inss13,
      inssVacation: !!b.inssVacation,
      irrfVacation: !!b.irrfVacation,
      irrf: !!b.irrf,
      rais: !!b.rais,
      formulaCode: String(b.formulaCode || "").trim() || null,
      entryType: normalizeNature(b.entryType ?? b.nature),
      groupName: String(b.groupName || "").trim() || null,
      unitName: String(b.unitName || "").trim() || null,
      affectsDsr: !!b.affectsDsr,
      composesProductionAverage: !!b.composesProductionAverage,
      active: b.active !== false,
    };
    if (id)
      await db
        .update(services)
        .set({...values,...(requestedSourceId?{sourceId:requestedSourceId}:{})})
        .where(and(eq(services.tenantId, tenantId), eq(services.id, id)));
    else {
      const [last] = await db
        .select({ value: max(services.sourceId) })
        .from(services)
        .where(eq(services.tenantId, tenantId));
      await db
        .insert(services)
        .values({ tenantId, sourceId: requestedSourceId || (last.value || 0) + 1, ...values });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao salvar serviço." },
      { status: 500 },
    );
  }
}

type CloudService = {
  id: string;
  legacy_id: number;
  group_legacy_id: number | null;
  description: string;
  unit_legacy_id: number | null;
  fgts_incidence: boolean;
  fgts_13_incidence: boolean;
  inss_incidence: boolean;
  inss_13_incidence: boolean;
  inss_vacation_incidence: boolean;
  irrf_vacation_incidence: boolean;
  irrf_incidence: boolean;
  rais_incidence: boolean;
  formula_code: string | null;
  entry_type: string;
  group_name: string | null;
  unit_name: string | null;
  affects_dsr: boolean;
  composes_production_average: boolean;
  active: boolean;
  daily_entries?: Array<{ count: number }>;
};

const serviceResponse = (row: CloudService) => ({
  id: row.id,
  sourceId: Number(row.legacy_id),
  groupSourceId: row.group_legacy_id,
  description: row.description,
  unitSourceId: row.unit_legacy_id,
  fgts: row.fgts_incidence,
  fgts13: row.fgts_13_incidence,
  inss: row.inss_incidence,
  inss13: row.inss_13_incidence,
  inssVacation: Boolean(row.inss_vacation_incidence)||String(row.formula_code||"").includes(INSS_VACATION_MARKER),
  irrfVacation: Boolean(row.irrf_vacation_incidence)||String(row.formula_code||"").includes(IRRF_VACATION_MARKER),
  irrf: row.irrf_incidence,
  rais: row.rais_incidence,
  formulaCode: formulaWithoutVacationMarkers(row.formula_code),
  entryType: normalizeNature(row.entry_type),
  nature: normalizeNature(row.entry_type),
  groupName: row.group_name,
  unitName: row.unit_name,
  affectsDsr: row.affects_dsr,
  composesProductionAverage: row.composes_production_average,
  active: row.active,
  usageCount: Number(row.daily_entries?.[0]?.count || 0),
});

async function cloudCompanyId(sourceId: number) {
  const config = getSupabaseConfig()!;
  const rows = await supabaseAdmin.get<Array<{id:string}>>(`/rest/v1/companies?select=id&organization_id=eq.${config.organizationId}&legacy_id=eq.${sourceId}&limit=1`);
  return rows[0]?.id;
}
async function cloudServicesGet(companySourceId: number) {
  const config = getSupabaseConfig()!;
  try {
    const companyId = await cloudCompanyId(companySourceId);
    if (!companyId) return Response.json({ error: "Empresa não encontrada." }, { status: 404 });
    const legacyVacationThird=await supabaseAdmin.get<Array<{id:string;description:string}>>(`/rest/v1/services?select=id,description&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}&legacy_id=eq.103`);
    const reserved105=await supabaseAdmin.get<Array<{id:string}>>(`/rest/v1/services?select=id&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}&legacy_id=eq.105&limit=1`);
    if (!reserved105.length && legacyVacationThird.some((service)=>/1\s*\/\s*3\s+de\s+f[eé]rias/i.test(service.description)))
      await supabaseAdmin.patch(`/rest/v1/services?id=eq.${legacyVacationThird[0].id}&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}`,{legacy_id:105},{prefer:"return=minimal"});
    const rows = await supabaseAdmin.get<CloudService[]>(
      `/rest/v1/services?select=*,daily_entries(count)&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}&order=description.asc`,
    );
    return Response.json({
      services: rows.map(serviceResponse),
      dataSource: "supabase",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar serviços no Supabase.",
      },
      { status: 500 },
    );
  }
}

async function cloudServicesPost(request: Request, allowedCompanies?: number[] | null) {
  const config = getSupabaseConfig()!;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const companySourceId = Number(body.companySourceId || 0);
    if (!companySourceId || (allowedCompanies && !allowedCompanies.includes(companySourceId))) return Response.json({ error: "Empresa não autorizada." }, { status: 403 });
    const companyId = await cloudCompanyId(companySourceId);
    if (!companyId) return Response.json({ error: "Empresa não encontrada." }, { status: 404 });
    const action = String(body.action || "save");
    const id = String(body.id || "");
    if (action === "delete") {
      const used = await supabaseAdmin.get<Array<{ id: string }>>(
        `/rest/v1/daily_entries?select=id&organization_id=eq.${config.organizationId}&service_id=eq.${id}&limit=1`,
      );
      if (used.length)
        return Response.json(
          {
            error:
              "Este serviço possui lançamentos e não pode ser excluído. Você pode inativá-lo.",
          },
          { status: 409 },
        );
      await supabaseAdmin.delete(
        `/rest/v1/services?id=eq.${id}&organization_id=eq.${config.organizationId}`,
      );
      return Response.json({ ok: true });
    }
    const description = String(body.description || "").trim();
    if (!description)
      return Response.json(
        { error: "Informe a descrição do serviço." },
        { status: 400 },
      );
    let legacyId = Number(body.sourceId || 0);
    if (body.sourceId!==undefined && body.sourceId!=="" && (!Number.isInteger(legacyId)||legacyId<=0))
      return Response.json({error:"Informe um código de serviço inteiro e maior que zero."},{status:400});
    if (!id && !legacyId) {
      const last = await supabaseAdmin.get<Array<{ legacy_id: number }>>(
        `/rest/v1/services?select=legacy_id&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}&order=legacy_id.desc&limit=1`,
      );
      legacyId = Number(last[0]?.legacy_id || 0) + 1;
    }
    if (legacyId) {
      const duplicate=await supabaseAdmin.get<Array<{id:string}>>(`/rest/v1/services?select=id&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}&legacy_id=eq.${legacyId}`);
      if (duplicate.some((service)=>service.id!==id)) return Response.json({error:`O código ${legacyId} já está sendo usado por outro serviço.`},{status:409});
    }
    const values = {
      organization_id: config.organizationId,
      company_id: companyId,
      legacy_id: legacyId,
      group_legacy_id: Number(body.groupSourceId) || null,
      description,
      unit_legacy_id: Number(body.unitSourceId) || null,
      fgts_incidence: Boolean(body.fgts),
      fgts_13_incidence: Boolean(body.fgts13),
      inss_incidence: Boolean(body.inss),
      inss_13_incidence: Boolean(body.inss13),
      irrf_incidence: Boolean(body.irrf),
      rais_incidence: Boolean(body.rais),
      formula_code: formulaWithVacationMarkers(body.formulaCode,Boolean(body.inssVacation),Boolean(body.irrfVacation)) || null,
      entry_type: normalizeNature(body.entryType ?? body.nature),
      group_name: String(body.groupName || "").trim() || null,
      unit_name: String(body.unitName || "").trim() || null,
      affects_dsr: Boolean(body.affectsDsr),
      composes_production_average: Boolean(body.composesProductionAverage),
      active: body.active !== false,
    };
    if (id)
      await supabaseAdmin.patch(
        `/rest/v1/services?id=eq.${id}&organization_id=eq.${config.organizationId}`,
        values,
        { prefer: "return=minimal" },
      );
    else
      await supabaseAdmin.post("/rest/v1/services", values, {
        prefer: "return=minimal",
      });
    return Response.json({ ok: true, dataSource: "supabase" });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao salvar serviço no Supabase.",
      },
      { status: 500 },
    );
  }
}
