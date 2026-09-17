import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NoWorkspace, RoleShell } from "@/components/RoleShell";
import { useAuth } from "@/hooks/use-auth";
import { usePollAction } from "@/hooks/use-poll";
import { useStaffContext, type StaffContext } from "@/hooks/use-staff-context";
import { useAction, api } from "@/lib/neon-actions";
import {
  formatFcfa,
  formatTime,
  ORDER_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  type ActiveOrderStatus,
} from "@/lib/chopmboa";
import {
  Bike,
  ChefHat,
  CircleCheck,
  Clock,
  CookingPot,
  Loader2,
  Search,
  Utensils,
  Plus,
  Minus,
  Trash2,
  Coins,
  Percent,
  Receipt,
  CheckCircle2,
  Calculator,
  Check,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { toast } from "sonner";

/* ====================================================================== */
/* ChopMboa — espaces de travail par rôle                                 */
/* Cuisine (KDS) · Caisse (POS) · Salle (serveur) · Livraison (livreur)   */
/* Chaque vue ne montre que ce que le rôle a le droit de faire ; les      */
/* mutations sont de toute façon gardées côté serveur.                    */
/* ====================================================================== */

/** Shape returned by orders.activeWithItems (Postgres row + items). */
interface ActiveOrder {
  id: string;
  order_number: string;
  status: string;
  order_type: "dine_in" | "delivery";
  payment_method: "cash" | "mobile_money";
  payment_status: "pending" | "paid";
  total_fcfa: number;
  customer_name: string | null;
  delivery_address: string | null;
  table_id: string | null;
  // Sérialisé en ISO string par serializable() côté serveur.
  created_at: string | Date;
  items: {
    id: string;
    quantity: number;
    item_name: string;
    menu_item_id: string;
    price_fcfa: number;
    notes: string | null;
  }[];
}

function useRoleGuard() {
  const { context, loading } = useStaffContext();
  if (loading) {
    return {
      node: (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ),
      context: undefined,
    };
  }
  if (!context || !context.primaryRestaurantId) {
    return { node: <NoWorkspace />, context: undefined };
  }
  return { node: null, context };
}

/* ------------------------------- KDS -------------------------------- */

export function KitchenPage() {
  const guard = useRoleGuard();
  if (guard.node) return guard.node;
  return (
    <KitchenView
      restaurantId={guard.context!.primaryRestaurantId!}
      context={guard.context!}
    />
  );
}

export function KitchenView({
  restaurantId,
  context,
  embedded,
}: {
  restaurantId: string;
  context: StaffContext;
  embedded?: boolean;
}) {
  const ordersPoll = usePollAction<ActiveOrder[]>(
    api.orders.activeWithItems,
    { restaurantId },
    10_000,
  );
  const setStatus = useAction(api.orders.setStatus);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const prevCount = useRef<number | null>(null);

  const orders = ordersPoll.data ?? [];
  const newOnes = orders.filter((o) => o.status === "pending" || o.status === "confirmed");
  const cooking = orders.filter((o) => o.status === "in_kitchen");
  const ready = orders.filter((o) => o.status === "ready");

  // Sound + toast on newly arriving orders (pending appears while KDS open).
  useEffect(() => {
    if (prevCount.current !== null && orders.length > prevCount.current) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      } catch {
        /* audio non critique */
      }
      toast("Nouvelle commande reçue !", { icon: "🔔" });
    }
    prevCount.current = orders.length;
  }, [orders.length]);

  const move = async (o: ActiveOrder, status: "in_kitchen" | "ready" | "served") => {
    setPendingId(o.id);
    try {
      await setStatus({ orderId: o.id, status });
      ordersPoll.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action impossible.");
    } finally {
      setPendingId(null);
    }
  };

  const minutesSince = (iso: string | Date) =>
    Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);

  const Urgency = ({ iso }: { iso: string | Date }) => {
    const mins = minutesSince(iso);
    const level = mins >= 15 ? "danger" : mins >= 8 ? "warn" : "ok";
    const color =
      level === "danger"
        ? "bg-red-500/15 text-red-600 dark:text-red-400"
        : level === "warn"
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          : "bg-muted text-muted-foreground";
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}
      >
        <Clock className="size-3" />
        {mins} min
      </span>
    );
  };

  const Column = ({
    title,
    icon,
    list,
    action,
  }: {
    title: string;
    icon: React.ReactNode;
    list: ActiveOrder[];
    action: (o: ActiveOrder) => { label: string; to: "in_kitchen" | "ready" | "served" } | null;
  }) => (
    <div className="flex-1 space-y-3">
      <div className="flex items-center gap-2 px-1">
        {icon}
        <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
        <Badge variant="secondary">{list.length}</Badge>
      </div>
      {list.map((o) => {
        const a = action(o);
        return (
          <Card key={o.id} className="border-border/70 shadow-none">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{o.order_number}</CardTitle>
                <Urgency iso={o.created_at} />
              </div>
              <p className="text-xs text-muted-foreground">
                {ORDER_TYPE_LABELS[o.order_type]}
                {o.customer_name ? ` · ${o.customer_name}` : ""}
                {` · ${formatTime(new Date(o.created_at).getTime())}`}
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              <ul className="space-y-1">
                {(o.items || []).map((it) => (
                  <li key={it.id} className="flex items-start gap-2 text-sm">
                    <span className="font-bold text-primary">{it.quantity}×</span>
                    <span className="flex-1">
                      {it.item_name}
                      {it.notes && (
                        <em className="block text-xs text-muted-foreground">
                          « {it.notes} »
                        </em>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {a && (
                <Button
                  className="w-full"
                  size="sm"
                  disabled={pendingId === o.id}
                  onClick={() => void move(o, a.to)}
                >
                  {pendingId === o.id && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  {a.label}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
      {list.length === 0 && (
        <p className="px-1 text-sm text-muted-foreground">Rien ici.</p>
      )}
    </div>
  );

  const inner = (
    <div className="flex flex-col gap-6 lg:flex-row">
      <Column
        title="Nouvelles"
        icon={<ChefHat className="size-4 text-primary" />}
        list={newOnes}
        action={() => ({ label: "Commencer la préparation", to: "in_kitchen" })}
      />
      <Column
        title="En préparation"
        icon={<CookingPot className="size-4 text-primary" />}
        list={cooking}
        action={() => ({ label: "Marquer prête", to: "ready" })}
      />
      <Column
        title="Prêtes"
        icon={<CircleCheck className="size-4 text-emerald-600" />}
        list={ready}
        action={() => ({ label: "Servie / récupérée", to: "served" })}
      />
    </div>
  );

  if (embedded) return inner;

  return (
    <RoleShell context={context} title="Cuisine — écran de préparation" icon={<CookingPot className="size-3.5" />}>
      {inner}
    </RoleShell>
  );
}

/* ------------------------------- POS -------------------------------- */

export function PosPage() {
  const guard = useRoleGuard();
  if (guard.node) return guard.node;
  return (
    <PosView
      restaurantId={guard.context!.primaryRestaurantId!}
      context={guard.context!}
    />
  );
}

export function PosView({
  restaurantId,
  context,
  embedded,
}: {
  restaurantId: string;
  context: StaffContext;
  embedded?: boolean;
}) {
  // 1. Data polls
  const ordersPoll = usePollAction<ActiveOrder[]>(
    api.orders.activeWithItems,
    { restaurantId },
    10_000,
  );
  
  const menuPoll = usePollAction<any[]>(
    api.menu.listItems,
    restaurantId ? { restaurantId } : null,
  );
  
  const categoriesPoll = usePollAction<any[]>(
    api.menu.listCategories,
    restaurantId ? { restaurantId } : null,
  );
  
  const tablesPoll = usePollAction<any[]>(
    api.tables.list,
    restaurantId ? { restaurantId } : null,
  );

  // 2. Mutations
  const markPaid = useAction(api.orders.markPaid);
  const setStatus = useAction(api.orders.setStatus);
  const createOrderAction = useAction(api.orders.create);

  // 3. UI States
  const [posMode, setPosMode] = useState<"terminal" | "tickets">("terminal");
  const [cart, setCart] = useState<Record<string, { id: string; name: string; price_fcfa: number; quantity: number }>>({});
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [productSearch, setProductSearch] = useState("");
  const [ticketSearch, setTicketSearch] = useState("");
  
  // Checkout info
  const [orderType, setOrderType] = useState<"dine_in" | "delivery">("dine_in");
  const [tableId, setTableId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mobile_money">("cash");
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [cashReceived, setCashReceived] = useState<string>("");
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Track if we are editing/paying an existing order
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingOrderNumber, setEditingOrderNumber] = useState<string | null>(null);

  // Thank you overlay after payment
  const [thankYouData, setThankYouData] = useState<{ orderNumber: string; amount: number } | null>(null);

  // 4. Data processing
  const orders = ordersPoll.data ?? [];
  const menuItems = menuPoll.data ?? [];
  const categories = categoriesPoll.data ?? [];
  const tables = tablesPoll.data ?? [];

  // Filter products by category and search query
  const filteredProducts = useMemo(() => {
    return menuItems.filter((item) => {
      const matchCat = selectedCategoryId === "all" || item.category_id === selectedCategoryId;
      const matchSearch = item.name.toLowerCase().includes(productSearch.toLowerCase()) || 
                          (item.description ?? "").toLowerCase().includes(productSearch.toLowerCase());
      return matchCat && matchSearch && item.is_available;
    });
  }, [menuItems, selectedCategoryId, productSearch]);

  // Filter existing active orders
  const filteredTickets = useMemo(() => {
    return orders.filter((o) => {
      if (!ticketSearch.trim()) return true;
      return (
        o.order_number.toLowerCase().includes(ticketSearch.toLowerCase()) ||
        (o.customer_name ?? "").toLowerCase().includes(ticketSearch.toLowerCase())
      );
    });
  }, [orders, ticketSearch]);

  const toCollectCount = orders.filter((o) => o.payment_status === "pending").length;

  // 5. Cart actions
  const addToCart = (item: any) => {
    if (editingOrderId) {
      toast.warn("Vous êtes en train d'encaisser un ticket existant. Annulez ou complétez-le d'abord pour créer une nouvelle vente.");
      return;
    }
    setCart((prev) => {
      const existing = prev[item.id];
      return {
        ...prev,
        [item.id]: {
          id: item.id,
          name: item.name,
          price_fcfa: Number(item.price_fcfa),
          quantity: existing ? existing.quantity + 1 : 1,
        },
      };
    });
  };

  const updateQty = (id: string, delta: number) => {
    if (editingOrderId) {
      toast.warn("Les quantités d'une commande existante ne peuvent pas être modifiées directement lors de l'encaissement.");
      return;
    }
    setCart((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return {
        ...prev,
        [id]: { ...existing, quantity: nextQty },
      };
    });
  };

  const removeFromCart = (id: string) => {
    if (editingOrderId) {
      toast.warn("Vous ne pouvez pas retirer d'articles d'un ticket déjà enregistré.");
      return;
    }
    setCart((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const clearCart = () => {
    setCart({});
    setDiscountPercent(0);
    setCashReceived("");
    setCustomerName("");
    setTableId("");
    setEditingOrderId(null);
    setEditingOrderNumber(null);
  };

  // Pre-fill / Load a ticket
  const loadTicketToCart = (o: ActiveOrder) => {
    const newCart: Record<string, { id: string; name: string; price_fcfa: number; quantity: number }> = {};
    (o.items || []).forEach((it) => {
      newCart[it.menu_item_id] = {
        id: it.menu_item_id,
        name: it.item_name,
        price_fcfa: Number(it.price_fcfa || 0),
        quantity: it.quantity,
      };
    });
    setCart(newCart);
    setOrderType(o.order_type);
    setTableId(o.table_id || "");
    setCustomerName(o.customer_name || "");
    setPaymentMethod(o.payment_method || "cash");
    setEditingOrderId(o.id);
    setEditingOrderNumber(o.order_number);
    toast.info(`Commande ${o.order_number} chargée dans le ticket courant.`);
  };

  // Cart totals
  const subtotal = useMemo(() => {
    return Object.values(cart).reduce((sum, item) => sum + item.price_fcfa * item.quantity, 0);
  }, [cart]);

  const discountAmount = useMemo(() => {
    return Math.round((subtotal * discountPercent) / 100);
  }, [subtotal, discountPercent]);

  const totalToPay = subtotal - discountAmount;

  const changeDue = useMemo(() => {
    const received = Number(cashReceived);
    if (!received || received < totalToPay) return 0;
    return received - totalToPay;
  }, [cashReceived, totalToPay]);

  // 6. Submit handler (Create new order + pay)
  const handleCheckout = async () => {
    const cartLines = Object.values(cart);
    if (cartLines.length === 0) {
      toast.error("Votre panier est vide.");
      return;
    }
    if (orderType === "dine_in" && !tableId) {
      toast.error("Veuillez sélectionner une table.");
      return;
    }

    setCheckoutPending(true);
    try {
      if (editingOrderId) {
        // Encaisser la commande existante préremplie
        await markPaid({ orderId: editingOrderId });
        setThankYouData({ orderNumber: editingOrderNumber ?? "", amount: totalToPay });
      } else {
        // Créer une nouvelle vente
        const orderRes = await createOrderAction({
          restaurantId,
          orderType,
          tableId: orderType === "dine_in" ? tableId : undefined,
          customerName: customerName.trim() || undefined,
          paymentMethod,
          items: cartLines.map((line) => ({
            menuItemId: line.id,
            quantity: line.quantity,
          })),
        });

        // Marquer payé
        await markPaid({ orderId: orderRes.id });
        setThankYouData({ orderNumber: orderRes.orderNumber ?? orderRes.order_number ?? "", amount: totalToPay });
      }
      
      clearCart();
      ordersPoll.refresh();
      setPosMode("terminal");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'encaissement.");
    } finally {
      setCheckoutPending(false);
    }
  };

  // Action: Pay an existing ticket directly
  const collect = async (o: ActiveOrder) => {
    setPendingId(o.id);
    try {
      await markPaid({ orderId: o.id });
      setThankYouData({ orderNumber: o.order_number, amount: o.total_fcfa });
      ordersPoll.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Encaissement impossible.");
    } finally {
      setPendingId(null);
    }
  };

  const inner = (
    <div className="space-y-4">
      {/* Thank-you overlay après encaissement */}
      {thankYouData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
             onClick={() => setThankYouData(null)}>
          <div
            className="relative w-full max-w-sm rounded-3xl bg-card border border-border shadow-2xl p-8 text-center space-y-4 animate-in zoom-in-90 fade-in duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Confetti emoji ring */}
            <div className="flex justify-center">
              <div className="size-20 rounded-full bg-emerald-100 border-4 border-emerald-300 flex items-center justify-center text-4xl shadow-inner">
                🎉
              </div>
            </div>
            <div className="space-y-1">
              <h2 className="text-2xl font-black text-foreground">Merci !</h2>
              <p className="text-sm text-muted-foreground font-medium">
                Paiement confirmé avec succès
              </p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 space-y-1">
              <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wider">Montant encaissé</p>
              <p className="text-3xl font-black text-emerald-700">{formatFcfa(thankYouData.amount)}</p>
              {thankYouData.orderNumber && (
                <p className="text-xs text-emerald-600">Ticket : {thankYouData.orderNumber}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground italic">
              Bonne dégustation et à très bientôt ! 🍽️
            </p>
            <Button
              className="w-full h-11 font-bold rounded-xl"
              onClick={() => setThankYouData(null)}
            >
              <Check className="size-4 mr-2" />
              Nouvelle vente
            </Button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left column (8 cols): Switcher and Active view */}
        <div className="lg:col-span-8 space-y-4">
          {/* Tab Selectors */}
          <div className="flex border-b border-border/70">
            <button
              onClick={() => setPosMode("terminal")}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
                posMode === "terminal"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Receipt className="size-4" />
              Tactile / Nouvelle Vente
            </button>
            <button
              onClick={() => setPosMode("tickets")}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
                posMode === "tickets"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Coins className="size-4" />
              Factures & Tickets en Attente
              {toCollectCount > 0 && (
                <Badge className="bg-rose-500 hover:bg-rose-600 text-white size-5 flex items-center justify-center p-0 text-[10px] rounded-full">
                  {toCollectCount}
                </Badge>
              )}
            </button>
          </div>

          {posMode === "terminal" ? (
            /* ================= TERMINAL MODE CATALOG ================= */
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Category selector pills */}
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  <Button
                    variant={selectedCategoryId === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategoryId("all")}
                    className="rounded-full text-xs"
                  >
                    Tous
                  </Button>
                  {categories.map((cat) => (
                    <Button
                      key={cat.id}
                      variant={selectedCategoryId === cat.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className="rounded-full text-xs"
                    >
                      {cat.name}
                    </Button>
                  ))}
                </div>

                {/* Product search */}
                <div className="relative min-w-48 sm:max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Rechercher un plat…"
                    className="pl-9 h-9"
                  />
                </div>
              </div>

              {/* Products grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {filteredProducts.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-3 hover:border-primary/50 hover:bg-primary/5 cursor-pointer select-none transition-all duration-200"
                  >
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {categories.find((c) => c.id === item.category_id)?.name || "Plat"}
                      </span>
                      <h4 className="font-semibold text-sm leading-snug group-hover:text-primary transition-colors">
                        {item.name}
                      </h4>
                      {item.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs font-bold text-primary">
                        {formatFcfa(Number(item.price_fcfa))}
                      </span>
                      <span className="opacity-0 group-hover:opacity-100 size-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold transition-opacity">
                        +
                      </span>
                    </div>
                  </div>
                ))}

                {filteredProducts.length === 0 && (
                  <div className="col-span-full py-16 text-center text-muted-foreground">
                    Aucun produit trouvé dans cette sélection.
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ================= TICKETS IN WAITING MODE ================= */
            <div className="space-y-4">
              <div className="mb-4 max-w-sm relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  value={ticketSearch}
                  onChange={(e) => setTicketSearch(e.target.value)}
                  placeholder="Rechercher un numéro ou un client…"
                  className="pl-9 shadow-none"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {filteredTickets.map((o) => (
                  <Card 
                    key={o.id} 
                    className={`border-border/70 shadow-none transition-all cursor-pointer ${
                      editingOrderId === o.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/30"
                    }`}
                    onClick={() => loadTicketToCart(o)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                          <Receipt className="size-4 text-primary" />
                          {o.order_number}
                        </CardTitle>
                        <Badge variant={o.payment_status === "paid" ? "secondary" : "destructive"} className="text-[10px]">
                          {o.payment_status === "paid" ? "Payée" : "À encaisser"}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {ORDER_TYPE_LABELS[o.order_type]} ·{" "}
                        {PAYMENT_METHOD_LABELS[o.payment_method]} ·{" "}
                        {formatTime(new Date(o.created_at).getTime())}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="bg-secondary/25 p-2.5 rounded border border-border/40 space-y-1">
                        {o.customer_name && (
                          <p className="font-semibold text-[11px] text-muted-foreground">Client : <span className="text-foreground">{o.customer_name}</span></p>
                        )}
                        <ul className="space-y-0.5 text-[11px]">
                          {(o.items || []).map((it) => (
                            <li key={it.id} className="flex justify-between gap-2">
                              <span>
                                <span className="font-semibold text-primary">{it.quantity}×</span>{" "}
                                {it.item_name}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-muted-foreground">Total à régler</span>
                        <span className="text-sm font-extrabold text-primary">
                          {formatFcfa(o.total_fcfa)}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1 font-bold shadow-none cursor-pointer text-xs"
                          size="sm"
                          variant={editingOrderId === o.id ? "secondary" : "outline"}
                          onClick={(e) => {
                            e.stopPropagation();
                            loadTicketToCart(o);
                          }}
                        >
                          {editingOrderId === o.id ? "👉 Ticket en cours" : "Charger sur la caisse"}
                        </Button>
                        {o.payment_status === "pending" && (
                          <Button
                            className="flex-1 font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-none cursor-pointer text-xs"
                            size="sm"
                            disabled={pendingId === o.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void collect(o);
                            }}
                          >
                            {pendingId === o.id ? (
                              <Loader2 className="mr-1 size-3.5 animate-spin" />
                            ) : (
                              "Payer Direct"
                            )}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {toCollectCount === 0 && filteredTickets.length === 0 && (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Aucune facture ou commande en attente de règlement.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right column (4 cols): Persistent Receipt & Checkout Panel */}
        <div className="lg:col-span-4">
          <Card className="border-border bg-card/40 shadow-none sticky top-4 overflow-hidden">
            {/* Receipt thermal header */}
            <div className="bg-primary/5 border-b border-border/70 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="size-4 text-primary" />
                <span className="font-extrabold text-xs tracking-wider uppercase">
                  {editingOrderNumber ? `FACTURE : ${editingOrderNumber}` : "TICKET COURANT"}
                </span>
              </div>
              {(Object.keys(cart).length > 0 || editingOrderId) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearCart}
                  className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 h-8 cursor-pointer"
                >
                  Nouveau
                </Button>
              )}
            </div>

            <CardContent className="p-4 space-y-4">
              {editingOrderNumber && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-2.5 text-xs flex flex-col gap-1">
                  <span className="font-bold">⚠️ Mode Règlement Facture</span>
                  <span>Les informations d'origine de cette commande ont été chargées.</span>
                </div>
              )}

              {/* Meta Selectors (Dine In / Delivery) */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-1 bg-secondary/50 p-1 rounded-lg">
                  <button
                    onClick={() => !editingOrderId && setOrderType("dine_in")}
                    disabled={!!editingOrderId}
                    className={`text-xs py-1.5 px-3 rounded-md font-medium transition-all ${
                      editingOrderId ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                    } ${
                      orderType === "dine_in"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🍔 Sur place
                  </button>
                  <button
                    onClick={() => !editingOrderId && setOrderType("delivery")}
                    disabled={!!editingOrderId}
                    className={`text-xs py-1.5 px-3 rounded-md font-medium transition-all ${
                      editingOrderId ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                    } ${
                      orderType === "delivery"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    🛵 À emporter / Livrer
                  </button>
                </div>

                {orderType === "dine_in" ? (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Sélection de table</label>
                    <select
                      value={tableId}
                      onChange={(e) => !editingOrderId && setTableId(e.target.value)}
                      disabled={!!editingOrderId}
                      className={`w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                        editingOrderId ? "opacity-60 cursor-not-allowed" : ""
                      }`}
                    >
                      <option value="">-- Choisir une table --</option>
                      {tables.map((t) => (
                        <option key={t.id} value={t.id}>
                          Table {t.table_number} (Status: {t.status === "occupied" ? "Occupée" : "Libre"})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Nom Client / Référence</label>
                    <Input
                      value={customerName}
                      onChange={(e) => !editingOrderId && setCustomerName(e.target.value)}
                      disabled={!!editingOrderId}
                      placeholder="Ex: James, Commande emporter…"
                      className={`h-9 shadow-none ${editingOrderId ? "opacity-60 cursor-not-allowed" : ""}`}
                    />
                  </div>
                )}
              </div>

              {/* Cart Lines */}
              <div className="border-t border-dashed border-border/80 pt-3">
                <span className="text-[10px] font-bold uppercase text-muted-foreground block mb-2">Articles commandés</span>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {Object.values(cart).map((line) => (
                    <div key={line.id} className="flex items-center justify-between gap-2 text-sm bg-secondary/20 p-2 rounded-lg border border-border/40">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-xs">{line.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatFcfa(line.price_fcfa)} / u
                        </p>
                      </div>
                      
                      {/* +/- qty adjustments */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => !editingOrderId && updateQty(line.id, -1)}
                          disabled={!!editingOrderId}
                          className={`size-6 bg-background border border-border text-foreground hover:bg-secondary rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                            editingOrderId ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                          }`}
                        >
                          <Minus className="size-3" />
                        </button>
                        <span className="w-5 text-center font-bold text-xs">{line.quantity}</span>
                        <button
                          onClick={() => !editingOrderId && updateQty(line.id, 1)}
                          disabled={!!editingOrderId}
                          className={`size-6 bg-background border border-border text-foreground hover:bg-secondary rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                            editingOrderId ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                          }`}
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>

                      {/* Line total & remove */}
                      <div className="text-right min-w-16">
                        <p className="font-bold text-xs">{formatFcfa(line.price_fcfa * line.quantity)}</p>
                      </div>
                      <button
                        onClick={() => !editingOrderId && removeFromCart(line.id)}
                        disabled={!!editingOrderId}
                        className={`text-muted-foreground hover:text-rose-500 p-1 ${
                          editingOrderId ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                        }`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}

                  {Object.keys(cart).length === 0 && (
                    <p className="text-xs text-muted-foreground py-6 text-center border border-dashed rounded-lg bg-background/30">
                      Aucun plat sélectionné. Sélectionnez une table ou cliquez sur un produit du catalogue.
                    </p>
                  )}
                </div>
              </div>

              {/* Subtotals & Discounts & Cash-return logic */}
              {Object.keys(cart).length > 0 && (
                <div className="border-t border-dashed border-border/80 pt-3 space-y-2.5 text-xs">
                  {/* Subtotal */}
                  <div className="flex justify-between font-medium">
                    <span className="text-muted-foreground">Sous-total</span>
                    <span>{formatFcfa(subtotal)}</span>
                  </div>

                  {/* Discount Slider & Presets */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Percent className="size-3 text-primary" /> Remise
                      </span>
                      <span className="font-bold text-primary">{discountPercent}%</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {[0, 5, 10, 15, 20].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setDiscountPercent(pct)}
                          className={`py-1 text-[10px] rounded border font-semibold transition-all cursor-pointer ${
                            discountPercent === pct
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-border hover:bg-secondary"
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Final Net Total */}
                  <div className="flex justify-between items-center bg-primary/5 p-2 rounded-lg border border-primary/20 text-sm font-bold">
                    <span className="text-foreground">Net à payer</span>
                    <span className="text-primary text-base font-extrabold">{formatFcfa(totalToPay)}</span>
                  </div>

                  {/* Cash register rendering: "Montant reçu" and "Rendu" */}
                  <div className="bg-secondary/40 p-2.5 rounded-lg border border-border/60 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Coins className="size-3 text-emerald-600" /> Espèces Reçues (F)
                      </span>
                      <Input
                        type="number"
                        value={cashReceived}
                        onChange={(e) => setCashReceived(e.target.value)}
                        placeholder="Ex: 5000"
                        className="w-24 h-7 text-right text-xs font-bold bg-background shadow-none"
                      />
                    </div>

                    {/* Cash suggestion presets */}
                    <div className="grid grid-cols-4 gap-1">
                      {[1000, 2000, 5000, 10000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setCashReceived(String(amt))}
                          className="py-1 text-[9px] rounded border border-border bg-background hover:bg-secondary text-foreground font-semibold cursor-pointer"
                        >
                          {amt} F
                        </button>
                      ))}
                    </div>

                    {/* Change return output */}
                    {Number(cashReceived) > 0 && (
                      <div className="flex justify-between items-center border-t border-border/50 pt-1.5 mt-1">
                        <span className="font-semibold text-[10px] text-muted-foreground uppercase">Rendu de monnaie :</span>
                        <span className={`font-extrabold text-xs ${changeDue >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                          {changeDue >= 0 ? formatFcfa(changeDue) : "Montant insuffisant"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Payment Method Selector */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground block">Mode de paiement</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("cash")}
                        className={`flex items-center justify-center gap-1.5 h-9 rounded-lg border font-semibold transition-all cursor-pointer ${
                          paymentMethod === "cash"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                            : "bg-background border-border hover:bg-secondary"
                        }`}
                      >
                        💸 Espèces
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("mobile_money")}
                        className={`flex items-center justify-center gap-1.5 h-9 rounded-lg border font-semibold transition-all cursor-pointer ${
                          paymentMethod === "mobile_money"
                            ? "bg-blue-50 text-blue-700 border-blue-300"
                            : "bg-background border-border hover:bg-secondary"
                        }`}
                      >
                        📱 Mobile Money
                      </button>
                    </div>
                  </div>

                  {/* Action Button */}
                  <Button
                    onClick={handleCheckout}
                    disabled={checkoutPending || Object.keys(cart).length === 0}
                    className="w-full h-11 text-sm font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-md rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
                  >
                    {checkoutPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    {editingOrderNumber ? `Confirmer Encaissement` : "Valider & Encaisser Vente"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  if (embedded) return inner;

  return (
    <RoleShell context={context} title="Caisse / Terminal de Vente (POS)" icon={<Search className="size-3.5" />}>
      {inner}
    </RoleShell>
  );
}

/* ------------------------------ Serveur ------------------------------ */

export function WaiterPage() {
  const guard = useRoleGuard();
  if (guard.node) return guard.node;
  return (
    <WaiterView
      restaurantId={guard.context!.primaryRestaurantId!}
      context={guard.context!}
    />
  );
}

export function WaiterView({
  restaurantId,
  context,
  embedded,
}: {
  restaurantId: string;
  context: StaffContext;
  embedded?: boolean;
}) {
  const ordersPoll = usePollAction<ActiveOrder[]>(
    api.orders.activeWithItems,
    { restaurantId },
    6_000,
  );
  const setStatus = useAction(api.orders.setStatus);
  const claimOrder = useAction(api.orders.claimOrder);
  const unclaimOrder = useAction(api.orders.unclaimOrder);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const prevReadyIds = useRef<Set<string>>(new Set());

  // Patches optimistes sur les commandes (appliqués immédiatement sans attendre le poll)
  const [localPatches, setLocalPatches] = useState<Record<string, Partial<ActiveOrder & { waiter_id: string | null; waiter_name: string | null; waiter_avatar: string | null }>>>({});

  // userId courant du serveur (pour savoir si la commande lui appartient)
  const myUserId = context.userId;

  // Fusionner les données du poll avec les patches locaux
  const rawOrders = ordersPoll.data ?? [];
  const orders = rawOrders
    .map((o) => ({ ...o, ...(localPatches[o.id] ?? {}) }))
    .filter((o) => !["served", "delivered", "cancelled"].includes(o.status));

  // Quand le poll revient, supprimer les patches (le vrai data prime)
  useEffect(() => {
    if (rawOrders.length > 0) {
      setLocalPatches({});
    }
  }, [rawOrders]);

  // Alerte sonore + toast quand une commande passe à "ready" et m'appartient
  useEffect(() => {
    const readyMine = orders.filter(
      (o) => o.status === "ready" && (o as any).waiter_id === myUserId,
    );
    readyMine.forEach((o) => {
      if (!prevReadyIds.current.has(o.id)) {
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 1047;
          gain.gain.setValueAtTime(0.2, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
          osc.start();
          osc.stop(ctx.currentTime + 0.8);
        } catch { /* audio non critique */ }
        toast(`🍽️ ${o.order_number} est prête — à servir !`, {
          description: (o as any).table_number ? `Table ${(o as any).table_number}` : o.customer_name ?? "",
          duration: 8000,
        });
      }
    });
    prevReadyIds.current = new Set(readyMine.map((o) => o.id));
  }, [orders, myUserId]);

  const claim = async (o: ActiveOrder) => {
    setPendingId(o.id);
    // Patch optimiste immédiat : afficher "Ma commande" sans attendre le poll
    setLocalPatches((prev) => ({
      ...prev,
      [o.id]: {
        waiter_id: myUserId,
        waiter_name: context.fullName,
        waiter_avatar: null,
      } as any,
    }));
    try {
      const res = await claimOrder({ orderId: o.id }) as any;
      // Mettre à jour le patch avec les vraies données retournées par le serveur
      setLocalPatches((prev) => ({
        ...prev,
        [o.id]: {
          waiter_id: res.waiter_id ?? myUserId,
          waiter_name: res.waiter_name ?? context.fullName,
          waiter_avatar: res.waiter_avatar ?? null,
        } as any,
      }));
      toast.success(`${o.order_number} — prise en charge !`);
      ordersPoll.refresh();
    } catch (err) {
      // Annuler le patch optimiste en cas d'erreur
      setLocalPatches((prev) => {
        const next = { ...prev };
        delete next[o.id];
        return next;
      });
      toast.error(err instanceof Error ? err.message : "Action impossible.");
    } finally {
      setPendingId(null);
    }
  };

  const unclaim = async (o: ActiveOrder) => {
    setPendingId(o.id);
    // Patch optimiste immédiat
    setLocalPatches((prev) => ({
      ...prev,
      [o.id]: { waiter_id: null, waiter_name: null, waiter_avatar: null } as any,
    }));
    try {
      await unclaimOrder({ orderId: o.id });
      ordersPoll.refresh();
    } catch (err) {
      setLocalPatches((prev) => {
        const next = { ...prev };
        delete next[o.id];
        return next;
      });
      toast.error(err instanceof Error ? err.message : "Action impossible.");
    } finally {
      setPendingId(null);
    }
  };

  const serve = async (o: ActiveOrder) => {
    setPendingId(o.id);
    try {
      await setStatus({ orderId: o.id, status: "served" });
      toast.success(`${o.order_number} servie. Bon appétit !`);
      ordersPoll.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action impossible.");
    } finally {
      setPendingId(null);
    }
  };

  const mine = orders.filter((o) => (o as any).waiter_id === myUserId);
  const others = orders.filter((o) => (o as any).waiter_id !== myUserId);

  const WaiterOrderCard = ({ o }: { o: ActiveOrder }) => {
    const isMe = (o as any).waiter_id === myUserId;
    const isClaimed = !!(o as any).waiter_id;
    const tableNumber = (o as any).table_number as string | null;
    const waiterName = (o as any).waiter_name as string | null;
    const waiterAvatar = (o as any).waiter_avatar as string | null;
    const isPending = pendingId === o.id;

    return (
      <Card
        className={`shadow-none transition-all ${
          isMe && o.status === "ready"
            ? "border-emerald-400 ring-2 ring-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/20"
            : isMe
            ? "border-primary/50 bg-primary/5"
            : "border-border/70"
        }`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CardTitle className="text-base shrink-0">{o.order_number}</CardTitle>
              {tableNumber && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  Table {tableNumber}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {isMe && (
                <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px]">
                  Ma commande
                </Badge>
              )}
              <StatusPill status={o.status} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {ORDER_TYPE_LABELS[o.order_type]}
            {o.customer_name ? ` · ${o.customer_name}` : ""}
          </p>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Articles */}
          <ul className="space-y-1 text-sm">
            {(o.items || []).map((it) => (
              <li key={it.id}>
                <span className="font-semibold text-primary">{it.quantity}×</span>{" "}
                {it.item_name}
              </li>
            ))}
          </ul>

          {/* Waiter assigné (autre que moi) */}
          {isClaimed && !isMe && waiterName && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground border border-border/50">
              {waiterAvatar ? (
                <img src={waiterAvatar} alt={waiterName} className="size-5 rounded-full object-cover shrink-0" />
              ) : (
                <div className="size-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-primary">{waiterName[0]}</span>
                </div>
              )}
              <span>Pris par <strong>{waiterName}</strong></span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {!isClaimed && (
              <Button
                className="flex-1"
                size="sm"
                disabled={isPending}
                onClick={() => void claim(o)}
              >
                {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Prendre en charge
              </Button>
            )}

            {isMe && o.status !== "ready" && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-muted-foreground"
                disabled={isPending}
                onClick={() => void unclaim(o)}
              >
                Relâcher
              </Button>
            )}

            {isMe && o.status === "ready" && (
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                size="sm"
                disabled={isPending}
                onClick={() => void serve(o)}
              >
                {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                ✓ Servir à la table
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const inner = (
    <div className="space-y-6">
      {/* Mes commandes */}
      {mine.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-bold uppercase tracking-wide text-primary">
            <Utensils className="size-4" />
            Mes commandes
            <Badge className="bg-primary/15 text-primary border-primary/30">{mine.length}</Badge>
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {mine.map((o) => <WaiterOrderCard key={o.id} o={o} />)}
          </div>
        </section>
      )}

      {/* Commandes libres ou prises par d'autres */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          <CircleCheck className="size-4" />
          Toutes les commandes
          <Badge variant="secondary">{others.length}</Badge>
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {others.map((o) => <WaiterOrderCard key={o.id} o={o} />)}
        </div>
        {others.length === 0 && mine.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Aucune commande en cours. Les commandes des tables apparaissent ici automatiquement.
          </p>
        )}
        {others.length === 0 && mine.length > 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Toutes les commandes sont déjà prises en charge.
          </p>
        )}
      </section>
    </div>
  );

  if (embedded) return inner;

  return (
    <RoleShell context={context} title="Salle — suivi des tables" icon={<Utensils className="size-3.5" />}>
      {inner}
    </RoleShell>
  );
}

/* ----------------------------- Livreur ------------------------------- */

export function DeliveriesPage() {
  const guard = useRoleGuard();
  if (guard.node) return guard.node;
  return (
    <DeliveriesView
      restaurantId={guard.context!.primaryRestaurantId!}
      context={guard.context!}
    />
  );
}

export function DeliveriesView({
  restaurantId,
  context,
  embedded,
}: {
  restaurantId: string;
  context: StaffContext;
  embedded?: boolean;
}) {
  const ordersPoll = usePollAction<ActiveOrder[]>(
    api.orders.activeWithItems,
    { restaurantId },
    10_000,
  );
  const setStatus = useAction(api.orders.setStatus);
  const updateLocation = useAction(api.delivery.updateLocation);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "active" | "denied">("idle");
  const watchIdRef = useRef<number | null>(null);

  const orders = useMemo(
    () => (ordersPoll.data ?? []).filter((o) => o.order_type === "delivery"),
    [ordersPoll.data],
  );
  const toPick = orders.filter((o) => o.status === "ready");
  const enRoute = orders.filter((o) => o.status === "out_for_delivery");

  // ── Partage GPS automatique ──────────────────────────────────────────────
  const sendLocation = useCallback(
    (pos: GeolocationPosition) => {
      void updateLocation({
        restaurantId,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      }).catch(() => { /* silencieux */ });
    },
    [restaurantId, updateLocation],
  );

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus("denied");
      return;
    }
    // Envoi initial immédiat
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsStatus("active");
        sendLocation(pos);
      },
      () => setGpsStatus("denied"),
    );
    // Suivi continu (toutes les 30 s)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsStatus("active");
        sendLocation(pos);
      },
      () => setGpsStatus("denied"),
      { maximumAge: 30_000, timeout: 10_000, enableHighAccuracy: false },
    );
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [sendLocation]);

  const move = async (o: ActiveOrder, status: "out_for_delivery" | "delivered") => {
    setPendingId(o.id);
    try {
      await setStatus({ orderId: o.id, status });
      ordersPoll.refresh();
      if (status === "delivered") toast.success(`${o.order_number} livrée !`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action impossible.");
    } finally {
      setPendingId(null);
    }
  };

  const inner = (
    <div className="space-y-6">
      {/* Bandeau GPS */}
      <div
        className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${
          gpsStatus === "active"
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
            : gpsStatus === "denied"
              ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
              : "bg-muted text-muted-foreground"
        }`}
      >
        <span className="text-base">
          {gpsStatus === "active" ? "📡" : gpsStatus === "denied" ? "❌" : "⏳"}
        </span>
        {gpsStatus === "active" && "Position partagée avec le restaurant"}
        {gpsStatus === "denied" && "GPS refusé — activez la localisation pour être visible"}
        {gpsStatus === "idle" && "Demande de localisation en cours…"}
      </div>

      {/* Section À récupérer */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">
          <Utensils className="size-4" /> À récupérer au restaurant
          <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
            {toPick.length}
          </Badge>
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {toPick.map((o) => (
            <DeliveryCard
              key={o.id}
              o={o}
              pending={pendingId === o.id}
              action={{ label: "Récupérer et partir en livraison", to: "out_for_delivery" as const }}
              onAction={move}
              variant="pickup"
            />
          ))}
          {toPick.length === 0 && (
            <p className="col-span-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              ✅ Rien à récupérer pour l'instant.
            </p>
          )}
        </div>
      </section>

      {/* Section En route */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          <Bike className="size-4" /> En route
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            {enRoute.length}
          </Badge>
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {enRoute.map((o) => (
            <DeliveryCard
              key={o.id}
              o={o}
              pending={pendingId === o.id}
              action={{ label: "✅ Marquer comme livrée", to: "delivered" as const }}
              onAction={move}
              variant="enroute"
            />
          ))}
          {enRoute.length === 0 && (
            <p className="col-span-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              🏍️ Aucune course en cours pour l'instant.
            </p>
          )}
        </div>
      </section>
    </div>
  );

  if (embedded) return inner;

  return (
    <RoleShell context={context} title="Livraison — mes courses" icon={<Bike className="size-3.5" />}>
      {inner}
    </RoleShell>
  );
}

function DeliveryCard({
  o,
  pending,
  action,
  onAction,
  variant,
}: {
  o: ActiveOrder;
  pending: boolean;
  action: { label: string; to: "out_for_delivery" | "delivered" };
  onAction: (o: ActiveOrder, to: "out_for_delivery" | "delivered") => Promise<void>;
  variant: "pickup" | "enroute";
}) {
  const borderColor = variant === "pickup" ? "border-orange-200 dark:border-orange-800" : "border-blue-200 dark:border-blue-800";
  const headerBg = variant === "pickup" ? "bg-orange-50 dark:bg-orange-950/30" : "bg-blue-50 dark:bg-blue-950/30";
  const btnClass = variant === "pickup"
    ? "bg-orange-500 hover:bg-orange-600 text-white"
    : "bg-blue-500 hover:bg-blue-600 text-white";

  return (
    <Card className={`overflow-hidden shadow-none ${borderColor}`}>
      {/* Header coloré */}
      <div className={`flex items-center justify-between px-4 py-2.5 ${headerBg}`}>
        <span className="font-bold tracking-wide">{o.order_number}</span>
        <span className="text-sm font-extrabold">
          {formatFcfa(o.total_fcfa)}
        </span>
      </div>
      <CardContent className="space-y-2 pt-3 pb-4">
        {o.customer_name && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            👤 <span className="font-medium text-foreground">{o.customer_name}</span>
          </p>
        )}
        {o.delivery_address && (
          <p className="flex items-start gap-1.5 text-sm">
            📍 <span>{o.delivery_address}</span>
          </p>
        )}
        {o.items && o.items.length > 0 && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
            {o.items.map((item) => (
              <div key={item.id} className="flex justify-between">
                <span>× {item.quantity} {item.item_name}</span>
                <span>{formatFcfa(item.price_fcfa * item.quantity)}</span>
              </div>
            ))}
          </div>
        )}
        <Button
          className={`mt-1 w-full ${btnClass}`}
          size="sm"
          disabled={pending}
          onClick={() => void onAction(o, action.to)}
        >
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
          {action.label}
        </Button>
      </CardContent>
    </Card>
  );
}


function StatusPill({ status }: { status: string }) {
  const labels: Record<string, string> = {
    pending: "En attente",
    confirmed: "Confirmée",
    in_kitchen: "En préparation",
    ready: "Prête",
    out_for_delivery: "En livraison",
  };
  const colors: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    confirmed: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    in_kitchen: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    ready: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    out_for_delivery: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colors[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}


