import { and, asc, eq, gt } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { localSessions, localUsers } from "../../../db/schema";
import {
  ALL_MODULES,
  cookieToken,
  hashPassword,
  randomHex,
  sha256,
} from "../../auth-local";
import { requireCloudAdmin } from "../../auth-cloud";
import {
  getSupabaseConfig,
  supabaseAdmin,
} from "../../../db/supabase";
async function admin(r: Request) {
  const token = cookieToken(r);
  if (!token) return null;
  const [u] = await getDb()
    .select({ id: localUsers.id, role: localUsers.role })
    .from(localSessions)
    .innerJoin(localUsers, eq(localSessions.userId, localUsers.id))
    .where(
      and(
        eq(localSessions.tokenHash, await sha256(token)),
        gt(localSessions.expiresAt, new Date().toISOString()),
        eq(localUsers.active, true),
      ),
    )
    .limit(1);
  return u?.role === "admin" ? u : null;
}
export async function GET(r: Request) {
  if (getSupabaseConfig()) return cloudUsersGet(r);
  try {
    await ensureDatabase();
    if (!(await admin(r)))
      return Response.json(
        { error: "Acesso exclusivo do administrador." },
        { status: 403 },
      );
    const users = await getDb()
      .select({
        id: localUsers.id,
        name: localUsers.name,
        username: localUsers.username,
        role: localUsers.role,
        permissionsJson: localUsers.permissionsJson,
        active: localUsers.active,
        createdAt: localUsers.createdAt,
      })
      .from(localUsers)
      .orderBy(asc(localUsers.name));
    return Response.json({
      users: users.map((u) => ({
        ...u,
        permissions: JSON.parse(u.permissionsJson),
      })),
      modules: ALL_MODULES,
    });
  } catch (e) {
    return Response.json(
      {
        error: e instanceof Error ? e.message : "Falha ao consultar usuários.",
      },
      { status: 500 },
    );
  }
}
export async function POST(r: Request) {
  if (getSupabaseConfig()) return cloudUsersPost(r);
  try {
    await ensureDatabase();
    const me = await admin(r);
    if (!me)
      return Response.json(
        { error: "Acesso exclusivo do administrador." },
        { status: 403 },
      );
    const db = getDb(),
      b = (await r.json()) as Record<string, unknown>,
      id = Number(b.id),
      name = String(b.name || "").trim(),
      username = String(b.username || "")
        .trim()
        .toLowerCase(),
      password = String(b.password || ""),
      role = String(b.role || "operator"),
      permissions =
        role === "admin"
          ? ALL_MODULES
          : Array.isArray(b.permissions)
            ? b.permissions
                .filter((v) => ALL_MODULES.includes(String(v)))
                .map(String)
            : [],
      active = b.active !== false;
    if (name.length < 3 || username.length < 3)
      return Response.json(
        { error: "Informe nome e usuário." },
        { status: 400 },
      );
    if (!id && password.length < 8)
      return Response.json(
        { error: "A senha inicial deve ter pelo menos 8 caracteres." },
        { status: 400 },
      );
    const values: Record<string, unknown> = {
      name,
      username,
      role,
      permissionsJson: JSON.stringify(permissions),
      active,
    };
    if (password) {
      if (password.length < 8)
        return Response.json(
          { error: "A senha deve ter pelo menos 8 caracteres." },
          { status: 400 },
        );
      const salt = randomHex(16);
      values.passwordSalt = salt;
      values.passwordHash = await hashPassword(password, salt);
    }
    if (id)
      await db.update(localUsers).set(values).where(eq(localUsers.id, id));
    else
      await db
        .insert(localUsers)
        .values(values as typeof localUsers.$inferInsert);
    return Response.json({ ok: true, message: "Usuário salvo com sucesso." });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Falha ao salvar usuário." },
      { status: 500 },
    );
  }
}

type CloudProfile = {
  user_id: string;
  full_name: string;
  username: string;
  permissions: string[];
  active: boolean;
  created_at: string;
};

