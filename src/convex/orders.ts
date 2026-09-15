"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { getPool, serializable } from "./db";
import { requireRestaurantAccess, logAudit } from "./authz";
import type { OrderRow, OrderItemRow, OrderStatusHistoryRow } from "./db";

/* ====================================================================== */
/* ChopMboa — orders on Neon Postgres                                     */
/* Effet domino : order + items + history + table occupancy + audit       */
/* dans une transaction SQL unique.                                       */
/* ====================================================================== */

const orderStatusValidator = v.union(
  v.literal("confirmed"),
  v.literal("in_kitchen"),
  v.literal("ready"),
  v.literal("served"),
  v.literal("out_for_delivery"),
  v.literal("delivered"),
  v.literal("cancelled"),
);

export const listRecent = action({
  args: { restaurantId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    const db = getPool();
    // Neon schema has no order_number column: derive a display number from
    // insertion order (row_number over created_at, computed pre-LIMIT).
    const res = await db.query<OrderRow & { order_number: string }>(
      `SELECT *,
              'CMD-' || lpad((row_number() OVER (ORDER BY created_at ASC))::text, 4, '0')
                AS order_number
         FROM orders
        WHERE restaurant_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT $2`,
      [args.restaurantId, Math.min(args.limit ?? 50, 200)],
    );
    return serializable(res.rows);
  },
});

/**
 * Commandes actives (file complète) avec leurs lignes — alimente le KDS,
 * la caisse et la vue serveur. Requête par accès (RLS équivalent).
 */
export const activeWithItems = action({
  args: { restaurantId: v.string() },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    const db = getPool();
    const ordersRes = await db.query<OrderRow & { order_number: string }>(
      `SELECT *,
              'CMD-' || lpad((row_number() OVER (ORDER BY created_at ASC))::text, 4, '0')
                AS order_number
         FROM orders
        WHERE restaurant_id = $1::uuid
          AND status IN ('pending', 'confirmed', 'in_kitchen', 'ready',
                         'out_for_delivery')
        ORDER BY created_at ASC`,
      [args.restaurantId],
    );
    if (ordersRes.rows.length === 0) return serializable([]);

    const ids = ordersRes.rows.map((o) => o.id);
    const itemsRes = await db.query<{
      id: string;
      order_id: string;
      menu_item_id: string;
      quantity: number;
      notes: string | null;
      item_name: string;
    }>(
      `SELECT oi.id, oi.order_id, oi.menu_item_id, oi.quantity, oi.notes,
              COALESCE(mi.name, 'Plat supprimé') AS item_name
         FROM order_items oi
         LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id = ANY($1::uuid[])
        ORDER BY oi.id`,
      [ids],
    );
    const byOrder = new Map<string, typeof itemsRes.rows>();
    for (const it of itemsRes.rows) {
      const list = byOrder.get(it.order_id) ?? [];
      list.push(it);
      byOrder.set(it.order_id, list);
    }
    return serializable(
      ordersRes.rows.map((o) => ({
        ...o,
        items: byOrder.get(o.id) ?? [],
      })),
    );
  },
});

export const detail = action({
  args: { orderId: v.string() },
  handler: async (ctx, args) => {
    const db = getPool();
    const orderRes = await db.query<
      OrderRow & { order_number: string }
    >(
      `SELECT *,
              'CMD-' || lpad((row_number() OVER (ORDER BY created_at ASC))::text, 4, '0')
                AS order_number
         FROM orders WHERE id = $1::uuid`,
      [args.orderId],
    );
    const order = orderRes.rows[0];
    if (!order) return null;
    await requireRestaurantAccess(ctx, order.restaurant_id);

    const itemsRes = await db.query<OrderItemRow>(
      `SELECT id, order_id, menu_item_id, quantity, unit_price_fcfa, subtotal_fcfa, notes
         FROM order_items WHERE order_id = $1::uuid ORDER BY id`,
      [args.orderId],
    );
    const historyRes = await db.query<OrderStatusHistoryRow>(
      `SELECT id, order_id, status::text AS status, changed_by, changed_at
         FROM order_status_history WHERE order_id = $1::uuid ORDER BY changed_at ASC`,
      [args.orderId],
    );
    return serializable({
      order,
      items: itemsRes.rows,
      history: historyRes.rows,
    });
  },
});

