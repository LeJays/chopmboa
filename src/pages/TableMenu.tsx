import { useAction, api } from "@/lib/neon-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Check,
  ChefHat,
  Compass,
  ExternalLink,
  Loader2,
  MapPin,
  Minus,
  Navigation,
  Phone,
  Plus,
  Store,
  UtensilsCrossed,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Bell,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";
import { formatFcfa } from "@/lib/chopmboa";
import { mapCategory, mapItem, mapOrder, type UIMenuItem } from "@/lib/neonMappers";
import logo from "@/assets/logo.svg";

interface TableInfo {
  tableId: string;
  tableNumber: string;
  restaurantId: string;
  restaurantName: string;
  restaurantDescription: string | null;
  restaurantAddress: string | null;
  restaurantPhone: string | null;
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

/** Public customer menu reached by scanning a table's QR code. */
export default function TableMenu() {
  const { token = "" } = useParams();
  const resolveTable = useAction(api.tables.resolveByToken);
  const loadMenu = useAction(api.menu.listItems);
  const loadCategories = useAction(api.menu.listCategories);
  const submitOrder = useAction(api.orders.createByQr);

  const [info, setInfo] = useState<TableInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [items, setItems] = useState<UIMenuItem[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mobile_money">("cash");
  const [pending, setPending] = useState(false);
  const [placed, setPlaced] = useState<{
    id: string;
    orderNumber: string;
    totalFcfa: number;
    paymentMethod?: string;
    status: string;
  } | null>(null);

  const getOrder = useAction(api.orders.get);
  const [trackingLoading, setTrackingLoading] = useState(false);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "En attente";
      case "preparing":
        return "En préparation";
      case "ready":
        return "Prête !";
      case "served":
        return "Servie";
      case "delivered":
        return "Livrée";
      case "cancelled":
        return "Annulée";
      default:
        return status;
    }
  };

  const fetchTrackingUpdate = async () => {
    if (!placed?.id) return;
    try {
      const updated = (await getOrder({ orderId: placed.id })) as any;
      const mapped = mapOrder(updated);
      setPlaced((prev) => {
        if (!prev) return null;
        if (prev.status !== mapped.status) {
          toast.info(`Statut de votre commande mis à jour : ${getStatusLabel(mapped.status)}`);
        }
        return {
          ...prev,
          status: mapped.status,
        };
      });
    } catch (err) {
      console.warn("Tracking update failed:", err);
    }
  };

