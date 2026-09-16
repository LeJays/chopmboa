/** Shared ChopMboa domain constants, plan limits and formatting helpers. */

export type PlanCode = "free" | "pro" | "business";

export const PLANS: {
  code: PlanCode;
  name: string;
  priceFcfa: number;
  maxRestaurants: number; // -1 = unlimited
  maxTablesPerRestaurant: number; // -1 = unlimited
  deliveryCommissionPct: number;
  features: string[];
  highlight?: boolean;
}[] = [
  {
    code: "free",
    name: "FREE",
    priceFcfa: 0,
    maxRestaurants: 1,
    maxTablesPerRestaurant: 5,
    deliveryCommissionPct: 15,
    features: [
      "1 restaurant",
      "5 tables maximum",
      "3 utilisateurs",
      "Fonctionnalités de base",
    ],
  },
  {
    code: "pro",
    name: "PRO",
    priceFcfa: 10_000,
    maxRestaurants: 3,
    maxTablesPerRestaurant: -1,
    deliveryCommissionPct: 12,
    features: [
      "Jusqu'à 3 restaurants",
      "Tables illimitées",
      "Gestion du stock",
      "Analytics & rapports",
      "Module de livraison",
      "Support prioritaire",
    ],
    highlight: true,
  },
  {
    code: "business",
    name: "BUSINESS",
    priceFcfa: 25_000,
    maxRestaurants: -1,
    maxTablesPerRestaurant: -1,
    deliveryCommissionPct: 10,
    features: [
      "Multi-restaurants illimité",
      "KDS avancé",
      "Accès API",
      "Permissions sur-mesure",
    ],
  },
];

export function planByCode(code: string) {
  return PLANS.find((p) => p.code === code) ?? PLANS[0];
}

/** Trial period in days, per product spec. */
export const TRIAL_DAYS = 14;

export function addDays(ts: number, days: number): number {
  return ts + days * 24 * 60 * 60 * 1000;
}

/** 4 500 FCFA (narrow no-break space thousands separator). */
export function formatFcfa(amount: number): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return "0 FCFA";
  }
  return `${amount.toLocaleString("fr-FR")} FCFA`;
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ------------------------- Order / status labels ------------------------ */

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  in_kitchen: "En préparation",
  ready: "Prête",
  served: "Servie",
  out_for_delivery: "En livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
};

export const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: "Sur place",
  delivery: "Livraison",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  mobile_money: "Mobile Money",
};

export const TABLE_STATUS_LABELS: Record<string, string> = {
  free: "Libre",
  occupied: "Occupée",
  reserved: "Réservée",
};

/** Canonical order progression used for the owner's operations view. */
export const ACTIVE_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "in_kitchen",
  "ready",
  "out_for_delivery",
] as const;

export type ActiveOrderStatus = (typeof ACTIVE_ORDER_STATUSES)[number];

export function isStaffRole(value: string): value is StaffRoleName {
  return ["manager", "kitchen", "cashier", "delivery", "waiter"].includes(
    value,
  );
}

export type StaffRoleName =
  | "manager"
  | "kitchen"
  | "cashier"
  | "delivery"
  | "waiter";

export const STAFF_ROLE_LABELS: Record<StaffRoleName, string> = {
  manager: "Gérant",
  kitchen: "Cuisine",
  cashier: "Caisse",
  delivery: "Livreur",
  waiter: "Serveur",
};
