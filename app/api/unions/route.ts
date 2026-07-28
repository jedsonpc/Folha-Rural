import { and, asc, eq, ne, or } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { authorizeCloud } from "../../auth-cloud";
import {
  employmentContracts,
  payrollClosings,
  unionContributionRates,
  unions,
} from "../../../db/schema";
const tenant = (r: Request) =>
  r.headers.get("oai-authenticated-user-email")?.toLowerCase() || "local-owner";
const cleanCnpj = (value: unknown) =>
  String(value || "")
    .replace(/\D/g, "")
    .slice(0, 14);
const validCnpj = (value: unknown) => {
  const cnpj = cleanCnpj(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const digit = (length: number) => {
    let factor = length - 7,
      total = 0;
    for (let i = 0; i < length; i++) {
      total += Number(cnpj[i]) * factor--;
      if (factor === 1) factor = 9;
    }
    const result = 11 - (total % 11);
    return result > 9 ? 0 : result;
  };
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
};
export async function GET(r: Request) {
  const access = await authorizeCloud(r, "Sindicatos");
  if (access.response) return access.response;
  try {
    await ensureDatabase();
    const tenantId = tenant(r),
      db = getDb(),
      rows = await db
        .select()
        .from(unions)
        .where(eq(unions.tenantId, tenantId))
        .orderBy(asc(unions.code)),
      rates = await db
        .select()
        .from(unionContributionRates)
        .where(eq(unionContributionRates.tenantId, tenantId))
        .orderBy(asc(unionContributionRates.effectiveFrom));
    return Response.json({
      unions: rows.map((row) => ({
        ...row,
        rates: rates.filter((rate) => rate.unionId === row.id),
      })),
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error ? e.message : "Falha ao consultar sindicatos.",
      },
      { status: 500 },
    );
  }
}
export async function POST(r: Request) {
  const access = await authorizeCloud(r, "Sindicatos");
  if (access.response) return access.response;
  try {
    await ensureDatabase();
    const db = getDb(),
      tenantId = tenant(r),
      b = (await r.json()) as Record<string, unknown>,
      action = String(b.action || "save"),
      id = Number(b.id);
    if (action === "delete") {
      const closings = await db
          .select({ totalsJson: payrollClosings.totalsJson })
          .from(payrollClosings)
          .where(eq(payrollClosings.tenantId, tenantId)),
        hasLaunches = closings.some(({ totalsJson }) => {
          try {
            const result = JSON.parse(totalsJson);
            return (
              Array.isArray(result.rows) &&
              result.rows.some(
                (row: { unionId?: number; union?: number }) =>
                  Number(row.unionId) === id && Number(row.union) > 0,
              )
            );
          } catch {
            return false;
          }
        });
      if (hasLaunches)
        return Response.json(
          {
            error:
              "Não é possível excluir: existem descontos processados para este sindicato.",
          },
          { status: 409 },
        );
      await db
        .update(employmentContracts)
        .set({ unionMember: false, unionId: null })
        .where(
          and(
            eq(employmentContracts.tenantId, tenantId),
            eq(employmentContracts.unionId, id),
          ),
        );
      await db
        .delete(unionContributionRates)
        .where(
          and(
            eq(unionContributionRates.tenantId, tenantId),
            eq(unionContributionRates.unionId, id),
          ),
        );
      await db
        .delete(unions)
        .where(and(eq(unions.id, id), eq(unions.tenantId, tenantId)));
      return Response.json({ ok: true, message: "Sindicato excluído." });
    }
    const code = String(b.code || "")
        .trim()
        .toUpperCase(),
      cnpj = cleanCnpj(b.cnpj),
      description = String(b.description || "").trim(),
      contributionCents = Math.max(
        0,
        Math.round(Number(b.contribution || 0) * 100),
      ),
      effectiveFrom = String(b.effectiveFrom || "").slice(0, 10),
      active = b.active !== false;
    if (!code || !description || !validCnpj(cnpj))
      return Response.json(
        { error: "Informe código, CNPJ válido e descrição do sindicato." },
        { status: 400 },
      );
    const duplicate = await db
      .select({ id: unions.id, code: unions.code, cnpj: unions.cnpj })
      .from(unions)
      .where(
        and(
          eq(unions.tenantId, tenantId),
          id ? ne(unions.id, id) : undefined,
          or(eq(unions.code, code), eq(unions.cnpj, cnpj)),
        ),
      )
      .limit(1);
    if (duplicate.length)
      return Response.json(
        {
          error:
            duplicate[0].code === code
              ? `O código ${code} já pertence a outro sindicato.`
              : "Este CNPJ já está cadastrado em outro sindicato.",
        },
        { status: 409 },
      );
    const registry = {
      code,
      cnpj,
      description,
      legalName: String(b.legalName || "").trim() || null,
      tradeName: String(b.tradeName || "").trim() || null,
      registrationStatus: String(b.registrationStatus || "").trim() || null,
      email: String(b.email || "").trim() || null,
      phone: String(b.phone || "").trim() || null,
      postalCode:
        String(b.postalCode || "")
          .replace(/\D/g, "")
          .slice(0, 8) || null,
      address: String(b.address || "").trim() || null,
      addressNumber: String(b.addressNumber || "").trim() || null,
      addressComplement: String(b.addressComplement || "").trim() || null,
      district: String(b.district || "").trim() || null,
      city: String(b.city || "").trim() || null,
      state:
        String(b.state || "")
          .trim()
          .toUpperCase()
          .slice(0, 2) || null,
      cnpjCheckedAt: String(b.cnpjCheckedAt || "").trim() || null,
      contributionCents,
      active,
    };
    if (contributionCents > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom))
      return Response.json(
        { error: "Informe a data de início do valor mensal." },
        { status: 400 },
      );
    let unionId = id;
    if (id)
      await db
        .update(unions)
        .set(registry)
        .where(and(eq(unions.id, id), eq(unions.tenantId, tenantId)));
    else {
      const inserted = await db
        .insert(unions)
        .values({ tenantId, ...registry })
        .returning({ id: unions.id });
      unionId = inserted[0].id;
    }
    if (contributionCents > 0)
      await db
        .insert(unionContributionRates)
        .values({ tenantId, unionId, effectiveFrom, contributionCents })
        .onConflictDoUpdate({
          target: [
            unionContributionRates.tenantId,
            unionContributionRates.unionId,
            unionContributionRates.effectiveFrom,
          ],
          set: { contributionCents },
        });
    return Response.json({ ok: true, message: "Sindicato salvo com sucesso." });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao salvar sindicato." },
      { status: 500 },
    );
  }
}
