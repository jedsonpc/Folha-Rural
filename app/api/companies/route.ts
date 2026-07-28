import { and, asc, count, eq, max, ne } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import {
  companies,
  dailyEntries,
  employmentContracts,
} from "../../../db/schema";
import { cleanCpf, isValidCpf } from "../../cpf";
import { authorizeCloud } from "../../auth-cloud";
import {
  getSupabaseConfig,
  supabaseAdmin,
} from "../../../db/supabase";

const tenant = (request: Request) =>
  request.headers.get("oai-authenticated-user-email")?.toLowerCase() ||
  "local-owner";
const cleanDocument = (value: unknown) =>
  String(value || "").replace(/\D/g, "").slice(0, 14);

export async function GET(request: Request) {
  const access = await authorizeCloud(request, "Empresas");
  if (access.response) return access.response;
  if (getSupabaseConfig()) return cloudCompaniesGet(access.user);
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
  if (getSupabaseConfig()) return cloudCompaniesPost(request, access.user);
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

type CloudCompany = {
  id: string;
  legacy_id: number;
  name: string;
  document: string | null;
  document_type: string | null;
  owner_cpf: string | null;
  cei: string | null;
  legal_name: string | null;
  trade_name: string | null;
  registration_status: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  address_number: string | null;
  address_complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  checked_at: string | null;
  active: boolean;
  employment_contracts?: Array<{ count: number }>;
  daily_entries?: Array<{ count: number }>;
};

const cloudCompanyResponse = (row: CloudCompany) => ({
  id: row.id,
  sourceId: Number(row.legacy_id),
  name: row.name,
  document: row.document,
  documentType: row.document_type || "cnpj",
  ownerCpf: row.owner_cpf,
  cei: row.cei,
  legalName: row.legal_name,
  tradeName: row.trade_name,
  registrationStatus: row.registration_status,
  email: row.email,
  phone: row.phone,
  postalCode: row.postal_code,
  address: row.address,
  addressNumber: row.address_number,
  addressComplement: row.address_complement,
  district: row.district,
  city: row.city,
  state: row.state,
  checkedAt: row.checked_at,
  active: row.active,
  contractsCount: Number(row.employment_contracts?.[0]?.count || 0),
  entriesCount: Number(row.daily_entries?.[0]?.count || 0),
});

async function cloudCompaniesGet(
  user: { companyIds?: number[] | null } | null,
) {
  const config = getSupabaseConfig()!;
  try {
    const allowed =
      user?.companyIds == null
        ? ""
        : `&legacy_id=in.(${user.companyIds.map(Number).join(",") || "0"})`;
    const rows = await supabaseAdmin.get<CloudCompany[]>(
      `/rest/v1/companies?select=*,employment_contracts(count),daily_entries(count)&organization_id=eq.${config.organizationId}${allowed}&order=name.asc`,
    );
    return Response.json(
      { companies: rows.map(cloudCompanyResponse), dataSource: "supabase" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar empresas no Supabase.",
      },
      { status: 500 },
    );
  }
}

async function cloudCompaniesPost(
  request: Request,
  user: { role: string; companyIds?: number[] | null } | null,
) {
  const config = getSupabaseConfig()!;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "save");
    const id = String(body.id || "").trim();
    if (action === "delete") {
      if (!id)
        return Response.json({ error: "Empresa inválida." }, { status: 400 });
      const [contracts, entries] = await Promise.all([
        supabaseAdmin.get<Array<{ id: string }>>(
          `/rest/v1/employment_contracts?select=id&organization_id=eq.${config.organizationId}&company_id=eq.${id}&limit=1`,
        ),
        supabaseAdmin.get<Array<{ id: string }>>(
          `/rest/v1/daily_entries?select=id&organization_id=eq.${config.organizationId}&company_id=eq.${id}&limit=1`,
        ),
      ]);
      if (contracts.length || entries.length)
        return Response.json(
          {
            error:
              "A empresa possui histórico e não pode ser excluída. Desative-a para preservar os dados.",
          },
          { status: 409 },
        );
      await supabaseAdmin.delete(
        `/rest/v1/companies?id=eq.${id}&organization_id=eq.${config.organizationId}`,
      );
      return Response.json({ ok: true });
    }

    const documentType = body.documentType === "caepf" ? "caepf" : "cnpj";
    const document = cleanDocument(body.document);
    const ownerCpf = cleanCpf(String(body.ownerCpf || ""));
    const name = String(
      body.name || body.tradeName || body.legalName || "",
    ).trim();
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

    const duplicateFilter = id ? `&id=neq.${id}` : "";
    const duplicate = await supabaseAdmin.get<Array<{ id: string }>>(
      `/rest/v1/companies?select=id&organization_id=eq.${config.organizationId}&document=eq.${document}${duplicateFilter}&limit=1`,
    );
    if (duplicate.length)
      return Response.json(
        { error: "Este CNPJ/CAEPF já está cadastrado." },
        { status: 409 },
      );

    let legacyId = Number(body.sourceId || 0);
    if (!id && !legacyId) {
      const last = await supabaseAdmin.get<Array<{ legacy_id: number }>>(
        `/rest/v1/companies?select=legacy_id&organization_id=eq.${config.organizationId}&order=legacy_id.desc&limit=1`,
      );
      legacyId = Number(last[0]?.legacy_id || 0) + 1;
    }
    if (
      user?.role !== "admin" &&
      user?.companyIds != null &&
      id &&
      !user.companyIds.includes(legacyId)
    )
      return Response.json({ error: "Empresa não autorizada." }, { status: 403 });

    const values = {
      organization_id: config.organizationId,
      legacy_id: legacyId,
      name,
      document,
      document_type: documentType,
      owner_cpf: documentType === "caepf" ? ownerCpf : null,
      cei:
        documentType === "caepf"
          ? String(body.cei || "").replace(/\D/g, "").slice(0, 12) || null
          : null,
      legal_name: String(body.legalName || "").trim() || null,
      trade_name: String(body.tradeName || "").trim() || null,
      registration_status:
        String(body.registrationStatus || "").trim() || null,
      email: String(body.email || "").trim() || null,
      phone: String(body.phone || "").trim() || null,
      postal_code:
        String(body.postalCode || "").replace(/\D/g, "").slice(0, 8) || null,
      address: String(body.address || "").trim() || null,
      address_number: String(body.addressNumber || "").trim() || null,
      address_complement:
        String(body.addressComplement || "").trim() || null,
      district: String(body.district || "").trim() || null,
      city: String(body.city || "").trim() || null,
      state: String(body.state || "").trim().toUpperCase().slice(0, 2) || null,
      checked_at: String(body.checkedAt || "").trim() || null,
      active: body.active !== false,
    };
    const saved = id
      ? await supabaseAdmin.patch<CloudCompany[]>(
          `/rest/v1/companies?id=eq.${id}&organization_id=eq.${config.organizationId}&select=*`,
          values,
          { prefer: "return=representation" },
        )
      : await supabaseAdmin.post<CloudCompany[]>(
          "/rest/v1/companies?select=*",
          values,
          { prefer: "return=representation" },
        );
    if (!saved[0])
      return Response.json(
        { error: "O Supabase não confirmou a gravação da empresa." },
        { status: 500 },
      );
    return Response.json({
      ok: true,
      company: cloudCompanyResponse(saved[0]),
      dataSource: "supabase",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao salvar empresa no Supabase.",
      },
      { status: 500 },
    );
  }
}