const itemValidator = v.object({
  menuItemId: v.string(),
  quantity: v.number(),
  notes: v.optional(v.string()),
});

export const create = action({
  args: {
    restaurantId: v.string(),
    orderType: v.union(v.literal("dine_in"), v.literal("delivery")),
    tableId: v.optional(v.string()),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    deliveryAddress: v.optional(v.string()),
    deliveryFeeFcfa: v.optional(v.number()),
    paymentMethod: v.union(v.literal("cash"), v.literal("mobile_money")),
    notes: v.optional(v.string()),
    items: v.array(itemValidator),
  },
  handler: async (ctx, args) => {
    const { user } = await requireRestaurantAccess(ctx, args.restaurantId);
    if (args.items.length === 0) throw new Error("Commande vide.");
    if (args.orderType === "dine_in" && !args.tableId) {
      throw new Error("Une commande sur place requiert une table.");
    }

    const db = getPool();
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Price every line server-side from menu_items.
      let subtotal = 0;
      const priced: {
        menuItemId: string;
        quantity: number;
        unitPriceFcfa: number;
        subtotalFcfa: number;
        notes: string | null;
      }[] = [];
      for (const item of args.items) {
        const menuRes = await client.query<{
          id: string;
          price_fcfa: number;
          is_available: boolean;
          deleted_at: Date | null;
          restaurant_id: string;
        }>(
          `SELECT id, price_fcfa, is_available, deleted_at, restaurant_id
             FROM menu_items WHERE id = $1::uuid FOR UPDATE`,
          [item.menuItemId],
        );
        const menuItem = menuRes.rows[0];
        if (
          !menuItem ||
          menuItem.deleted_at ||
          !menuItem.is_available ||
          menuItem.restaurant_id !== args.restaurantId
        ) {
          throw new Error("Un plat de la commande n'est plus disponible.");
        }
        const line = menuItem.price_fcfa;
        const lineSubtotal = line * item.quantity;
        subtotal += lineSubtotal;
        priced.push({
          menuItemId: menuItem.id,
          quantity: item.quantity,
          unitPriceFcfa: line,
          subtotalFcfa: lineSubtotal,
          notes: item.notes?.trim() || null,
        });
      }

      const deliveryFee =
        args.orderType === "delivery" ? (args.deliveryFeeFcfa ?? 1000) : 0;
      const total = subtotal + deliveryFee;

      const countRes = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM orders WHERE restaurant_id = $1::uuid`,
        [args.restaurantId],
      );
      const orderNumber = `CMD-${String(
        Number(countRes.rows[0]?.count ?? "0") + 1,
      ).padStart(4, "0")}`;

      const orderRes = await client.query<{ id: string }>(
        `INSERT INTO orders
           (restaurant_id, order_type, table_id, customer_name, customer_phone,
            delivery_address, status, subtotal_fcfa, delivery_fee_fcfa, total_fcfa,
            payment_method, payment_status, notes)
         VALUES ($1::uuid, $2::order_type, $3::uuid, $4, $5, $6, 'pending',
                 $7, $8, $9, $10::payment_method, 'pending', $11)
         RETURNING id`,
        [
          args.restaurantId,
          args.orderType,
          args.tableId ?? null,
          args.customerName?.trim() || null,
          args.customerPhone?.trim() || null,
          args.deliveryAddress?.trim() || null,
          subtotal,
          deliveryFee,
          total,
          args.paymentMethod,
          args.notes?.trim() || null,
        ],
      );
      const orderId = orderRes.rows[0].id;

      for (const line of priced) {
        await client.query(
          `INSERT INTO order_items
             (order_id, menu_item_id, quantity, unit_price_fcfa, subtotal_fcfa, notes)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
          [
            orderId,
            line.menuItemId,
            line.quantity,
            line.unitPriceFcfa,
            line.subtotalFcfa,
            line.notes,
          ],
        );
      }

      await client.query(
        `INSERT INTO order_status_history (order_id, status, changed_by)
         VALUES ($1::uuid, 'pending', $2::uuid)`,
        [orderId, user.id],
      );

      if (args.tableId) {
        await client.query(
          `UPDATE restaurant_tables SET status = 'occupied' WHERE id = $1::uuid`,
          [args.tableId],
        );
      }

      await client.query("COMMIT");

      await logAudit(ctx, {
        restaurantId: args.restaurantId,
        userId: user.id,
        action: "order.created",
        targetEntity: `order:${orderId}`,
        metadata: `${orderNumber} total=${total}`,
      });

      return { orderId, orderNumber, totalFcfa: total };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  },
});

