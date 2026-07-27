/** Cloudflare Worker entry point for the vinext-starter template. */
import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { ensureDatabase, setRuntimeDatabase } from "../db";

const apiPermissions: Record<string, string[]> = {
  "/api/data": ["Empresas", "Colaboradores", "Visão geral"],
  "/api/companies": ["Empresas", "Visão geral"],
  "/api/services": ["Serviços"],
  "/api/unions": ["Sindicatos"],
  "/api/tax-tables": ["Tabelas oficiais", "Fechamento"],
  "/api/launches": ["Apontamentos", "Relatórios", "Fechamento", "Visão geral"],
  "/api/closing": ["Fechamento"],
  "/api/import-access": ["Importar Access"],
  "/api/import-history": ["Importar Access"],
  "/api/inspect-access": ["Importar Access"],
  "/api/locations": ["Colaboradores"],
};
async function authorizeLocal(request: Request, db: D1Database) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/") || url.pathname === "/api/auth")
    return null;
  const token = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)fr_session=([^;]+)/)?.[1];
  if (!token)
    return new Response(
      JSON.stringify({ error: "Sessão expirada. Entre novamente." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    ),
    hash = [...new Uint8Array(digest)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join(""),
    row = await db
      .prepare(
        "SELECT u.role,u.permissions_json permissions FROM local_sessions s JOIN local_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP AND u.active=1 LIMIT 1",
      )
      .bind(hash)
      .first<{ role: string; permissions: string }>();
  if (!row)
    return new Response(
      JSON.stringify({ error: "Sessão expirada. Entre novamente." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  if (row.role === "admin") return null;
  const allowed =
      url.pathname === "/api/data" && request.method !== "GET"
        ? ["Colaboradores"]
        : url.pathname === "/api/launches" && request.method !== "GET"
          ? ["Apontamentos"]
          : apiPermissions[url.pathname] || [],
    permissions = JSON.parse(row.permissions || "[]") as string[];
  if (!allowed.some((p) => permissions.includes(p)))
    return new Response(
      JSON.stringify({ error: "Seu perfil não possui acesso a esta função." }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  return null;
}

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    setRuntimeDatabase(env.DB);
    await ensureDatabase();
    const url = new URL(request.url);
    const denied = await authorizeLocal(request, env.DB);
    if (denied) return denied;

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) =>
            env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