  useEffect(() => {
    if (!placed?.id) return;
    
    // Initial fetch
    void fetchTrackingUpdate();

    const interval = setInterval(() => {
      void fetchTrackingUpdate();
    }, 6000); // Poll every 6 seconds

    return () => clearInterval(interval);
  }, [placed?.id]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const resolved = (await resolveTable({ token })) as TableInfo;
        setInfo(resolved);
      } catch (err) {
        setInfoError(
          err instanceof Error ? err.message : "QR Code invalide.",
        );
      }
    })();
  }, [token, resolveTable]);

  useEffect(() => {
    if (!info) return;
    setMenuLoading(true);
    void (async () => {
      try {
        const [rawItems, rawCategories] = await Promise.all([
          loadMenu({ restaurantId: info.restaurantId }),
          loadCategories({ restaurantId: info.restaurantId }),
        ]);
        setItems((rawItems as never[]).map((i) => mapItem(i as never)));
        setCategories(
          (rawCategories as never[]).map((c) => mapCategory(c as never)),
        );
      } catch (err) {
        console.warn("Menu load failed:", err);
      } finally {
        setMenuLoading(false);
      }
    })();
  }, [info, loadMenu, loadCategories]);

  const add = (id: string) =>
    setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const remove = (id: string) =>
    setCart((c) => {
      const next = { ...c };
      if (!next[id]) return c;
      next[id] -= 1;
      if (next[id] <= 0) delete next[id];
      return next;
    });

  const available = items.filter((i) => i.isAvailable);
  const total = available.reduce(
    (sum, item) => sum + (cart[item.id] ?? 0) * item.priceFcfa,
    0,
  );
  const lineCount = Object.values(cart).reduce((s, q) => s + q, 0);

  const submit = async () => {
    if (!info || !name.trim() || lineCount === 0 || pending) return;
    setPending(true);
    try {
      const res = (await submitOrder({
        tableToken: token,
        customerName: name.trim(),
        customerPhone: phone.trim() || undefined,
        paymentMethod,
        items: Object.entries(cart).map(([menuItemId, quantity]) => ({
          menuItemId,
          quantity,
        })),
      })) as any;
      const mapped = mapOrder(res);
      setPlaced({
        id: mapped.id,
        orderNumber: mapped.orderNumber,
        totalFcfa: mapped.totalFcfa,
        paymentMethod,
        status: mapped.status || "pending",
      });
      setCart({});
      setCheckoutOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de la commande.");
    } finally {
      setPending(false);
    }
  };

  /* --------------------------- invalid QR ---------------------------- */
  if (infoError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <img src={logo} alt="ChopMboa" className="size-12 rounded-2xl" />
        <h1 className="mt-6 text-xl font-extrabold">QR Code invalide</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {infoError} Demandez de l'aide au personnel du restaurant.
        </p>
      </main>
    );
  }

  /* --------------------------- loading ------------------------------- */
  if (!info) {
    return (
      <main className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto max-w-2xl space-y-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  /* --------------------------- success & tracking --------------------- */
  if (placed) {
    const currentStatus = placed.status || "pending";
    const isCancelled = currentStatus === "cancelled";

    // Define progress steps
    const steps = [
      {
        key: "pending",
        label: "Validation",
        desc: "Commande reçue, en cours de validation.",
        icon: Clock,
        activeColors: "bg-amber-100 border-amber-300 text-amber-700",
        doneColors: "bg-emerald-100 border-emerald-300 text-emerald-700",
        isDone: ["preparing", "ready", "served", "delivered"].includes(currentStatus),
        isActive: currentStatus === "pending",
      },
      {
        key: "preparing",
        label: "Préparation",
        desc: "Le chef prépare votre commande.",
        icon: ChefHat,
        activeColors: "bg-orange-100 border-orange-300 text-orange-700 animate-pulse",
        doneColors: "bg-emerald-100 border-emerald-300 text-emerald-700",
        isDone: ["ready", "served", "delivered"].includes(currentStatus),
        isActive: currentStatus === "preparing",
      },
      {
        key: "ready",
        label: "Prête !",
        desc: "Votre commande est prête.",
        icon: Bell,
        activeColors: "bg-blue-100 border-blue-300 text-blue-700",
        doneColors: "bg-emerald-100 border-emerald-300 text-emerald-700",
        isDone: ["served", "delivered"].includes(currentStatus),
        isActive: currentStatus === "ready",
      },
      {
        key: "served",
        label: "Dégustation",
        desc: "Bon appétit !",
        icon: UtensilsCrossed,
        activeColors: "bg-emerald-100 border-emerald-300 text-emerald-700",
        doneColors: "bg-emerald-100 border-emerald-300 text-emerald-700",
        isDone: ["served", "delivered"].includes(currentStatus),
        isActive: ["served", "delivered"].includes(currentStatus),
      },
    ];

    return (
      <main className="flex min-h-screen flex-col items-center bg-background px-4 py-8 max-w-sm mx-auto relative text-center">
        {/* Header simple */}
        <div className="flex items-center gap-2 mb-6">
          <img src={logo} alt="ChopMboa" className="size-8 rounded-xl" />
          <span className="font-extrabold text-sm tracking-tight">{info.restaurantName}</span>
        </div>

        {/* Live Status Header */}
        <div className="w-full text-center space-y-2 mb-6">
          {isCancelled ? (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
              <XCircle className="size-4" />
              <span>Commande annulée</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span>Suivi en temps réel</span>
            </div>
          )}
          <h1 className="text-2xl font-black tracking-tight">
            {isCancelled ? "Commande annulée" : "Où en est mon plat ?"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {isCancelled 
              ? "Cette commande a été annulée par l'établissement."
              : "La cuisine et les serveurs s'activent pour vous."}
          </p>
        </div>

        {/* Tracking Timeline */}
        {!isCancelled && (
          <div className="w-full p-5 bg-card border border-border rounded-2xl shadow-xs space-y-6 relative overflow-hidden mb-6 text-left">
            <div className="absolute left-9 top-10 bottom-10 w-[2px] bg-muted-foreground/20 z-0" />
            
            {steps.map((step) => {
              const Icon = step.icon;
              let iconStyle = "bg-muted text-muted-foreground border-transparent";
              if (step.isDone) iconStyle = step.doneColors;
              else if (step.isActive) iconStyle = step.activeColors;

              return (
                <div key={step.key} className="flex gap-4 items-start relative z-10">
                  <div className={`flex size-10 items-center justify-center rounded-full border-2 shrink-0 ${iconStyle} transition-colors duration-300`}>
                    {step.isDone ? <Check className="size-5 stroke-[3]" /> : <Icon className="size-5" />}
                  </div>
                  <div className="space-y-0.5 pt-1">
                    <h3 className={`text-sm font-extrabold ${step.isActive ? "text-primary" : step.isDone ? "text-foreground" : "text-muted-foreground"}`}>
                      {step.label}
                    </h3>
                    <p className={`text-xs ${step.isActive ? "text-foreground/80 font-medium" : "text-muted-foreground"}`}>
                      {step.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Cancelled Alert Banner */}
        {isCancelled && (
          <div className="w-full p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs text-left mb-6 space-y-2">
            <p className="font-bold">Commande non validée ou annulée</p>
            <p className="text-[11px] leading-relaxed">
              Il est possible qu'un article commandé ne soit plus disponible ou que le mode de paiement n'ait pas été validé par l'établissement. N'hésitez pas à solliciter un membre de notre équipe !
            </p>
          </div>
        )}

        {/* Order Details Card */}
        <div className="w-full p-4 rounded-2xl bg-muted/40 border border-border/80 text-left space-y-3 mb-6">
          <div className="flex items-center justify-between text-xs font-bold border-b border-border pb-2">
            <span>N° Commande :</span>
            <span className="text-primary font-extrabold">{placed.orderNumber}</span>
          </div>
          <div className="flex items-center justify-between text-xs font-bold border-b border-border pb-2">
            <span>Montant total :</span>
            <span className="text-base text-primary font-black">{formatFcfa(placed.totalFcfa)}</span>
          </div>
          <div className="flex items-center justify-between text-xs font-bold border-b border-border pb-2">
            <span>Table :</span>
            <span className="text-muted-foreground">Table {info.tableNumber}</span>
          </div>
          <div className="flex items-center justify-between text-xs font-bold">
            <span>Mode de paiement :</span>
            <span className="text-muted-foreground">
              {placed.paymentMethod === "mobile_money" ? "📱 Mobile Money" : "💵 Espèces / Cash"}
            </span>
          </div>

          {/* Mobile Money prompt inside tracking if pending / payment info */}
          {placed.paymentMethod === "mobile_money" && currentStatus === "pending" && (
            <div className="mt-4 pt-3 border-t border-dashed border-border space-y-2.5">
              <p className="text-[11px] font-bold text-orange-800 text-center">
                👉 Veuillez effectuer le transfert si ce n'est pas déjà fait :
              </p>
              
              <div className="grid gap-2 text-xs">
                {info.momoActive && info.momoNumber && (
                  <div className="p-2 rounded-xl bg-amber-50 border border-amber-200">
                    <p className="font-bold text-amber-800 text-[10px]">MTN Mobile Money</p>
                    <p className="font-extrabold text-foreground mt-0.5">N° : {info.momoNumber}</p>
                    {info.momoName && <p className="text-[9px] text-muted-foreground">Nom : {info.momoName}</p>}
                  </div>
                )}
                {info.omActive && info.omNumber && (
                  <div className="p-2 rounded-xl bg-orange-50 border border-orange-200">
                    <p className="font-bold text-orange-800 text-[10px]">Orange Money (OM)</p>
                    <p className="font-extrabold text-foreground mt-0.5">N° : {info.omNumber}</p>
                    {info.omName && <p className="text-[9px] text-muted-foreground">Nom : {info.omName}</p>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Buttons / Controls */}
        <div className="w-full space-y-2 mt-auto">
          <Button 
            className="w-full h-11 font-extrabold shadow-sm flex items-center justify-center gap-2" 
            variant="outline"
            onClick={async () => {
              setTrackingLoading(true);
              await fetchTrackingUpdate();
              setTimeout(() => setTrackingLoading(false), 600);
            }}
            disabled={trackingLoading}
          >
            <RefreshCw className={`size-4 ${trackingLoading ? "animate-spin" : ""}`} />
            <span>{trackingLoading ? "Mise à jour..." : "Actualiser le statut"}</span>
          </Button>

          <Button 
            className="w-full h-11 font-extrabold" 
            variant="ghost" 
            onClick={() => setPlaced(null)}
          >
            Retourner au menu
          </Button>
        </div>
      </main>
    );
  }

  /* ----------------------------- menu -------------------------------- */
  return (
    <main className="min-h-screen bg-background pb-32">
      <header className="border-b border-border/60 bg-gradient-to-b from-orange-950/40 to-transparent">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="flex items-center gap-3.5">
            <div className="size-16 rounded-2xl border border-border/80 bg-background overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
              {info.logoUrl ? (
                <img
                  src={info.logoUrl}
                  alt={info.restaurantName}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-primary-muted text-primary">
                  <Store className="size-7" />
                </div>
              )}
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">
                {info.restaurantName}
              </h1>
              <p className="text-sm text-muted-foreground">
                Table {info.tableNumber} · Menu interactif
              </p>
            </div>
          </div>

          {info.landmark && (
            <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-foreground shadow-2xs">
              <MapPin className="size-3.5 text-primary shrink-0" />
              <span className="font-semibold text-primary">Repère d'accès :</span>
              <span className="font-medium">{info.landmark}</span>
            </div>
          )}

          {info.restaurantDescription && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {info.restaurantDescription}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {info.restaurantAddress && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" /> {info.restaurantAddress}
              </span>
            )}
            {info.restaurantPhone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5" /> {info.restaurantPhone}
              </span>
            )}
            {info.latitude != null && info.longitude != null && (
              <a
                href={`https://www.google.com/maps?q=${info.latitude},${info.longitude}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
              >
                <Navigation className="size-3.5" />
                Itinéraire GPS
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6">
        {categories.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {categories.map((c) => (
              <Badge key={c.id} variant="secondary">
                {c.name}
              </Badge>
            ))}
          </div>
        )}

        {menuLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : available.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
            <ChefHat className="size-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-semibold">Menu momentanément vide</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Le restaurant n'a pas encore publié de plats disponibles.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {available.map((item) => {
              const qty = cart[item.id] ?? 0;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3.5 rounded-xl border border-border/70 bg-card p-3 shadow-2xs hover:border-border transition-colors"
                >
                  <div className="size-20 sm:size-24 rounded-xl border border-border/60 bg-muted/40 overflow-hidden flex items-center justify-center shrink-0 shadow-2xs">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="size-full object-cover"
                      />
                    ) : (
                      <UtensilsCrossed className="size-7 text-muted-foreground/30" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm sm:text-base text-foreground line-clamp-1">
                      {item.name}
                    </p>
                    {item.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                    <p className="mt-1.5 text-sm font-bold text-primary">
                      {formatFcfa(item.priceFcfa)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={!qty}
                      onClick={() => remove(item.id)}
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="w-5 text-center text-sm font-bold">
                      {qty}
                    </span>
                    <Button
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => add(item.id)}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky cart bar */}
      {lineCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold">
                {lineCount} article{lineCount > 1 ? "s" : ""} ·{" "}
                {formatFcfa(total)}
              </p>
              <p className="text-xs text-muted-foreground">
                Table {info.tableNumber} — paiement au comptoir
              </p>
            </div>
            <Button onClick={() => setCheckoutOpen(true)}>
              Commander
            </Button>
          </div>
        </div>
      )}

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Votre commande</DialogTitle>
            <DialogDescription>
              {lineCount} article{lineCount > 1 ? "s" : ""} ·{" "}
              {formatFcfa(total)} — Table {info.tableNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tc-name">Votre nom *</Label>
              <Input
                id="tc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Jean"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tc-phone">Téléphone (optionnel)</Label>
              <Input
                id="tc-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="+237 6…"
              />
            </div>

            {/* Mode de paiement */}
            <div className="space-y-2.5 pt-2 border-t border-border">
              <Label className="text-xs font-semibold">Mode de règlement préféré</Label>
              <div className="grid grid-cols-2 gap-2">
                {/* Cash option (Active by default or if configured) */}
                {(info.cashActive !== false) && (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("cash")}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                      paymentMethod === "cash"
                        ? "border-primary bg-primary/5 text-primary ring-2 ring-primary/20"
                        : "border-border hover:bg-muted/30 text-foreground"
                    }`}
                  >
                    <span className="text-base">💵</span>
                    <span className="text-[11px] font-bold mt-1">Espèces / Cash</span>
                    <span className="text-[9px] text-muted-foreground">Paiement sur place</span>
                  </button>
                )}

                {/* Mobile Money option (if active) */}
                {(info.momoActive || info.omActive) && (
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("mobile_money")}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                      paymentMethod === "mobile_money"
                        ? "border-orange-500 bg-orange-500/5 text-orange-700 ring-2 ring-orange-500/20"
                        : "border-border hover:bg-muted/30 text-foreground"
                    }`}
                  >
                    <span className="text-base">📱</span>
                    <span className="text-[11px] font-bold mt-1">Mobile Money</span>
                    <span className="text-[9px] text-muted-foreground">Transfert (MoMo, OM)</span>
                  </button>
                )}
              </div>

              {/* Show Transfer payment instructions right here if selected */}
              {paymentMethod === "mobile_money" && (
                <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-3 space-y-2 mt-2">
                  <p className="text-[11px] font-bold text-orange-800 flex items-center gap-1.5">
                    ℹ️ Comment procéder au paiement :
                  </p>
                  <div className="space-y-1.5 text-[10.5px] text-muted-foreground">
                    {info.momoActive && info.momoNumber && (
                      <div className="flex flex-col p-1.5 rounded bg-background border border-amber-200/50">
                        <span className="font-semibold text-amber-700">MTN Mobile Money :</span>
                        <span className="font-bold text-foreground mt-0.5">N° : {info.momoNumber}</span>
                        {info.momoName && <span className="text-[9.5px]">Compte : <span className="font-medium text-foreground">{info.momoName}</span></span>}
                      </div>
                    )}
                    {info.omActive && info.omNumber && (
                      <div className="flex flex-col p-1.5 rounded bg-background border border-orange-200/50">
                        <span className="font-semibold text-orange-700">Orange Money (OM) :</span>
                        <span className="font-bold text-foreground mt-0.5">N° : {info.omNumber}</span>
                        {info.omName && <span className="text-[9.5px]">Compte : <span className="font-medium text-foreground">{info.omName}</span></span>}
                      </div>
                    )}
                    {info.paymentInstructions && (
                      <p className="italic text-[10px] mt-1 border-t border-orange-100 pt-1">
                        {info.paymentInstructions}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={pending || !name.trim()}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Envoyer en cuisine
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
