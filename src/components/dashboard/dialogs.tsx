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
import { Loader2, Image as ImageIcon, Upload, X, Sparkles, Check, Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { fileToDataUrl, DISH_IMAGE_PRESETS } from "@/lib/imageUtils";

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
            Action réservée au propriétaire. Multi-restaurants selon votre plan : FREE 1, PRO 3, BUSINESS illimité.
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
  imageUrl?: string;
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
  const [imageUrl, setImageUrl] = useState("");
  const [imageMode, setImageMode] = useState<"file" | "url" | "presets">("file");
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [pending, setPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setName("");
    setDescription("");
    setPrice("");
    setCategoryId("");
    setPrep("");
    setImageUrl("");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsProcessingImage(true);
      const dataUrl = await fileToDataUrl(file, 800, 800);
      setImageUrl(dataUrl);
    } catch (err) {
      console.error("Image read error:", err);
    } finally {
      setIsProcessingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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
        imageUrl: imageUrl.trim() || undefined,
      });
      resetForm();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter un plat au menu</DialogTitle>
          <DialogDescription>
            Renseignez les détails du plat, son prix et une photo pour le rendre attrayant aux clients.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Photo du plat */}
          <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-3.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <ImageIcon className="size-4 text-primary" />
                Photo du plat
              </Label>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="text-xs text-destructive hover:underline flex items-center gap-1"
                >
                  <Trash2 className="size-3" /> Supprimer
                </button>
              )}
            </div>

            {imageUrl ? (
              <div className="relative group rounded-lg overflow-hidden border border-border bg-black/5 aspect-video sm:aspect-2/1 flex items-center justify-center">
                <img
                  src={imageUrl}
                  alt="Aperçu du plat"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 text-xs bg-white text-black hover:bg-neutral-100"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Changer de photo
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setImageUrl("")}
                  >
                    Retirer
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex rounded-lg border border-border bg-background p-0.5 text-xs font-medium mb-2.5">
                  <button
                    type="button"
                    onClick={() => setImageMode("file")}
                    className={`flex-1 py-1 rounded-md transition-colors ${
                      imageMode === "file"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Importer fichier
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageMode("presets")}
                    className={`flex-1 py-1 rounded-md transition-colors ${
                      imageMode === "presets"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Suggestions locales
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageMode("url")}
                    className={`flex-1 py-1 rounded-md transition-colors ${
                      imageMode === "url"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Lien web (URL)
                  </button>
                </div>

                {imageMode === "file" && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-background/80 hover:bg-muted/40 transition-colors cursor-pointer p-4 text-center"
                  >
                    {isProcessingImage ? (
                      <Loader2 className="size-6 animate-spin text-primary" />
                    ) : (
                      <>
                        <Upload className="size-6 text-muted-foreground mb-1.5" />
                        <p className="text-xs font-medium text-foreground">
                          Cliquez pour choisir une photo ou glissez-déposez
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          PNG, JPG, WebP (compressée automatiquement)
                        </p>
                      </>
                    )}
                  </div>
                )}

                {imageMode === "presets" && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground">
                      Cliquez sur une suggestion de spécialité camerounaise :
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {DISH_IMAGE_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setImageUrl(preset.url)}
                          className="group text-left rounded-lg border border-border/60 hover:border-primary overflow-hidden bg-background p-1 text-[11px] transition-all hover:shadow-xs"
                        >
                          <img
                            src={preset.url}
                            alt={preset.name}
                            className="w-full h-14 object-cover rounded-md mb-1 group-hover:scale-105 transition-transform"
                          />
                          <p className="font-medium truncate text-foreground px-0.5">
                            {preset.name}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {imageMode === "url" && (
                  <div className="space-y-1.5">
                    <Input
                      type="url"
                      placeholder="https://images.unsplash.com/.../plat.jpg"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Collez l'URL directe d'une photo hébergée sur le web.
                    </p>
                  </div>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="i-name">Nom du plat *</Label>
            <Input
              id="i-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Poulet DG braisé aux plantains"
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
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
              placeholder="ex: Cuisiné avec légumes frais, poivrons et plantains mûrs"
            />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Ajouter au menu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditItemDialog({
  open,
  onOpenChange,
  item,
  categories,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: {
    id: string;
    name: string;
    description: string | null;
    priceFcfa: number;
    categoryId: string | null;
    imageUrl?: string | null;
  } | null;
  categories: { id: string; name: string }[];
  onSave: (data: {
    id: string;
    name: string;
    description?: string;
    priceFcfa: number;
    categoryId?: string;
    imageUrl?: string | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageMode, setImageMode] = useState<"file" | "url" | "presets">("file");
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [pending, setPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (item) {
      setName(item.name || "");
      setDescription(item.description || "");
      setPrice(String(item.priceFcfa || ""));
      setCategoryId(item.categoryId || "");
      setImageUrl(item.imageUrl || "");
    }
  }, [item]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsProcessingImage(true);
      const dataUrl = await fileToDataUrl(file, 800, 800);
      setImageUrl(dataUrl);
    } catch (err) {
      console.error("Image read error:", err);
    } finally {
      setIsProcessingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const submit = async () => {
    if (!item) return;
    const priceNum = Number(price.replace(/\s/g, ""));
    if (!name.trim() || !Number.isFinite(priceNum) || priceNum <= 0 || pending)
      return;
    setPending(true);
    try {
      await onSave({
        id: item.id,
        name: name.trim(),
        description: description.trim() || undefined,
        priceFcfa: priceNum,
        categoryId: categoryId || undefined,
        imageUrl: imageUrl.trim() || null,
      });
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le plat</DialogTitle>
          <DialogDescription>
            Modifiez les informations, le tarif et la photo de ce plat.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Photo du plat */}
          <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-3.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <ImageIcon className="size-4 text-primary" />
                Photo du plat
              </Label>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="text-xs text-destructive hover:underline flex items-center gap-1"
                >
                  <Trash2 className="size-3" /> Supprimer
                </button>
              )}
            </div>

            {imageUrl ? (
              <div className="relative group rounded-lg overflow-hidden border border-border bg-black/5 aspect-video sm:aspect-2/1 flex items-center justify-center">
                <img
                  src={imageUrl}
                  alt="Aperçu du plat"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 text-xs bg-white text-black hover:bg-neutral-100"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Changer de photo
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setImageUrl("")}
                  >
                    Retirer
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex rounded-lg border border-border bg-background p-0.5 text-xs font-medium mb-2.5">
                  <button
                    type="button"
                    onClick={() => setImageMode("file")}
                    className={`flex-1 py-1 rounded-md transition-colors ${
                      imageMode === "file"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Importer fichier
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageMode("presets")}
                    className={`flex-1 py-1 rounded-md transition-colors ${
                      imageMode === "presets"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Suggestions locales
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageMode("url")}
                    className={`flex-1 py-1 rounded-md transition-colors ${
                      imageMode === "url"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Lien web (URL)
                  </button>
                </div>

                {imageMode === "file" && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-background/80 hover:bg-muted/40 transition-colors cursor-pointer p-4 text-center"
                  >
                    {isProcessingImage ? (
                      <Loader2 className="size-6 animate-spin text-primary" />
                    ) : (
                      <>
                        <Upload className="size-6 text-muted-foreground mb-1.5" />
                        <p className="text-xs font-medium text-foreground">
                          Cliquez pour choisir une photo ou glissez-déposez
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          PNG, JPG, WebP
                        </p>
                      </>
                    )}
                  </div>
                )}

                {imageMode === "presets" && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground">
                      Cliquez sur une suggestion :
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {DISH_IMAGE_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setImageUrl(preset.url)}
                          className="group text-left rounded-lg border border-border/60 hover:border-primary overflow-hidden bg-background p-1 text-[11px] transition-all hover:shadow-xs"
                        >
                          <img
                            src={preset.url}
                            alt={preset.name}
                            className="w-full h-14 object-cover rounded-md mb-1 group-hover:scale-105 transition-transform"
                          />
                          <p className="font-medium truncate text-foreground px-0.5">
                            {preset.name}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {imageMode === "url" && (
                  <div className="space-y-1.5">
                    <Input
                      type="url"
                      placeholder="https://..."
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-name">Nom du plat *</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom du plat"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-price">Prix (FCFA) *</Label>
            <Input
              id="edit-price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="numeric"
              placeholder="Prix en FCFA"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-cat">Catégorie</Label>
            <select
              id="edit-cat"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
            <Label htmlFor="edit-desc">Description</Label>
            <Input
              id="edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
            />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Enregistrer les modifications
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
  avatarUrl?: string | null;
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
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);
  const [pending, setPending] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit =
    fullName.trim().length >= 2 && emailOk && password.length >= 8 && !pending;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsProcessingAvatar(true);
      const dataUrl = await fileToDataUrl(file, 256, 256);
      setAvatarUrl(dataUrl);
    } catch (err) {
      console.error("Avatar read error:", err);
    } finally {
      setIsProcessingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setPending(true);
    try {
      await onCreate({
        fullName,
        email,
        password,
        role,
        avatarUrl: avatarUrl.trim() || null,
      });
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("waiter");
      setAvatarUrl("");
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
          {/* Photo de profil */}
          <div className="flex items-center gap-4">
            <div
              onClick={() => avatarInputRef.current?.click()}
              className="relative size-16 rounded-full border-2 border-dashed border-border hover:border-primary cursor-pointer overflow-hidden bg-muted flex items-center justify-center transition-colors shrink-0"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="size-full object-cover" />
              ) : isProcessingAvatar ? (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="size-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Photo de profil</p>
              <p className="text-xs text-muted-foreground">Optionnel — visible par les clients lors du suivi de commande.</p>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => setAvatarUrl("")}
                  className="text-xs text-destructive hover:underline mt-1 flex items-center gap-1"
                >
                  <X className="size-3" /> Supprimer
                </button>
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

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