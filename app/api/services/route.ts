import { and, asc, eq, max } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { dailyEntries, services } from "../../../db/schema";
const tenant = (r: Request) =>
  r.headers.get("oai-authenticated-user-email")?.toLowerCase() || "local-owner";
export async function GET(r: Request) {
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
  return ["deduction", "desconto", "discount", "d", "2"].includes(nature)
    ? "deduction"
    : "earning";
};
export async function POST(r: Request) {
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
