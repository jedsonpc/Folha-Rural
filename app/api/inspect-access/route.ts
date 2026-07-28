import { Buffer } from "node:buffer";
import MDBReader from "mdb-reader";
import { requireCloudAdmin } from "../../auth-cloud";
import { getSupabaseConfig } from "../../../db/supabase";

type Row = Record<string, unknown>;
const num = (value: unknown) =>
  typeof value === "number" ? value : Number(value) || 0;
const text = (value: unknown) =>
  value == null ? null : String(value).trim() || null;
const date = (value: unknown) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : text(value);
const educationCode = (value: number) => {
  if (value === 1) return "illiterate";
  if ([2, 3, 4].includes(value)) return "elementary_incomplete";
  if (value === 5) return "elementary_complete";
  if (value === 6) return "high_school_incomplete";
  if (value === 7) return "high_school_complete";
  if (value === 8) return "higher_incomplete";
  if (value === 9) return "higher_complete";
  if (value >= 10) return "postgraduate";
  return null;
};
const maritalCode = (value: number) =>
  ({
    1: "single",
    2: "married",
    3: "widowed",
    4: "divorced",
    5: "stable_union",
    6: "separated",
  })[value] || null;
const normalizeEducation = (value: unknown, fallback: number) => {
  const label = String(value || "").toLowerCase();
  if (label.includes("analf")) return "illiterate";
  if (label.includes("fundamental") && label.includes("incom"))
    return "elementary_incomplete";
  if (label.includes("fundamental")) return "elementary_complete";
  if (label.includes("médio") && label.includes("incom"))
    return "high_school_incomplete";
  if (label.includes("médio") || label.includes("medio"))
    return "high_school_complete";
  if (label.includes("superior") && label.includes("incom"))
    return "higher_incomplete";
  if (label.includes("superior")) return "higher_complete";
  if (label.includes("pós") || label.includes("pos")) return "postgraduate";
  return educationCode(fallback);
};
const normalizeMarital = (value: unknown, fallback: number) => {
  const label = String(value || "").toLowerCase();
  if (label.includes("solteir")) return "single";
  if (label.includes("casad")) return "married";
  if (label.includes("viúv") || label.includes("viuv")) return "widowed";
  if (label.includes("divorci")) return "divorced";
  if (label.includes("união") || label.includes("uniao")) return "stable_union";
  if (label.includes("separad")) return "separated";
  return maritalCode(fallback);
};
const dependentType = (value: number) =>
  ({ 0: "child", 1: "child", 2: "spouse", 3: "father", 4: "mother" })[value] ||
  "other";

