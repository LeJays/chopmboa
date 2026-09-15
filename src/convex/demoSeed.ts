"use node";

import { action } from "./_generated/server";
import {
  getPool,
  qrToken,
} from "./db";
import { requireAppUser, logAudit } from "./authz";
import { ensurePlans, planByCode } from "./plans";
import { TRIAL_DAYS } from "../lib/chopmboa";

/* ====================================================================== */
/* ChopMboa — Cameroonian demo data seeder on Neon Postgres               */
/* Chez Maman, Le Petit Sahel, Grill House Douala + menus, tables,        */
/* commandes réalistes réparties sur 7 jours. Idempotent per owner.       */
/* ====================================================================== */

const DEMO_RESTAURANTS: {
  name: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  description: string;
  categories: string[];
  items: {
    name: string;
    price: number;
    description: string;
    category: string;
    prep: number;
  }[];
  tables: number;
}[] = [
  {
    name: "Chez Maman",
    city: "Yaoundé",
    address: "Quartier Nsam, rue 1.234",
    lat: 3.9,
    lng: 11.52,
    description:
      "La cuisine maison de Maman, du ndolé qui sent bon le feu de bois.",
    categories: ["Plats", "Grillades", "Boissons"],
    items: [
      { name: "Ndolé Royal", price: 5000, description: "Ndolé crémeux, crevettes, bœuf et plantains mûrs.", category: "Plats", prep: 15 },
      { name: "Eru & Waterfufu", price: 3500, description: "Eru du Sud-Ouest avec waterfufu frais.", category: "Plats", prep: 12 },
      { name: "Poulet Braisé", price: 4500, description: "Poulet mariné au poivre de Guinée, sauce tomate maison.", category: "Grillades", prep: 20 },
      { name: "Poisson Braisé", price: 6000, description: "Capitaine braisé, attiéké et piment vert.", category: "Grillades", prep: 25 },
      { name: "Frites de Plantain", price: 1000, description: "Plantain mûr doré, sauce piment.", category: "Boissons", prep: 8 },
      { name: "Jus de Foléré", price: 1000, description: "Foléré glacé, gingembre et citron.", category: "Boissons", prep: 3 },
    ],
    tables: 4,
  },
  {
    name: "Le Petit Sahel",
    city: "Yaoundé",
    address: "Bastos, avenue Winston Churchill",
    lat: 3.88,
    lng: 11.51,
    description: "Saveurs du Nord Cameroun : kilishi, riz sahel, bouillie.",
    categories: ["Spécialités", "Riz & Céréales", "Desserts"],
    items: [
      { name: "Riz Sahel Poulet", price: 4000, description: "Riz parfumé, poulet fumé, épices du Nord.", category: "Riz & Céréales", prep: 18 },
      { name: "Kilishi de Bœuf", price: 2500, description: "Viande séchée épicée, servie en fines lamelles.", category: "Spécialités", prep: 5 },
      { name: "Bouillie de Maïs", price: 1500, description: "Bouillie crémeuse, arachide et beurre de karité.", category: "Desserts", prep: 10 },
      { name: "Brochettes Sahel", price: 2000, description: "Brochettes de bœuf, piment et gingembre.", category: "Spécialités", prep: 12 },
    ],
    tables: 3,
  },
  {
    name: "Grill House Douala",
    city: "Douala",
    address: "Bonapriso, rue Joss",
    lat: 4.05,
    lng: 9.7,
    description: "Le royaume du braisé à Douala, viandes mûries et sauces maison.",
    categories: ["Grillades", "Accompagnements", "Boissons"],
    items: [
      { name: "Côte de Bœuf Braisée", price: 7000, description: "Côte mûrie 21 jours, sauce au poivre.", category: "Grillades", prep: 25 },
      { name: "Poulet Braisé", price: 4500, description: "Demi-poulet braisé, miondo et sauce gombo.", category: "Grillades", prep: 20 },
      { name: "Miondo Grillé", price: 1500, description: "Manioc en bâtons grillé, sauce piment.", category: "Accompagnements", prep: 8 },
      { name: "Jus de Bissap", price: 1000, description: "Bissap maison, menthe fraîche.", category: "Boissons", prep: 3 },
    ],
    tables: 5,
  },
];

