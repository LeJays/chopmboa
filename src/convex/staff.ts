"use node";

import { createAccount, retrieveAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { getPool, shortText, serializable } from "./db";
import {
  requireAppUser,
  requireRestaurantAccess,
  logAudit,
} from "./authz";
import { currentAppUser } from "./db";

/* ====================================================================== */
/* ChopMboa — staff management (users + restaurant_staff) on Neon         */
/* Le propriétaire crée des utilisateurs (email + mot de passe) et les    */
/* assigne à un restaurant avec un rôle. Les identifiants restent dans    */
/* Convex Auth, le rôle vit dans restaurant_staff (Neon).                 */
/* ====================================================================== */

const STAFF_ROLES = ["manager", "kitchen", "cashier", "delivery", "waiter"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

export const staffRoleValidator = v.union(
  v.literal("manager"),
  v.literal("kitchen"),
  v.literal("cashier"),
  v.literal("delivery"),
  v.literal("waiter"),
);

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  manager: "Gérant",
  kitchen: "Cuisine",
  cashier: "Caisse",
  delivery: "Livreur",
  waiter: "Serveur",
};

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function staffRoleFrom(value: string): StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value)
    ? (value as StaffRole)
    : "waiter";
}

/** Owner-only guard: seul le propriétaire du restaurant gère son équipe. */
async function requireRestaurantOwner(
  ctx: Parameters<typeof requireAppUser>[0],
  restaurantId: string,
) {
  const user = await requireAppUser(ctx);
  const db = getPool();
  const res = await db.query<{ id: string }>(
    `SELECT id FROM restaurants
      WHERE id = $1::uuid AND owner_id = $2::uuid AND deleted_at IS NULL`,
    [restaurantId, user.id],
  );
  if (!res.rows[0]) {
    throw new Error("Seul le propriétaire peut gérer l'équipe de ce restaurant.");
  }
  return user;
}

/* ------------------------------- actions ------------------------------- */

/**
 * Identité + contexte de l'utilisateur connecté, résolus depuis Neon.
 * Sert à la redirection par rôle après connexion et aux gardes côté client.
 * - Propriétaire d'au moins un restaurant → role "owner".
 * - Sinon → premier rôle actif dans restaurant_staff (ou null).
 */
export const whoAmI = action({
  args: {},
  handler: async (ctx) => {
    const user = await currentAppUser(ctx);
    if (!user) return null;
    const db = getPool();

    const restRes = await db.query<{ id: string; name: string; is_owner: boolean }>(
      `SELECT r.id, r.name, (r.owner_id = $1::uuid) AS is_owner
         FROM restaurants r
        WHERE r.deleted_at IS NULL
          AND (r.owner_id = $1::uuid
            OR EXISTS (
              SELECT 1 FROM restaurant_staff s
               WHERE s.restaurant_id = r.id
                 AND s.user_id = $1::uuid
                 AND s.deleted_at IS NULL
            ))
        ORDER BY r.created_at ASC`,
      [user.id],
    );
    const restaurants = restRes.rows.map((r) => ({
      id: r.id,
      name: r.name,
      isOwner: r.is_owner,
    }));

    let role: "owner" | StaffRole | null = restaurants.some((r) => r.isOwner)
      ? "owner"
      : null;
    if (!role) {
      const roleRes = await db.query<{ role: string }>(
        `SELECT s.role::text AS role
           FROM restaurant_staff s
          WHERE s.user_id = $1::uuid AND s.deleted_at IS NULL
          ORDER BY s.created_at ASC
          LIMIT 1`,
        [user.id],
      );
      const raw = roleRes.rows[0]?.role;
      role =
        raw && (STAFF_ROLES as readonly string[]).includes(raw)
          ? (raw as StaffRole)
          : null;
    }

    return {
      userId: user.id,
      fullName: user.full_name,
      email: user.email,
      role,
      restaurants,
      primaryRestaurantId: restaurants[0]?.id ?? null,
      primaryRestaurantName: restaurants[0]?.name ?? null,
    };
  },
});

/** Staff members (joined with Neon users) for a restaurant. */
export const list = action({
  args: { restaurantId: v.string() },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    const db = getPool();
    const res = await db.query<{
      id: string;
      user_id: string;
      role: string;
      created_at: Date;
      full_name: string;
      email: string | null;
      is_owner: boolean;
    }>(
      `SELECT s.id, s.user_id, s.role::text AS role, s.created_at,
              u.full_name, u.email,
              (r.owner_id = s.user_id) AS is_owner
         FROM restaurant_staff s
         JOIN users u ON u.id = s.user_id
         JOIN restaurants r ON r.id = s.restaurant_id
        WHERE s.restaurant_id = $1::uuid AND s.deleted_at IS NULL
        ORDER BY (r.owner_id = s.user_id) DESC, s.created_at ASC`,
      [args.restaurantId],
    );
    return serializable(res.rows);
  },
});

/**
 * Créer (ou retrouver) un utilisateur et l'assigner au restaurant.
 * Si l'email a déjà un compte, l'attribution se fait sans toucher au mot de
 * passe ; sinon le compte est créé avec le mot de passe fourni (8+ car.).
 */
