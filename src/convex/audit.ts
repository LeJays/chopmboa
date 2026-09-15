"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { getPool, serializable } from "./db";
import { requireRestaurantAccess } from "./authz";
import type { AuditLogRow } from "./db";

/** Latest audit entries for a restaurant (50 max). */
export const listByRestaurant = action({
  args: { restaurantId: v.string() },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    const db = getPool();
    const res = await db.query<AuditLogRow>(
      `SELECT id, restaurant_id, user_id, action, target_entity, metadata, created_at
         FROM audit_logs
        WHERE restaurant_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT 50`,
      [args.restaurantId],
    );
    return serializable(res.rows);
  },
});
