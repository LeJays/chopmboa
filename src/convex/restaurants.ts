"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { getPool, shortText, textOrNull, fromNumeric, serializable } from "./db";
import {
  requireAppUser,
  requireRestaurantAccess,
  logAudit,
} from "./authz";
import { effectivePlan } from "./plans";
import type { RestaurantRow } from "./db";

/* ====================================================================== */
/* ChopMboa — restaurants on Neon Postgres (multi-tenant, trial-aware)    */
/* ====================================================================== */

const uuidValidator = v.string();

/** All active restaurants owned by the signed-in user (multi-restaurant). */
export const listMine = action({
  args: {},
  handler: async (ctx) => {
    const user = await requireAppUser(ctx);
    const db = getPool();
    const res = await db.query<RestaurantRow>(
      `SELECT * FROM restaurants
        WHERE owner_id = $1::uuid AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [user.id],
    );
    return serializable(res.rows);
  },
});

/** Single restaurant (with access check). */
export const getOne = action({
  args: { restaurantId: uuidValidator },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    const db = getPool();
    const res = await db.query<RestaurantRow>(
      `SELECT * FROM restaurants WHERE id = $1::uuid AND deleted_at IS NULL`,
      [args.restaurantId],
    );
    return res.rows[0] ? serializable(res.rows[0]) : null;
  },
});

/** Active staff members of a restaurant. */
export const listMembers = action({
  args: { restaurantId: uuidValidator },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    const db = getPool();
    const res = await db.query<{
      id: string;
      user_id: string;
      role: string;
      created_at: Date;
      full_name: string;
    }>(
      `SELECT s.id, s.user_id, s.role::text AS role, s.created_at, u.full_name
         FROM restaurant_staff s
         JOIN users u ON u.id = s.user_id
        WHERE s.restaurant_id = $1::uuid AND s.deleted_at IS NULL
        ORDER BY s.created_at ASC`,
      [args.restaurantId],
    );
    return serializable(res.rows);
  },
});

export const create = action({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()), // stocké dans address (schéma Neon sans city)
    phone: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);

    // Plan limit check with trial rules (FREE: 1, PRO: 3, BUSINESS: unlimited).
    // NULL = illimité (PRO tables / BUSINESS) — pendant l'essai de 14 jours,
    // même un compte FREE bénéficie des limites BUSINESS.
    const plan = await effectivePlan(user.id);
    const max = plan.max_restaurants ?? -1;
    const count = await effectivePlanCount(user.id);
    if (count >= max) {
      throw new Error(
        `Limite du plan atteinte (${max} restaurant(s)). Passez à un plan supérieur.`,
      );
    }

    const db = getPool();
    const addressWithCity =
      args.city && args.address
        ? `${args.address.trim()} — ${args.city.trim()}`
        : (args.city ?? args.address) || null;
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO restaurants
         (owner_id, name, description, address, phone, latitude, longitude, is_active)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, true)
       RETURNING id`,
      [
        user.id,
        shortText(args.name),
        textOrNull(args.description),
        textOrNull(addressWithCity),
        shortText(args.phone),
        args.latitude ?? null,
        args.longitude ?? null,
      ],
    );
    const restaurantId = inserted.rows[0].id;

    // Owner is also a manager member of their restaurant.
    await db.query(
      `INSERT INTO restaurant_staff (restaurant_id, user_id, role)
       VALUES ($1::uuid, $2::uuid, 'manager')
       ON CONFLICT (restaurant_id, user_id, role) DO NOTHING`,
      [restaurantId, user.id],
    );

    await logAudit(ctx, {
      restaurantId,
      userId: user.id,
      action: "restaurant.created",
      targetEntity: `restaurant:${restaurantId}`,
      metadata: `name=${args.name}`,
    });

    return restaurantId;
  },
});

