const clean = (value: string) => value.replace(/\D/g, "").slice(0, 8);

export async function GET(request: Request) {
  const cep = clean(new URL(request.url).searchParams.get("cep") || "");
  if (cep.length !== 8)
    return Response.json({ error: "CEP inválido." }, { status: 400 });
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok || data.erro)
      return Response.json(
        { error: "CEP não encontrado na base pública." },
        { status: 404 },
      );
    return Response.json({
      postalCode: cep,
      address: String(data.logradouro || ""),
      addressComplement: String(data.complemento || ""),
      district: String(data.bairro || ""),
      city: String(data.localidade || ""),
      state: String(data.uf || ""),
      source: "ViaCEP",
    });
  } catch {
    return Response.json(
      {
        error:
          "Não foi possível consultar o CEP agora. Os dados podem ser preenchidos manualmente.",
      },
      { status: 503 },
    );
  }
}
