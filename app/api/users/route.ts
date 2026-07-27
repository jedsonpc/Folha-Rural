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
