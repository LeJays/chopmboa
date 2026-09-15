"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { PLANS, TRIAL_DAYS, addDays } from "../lib/chopmboa";
import { getPool, toTs, serializable } from "./db";
import { requireAppUser, logAudit } from "./authz";
import type { SubscriptionPlanRow, SubscriptionRow } from "./db";

/* ====================================================================== */
/* ChopMboa — plans & 14-day BUSINESS trial on Neon Postgres              */
/* Règle d'essai : tout nouvel abonnement — même FREE — ouvre 14 jours    */
/* d'accès BUSINESS (restaurants et tables illimités). À la fin de        */
/* l'essai : FREE → limites FREE.                                         */
/* ====================================================================== */

const planCodeValidator = v.union(
  v.literal("free"),
  v.literal("pro"),
  v.literal("business"),
);

export const TRIAL_PLAN_CODE: "free" | "pro" | "business" = "business";

/** Idempotently sync the plan catalog into `subscription_plans`. */
export async function ensurePlans(): Promise<void> {
  const db = getPool();
  for (const plan of PLANS) {
    await db.query(
      `INSERT INTO subscription_plans
         (code, name, price_fcfa, max_restaurants, max_tables_per_restaurant, delivery_commission_pct)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name,
             price_fcfa = EXCLUDED.price_fcfa,
             max_restaurants = EXCLUDED.max_restaurants,
             max_tables_per_restaurant = EXCLUDED.max_tables_per_restaurant`,
      [
        plan.code,
        plan.name,
        plan.priceFcfa,
        plan.maxRestaurants === -1 ? null : plan.maxRestaurants,
        plan.maxTablesPerRestaurant === -1 ? null : plan.maxTablesPerRestaurant,
        String(plan.deliveryCommissionPct),
      ],
    );
  }
}

export async function planByCode(
  code: "free" | "pro" | "business",
): Promise<SubscriptionPlanRow> {
  const db = getPool();
  const res = await db.query<SubscriptionPlanRow>(
    `SELECT id, code, name, price_fcfa, max_restaurants, max_tables_per_restaurant,
            delivery_commission_pct, created_at
       FROM subscription_plans WHERE code = $1 LIMIT 1`,
    [code],
  );
  const plan = res.rows[0];
  if (!plan) throw new Error("Catalogue de plans introuvable.");
  return plan;
}

/** Plan row whose LIMITS apply right now for an owner (trial-aware). */
export async function effectivePlan(
  ownerId: string,
): Promise<SubscriptionPlanRow> {
  const db = getPool();
  const subRes = await db.query<SubscriptionRow>(
    `SELECT id, owner_id, plan_id, status, trial_ends_at, current_period_end,
            created_at, updated_at
       FROM subscriptions WHERE owner_id = $1::uuid
      ORDER BY created_at DESC LIMIT 1`,
    [ownerId],
  );
  const sub = subRes.rows[0];
  if (!sub) return await planByCode("free");

  const trialActive =
    sub.status === "trial" &&
    sub.trial_ends_at !== null &&
    sub.trial_ends_at.getTime() > Date.now();

  if (trialActive) return await planByCode(TRIAL_PLAN_CODE);

  if (sub.status === "active") {
    const planRes = await db.query<SubscriptionPlanRow>(
      `SELECT id, code, name, price_fcfa, max_restaurants, max_tables_per_restaurant,
              delivery_commission_pct, created_at
         FROM subscription_plans WHERE id = $1::uuid LIMIT 1`,
      [sub.plan_id],
    );
    if (planRes.rows[0]) return planRes.rows[0];
  }
  return await planByCode("free");
}