/** Restaurants count for the plan limit (kept tiny to stay readable). */
async function effectivePlanCount(ownerId: string): Promise<number> {
  const db = getPool();
  const res = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM restaurants
      WHERE owner_id = $1::uuid AND deleted_at IS NULL`,
    [ownerId],
  );
  return Number(res.rows[0]?.count ?? "0");
}

export const update = action({
  args: {
    restaurantId: uuidValidator,
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()), // stocké dans address (schéma Neon sans city)
    phone: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireRestaurantAccess(ctx, args.restaurantId);
    const db = getPool();
    const addressWithCity =
      args.city && args.address
        ? `${args.address.trim()} — ${args.city.trim()}`
        : (args.city ?? args.address) ?? null;
    await db.query(
      `UPDATE restaurants SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         address = COALESCE($4, address),
         phone = COALESCE($5, phone),
         is_active = COALESCE($6, is_active),
         updated_at = now()
       WHERE id = $1::uuid`,
      [
        args.restaurantId,
        args.name ? shortText(args.name) : null,
        args.description !== undefined ? textOrNull(args.description) : null,
        addressWithCity !== undefined ? textOrNull(addressWithCity) : null,
        args.phone !== undefined ? shortText(args.phone) : null,
        args.isActive ?? null,
      ],
    );
    await logAudit(ctx, {
      restaurantId: args.restaurantId,
      userId: user.id,
      action: "restaurant.updated",
      targetEntity: `restaurant:${args.restaurantId}`,
    });
    return { ok: true };
  },
});

/* -------------------------------- KPIs --------------------------------- */

export interface DayBucket {
  day: string;
  totalFcfa: number;
  orders: number;
}

/** KPI pack powering the owner dashboard (today + 7-day revenue series). */
export const kpis = action({
  args: { restaurantId: uuidValidator },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    const db = getPool();

    const todayRes = await db.query<{
      orders_today: string;
      revenue_today: string;
      avg_ticket: string | null;
    }>(
      `SELECT count(*)::text AS orders_today,
              COALESCE(SUM(total_fcfa) FILTER (WHERE payment_status = 'paid'), 0)::text AS revenue_today,
              CASE WHEN count(*) > 0
                   THEN ROUND(AVG(total_fcfa))::text
                   ELSE NULL END AS avg_ticket
         FROM orders
        WHERE restaurant_id = $1::uuid
          AND status <> 'cancelled'
          AND created_at >= date_trunc('day', now())`,
      [args.restaurantId],
    );
    const today = todayRes.rows[0];

    const activeRes = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM orders
        WHERE restaurant_id = $1::uuid
          AND status IN ('pending', 'confirmed', 'in_kitchen', 'ready')`,
      [args.restaurantId],
    );

    const menuRes = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM menu_items
        WHERE restaurant_id = $1::uuid AND deleted_at IS NULL`,
      [args.restaurantId],
    );

    const tablesRes = await db.query<{ total: string; occupied: string }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (WHERE status = 'occupied')::text AS occupied
         FROM restaurant_tables
        WHERE restaurant_id = $1::uuid AND deleted_at IS NULL`,
      [args.restaurantId],
    );

    // 7-day revenue series (single scan, bucketed in SQL).
    const seriesRes = await db.query<{ d: Date; total: string; n: string }>(
      `SELECT date_trunc('day', created_at) AS d,
              COALESCE(SUM(total_fcfa), 0)::text AS total,
              count(*)::text AS n
         FROM orders
        WHERE restaurant_id = $1::uuid
          AND status <> 'cancelled'
          AND created_at >= date_trunc('day', now()) - interval '6 days'
        GROUP BY 1 ORDER BY 1`,
      [args.restaurantId],
    );

    const byDay = new Map<string, { totalFcfa: number; orders: number }>();
    for (const row of seriesRes.rows) {
      const key = new Date(row.d).toISOString().slice(0, 10);
      byDay.set(key, {
        totalFcfa: Number(row.total),
        orders: Number(row.n),
      });
    }
    const revenueSeries: DayBucket[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = byDay.get(key);
      revenueSeries.push({
        day: d.toLocaleDateString("fr-FR", { weekday: "short" }),
        totalFcfa: found?.totalFcfa ?? 0,
        orders: found?.orders ?? 0,
      });
    }

    return {
      revenueTodayFcfa: fromNumeric(today?.revenue_today) ?? 0,
      ordersToday: Number(today?.orders_today ?? "0"),
      avgTicketFcfa: fromNumeric(today?.avg_ticket) ?? 0,
      activeOrders: Number(activeRes.rows[0]?.count ?? "0"),
      menuCount: Number(menuRes.rows[0]?.count ?? "0"),
      tableCount: Number(tablesRes.rows[0]?.total ?? "0"),
      occupiedTables: Number(tablesRes.rows[0]?.occupied ?? "0"),
      revenueSeries,
    };
  },
});
