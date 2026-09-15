"use node";

import { ActionCtx } from "./_generated/server";
import {
  AppUserRow,
  currentAppUser,
  getPool,
} from "./db";

/* ====================================================================== */
/* ChopMboa — access control + audit on Neon Postgres                     */
/* `requireRestaurantAccess` mirrors the RLS owner/staff rules.           */
/* ====================================================================== */

/** Provisioned Neon user for the caller, or throw when signed out. */
export async function requireAppUser(
  ctx: ActionCtx,
): Promise<AppUserRow> {
  const user = await currentAppUser(ctx);
  if (!user) throw new Error("Authentification requise.");
  return user;
}

/**
 * Throws unless the signed-in user owns or is staff of the restaurant.
 * Equivalent to the Postgres RLS policies (owner_id or restaurant_staff).
 */
export async function requireRestaurantAccess(
  ctx: ActionCtx,
  restaurantId: string,
): Promise<{ user: AppUserRow }> {
  const user = await requireAppUser(ctx);
  const db = getPool();

  const res = await db.query<{ id: string }>(
    `SELECT r.id
       FROM restaurants r
      WHERE r.id = $1::uuid
        AND r.deleted_at IS NULL
        AND (r.owner_id = $2::uuid
          OR EXISTS (
            SELECT 1 FROM restaurant_staff s
             WHERE s.restaurant_id = r.id
               AND s.user_id = $2::uuid
               AND s.deleted_at IS NULL
          ))
      LIMIT 1`,
    [restaurantId, user.id],
  );
  if (!res.rows[0]) throw new Error("Accès refusé à ce restaurant.");
  return { user };
}

/** Append an entry to the audit trail (audit_logs on Neon).
 *
 * L'audit ne doit JAMAIS faire échouer une mutation métier : si la table
 * est absente ou la BD indisponible, on journalise côté serveur et on
 * laisse l'opération métier réussir.
 */
export async function logAudit(
  ctx: ActionCtx,
  entry: {
    restaurantId?: string | null;
    userId?: string | null;
    action: string;
    targetEntity?: string | null;
    metadata?: string | null;
  },
): Promise<void> {
  try {
    const db = getPool();
    await db.query(
      `INSERT INTO audit_logs (restaurant_id, user_id, action, target_entity, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5)`,
      [entry.restaurantId ?? null, entry.userId ?? null, entry.action, entry.targetEntity ?? null, entry.metadata ?? null],
    );
  } catch (error) {
    console.error("[audit] écriture impossible (mutation préservée):", error);
  }
}