async function cloudUsersGet(request: Request) {
  const me = await requireCloudAdmin(request);
  const config = getSupabaseConfig()!;
  if (!me)
    return Response.json(
      { error: "Acesso exclusivo do administrador." },
      { status: 403 },
    );
  try {
    const [profiles, memberships, accesses, companies] = await Promise.all([
      supabaseAdmin.get<CloudProfile[]>(
        `/rest/v1/user_profiles?select=*&order=full_name.asc`,
      ),
      supabaseAdmin.get<Array<{ user_id: string; role: string }>>(
        `/rest/v1/organization_members?select=user_id,role&organization_id=eq.${config.organizationId}`,
      ),
      supabaseAdmin.get<Array<{ user_id: string; company_id: string }>>(
        `/rest/v1/user_company_access?select=user_id,company_id&organization_id=eq.${config.organizationId}`,
      ),
      supabaseAdmin.get<
        Array<{ id: string; legacy_id: number; name: string; active?: boolean }>
      >(
        `/rest/v1/companies?select=id,legacy_id,name&organization_id=eq.${config.organizationId}&order=name.asc`,
      ),
    ]);
    const roleByUser = new Map(
      memberships.map((membership) => [membership.user_id, membership.role]),
    );
    return Response.json({
      users: profiles
        .filter((profile) => roleByUser.has(profile.user_id))
        .map((profile) => {
          const role = roleByUser.get(profile.user_id) || "viewer";
          return {
            id: profile.user_id,
            name: profile.full_name,
            username: profile.username,
            role: ["owner", "admin"].includes(role) ? "admin" : "operator",
            permissions: profile.permissions || [],
            companyIds: accesses
              .filter((access) => access.user_id === profile.user_id)
              .map((access) => access.company_id),
            active: profile.active,
            createdAt: profile.created_at,
          };
        }),
      companies: companies.map((company) => ({
        id: company.id,
        sourceId: company.legacy_id,
        name: company.name,
      })),
      authMode: "cloud",
      modules: ALL_MODULES,
    });
  } catch {
    return Response.json(
      { error: "Falha ao consultar usuários no Supabase." },
      { status: 500 },
    );
  }
}

async function cloudUsersPost(request: Request) {
  const me = await requireCloudAdmin(request);
  const config = getSupabaseConfig()!;
  if (!me)
    return Response.json(
      { error: "Acesso exclusivo do administrador." },
      { status: 403 },
    );
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id || "");
    const name = String(body.name || "").trim();
    const email = String(body.username || "").trim().toLowerCase();
    const role = body.role === "admin" ? "admin" : "operator";
    const permissions =
      role === "admin"
        ? ALL_MODULES
        : Array.isArray(body.permissions)
          ? body.permissions
              .map(String)
              .filter((permission) => ALL_MODULES.includes(permission))
          : [];
    const companyIds = Array.isArray(body.companyIds)
      ? body.companyIds.map(String).filter(Boolean)
      : [];
    if (name.length < 3 || !email.includes("@"))
      return Response.json(
        { error: "Informe o nome e um e-mail válido." },
        { status: 400 },
      );
    if (role !== "admin" && !companyIds.length)
      return Response.json(
        { error: "Selecione pelo menos uma empresa para este usuário." },
        { status: 400 },
      );
    let userId = id;
    if (!userId) {
      const invited = await supabaseAdmin.auth<{ id: string }>(
        `/auth/v1/invite?redirect_to=${encodeURIComponent("https://folha-rural.goicanadesenvolve.chatgpt.site/accept-invite")}`,
        { email, data: { full_name: name } },
      );
      userId = invited.id;
    }
    await supabaseAdmin.post(
      "/rest/v1/user_profiles?on_conflict=user_id",
      {
        user_id: userId,
        full_name: name,
        username: email,
        permissions,
        active: body.active !== false,
        updated_at: new Date().toISOString(),
      },
      { prefer: "resolution=merge-duplicates,return=minimal" },
    );
    await supabaseAdmin.post(
      "/rest/v1/organization_members?on_conflict=organization_id,user_id",
      {
        organization_id: config.organizationId,
        user_id: userId,
        role: role === "admin" ? "admin" : "viewer",
      },
      { prefer: "resolution=merge-duplicates,return=minimal" },
    );
    await supabaseAdmin.delete(
      `/rest/v1/user_company_access?organization_id=eq.${config.organizationId}&user_id=eq.${userId}`,
    );
    if (role !== "admin")
      await supabaseAdmin.post(
        "/rest/v1/user_company_access?on_conflict=organization_id,user_id,company_id",
        companyIds.map((companyId) => ({
          organization_id: config.organizationId,
          user_id: userId,
          company_id: companyId,
        })),
        { prefer: "resolution=merge-duplicates,return=minimal" },
      );
    return Response.json({
      ok: true,
      message: id
        ? "Acesso atualizado com sucesso."
        : "Convite enviado com sucesso.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return Response.json(
      {
        error: /already|registered|exists/i.test(message)
          ? "Este e-mail já possui um usuário no Supabase."
          : "Não foi possível salvar e enviar o convite.",
      },
      { status: 500 },
    );
  }
}
