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
  if (getSupabaseConfig()) return cloudServicesGet();
  try {
    await ensureDatabase();
    const db = getDb(),
      tenantId = tenant(r),
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
export async function POST(r: Request) {
  const access = await authorizeCloud(r, "Serviços");
  if (access.response) return access.response;
  if (getSupabaseConfig()) return cloudServicesPost(r);
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
    const values = {
      groupSourceId: Number(b.groupSourceId) || null,
      description,
      unitSourceId: Number(b.unitSourceId) || null,
      fgts: !!b.fgts,
      fgts13: !!b.fgts13,
      inss: !!b.inss,
      inss13: !!b.inss13,
      irrf: !!b.irrf,
      rais: !!b.rais,
      formulaCode: String(b.formulaCode || "").trim() || null,
      entryType: normalizeNature(b.nature ?? b.entryType),
      groupName: String(b.groupName || "").trim() || null,
      unitName: String(b.unitName || "").trim() || null,
      affectsDsr: !!b.affectsDsr,
      composesProductionAverage: !!b.composesProductionAverage,
      active: b.active !== false,
    };
    const id = Number(b.id);
    if (id)
      await db
        .update(services)
        .set(values)
        .where(and(eq(services.tenantId, tenantId), eq(services.id, id)));
    else {
      const [last] = await db
        .select({ value: max(services.sourceId) })
        .from(services)
        .where(eq(services.tenantId, tenantId));
      await db
        .insert(services)
        .values({ tenantId, sourceId: (last.value || 0) + 1, ...values });
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
  irrf: row.irrf_incidence,
  rais: row.rais_incidence,
  formulaCode: row.formula_code,
  entryType: normalizeNature(row.entry_type),
  nature: normalizeNature(row.entry_type),
  groupName: row.group_name,
  unitName: row.unit_name,
  affectsDsr: row.affects_dsr,
  composesProductionAverage: row.composes_production_average,
  active: row.active,
  usageCount: Number(row.daily_entries?.[0]?.count || 0),
});

async function cloudServicesGet() {
  const config = getSupabaseConfig()!;
  try {
    const rows = await supabaseAdmin.get<CloudService[]>(
      `/rest/v1/services?select=*,daily_entries(count)&organization_id=eq.${config.organizationId}&order=description.asc`,
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

async function cloudServicesPost(request: Request) {
  const config = getSupabaseConfig()!;
  try {
    const body = (await request.json()) as Record<string, unknown>;
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
    if (!id && !legacyId) {
      const last = await supabaseAdmin.get<Array<{ legacy_id: number }>>(
        `/rest/v1/services?select=legacy_id&organization_id=eq.${config.organizationId}&order=legacy_id.desc&limit=1`,
      );
      legacyId = Number(last[0]?.legacy_id || 0) + 1;
    }
    const values = {
      organization_id: config.organizationId,
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
      formula_code: String(body.formulaCode || "").trim() || null,
      entry_type: normalizeNature(body.nature ?? body.entryType),
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
