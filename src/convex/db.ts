"use node";

import { Pool } from "pg";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";

/* ====================================================================== */
/* ChopMboa — Neon Postgres access layer                                  */
/* All business data lives in the owner's Neon database (public schema).  */
/* Auth/identities remain in Convex (`users` here = Convex users table).  */
/* Every node action connects with the DATABASE_URL stored through the    */
/* platform's Keys/API-keys manager (never hardcoded).                    */
/* ====================================================================== */

const CONN_ERRORS = [
  "DATABASE_URL is not configured.",
  "DATABASE_URL looks like a placeholder — add your real Neon connection string in the Keys manager.",
] as const;

/** Lazy singleton pool bound to the deployment's DATABASE_URL. */
let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error(CONN_ERRORS[0]);
  const connectionString = raw.trim();
  if (/^(your|<|DATABASE_URL=)/i.test(connectionString)) {
    throw new Error(CONN_ERRORS[1]);
  }

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 12_000,
  });
  return pool;
}

export function closePool(): void {
  if (pool) {
    void pool.end().catch(() => undefined);
    pool = null;
  }
}

/* ------------------------------ constants ------------------------------ */

export const DEMO_FALLBACK_EMAIL = "owner+demo@chopmboa.cm";

/* ------------------------------ row types ------------------------------ */

export interface AppUserRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  global_role: "super_admin" | "owner" | "customer";
  is_active: boolean;
  created_at: Date;
}

export interface RestaurantRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface MenuCategoryRow {
  id: string;
  restaurant_id: string;
  name: string;
  display_order: number;
  created_at: Date;
  deleted_at: Date | null;
}

export interface MenuItemRow {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_fcfa: number;
  image_url: string | null;
  is_available: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface TableRow {
  id: string;
  restaurant_id: string;
  table_number: string;
  qr_code_token: string;
  capacity: number;
  status: "free" | "occupied" | "reserved";
  created_at: Date;
  deleted_at: Date | null;
}

export interface OrderRow {
  id: string;
  restaurant_id: string;
  order_type: "dine_in" | "delivery";
  table_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  status:
    | "pending"
    | "confirmed"
    | "in_kitchen"
    | "ready"
    | "served"
    | "delivered"
    | "cancelled";
  subtotal_fcfa: number;
  delivery_fee_fcfa: number;
  total_fcfa: number;
  payment_method: "cash" | "mobile_money";
  payment_status: "pending" | "paid";
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price_fcfa: number;
  subtotal_fcfa: number;
  notes: string | null;
}

export interface OrderStatusHistoryRow {
  id: string;
  order_id: string;
  status: OrderRow["status"];
  changed_by: string | null;
  changed_at: Date;
}

export interface OrderPaymentRow {
  id: string;
  order_id: string;
  amount_fcfa: number;
  method: "cash" | "mobile_money";
  collected_by: string | null;
  collected_at: Date;
}

export interface SubscriptionPlanRow {
  id: string;
  code: string;
  name: string;
  price_fcfa: number;
  max_restaurants: number | null;
  max_tables_per_restaurant: number | null;
  delivery_commission_pct: string;
  created_at: Date;
}

export interface SubscriptionRow {
  id: string;
  owner_id: string;
  plan_id: string;
  status: "trial" | "active" | "expired" | "cancelled";
  trial_ends_at: Date | null;
  current_period_end: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLogRow {
  id: string;
  restaurant_id: string | null;
  user_id: string | null;
  action: string;
  target_entity: string | null;
  metadata: string | null;
  created_at: Date;
}

export interface OnboardingDraftRow {
  user_id: string;
  current_step: number;
  data: Record<string, unknown>;
  completed_at: Date | null;
  restaurant_id: string | null;
  created_at: Date;
  updated_at: Date;
}

/* ------------------------------- helpers ------------------------------- */

export function toTs(ms?: number | null): Date | null {
  if (ms === undefined || ms === null) return null;
  return new Date(ms);
}

/**
 * Deep-convert `Date` values to ISO strings so action results can cross the
 * Convex serialization boundary (Convex rejects Date instances). Mappers on
 * the client already parse both Date and ISO-string inputs.
 */
export function serializable<T>(value: T): T {
  if (value instanceof Date) {
    return value.toISOString() as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializable(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serializable(val);
    }
    return out as T;
  }
  return value;
}

export function fromTs(d?: Date | string | null): number | null {
  if (!d) return null;
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

export function fromNumeric(v?: string | number | null): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function num(v?: number | null): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
}

export function shortText(v?: string | null, max = 150): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export function textOrNull(v?: string | null, max = 2000): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

/** URL-safe random token for table QR codes. */
export function qrToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* --------------------------- user resolution --------------------------- */

/** Email of the signed-in Convex user (or null for anonymous demo fallback). */
export async function currentUserEmail(
  ctx: ActionCtx,
): Promise<string | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const user = await ctx.runQuery(api.users.currentUser);
  return (user?.email ?? "").trim() || null;
}

/** Convex user id of the signed-in user, or null. */
export async function currentConvexUserId(
  ctx: ActionCtx,
): Promise<string | null> {
  const userId = await getAuthUserId(ctx);
  return userId ?? null;
}

/** Full name to store on first provisioning. */
export async function currentUserName(
  ctx: ActionCtx,
): Promise<string | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const user = await ctx.runQuery(api.users.currentUser);
  return (user?.name ?? "").trim() || null;
}

/**
 * Ensure a matching row exists in the Neon `users` table for the signed-in
 * Convex user and return it. The Postgres `password_hash` column is NOT NULL,
 * so provisioned users get an unusable sentinel hash (auth stays in Convex).
 */
export async function ensureAppUser(
  ctx: ActionCtx,
  email: string,
  fullName?: string | null,
): Promise<AppUserRow> {
  const db = getPool();
  const cleanEmail = email.trim().toLowerCase();
  const name = (fullName ?? "").trim() || cleanEmail.split("@")[0] || "Propriétaire";

  const existing = await db.query<AppUserRow>(
    `SELECT id, full_name, email, phone, global_role, is_active, created_at
       FROM users WHERE email = $1 LIMIT 1`,
    [cleanEmail],
  );
  if (existing.rows[0]) return existing.rows[0];

  const inserted = await db.query<AppUserRow>(
    `INSERT INTO users (full_name, email, password_hash, global_role, is_active)
     VALUES ($1, $2, $3, 'owner', true)
     ON CONFLICT (email) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           updated_at = now()
     RETURNING id, full_name, email, phone, global_role, is_active, created_at`,
    [name, cleanEmail, `!convex-auth:${crypto.randomUUID()}`],
  );
  return inserted.rows[0];
}

/** Provisioned Neon user for the signed-in Convex user, or null when signed out. */
export async function currentAppUser(
  ctx: ActionCtx,
): Promise<AppUserRow | null> {
  const email = await currentUserEmail(ctx);
  if (!email) return null;
  return await ensureAppUser(ctx, email, await currentUserName(ctx));
}

/* ------------------------------ diagnostics ---------------------------- */

/** True when the database accepts connections. */
export async function poolHealth(): Promise<boolean> {
  try {
    const db = getPool();
    await db.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/** Number of business tables found in the public schema (diagnostics). */
export async function countPublicTables(): Promise<number> {
  const db = getPool();
  const res = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  return Number(res.rows[0]?.count ?? "0");
}
