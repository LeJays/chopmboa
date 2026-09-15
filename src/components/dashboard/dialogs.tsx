import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useState } from "react";

export const STAFF_ROLES = [
  { value: "manager", label: "Gérant" },
  { value: "kitchen", label: "Cuisine" },
  { value: "cashier", label: "Caisse" },
  { value: "delivery", label: "Livreur" },
  { value: "waiter", label: "Serveur" },
] as const;

export interface RestaurantDraft {
  name: string;
  description?: string;
  address?: string;
  city?: string;
  phone?: string;
}

export function CreateRestaurantDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: RestaurantDraft) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!name.trim() || pending) return;
    setPending(true);
    try {
      await onCreate({
        name,
        city: city || undefined,
        address: address || undefined,
        phone: phone || undefined,
        description: description || undefined,
      });
      setName("");
      setCity("");
      setAddress("");
      setPhone("");
      setDescription("");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau restaurant</DialogTitle>
          <DialogDescription>
            Multi-restaurants selon votre plan : FREE 1, PRO 3, BUSINESS
            illimité.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="r-name">Nom du restaurant *</Label>
            <Input
              id="r-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Chez Maman"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="r-city">Ville</Label>
              <Input
                id="r-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Yaoundé"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-phone">Téléphone</Label>
              <Input
                id="r-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+237 6..."
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-address">Adresse</Label>
            <Input
              id="r-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Quartier, rue"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-desc">Description</Label>
            <Input
              id="r-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="La spécialité de la maison"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface ItemDraft {
  name: string;
  description?: string;
  priceFcfa: number;
  categoryId?: string;
  preparationTimeMin?: number;
}

export function CreateItemDialog({
  open,
  onOpenChange,
  categories,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: { id: string; name: string }[];
  onCreate: (data: ItemDraft) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [prep, setPrep] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const priceNum = Number(price.replace(/\s/g, ""));
    if (!name.trim() || !Number.isFinite(priceNum) || priceNum <= 0 || pending)
      return;
    setPending(true);
    try {
      await onCreate({
        name,
        description: description || undefined,
        priceFcfa: priceNum,
        categoryId: categoryId || undefined,
        preparationTimeMin: prep ? Number(prep) : undefined,
      });
      setName("");
      setDescription("");
      setPrice("");
      setCategoryId("");
      setPrep("");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un plat</DialogTitle>
          <DialogDescription>
            Le plat est immédiatement disponible à la vente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="i-name">Nom du plat *</Label>
            <Input
              id="i-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Poulet braisé"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="i-price">Prix (FCFA) *</Label>
              <Input
                id="i-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="numeric"
                placeholder="4500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="i-prep">Préparation (min)</Label>
              <Input
                id="i-prep"
                value={prep}
                onChange={(e) => setPrep(e.target.value)}
                inputMode="numeric"
                placeholder="15"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="i-cat">Catégorie</Label>
            <select
              id="i-cat"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Sans catégorie</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="i-desc">Description</Label>
            <Input
              id="i-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Servi avec plantains mûrs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface TableDraft {
  tableNumber: string;
  capacity?: number;
}

export function CreateTableDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: TableDraft) => Promise<void>;
}) {
  const [tableNumber, setTableNumber] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!tableNumber.trim() || pending) return;
    setPending(true);
    try {
      await onCreate({
        tableNumber,
        capacity: capacity ? Number(capacity) : undefined,
      });
      setTableNumber("");
      setCapacity("4");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ajouter une table</DialogTitle>
          <DialogDescription>
            Un QR Code unique est généré automatiquement.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="t-num">Numéro *</Label>
            <Input
              id="t-num"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="T5"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-cap">Places</Label>
            <Input
              id="t-cap"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              inputMode="numeric"
              placeholder="4"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={pending || !tableNumber.trim()}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreateCategoryDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!name.trim() || pending) return;
    setPending(true);
    try {
      await onCreate(name.trim());
      setName("");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nouvelle catégorie</DialogTitle>
          <DialogDescription>
            Organisez votre menu : Plats, Grillades, Boissons…
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="c-name">Nom de la catégorie *</Label>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Grillades"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface OrderLineDraft {
  menuItemId: string;
  quantity: number;
}