/**
 * Public customer order from the QR table menu (no sign-in).
 * Effet domino en une transaction : commande + lignes + historique +
 * table occupée + audit. Le restaurant voit la commande dans le dashboard.
 */
export const createByQr = action({
  args: {
    tableToken: v.string(),
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    notes: v.optional(v.string()),
    items: v.array(
      v.object({ menuItemId: v.string(), quantity: v.number() }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.items.length === 0) throw new Error("Votre panier est vide.");

    const db = getPool();

    // Resolve the table from the QR token (public but strict).
    const tableRes = await db.query<{
      id: string;
      restaurant_id: string;
      status: "free" | "occupied" | "reserved";
    }>(
      `SELECT t.id, t.restaurant_id, t.status
         FROM restaurant_tables t
         JOIN restaurants r ON r.id = t.restaurant_id
        WHERE t.qr_code_token = $1
          AND t.deleted_at IS NULL
          AND r.deleted_at IS NULL
          AND r.is_active
        LIMIT 1`,
      [args.tableToken],
    );
    const table = tableRes.rows[0];
    if (!table) throw new Error("QR Code invalide ou restaurant indisponible.");

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Price server-side from menu_items.
      let subtotal = 0;
      const priced: {
        menuItemId: string;
        quantity: number;
        unitPriceFcfa: number;
        subtotalFcfa: number;
      }[] = [];
      for (const item of args.items) {
        const menuRes = await client.query<{
          id: string;
          price_fcfa: number;
          is_available: boolean;
          deleted_at: Date | null;
          restaurant_id: string;
        }>(
          `SELECT id, price_fcfa, is_available, deleted_at, restaurant_id
             FROM menu_items WHERE id = $1::uuid FOR UPDATE`,
          [item.menuItemId],
        );
        const menuItem = menuRes.rows[0];
        if (
          !menuItem ||
          menuItem.deleted_at ||
          !menuItem.is_available ||
          menuItem.restaurant_id !== table.restaurant_id
        ) {
          throw new Error("Un plat commandé n'est plus disponible.");
        }
        const line = menuItem.price_fcfa;
        subtotal += line * item.quantity;
        priced.push({
          menuItemId: menuItem.id,
          quantity: item.quantity,
          unitPriceFcfa: line,
          subtotalFcfa: line * item.quantity,
        });
      }

      const countRes = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM orders WHERE restaurant_id = $1::uuid`,
        [table.restaurant_id],
      );
      const orderNumber = `CMD-${String(
        Number(countRes.rows[0]?.count ?? "0") + 1,
      ).padStart(4, "0")}`;

      const orderRes = await client.query<{ id: string }>(
        `INSERT INTO orders
           (restaurant_id, order_type, table_id, customer_name, customer_phone,
            status, subtotal_fcfa, delivery_fee_fcfa, total_fcfa,
            payment_method, payment_status, notes)
         VALUES ($1::uuid, 'dine_in', $2::uuid, $3, $4, 'pending',
                 $5, 0, $5, 'cash', 'pending', $6)
         RETURNING id`,
        [
          table.restaurant_id,
          table.id,
          args.customerName.trim(),
          args.customerPhone?.trim() || null,
          subtotal,
          args.notes?.trim() || null,
        ],
      );
      const orderId = orderRes.rows[0].id;

      for (const line of priced) {
        await client.query(
          `INSERT INTO order_items
             (order_id, menu_item_id, quantity, unit_price_fcfa, subtotal_fcfa)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5)`,
          [orderId, line.menuItemId, line.quantity, line.unitPriceFcfa, line.subtotalFcfa],
        );
      }

      await client.query(
        `INSERT INTO order_status_history (order_id, status)
         VALUES ($1::uuid, 'pending')`,
        [orderId],
      );
      await client.query(
        `UPDATE restaurant_tables SET status = 'occupied' WHERE id = $1::uuid`,
        [table.id],
      );

      await client.query("COMMIT");

      await logAudit(ctx, {
        restaurantId: table.restaurant_id,
        action: "order.created_by_qr",
        targetEntity: `order:${orderId}`,
        metadata: `${orderNumber} table (QR) total=${subtotal}`,
      });

      return { orderId, orderNumber, totalFcfa: subtotal };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  },
});

export const setStatus = action({
  args: { orderId: v.string(), status: orderStatusValidator },
  handler: async (ctx, args) => {
    const db = getPool();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const orderRes = await client.query<{ id: string; restaurant_id: string; table_id: string | null }>(
        `SELECT id, restaurant_id, table_id FROM orders WHERE id = $1::uuid FOR UPDATE`,
        [args.orderId],
      );
      const order = orderRes.rows[0];
      if (!order) {
        await client.query("ROLLBACK");
        throw new Error("Commande introuvable.");
      }
      await client.query("COMMIT");

      // Access check outside the write transaction (RLS-equivalent).
      const { user } = await requireRestaurantAccess(ctx, order.restaurant_id);

      await client.query("BEGIN");
      await client.query(
        `UPDATE orders SET status = $2::order_status, updated_at = now()
          WHERE id = $1::uuid`,
        [args.orderId, args.status],
      );
      await client.query(
        `INSERT INTO order_status_history (order_id, status, changed_by)
         VALUES ($1::uuid, $2::order_status, $3::uuid)`,
        [args.orderId, args.status, user.id],
      );
      if (
        (args.status === "cancelled" || args.status === "served") &&
        order.table_id
      ) {
        await client.query(
          `UPDATE restaurant_tables SET status = 'free' WHERE id = $1::uuid`,
          [order.table_id],
        );
      }
      await client.query("COMMIT");

      await logAudit(ctx, {
        restaurantId: order.restaurant_id,
        userId: user.id,
        action: "order.status_changed",
        targetEntity: `order:${args.orderId}`,
        metadata: `commande → ${args.status}`,
      });
      return { ok: true };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  },
});

export const markPaid = action({
  args: { orderId: v.string() },
  handler: async (ctx, args) => {
    const db = getPool();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const orderRes = await client.query<{
        id: string;
        restaurant_id: string;
        total_fcfa: number;
        payment_method: "cash" | "mobile_money";
        payment_status: "pending" | "paid";
      }>(
        `SELECT id, restaurant_id, total_fcfa,
                payment_method::text AS payment_method,
                payment_status::text AS payment_status
           FROM orders WHERE id = $1::uuid FOR UPDATE`,
        [args.orderId],
      );
      const order = orderRes.rows[0];
      if (!order) {
        await client.query("ROLLBACK");
        throw new Error("Commande introuvable.");
      }
      await client.query("COMMIT");

      const { user } = await requireRestaurantAccess(ctx, order.restaurant_id);
      if (order.payment_status === "paid") return { ok: true };

      await client.query("BEGIN");
      await client.query(
        `UPDATE orders SET payment_status = 'paid', updated_at = now()
          WHERE id = $1::uuid`,
        [args.orderId],
      );
      await client.query(
        `INSERT INTO order_payments (order_id, amount_fcfa, method, collected_by)
         VALUES ($1::uuid, $2, $3::payment_method, $4::uuid)`,
        [args.orderId, order.total_fcfa, order.payment_method, user.id],
      );
      await client.query("COMMIT");

      await logAudit(ctx, {
        restaurantId: order.restaurant_id,
        userId: user.id,
        action: "order.payment_collected",
        targetEntity: `order:${args.orderId}`,
        metadata: `${order.total_fcfa} FCFA encaissés`,
      });
      return { ok: true };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  },
});
