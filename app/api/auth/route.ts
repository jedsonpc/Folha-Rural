import { and, asc, count, eq, gt } from "drizzle-orm";
import { ensureDatabase, getDb } from "../../../db";
import { localSessions, localUsers } from "../../../db/schema";
import {
  ALL_MODULES,
  cookieToken,
  hashPassword,
  randomHex,
  sha256,
} from "../../auth-local";
const json = (body: object, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, headers });
async function current(request: Request) {
  const token = cookieToken(request);
  if (!token) return null;
  const tokenHash = await sha256(token),
    db = getDb(),
    [row] = await db
      .select({
        id: localUsers.id,
        name: localUsers.name,
        username: localUsers.username,
        role: localUsers.role,
        permissionsJson: localUsers.permissionsJson,
        active: localUsers.active,
      })
      .from(localSessions)
      .innerJoin(localUsers, eq(localSessions.userId, localUsers.id))
      .where(
        and(
          eq(localSessions.tokenHash, tokenHash),
          gt(localSessions.expiresAt, new Date().toISOString()),
          eq(localUsers.active, true),
        ),
      )
      .limit(1);
  return row || null;
}
export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const db = getDb(),
      [total] = await db.select({ value: count() }).from(localUsers),
      user = await current(request);
    return json({
      setupRequired: total.value === 0,
      user: user
        ? { ...user, permissions: JSON.parse(user.permissionsJson) }
        : null,
    });
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Falha na autenticação." },
      500,
    );
  }
}
export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const db = getDb(),
      b = (await request.json()) as Record<string, unknown>,
      action = String(b.action || "login");
    if (action === "setup") {
      const [total] = await db.select({ value: count() }).from(localUsers);
      if (total.value)
        return json(
          { error: "O administrador inicial já foi cadastrado." },
          409,
        );
      const name = String(b.name || "").trim(),
        username = String(b.username || "")
          .trim()
          .toLowerCase(),
        password = String(b.password || "");
      if (name.length < 3 || username.length < 3 || password.length < 8)
        return json(
          {
            error: "Informe nome, usuário e senha com pelo menos 8 caracteres.",
          },
          400,
        );
      const salt = randomHex(16),
        passwordHash = await hashPassword(password, salt);
      await db.insert(localUsers).values({
        name,
        username,
        passwordHash,
        passwordSalt: salt,
        role: "admin",
        permissionsJson: JSON.stringify(ALL_MODULES),
        active: true,
      });
      return login(db, username, password);
    }
    if (action === "logout") {
      const token = cookieToken(request);
      if (token)
        await db
          .delete(localSessions)
          .where(eq(localSessions.tokenHash, await sha256(token)));
      return json({ ok: true }, 200, {
        "Set-Cookie":
          "fr_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
      });
    }
    if (action === "login")
      return login(
        db,
        String(b.username || "")
          .trim()
          .toLowerCase(),
        String(b.password || ""),
      );
    return json({ error: "Ação inválida." }, 400);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Falha na autenticação." },
      500,
    );
  }
}
async function login(
  db: ReturnType<typeof getDb>,
  username: string,
  password: string,
) {
  const [user] = await db
    .select()
    .from(localUsers)
    .where(eq(localUsers.username, username))
    .limit(1);
  if (
    !user ||
    !user.active ||
    (await hashPassword(password, user.passwordSalt)) !== user.passwordHash
  )
    return json({ error: "Usuário ou senha inválidos." }, 401);
  const token = randomHex(32),
    expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  await db.insert(localSessions).values({
    userId: user.id,
    tokenHash: await sha256(token),
    expiresAt: expires,
  });
  return json(
    {
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        permissions: JSON.parse(user.permissionsJson),
      },
    },
    200,
    {
      "Set-Cookie": `fr_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200`,
    },
  );
}
