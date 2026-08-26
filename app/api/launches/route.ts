import { and, asc, eq, gte, lt } from "drizzle-orm";
import { ensureDatabase, getDb, getRuntimeDatabase } from "../../../db";
import { authorizeCloud } from "../../auth-cloud";
import { getSupabaseConfig } from "../../../db/supabase";
import {
  cloudLaunchesGet,
  cloudLaunchesPost,
} from "./cloud";
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
  if (getSupabaseConfig()) return cloudLaunchesGet(request);
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
        cpf: people.cpf,
        pis: people.pis,
        birthDate: people.birthDate,
        identityNumber: people.identityNumber,
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
        formulaCode: services.formulaCode,
        entryType: services.entryType,
        inssIncidence: services.inss,
        fgtsIncidence: services.fgts,
        unitName: services.unitName,
        affectsDsr: services.affectsDsr,
        composesProductionAverage: services.composesProductionAverage,
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
    const profiles = await getRuntimeDatabase()
      .prepare("SELECT contract_id, salary_type, base_salary_cents, daily_rate_cents FROM worker_payroll_profiles WHERE tenant_id=?")
      .bind(tenantId)
      .all<{ contract_id: number; salary_type: string; base_salary_cents: number; daily_rate_cents: number | null }>();
    const profileByContract = new Map(profiles.results.map((profile) => [profile.contract_id, profile]));
    const salaries = await getRuntimeDatabase()
      .prepare("SELECT contract_id, salary_cents FROM salary_history WHERE tenant_id=? AND effective_date<? ORDER BY effective_date, id")
      .bind(tenantId, end)
      .all<{ contract_id: number; salary_cents: number }>();
    const salaryByContract = new Map(salaries.results.map((salary) => [salary.contract_id, Number(salary.salary_cents)]));
    return Response.json({
      month,
      contracts: contracts.map((contract) => {
        const profile = profileByContract.get(contract.id);
        const baseSalaryCents = salaryByContract.get(contract.id) || Number(profile?.base_salary_cents || 0);
        const monthly = profile?.salary_type === "monthly";
        return {
          ...contract,
          paymentType: monthly ? "monthly" : "production",
          baseSalaryCents,
          dailyRateCents: monthly ? Math.round(baseSalaryCents / 30) : Number(profile?.daily_rate_cents || 0),
        };
      }),
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
  if (getSupabaseConfig()) return cloudLaunchesPost(request);
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
    if(action==="updateEntry"){
      const id=Number(b.id),date=String(b.entryDate||""),contractId=Number(b.contractId),serviceId=Number(b.serviceId),quantity=Number(b.quantity),unit=Math.round(Number(b.unitPrice)*100);
      if(!id||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||!contractId||!serviceId||quantity<=0||unit<0)return Response.json({error:"Preencha data, colaborador, serviço, quantidade e valor."},{status:400});
      await db.update(dailyEntries).set({entryDate:date,contractId,serviceId,quantity:String(quantity),unitPriceCents:unit,amountCents:Math.round(quantity*unit)}).where(and(eq(dailyEntries.id,id),eq(dailyEntries.tenantId,tenantId),eq(dailyEntries.companySourceId,company)));
      return Response.json({ok:true,message:"Apontamento atualizado."});
    }
    if (action === "delete") {
      const id = Number(b.id);
      if (!id)
        return Response.json({ error: "Lançamento inválido para exclusão." }, { status: 400 });
      await db
        .update(dailyEntries)
        .set({ clonedFromId: null })
        .where(
          and(
            eq(dailyEntries.tenantId, tenantId),
            eq(dailyEntries.companySourceId, company),
            eq(dailyEntries.clonedFromId, id),
          ),
        );
      await db
        .delete(dailyEntries)
        .where(
          and(
            eq(dailyEntries.id, id),
            eq(dailyEntries.tenantId, tenantId),
            eq(dailyEntries.companySourceId, company),
          ),
        );
      return Response.json({ ok: true, message: "Lançamento excluído. Os apontamentos clonados foram preservados." });
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
      if (!/^20\d{2}-\d{2}-\d{2}$/.test(source) || !/^20\d{2}-\d{2}-\d{2}$/.test(target) || Number(target.slice(0,4))>2100 || source === target)
        return Response.json(
          { error: "Informe duas datas válidas e diferentes, entre os anos 2000 e 2100." },
          { status: 400 },
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
      for(const r of rows)await db.insert(dailyEntries).values({
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
        }).onConflictDoUpdate({target:[dailyEntries.tenantId,dailyEntries.companySourceId,dailyEntries.entryDate,dailyEntries.contractId,dailyEntries.serviceId],set:{quantity:r.quantity,unitPriceCents:r.unitPriceCents,amountCents:r.amountCents,notes:r.notes,clonedFromId:r.id}});
      return Response.json({
        ok: true,
        message: `${rows.length} lançamentos clonados ou atualizados no dia de destino.`,
        affected:rows.length,
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
