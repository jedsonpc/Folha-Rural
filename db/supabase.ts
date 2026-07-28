type SupabaseConfig = {
  url: string;
  publicKey: string;
  serviceKey: string;
  organizationId: string;
};

const env = (name: string) =>
  typeof process !== "undefined" ? process.env[name]?.trim() || "" : "";

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const publicKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const organizationId = env("SUPABASE_ORGANIZATION_ID");
  return url && publicKey && serviceKey && organizationId
    ? { url, publicKey, serviceKey, organizationId }
    : null;
}

export const usesSupabase = () => Boolean(getSupabaseConfig());

async function request<T>(
  path: string,
  init: RequestInit = {},
  bearer?: string,
): Promise<T> {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase não configurado neste ambiente.");
  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      apikey: config.serviceKey,
      authorization: `Bearer ${bearer || config.serviceKey}`,
      "content-type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase ${response.status}: ${message}`);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const supabaseAdmin = {
  get<T>(path: string) {
    return request<T>(path);
  },
  post<T>(path: string, body: unknown, headers?: HeadersInit) {
    return request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers,
    });
  },
  patch<T>(path: string, body: unknown, headers?: HeadersInit) {
    return request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers,
    });
  },
  delete<T>(path: string) {
    return request<T>(path, { method: "DELETE" });
  },
  auth<T>(path: string, body: unknown, bearer?: string) {
    return request<T>(
      path,
      { method: "POST", body: JSON.stringify(body) },
      bearer,
    );
  },
};

export function readSupabaseCookies(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const value = (name: string) =>
    decodeURIComponent(
      cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))?.[1] || "",
    );
  return {
    accessToken: value("fr_access_token"),
    refreshToken: value("fr_refresh_token"),
  };
}

export function authCookies(
  accessToken: string,
  refreshToken: string,
  expiresIn = 3600,
) {
  const secure = env("VERCEL") ? "; Secure" : "";
  return [
    `fr_access_token=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${expiresIn}${secure}`,
    `fr_refresh_token=${encodeURIComponent(refreshToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`,
  ];
}

export function clearAuthCookies() {
  const secure = env("VERCEL") ? "; Secure" : "";
  return [
    `fr_access_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    `fr_refresh_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  ];
}

