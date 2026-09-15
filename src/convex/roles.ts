import { v, Infer } from "convex/values";

/** Platform-level roles (mirrors the `global_role` Postgres enum). */
export const globalRoles = v.union(
  v.literal("super_admin"),
  v.literal("owner"),
  v.literal("customer"),
);
export type GlobalRole = Infer<typeof globalRoles>;

/** Restaurant-staff roles (mirrors the `staff_role` Postgres enum). */
export const staffRoles = v.union(
  v.literal("manager"),
  v.literal("kitchen"),
  v.literal("cashier"),
  v.literal("delivery"),
  v.literal("waiter"),
);
export type StaffRole = Infer<typeof staffRoles>;

/** Owner-equivalent staff roles allowed to open the owner console. */
export const OWNER_ACCESS_STAFF_ROLES: readonly StaffRole[] = [
  "manager",
  "cashier",
  "waiter",
  "kitchen",
];
