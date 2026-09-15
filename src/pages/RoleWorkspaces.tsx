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
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  // Sérialisé en ISO string par serializable() côté serveur.
  created_at: string | Date;
  items: {
    id: string;
    quantity: number;
    item_name: string;
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

function KitchenView({
  restaurantId,
  context,
}: {
  restaurantId: string;
  context: StaffContext;
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
                {o.items.map((it) => (
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

  return (
    <RoleShell context={context} title="Cuisine — écran de préparation" icon={<CookingPot className="size-3.5" />}>
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

function PosView({
  restaurantId,
  context,
}: {
  restaurantId: string;
  context: StaffContext;
}) {
  const ordersPoll = usePollAction<ActiveOrder[]>(
    api.orders.activeWithItems,
    { restaurantId },
    10_000,
  );
  const markPaid = useAction(api.orders.markPaid);
  const setStatus = useAction(api.orders.setStatus);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const orders = ordersPoll.data ?? [];
  const toCollect = orders.filter((o) => o.payment_status === "pending");
  const filtered = query.trim()
    ? orders.filter(
        (o) =>
          o.order_number.toLowerCase().includes(query.toLowerCase()) ||
          (o.customer_name ?? "").toLowerCase().includes(query.toLowerCase()),
      )
    : orders;

  const collect = async (o: ActiveOrder) => {
    setPendingId(o.id);
    try {
      await markPaid({ orderId: o.id });
      toast.success(`${o.order_number} — ${formatFcfa(o.total_fcfa)} encaissés.`);
      ordersPoll.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Encaissement impossible.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <RoleShell context={context} title="Caisse — encaissement" icon={<Search className="size-3.5" />}>
      <div className="mb-4 max-w-sm">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un numéro ou un client…"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((o) => (
          <Card key={o.id} className="border-border/70 shadow-none">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{o.order_number}</CardTitle>
                <Badge variant={o.payment_status === "paid" ? "secondary" : "default"}>
                  {o.payment_status === "paid" ? "Payée" : "À encaisser"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {ORDER_TYPE_LABELS[o.order_type]} ·{" "}
                {PAYMENT_METHOD_LABELS[o.payment_method]} ·{" "}
                {formatTime(new Date(o.created_at).getTime())}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1 text-sm">
                {o.items.map((it) => (
                  <li key={it.id} className="flex justify-between gap-2">
                    <span>
                      <span className="font-semibold text-primary">{it.quantity}×</span>{" "}
                      {it.item_name}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-border/70 pt-2">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-lg font-extrabold">
                  {formatFcfa(o.total_fcfa)}
                </span>
              </div>
              <div className="flex gap-2">
                {o.payment_status === "pending" && (
                  <Button
                    className="flex-1"
                    size="sm"
                    disabled={pendingId === o.id}
                    onClick={() => void collect(o)}
                  >
                    {pendingId === o.id && (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    )}
                    Encaisser
                  </Button>
                )}
                {o.status === "ready" && o.order_type === "dine_in" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={pendingId === o.id}
                    onClick={async () => {
                      setPendingId(o.id);
                      try {
                        await setStatus({ orderId: o.id, status: "served" });
                        ordersPoll.refresh();
                      } finally {
                        setPendingId(null);
                      }
                    }}
                  >
                    Servie
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {toCollect.length === 0 && filtered.length === 0 && (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Aucune commande en cours.
        </p>
      )}
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

function WaiterView({
  restaurantId,
  context,
}: {
  restaurantId: string;
  context: StaffContext;
}) {
  const ordersPoll = usePollAction<ActiveOrder[]>(
    api.orders.activeWithItems,
    { restaurantId },
    10_000,
  );
  const setStatus = useAction(api.orders.setStatus);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const orders = ordersPoll.data ?? [];

  const serve = async (o: ActiveOrder) => {
    setPendingId(o.id);
    try {
      await setStatus({ orderId: o.id, status: "served" });
      toast.success(`${o.order_number} servie.`);
      ordersPoll.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action impossible.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <RoleShell context={context} title="Salle — suivi des tables" icon={<Utensils className="size-3.5" />}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {orders.map((o) => (
          <Card key={o.id} className="border-border/70 shadow-none">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{o.order_number}</CardTitle>
                <StatusPill status={o.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {ORDER_TYPE_LABELS[o.order_type]}
                {o.customer_name ? ` · ${o.customer_name}` : ""}
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              <ul className="space-y-1 text-sm">
                {o.items.map((it) => (
                  <li key={it.id}>
                    <span className="font-semibold text-primary">{it.quantity}×</span>{" "}
                    {it.item_name}
                  </li>
                ))}
              </ul>
              {o.status === "ready" && (
                <Button
                  className="w-full"
                  size="sm"
                  disabled={pendingId === o.id}
                  onClick={() => void serve(o)}
                >
                  {pendingId === o.id && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  Marquer servie
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {orders.length === 0 && (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Aucune commande en cours. Les commandes QR des tables apparaissent ici
          automatiquement.
        </p>
      )}
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

function DeliveriesView({
  restaurantId,
  context,
}: {
  restaurantId: string;
  context: StaffContext;
}) {
  const ordersPoll = usePollAction<ActiveOrder[]>(
    api.orders.activeWithItems,
    { restaurantId },
    10_000,
  );
  const setStatus = useAction(api.orders.setStatus);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const orders = useMemo(
    () => (ordersPoll.data ?? []).filter((o) => o.order_type === "delivery"),
    [ordersPoll.data],
  );
  const toPick = orders.filter((o) => o.status === "ready");
  const enRoute = orders.filter((o) => o.status === "out_for_delivery");

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

  return (
    <RoleShell context={context} title="Livraison — mes courses" icon={<Bike className="size-3.5" />}>
      <div className="space-y-6">
        <section>
          <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-bold uppercase tracking-wide">
            <Utensils className="size-4 text-primary" /> À récupérer au restaurant
            <Badge variant="secondary">{toPick.length}</Badge>
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {toPick.map((o) => (
              <DeliveryCard
                key={o.id}
                o={o}
                pending={pendingId === o.id}
                action={{ label: "Récupérer et partir en livraison", to: "out_for_delivery" as const }}
                onAction={move}
              />
            ))}
            {toPick.length === 0 && (
              <p className="text-sm text-muted-foreground">Rien à récupérer.</p>
            )}
          </div>
        </section>
        <section>
          <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-bold uppercase tracking-wide">
            <Bike className="size-4 text-primary" /> En route
            <Badge variant="secondary">{enRoute.length}</Badge>
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {enRoute.map((o) => (
              <DeliveryCard
                key={o.id}
                o={o}
                pending={pendingId === o.id}
                action={{ label: "Marquer livrée", to: "delivered" as const }}
                onAction={move}
              />
            ))}
            {enRoute.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucune course en cours.</p>
            )}
          </div>
        </section>
      </div>
    </RoleShell>
  );
}

function DeliveryCard({
  o,
  pending,
  action,
  onAction,
}: {
  o: ActiveOrder;
  pending: boolean;
  action: { label: string; to: "out_for_delivery" | "delivered" };
  onAction: (o: ActiveOrder, to: "out_for_delivery" | "delivered") => Promise<void>;
}) {
  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="space-y-2 pt-4">
        <div className="flex items-center justify-between">
          <p className="font-bold">{o.order_number}</p>
          <span className="text-sm font-extrabold text-primary">
            {formatFcfa(o.total_fcfa)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Client : {o.customer_name ?? "—"}
        </p>
        {o.delivery_address && (
          <p className="text-sm">📍 {o.delivery_address}</p>
        )}
        <Button
          className="w-full"
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


