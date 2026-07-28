import {
  getSupabaseConfig,
  supabaseAdmin,
} from "../../../db/supabase";
import { authorizeCloud } from "../../auth-cloud";

type OfficialRow = {
  taxType: string;
  effectiveFrom: string;
  lowerCents: number;
  upperCents: number | null;
  rateBasisPoints: number;
  deductionCents: number;
  sourceName: string;
  sourceUrl: string;
  officialUpdatedAt: string;
};
type Row = Record<string, any>;

const inssSource =
  "https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal";
const irrfSource =
  "https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026";
const salaryFamilySource =
  "https://www.gov.br/inss/pt-br/direitos-e-deveres/salario-familia/valor-limite-para-direito-ao-salario-familia";

const official: OfficialRow[] = [
  {
    taxType: "INSS",
    effectiveFrom: "2026-01-01",
    lowerCents: 0,
    upperCents: 162100,
    rateBasisPoints: 750,
    deductionCents: 0,
    sourceName: "INSS / Portaria MPS-MF 13/2026",
    sourceUrl: inssSource,
    officialUpdatedAt: "2026-01-13T13:50:00-03:00",
  },
  {
    taxType: "INSS",
    effectiveFrom: "2026-01-01",
    lowerCents: 162101,
    upperCents: 290284,
    rateBasisPoints: 900,
    deductionCents: 0,
    sourceName: "INSS / Portaria MPS-MF 13/2026",
    sourceUrl: inssSource,
    officialUpdatedAt: "2026-01-13T13:50:00-03:00",
  },
  {
    taxType: "INSS",
    effectiveFrom: "2026-01-01",
    lowerCents: 290285,
    upperCents: 435427,
    rateBasisPoints: 1200,
    deductionCents: 0,
    sourceName: "INSS / Portaria MPS-MF 13/2026",
    sourceUrl: inssSource,
    officialUpdatedAt: "2026-01-13T13:50:00-03:00",
  },
  {
    taxType: "INSS",
    effectiveFrom: "2026-01-01",
    lowerCents: 435428,
    upperCents: 847555,
    rateBasisPoints: 1400,
    deductionCents: 0,
    sourceName: "INSS / Portaria MPS-MF 13/2026",
    sourceUrl: inssSource,
    officialUpdatedAt: "2026-01-13T13:50:00-03:00",
  },
  ...[
    [0, 242880, 0, 0],
    [242881, 282665, 750, 18216],
    [282666, 375105, 1500, 39416],
    [375106, 466468, 2250, 67549],
    [466469, null, 2750, 90873],
  ].map(
    ([lowerCents, upperCents, rateBasisPoints, deductionCents]): OfficialRow => ({
      taxType: "IRRF",
      effectiveFrom: "2026-01-01",
      lowerCents: lowerCents!,
      upperCents,
      rateBasisPoints: rateBasisPoints!,
      deductionCents: deductionCents!,
      sourceName: "Receita Federal — Tributação de 2026",
      sourceUrl: irrfSource,
      officialUpdatedAt: "2026-04-27T17:14:00-03:00",
    }),
  ),
  {
    taxType: "SALARY_FAMILY",
    effectiveFrom: "2026-01-01",
    lowerCents: 0,
    upperCents: 198038,
    rateBasisPoints: 0,
    deductionCents: 6754,
    sourceName: "INSS / Portaria MPS-MF 13/2026",
    sourceUrl: salaryFamilySource,
    officialUpdatedAt: "2026-01-13T13:50:00-03:00",
  },
];

async function sync() {
  const config = getSupabaseConfig()!;
  await supabaseAdmin.post("/rest/v1/rpc/folha_sync_tax_brackets", {
    p_organization_id: config.organizationId,
    p_rows: official,
  });
}

const responsePayload = (rows: Row[]) => ({
  rows: rows.map((row) => ({
    id: row.id,
    taxType: row.tax_type,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    lowerCents: Number(row.lower_cents),
    upperCents: row.upper_cents == null ? null : Number(row.upper_cents),
    rateBasisPoints: Number(row.rate_basis_points),
    deductionCents: Number(row.deduction_cents),
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    officialUpdatedAt: row.official_updated_at,
    createdAt: row.created_at,
  })),
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
  dataSource: "supabase",
});

export async function cloudTaxTablesGet(request: Request) {
  const config = getSupabaseConfig()!;
  const access = await authorizeCloud(request, "Tabelas oficiais");
  if (access.response) return access.response;
  try {
    await sync();
    const rows = await supabaseAdmin.get<Row[]>(
      `/rest/v1/tax_brackets?select=*&organization_id=eq.${config.organizationId}&order=tax_type.asc,lower_cents.asc`,
    );
    return Response.json(responsePayload(rows));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message.replace(/^Supabase \d+:\s*/, "")
            : "Falha nas tabelas oficiais.",
      },
      { status: 500 },
    );
  }
}

export async function cloudTaxTablesPost(request: Request) {
  const access = await authorizeCloud(request, "Tabelas oficiais");
  if (access.response) return access.response;
  try {
    await sync();
    return Response.json({
      ok: true,
      message: "Tabelas oficiais conferidas e atualizadas.",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message.replace(/^Supabase \d+:\s*/, "")
            : "Falha ao atualizar.",
      },
      { status: 500 },
    );
  }
}
