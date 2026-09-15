import type {
  RestaurantRow,
  MenuCategoryRow,
  MenuItemRow,
  TableRow,
  OrderRow,
  AuditLogRow,
} from "@/convex/db";

/* ====================================================================== */
/* ChopMboa — UI types for Neon-backed data + snake_case → camelCase      */
/* mappers. The Convex actions return raw Postgres rows (Dates, strings); */
/* these helpers normalize them for the React components.                 */
/* ====================================================================== */

export interface UIRestaurant {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: number;
}

export interface UIMenuCategory {
  id: string;
  name: string;
  displayOrder: number;
}

export interface UIMenuItem {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  priceFcfa: number;
  isAvailable: boolean;
}

export interface UITable {
  id: string;
  tableNumber: string;
  qrCodeToken: string;
  capacity: number;
  status: "free" | "occupied" | "reserved";
}

export interface UIOrder {
  id: string;
  orderNumber: string;
  orderType: "dine_in" | "delivery";
  status:
    | "pending"
    | "confirmed"
    | "in_kitchen"
    | "ready"
    | "served"
    | "delivered"
    | "cancelled";
  totalFcfa: number;
  paymentMethod: "cash" | "mobile_money";
  paymentStatus: "pending" | "paid";
  customerName: string | null;
  createdAt: number;
}

export interface UIAuditLog {
  id: string;
  action: string;
  metadata: string | null;
  createdAt: number;
}

export interface UIMember {
  id: string;
  role: string;
  fullName: string;
  email: string | null;
  isOwner: boolean;
}

export interface UIKpis {
  revenueTodayFcfa: number;
  ordersToday: number;
  avgTicketFcfa: number;
  activeOrders: number;
  menuCount: number;
  tableCount: number;
  occupiedTables: number;
  revenueSeries: { day: string; totalFcfa: number; orders: number }[];
}

export function mapRestaurant(r: RestaurantRow): UIRestaurant {
  // The Neon schema stores the city inline in `address` ("addr — Ville").
  const rawAddress = r.address ?? "";
  const dashIndex = rawAddress.lastIndexOf(" — ");
  const city =
    dashIndex >= 0 ? rawAddress.slice(dashIndex + 3).trim() : null;
  const address =
    dashIndex >= 0
      ? rawAddress.slice(0, dashIndex).trim()
      : rawAddress.trim() || null;
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    address: address || null,
    city,
    phone: r.phone,
    isActive: r.is_active,
    createdAt: new Date(r.created_at).getTime(),
  };
}

export function mapCategory(c: MenuCategoryRow): UIMenuCategory {
  return { id: c.id, name: c.name, displayOrder: c.display_order };
}

export function mapItem(i: MenuItemRow): UIMenuItem {
  return {
    id: i.id,
    categoryId: i.category_id,
    name: i.name,
    description: i.description,
    priceFcfa: Number(i.price_fcfa),
    isAvailable: i.is_available,
  };
}

export function mapTable(t: TableRow): UITable {
  return {
    id: t.id,
    tableNumber: t.table_number,
    qrCodeToken: t.qr_code_token,
    capacity: Number(t.capacity),
    status: t.status,
  };
}

export function mapOrder(
  o: OrderRow & { order_number?: string | null },
): UIOrder {
  return {
    id: o.id,
    orderNumber: o.order_number || `CMD-${o.id.slice(0, 4).toUpperCase()}`,
    orderType: o.order_type,
    status: o.status,
    totalFcfa: Number(o.total_fcfa),
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    customerName: o.customer_name,
    createdAt: new Date(o.created_at).getTime(),
  };
}

export function mapAudit(l: AuditLogRow): UIAuditLog {
  return {
    id: l.id,
    action: l.action,
    metadata: l.metadata,
    createdAt: new Date(l.created_at).getTime(),
  };
}
