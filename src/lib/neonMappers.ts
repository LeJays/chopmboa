export interface RestaurantRow {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string | number | Date;
  logo_url?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  landmark?: string | null;
  momo_active?: boolean;
  momo_number?: string | null;
  momo_name?: string | null;
  om_active?: boolean;
  om_number?: string | null;
  om_name?: string | null;
  cash_active?: boolean;
  payment_instructions?: string | null;
}

export interface MenuCategoryRow {
  id: string;
  name: string;
  display_order: number;
}

export interface MenuItemRow {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_fcfa: number | string;
  is_available: boolean;
  image_url?: string | null;
}

export interface TableRow {
  id: string;
  table_number: string;
  qr_code_token: string;
  capacity: number | string;
  status: "free" | "occupied" | "reserved";
}

export interface OrderRow {
  id: string;
  order_number?: string | null;
  order_type: "dine_in" | "delivery";
  status: "pending" | "confirmed" | "in_kitchen" | "ready" | "served" | "delivered" | "cancelled";
  total_fcfa: number | string;
  payment_method: "cash" | "mobile_money";
  payment_status: "pending" | "paid";
  customer_name: string | null;
  created_at: string | number | Date;
}

export interface AuditLogRow {
  id: string;
  action: string;
  metadata: string | null;
  created_at: string | number | Date;
}

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
  logoUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  landmark?: string | null;
  momoActive?: boolean;
  momoNumber?: string | null;
  momoName?: string | null;
  omActive?: boolean;
  omNumber?: string | null;
  omName?: string | null;
  cashActive?: boolean;
  paymentInstructions?: string | null;
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
  imageUrl?: string | null;
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
    logoUrl: r.logo_url || null,
    latitude: r.latitude != null && !isNaN(Number(r.latitude)) ? Number(r.latitude) : null,
    longitude: r.longitude != null && !isNaN(Number(r.longitude)) ? Number(r.longitude) : null,
    landmark: r.landmark || null,
    momoActive: r.momo_active ?? false,
    momoNumber: r.momo_number || null,
    momoName: r.momo_name || null,
    omActive: r.om_active ?? false,
    omNumber: r.om_number || null,
    omName: r.om_name || null,
    cashActive: r.cash_active ?? true,
    paymentInstructions: r.payment_instructions || null,
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
    imageUrl: i.image_url || null,
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
