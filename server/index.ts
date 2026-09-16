import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { Pool } from "pg";
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const app = new Hono();

app.onError((err, c) => {
  console.error("Unhandled Hono Error:", err);
  return c.json({ error: "Internal Server Error", details: err.message }, 500);
});
const port = Number(process.env.API_PORT ?? 8787);
const jwtSecret = process.env.JWT_SECRET?.replace(/^"|"$/g, "");
const databaseUrl = process.env.DATABASE_URL?.replace(/^"|"$/g, "");

if (!databaseUrl) throw new Error("DATABASE_URL is required in .env");
if (!jwtSecret) throw new Error("JWT_SECRET is required in .env");

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 4,
  connectionTimeoutMillis: 12_000,
  idleTimeoutMillis: 20_000,
});

async function ensureSchema() {
  try {
    await pool.query(`ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_url TEXT`);
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS logo_url TEXT`);
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION`);
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS landmark TEXT`);
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS momo_active BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS momo_number TEXT`);
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS momo_name TEXT`);
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS om_active BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS om_number TEXT`);
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS om_name TEXT`);
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cash_active BOOLEAN DEFAULT true`);
    await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS payment_instructions TEXT`);
    console.log("Database schema columns checked/added successfully.");
  } catch (err) {
    console.error("Schema initialization warning:", err);
  }
}
void ensureSchema();

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
  // SameSite=Lax works for same-domain deployments (Netlify frontend + function on same origin)
  // SameSite=None;Secure is only needed for cross-origin cookie sharing
  const isProduction = process.env.NODE_ENV === "production";
  const cookieFlags = isProduction
    ? `HttpOnly; SameSite=Lax; Secure`
    : `HttpOnly; SameSite=Lax`;
  c.header(
    "Set-Cookie",
    `chopmboa_session=${token}; Max-Age=${60 * 60 * 24 * 7}; Path=/; ${cookieFlags}`,
    { append: true }
  );
}

app.use("/api/*", cors({ origin: (origin) => origin || "*", credentials: true }));

app.get("/api/health", async (c) => {
  try {
    await pool.query("SELECT 1");
    return c.json({ ok: true, database: "connected" });
  } catch (error: any) {
    console.error("Neon health check failed", error);
    return c.json({ ok: false, database: "unavailable", error: String(error) }, 503);
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
  c.header(
    "Set-Cookie",
    "chopmboa_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    { append: true }
  );
  deleteCookie(c, "chopmboa_session", {
    path: "/",
    secure: true,
    sameSite: "Lax",
  });
  return c.json({ ok: true });
});

app.post("/api/actions/:actionRef", async (c) => {
  const actionRef = c.req.param("actionRef");

  if (actionRef === "staff.whoAmI") {
    const payload = verifyToken(getCookie(c, "chopmboa_session"));
    if (payload) {
      const result = await pool.query(
        `SELECT id, full_name, email, global_role FROM users WHERE id = $1::uuid AND is_active = true`,
        [payload.sub]
      );
      const user = result.rows[0];
      if (user) {
        const restRes = await pool.query(
          `SELECT r.id, r.name, (r.owner_id = $1::uuid) as is_owner, rs.role as staff_role
           FROM restaurants r
           LEFT JOIN restaurant_staff rs ON r.id = rs.restaurant_id AND rs.user_id = $1::uuid AND rs.deleted_at IS NULL
           WHERE (r.owner_id = $1::uuid OR rs.id IS NOT NULL) AND r.deleted_at IS NULL
           ORDER BY r.created_at DESC`,
          [payload.sub]
        );
        const myRestaurants = restRes.rows.map(r => ({
          id: r.id,
          name: r.name,
          isOwner: Boolean(r.is_owner)
        }));

        const isOwner = user.global_role === 'owner' || myRestaurants.some(r => r.isOwner);
        const staffRole = restRes.rows.find(r => r.staff_role)?.staff_role || null;
        const effectiveRole = isOwner ? 'owner' : (staffRole || 'customer');

        return c.json({
          userId: user.id,
          fullName: user.full_name,
          email: user.email,
          role: effectiveRole,
          restaurants: myRestaurants,
          primaryRestaurantId: myRestaurants[0]?.id || null,
          primaryRestaurantName: myRestaurants[0]?.name || null
        });
      }
    }
    return c.json(null);
  }

  if (actionRef === "restaurants.create") {
    const payload = verifyToken(getCookie(c, "chopmboa_session"));
    if (!payload) return c.json({ error: "Non autorisé" }, 401);

    // Vérification stricte : seul le propriétaire peut créer un restaurant
    const userRes = await pool.query(
      `SELECT global_role FROM users WHERE id = $1::uuid`,
      [payload.sub]
    );
    const user = userRes.rows[0];
    if (!user || user.global_role !== 'owner') {
      return c.json({ error: "Seul le propriétaire a le droit de créer un restaurant. Les gérants ne sont pas autorisés à créer d'établissement." }, 403);
    }

    const body = await c.req.json<{
      name?: string;
      city?: string;
      address?: string;
      phone?: string;
      description?: string;
      logoUrl?: string;
      latitude?: number;
      longitude?: number;
      landmark?: string;
    }>();
    if (!body.name?.trim()) return c.json({ error: "Le nom du restaurant est requis" }, 400);

    const formattedAddress = body.city 
      ? `${body.address?.trim() || ''} — ${body.city.trim()}`.replace(/^ — /, '')
      : body.address?.trim() || null;

    const result = await pool.query(
      `INSERT INTO restaurants (owner_id, name, description, address, phone, logo_url, latitude, longitude, landmark)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, description, address, phone, is_active, created_at, logo_url, latitude, longitude, landmark`,
      [
        payload.sub,
        body.name.trim(),
        body.description?.trim() || null,
        formattedAddress || null,
        body.phone?.trim() || null,
        body.logoUrl?.trim() || null,
        body.latitude != null ? Number(body.latitude) : null,
        body.longitude != null ? Number(body.longitude) : null,
        body.landmark?.trim() || null
      ]
    );

    const restaurant = result.rows[0];

    // Log in audit_logs
    await pool.query(
      `INSERT INTO audit_logs (restaurant_id, user_id, action, target_entity, metadata)
       VALUES ($1::uuid, $2::uuid, 'CREATE_RESTAURANT', 'restaurant', $3)`,
      [restaurant.id, payload.sub, JSON.stringify({ name: restaurant.name })]
    );

    return c.json(restaurant);
  }

  if (actionRef === "restaurants.listMine") {
    const payload = verifyToken(getCookie(c, "chopmboa_session"));
    if (!payload) return c.json([]);
    const result = await pool.query(
      `SELECT r.id, r.name, r.description, r.address, r.phone, r.is_active, r.created_at,
              r.logo_url, r.latitude, r.longitude, r.landmark,
              r.momo_active, r.momo_number, r.momo_name,
              r.om_active, r.om_number, r.om_name,
              r.cash_active, r.payment_instructions,
              (r.owner_id = $1::uuid) as is_owner
       FROM restaurants r
       WHERE (r.owner_id = $1::uuid OR r.id IN (
         SELECT restaurant_id FROM restaurant_staff WHERE user_id = $1::uuid AND deleted_at IS NULL
       )) AND r.deleted_at IS NULL
       ORDER BY r.created_at DESC`,
      [payload.sub]
    );
    return c.json(result.rows);
  }

  if (actionRef === "restaurants.get" || actionRef === "restaurants.getSettings") {
    const payload = verifyToken(getCookie(c, "chopmboa_session"));
    if (!payload) return c.json({ error: "Non autorisé" }, 401);
    const body = await c.req.json<{ restaurantId?: string; id?: string }>();
    const restaurantId = body.restaurantId || body.id;
    if (!restaurantId) return c.json({ error: "ID requis" }, 400);

    const result = await pool.query(
      `SELECT r.id, r.name, r.description, r.address, r.phone, r.is_active, r.created_at,
              r.logo_url, r.latitude, r.longitude, r.landmark,
              r.momo_active, r.momo_number, r.momo_name,
              r.om_active, r.om_number, r.om_name,
              r.cash_active, r.payment_instructions,
              (r.owner_id = $1::uuid) as is_owner
       FROM restaurants r
       WHERE r.id = $2::uuid AND r.deleted_at IS NULL`,
      [payload.sub, restaurantId]
    );
    if (result.rows.length === 0) return c.json({ error: "Restaurant non trouvé" }, 404);
    return c.json(result.rows[0]);
  }

  if (actionRef === "restaurants.update" || actionRef === "restaurants.updateSettings") {
    const payload = verifyToken(getCookie(c, "chopmboa_session"));
    if (!payload) return c.json({ error: "Non autorisé" }, 401);

    const body = await c.req.json<{
      restaurantId?: string;
      id?: string;
      name?: string;
      description?: string;
      address?: string;
      city?: string;
      phone?: string;
      logoUrl?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      landmark?: string | null;
      momoActive?: boolean;
      momoNumber?: string | null;
      momoName?: string | null;
      omActive?: boolean;
      omNumber?: string | null;
      omName?: string | null;
      cashActive?: boolean;
      paymentInstructions?: string | null;
    }>();

    const restaurantId = body.restaurantId || body.id;
    if (!restaurantId) return c.json({ error: "ID restaurant requis" }, 400);

    const permCheck = await pool.query(
      `SELECT r.id FROM restaurants r
       LEFT JOIN restaurant_staff rs ON rs.restaurant_id = r.id AND rs.user_id = $1::uuid AND rs.deleted_at IS NULL
       WHERE r.id = $2::uuid AND (r.owner_id = $1::uuid OR rs.role = 'manager')`,
      [payload.sub, restaurantId]
    );

    if (permCheck.rows.length === 0) {
      return c.json({ error: "Action réservée au propriétaire ou au gérant de cet établissement." }, 403);
    }

    const formattedAddress = body.city !== undefined && body.city !== null
      ? `${body.address?.trim() || ''} — ${body.city.trim()}`.replace(/^ — /, '')
      : (body.address !== undefined ? body.address?.trim() || null : null);

    const result = await pool.query(
      `UPDATE restaurants
       SET name = COALESCE($1, name),
           description = CASE WHEN $2::boolean THEN $3 ELSE description END,
           address = CASE WHEN $4::boolean THEN $5 ELSE address END,
           phone = CASE WHEN $6::boolean THEN $7 ELSE phone END,
           logo_url = CASE WHEN $8::boolean THEN $9 ELSE logo_url END,
           latitude = CASE WHEN $10::boolean THEN $11::double precision ELSE latitude END,
           longitude = CASE WHEN $12::boolean THEN $13::double precision ELSE longitude END,
           landmark = CASE WHEN $14::boolean THEN $15 ELSE landmark END,
           momo_active = CASE WHEN $16::boolean THEN $17::boolean ELSE momo_active END,
           momo_number = CASE WHEN $18::boolean THEN $19 ELSE momo_number END,
           momo_name = CASE WHEN $20::boolean THEN $21 ELSE momo_name END,
           om_active = CASE WHEN $22::boolean THEN $23::boolean ELSE om_active END,
           om_number = CASE WHEN $24::boolean THEN $25 ELSE om_number END,
           om_name = CASE WHEN $26::boolean THEN $27 ELSE om_name END,
           cash_active = CASE WHEN $28::boolean THEN $29::boolean ELSE cash_active END,
           payment_instructions = CASE WHEN $30::boolean THEN $31 ELSE payment_instructions END,
           updated_at = NOW()
       WHERE id = $32::uuid
       RETURNING id, name, description, address, phone, is_active, created_at, logo_url, latitude, longitude, landmark,
                 momo_active, momo_number, momo_name, om_active, om_number, om_name, cash_active, payment_instructions`,
      [
        body.name?.trim() || null,
        body.description !== undefined, body.description?.trim() || null,
        body.address !== undefined || body.city !== undefined, formattedAddress,
        body.phone !== undefined, body.phone?.trim() || null,
        body.logoUrl !== undefined, body.logoUrl?.trim() || null,
        body.latitude !== undefined, body.latitude != null && !isNaN(Number(body.latitude)) ? Number(body.latitude) : null,
        body.longitude !== undefined, body.longitude != null && !isNaN(Number(body.longitude)) ? Number(body.longitude) : null,
        body.landmark !== undefined, body.landmark?.trim() || null,
        body.momoActive !== undefined, !!body.momoActive,
        body.momoNumber !== undefined, body.momoNumber?.trim() || null,
        body.momoName !== undefined, body.momoName?.trim() || null,
        body.omActive !== undefined, !!body.omActive,
        body.omNumber !== undefined, body.omNumber?.trim() || null,
        body.omName !== undefined, body.omName?.trim() || null,
        body.cashActive !== undefined, !!body.cashActive,
        body.paymentInstructions !== undefined, body.paymentInstructions?.trim() || null,
        restaurantId
      ]
    );

    await pool.query(
      `INSERT INTO audit_logs (restaurant_id, user_id, action, target_entity, metadata)
       VALUES ($1::uuid, $2::uuid, 'UPDATE_RESTAURANT_SETTINGS', 'restaurant', $3)`,
      [restaurantId, payload.sub, JSON.stringify({ name: body.name, landmark: body.landmark, hasLogo: !!body.logoUrl })]
    );

    return c.json(result.rows[0]);
  }

  if (actionRef === "reports.ownerComparison" || actionRef === "restaurants.ownerComparison") {
    const payload = verifyToken(getCookie(c, "chopmboa_session"));
    if (!payload) return c.json({ error: "Non autorisé" }, 401);

    const userRes = await pool.query(
      `SELECT id, full_name, email, global_role FROM users WHERE id = $1::uuid`,
      [payload.sub]
    );
    const user = userRes.rows[0];
    if (!user || user.global_role !== 'owner') {
      return c.json({ error: "Accès réservé au propriétaire. Les gérants ne peuvent pas accéder au rapport comparatif." }, 403);
    }

    const restRes = await pool.query(
      `SELECT id, name, description, address, phone, is_active, created_at
       FROM restaurants
       WHERE owner_id = $1::uuid AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [payload.sub]
    );
    const restaurants = restRes.rows;

    if (restaurants.length === 0) {
      return c.json({
        summary: {
          totalRestaurants: 0,
          totalRevenueAllTime: 0,
          totalRevenueToday: 0,
          totalOrdersAllTime: 0,
          totalOrdersToday: 0,
          overallAvgTicket: 0,
          totalTables: 0,
          totalTablesOccupied: 0,
          overallOccupancyRate: 0,
          totalStaff: 0,
          totalMenuItems: 0,
        },
        highlights: {
          topByRevenue: null,
          topByOrders: null,
          topByAvgTicket: null,
          topByOccupancy: null,
        },
        restaurants: [],
        chartData: [],
      });
    }

    const restaurantIds = restaurants.map((r: { id: string }) => r.id);

    // Queries for all restaurants owned
    const ordersRes = await pool.query(
      `SELECT id, restaurant_id, status, total_fcfa, created_at, order_type, payment_method, payment_status
       FROM orders
       WHERE restaurant_id = ANY($1::uuid[])`,
      [restaurantIds]
    );

    const tablesRes = await pool.query(
      `SELECT id, restaurant_id, status, capacity
       FROM restaurant_tables
       WHERE restaurant_id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [restaurantIds]
    );

    const menuRes = await pool.query(
      `SELECT id, restaurant_id, is_available
       FROM menu_items
       WHERE restaurant_id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [restaurantIds]
    );

    const staffRes = await pool.query(
      `SELECT rs.id, rs.restaurant_id, rs.role
       FROM restaurant_staff rs
       WHERE rs.restaurant_id = ANY($1::uuid[]) AND rs.deleted_at IS NULL`,
      [restaurantIds]
    );

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    let globalRevenueAllTime = 0;
    let globalRevenueToday = 0;
    let globalOrdersAllTime = 0;
    let globalOrdersToday = 0;
    let globalActiveOrders = 0;
    const globalTables = tablesRes.rows.length;
    const globalTablesOccupied = tablesRes.rows.filter((t: { status: string }) => t.status === "occupied").length;
    const globalStaff = staffRes.rows.length;
    const globalMenuItems = menuRes.rows.length;

    const comparisonList = restaurants.map((rest: { id: string; name: string; address: string | null; phone: string | null; is_active: boolean; created_at: string; description: string | null }) => {
      const restOrders = ordersRes.rows.filter((o: { restaurant_id: string }) => o.restaurant_id === rest.id);
      const restTables = tablesRes.rows.filter((t: { restaurant_id: string }) => t.restaurant_id === rest.id);
      const restMenu = menuRes.rows.filter((m: { restaurant_id: string }) => m.restaurant_id === rest.id);
      const restStaff = staffRes.rows.filter((s: { restaurant_id: string }) => s.restaurant_id === rest.id);

      let revenueAllTime = 0;
      let revenueToday = 0;
      let revenue7d = 0;
      let revenue30d = 0;
      let ordersToday = 0;
      let activeOrders = 0;

      restOrders.forEach((o: { created_at: string | Date; total_fcfa: number; status: string }) => {
        const oDate = new Date(o.created_at);
        const oDateStr = oDate.toISOString().split("T")[0];
        const val = Number(o.total_fcfa || 0);

        if (o.status !== "cancelled") {
          revenueAllTime += val;
          if (oDateStr === todayStr) {
            revenueToday += val;
            ordersToday++;
          }
          if (oDate >= sevenDaysAgo) revenue7d += val;
          if (oDate >= thirtyDaysAgo) revenue30d += val;
        }

        if (["pending", "confirmed", "in_kitchen", "ready", "out_for_delivery"].includes(o.status)) {
          activeOrders++;
        }
      });

      const totalOrders = restOrders.filter((o: { status: string }) => o.status !== "cancelled").length;
      const avgTicket = totalOrders > 0 ? Math.round(revenueAllTime / totalOrders) : 0;
      const avgTicketToday = ordersToday > 0 ? Math.round(revenueToday / ordersToday) : 0;

      const totalTables = restTables.length;
      const occupiedTables = restTables.filter((t: { status: string }) => t.status === "occupied").length;
      const occupancyRate = totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0;

      globalRevenueAllTime += revenueAllTime;
      globalRevenueToday += revenueToday;
      globalOrdersAllTime += totalOrders;
      globalOrdersToday += ordersToday;
      globalActiveOrders += activeOrders;

      return {
        id: rest.id,
        name: rest.name,
        address: rest.address,
        phone: rest.phone,
        description: rest.description,
        isActive: rest.is_active,
        createdAt: rest.created_at,
        revenueAllTime,
        revenueToday,
        revenue7d,
        revenue30d,
        totalOrders,
        ordersToday,
        activeOrders,
        avgTicket,
        avgTicketToday,
        totalTables,
        occupiedTables,
        occupancyRate,
        menuItemsCount: restMenu.length,
        menuAvailableCount: restMenu.filter((m: { is_available: boolean }) => m.is_available).length,
        staffCount: restStaff.length,
        staffBreakdown: {
          manager: restStaff.filter((s: { role: string }) => s.role === "manager").length,
          kitchen: restStaff.filter((s: { role: string }) => s.role === "kitchen").length,
          cashier: restStaff.filter((s: { role: string }) => s.role === "cashier").length,
          waiter: restStaff.filter((s: { role: string }) => s.role === "waiter").length,
          delivery: restStaff.filter((s: { role: string }) => s.role === "delivery").length,
        },
      };
    });

    const enrichedList = comparisonList.map((c: any) => ({
      ...c,
      revenueSharePercent: globalRevenueAllTime > 0 ? Math.round((c.revenueAllTime / globalRevenueAllTime) * 100) : 0,
    }));

    // Daily comparison series for last 7 days
    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateKey = d.toISOString().split("T")[0];
      const dayLabel = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
      const entry: Record<string, any> = { date: dateKey, label: dayLabel };

      restaurants.forEach((r: { id: string; name: string }) => {
        const dayRev = ordersRes.rows
          .filter((o: { restaurant_id: string; status: string; created_at: string | Date; total_fcfa: number }) => {
            const oDate = new Date(o.created_at).toISOString().split("T")[0];
            return o.restaurant_id === r.id && o.status !== "cancelled" && oDate === dateKey;
          })
          .reduce((sum: number, o: { total_fcfa: number }) => sum + Number(o.total_fcfa || 0), 0);
        entry[r.name] = dayRev;
      });
      chartData.push(entry);
    }

    const overallAvgTicket = globalOrdersAllTime > 0 ? Math.round(globalRevenueAllTime / globalOrdersAllTime) : 0;
    const overallOccupancyRate = globalTables > 0 ? Math.round((globalTablesOccupied / globalTables) * 100) : 0;

    const topByRevenue = [...enrichedList].sort((a, b) => b.revenueAllTime - a.revenueAllTime)[0] || null;
    const topByOrders = [...enrichedList].sort((a, b) => b.totalOrders - a.totalOrders)[0] || null;
    const topByAvgTicket = [...enrichedList].sort((a, b) => b.avgTicket - a.avgTicket)[0] || null;
    const topByOccupancy = [...enrichedList].sort((a, b) => b.occupancyRate - a.occupancyRate)[0] || null;

    return c.json({
      summary: {
        totalRestaurants: restaurants.length,
        totalRevenueAllTime: globalRevenueAllTime,
        totalRevenueToday: globalRevenueToday,
        totalOrdersAllTime: globalOrdersAllTime,
        totalOrdersToday: globalOrdersToday,
        totalActiveOrders: globalActiveOrders,
        overallAvgTicket,
        totalTables: globalTables,
        totalTablesOccupied: globalTablesOccupied,
        overallOccupancyRate,
        totalStaff: globalStaff,
        totalMenuItems: globalMenuItems,
      },
      highlights: {
        topByRevenue,
        topByOrders,
        topByAvgTicket,
        topByOccupancy,
      },
      restaurants: enrichedList,
      chartData,
    });
  }

  if (actionRef === "restaurants.listMembers") {
    const body = await c.req.json<{ restaurantId?: string }>();
    if (!body.restaurantId) return c.json([]);
    const result = await pool.query(
      `SELECT 
         'owner-' || r.owner_id as id,
         'owner' as role,
         u.full_name,
         u.email,
         true as is_owner
       FROM restaurants r
       JOIN users u ON r.owner_id = u.id
       WHERE r.id = $1::uuid
       UNION ALL
       SELECT 
         rs.id::text as id,
         rs.role::text as role,
         u.full_name,
         u.email,
         false as is_owner
       FROM restaurant_staff rs
       JOIN users u ON rs.user_id = u.id
       JOIN restaurants r ON rs.restaurant_id = r.id
       WHERE rs.restaurant_id = $1::uuid AND rs.deleted_at IS NULL AND rs.user_id != r.owner_id`,
      [body.restaurantId]
    );
    return c.json(result.rows);
  }

  if (actionRef === "restaurants.kpis") {
    const body = await c.req.json<{ restaurantId?: string }>();
    if (!body.restaurantId) return c.json({
      revenueTodayFcfa: 0,
      ordersToday: 0,
      avgTicketFcfa: 0,
      activeOrders: 0,
      menuCount: 0,
      tableCount: 0,
      occupiedTables: 0,
      revenueSeries: []
    });

    const resId = body.restaurantId;

    const ordersRes = await pool.query(
      `SELECT status, total_fcfa, created_at, payment_method, order_type FROM orders WHERE restaurant_id = $1::uuid`,
      [resId]
    );

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    let revenueTodayFcfa = 0;
    let ordersToday = 0;
    let activeOrders = 0;

    let cashCount = 0;
    let momoCount = 0;
    let cashVolume = 0;
    let momoVolume = 0;

    let dineInCount = 0;
    let deliveryCount = 0;
    let takeoutCount = 0;

    // Last 7 days dynamic series
    const last7Days: { dateStr: string; label: string; totalFcfa: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const label = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      last7Days.push({ dateStr, label, totalFcfa: 0 });
    }

    ordersRes.rows.forEach(o => {
      const dateStr = new Date(o.created_at).toISOString().split("T")[0];
      const isToday = dateStr === todayStr;

      // Add to last 7 days chart data (exclude cancelled orders)
      if (o.status !== 'cancelled') {
        const dayMatch = last7Days.find(d => d.dateStr === dateStr);
        if (dayMatch) {
          dayMatch.totalFcfa += Number(o.total_fcfa || 0);
        }
      }

      if (isToday && o.status !== 'cancelled') {
        revenueTodayFcfa += Number(o.total_fcfa || 0);
        ordersToday++;

        // Payment method stats
        if (o.payment_method === 'cash') {
          cashCount++;
          cashVolume += Number(o.total_fcfa || 0);
        } else {
          momoCount++;
          momoVolume += Number(o.total_fcfa || 0);
        }

        // Order type stats
        if (o.order_type === 'dine_in') {
          dineInCount++;
        } else if (o.order_type === 'delivery') {
          deliveryCount++;
        } else {
          takeoutCount++;
        }
      }

      if (['pending', 'confirmed', 'in_kitchen', 'ready', 'out_for_delivery'].includes(o.status)) {
        activeOrders++;
      }
    });

    const revenueSeries = last7Days.map(d => ({
      day: d.label,
      totalFcfa: d.totalFcfa
    }));

    const avgTicketFcfa = ordersToday > 0 ? Math.round(revenueTodayFcfa / ordersToday) : 0;

    const menuCountRes = await pool.query(
      `SELECT COUNT(*)::int as count FROM menu_items WHERE restaurant_id = $1::uuid AND deleted_at IS NULL`,
      [resId]
    );
    const tableCountRes = await pool.query(
      `SELECT COUNT(*)::int as count, COUNT(*) FILTER (WHERE status = 'occupied')::int as occupied FROM restaurant_tables WHERE restaurant_id = $1::uuid AND deleted_at IS NULL`,
      [resId]
    );

    const topItemsRes = await pool.query(
      `SELECT mi.name, SUM(oi.quantity)::int as quantity_sold, SUM(oi.subtotal_fcfa)::int as total_revenue
       FROM order_items oi
       JOIN menu_items mi ON oi.menu_item_id = mi.id
       JOIN orders o ON oi.order_id = o.id
       WHERE o.restaurant_id = $1::uuid AND o.status != 'cancelled'
       GROUP BY mi.id, mi.name
       ORDER BY quantity_sold DESC
       LIMIT 5`,
      [resId]
    );

    return c.json({
      revenueTodayFcfa,
      ordersToday,
      avgTicketFcfa,
      activeOrders,
      menuCount: menuCountRes.rows[0]?.count || 0,
      tableCount: tableCountRes.rows[0]?.count || 0,
      occupiedTables: tableCountRes.rows[0]?.occupied || 0,
      revenueSeries,
      paymentMethodBreakdown: {
        cash: cashCount,
        momo: momoCount,
        cashVolume,
        momoVolume
      },
      orderTypeBreakdown: {
        dine_in: dineInCount,
        delivery: deliveryCount,
        takeout: takeoutCount
      },
      topItems: topItemsRes.rows
    });
  }

  if (actionRef === "menu.listCategories") {
    const body = await c.req.json<{ restaurantId?: string }>();
    if (!body.restaurantId) return c.json([]);
    const result = await pool.query(
      `SELECT id, name, display_order FROM menu_categories WHERE restaurant_id = $1::uuid AND deleted_at IS NULL ORDER BY display_order ASC, name ASC`,
      [body.restaurantId]
    );
    return c.json(result.rows);
  }

  if (actionRef === "menu.createCategory") {
    const body = await c.req.json<{ restaurantId?: string; name?: string; displayOrder?: number }>();
    if (!body.restaurantId || !body.name?.trim()) return c.json({ error: "Champs invalides" }, 400);
    const result = await pool.query(
      `INSERT INTO menu_categories (restaurant_id, name, display_order)
       VALUES ($1::uuid, $2, $3)
       RETURNING id, name, display_order`,
      [body.restaurantId, body.name.trim(), body.displayOrder || 0]
    );
    return c.json(result.rows[0]);
  }

  if (actionRef === "menu.listItems") {
    const body = await c.req.json<{ restaurantId?: string }>();
    if (!body.restaurantId) return c.json([]);
    const result = await pool.query(
      `SELECT id, category_id, name, description, price_fcfa, is_available, image_url FROM menu_items WHERE restaurant_id = $1::uuid AND deleted_at IS NULL ORDER BY name ASC`,
      [body.restaurantId]
    );
    return c.json(result.rows);
  }

  if (actionRef === "menu.createItem") {
    const body = await c.req.json<{
      restaurantId?: string;
      categoryId?: string;
      name?: string;
      description?: string;
      priceFcfa?: number;
      imageUrl?: string;
    }>();
    if (!body.restaurantId || !body.name?.trim()) return c.json({ error: "Nom requis" }, 400);
    const result = await pool.query(
      `INSERT INTO menu_items (restaurant_id, category_id, name, description, price_fcfa, image_url)
       VALUES ($1::uuid, $2, $3, $4, $5, $6)
       RETURNING id, category_id, name, description, price_fcfa, is_available, image_url`,
      [body.restaurantId, body.categoryId || null, body.name.trim(), body.description?.trim() || null, body.priceFcfa || 0, body.imageUrl?.trim() || null]
    );
    return c.json(result.rows[0]);
  }

  if (actionRef === "menu.updateItem") {
    const body = await c.req.json<{
      itemId?: string;
      id?: string;
      name?: string;
      description?: string;
      priceFcfa?: number;
      categoryId?: string;
      isAvailable?: boolean;
      imageUrl?: string | null;
    }>();
    const id = body.itemId || body.id;
    if (!id) return c.json({ error: "ID requis" }, 400);
    const result = await pool.query(
      `UPDATE menu_items
       SET name = COALESCE($1, name),
           description = CASE WHEN $2::boolean THEN $3 ELSE description END,
           price_fcfa = COALESCE($4, price_fcfa),
           category_id = CASE WHEN $5::boolean THEN $6 ELSE category_id END,
           is_available = COALESCE($7, is_available),
           image_url = CASE WHEN $8::boolean THEN $9 ELSE image_url END,
           updated_at = NOW()
       WHERE id = $10::uuid
       RETURNING id, category_id, name, description, price_fcfa, is_available, image_url`,
      [
        body.name?.trim() || null,
        body.description !== undefined, body.description?.trim() || null,
        body.priceFcfa ?? null,
        body.categoryId !== undefined, body.categoryId || null,
        body.isAvailable ?? null,
        body.imageUrl !== undefined, body.imageUrl?.trim() || null,
        id
      ]
    );
    return c.json(result.rows[0] || {});
  }

  if (actionRef === "menu.deleteItem") {
    const body = await c.req.json<{ itemId?: string; id?: string }>();
    const id = body.itemId || body.id;
    if (id) {
      await pool.query(`UPDATE menu_items SET deleted_at = NOW() WHERE id = $1::uuid`, [id]);
    }
    return c.json({ ok: true });
  }

  if (actionRef === "tables.list") {
    const body = await c.req.json<{ restaurantId?: string }>();
    if (!body.restaurantId) return c.json([]);
    const result = await pool.query(
      `SELECT id, table_number, qr_code_token, capacity, status FROM restaurant_tables WHERE restaurant_id = $1::uuid AND deleted_at IS NULL ORDER BY table_number ASC`,
      [body.restaurantId]
    );
    return c.json(result.rows);
  }

  if (actionRef === "tables.create") {
    const body = await c.req.json<{ restaurantId?: string; tableNumber?: string; capacity?: number }>();
    if (!body.restaurantId || !body.tableNumber?.trim()) return c.json({ error: "Numéro de table requis" }, 400);
    const result = await pool.query(
      `INSERT INTO restaurant_tables (restaurant_id, table_number, capacity)
       VALUES ($1::uuid, $2, $3)
       RETURNING id, table_number, qr_code_token, capacity, status`,
      [body.restaurantId, body.tableNumber.trim(), body.capacity || 4]
    );
    return c.json(result.rows[0]);
  }

  if (actionRef === "tables.cycleStatus") {
    return c.json({ error: "La modification manuelle de l'état des tables est désactivée. L'état change de 'libre' à 'occupé' lors d'une commande QR code, et revient à 'libre' après paiement." }, 400);
  }

  if (actionRef === "tables.remove") {
    const body = await c.req.json<{ tableId?: string }>();
    if (body.tableId) {
      await pool.query(`UPDATE restaurant_tables SET deleted_at = NOW() WHERE id = $1::uuid`, [body.tableId]);
    }
    return c.json({ ok: true });
  }

  if (actionRef === "tables.usage") {
    const body = await c.req.json<{ restaurantId?: string }>();
    if (!body.restaurantId) return c.json({ count: 0, max: -1, canAdd: true });
    const countRes = await pool.query(
      `SELECT COUNT(*)::int as count FROM restaurant_tables WHERE restaurant_id = $1::uuid AND deleted_at IS NULL`,
      [body.restaurantId]
    );
    const count = countRes.rows[0]?.count || 0;
    return c.json({ count, max: -1, canAdd: true });
  }

  if (actionRef === "tables.resolveByToken") {
    const body = await c.req.json<{ token?: string }>();
    if (!body.token) return c.json(null);
    const result = await pool.query(
      `SELECT t.id as table_id, t.table_number, r.id as restaurant_id, r.name as restaurant_name,
              t.id as "tableId", t.table_number as "tableNumber",
              r.id as "restaurantId", r.name as "restaurantName",
              r.description as "restaurantDescription", r.address as "restaurantAddress",
              r.phone as "restaurantPhone", r.logo_url as "logoUrl", r.logo_url,
              r.latitude as "latitude", r.longitude as "longitude",
              r.landmark as "landmark",
              r.momo_active as "momoActive", r.momo_number as "momoNumber", r.momo_name as "momoName",
              r.om_active as "omActive", r.om_number as "omNumber", r.om_name as "omName",
              r.cash_active as "cashActive", r.payment_instructions as "paymentInstructions"
       FROM restaurant_tables t
       JOIN restaurants r ON t.restaurant_id = r.id
       WHERE t.qr_code_token = $1::uuid AND t.deleted_at IS NULL AND r.deleted_at IS NULL`,
      [body.token]
    );
    return c.json(result.rows[0] || null);
  }

  if (actionRef === "orders.listRecent") {
    const body = await c.req.json<{ restaurantId?: string; limit?: number }>();
    if (!body.restaurantId) return c.json([]);
    const limit = body.limit || 50;
    const result = await pool.query(
      `SELECT id, order_type, status, subtotal_fcfa, total_fcfa, payment_method, payment_status, customer_name, created_at,
              'CMD-' || UPPER(SUBSTRING(id::text, 1, 4)) AS order_number
       FROM orders
       WHERE restaurant_id = $1::uuid
       ORDER BY created_at DESC
       LIMIT $2`,
      [body.restaurantId, limit]
    );
    return c.json(result.rows);
  }

  if (actionRef === "orders.activeWithItems") {
    const body = await c.req.json<{ restaurantId?: string; limit?: number }>();
    if (!body.restaurantId) return c.json([]);
    const limit = body.limit || 50;
    const result = await pool.query(
      `SELECT 
        o.id, 
        'CMD-' || UPPER(SUBSTRING(o.id::text, 1, 4)) AS order_number,
        o.order_type, 
        o.status, 
        o.subtotal_fcfa, 
        o.total_fcfa, 
        o.payment_method, 
        o.payment_status, 
        o.customer_name, 
        o.delivery_address,
        o.created_at,
        o.table_id,
        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.id,
              'quantity', oi.quantity,
              'item_name', mi.name,
              'menu_item_id', oi.menu_item_id,
              'price_fcfa', mi.price_fcfa,
              'notes', NULL
            )
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'::json
        ) AS items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
       WHERE o.restaurant_id = $1::uuid
       GROUP BY 
        o.id, 
        o.order_type, 
        o.status, 
        o.subtotal_fcfa, 
        o.total_fcfa, 
        o.payment_method, 
        o.payment_status, 
        o.customer_name, 
        o.delivery_address,
        o.created_at,
        o.table_id
       ORDER BY o.created_at DESC
       LIMIT $2`,
      [body.restaurantId, limit]
    );
    return c.json(result.rows);
  }

  if (actionRef === "orders.create" || actionRef === "orders.createByQr") {
    const body = await c.req.json<{
      restaurantId?: string;
      orderType?: string;
      tableId?: string;
      tableToken?: string;
      items?: { menuItemId: string; quantity: number; unitPriceFcfa?: number }[];
      customerName?: string;
      customerPhone?: string;
      paymentMethod?: string;
    }>();

    let restaurantId = body.restaurantId;
    let tableId = body.tableId;

    // Resolve tableToken if ordering from QR code
    if (actionRef === "orders.createByQr" || body.tableToken) {
      const tokenToResolve = body.tableToken || body.tableId;
      if (!tokenToResolve) {
        return c.json({ error: "Token de table manquant" }, 400);
      }
      
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tokenToResolve);
      if (!isUuid) {
        return c.json({ error: "Token de table invalide" }, 400);
      }

      const tableRes = await pool.query(
        `SELECT id, restaurant_id FROM restaurant_tables WHERE qr_code_token = $1::uuid AND deleted_at IS NULL`,
        [tokenToResolve]
      );
      if (tableRes.rows.length === 0) {
        return c.json({ error: "Table ou QR code introuvable" }, 404);
      }
      tableId = tableRes.rows[0].id;
      restaurantId = tableRes.rows[0].restaurant_id;
    }

    if (!restaurantId) return c.json({ error: "Restaurant requis" }, 400);

    const items = body.items || [];
    if (items.length === 0) {
      return c.json({ error: "La commande doit contenir au moins un article." }, 400);
    }

    // Resolve prices from DB to ensure accuracy and prevent price tampering
    const itemIds = items.map(i => i.menuItemId);
    const dbItemsRes = await pool.query(
      `SELECT id, price_fcfa FROM menu_items WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [itemIds]
    );
    const dbItemsMap = new Map<string, number>();
    dbItemsRes.rows.forEach(row => {
      dbItemsMap.set(row.id, Number(row.price_fcfa));
    });

    let total = 0;
    const resolvedItems = items.map(i => {
      const price = dbItemsMap.get(i.menuItemId) || Number(i.unitPriceFcfa) || 0;
      total += (i.quantity * price);
      return {
        menuItemId: i.menuItemId,
        quantity: i.quantity,
        unitPriceFcfa: price
      };
    });

    const orderRes = await pool.query(
      `INSERT INTO orders (restaurant_id, order_type, table_id, customer_name, subtotal_fcfa, total_fcfa, payment_method, status)
       VALUES ($1::uuid, $2::order_type, $3, $4, $5, $5, $6::payment_method, 'pending')
       RETURNING id, order_type, status, total_fcfa, payment_method, payment_status, customer_name, created_at,
                 'CMD-' || UPPER(SUBSTRING(id::text, 1, 4)) AS order_number`,
      [
        restaurantId,
        body.orderType || (tableId ? 'dine_in' : 'delivery'),
        tableId || null,
        body.customerName?.trim() || 'Client',
        total,
        body.paymentMethod || 'cash'
      ]
    );

    const order = orderRes.rows[0];

    if (tableId && (actionRef === "orders.createByQr" || body.tableToken)) {
      await pool.query(
        `UPDATE restaurant_tables SET status = 'occupied' WHERE id = $1::uuid`,
        [tableId]
      );
    }

    for (const item of resolvedItems) {
      await pool.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_fcfa, subtotal_fcfa)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5)`,
        [order.id, item.menuItemId, item.quantity, item.unitPriceFcfa, item.quantity * item.unitPriceFcfa]
      );
    }

    return c.json(order);
  }

  if (actionRef === "orders.setStatus") {
    const body = await c.req.json<{ orderId?: string; status?: string }>();
    if (!body.orderId || !body.status) return c.json({ error: "Paramètres manquants" }, 400);
    const result = await pool.query(
      `UPDATE orders SET status = $1::order_status, updated_at = NOW() WHERE id = $2::uuid RETURNING id, status`,
      [body.status, body.orderId]
    );
    return c.json(result.rows[0]);
  }

  if (actionRef === "orders.markPaid") {
    const body = await c.req.json<{ orderId?: string }>();
    if (!body.orderId) return c.json({ error: "ID requis" }, 400);

    const orderInfo = await pool.query(
      `SELECT table_id FROM orders WHERE id = $1::uuid`,
      [body.orderId]
    );
    const tableId = orderInfo.rows[0]?.table_id;

    const result = await pool.query(
      `UPDATE orders SET payment_status = 'paid', updated_at = NOW() WHERE id = $1::uuid RETURNING id, payment_status`,
      [body.orderId]
    );

    if (tableId) {
      await pool.query(
        `UPDATE restaurant_tables SET status = 'free' WHERE id = $1::uuid`,
        [tableId]
      );
    }

    return c.json(result.rows[0]);
  }

  if (actionRef === "orders.get") {
    const body = await c.req.json<{ orderId?: string }>();
    if (!body.orderId) return c.json({ error: "ID requis" }, 400);
    const result = await pool.query(
      `SELECT id, order_type, status, subtotal_fcfa, total_fcfa, payment_method, payment_status, customer_name, created_at,
              'CMD-' || UPPER(SUBSTRING(id::text, 1, 4)) AS order_number
       FROM orders
       WHERE id = $1::uuid`,
      [body.orderId]
    );
    if (result.rows.length === 0) {
      return c.json({ error: "Commande introuvable" }, 404);
    }
    return c.json(result.rows[0]);
  }

  if (actionRef === "audit.listByRestaurant") {
    const body = await c.req.json<{ restaurantId?: string }>();
    if (!body.restaurantId) return c.json([]);
    const result = await pool.query(
      `SELECT id, action, metadata, created_at FROM audit_logs WHERE restaurant_id = $1::uuid ORDER BY created_at DESC LIMIT 50`,
      [body.restaurantId]
    );
    return c.json(result.rows);
  }

  if (actionRef === "demoSeed.seedForCurrentUser") {
    const payload = verifyToken(getCookie(c, "chopmboa_session"));
    if (!payload) return c.json({ error: "Non autorisé" }, 401);

    const userRes = await pool.query(
      `SELECT global_role FROM users WHERE id = $1::uuid`,
      [payload.sub]
    );
    const user = userRes.rows[0];
    if (!user || user.global_role !== 'owner') {
      return c.json({ error: "Seul le propriétaire peut charger les données de démonstration." }, 403);
    }

    // 1. Restaurant 1: Chez Maman — Grillades & Spécialités (Yaoundé)
    const r1 = await pool.query(
      `INSERT INTO restaurants (owner_id, name, description, address, phone)
       VALUES ($1::uuid, 'Chez Maman — Grillades & Spécialités', 'Cuisine authentique camerounaise, Ndolé, Poulet DG, Poisson braisé.', 'Avenue Kennedy — Yaoundé', '+237 690 00 00 01')
       RETURNING id`,
      [payload.sub]
    );
    const r1Id = r1.rows[0].id;

    const r1Cat1 = await pool.query(`INSERT INTO menu_categories (restaurant_id, name, display_order) VALUES ($1::uuid, 'Plats Chauds', 1) RETURNING id`, [r1Id]);
    const r1Cat2 = await pool.query(`INSERT INTO menu_categories (restaurant_id, name, display_order) VALUES ($1::uuid, 'Boissons & Jus', 2) RETURNING id`, [r1Id]);

    const m1_1 = await pool.query(
      `INSERT INTO menu_items (restaurant_id, category_id, name, description, price_fcfa)
       VALUES ($1::uuid, $2::uuid, 'Poulet DG Royal', 'Poulet mijoté aux plantains mûrs, carottes et poivrons', 4500) RETURNING id`,
      [r1Id, r1Cat1.rows[0].id]
    );
    const m1_2 = await pool.query(
      `INSERT INTO menu_items (restaurant_id, category_id, name, description, price_fcfa)
       VALUES ($1::uuid, $2::uuid, 'Ndolé Viande & Crevettes', 'Feuilles de ndolé, gousses d arachides, crevettes fraîches et bœuf', 4000) RETURNING id`,
      [r1Id, r1Cat1.rows[0].id]
    );
    const m1_3 = await pool.query(
      `INSERT INTO menu_items (restaurant_id, category_id, name, description, price_fcfa)
       VALUES ($1::uuid, $2::uuid, 'Jus de Foléré Maison', 'Fleurs d hibiscus fraîches et menthe douce', 1000) RETURNING id`,
      [r1Id, r1Cat2.rows[0].id]
    );

    for (let i = 1; i <= 6; i++) {
      const status = i <= 2 ? 'occupied' : 'free';
      await pool.query(
        `INSERT INTO restaurant_tables (restaurant_id, table_number, capacity, status) VALUES ($1::uuid, $2, $3, $4)`,
        [r1Id, `Table ${i}`, 4, status]
      );
    }

    // Orders for R1
    await pool.query(
      `INSERT INTO orders (restaurant_id, order_type, customer_name, subtotal_fcfa, total_fcfa, payment_method, status, payment_status, created_at)
       VALUES 
       ($1::uuid, 'dine_in', 'Serge M.', 9500, 9500, 'om', 'completed', 'paid', NOW()),
       ($1::uuid, 'dine_in', 'Carine N.', 5500, 5500, 'cash', 'in_kitchen', 'pending', NOW()),
       ($1::uuid, 'takeout', 'Marc E.', 9000, 9000, 'momo', 'ready', 'paid', NOW()),
       ($1::uuid, 'dine_in', 'Dr. Kamga', 14500, 14500, 'cash', 'completed', 'paid', NOW() - INTERVAL '1 day'),
       ($1::uuid, 'delivery', 'Cabinet Audit', 28000, 28000, 'om', 'completed', 'paid', NOW() - INTERVAL '2 days')`,
      [r1Id]
    );

    // 2. Restaurant 2: Grill House Douala — Lounge & Bar (Douala)
    const r2 = await pool.query(
      `INSERT INTO restaurants (owner_id, name, description, address, phone)
       VALUES ($1::uuid, 'Grill House Bonanjo — Lounge & Bar', 'Poissons braisés géants de Kribi, brochettes, cocktails tropicaux.', 'Rue Prince Bell — Douala', '+237 670 00 00 02')
       RETURNING id`,
      [payload.sub]
    );
    const r2Id = r2.rows[0].id;

    const r2Cat1 = await pool.query(`INSERT INTO menu_categories (restaurant_id, name, display_order) VALUES ($1::uuid, 'Grillades de Mer', 1) RETURNING id`, [r2Id]);
    const r2Cat2 = await pool.query(`INSERT INTO menu_categories (restaurant_id, name, display_order) VALUES ($1::uuid, 'Cocktails & Vins', 2) RETURNING id`, [r2Id]);

    await pool.query(
      `INSERT INTO menu_items (restaurant_id, category_id, name, description, price_fcfa)
       VALUES 
       ($1::uuid, $2::uuid, 'Bar Braisé Entier (1kg)', 'Bar frais mariné aux épices du Noun avec bâtons de manioc', 7500),
       ($1::uuid, $2::uuid, 'Gambas Grillées Pimentées', 'Gambas géantes sautées à l ail et gingembre', 9500),
       ($1::uuid, $3::uuid, 'Cocktail Mangue Passion', 'Rhum blanc, nectar de mangue sauvage et fruit de la passion', 3500)`,
      [r2Id, r2Cat1.rows[0].id, r2Cat2.rows[0].id]
    );

    for (let i = 1; i <= 8; i++) {
      const status = i <= 4 ? 'occupied' : 'free';
      await pool.query(
        `INSERT INTO restaurant_tables (restaurant_id, table_number, capacity, status) VALUES ($1::uuid, $2, $3, $4)`,
        [r2Id, `Salon ${i}`, 6, status]
      );
    }

    // Orders for R2 (Higher ticket)
    await pool.query(
      `INSERT INTO orders (restaurant_id, order_type, customer_name, subtotal_fcfa, total_fcfa, payment_method, status, payment_status, created_at)
       VALUES 
       ($1::uuid, 'dine_in', 'DG Total', 34500, 34500, 'om', 'completed', 'paid', NOW()),
       ($1::uuid, 'dine_in', 'Groupe SNH', 52000, 52000, 'momo', 'completed', 'paid', NOW()),
       ($1::uuid, 'dine_in', 'Famille Ebelle', 21500, 21500, 'cash', 'in_kitchen', 'pending', NOW()),
       ($1::uuid, 'dine_in', 'Table VIP 2', 45000, 45000, 'om', 'completed', 'paid', NOW() - INTERVAL '1 day'),
       ($1::uuid, 'delivery', 'Résidence Akwa', 19000, 19000, 'momo', 'completed', 'paid', NOW() - INTERVAL '2 days'),
       ($1::uuid, 'dine_in', 'Soirée Jazz', 67000, 67000, 'om', 'completed', 'paid', NOW() - INTERVAL '3 days')`,
      [r2Id]
    );

    // 3. Restaurant 3: Le Petit Sahel — Saveurs du Nord (Maroua)
    const r3 = await pool.query(
      `INSERT INTO restaurants (owner_id, name, description, address, phone)
       VALUES ($1::uuid, 'Le Petit Sahel — Saveurs du Nord', 'Kilichi croustillant, couscous de mil, viandes séchées et thé sahélien.', 'Boulevard de la Liberté — Maroua', '+237 650 00 00 03')
       RETURNING id`,
      [payload.sub]
    );
    const r3Id = r3.rows[0].id;

    const r3Cat1 = await pool.query(`INSERT INTO menu_categories (restaurant_id, name, display_order) VALUES ($1::uuid, 'Spécialités Sahéliennes', 1) RETURNING id`, [r3Id]);
    await pool.query(
      `INSERT INTO menu_items (restaurant_id, category_id, name, description, price_fcfa)
       VALUES 
       ($1::uuid, $2::uuid, 'Planche de Kilichi Sélection', 'Bœuf mariné et séché selon la tradition de Maroua', 3000),
       ($1::uuid, $2::uuid, 'Couscous de Maïs & Sauce Gombo', 'Semoule fine et sauce gluante au mouton tendre', 2500),
       ($1::uuid, $2::uuid, 'Thé vert à la menthe Sahélien', 'Service traditionnel en théière 3 verres', 1000)`,
      [r3Id, r3Cat1.rows[0].id]
    );

    for (let i = 1; i <= 5; i++) {
      await pool.query(
        `INSERT INTO restaurant_tables (restaurant_id, table_number, capacity, status) VALUES ($1::uuid, $2, $3, 'free')`,
        [r3Id, `Tente ${i}`, 4]
      );
    }

    // Orders for R3
    await pool.query(
      `INSERT INTO orders (restaurant_id, order_type, customer_name, subtotal_fcfa, total_fcfa, payment_method, status, payment_status, created_at)
       VALUES 
       ($1::uuid, 'dine_in', 'Ousmanou B.', 6500, 6500, 'cash', 'completed', 'paid', NOW()),
       ($1::uuid, 'takeout', 'Moussa A.', 4000, 4000, 'momo', 'completed', 'paid', NOW()),
       ($1::uuid, 'dine_in', 'Délégués Région', 18500, 18500, 'cash', 'completed', 'paid', NOW() - INTERVAL '1 day')`,
      [r3Id]
    );

    return c.json({ ok: true, restaurantId: r1Id });
  }

  if (actionRef === "plans.ensureDefaults" || actionRef === "plans.ensure" || actionRef === "plans.sync") {
    return c.json({});
  }

  if (actionRef === "plans.startTrialIfMissing") {
    const payload = verifyToken(getCookie(c, "chopmboa_session"));
    if (payload) {
      const existing = await pool.query(
        `SELECT id FROM subscriptions WHERE owner_id = $1::uuid`,
        [payload.sub]
      );
      if (existing.rows.length === 0) {
        const businessPlan = await pool.query(`SELECT id FROM subscription_plans WHERE code = 'business' LIMIT 1`);
        if (businessPlan.rows.length > 0) {
          const trialEndsAt = new Date();
          trialEndsAt.setDate(trialEndsAt.getDate() + 14);
          
          await pool.query(
            `INSERT INTO subscriptions (owner_id, plan_id, status, trial_ends_at)
             VALUES ($1::uuid, $2::uuid, 'trial', $3)`,
            [payload.sub, businessPlan.rows[0].id, trialEndsAt]
          );
        }
      }
    }
    return c.json({});
  }

  if (actionRef === "plans.effective") {
    const payload = verifyToken(getCookie(c, "chopmboa_session"));
    if (payload) {
      const result = await pool.query(
        `SELECT 
           p.code, p.name, p.max_restaurants, p.max_tables_per_restaurant,
           s.status, s.trial_ends_at
         FROM subscriptions s
         JOIN subscription_plans p ON s.plan_id = p.id
         WHERE s.owner_id = $1::uuid
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [payload.sub]
      );
      if (result.rows.length > 0) {
        const sub = result.rows[0];
        const now = new Date();
        const trialEndsAt = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
        const inTrial = sub.status === 'trial' && trialEndsAt && trialEndsAt > now;
        
        let trialDaysLeft = 0;
        if (inTrial && trialEndsAt) {
          trialDaysLeft = Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        }

        return c.json({
          planCode: sub.code,
          planName: sub.name,
          maxRestaurants: sub.max_restaurants === null ? -1 : sub.max_restaurants,
          maxTablesPerRestaurant: sub.max_tables_per_restaurant === null ? -1 : sub.max_tables_per_restaurant,
          status: sub.status,
          inTrial: inTrial,
          trialEndsAt: trialEndsAt ? trialEndsAt.getTime() : undefined,
          trialDaysLeft: trialDaysLeft
        });
      }
    }
    // Fallback if no subscription found
    return c.json({
      planCode: "free",
      planName: "FREE",
      maxRestaurants: 1,
      maxTablesPerRestaurant: 5,
      status: "active",
      inTrial: false,
    });
  }

  if (actionRef === "staff.createAndAssign") {
    const body = await c.req.json<{
      restaurantId?: string;
      fullName?: string;
      email?: string;
      password?: string;
      role?: string;
    }>();

    if (!body.restaurantId || !body.fullName?.trim() || !body.email?.trim()) {
      return c.json({ error: "Nom, email et restaurant requis" }, 400);
    }

    const cleanEmail = body.email.trim().toLowerCase();
    const cleanName = body.fullName.trim();
    const cleanRole = body.role || "waiter";

    let userId: string;
    let accountCreated = false;

    const existingUser = await pool.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [cleanEmail]
    );

    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id;
      accountCreated = false;
    } else {
      const passwordToHash = body.password?.trim() || "ChopMboa2026!";
      const passwordHash = await hashPassword(passwordToHash);
      const newUser = await pool.query(
        `INSERT INTO users (full_name, email, password_hash, global_role)
         VALUES ($1, $2, $3, 'customer'::global_role)
         RETURNING id`,
        [cleanName, cleanEmail, passwordHash]
      );
      userId = newUser.rows[0].id;
      accountCreated = true;
    }

    // Verify existing staff link
    const existingStaff = await pool.query(
      `SELECT id FROM restaurant_staff WHERE restaurant_id = $1::uuid AND user_id = $2::uuid LIMIT 1`,
      [body.restaurantId, userId]
    );

    let staffId: string;
    if (existingStaff.rows.length > 0) {
      const updated = await pool.query(
        `UPDATE restaurant_staff
         SET role = $1::staff_role, deleted_at = NULL
         WHERE id = $2::uuid
         RETURNING id, role`,
        [cleanRole, existingStaff.rows[0].id]
      );
      staffId = updated.rows[0].id;
    } else {
      const inserted = await pool.query(
        `INSERT INTO restaurant_staff (restaurant_id, user_id, role)
         VALUES ($1::uuid, $2::uuid, $3::staff_role)
         RETURNING id, role`,
        [body.restaurantId, userId, cleanRole]
      );
      staffId = inserted.rows[0].id;
    }

    // Audit log
    const payload = verifyToken(getCookie(c, "chopmboa_session"));
    if (payload) {
      await pool.query(
        `INSERT INTO audit_logs (restaurant_id, user_id, action, target_entity, metadata)
         VALUES ($1::uuid, $2::uuid, 'ADD_STAFF', 'restaurant_staff', $3)`,
        [
          body.restaurantId,
          payload.sub,
          JSON.stringify({ fullName: cleanName, email: cleanEmail, role: cleanRole, accountCreated }),
        ]
      );
    }

    return c.json({
      id: staffId,
      role: cleanRole,
      accountCreated,
    });
  }

  if (actionRef === "staff.changeRole") {
    const body = await c.req.json<{ staffId?: string; role?: string; restaurantId?: string }>();
    if (!body.staffId || !body.role) return c.json({ error: "Paramètres requis" }, 400);
    if (body.staffId.startsWith("owner-")) {
      return c.json({ error: "Impossible de modifier le rôle du propriétaire" }, 400);
    }

    const result = await pool.query(
      `UPDATE restaurant_staff SET role = $1::staff_role WHERE id = $2::uuid RETURNING id, role`,
      [body.role, body.staffId]
    );

    const payload = verifyToken(getCookie(c, "chopmboa_session"));
    if (payload && body.restaurantId) {
      await pool.query(
        `INSERT INTO audit_logs (restaurant_id, user_id, action, target_entity, metadata)
         VALUES ($1::uuid, $2::uuid, 'CHANGE_STAFF_ROLE', 'restaurant_staff', $3)`,
        [body.restaurantId, payload.sub, JSON.stringify({ staffId: body.staffId, newRole: body.role })]
      );
    }

    return c.json(result.rows[0] || {});
  }

  if (actionRef === "staff.remove") {
    const body = await c.req.json<{ staffId?: string; restaurantId?: string }>();
    if (body.staffId && !body.staffId.startsWith("owner-")) {
      await pool.query(`UPDATE restaurant_staff SET deleted_at = NOW() WHERE id = $1::uuid`, [body.staffId]);
      const payload = verifyToken(getCookie(c, "chopmboa_session"));
      if (payload && body.restaurantId) {
        await pool.query(
          `INSERT INTO audit_logs (restaurant_id, user_id, action, target_entity, metadata)
           VALUES ($1::uuid, $2::uuid, 'REMOVE_STAFF', 'restaurant_staff', $3)`,
          [body.restaurantId, payload.sub, JSON.stringify({ staffId: body.staffId })]
        );
      }
    }
    return c.json({ ok: true });
  }

  if (actionRef === "plans.activate") {
    const payload = verifyToken(getCookie(c, "chopmboa_session"));
    if (!payload) return c.json({ error: "Non autorisé" }, 401);
    const body = await c.req.json<{ planCode?: string }>();
    if (!body.planCode) return c.json({ error: "Plan requis" }, 400);
    const planRes = await pool.query(`SELECT id FROM subscription_plans WHERE code = $1 LIMIT 1`, [body.planCode]);
    if (planRes.rows.length > 0) {
      await pool.query(
        `INSERT INTO subscriptions (owner_id, plan_id, status) VALUES ($1::uuid, $2::uuid, 'active')`,
        [payload.sub, planRes.rows[0].id]
      );
    }
    return c.json({ ok: true });
  }

  // Determine if it should return array or object based on action name
  if (actionRef.startsWith("get") || actionRef.startsWith("list") || actionRef.includes("List")) {
    if (actionRef.endsWith("s") || actionRef.includes("All")) {
      return c.json([]);
    }
  }
  if (actionRef.includes(".get") || actionRef.includes(".list")) {
      return c.json([]);
  }
  return c.json({});
});

// Export the Hono app for use in Netlify Functions and dev server
export { app };

// Only start the Node.js server when running directly (not imported as a module)
// This block is skipped when the file is imported by the Netlify function handler
if (process.env.NODE_ENV !== "netlify") {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));

  serve({ fetch: app.fetch, port: 3000, hostname: "0.0.0.0" }, (info) => {
    console.log(`Neon API running on http://localhost:${info.port}`);
  });
}