import { asc, eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { authorizeCloud } from "../../auth-cloud";
import { getSupabaseConfig } from "../../../db/supabase";
import { cloudTaxTablesGet, cloudTaxTablesPost } from "./cloud";
import { taxBrackets } from "../../../db/schema";
const tenant = (r: Request) =>
  r.headers.get("oai-authenticated-user-email")?.toLowerCase() || "local-owner";
const official = [
  {
    taxType: "INSS",
    effectiveFrom: "2026-01-01",
    lowerCents: 0,
    upperCents: 162100,
    rateBasisPoints: 750,
    deductionCents: 0,
    sourceName: "INSS / Portaria MPS-MF 13/2026",
    sourceUrl:
      "https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal",
  },
  {
    taxType: "INSS",
    effectiveFrom: "2026-01-01",
    lowerCents: 162101,
    upperCents: 290284,
    rateBasisPoints: 900,
    deductionCents: 0,
    sourceName: "INSS / Portaria MPS-MF 13/2026",
    sourceUrl:
      "https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal",
  },
  {
    taxType: "INSS",
    effectiveFrom: "2026-01-01",
    lowerCents: 290285,
    upperCents: 435427,
    rateBasisPoints: 1200,
    deductionCents: 0,
    sourceName: "INSS / Portaria MPS-MF 13/2026",
    sourceUrl:
      "https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal",
  },
  {
    taxType: "INSS",
    effectiveFrom: "2026-01-01",
    lowerCents: 435428,
    upperCents: 847555,
    rateBasisPoints: 1400,
    deductionCents: 0,
    sourceName: "INSS / Portaria MPS-MF 13/2026",
    sourceUrl:
      "https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal",
  },
  ...[
    [0, 242880, 0, 0],
    [242881, 282665, 750, 18216],
    [282666, 375105, 1500, 39416],
    [375106, 466468, 2250, 67549],
    [466469, null, 2750, 90873],
  ].map(([lowerCents, upperCents, rateBasisPoints, deductionCents]) => ({
    taxType: "IRRF",
    effectiveFrom: "2026-01-01",
    lowerCents: lowerCents!,
    upperCents,
    rateBasisPoints: rateBasisPoints!,
    deductionCents: deductionCents!,
    sourceName: "Receita Federal — Tributação 2026",
    sourceUrl:
      "https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026",
  })),
  {
    taxType: "SALARY_FAMILY",
    effectiveFrom: "2026-01-01",
    lowerCents: 0,
    upperCents: 198038,
    rateBasisPoints: 0,
    deductionCents: 6754,
    sourceName: "INSS / Portaria MPS-MF 13/2026",
    sourceUrl:
      "https://www.gov.br/inss/pt-br/direitos-e-deveres/salario-familia/valor-limite-para-direito-ao-salario-familia",
  },
];
async function sync(tenantId: string) {
  const db = getDb();
  for (const row of official)
    await db
      .insert(taxBrackets)
      .values({ ...row, tenantId, officialUpdatedAt: "2026-01-12" })
      .onConflictDoUpdate({
        target: [
          taxBrackets.tenantId,
          taxBrackets.taxType,
          taxBrackets.effectiveFrom,
          taxBrackets.lowerCents,
        ],
        set: {
          upperCents: row.upperCents,
          rateBasisPoints: row.rateBasisPoints,
          deductionCents: row.deductionCents,
          sourceName: row.sourceName,
          sourceUrl: row.sourceUrl,
          officialUpdatedAt: "2026-01-12",
        },
      });
}
export async function GET(r: Request) {
  const access = await authorizeCloud(r, "Tabelas oficiais");
  if (access.response) return access.response;
  if (getSupabaseConfig()) return cloudTaxTablesGet(r);
  try {
    await ensureDatabase();
    const tenantId = tenant(r);
    await sync(tenantId);
    const rows = await getDb()
      .select()
      .from(taxBrackets)
      .where(eq(taxBrackets.tenantId, tenantId))
      .orderBy(asc(taxBrackets.taxType), asc(taxBrackets.lowerCents));
    return Response.json({
      rows,
      automaticUpdate:
        "As faixas oficiais são versionadas e atualizadas a cada versão do Folha Rural.",
      irrfSimplifiedDeductionCents: 60720,
      dependentDeductionCents: 18959,
      irrfReduction: {
        fullExemptionUntilCents: 500000,
        partialReductionUntilCents: 735000,
        formula: "R$ 978,62 − (0,133145 × rendimentos tributáveis)",
        effectiveFrom: "2026-01-01",
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha nas tabelas oficiais." },
      { status: 500 },
    );
  }
}
export async function POST(r: Request) {
  const access = await authorizeCloud(r, "Tabelas oficiais");
  if (access.response) return access.response;
  if (getSupabaseConfig()) return cloudTaxTablesPost(r);
  try {
    await ensureDatabase();
    await sync(tenant(r));
    return Response.json({
      ok: true,
      message: "Tabelas oficiais conferidas e atualizadas.",
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao atualizar." },
      { status: 500 },
    );
  }
}
