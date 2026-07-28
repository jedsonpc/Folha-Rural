import {
  getSupabaseConfig,
  supabaseAdmin,
} from "../../../db/supabase";
import { authorizeCloud } from "../../auth-cloud";

type Row = Record<string, any>;

const cleanCnpj = (value: unknown) =>
  String(value || "")
    .replace(/\D/g, "")
    .slice(0, 14);

const validCnpj = (value: unknown) => {
  const cnpj = cleanCnpj(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const digit = (length: number) => {
    let factor = length - 7;
    let total = 0;
    for (let index = 0; index < length; index++) {
      total += Number(cnpj[index]) * factor--;
      if (factor === 1) factor = 9;
    }
    const result = 11 - (total % 11);
    return result > 9 ? 0 : result;
  };
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
};

export async function cloudUnionsGet(request: Request) {
  const config = getSupabaseConfig()!;
  const access = await authorizeCloud(request, "Sindicatos");
  if (access.response) return access.response;
  try {
    const [unions, rates] = await Promise.all([
      supabaseAdmin.get<Row[]>(
        `/rest/v1/unions?select=*&organization_id=eq.${config.organizationId}&order=code.asc`,
      ),
      supabaseAdmin.get<Row[]>(
        `/rest/v1/union_contribution_rates?select=*&organization_id=eq.${config.organizationId}&order=effective_from.asc`,
      ),
    ]);
    return Response.json({
      unions: unions.map((row) => ({
        id: row.id,
        code: row.code,
        cnpj: row.cnpj,
        description: row.description,
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
        cnpjCheckedAt: row.cnpj_checked_at,
        contributionCents: Number(row.contribution_cents),
        active: row.active,
        createdAt: row.created_at,
        rates: rates
          .filter((rate) => rate.union_id === row.id)
          .map((rate) => ({
            id: rate.id,
            unionId: rate.union_id,
            effectiveFrom: rate.effective_from,
            contributionCents: Number(rate.contribution_cents),
            createdAt: rate.created_at,
          })),
      })),
      dataSource: "supabase",
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message.replace(/^Supabase \d+:\s*/, "")
            : "Falha ao consultar sindicatos.",
      },
      { status: 500 },
    );
  }
}

export async function cloudUnionsPost(request: Request) {
  const config = getSupabaseConfig()!;
  const access = await authorizeCloud(request, "Sindicatos");
  if (access.response) return access.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "save");
    let payload: Record<string, unknown>;
    if (action === "delete") {
      payload = { action, id: String(body.id || "") };
    } else {
      const code = String(body.code || "")
        .trim()
        .toUpperCase();
      const cnpj = cleanCnpj(body.cnpj);
      const description = String(body.description || "").trim();
      const contributionCents = Math.max(
        0,
        Math.round(Number(body.contribution || 0) * 100),
      );
      const effectiveFrom = String(body.effectiveFrom || "").slice(0, 10);
      if (!code || !description || !validCnpj(cnpj))
        return Response.json(
          { error: "Informe código, CNPJ válido e descrição do sindicato." },
          { status: 400 },
        );
      if (
        contributionCents > 0 &&
        !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)
      )
        return Response.json(
          { error: "Informe a data de início do valor mensal." },
          { status: 400 },
        );
      payload = {
        action: "save",
        id: body.id ? String(body.id) : null,
        code,
        cnpj,
        description,
        legalName: String(body.legalName || "").trim() || null,
        tradeName: String(body.tradeName || "").trim() || null,
        registrationStatus:
          String(body.registrationStatus || "").trim() || null,
        email: String(body.email || "").trim() || null,
        phone: String(body.phone || "").trim() || null,
        postalCode:
          String(body.postalCode || "")
            .replace(/\D/g, "")
            .slice(0, 8) || null,
        address: String(body.address || "").trim() || null,
        addressNumber: String(body.addressNumber || "").trim() || null,
        addressComplement:
          String(body.addressComplement || "").trim() || null,
        district: String(body.district || "").trim() || null,
        city: String(body.city || "").trim() || null,
        state:
          String(body.state || "")
            .trim()
            .toUpperCase()
            .slice(0, 2) || null,
        cnpjCheckedAt: String(body.cnpjCheckedAt || "").trim() || null,
        contributionCents,
        effectiveFrom: contributionCents > 0 ? effectiveFrom : null,
        active: body.active !== false,
      };
    }
    const result = await supabaseAdmin.post<
      Array<{ ok: boolean; message: string; union_id: string | null }>
    >("/rest/v1/rpc/folha_save_union", {
      p_organization_id: config.organizationId,
      p_payload: payload,
    });
    return Response.json(result[0] || { ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message.replace(/^Supabase \d+:\s*/, "") : "";
    const status = /já pertence|já está cadastrado|descontos processados/i.test(
      message,
    )
      ? 409
      : /não encontrad|identificador inválido/i.test(message)
        ? 404
        : 500;
    return Response.json(
      { error: message || "Falha ao salvar sindicato." },
      { status },
    );
  }
}
