import { getSupabaseConfig, supabaseAdmin } from "../../../db/supabase";

const TABLES = [
  "companies",
  "people",
  "employment_contracts",
  "services",
  "daily_entries",
  "dependents",
] as const;

export async function GET() {
  const config = getSupabaseConfig();
  if (!config)
    return Response.json({
      mode: "cloudflare-d1",
      ready: true,
      message: "Versão atual preservada.",
    });
  try {
    const tables = Object.fromEntries(
      await Promise.all(
        TABLES.map(async (table) => {
          await supabaseAdmin.get<Array<{ id: string }>>(
            `/rest/v1/${table}?select=id&organization_id=eq.${config.organizationId}&limit=1`,
          );
          return [table, "ok"];
        }),
      ),
    );
    return Response.json({
      mode: "supabase",
      ready: true,
      organizationId: config.organizationId,
      tables,
    });
  } catch (error) {
    return Response.json(
      {
        mode: "supabase",
        ready: false,
        error:
          error instanceof Error
            ? error.message.replace(
                /(Bearer |apikey["':=\s]+)[^\s",}]+/gi,
                "$1[protegido]",
              )
            : "Falha ao validar o Supabase.",
      },
      { status: 503 },
    );
  }
}
