const SOURCE =
  "https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/cbo/servicos/downloads/cbo2002-ocupacao.csv";

type CboItem = { code: string; description: string };
let cache: CboItem[] | null = null;

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

async function officialOccupations() {
  if (cache) return cache;
  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error("A base oficial de CBO está indisponível.");
  const text = new TextDecoder("windows-1252").decode(
    new Uint8Array(await response.arrayBuffer()),
  );
  cache = text
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const columns = line
        .split(";")
        .map((value) => value.replace(/^"|"$/g, "").trim());
      return {
        code: (columns[0] || "").replace(/\D/g, ""),
        description: columns[1] || "",
      };
    })
    .filter((item) => item.code && item.description);
  return cache;
}

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q")?.trim() || "";
    if (query.length < 2) return Response.json({ results: [] });
    const wanted = normalize(query);
    const digits = query.replace(/\D/g, "");
    const results = (await officialOccupations())
      .filter(
        (item) =>
          (digits.length >= 2 && item.code.includes(digits)) ||
          normalize(item.description).includes(wanted),
      )
      .slice(0, 20);
    return Response.json({ results, source: SOURCE });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Falha na consulta oficial.",
      },
      { status: 502 },
    );
  }
}
