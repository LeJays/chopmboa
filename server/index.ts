import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { Pool } from "pg";
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const app = new Hono();
const port = Number(process.env.API_PORT ?? 8787);
const jwtSecret = process.env.JWT_SECRET;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("DATABASE_URL is required in .env");
if (!jwtSecret) throw new Error("JWT_SECRET is required in .env");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 4,
  connectionTimeoutMillis: 12_000,
  idleTimeoutMillis: 20_000,
});

type TokenPayload = { sub: string; exp: number };

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signToken(payload: TokenPayload): string {
  const header = encode({ alg: "HS256", typ: "JWT" });
  const body = encode(payload);
  const signature = createHmac("sha256", jwtSecret!).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyToken(token: string | undefined): TokenPayload | null {
  if (!token) return null;
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) return null;
  const expected = createHmac("sha256", jwtSecret!).update(`${header}.${body}`).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenPayload;
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function comparePassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function issueSession(userId: string, c: Parameters<typeof setCookie>[0]) {
  const token = signToken({ sub: userId, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 });
  setCookie(c, "chopmboa_session", token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

app.use("/api/*", cors({ origin: process.env.CORS_ORIGIN?.split(",")[0] ?? "http://localhost:5173", credentials: true }));

app.get("/api/health", async (c) => {
  try {
    await pool.query("SELECT 1");
    return c.json({ ok: true, database: "connected" });
  } catch (error) {
    console.error("Neon health check failed", error);
    return c.json({ ok: false, database: "unavailable" }, 503);
  }
});

app.post("/api/auth/signup", async (c) => {
  const body = await c.req.json<{ fullName?: string; email?: string; password?: string }>();
  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!fullName || fullName.length < 2 || !email?.includes("@") || password.length < 8) {
    return c.json({ error: "Nom, email valide et mot de passe de 8 caractères minimum requis." }, 400);
  }
  try {
    const passwordHash = await hashPassword(password);
    const result = await pool.query<{ id: string }>(
      `INSERT INTO users (full_name, email, password_hash, global_role, is_active)
       VALUES ($1, $2, $3, 'owner', true) RETURNING id`,
      [fullName, email, passwordHash],
    );
    issueSession(result.rows[0].id, c);
    return c.json({ ok: true });
  } catch (error: any) {
    if (error?.code === "23505") return c.json({ error: "Un compte existe déjà avec cet email." }, 409);
    console.error("Signup failed", error);
    return c.json({ error: "Création du compte impossible." }, 500);
  }
});

app.post("/api/auth/signin", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const result = await pool.query<{ id: string; full_name: string; email: string | null; password_hash: string; is_active: boolean }>(
    `SELECT id, full_name, email, password_hash, is_active FROM users WHERE email = $1 LIMIT 1`,
    [body.email?.trim().toLowerCase()],
  );
  const user = result.rows[0];
  if (!user || !user.is_active || !(await comparePassword(body.password ?? "", user.password_hash))) {
    return c.json({ error: "Email ou mot de passe incorrect." }, 401);
  }
  issueSession(user.id, c);
  return c.json({ ok: true });
});

app.get("/api/auth/me", async (c) => {
  const payload = verifyToken(getCookie(c, "chopmboa_session"));
  if (!payload) return c.json({ user: null });
  const result = await pool.query<{ id: string; full_name: string; email: string | null; global_role: string }>(
    `SELECT id, full_name, email, global_role FROM users WHERE id = $1::uuid AND is_active = true`,
    [payload.sub],
  );
  const user = result.rows[0];
  return c.json({ user: user ? { id: user.id, name: user.full_name, email: user.email, role: user.global_role } : null });
});

app.post("/api/auth/signout", (c) => {
  deleteCookie(c, "chopmboa_session", { path: "/" });
  return c.json({ ok: true });
});

app.notFound((c) => c.json({ error: "Route API introuvable." }, 404));

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Neon API running on http://localhost:${info.port}`);
});