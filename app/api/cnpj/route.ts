const clean = (value: string) => value.replace(/\D/g, "").slice(0, 14);
const valid = (value: string) => {
  const cnpj = clean(value);
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

export async function GET(request: Request) {
  const cnpj = clean(new URL(request.url).searchParams.get("cnpj") || "");
  if (!valid(cnpj))
    return Response.json({ error: "CNPJ inválido." }, { status: 400 });
  const fromBrasilApi = async () => {
    const response = await fetch(
      `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
    );
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(response.status));
    return {
      cnpj,
      legalName: String(data.razao_social || ""),
      tradeName: String(data.nome_fantasia || ""),
      registrationStatus: String(data.descricao_situacao_cadastral || ""),
      email: String(data.email || ""),
      phone: [data.ddd_telefone_1, data.ddd_telefone_2]
        .filter(Boolean)
        .join(" / "),
      postalCode: String(data.cep || ""),
      address: [data.descricao_tipo_de_logradouro, data.logradouro]
        .filter(Boolean)
        .join(" "),
      addressNumber: String(data.numero || ""),
      addressComplement: String(data.complemento || ""),
      district: String(data.bairro || ""),
      city: String(data.municipio || ""),
      state: String(data.uf || ""),
      checkedAt: new Date().toISOString(),
      source: "Dados públicos do CNPJ/Receita Federal via BrasilAPI",
    };
  };
  const fromReceitaWs = async () => {
    const response = await fetch(
      `https://www.receitaws.com.br/v1/cnpj/${cnpj}`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
      },
    );
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok || data.status === "ERROR")
      throw new Error(String(response.status));
    return {
      cnpj,
      legalName: String(data.nome || ""),
      tradeName: String(data.fantasia || ""),
      registrationStatus: String(data.situacao || ""),
      email: String(data.email || ""),
      phone: String(data.telefone || ""),
      postalCode: String(data.cep || ""),
      address: [data.tipo, data.logradouro].filter(Boolean).join(" "),
      addressNumber: String(data.numero || ""),
      addressComplement: String(data.complemento || ""),
      district: String(data.bairro || ""),
      city: String(data.municipio || ""),
      state: String(data.uf || ""),
      checkedAt: new Date().toISOString(),
      source: "Dados públicos do CNPJ/Receita Federal via ReceitaWS",
    };
  };
  try {
    try {
      return Response.json(await fromBrasilApi());
    } catch {
      return Response.json(await fromReceitaWs());
    }
  } catch {
    return Response.json(
      {
        error:
          "Não foi possível consultar os dados cadastrais agora. O CNPJ é válido; tente novamente em instantes ou preencha os demais campos manualmente.",
      },
      { status: 503 },
    );
  }
}