export function CreateOrderDialog({
  open,
  onOpenChange,
  tables,
  menuItems,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tables: { id: string; tableNumber: string }[];
  menuItems: { id: string; name: string; priceFcfa: number; isAvailable: boolean }[];
  onCreate: (data: {
    tableId: string;
    paymentMethod: "cash" | "mobile_money";
    items: OrderLineDraft[];
    notes?: string;
  }) => Promise<void>;
}) {
  const [tableId, setTableId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mobile_money">("cash");
  const [notes, setNotes] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pending, setPending] = useState(false);

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

  const total = menuItems.reduce(
    (sum, item) => sum + (cart[item.id] ?? 0) * item.priceFcfa,
    0,
  );
  const lineCount = Object.values(cart).reduce((s, q) => s + q, 0);

  const reset = () => {
    setTableId("");
    setPaymentMethod("cash");
    setNotes("");
    setCart({});
  };

  const submit = async () => {
    if (!tableId || lineCount === 0 || pending) return;
    setPending(true);
    try {
      await onCreate({
        tableId,
        paymentMethod,
        items: Object.entries(cart).map(([menuItemId, quantity]) => ({
          menuItemId,
          quantity,
        })),
        notes: notes || undefined,
      });
      reset();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvelle commande</DialogTitle>
          <DialogDescription>
            Sélectionnez une table, ajoutez les plats, puis validez.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="o-table">Table *</Label>
              <select
                id="o-table"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
              >
                <option value="">Choisir…</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    Table {t.tableNumber}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="o-pay">Paiement</Label>
              <select
                id="o-pay"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as "cash" | "mobile_money")
                }
              >
                <option value="cash">Espèces</option>
                <option value="mobile_money">Mobile Money</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Plats</Label>
            <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
              {menuItems.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Ajoutez d'abord des plats au menu.
                </p>
              )}
              {menuItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {item.name}
                      {!item.isAvailable && (
                        <span className="ml-2 text-xs text-red-500">épuisé</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.priceFcfa.toLocaleString("fr-FR")} FCFA
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={!item.isAvailable || !cart[item.id]}
                      onClick={() => remove(item.id)}
                    >
                      −
                    </Button>
                    <span className="w-6 text-center text-sm font-semibold">
                      {cart[item.id] ?? 0}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={!item.isAvailable}
                      onClick={() => add(item.id)}
                    >
                      +
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="o-notes">Note de cuisine</Label>
            <Input
              id="o-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: sans piment, à servir rapidement"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2.5">
            <span className="text-sm text-muted-foreground">
              {lineCount} article{lineCount > 1 ? "s" : ""}
            </span>
            <span className="text-lg font-extrabold">
              {total.toLocaleString("fr-FR")} FCFA
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !tableId || lineCount === 0}
          >
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Valider la commande
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface StaffDraft {
  fullName: string;
  email: string;
  password: string;
  role: string;
}

export function StaffDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: StaffDraft) => Promise<string | null>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("waiter");
  const [pending, setPending] = useState(false);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit =
    fullName.trim().length >= 2 && emailOk && password.length >= 8 && !pending;

  const submit = async () => {
    if (!canSubmit) return;
    setPending(true);
    try {
      await onCreate({
        fullName,
        email,
        password,
        role,
      });
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("waiter");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un membre à l'équipe</DialogTitle>
          <DialogDescription>
            Le compte est créé avec email + mot de passe : la personne se
            connecte ensuite sur /auth. Si l'email existe déjà, seule
            l'attribution du rôle est effectuée.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="s-name">Nom complet *</Label>
            <Input
              id="s-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ex: Amina Nkoulou"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-email">Email *</Label>
            <Input
              id="s-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="amina@exemple.cm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-password">Mot de passe *</Label>
            <Input
              id="s-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8 caractères minimum"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-role">Rôle *</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="s-role" className="w-full">
                <SelectValue placeholder="Choisir un rôle" />
              </SelectTrigger>
              <SelectContent>
                {STAFF_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}