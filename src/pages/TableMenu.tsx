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
  Loader2,
  MapPin,
  Minus,
  Phone,
  Plus,
  Store,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";
import { formatFcfa } from "@/lib/chopmboa";
import { mapCategory, mapItem, type UIMenuItem } from "@/lib/neonMappers";
import logo from "@/assets/logo.svg";

interface TableInfo {
  tableId: string;
  tableNumber: string;
  restaurantId: string;
  restaurantName: string;
  restaurantDescription: string | null;
  restaurantAddress: string | null;
  restaurantPhone: string | null;
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
  const [pending, setPending] = useState(false);
  const [placed, setPlaced] = useState<{ orderNumber: string; totalFcfa: number } | null>(null);

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
        items: Object.entries(cart).map(([menuItemId, quantity]) => ({
          menuItemId,
          quantity,
        })),
      })) as { orderNumber: string; totalFcfa: number };
      setPlaced({ orderNumber: res.orderNumber, totalFcfa: res.totalFcfa });
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

  /* --------------------------- success ------------------------------- */
  if (placed) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Check className="size-8" />
        </div>
        <h1 className="mt-6 text-2xl font-extrabold">Commande envoyée !</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {placed.orderNumber} · {formatFcfa(placed.totalFcfa)} — la cuisine
          prépare votre commande. Suivez l'avancement auprès du personnel.
        </p>
        <Button className="mt-8" variant="outline" onClick={() => setPlaced(null)}>
          Commander autre chose
        </Button>
      </main>
    );
  }

  /* ----------------------------- menu -------------------------------- */
  return (
    <main className="min-h-screen bg-background pb-32">
      <header className="border-b border-border/60 bg-gradient-to-b from-orange-950/40 to-transparent">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary-muted text-primary">
              <Store className="size-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">
                {info.restaurantName}
              </h1>
              <p className="text-sm text-muted-foreground">
                Table {info.tableNumber} · Menu du jour
              </p>
            </div>
          </div>
          {info.restaurantDescription && (
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {info.restaurantDescription}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
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
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{item.name}</p>
                    {item.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                    <p className="mt-1.5 text-sm font-bold text-primary">
                      {formatFcfa(item.priceFcfa)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={!qty}
                      onClick={() => remove(item.id)}
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="w-6 text-center text-sm font-bold">
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
