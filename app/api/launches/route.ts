import { and, asc, eq, gte, lt } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { authorizeCloud } from "../../auth-cloud";
import {
  dailyEntries,
  employmentContracts,
  holidays,
  people,
  services,
} from "../../../db/schema";
const tenant = (r: Request) =>
  r.headers.get("oai-authenticated-user-email")?.toLowerCase() || "local-owner";
const monthEnd = (m: string) => {
  const [y, n] = m.split("-").map(Number);
  return `${n === 12 ? y + 1 : y}-${String(n === 12 ? 1 : n + 1).padStart(2, "0")}-01`;
};
export async function GET(request: Request) {
  const access = await authorizeCloud(request, "Apontamentos");
  if (access.response) return access.response;
  try {
    await ensureDatabase();
    const db = getDb(),
      url = new URL(request.url),
      tenantId = tenant(request),
      company = Number(url.searchParams.get("company")),
      month =
        url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
    const companyAccess = await authorizeCloud(
      request,
      "Apontamentos",
      company,
    );
    if (companyAccess.response) return companyAccess.response;
    if (!company)
      return Response.json(
        { error: "Selecione uma empresa." },
        { status: 400 },
      );
    const start = `${month}-01`,
      end = monthEnd(month);
    const contracts = await db
      .select({
        id: employmentContracts.id,
        name: people.name,
        registrationNumber: employmentContracts.registrationNumber,
        legacyCode: employmentContracts.legacyCode,
        status: employmentContracts.status,
        admissionDate: employmentContracts.admissionDate,
        terminationDate: employmentContracts.terminationDate,
        role: employmentContracts.role,
        paymentType: employmentContracts.paymentType,
      })
      .from(employmentContracts)
      .innerJoin(people, eq(employmentContracts.personId, people.id))
      .where(
        and(
          eq(employmentContracts.tenantId, tenantId),
          eq(employmentContracts.companySourceId, company),
        ),
      )
      .orderBy(asc(people.name));
    const serviceRows = await db
      .select({
        id: services.id,
        sourceId: services.sourceId,
        description: services.description,
        unitName: services.unitName,
        affectsDsr: services.affectsDsr,
        active: services.active,
      })
      .from(services)
      .where(eq(services.tenantId, tenantId))
      .orderBy(asc(services.description));
    const entries = await db
      .select()
      .from(dailyEntries)
      .where(
        and(
          eq(dailyEntries.tenantId, tenantId),
          eq(dailyEntries.companySourceId, company),
          gte(dailyEntries.entryDate, start),
          lt(dailyEntries.entryDate, end),
        ),
      )
      .orderBy(asc(dailyEntries.entryDate));
    const holidayRows = await db
      .select()
      .from(holidays)
      .where(
        and(
          eq(holidays.tenantId, tenantId),
          eq(holidays.companySourceId, company),
          gte(holidays.holidayDate, start),
          lt(holidays.holidayDate, end),
        ),
      )
      .orderBy(asc(holidays.holidayDate));
    return Response.json({
      month,
      contracts,
      services: serviceRows,
      entries,
      holidays: holidayRows,
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error ? e.message : "Falha ao consultar apontamentos.",
      },
      { status: 500 },
    );
  }
}
export async function POST(request: Request) {
  const access = await authorizeCloud(request, "Apontamentos");
  if (access.response) return access.response;
  try {
    await ensureDatabase();
    const db = getDb(),
      tenantId = tenant(request),
      b = (await request.json()) as Record<string, unknown>,
      company = Number(b.companySourceId),
      action = String(b.action || "");
    const companyAccess = await authorizeCloud(
      request,
      "Apontamentos",
      company,
    );
    if (companyAccess.response) return companyAccess.response;
    if (!company)
      return Response.json(
        { error: "Selecione uma empresa." },
        { status: 400 },
      );
    if (action === "save") {
      const date = String(b.entryDate || ""),
        contractId = Number(b.contractId),
        serviceId = Number(b.serviceId),
        quantity = Number(b.quantity),
        unit = Math.round(Number(b.unitPrice) * 100);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !contractId ||
        !serviceId ||
        quantity <= 0 ||
        unit < 0
      )
        return Response.json(
          { error: "Preencha data, colaborador, serviço, quantidade e valor." },
          { status: 400 },
        );
      const amount = Math.round(quantity * unit);
      await db
        .insert(dailyEntries)
        .values({
          tenantId,
          companySourceId: company,
          entryDate: date,
          contractId,
          serviceId,
          quantity: String(quantity),
          unitPriceCents: unit,
          amountCents: amount,
          notes: String(b.notes || "").trim() || null,
        })
        .onConflictDoUpdate({
          target: [
            dailyEntries.tenantId,
            dailyEntries.companySourceId,
            dailyEntries.entryDate,
            dailyEntries.contractId,
            dailyEntries.serviceId,
          ],
          set: {
            quantity: String(quantity),
            unitPriceCents: unit,
            amountCents: amount,
            notes: String(b.notes || "").trim() || null,
          },
        });
      return Response.json({ ok: true, message: "Lançamento salvo." });
    }
    if (action === "saveBatch") {
      const date = String(b.entryDate || ""),
        rows = Array.isArray(b.rows)
          ? (b.rows as Array<Record<string, unknown>>)
          : [];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !rows.length)
        return Response.json(
          { error: "Informe a data e ao menos um lançamento." },
          { status: 400 },
        );
      let saved = 0;
      for (const row of rows) {
        const contractId = Number(row.contractId),
          serviceId = Number(row.serviceId),
          quantity = Number(row.quantity),
          unit = Math.round(Number(row.unitPrice) * 100);
        if (!contractId || !serviceId || quantity <= 0 || unit < 0) continue;
        const amount = Math.round(quantity * unit);
        await db
          .insert(dailyEntries)
          .values({
            tenantId,
            companySourceId: company,
            entryDate: date,
            contractId,
            serviceId,
            quantity: String(quantity),
            unitPriceCents: unit,
            amountCents: amount,
          })
          .onConflictDoUpdate({
            target: [
              dailyEntries.tenantId,
              dailyEntries.companySourceId,
              dailyEntries.entryDate,
              dailyEntries.contractId,
              dailyEntries.serviceId,
            ],
            set: {
              quantity: String(quantity),
              unitPriceCents: unit,
              amountCents: amount,
            },
          });
        saved++;
      }
      return Response.json({
        ok: true,
        message: `${saved} apontamentos salvos na tabela.`,
      });
    }
    if (action === "delete") {
      await db
        .delete(dailyEntries)
        .where(
          and(
            eq(dailyEntries.id, Number(b.id)),
            eq(dailyEntries.tenantId, tenantId),
            eq(dailyEntries.companySourceId, company),
          ),
        );
      return Response.json({ ok: true });
    }
    if (action === "holiday") {
      const date = String(b.holidayDate || ""),
        name = String(b.name || "").trim();
      if (!date || !name)
        return Response.json(
          { error: "Informe data e nome do feriado." },
          { status: 400 },
        );
      await db
        .insert(holidays)
        .values({ tenantId, companySourceId: company, holidayDate: date, name })
        .onConflictDoUpdate({
          target: [
            holidays.tenantId,
            holidays.companySourceId,
            holidays.holidayDate,
          ],
          set: { name },
        });
      return Response.json({ ok: true, message: "Feriado registrado." });
    }
    if (action === "deleteHoliday") {
      await db
        .delete(holidays)
        .where(
          and(eq(holidays.id, Number(b.id)), eq(holidays.tenantId, tenantId)),
        );
      return Response.json({ ok: true });
    }
    if (action === "clone") {
      const source = String(b.sourceDate || ""),
        target = String(b.targetDate || "");
      if (!source || !target || source === target)
        return Response.json(
          { error: "Informe duas datas diferentes." },
          { status: 400 },
        );
      const existing = await db
        .select()
        .from(dailyEntries)
        .where(
          and(
            eq(dailyEntries.tenantId, tenantId),
            eq(dailyEntries.companySourceId, company),
            eq(dailyEntries.entryDate, target),
          ),
        );
      if (existing.length)
        return Response.json(
          {
            error: "O dia de destino já possui lançamentos. Nada foi alterado.",
          },
          { status: 409 },
        );
      const rows = await db
        .select()
        .from(dailyEntries)
        .where(
          and(
            eq(dailyEntries.tenantId, tenantId),
            eq(dailyEntries.companySourceId, company),
            eq(dailyEntries.entryDate, source),
          ),
        );
      if (!rows.length)
        return Response.json(
          { error: "O dia de origem não possui lançamentos." },
          { status: 404 },
        );
      await db.insert(dailyEntries).values(
        rows.map((r) => ({
          tenantId,
          companySourceId: company,
          entryDate: target,
          contractId: r.contractId,
          serviceId: r.serviceId,
          quantity: r.quantity,
          unitPriceCents: r.unitPriceCents,
          amountCents: r.amountCents,
          notes: r.notes,
          clonedFromId: r.id,
        })),
      );
      return Response.json({
        ok: true,
        message: `${rows.length} lançamentos clonados.`,
      });
    }
    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao gravar." },
      { status: 500 },
    );
  }
}
