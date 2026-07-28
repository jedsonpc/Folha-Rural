import { getSupabaseConfig } from "../../../db/supabase";

export async function POST(request: Request) {
  const config = getSupabaseConfig();
  if (!config)
    return Response.json(
      { error: "A autenticação em nuvem ainda não está configurada." },
      { status: 503 },
    );
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const accessToken = String(body.accessToken || "");
    const password = String(body.password || "");
    if (!accessToken)
      return Response.json(
        { error: "Convite inválido ou expirado. Solicite um novo convite." },
        { status: 400 },
      );
    if (password.length < 8)
      return Response.json(
        { error: "A senha deve ter pelo menos 8 caracteres." },
        { status: 400 },
      );
    const response = await fetch(`${config.url}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: config.publicKey,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ password }),
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as {
        msg?: string;
        message?: string;
      };
      const expired = /expired|invalid|token/i.test(
        detail.msg || detail.message || "",
      );
      return Response.json(
        {
          error: expired
            ? "Este convite expirou ou já foi utilizado. Solicite um novo convite."
            : "Não foi possível definir a senha. Tente novamente.",
        },
        { status: response.status },
      );
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Não foi possível concluir o convite." },
      { status: 500 },
    );
  }
}

