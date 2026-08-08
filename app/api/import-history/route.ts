import { Buffer } from "node:buffer";
import MDBReader from "mdb-reader";
import { eq } from "drizzle-orm";
import { ensureDatabase, getDb, getRuntimeDatabase } from "../../../db";
import { employmentContracts, services } from "../../../db/schema";
import { requireCloudAdmin } from "../../auth-cloud";
import { getSupabaseConfig, supabaseAdmin } from "../../../db/supabase";
type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const tenant = (r: Request) =>
  r.headers.get("oai-authenticated-user-email")?.toLowerCase() || "local-owner";
const isoDate = (v: unknown) => {
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
export async function POST(request: Request) {
  try {
    const cloud = getSupabaseConfig();
    if (cloud && !(await requireCloudAdmin(request)))
      return Response.json(
        { error: "A importação do Access é exclusiva de administradores." },
        { status: 403 },
      );
    if (cloud && (request.headers.get("content-type") || "").includes("application/json")) {
      const body = await request.json() as { entries?: Array<Record<string, unknown>> };
      const entries = (body.entries || []).slice(0, 500);
      const imported = entries.length ? await supabaseAdmin.post<number>("/rest/v1/rpc/folha_import_access_history", { p_organization_id: cloud.organizationId, p_entries: entries }) : 0;
      return Response.json({ ok: true, imported, received: entries.length });
    }
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 50 * 1024 * 1024)
      return Response.json(
        { error: "Arquivo Access inválido ou maior que 50 MB." },
        { status: 400 },
      );
    const tenantId = tenant(request),
      reader = new MDBReader(Buffer.from(bytes)),
      names = reader.getTableNames({
        normalTables: true,
        systemTables: false,
        linkedTables: true,
      });
    if (
      !names.includes("TB_Lançamentos") ||
      !names.includes("TB_Detalhes do Lançamento")
    )
      return Response.json(
        {
          error: "As tabelas históricas de apontamento não foram encontradas.",
        },
        { status: 422 },
      );
    const headers = reader.getTable("TB_Lançamentos").getData() as Row[],
      details = reader.getTable("TB_Detalhes do Lançamento").getData() as Row[],
      headerMap = new Map(
        headers.map((r) => [
          num(r.Sequencia),
          { company: num(r.CodDaEmpresa), date: isoDate(r.Data) },
        ]),
      );
    if (cloud) {
      let imported = 0,
        skipped = 0;
      const entries: Array<Record<string, unknown>> = [];
      const flushCloud = async () => {
        if (!entries.length) return;
        imported += await supabaseAdmin.post<number>(
          "/rest/v1/rpc/folha_import_access_history",
          {
            p_organization_id: cloud.organizationId,
            p_entries: entries.splice(0, entries.length),
          },
        );
      };
      for (const row of details) {
        const head = headerMap.get(num(row.Sequencia));
        if (!head?.date) {
          skipped++;
          continue;
        }
        const quantity = num(row.Producao),
          unitPriceCents = Math.round(num(row.Preco) * 100);
        entries.push({
          companySourceId: head.company,
          entryDate: head.date,
          sourceRegistration: num(row.Matricula),
          serviceSourceId: num(row.CodServico),
          quantity,
          unitPriceCents,
          amountCents: Math.round(quantity * unitPriceCents),
          discountCents: Math.round(num(row.Desconto) * 100),
          sourceSequence: num(row.Sequencia),
        });
        if (entries.length >= 500) await flushCloud();
      }
      await flushCloud();
      return Response.json({
        ok: true,
        imported,
        skipped,
        unmatched: details.length - skipped - imported,
        launchDays: headers.length,
        totalDetails: details.length,
      });
    }
    await ensureDatabase();
    const db = getDb(),
      contracts = await db
        .select({
          id: employmentContracts.id,
          company: employmentContracts.companySourceId,
          registration: employmentContracts.sourceRegistration,
        })
        .from(employmentContracts)
        .where(eq(employmentContracts.tenantId, tenantId)),
      serviceRows = await db
        .select({ id: services.id, sourceId: services.sourceId })
        .from(services)
        .where(eq(services.tenantId, tenantId)),
      contractMap = new Map(
        contracts.map((c) => [`${c.company}:${c.registration}`, c.id]),
      ),
      serviceMap = new Map(serviceRows.map((s) => [s.sourceId, s.id]));
    let imported = 0,
      skipped = 0,
      missingContracts = 0,
      missingServices = 0;
    const runtime = getRuntimeDatabase(),
      pending: D1PreparedStatement[] = [];
    const flush = async () => {
      if (pending.length)
        await runtime.batch(pending.splice(0, pending.length));
    };
    for (const row of details) {
      const sequence = num(row.Sequencia),
        head = headerMap.get(sequence);
      if (!head?.date) {
        skipped++;
        continue;
      }
      const contractId = contractMap.get(
          `${head.company}:${num(row.Matricula)}`,
        ),
        serviceId = serviceMap.get(num(row.CodServico));
      if (!contractId) {
        missingContracts++;
        continue;
      }
      if (!serviceId) {
        missingServices++;
        continue;
      }
      const quantity = num(row.Producao),
        unit = Math.round(num(row.Preco) * 100),
        discount = Math.round(num(row.Desconto) * 100),
        amount = Math.round(quantity * unit);
      pending.push(
        runtime
          .prepare(
            `INSERT INTO daily_entries (tenant_id,company_source_id,entry_date,contract_id,service_id,quantity,unit_price_cents,amount_cents,discount_cents,source_sequence,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (tenant_id,company_source_id,entry_date,contract_id,service_id) DO UPDATE SET quantity=excluded.quantity,unit_price_cents=excluded.unit_price_cents,amount_cents=excluded.amount_cents,discount_cents=excluded.discount_cents,source_sequence=excluded.source_sequence`,
          )
          .bind(
            tenantId,
            head.company,
            head.date,
            contractId,
            serviceId,
            String(quantity),
            unit,
            amount,
            discount,
            sequence,
            "Importado do Access",
          ),
      );
      imported++;
      if (pending.length >= 100) await flush();
    }
    await flush();
    return Response.json({
      ok: true,
      imported,
      skipped,
      missingContracts,
      missingServices,
      launchDays: headers.length,
      totalDetails: details.length,
    });
  } catch (e) {
    return Response.json(
      {
        error: e instanceof Error ? e.message : "Falha ao importar histórico.",
      },
      { status: 500 },
    );
  }
}