export async function POST(request: Request) {
  try {
    if (getSupabaseConfig() && !(await requireCloudAdmin(request)))
      return Response.json(
        { error: "A importação do Access é exclusiva de administradores." },
        { status: 403 },
      );
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 50 * 1024 * 1024) {
      return Response.json(
        { error: "O arquivo deve ter entre 1 byte e 50 MB." },
        { status: 400 },
      );
    }
    const reader = new MDBReader(Buffer.from(bytes));
    const names = reader.getTableNames({
      normalTables: true,
      systemTables: false,
      linkedTables: true,
    });
    const get = (name: string) =>
      names.includes(name) ? (reader.getTable(name).getData() as Row[]) : [];
    const rawCompanies = get("TB_Empresas");
    const rawWorkers = get("TB_Cadastro_Pessoal");
    const rawServices = get("TB_Cadastro de Servicos");
    const education = new Map(
      get("TB_Instrucao").map((row) => [
        num(row.Instrucao),
        row.Instrucao_D ?? row.Descricao,
      ]),
    );
    const marital = new Map(
      get("TB_Est_civil").map((row) => [
        num(row.Est_Civil),
        row["Estado Civil"] ?? row.Descricao,
      ]),
    );
    const dependentOwners = new Map(
      get("TB_Dependente").map((row) => [
        num(row.Cad_Dep),
        {
          companySourceId: num(row.CodEmpresa),
          sourceRegistration: num(row.Matricula),
        },
      ]),
    );
    const groups = new Map(
      get("TB_Grupo").map((row) => [num(row.CodigoDoGrupo), text(row.Grupo)]),
    );
    const units = new Map(
      get("TB_Unidade de Apontamento").map((row) => [
        num(row.CodUnidade),
        text(row.Unidade),
      ]),
    );
    if (!rawCompanies.length && !rawWorkers.length) {
      return Response.json(
        {
          error:
            "As tabelas esperadas do Folha Fazenda não foram encontradas neste banco.",
        },
        { status: 422 },
      );
    }
    const contracts = rawWorkers.map((row) => ({
      sourceRegistration: num(row.Matricula),
      companySourceId: num(row.CodDaEmpresa),
      name: text(row.Nome) || "Colaborador sem nome",
      cpf: text(row.CPF),
      pis: text(row.PIS),
      birthDate: date(row.Nascimento),
      birthCity: text(row.Naturalidade),
      birthState: text(row.UF_Naturalidade)?.toUpperCase() || null,
      sex: "not_informed",
      education: normalizeEducation(
        education.get(num(row.Instrucao)),
        num(row.Instrucao),
      ),
      maritalStatus: normalizeMarital(
        marital.get(num(row.Est_Civil)),
        num(row.Est_Civil),
      ),
      raceColor: "not_informed",
      address: text(row.Endereco),
      district: text(row.Bairro),
      city: text(row.Cidade),
      state: text(row.UF_Cidade)?.toUpperCase() || null,
      postalCode: text(row.CEP),
      identityNumber: text(row.Identidade),
      identityIssuer: text(row.Orgao)?.toUpperCase() || null,
      identityState: text(row.UF_orgao)?.toUpperCase() || null,
      identityIssueDate: date(row.Emissao),
      voterTitleNumber: text(row.Titulo),
      voterZone: text(row.Zona),
      voterSection: text(row.Secao),
      ctpsNumber: text(row.CTPS)?.split("/")[0]?.trim() || null,
      ctpsSeries: text(row.CTPS)?.split("/").slice(1).join("/").trim() || null,
      ctpsIssueDate: date(row.Emissao_CTPS),
      phone: text(row.Telefone),
      admissionDate: date(row["Admissão"]),
      terminationDate: date(row.Data_rescisao),
      role: text(row.Funcao),
      seasonSourceId: num(row.CadSafra) || null,
      active: row.Ativo === true && !row.Data_rescisao,
    }));
    const personKeys = new Set(
      contracts.map((row) => {
        const cpf = String(row.cpf || "").replace(/\D/g, "");
        return cpf.length === 11
          ? `CPF:${cpf}`
          : `LEGACY:${row.companySourceId}:${row.sourceRegistration}`;
      }),
    );
    const encodedName =
      request.headers.get("x-file-name") || "Banco Access.mdb";
    let fileName = encodedName;
    try {
      fileName = decodeURIComponent(encodedName);
    } catch {
      /* mantém o nome recebido */
    }
    return Response.json({
      fileName,
      companies: rawCompanies.map((row) => {
        const importedDocument = text(row.CNPJ_CEI),
          importedDigits = String(importedDocument || "").replace(/\D/g, ""),
          isLegacyCei = importedDigits.length === 12;
        return {
          sourceId: num(row.CodDaEmpresa),
          name: text(row.NomeDaEmpresa) || "Empresa sem nome",
          // O Access usa CNPJ_CEI. Um número de 12 dígitos é CEI, não
          // CNPJ/CAEPF; ele deve ocupar seu campo próprio.
          document: isLegacyCei ? null : importedDocument,
          documentType: isLegacyCei ? "caepf" : "cnpj",
          cei: isLegacyCei ? importedDigits : null,
          city: text(row.Cidade),
          state: text(row.UF),
        };
      }),
      contracts,
      dependents: get("TB_Det Dependente")
        .map((row, detailIndex) => {
          const owner = dependentOwners.get(num(row.Cad_Dep));
          if (!owner) return null;
          const cpf = String(text(row.CPF) || "").replace(/\D/g, "");
          return {
            ...owner,
            sourceId: num(row.Cad_Dep),
            sourceDetailId: detailIndex + 1,
            name: text(row.Dependente),
            birthDate: date(row.Nascimento),
            dependentType: dependentType(num(row.Grau)),
            cpf: cpf.length === 11 ? cpf : null,
          };
        })
        .filter(Boolean),
      services: rawServices.map((row) => {
        const groupSourceId = num(row.CodigoDoGrupo),
          unitSourceId = num(row.CodUnidade);
        return {
          sourceId: num(row.CodServico),
          groupSourceId,
          description: text(row.Descricao) || "Serviço sem descrição",
          unitSourceId,
          fgts: !!row.FGTS,
          fgts13: !!row["FGTS 13 Sal"],
          inss: !!row.INSS,
          inss13: !!row["INSS 13"],
          rais: !!row.RAIS,
          formulaCode: text(row.Formula),
          groupName: groups.get(groupSourceId) || null,
          unitName: units.get(unitSourceId) || null,
          affectsDsr: groupSourceId >= 4,
          active: true,
        };
      }),
      peopleCount: personKeys.size,
      activeCount: contracts.filter((row) => row.active).length,
      dependentsCount: get("TB_Det Dependente").filter((row) =>
        Boolean(text(row.Dependente)),
      ).length,
      detailsCount: names.includes("TB_Detalhes do Lançamento")
        ? reader.getTable("TB_Detalhes do Lançamento").rowCount
        : 0,
      launchesCount: names.includes("TB_Lançamentos")
        ? reader.getTable("TB_Lançamentos").rowCount
        : 0,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível ler o banco Access.",
      },
      { status: 422 },
    );
  }
}
