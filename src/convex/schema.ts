import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/* ====================================================================== */
/* ChopMboa — Convex schema                                               */
/* Toutes les données métier vivent désormais dans la base Neon Postgres  */
/* du propriétaire (voir src/convex/db.ts). Convex ne conserve que les    */
/* tables d'authentification (comptes, sessions, OTP, mots de passe).     */
/* ====================================================================== */

const schema = defineSchema({
  ...authTables, // do not remove or modify

  users: defineTable({
    name: v.optional(v.string()), // do not remove
    image: v.optional(v.string()), // do not remove
    email: v.optional(v.string()), // do not remove
    emailVerificationTime: v.optional(v.number()), // do not remove
    isAnonymous: v.optional(v.boolean()), // do not remove
    role: v.optional(v.string()), // do not remove
    globalRole: v.optional(v.string()), // legacy field (roles now live in Neon)
    fullName: v.optional(v.string()), // legacy field (profile name)
  }).index("email", ["email"]), // do not remove or modify
});

export default schema;