/** Count active restaurants owned by an owner (plan limit input). */
export async function activeRestaurantCount(ownerId: string): Promise<number> {
  const db = getPool();
  const res = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM restaurants
      WHERE owner_id = $1::uuid AND deleted_at IS NULL`,
    [ownerId],
  );
  return Number(res.rows[0]?.count ?? "0");
}

/* ------------------------------- actions ------------------------------- */

/** Sync the plan catalog. Called on dashboard mount; safe to repeat. */
export const ensure = action({
  args: {},
  handler: async () => {
    await ensurePlans();
    return { ok: true };
  },
});

/** Current owner subscription + raw plan, or null. */
export const mine = action({
  args: {},
  handler: async (ctx) => {
    const user = await requireAppUser(ctx);
    const db = getPool();
    const subRes = await db.query<SubscriptionRow>(
      `SELECT id, owner_id, plan_id, status, trial_ends_at, current_period_end,
              created_at, updated_at
         FROM subscriptions WHERE owner_id = $1::uuid
        ORDER BY created_at DESC LIMIT 1`,
      [user.id],
    );
    const sub = subRes.rows[0];
    if (!sub) return null;
    const planRes = await db.query<SubscriptionPlanRow>(
      `SELECT id, code, name, price_fcfa, max_restaurants, max_tables_per_restaurant,
              delivery_commission_pct, created_at
         FROM subscription_plans WHERE id = $1::uuid LIMIT 1`,
      [sub.plan_id],
    );
    return serializable({ subscription: sub, plan: planRes.rows[0] ?? null });
  },
});

/** What the UI enforces right now: effective limits + trial countdown. */
export const effective = action({
  args: {},
  handler: async (ctx) => {
    const user = await requireAppUser(ctx);
    const db = getPool();

    const subRes = await db.query<SubscriptionRow>(
      `SELECT id, owner_id, plan_id, status, trial_ends_at, current_period_end,
              created_at, updated_at
         FROM subscriptions WHERE owner_id = $1::uuid
        ORDER BY created_at DESC LIMIT 1`,
      [user.id],
    );
    const sub = subRes.rows[0] ?? null;

    const plan = await effectivePlan(user.id);
    const now = Date.now();
    const inTrial =
      !!sub &&
      sub.status === "trial" &&
      sub.trial_ends_at !== null &&
      sub.trial_ends_at.getTime() > now;

    return {
      planCode: plan.code as "free" | "pro" | "business",
      planName: plan.name,
      maxRestaurants: plan.max_restaurants ?? -1,
      maxTablesPerRestaurant: plan.max_tables_per_restaurant ?? -1,
      status: (sub?.status ?? "active") as SubscriptionRow["status"],
      inTrial,
      trialEndsAt: inTrial ? sub!.trial_ends_at!.getTime() : undefined,
      trialDaysLeft: inTrial
        ? Math.max(
            0,
            Math.ceil((sub!.trial_ends_at!.getTime() - now) / 86_400_000),
          )
        : undefined,
    };
  },
});

/**
 * Activate a plan for the signed-in owner.
 * Tout plan ouvre 14 jours d'essai avec accès BUSINESS (même le FREE).
 * v1 : pas de passerelle de paiement — l'activation PRO/BUSINESS démarre
 * l'essai ; à son terme les limites retombent sur FREE.
 */
export const activate = action({
  args: { planCode: planCodeValidator },
  handler: async (ctx, args) => {
    const user = await requireAppUser(ctx);
    await ensurePlans();
    const plan = await planByCode(args.planCode);

    const db = getPool();
    const now = new Date();
    const subRes = await db.query<SubscriptionRow>(
      `SELECT id, owner_id, plan_id, status, trial_ends_at, current_period_end,
              created_at, updated_at
         FROM subscriptions WHERE owner_id = $1::uuid
        ORDER BY created_at DESC LIMIT 1`,
      [user.id],
    );
    const existing = subRes.rows[0];

    // Un essai échu ne se recharge pas : le plan redevient ses limites.
    const trialAlreadyUsed =
      existing?.status === "expired" || existing?.status === "cancelled";
    const openTrial = !trialAlreadyUsed;

    const trialEndsAt = openTrial ? toTs(addDays(now.getTime(), TRIAL_DAYS)) : null;
    const periodEnd =
      openTrial && plan.price_fcfa > 0
        ? toTs(addDays(now.getTime(), 30))
        : null;

    if (existing) {
      await db.query(
        `UPDATE subscriptions
            SET plan_id = $2::uuid,
                status = $3,
                trial_ends_at = $4,
                current_period_end = $5,
                updated_at = now()
          WHERE id = $1::uuid`,
        [
          existing.id,
          plan.id,
          openTrial ? "trial" : "active",
          trialEndsAt,
          periodEnd,
        ],
      );
    } else {
      await db.query(
        `INSERT INTO subscriptions
           (owner_id, plan_id, status, trial_ends_at, current_period_end)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5)`,
        [
          user.id,
          plan.id,
          openTrial ? "trial" : "active",
          trialEndsAt,
          periodEnd,
        ],
      );
    }

    await logAudit(ctx, {
      userId: user.id,
      action: openTrial ? "subscription.trial_started" : "subscription.activated",
      targetEntity: `plan:${plan.code}`,
      metadata: openTrial
        ? `essai ${TRIAL_DAYS}j accès BUSINESS`
        : "essai déjà consommé — limites du plan",
    });

    return {
      ok: true,
      trialEndsAt: trialEndsAt ? trialEndsAt.getTime() : undefined,
    };
  },
});

/**
 * Règle produit : tout nouveau compte démarre automatiquement le plan FREE
 * avec 14 jours d'accès BUSINESS. Called on dashboard mount; idempotent.
 */
export const startTrialIfMissing = action({
  args: {},
  handler: async (ctx) => {
    const user = await requireAppUser(ctx);
    await ensurePlans();

    const db = getPool();
    const subRes = await db.query<SubscriptionRow>(
      `SELECT id FROM subscriptions WHERE owner_id = $1::uuid LIMIT 1`,
      [user.id],
    );
    if (subRes.rows[0]) return { ok: true, created: false };

    const freePlan = await planByCode("free");
    await db.query(
      `INSERT INTO subscriptions (owner_id, plan_id, status, trial_ends_at)
       VALUES ($1::uuid, $2::uuid, 'trial', $3)`,
      [user.id, freePlan.id, toTs(addDays(Date.now(), TRIAL_DAYS))],
    );
    await logAudit(ctx, {
      userId: user.id,
      action: "subscription.trial_started",
      targetEntity: "plan:free",
      metadata: `accès BUSINESS ${TRIAL_DAYS} jours`,
    });
    return { ok: true, created: true };
  },
});

/** Lazy trial expiry: overdue trial → expired (limits drop to FREE). */
export const sync = action({
  args: {},
  handler: async (ctx) => {
    const user = await requireAppUser(ctx);
    await ensurePlans();

    const db = getPool();
    const subRes = await db.query<SubscriptionRow>(
      `SELECT id, status, trial_ends_at FROM subscriptions
        WHERE owner_id = $1::uuid ORDER BY created_at DESC LIMIT 1`,
      [user.id],
    );
    const sub = subRes.rows[0];
    if (
      sub &&
      sub.status === "trial" &&
      sub.trial_ends_at !== null &&
      sub.trial_ends_at.getTime() <= Date.now()
    ) {
      await db.query(
        `UPDATE subscriptions SET status = 'expired', updated_at = now()
          WHERE id = $1::uuid`,
        [sub.id],
      );
      await logAudit(ctx, {
        userId: user.id,
        action: "subscription.expired",
        targetEntity: `subscription:${sub.id}`,
        metadata: "fin d'essai — limites FREE appliquées",
      });
    }
    return { ok: true };
  },
});
