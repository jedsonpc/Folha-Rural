import { getSupabaseConfig, supabaseAdmin } from "../../../db/supabase";

type ImportPayload = {
  fileName?: string;
  companies?: unknown[];
  contracts?: unknown[];
  dependents?: unknown[];
  services?: unknown[];
};

export async function cloudImportAccessGet() {
  const config = getSupabaseConfig()!;
  const [people, contracts, active, imports] = await Promise.all([
    supabaseAdmin.get<Array<{ id: string }>>(
      `/rest/v1/people?select=id&organization_id=eq.${config.organizationId}`,
    ),
    supabaseAdmin.get<Array<{ id: string }>>(
      `/rest/v1/employment_contracts?select=id&organization_id=eq.${config.organizationId}`,
    ),
    supabaseAdmin.get<Array<{ id: string }>>(
      `/rest/v1/employment_contracts?select=id&organization_id=eq.${config.organizationId}&status=eq.active`,
    ),
    supabaseAdmin.get<unknown[]>(
      `/rest/v1/import_runs?select=*&organization_id=eq.${config.organizationId}&order=created_at.desc&limit=5`,
    ),
  ]);
  return Response.json({
    counts: {
      people: people.length,
      contracts: contracts.length,
      activeContracts: active.length,
    },
    imports,
  });
}

export async function cloudImportAccessPost(request: Request) {
  const config = getSupabaseConfig()!;
  const payload = (await request.json()) as ImportPayload;
  const companies = (payload.companies || []).slice(0, 1000);
  const contracts = (payload.contracts || []).slice(0, 5000);
  const dependents = (payload.dependents || []).slice(0, 5000);
  const services = (payload.services || []).slice(0, 1000);
  if (!companies.length && !contracts.length && !services.length)
    return Response.json(
      { error: "Nenhum registro válido foi recebido." },
      { status: 400 },
    );
  const result = await supabaseAdmin.post<Record<string, unknown>>(
    "/rest/v1/rpc/folha_import_access_registry",
    {
      p_organization_id: config.organizationId,
      p_file_name: (payload.fileName || "Banco Access").slice(0, 180),
      p_companies: companies,
      p_contracts: contracts,
      p_dependents: dependents,
      p_services: services,
    },
  );
  return Response.json(result);
}
