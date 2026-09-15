import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./users";

/** Store the full name collected on the inscription (sign-up) form.
 *  Reste côté Convex : le profil d'authentification, pas la base métier. */
export const updateProfile = mutation({
  args: { fullName: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Authentification requise.");
    const trimmed = args.fullName.trim();
    if (trimmed.length < 2) {
      throw new Error("Le nom complet est requis (2 caractères minimum).");
    }
    await ctx.db.patch(userId, {
      name: trimmed,
    });
    return { ok: true };
  },
});

/** Lightweight alias consumed by useAuth (kept for template parity). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});
