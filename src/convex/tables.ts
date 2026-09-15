"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { getPool, qrToken, serializable } from "./db";
import { requireRestaurantAccess, logAudit } from "./authz";
import { effectivePlan } from "./plans";
import type { TableRow } from "./db";

/* ====================================================================== */
/* ChopMboa — restaurant tables & QR codes on Neon Postgres               */
/* ====================================================================== */

/**
 * Public QR resolution: token → restaurant + table info. No auth required
 * (the customer scanned the physical QR sticker on the table).
 */
export const resolveByToken = action({
  args: { token: v.string() },
  handler: async (_ctx, args) => {
    const db = getPool();
    const res = await db.query<
      TableRow & {
        restaurant_name: string;
        restaurant_description: string | null;
        restaurant_address: string | null;
        restaurant_phone: string | null;
        restaurant_is_active: boolean;
      }
    >(
      `SELECT t.*, r.name AS restaurant_name, r.description AS restaurant_description,
              r.address AS restaurant_address, r.phone AS restaurant_phone,
              r.is_active AS restaurant_is_active
         FROM restaurant_tables t
         JOIN restaurants r ON r.id = t.restaurant_id
        WHERE t.qr_code_token = $1 AND t.deleted_at IS NULL AND r.deleted_at IS NULL
        LIMIT 1`,
      [args.token],
    );
    const row = res.rows[0];
    if (!row || !row.restaurant_is_active) {
      throw new Error("QR Code invalide ou restaurant indisponible.");
    }
    return {
      tableId: row.id,
      tableNumber: row.table_number,
      restaurantId: row.restaurant_id,
      restaurantName: row.restaurant_name,
      restaurantDescription: row.restaurant_description,
      restaurantAddress: row.restaurant_address,
      restaurantPhone: row.restaurant_phone,
    };
  },
});

export const list = action({
  args: { restaurantId: v.string() },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    const db = getPool();
    const res = await db.query<TableRow>(
      `SELECT id, restaurant_id, table_number, qr_code_token, capacity, status,
              created_at, deleted_at
         FROM restaurant_tables
        WHERE restaurant_id = $1::uuid AND deleted_at IS NULL
        ORDER BY table_number ASC`,
      [args.restaurantId],
    );
    return serializable(res.rows);
  },
});

/** Current table usage vs the owner's plan limit (trial-aware). */
export const usage = action({
  args: { restaurantId: v.string() },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    const db = getPool();

    const ownerRes = await db.query<{ owner_id: string }>(
      `SELECT owner_id FROM restaurants WHERE id = $1::uuid`,
      [args.restaurantId],
    );
    const ownerId = ownerRes.rows[0]?.owner_id;
    if (!ownerId) throw new Error("Restaurant introuvable.");

    // Trial-aware: compte FREE en essai → limites BUSINESS. NULL = illimité.
    const plan = await effectivePlan(ownerId);
    const max = plan.max_tables_per_restaurant ?? -1;

    const countRes = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM restaurant_tables
        WHERE restaurant_id = $1::uuid AND deleted_at IS NULL`,
      [args.restaurantId],
    );
    const count = Number(countRes.rows[0]?.count ?? "0");
    return { count, max, canAdd: max === -1 || count < max };
  },
});

export const create = action({
  args: {
    restaurantId: v.string(),
    tableNumber: v.string(),
    capacity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireRestaurantAccess(ctx, args.restaurantId);
    const db = getPool();

    const ownerRes = await db.query<{ owner_id: string }>(
      `SELECT owner_id FROM restaurants WHERE id = $1::uuid`,
      [args.restaurantId],
    );
    const ownerId = ownerRes.rows[0]?.owner_id;
    if (!ownerId) throw new Error("Restaurant introuvable.");

    const plan = await effectivePlan(ownerId);
    const max = plan.max_tables_per_restaurant ?? -1;
    const countRes = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM restaurant_tables
        WHERE restaurant_id = $1::uuid AND deleted_at IS NULL`,
      [args.restaurantId],
    );
    const count = Number(countRes.rows[0]?.count ?? "0");
    if (max !== -1 && count >= max) {
      throw new Error(
        `Limite du plan atteinte (${max} tables). Passez à un plan supérieur.`,
      );
    }

    const label = args.tableNumber.trim();
    const dupRes = await db.query<{ id: string; deleted_at: Date | null }>(
      `SELECT id, deleted_at FROM restaurant_tables
        WHERE restaurant_id = $1::uuid AND table_number = $2`,
      [args.restaurantId, label],
    );
    if (dupRes.rows[0] && !dupRes.rows[0].deleted_at) {
      throw new Error(`La table ${label} existe déjà.`);
    }

    const inserted = await db.query<{ id: string; qr_code_token: string }>(
      `INSERT INTO restaurant_tables (restaurant_id, table_number, qr_code_token, capacity, status)
       VALUES ($1::uuid, $2, $3, $4, 'free')
       RETURNING id, qr_code_token`,
      [args.restaurantId, label, qrToken(), args.capacity ?? 4],
    );
    await logAudit(ctx, {
      restaurantId: args.restaurantId,
      userId: user.id,
      action: "table.created",
      targetEntity: `table:${inserted.rows[0].id}`,
      metadata: `table=${label}`,
    });
    return inserted.rows[0].id;
  },
});

export const remove = action({
  args: { tableId: v.string() },
  handler: async (ctx, args) => {
    const db = getPool();
    const tableRes = await db.query<TableRow>(
      `SELECT * FROM restaurant_tables
        WHERE id = $1::uuid AND deleted_at IS NULL`,
      [args.tableId],
    );
    const table = tableRes.rows[0];
    if (!table) throw new Error("Table introuvable.");
    const { user } = await requireRestaurantAccess(ctx, table.restaurant_id);

    await db.query(
      `UPDATE restaurant_tables SET deleted_at = now() WHERE id = $1::uuid`,
      [args.tableId],
    );
    await logAudit(ctx, {
      restaurantId: table.restaurant_id,
      userId: user.id,
      action: "table.deleted",
      targetEntity: `table:${args.tableId}`,
      metadata: `table=${table.table_number}`,
    });
    return { ok: true };
  },
});

/** Cycle a table's status: free → occupied → reserved → free. */
export const cycleStatus = action({
  args: { tableId: v.string() },
  handler: async (ctx, args) => {
    const db = getPool();
    const tableRes = await db.query<TableRow>(
      `SELECT * FROM restaurant_tables
        WHERE id = $1::uuid AND deleted_at IS NULL`,
      [args.tableId],
    );
    const table = tableRes.rows[0];
    if (!table) throw new Error("Table introuvable.");
    const { user } = await requireRestaurantAccess(ctx, table.restaurant_id);

    const next =
      table.status === "free"
        ? "occupied"
        : table.status === "occupied"
          ? "reserved"
          : "free";

    await db.query(
      `UPDATE restaurant_tables SET status = $2::table_status WHERE id = $1::uuid`,
      [args.tableId, next],
    );
    await logAudit(ctx, {
      restaurantId: table.restaurant_id,
      userId: user.id,
      action: "table.status_changed",
      targetEntity: `table:${args.tableId}`,
      metadata: `status=${next}`,
    });
    return { status: next };
  },
});
