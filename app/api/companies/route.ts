import { and, asc, count, eq, max, ne } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import {
  companies,
  dailyEntries,
  employmentContracts,
} from "../../../db/schema";
import { cleanCpf, isValidCpf } from "../../cpf";
import { authorizeCloud } from "../../auth-cloud";

const tenant = (request: Request) =>
  request.headers.get("oai-authenticated-user-email")?.toLowerCase() ||
  "local-owner";
const cleanDocument = (value: unknown) =>
  String(value || "").replace(/\D/g, "").slice(0, 14);

export async function GET(request: Request) {
  const access = await authorizeCloud(request, "Empresas");
  if (access.response) return access.response;
  try {
    await ensureDatabase();
    const db = getDb(),
      tenantId = tenant(request),
      allRows = await db
        .select()
        .from(companies)
        .where(eq(companies.tenantId, tenantId))
        .orderBy(asc(companies.name)),
      rows =
        access.user?.companyIds == null
          ? allRows
          : allRows.filter((row) =>
              access.user?.companyIds?.includes(row.sourceId),
            ),
      contracts = await db
        .select({
          companySourceId: employmentContracts.companySourceId,
          value: count(),
        })
        .from(employmentContracts)
        .where(eq(employmentContracts.tenantId, tenantId))
        .groupBy(employmentContracts.companySourceId),
      entries = await db
        .select({ companySourceId: dailyEntries.companySourceId, value: count() })
        .from(dailyEntries)
        .where(eq(dailyEntries.tenantId, tenantId))
        .groupBy(dailyEntries.companySourceId),
      contractMap = new Map(contracts.map((r) => [r.companySourceId, r.value])),
      entryMap = new Map(entries.map((r) => [r.companySourceId, r.value]));
    return Response.json(
      {
        companies: rows.map((row) => ({
          ...row,
          contractsCount: contractMap.get(row.sourceId) || 0,
          entriesCount: entryMap.get(row.sourceId) || 0,
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao consultar." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const access = await authorizeCloud(request, "Empresas");
  if (access.response) return access.response;
  try {
    await ensureDatabase();
    const db = getDb(),
      tenantId = tenant(request),
      body = (await request.json()) as Record<string, unknown>,
      action = String(body.action || "save");
    if (action === "delete") {
      const id = Number(body.id);
      const [company] = await db
        .select()
        .from(companies)
        .where(and(eq(companies.tenantId, tenantId), eq(companies.id, id)))
        .limit(1);
      if (!company)
        return Response.json({ error: "Empresa não encontrada." }, { status: 404 });
      const [contractTotal] = await db
          .select({ value: count() })
          .from(employmentContracts)
          .where(
            and(
              eq(employmentContracts.tenantId, tenantId),
              eq(employmentContracts.companySourceId, company.sourceId),
            ),
          ),
        [entryTotal] = await db
          .select({ value: count() })
          .from(dailyEntries)
          .where(
            and(
              eq(dailyEntries.tenantId, tenantId),
              eq(dailyEntries.companySourceId, company.sourceId),
            ),
          );
      if (contractTotal.value || entryTotal.value)
        return Response.json(
          {
            error:
              "A empresa possui histórico de colaboradores ou lançamentos e não pode ser excluída. Desative-a para preservar o histórico.",
          },
          { status: 409 },
        );
      await db
        .delete(companies)
        .where(and(eq(companies.tenantId, tenantId), eq(companies.id, id)));
      return Response.json({ ok: true });
    }

    const id = Number(body.id) || 0,
      documentType = body.documentType === "caepf" ? "caepf" : "cnpj",
      document = cleanDocument(body.document),
      ownerCpf = cleanCpf(String(body.ownerCpf || "")),
      cei = String(body.cei || "").replace(/\D/g, "").slice(0, 12),
      name = String(body.name || body.tradeName || body.legalName || "").trim();
    if (document.length !== 14)
      return Response.json(
        { error: `${documentType.toUpperCase()} deve conter 14 dígitos.` },
        { status: 400 },
      );
    if (!name)
      return Response.json(
        { error: "Informe o nome da empresa." },
        { status: 400 },
      );
    if (documentType === "caepf" && !isValidCpf(ownerCpf))
      return Response.json(
        { error: "Informe um CPF válido para o titular do CAEPF." },
        { status: 400 },
      );
    const duplicate = await db
      .select({ id: companies.id })
      .from(companies)
      .where(
        and(
          eq(companies.tenantId, tenantId),
          eq(companies.document, document),
          id ? ne(companies.id, id) : undefined,
        ),
      )
      .limit(1);
    if (duplicate.length)
      return Response.json(
        { error: "Este CNPJ/CAEPF já está cadastrado." },
        { status: 409 },
      );
    const values = {
      name,
      document,
      documentType,
      ownerCpf: documentType === "caepf" ? ownerCpf : null,
      cei: documentType === "caepf" && cei ? cei : null,
      legalName: String(body.legalName || "").trim() || null,
      tradeName: String(body.tradeName || "").trim() || null,
      registrationStatus:
        String(body.registrationStatus || "").trim() || null,
      email: String(body.email || "").trim() || null,
      phone: String(body.phone || "").trim() || null,
      postalCode:
        String(body.postalCode || "").replace(/\D/g, "").slice(0, 8) || null,
      address: String(body.address || "").trim() || null,
      addressNumber: String(body.addressNumber || "").trim() || null,
      addressComplement:
        String(body.addressComplement || "").trim() || null,
      district: String(body.district || "").trim() || null,
      city: String(body.city || "").trim() || null,
      state: String(body.state || "").trim().toUpperCase().slice(0, 2) || null,
      checkedAt: String(body.checkedAt || "").trim() || null,
      active: body.active !== false,
    };
    if (id) {
      await db
        .update(companies)
        .set(values)
        .where(and(eq(companies.tenantId, tenantId), eq(companies.id, id)));
    } else {
      const [last] = await db
        .select({ value: max(companies.sourceId) })
        .from(companies)
        .where(eq(companies.tenantId, tenantId));
      await db.insert(companies).values({
        ...values,
        tenantId,
        sourceId: Number(last?.value || 0) + 1,
      });
    }
    const [saved] = await db
      .select()
      .from(companies)
      .where(
        and(
          eq(companies.tenantId, tenantId),
          eq(companies.document, document),
        ),
      )
      .limit(1);
    if (!saved)
      return Response.json(
        { error: "O banco não confirmou a gravação da empresa." },
        { status: 500 },
      );
    const expected = {
        document,
        ownerCpf: values.ownerCpf,
        cei: values.cei,
        postalCode: values.postalCode,
        address: values.address,
        addressNumber: values.addressNumber,
        addressComplement: values.addressComplement,
        district: values.district,
        city: values.city,
        state: values.state,
      },
      mismatch = Object.entries(expected).find(
        ([key, value]) =>
          String(saved[key as keyof typeof saved] ?? "") !== String(value ?? ""),
      );
    if (mismatch)
      return Response.json(
        {
          error: `A gravação do campo ${mismatch[0]} não foi confirmada. Tente novamente.`,
        },
        { status: 500 },
      );
    return Response.json({ ok: true, company: saved });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao salvar." },
      { status: 500 },
    );
  }
}