export const seedForCurrentUser = action({
  args: {},
  handler: async (ctx) => {
    const user = await requireAppUser(ctx);
    const db = getPool();

    // Idempotency: never seed twice for the same owner.
    const existing = await db.query<{ id: string }>(
      `SELECT id FROM restaurants WHERE owner_id = $1::uuid AND deleted_at IS NULL LIMIT 1`,
      [user.id],
    );
    if (existing.rows[0]) return { seeded: false };

    await ensurePlans();

    // PRO plan with 14-day trial — only if the owner has no subscription yet.
    const subRes = await db.query<{ id: string }>(
      `SELECT id FROM subscriptions WHERE owner_id = $1::uuid LIMIT 1`,
      [user.id],
    );
    if (!subRes.rows[0]) {
      const businessPlan = await planByCode("business");
      await db.query(
        `INSERT INTO subscriptions (owner_id, plan_id, status, trial_ends_at, current_period_end)
         VALUES ($1::uuid, $2::uuid, 'trial', now() + interval '14 days', now() + interval '30 days')`,
        [user.id, businessPlan.id],
      );
    }

    const client = await db.connect();
    let seededOrders = 0;
    let seededRevenue = 0;

    try {
      await client.query("BEGIN");

      for (const demo of DEMO_RESTAURANTS) {
        const restRes = await client.query<{ id: string }>(
          `INSERT INTO restaurants
             (owner_id, name, description, address, phone, latitude, longitude, is_active)
           VALUES ($1::uuid, $2, $3, $4, '+237 6 90 00 00 00', $5, $6, true)
           RETURNING id`,
          [
            user.id,
            demo.name,
            demo.description,
            `${demo.address} — ${demo.city}`,
            demo.lat,
            demo.lng,
          ],
        );
        const restaurantId = restRes.rows[0].id;

        await client.query(
          `INSERT INTO restaurant_staff (restaurant_id, user_id, role)
           VALUES ($1::uuid, $2::uuid, 'manager')
           ON CONFLICT (restaurant_id, user_id, role) DO NOTHING`,
          [restaurantId, user.id],
        );

        // Menu categories + items
        const catIds = new Map<string, string>();
        for (let i = 0; i < demo.categories.length; i++) {
          const catRes = await client.query<{ id: string }>(
            `INSERT INTO menu_categories (restaurant_id, name, display_order)
             VALUES ($1::uuid, $2, $3) RETURNING id`,
            [restaurantId, demo.categories[i], i + 1],
          );
          catIds.set(demo.categories[i], catRes.rows[0].id);
        }
        const itemIds: { id: string; price: number }[] = [];
        for (const item of demo.items) {
          const itemRes = await client.query<{ id: string }>(
            `INSERT INTO menu_items
               (restaurant_id, category_id, name, description, price_fcfa, is_available)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, true)
             RETURNING id`,
            [restaurantId, catIds.get(item.category)!, item.name, item.description, item.price],
          );
          itemIds.push({ id: itemRes.rows[0].id, price: item.price });
        }

        // Tables
        for (let t = 1; t <= demo.tables; t++) {
          await client.query(
            `INSERT INTO restaurant_tables
               (restaurant_id, table_number, qr_code_token, capacity, status)
             VALUES ($1::uuid, $2, $3, $4, $5::table_status)`,
            [
              restaurantId,
              `T${t}`,
              qrToken(),
              t === 1 ? 6 : 4,
              t === 1 ? "occupied" : "free",
            ],
          );
        }

        // Orders: a handful spread over the last 7 days
        for (let i = 0; i < 6; i++) {
          const created = new Date(
            Date.now() -
              (i % 7) * 86_400_000 -
              (i % 5) * 3 * 3_600_000,
          );
          const item = itemIds[i % itemIds.length];
          const qty = (i % 3) + 1;
          const subtotal = item.price * qty;
          const isDelivery = i % 3 === 0;
          const deliveryFee = isDelivery ? 1000 : 0;
          const total = subtotal + deliveryFee;
          const status =
            i % 4 === 0
              ? "delivered"
              : i % 4 === 1
                ? "served"
                : i % 4 === 2
                  ? "in_kitchen"
                  : "ready";

          const orderRes = await client.query<{ id: string }>(
            `INSERT INTO orders
               (restaurant_id, order_type, customer_name, customer_phone,
                delivery_address, status, subtotal_fcfa, delivery_fee_fcfa,
                total_fcfa, payment_method, payment_status, created_at, updated_at)
             VALUES ($1::uuid, $2::order_type, $3, $4, $5, $6::order_status,
                     $7, $8, $9, $10::payment_method, $11::payment_status, $12, $12)
             RETURNING id`,
            [
              restaurantId,
              isDelivery ? "delivery" : "dine_in",
              isDelivery ? ["Amina", "Jean", "Fatou", "Paul"][i % 4] : null,
              isDelivery ? "+237 6 77 88 99 00" : null,
              isDelivery ? "Quartier Nlongkak, rue 1.45" : null,
              status,
              subtotal,
              deliveryFee,
              total,
              i % 2 === 0 ? "mobile_money" : "cash",
              status === "in_kitchen" || status === "ready"
                ? "pending"
                : "paid",
              created,
            ],
          );
          const orderId = orderRes.rows[0].id;

          await client.query(
            `INSERT INTO order_items
               (order_id, menu_item_id, quantity, unit_price_fcfa, subtotal_fcfa)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5)`,
            [orderId, item.id, qty, item.price, subtotal],
          );
          await client.query(
            `INSERT INTO order_status_history (order_id, status, changed_by, changed_at)
             VALUES ($1::uuid, $2::order_status, $3::uuid, $4)`,
            [orderId, status, user.id, created],
          );
          if (status !== "in_kitchen" && status !== "ready") {
            await client.query(
              `INSERT INTO order_payments (order_id, amount_fcfa, method, collected_by, collected_at)
               VALUES ($1::uuid, $2, $3::payment_method, $4::uuid, $5)`,
              [orderId, total, i % 2 === 0 ? "mobile_money" : "cash", user.id, created],
            );
          }
          seededOrders += 1;
          seededRevenue += total;
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    await logAudit(ctx, {
      userId: user.id,
      action: "demo.seeded",
      targetEntity: `owner:${user.id}`,
      metadata: `3 restaurants, ${seededOrders} commandes, ${seededRevenue} FCFA`,
    });

    return { seeded: true, restaurants: DEMO_RESTAURANTS.length, orders: seededOrders };
  },
});


