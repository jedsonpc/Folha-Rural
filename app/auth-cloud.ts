import {
  getSupabaseConfig,
  readSupabaseCookies,
  supabaseRequest,
} from "../db/supabase";

export type CloudUser = {
  id: string;
  name: string;
  username: string;
  role: string;
  permissions: string[];
  companyIds: number[] | null;
  organizationId: string;
};

export async function cloudUser(request: Request): Promise<CloudUser | null> {
  const config = getSupabaseConfig();
  if (!config) return null;
  const { accessToken } = readSupabaseCookies(request);
  if (!accessToken) return null;
  try {
    const identity = await supabaseRequest<{ id: string; email?: string }>(
      "/auth/v1/user",
      {},
      accessToken,
    );
    const profiles = await supabaseRequest<
      Array<{
        full_name: string;
        username: string;
        permissions: string[];
        active: boolean;
      }>
    >(
      `/rest/v1/user_profiles?select=full_name,username,permissions,active&user_id=eq.${identity.id}&limit=1`,
    );
    const memberships = await supabaseRequest<Array<{ role: string }>>(
      `/rest/v1/organization_members?select=role&organization_id=eq.${config.organizationId}&user_id=eq.${identity.id}&limit=1`,
    );
    const profile = profiles[0];
    const membership = memberships[0];
    if (!profile?.active || !membership) return null;
    const isAdmin = ["owner", "admin"].includes(membership.role);
    const access = isAdmin
      ? []
      : await supabaseRequest<
          Array<{ companies: { legacy_id: number | null } | null }>
        >(
          `/rest/v1/user_company_access?select=companies(legacy_id)&organization_id=eq.${config.organizationId}&user_id=eq.${identity.id}`,
        );
    return {
      id: identity.id,
      name: profile.full_name,
      username: profile.username || identity.email || "",
      role: isAdmin ? "admin" : membership.role,
      permissions: isAdmin ? ["*"] : profile.permissions || [],
      companyIds: isAdmin
        ? null
        : access
            .map((row) => row.companies?.legacy_id)
            .filter((value): value is number => Number.isFinite(value)),
      organizationId: config.organizationId,
    };
  } catch {
    return null;
  }
}

export async function requireCloudAdmin(request: Request) {
  const user = await cloudUser(request);
  return user?.role === "admin" ? user : null;
}

export async function authorizeCloud(
  request: Request,
  permission: string,
  companySourceId?: number,
) {
  if (!getSupabaseConfig()) return { user: null, response: null };
  const user = await cloudUser(request);
  if (!user)
    return {
      user: null,
      response: Response.json(
        { error: "Sessão inválida ou expirada." },
        { status: 401 },
      ),
    };
  if (
    user.role !== "admin" &&
    !user.permissions.includes(permission) &&
    !user.permissions.includes("*")
  )
    return {
      user,
      response: Response.json(
        { error: "Seu perfil não possui acesso a este módulo." },
        { status: 403 },
      ),
    };
  if (
    Number.isFinite(companySourceId) &&
    user.companyIds !== null &&
    !user.companyIds.includes(Number(companySourceId))
  )
    return {
      user,
      response: Response.json(
        { error: "Seu perfil não possui acesso a esta empresa." },
        { status: 403 },
      ),
    };
  return { user, response: null };
}