export const createAndAssign = action({
  args: {
    restaurantId: v.string(),
    fullName: v.string(),
    email: v.string(),
    password: v.string(),
    role: staffRoleValidator,
  },
  handler: async (ctx, args) => {
    const owner = await requireRestaurantOwner(ctx, args.restaurantId);

    const name = args.fullName.trim();
    const email = args.email.trim();
    if (name.length < 2) throw new Error("Le nom complet est requis.");
    if (!emailRe.test(email)) throw new Error("Adresse email invalide.");
    if (args.password.length < 8) {
      throw new Error("Mot de passe : 8 caractères minimum.");
    }

    // 1) Provision Neon user row (métier).
    const db = getPool();
    const existing = await db.query<{ id: string; full_name: string }>(
      `SELECT id, full_name FROM users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase()],
    );
    let staffUserId = existing.rows[0]?.id;
    if (!staffUserId) {
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO users (full_name, email, password_hash, global_role, is_active)
         VALUES ($1, $2, $3, 'customer', true)
         RETURNING id`,
        [name, email.toLowerCase(), `!convex-auth:${crypto.randomUUID()}`],
      );
      staffUserId = inserted.rows[0].id;
    }

    // 2) Credentials in Convex Auth. Existing account → keep its password.
    let accountCreated = false;
    try {
      await retrieveAccount(ctx, { provider: "password", account: { id: email } });
    } catch {
      try {
        await retrieveAccount(ctx, {
          provider: "password",
          account: { id: email.toLowerCase() },
        });
        accountCreated = false;
      } catch {
        await createAccount(ctx, {
          provider: "password",
          account: { id: email, secret: args.password },
          profile: { email, name },
        });
        accountCreated = true;
      }
    }

    // 3) Assign the role (idempotent; revives soft-deleted assignments).
    const assigned = await db.query<{ id: string }>(
      `INSERT INTO restaurant_staff (restaurant_id, user_id, role)
       VALUES ($1::uuid, $2::uuid, $3::staff_role)
       ON CONFLICT (restaurant_id, user_id, role)
         DO UPDATE SET deleted_at = NULL
       RETURNING id`,
      [args.restaurantId, staffUserId, args.role],
    );

    // 4) Optional: role change for an existing member in another role row.
    if (args.role !== "manager") {
      await db.query(
        `UPDATE restaurant_staff SET deleted_at = now()
          WHERE restaurant_id = $1::uuid AND user_id = $2::uuid
            AND role = 'manager' AND deleted_at IS NULL`,
        [args.restaurantId, staffUserId],
      );
    }

    await logAudit(ctx, {
      restaurantId: args.restaurantId,
      userId: owner.id,
      action: "staff.assigned",
      targetEntity: `user:${staffUserId}`,
      metadata: `${email} → ${STAFF_ROLE_LABELS[args.role]}${
        accountCreated ? " (compte créé)" : " (compte existant)"
      }`,
    });

    return {
      ok: true,
      userId: staffUserId,
      assignmentId: assigned.rows[0]?.id ?? null,
      accountCreated,
    };
  },
});

/** Change a member's role (owner-only). */
export const changeRole = action({
  args: {
    restaurantId: v.string(),
    staffId: v.string(),
    role: staffRoleValidator,
  },
  handler: async (ctx, args) => {
    const owner = await requireRestaurantOwner(ctx, args.restaurantId);
    const db = getPool();

    const memberRes = await db.query<{ user_id: string; is_owner: boolean }>(
      `SELECT s.user_id, (r.owner_id = s.user_id) AS is_owner
         FROM restaurant_staff s
         JOIN restaurants r ON r.id = s.restaurant_id
        WHERE s.id = $1::uuid AND s.restaurant_id = $2::uuid AND s.deleted_at IS NULL`,
      [args.staffId, args.restaurantId],
    );
    const member = memberRes.rows[0];
    if (!member) throw new Error("Membre introuvable.");
    if (member.is_owner) {
      throw new Error("Le rôle du propriétaire ne peut pas être modifié.");
    }

    // One active role per member: retire other rows, upsert the target one.
    await db.query(
      `UPDATE restaurant_staff SET deleted_at = now()
        WHERE restaurant_id = $1::uuid AND user_id = $2::uuid
          AND deleted_at IS NULL`,
      [args.restaurantId, member.user_id],
    );
    await db.query(
      `INSERT INTO restaurant_staff (restaurant_id, user_id, role)
       VALUES ($1::uuid, $2::uuid, $3::staff_role)
       ON CONFLICT (restaurant_id, user_id, role)
         DO UPDATE SET deleted_at = NULL`,
      [args.restaurantId, member.user_id, args.role],
    );

    await logAudit(ctx, {
      restaurantId: args.restaurantId,
      userId: owner.id,
      action: "staff.role_changed",
      targetEntity: `user:${member.user_id}`,
      metadata: `nouveau rôle: ${STAFF_ROLE_LABELS[args.role]}`,
    });
    return { ok: true };
  },
});

/** Remove a member from the restaurant (soft delete, owner-only). */
export const remove = action({
  args: { restaurantId: v.string(), staffId: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireRestaurantOwner(ctx, args.restaurantId);
    const db = getPool();

    const memberRes = await db.query<{ user_id: string; is_owner: boolean; full_name: string }>(
      `SELECT s.user_id, (r.owner_id = s.user_id) AS is_owner, u.full_name
         FROM restaurant_staff s
         JOIN restaurants r ON r.id = s.restaurant_id
         JOIN users u ON u.id = s.user_id
        WHERE s.id = $1::uuid AND s.restaurant_id = $2::uuid AND s.deleted_at IS NULL`,
      [args.staffId, args.restaurantId],
    );
    const member = memberRes.rows[0];
    if (!member) throw new Error("Membre introuvable.");
    if (member.is_owner) {
      throw new Error("Le propriétaire ne peut pas être retiré de son restaurant.");
    }

    await db.query(
      `UPDATE restaurant_staff SET deleted_at = now()
        WHERE id = $1::uuid`,
      [args.staffId],
    );

    await logAudit(ctx, {
      restaurantId: args.restaurantId,
      userId: owner.id,
      action: "staff.removed",
      targetEntity: `user:${member.user_id}`,
      metadata: shortText(member.full_name) ?? member.user_id,
    });
    return { ok: true };
  },
});
