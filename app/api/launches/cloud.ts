import {
  getSupabaseConfig,
  supabaseAdmin,
} from "../../../db/supabase";
import { authorizeCloud } from "../../auth-cloud";

type Row = Record<string, any>;
const nextMonth = (month: string) => {
  const [year, value] = month.split("-").map(Number);
  return `${value === 12 ? year + 1 : year}-${String(value === 12 ? 1 : value + 1).padStart(2, "0")}-01`;
};

export async function cloudLaunchesGet(request: Request) {
  const config = getSupabaseConfig()!;
  const url = new URL(request.url);
  const companyLegacyId = Number(url.searchParams.get("company"));
  const month =
    url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const access = await authorizeCloud(
    request,
    "Apontamentos",
    companyLegacyId,
  );
  if (access.response) return access.response;
  if (!companyLegacyId)
    return Response.json({ error: "Selecione uma empresa." }, { status: 400 });
  try {
    const companies = await supabaseAdmin.get<Array<{ id: string }>>(
      `/rest/v1/companies?select=id&organization_id=eq.${config.organizationId}&legacy_id=eq.${companyLegacyId}&limit=1`,
    );
    const companyId = companies[0]?.id;
    if (!companyId)
      return Response.json(
        { error: "Empresa não encontrada." },
        { status: 404 },
      );
    const start = `${month}-01`;
    const end = nextMonth(month);
    const [contracts, services, entries, holidays] = await Promise.all([
      supabaseAdmin.get<Row[]>(
        `/rest/v1/employment_contracts?select=*,people(full_name,cpf,pis,birth_date,identity_number)&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}&order=created_at.asc`,
      ),
      supabaseAdmin.get<Row[]>(
        `/rest/v1/services?select=*&organization_id=eq.${config.organizationId}&order=description.asc`,
      ),
      supabaseAdmin.get<Row[]>(
        `/rest/v1/daily_entries?select=*&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}&entry_date=gte.${start}&entry_date=lt.${end}&order=entry_date.asc`,
      ),
      supabaseAdmin.get<Row[]>(
        `/rest/v1/holidays?select=*&organization_id=eq.${config.organizationId}&company_id=eq.${companyId}&holiday_date=gte.${start}&holiday_date=lt.${end}&order=holiday_date.asc`,
      ),
    ]);
    return Response.json({
      month,
      contracts: contracts.map((row) => ({
        id: row.id,
        name: row.people?.full_name,
        cpf: row.people?.cpf,
        pis: row.people?.pis,
        birthDate: row.people?.birth_date,
        identityNumber: row.people?.identity_number,
        registrationNumber: row.registration_number,
        legacyCode: row.legacy_code,
        status: row.status,
        admissionDate: row.admission_date,
        terminationDate: row.termination_date,
        role: row.role_name,
        paymentType: row.payment_type,
      })),
      services: services.map((row) => ({
        id: row.id,
        sourceId: row.legacy_id,
        description: row.description,
        unitName: row.unit_name,
        affectsDsr: row.affects_dsr,
        composesProductionAverage: row.composes_production_average,
        active: row.active,
      })),
      entries: entries.map((row) => ({
        id: row.id,
        companySourceId: companyLegacyId,
        entryDate: row.entry_date,
        contractId: row.contract_id,
        serviceId: row.service_id,
        quantity: String(row.quantity),
        unitPriceCents: Number(row.unit_price_cents),
        amountCents: Number(row.amount_cents),
        discountCents: Number(row.discount_cents || 0),
        sourceSequence: row.source_sequence,
        notes: row.notes,
        clonedFromId: row.cloned_from_id,
      })),
      holidays: holidays.map((row) => ({
        id: row.id,
        companySourceId: companyLegacyId,
        holidayDate: row.holiday_date,
        name: row.name,
      })),
      dataSource: "supabase",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar apontamentos no Supabase.",
      },
      { status: 500 },
    );
  }
}

export async function cloudLaunchesPost(request: Request) {
  const config = getSupabaseConfig()!;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const companyLegacyId = Number(body.companySourceId);
    const access = await authorizeCloud(
      request,
      "Apontamentos",
      companyLegacyId,
    );
    if (access.response) return access.response;
    if (!companyLegacyId)
      return Response.json({ error: "Selecione uma empresa." }, { status: 400 });
    const result = await supabaseAdmin.post<
      Array<{ ok: boolean; message: string; affected: number }>
    >("/rest/v1/rpc/folha_save_launches", {
      p_organization_id: config.organizationId,
      p_company_legacy_id: companyLegacyId,
      p_payload: body,
    });
    return Response.json(result[0] || { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = /destino já possui/i.test(message)
      ? 409
      : /origem não possui|não encontrad/i.test(message)
        ? 404
        : 500;
    return Response.json(
      {
        error:
          message.replace(/^Supabase \d+:\s*/, "") ||
          "Falha ao gravar apontamentos no Supabase.",
      },
      { status },
    );
  }
}
