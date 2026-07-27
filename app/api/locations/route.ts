const states = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];
export async function GET(request: Request) {
  try {
    const state = (
      new URL(request.url).searchParams.get("state") || ""
    ).toUpperCase();
    if (!state) return Response.json({ states });
    if (!states.includes(state))
      return Response.json({ error: "UF inválida." }, { status: 400 });
    const response = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${state}/municipios?orderBy=nome`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) throw new Error("Serviço de municípios indisponível.");
    const rows = (await response.json()) as Array<{ id: number; nome: string }>;
    return Response.json(
      { state, cities: rows.map((row) => ({ id: row.id, name: row.nome })) },
      { headers: { "Cache-Control": "public, max-age=86400" } },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Não foi possível carregar os municípios.",
      },
      { status: 503 },
    );
  }
}
