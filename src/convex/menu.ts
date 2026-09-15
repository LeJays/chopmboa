"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { getPool, shortText, textOrNull, serializable } from "./db";
import { requireRestaurantAccess, logAudit } from "./authz";
import type { MenuCategoryRow, MenuItemRow } from "./db";

/* ====================================================================== */
/* ChopMboa — menu (categories + items) on Neon Postgres                  */
/* ====================================================================== */

/* ----------------------------- Categories ---------------------------- */

export const listCategories = action({
  args: { restaurantId: v.string() },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    const db = getPool();
    const res = await db.query<MenuCategoryRow>(
      `SELECT id, restaurant_id, name, display_order, created_at, deleted_at
         FROM menu_categories
        WHERE restaurant_id = $1::uuid AND deleted_at IS NULL
        ORDER BY display_order ASC, created_at ASC`,
      [args.restaurantId],
    );
    return serializable(res.rows);
  },
});

export const createCategory = action({
  args: {
    restaurantId: v.string(),
    name: v.string(),
    displayOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireRestaurantAccess(ctx, args.restaurantId);
    const db = getPool();
    const orderRes = await db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM menu_categories
        WHERE restaurant_id = $1::uuid AND deleted_at IS NULL`,
      [args.restaurantId],
    );
    const nextOrder = args.displayOrder ?? Number(orderRes.rows[0]?.count ?? "0") + 1;

    const inserted = await db.query<{ id: string }>(
      `INSERT INTO menu_categories (restaurant_id, name, display_order)
       VALUES ($1::uuid, $2, $3)
       RETURNING id`,
      [args.restaurantId, shortText(args.name, 100), nextOrder],
    );
    const id = inserted.rows[0].id;
    await logAudit(ctx, {
      restaurantId: args.restaurantId,
      userId: user.id,
      action: "menu.category.created",
      targetEntity: `menuCategory:${id}`,
      metadata: `name=${args.name}`,
    });
    return id;
  },
});

export const deleteCategory = action({
  args: { categoryId: v.string() },
  handler: async (ctx, args) => {
    const db = getPool();
    const catRes = await db.query<{ id: string; restaurant_id: string }>(
      `SELECT id, restaurant_id FROM menu_categories
        WHERE id = $1::uuid AND deleted_at IS NULL`,
      [args.categoryId],
    );
    const category = catRes.rows[0];
    if (!category) throw new Error("Catégorie introuvable.");
    const { user } = await requireRestaurantAccess(ctx, category.restaurant_id);

    // Soft-delete the category and detach its items.
    await db.query(
      `UPDATE menu_categories SET deleted_at = now() WHERE id = $1::uuid`,
      [args.categoryId],
    );
    await db.query(
      `UPDATE menu_items SET category_id = NULL, updated_at = now()
        WHERE category_id = $1::uuid`,
      [args.categoryId],
    );
    await logAudit(ctx, {
      restaurantId: category.restaurant_id,
      userId: user.id,
      action: "menu.category.deleted",
      targetEntity: `menuCategory:${args.categoryId}`,
    });
    return { ok: true };
  },
});

/* -------------------------------- Items ------------------------------- */

export const listItems = action({
  args: { restaurantId: v.string() },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    const db = getPool();
    const res = await db.query<MenuItemRow>(
      `SELECT id, restaurant_id, category_id, name, description, price_fcfa,
              image_url, is_available, created_at, updated_at, deleted_at
         FROM menu_items
        WHERE restaurant_id = $1::uuid AND deleted_at IS NULL
        ORDER BY name ASC`,
      [args.restaurantId],
    );
    return serializable(res.rows);
  },
});

export const createItem = action({
  args: {
    restaurantId: v.string(),
    categoryId: v.optional(v.string()),
    name: v.string(),
    description: v.optional(v.string()),
    priceFcfa: v.number(),
    preparationTimeMin: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireRestaurantAccess(ctx, args.restaurantId);
    if (args.priceFcfa < 0) throw new Error("Le prix doit être positif.");
    const db = getPool();

    const inserted = await db.query<{ id: string }>(
      `INSERT INTO menu_items
         (restaurant_id, category_id, name, description, price_fcfa, is_available)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, true)
       RETURNING id`,
      [
        args.restaurantId,
        args.categoryId ?? null,
        shortText(args.name, 150),
        textOrNull(args.description),
        Math.round(args.priceFcfa),
      ],
    );
    const id = inserted.rows[0].id;
    await logAudit(ctx, {
      restaurantId: args.restaurantId,
      userId: user.id,
      action: "menu.item.created",
      targetEntity: `menuItem:${id}`,
      metadata: `name=${args.name} price=${args.priceFcfa}`,
    });
    return id;
  },
});

export const updateItem = action({
  args: {
    itemId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    priceFcfa: v.optional(v.number()),
    isAvailable: v.optional(v.boolean()),
    categoryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const db = getPool();
    const itemRes = await db.query<{ id: string; restaurant_id: string }>(
      `SELECT id, restaurant_id FROM menu_items
        WHERE id = $1::uuid AND deleted_at IS NULL`,
      [args.itemId],
    );
    const item = itemRes.rows[0];
    if (!item) throw new Error("Plat introuvable.");
    const { user } = await requireRestaurantAccess(ctx, item.restaurant_id);

    if (args.priceFcfa !== undefined && args.priceFcfa < 0) {
      throw new Error("Le prix doit être positif.");
    }

    await db.query(
      `UPDATE menu_items SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         price_fcfa = COALESCE($4, price_fcfa),
         is_available = COALESCE($5, is_available),
         category_id = $6,
         updated_at = now()
       WHERE id = $1::uuid`,
      [
        args.itemId,
        args.name ? shortText(args.name, 150) : null,
        args.description !== undefined ? textOrNull(args.description) : null,
        args.priceFcfa !== undefined ? Math.round(args.priceFcfa) : null,
        args.isAvailable ?? null,
        // Passing undefined clears the category only when explicitly provided.
        args.categoryId !== undefined ? args.categoryId : null,
      ],
    );
    await logAudit(ctx, {
      restaurantId: item.restaurant_id,
      userId: user.id,
      action: "menu.item.updated",
      targetEntity: `menuItem:${args.itemId}`,
    });
    return { ok: true };
  },
});

export const deleteItem = action({
  args: { itemId: v.string() },
  handler: async (ctx, args) => {
    const db = getPool();
    const itemRes = await db.query<{ id: string; restaurant_id: string }>(
      `SELECT id, restaurant_id FROM menu_items
        WHERE id = $1::uuid AND deleted_at IS NULL`,
      [args.itemId],
    );
    const item = itemRes.rows[0];
    if (!item) throw new Error("Plat introuvable.");
    const { user } = await requireRestaurantAccess(ctx, item.restaurant_id);

    await db.query(
      `UPDATE menu_items SET deleted_at = now(), is_available = false, updated_at = now()
        WHERE id = $1::uuid`,
      [args.itemId],
    );
    await logAudit(ctx, {
      restaurantId: item.restaurant_id,
      userId: user.id,
      action: "menu.item.deleted",
      targetEntity: `menuItem:${args.itemId}`,
    });
    return { ok: true };
  },
});
