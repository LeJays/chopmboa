import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useAction, api } from "@/lib/neon-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Check,
  Compass,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  Save,
  Sparkles,
  Store,
  Trash2,
  Upload,
  Wallet,
  Coins,
} from "lucide-react";
import { mapRestaurant, type UIRestaurant } from "@/lib/neonMappers";
import { fileToDataUrl, RESTAURANT_LOGO_PRESETS } from "@/lib/imageUtils";

const CITY_PRESETS = [
  { name: "Douala (Akwa)", lat: 4.0511, lng: 9.7085, city: "Douala" },
  { name: "Douala (Bonanjo)", lat: 4.0450, lng: 9.6890, city: "Douala" },
  { name: "Yaoundé (Centre-ville)", lat: 3.8667, lng: 11.5167, city: "Yaoundé" },
  { name: "Yaoundé (Bastos)", lat: 3.8920, lng: 11.5120, city: "Yaoundé" },
  { name: "Bafoussam", lat: 5.4778, lng: 10.4176, city: "Bafoussam" },
  { name: "Kribi", lat: 2.9372, lng: 9.9100, city: "Kribi" },
];

export default function RestaurantSettings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedRestaurantId = searchParams.get("restaurantId");

  const listMine = useAction(api.restaurants.listMine);
  const updateSettings = useAction(api.restaurants.updateSettings);

  const [restaurants, setRestaurants] = useState<UIRestaurant[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detectingGps, setDetectingGps] = useState(false);
  const [logoMode, setLogoMode] = useState<"file" | "presets" | "url">("file");
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [landmark, setLandmark] = useState("");

  // Payment states (Mobile Money & Cash)
  const [momoActive, setMomoActive] = useState(false);
  const [momoNumber, setMomoNumber] = useState("");
  const [momoName, setMomoName] = useState("");
  const [omActive, setOmActive] = useState(false);
  const [omNumber, setOmNumber] = useState("");
  const [omName, setOmName] = useState("");
  const [cashActive, setCashActive] = useState(true);
  const [paymentInstructions, setPaymentInstructions] = useState("");

  const loadRestaurants = async () => {
    try {
      setLoading(true);
      const rows = await listMine();
      const mapped = (rows || []).map(mapRestaurant);
      setRestaurants(mapped);

      if (mapped.length > 0) {
        const active =
          (requestedRestaurantId && mapped.find((r) => r.id === requestedRestaurantId)) ||
          mapped[0];
        setSelectedId(active.id);
        populateForm(active);
      }
    } catch (err) {
      console.error(err);
      toast.error("Impossible de charger les établissements.");
    } finally {
      setLoading(false);
    }
  };

  const populateForm = (r: UIRestaurant) => {
    setName(r.name || "");
    setDescription(r.description || "");
    setAddress(r.address || "");
    setCity(r.city || "");
    setPhone(r.phone || "");
    setLogoUrl(r.logoUrl || "");
    setLatitude(r.latitude != null ? String(r.latitude) : "");
    setLongitude(r.longitude != null ? String(r.longitude) : "");
    setLandmark(r.landmark || "");
    setMomoActive(r.momoActive ?? false);
    setMomoNumber(r.momoNumber || "");
    setMomoName(r.momoName || "");
    setOmActive(r.omActive ?? false);
    setOmNumber(r.omNumber || "");
    setOmName(r.omName || "");
    setCashActive(r.cashActive ?? true);
    setPaymentInstructions(r.paymentInstructions || "");
  };

  useEffect(() => {
    void loadRestaurants();
  }, []);

  const handleRestaurantSwitch = (id: string) => {
    setSelectedId(id);
    const found = restaurants.find((r) => r.id === id);
    if (found) {
      populateForm(found);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsProcessingLogo(true);
      const dataUrl = await fileToDataUrl(file, 400, 400);
      setLogoUrl(dataUrl);
      toast.success("Logo chargé avec succès !");
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de la lecture du logo.");
    } finally {
      setIsProcessingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleDetectGps = () => {
    if (!("geolocation" in navigator)) {
      toast.error("La géolocalisation n'est pas prise en charge par votre navigateur.");
      return;
    }

    setDetectingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDetectingGps(false);
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        setLatitude(lat);
        setLongitude(lng);
        toast.success(`Position GPS détectée : ${lat}, ${lng}`);
      },
      (err) => {
        setDetectingGps(false);
        console.warn("GPS error:", err);
        toast.error(
          err.code === 1
            ? "Accès à la géolocalisation refusé. Veuillez autoriser la localisation ou saisir les coordonnées manuellement."
            : "Impossible de déterminer votre position GPS actuelle."
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSave = async () => {
    if (!selectedId) return;
    if (!name.trim()) {
      toast.error("Le nom du restaurant est obligatoire.");
      return;
    }

    const latNum = latitude.trim() ? Number(latitude.replace(",", ".")) : null;
    const lngNum = longitude.trim() ? Number(longitude.replace(",", ".")) : null;

    if (latitude.trim() && (isNaN(Number(latNum)) || latNum! < -90 || latNum! > 90)) {
      toast.error("La latitude saisie n'est pas valide (doit être comprise entre -90 et 90).");
      return;
    }
    if (longitude.trim() && (isNaN(Number(lngNum)) || lngNum! < -180 || lngNum! > 180)) {
      toast.error("La longitude saisie n'est pas valide (doit être comprise entre -180 et 180).");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateSettings({
        restaurantId: selectedId,
        name: name.trim(),
        description: description.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        phone: phone.trim() || null,
        logoUrl: logoUrl.trim() || null,
        latitude: latNum,
        longitude: lngNum,
        landmark: landmark.trim() || null,
        momoActive,
        momoNumber: momoNumber.trim() || null,
        momoName: momoName.trim() || null,
        omActive,
        omNumber: omNumber.trim() || null,
        omName: omName.trim() || null,
        cashActive,
        paymentInstructions: paymentInstructions.trim() || null,
      });

      toast.success("Paramètres du restaurant mis à jour avec succès !");

      // Update local state list
      const mapped = mapRestaurant(updated);
      setRestaurants((prev) => prev.map((r) => (r.id === selectedId ? mapped : r)));
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const selectedRestaurant = restaurants.find((r) => r.id === selectedId);

  return (
    <div className="min-h-screen bg-muted/20 pb-16">
      {/* Top Header */}
      <div className="border-b border-border bg-background/95 backdrop-blur-xs sticky top-0 z-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/dashboard")}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Tableau de bord
            </Button>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <Store className="size-5 text-primary" />
                Paramètres de l'établissement
              </h1>
              <p className="text-xs text-muted-foreground">
                Logo, repère d'accès, position GPS et coordonnées publiques
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {restaurants.length > 1 && (
              <select
                value={selectedId}
                onChange={(e) => handleRestaurantSwitch(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-xs font-medium shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.city || "Cameroun"})
                  </option>
                ))}
              </select>
            )}

            <Button
              onClick={handleSave}
              disabled={saving || loading || !selectedId}
              className="gap-2 shadow-xs"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Enregistrer
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Chargement des paramètres...</p>
          </div>
        ) : !selectedRestaurant ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="size-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-base font-semibold">Aucun restaurant trouvé</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Veuillez d'abord créer un restaurant depuis le tableau de bord.
              </p>
              <Button onClick={() => navigate("/dashboard")}>Retour au tableau de bord</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 columns: Form fields */}
            <div className="lg:col-span-2 space-y-6">
              {/* 1. Identité visuelle & Logo */}
              <Card className="border-border/70 shadow-xs">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ImageIcon className="size-4 text-primary" />
                    Logo de l'établissement
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Le logo sera affiché sur la page de menu scannée par vos clients et sur vos factures.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    {/* Logo Avatar Display */}
                    <div className="relative size-24 rounded-2xl border-2 border-border overflow-hidden bg-muted/40 flex items-center justify-center shrink-0 shadow-inner group">
                      {logoUrl ? (
                        <>
                          <img
                            src={logoUrl}
                            alt={name || "Logo du restaurant"}
                            className="size-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => setLogoUrl("")}
                            className="absolute inset-0 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-[10px] font-medium"
                          >
                            <Trash2 className="size-4 mb-1" />
                            Supprimer
                          </button>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-muted-foreground/60 p-2 text-center">
                          <Store className="size-8 stroke-[1.5]" />
                          <span className="text-[10px] mt-1 font-medium">Sans logo</span>
                        </div>
                      )}
                    </div>

                    {/* Logo upload controls */}
                    <div className="flex-1 w-full space-y-2">
                      <div className="flex rounded-lg border border-border bg-muted/20 p-0.5 text-xs font-medium">
                        <button
                          type="button"
                          onClick={() => setLogoMode("file")}
                          className={`flex-1 py-1 rounded-md transition-colors ${
                            logoMode === "file"
                              ? "bg-background text-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Fichier local
                        </button>
                        <button
                          type="button"
                          onClick={() => setLogoMode("presets")}
                          className={`flex-1 py-1 rounded-md transition-colors ${
                            logoMode === "presets"
                              ? "bg-background text-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Modèles
                        </button>
                        <button
                          type="button"
                          onClick={() => setLogoMode("url")}
                          className={`flex-1 py-1 rounded-md transition-colors ${
                            logoMode === "url"
                              ? "bg-background text-foreground shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Lien Web
                        </button>
                      </div>

                      {logoMode === "file" && (
                        <div
                          onClick={() => logoInputRef.current?.click()}
                          className="flex items-center justify-between gap-3 p-3 rounded-lg border border-dashed border-border bg-background hover:bg-muted/40 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2 text-xs">
                            <Upload className="size-4 text-muted-foreground" />
                            <span className="font-medium text-foreground">
                              {isProcessingLogo ? "Optimisation..." : "Choisir une image (PNG, JPG, SVG)"}
                            </span>
                          </div>
                          <Button size="sm" variant="outline" className="h-7 text-xs">
                            Parcourir
                          </Button>
                        </div>
                      )}

                      {logoMode === "presets" && (
                        <div className="grid grid-cols-4 gap-2 pt-1">
                          {RESTAURANT_LOGO_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => setLogoUrl(preset.url)}
                              className="group relative rounded-lg border border-border/80 hover:border-primary overflow-hidden bg-background p-1 transition-all"
                            >
                              <img
                                src={preset.url}
                                alt={preset.name}
                                className="w-full h-12 object-cover rounded-md group-hover:scale-105 transition-transform"
                              />
                              <p className="text-[10px] font-medium truncate text-muted-foreground mt-0.5 px-0.5 text-center">
                                {preset.name}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}

                      {logoMode === "url" && (
                        <Input
                          type="url"
                          placeholder="https://.../logo.png"
                          value={logoUrl}
                          onChange={(e) => setLogoUrl(e.target.value)}
                          className="text-xs h-8"
                        />
                      )}

                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 2. Repère d'accès & Description du lieu */}
              <Card className="border-border/70 shadow-xs border-l-4 border-l-primary">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="size-4 text-primary" />
                      Repère géographique & Accès au lieu
                    </CardTitle>
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      Essentiel pour clients & livreurs
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Permet d'orienter facilement vos clients, chauffeurs Yango et livreurs jusqu'à votre restaurant.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Point de repère proéminent */}
                  <div className="space-y-2 p-3.5 rounded-xl border border-primary/20 bg-primary/5">
                    <Label
                      htmlFor="rest-landmark"
                      className="text-sm font-semibold text-foreground flex items-center justify-between"
                    >
                      <span className="flex items-center gap-1.5">
                        📍 Point de repère (Indication d'accès)
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">
                        ex: En face Tecno
                      </span>
                    </Label>
                    <Input
                      id="rest-landmark"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      placeholder="ex: En face Tecno, à côté de la station Total, 2ème carrefour..."
                      className="bg-background text-sm font-medium border-primary/30 focus-visible:ring-primary"
                    />
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Ce repère sera affiché sur la bannière de votre menu en ligne et facilitera la livraison de commandes.
                    </p>
                  </div>

                  {/* Description générale */}
                  <div className="space-y-2">
                    <Label htmlFor="rest-desc" className="text-sm font-medium">
                      Description & Spécialités du restaurant
                    </Label>
                    <Textarea
                      id="rest-desc"
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Spécialités de grillades camerounaises, poissons braisés, ndolé royal et cocktails frais. Service chaleureux et terrasse ventilée."
                      className="text-xs leading-relaxed"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* 3. Position GPS & Coordonnées */}
              <Card className="border-border/70 shadow-xs">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Compass className="size-4 text-primary" />
                      Position GPS & Itinéraire Google Maps
                    </CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDetectGps}
                      disabled={detectingGps}
                      className="h-8 gap-1.5 text-xs text-primary hover:text-primary"
                    >
                      {detectingGps ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <LocateFixed className="size-3.5" />
                      )}
                      Détecter ma position GPS
                    </Button>
                  </div>
                  <CardDescription className="text-xs">
                    Renseignez vos coordonnées GPS précises pour permettre aux clients d'ouvrir l'itinéraire en 1 clic.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="rest-lat" className="text-xs font-medium">
                        Latitude GPS
                      </Label>
                      <Input
                        id="rest-lat"
                        type="text"
                        inputMode="decimal"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        placeholder="ex: 4.051056"
                        className="text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rest-lng" className="text-xs font-medium">
                        Longitude GPS
                      </Label>
                      <Input
                        id="rest-lng"
                        type="text"
                        inputMode="decimal"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        placeholder="ex: 9.708534"
                        className="text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Villes camerounaises en raccourci */}
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[11px] text-muted-foreground">
                      Coordonnées de référence par ville :
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {CITY_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => {
                            setLatitude(String(preset.lat));
                            setLongitude(String(preset.lng));
                            if (!city) setCity(preset.city);
                          }}
                          className="text-[11px] px-2 py-0.5 rounded-md border border-border bg-background hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bouton tester sur Google Maps */}
                  {latitude && longitude && (
                    <div className="pt-2 flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
                      <span className="flex items-center gap-1.5 text-foreground font-medium">
                        <Navigation className="size-3.5 text-primary" />
                        Coordonnées prêtes : {latitude}, {longitude}
                      </span>
                      <a
                        href={`https://www.google.com/maps?q=${latitude},${longitude}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-primary hover:underline font-semibold"
                      >
                        Tester sur Google Maps
                        <ExternalLink className="size-3" />
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 4. Informations générales & Téléphone */}
              <Card className="border-border/70 shadow-xs">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="size-4 text-primary" />
                    Informations générales & Contact
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="rest-name" className="text-xs font-medium">
                        Nom de l'établissement *
                      </Label>
                      <Input
                        id="rest-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Le Jardin du Mboa"
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rest-city" className="text-xs font-medium">
                        Ville
                      </Label>
                      <Input
                        id="rest-city"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Douala, Yaoundé..."
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="rest-address" className="text-xs font-medium">
                        Adresse physique (Quartier, Rue)
                      </Label>
                      <Input
                        id="rest-address"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Boulevard de la Liberté, Akwa"
                        className="text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rest-phone" className="text-xs font-medium">
                        Numéro de téléphone / WhatsApp
                      </Label>
                      <Input
                        id="rest-phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+237 6 00 00 00 00"
                        className="text-xs"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 5. Modes de paiement acceptés (Mobile Money & Cash) */}
              <Card className="border-border/70 shadow-xs border-l-4 border-l-orange-500">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Wallet className="size-4 text-orange-500" />
                      Configuration des Paiements (Mobile Money & Cash)
                    </CardTitle>
                    <Badge variant="outline" className="text-[11px] font-normal border-orange-200 text-orange-600 bg-orange-50">
                      Spécificité Cameroun (MoMo, OM)
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Définissez comment vos clients régleront leurs commandes de repas (livraison ou sur place).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Option Cash / Sur Place */}
                  <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
                    <div className="space-y-0.5">
                      <Label htmlFor="payment-cash" className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                        <Coins className="size-3.5 text-yellow-600" />
                        Paiement en espèces (Cash)
                      </Label>
                      <p className="text-[10.5px] text-muted-foreground">
                        Permet aux clients de payer en cash à la livraison ou à la caisse.
                      </p>
                    </div>
                    <Switch
                      id="payment-cash"
                      checked={cashActive}
                      onCheckedChange={setCashActive}
                    />
                  </div>

                  {/* MTN MoMo Configuration */}
                  <div className="space-y-3 p-4 rounded-xl border border-amber-200/50 bg-amber-50/20">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="payment-momo" className="text-xs font-bold text-amber-700 flex items-center gap-1.5 cursor-pointer">
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400" />
                          MTN Mobile Money
                        </Label>
                        <p className="text-[10.5px] text-muted-foreground">
                          Accepter les transferts vers votre numéro MTN MoMo.
                        </p>
                      </div>
                      <Switch
                        id="payment-momo"
                        checked={momoActive}
                        onCheckedChange={setMomoActive}
                      />
                    </div>

                    {momoActive && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-amber-100/50">
                        <div className="space-y-1.5">
                          <Label htmlFor="momo-num" className="text-[11px] font-medium text-amber-900">
                            Numéro MTN MoMo (9 chiffres) *
                          </Label>
                          <Input
                            id="momo-num"
                            value={momoNumber}
                            onChange={(e) => setMomoNumber(e.target.value.replace(/\s+/g, ""))}
                            placeholder="677XXXXXX"
                            className="text-xs bg-background border-amber-200 focus-visible:ring-amber-400"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="momo-name" className="text-[11px] font-medium text-amber-900">
                            Nom du compte MoMo (Reconnaissance client) *
                          </Label>
                          <Input
                            id="momo-name"
                            value={momoName}
                            onChange={(e) => setMomoName(e.target.value)}
                            placeholder="Nom affiché lors du transfert"
                            className="text-xs bg-background border-amber-200 focus-visible:ring-amber-400"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Orange Money Configuration */}
                  <div className="space-y-3 p-4 rounded-xl border border-orange-200/50 bg-orange-50/20">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="payment-om" className="text-xs font-bold text-orange-700 flex items-center gap-1.5 cursor-pointer">
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500" />
                          Orange Money (OM)
                        </Label>
                        <p className="text-[10.5px] text-muted-foreground">
                          Accepter les transferts vers votre numéro Orange Money.
                        </p>
                      </div>
                      <Switch
                        id="payment-om"
                        checked={omActive}
                        onCheckedChange={setOmActive}
                      />
                    </div>

                    {omActive && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-orange-100/50">
                        <div className="space-y-1.5">
                          <Label htmlFor="om-num" className="text-[11px] font-medium text-orange-900">
                            Numéro Orange Money (9 chiffres) *
                          </Label>
                          <Input
                            id="om-num"
                            value={omNumber}
                            onChange={(e) => setOmNumber(e.target.value.replace(/\s+/g, ""))}
                            placeholder="699XXXXXX"
                            className="text-xs bg-background border-orange-200 focus-visible:ring-orange-400"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="om-name" className="text-[11px] font-medium text-orange-900">
                            Nom du compte OM (Reconnaissance client) *
                          </Label>
                          <Input
                            id="om-name"
                            value={omName}
                            onChange={(e) => setOmName(e.target.value)}
                            placeholder="Nom affiché lors du transfert"
                            className="text-xs bg-background border-orange-200 focus-visible:ring-orange-400"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Consignes de paiement spéciales */}
                  <div className="space-y-1.5">
                    <Label htmlFor="payment-instructions" className="text-xs font-medium">
                      Instructions de paiement spéciales pour le client
                    </Label>
                    <Textarea
                      id="payment-instructions"
                      value={paymentInstructions}
                      onChange={(e) => setPaymentInstructions(e.target.value)}
                      placeholder="Ex: Veuillez faire le dépôt MTN MoMo/OM au numéro ci-dessus et mentionner le numéro de commande en référence, ou présenter le reçu SMS au livreur à son arrivée."
                      className="text-xs min-h-[80px]"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Ces instructions s'afficheront sur le reçu de commande du client après validation.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right column: Live Preview Card */}
            <div className="space-y-6">
              <div className="sticky top-24 space-y-4">
                <Card className="border-border/80 shadow-md overflow-hidden bg-background">
                  <div className="bg-primary/10 border-b border-primary/20 px-4 py-2.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                      <Sparkles className="size-3.5" /> Aperçu Menu Client
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-background">
                      En direct
                    </Badge>
                  </div>
                  <CardContent className="p-4 space-y-4">
                    {/* Header preview */}
                    <div className="flex items-start gap-3">
                      <div className="size-16 rounded-xl border border-border bg-muted/40 overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt="Logo"
                            className="size-full object-cover"
                          />
                        ) : (
                          <Store className="size-7 text-muted-foreground/50" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-base text-foreground leading-tight truncate">
                          {name || "Nom du restaurant"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {city || "Cameroun"} · Menu interactif
                        </p>
                        <Badge
                          variant="secondary"
                          className="mt-1.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        >
                          ● Ouvert & Disponible
                        </Badge>
                      </div>
                    </div>

                    {/* Landmark badge preview */}
                    {landmark ? (
                      <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 flex items-start gap-2">
                        <MapPin className="size-4 text-primary shrink-0 mt-0.5" />
                        <div className="text-xs">
                          <span className="font-semibold text-foreground">Repère d'accès : </span>
                          <span className="text-primary font-medium">{landmark}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border p-2.5 text-center text-xs text-muted-foreground">
                        Aucun point de repère configuré (ex: En face Tecno)
                      </div>
                    )}

                    {/* Description preview */}
                    {description && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                        {description}
                      </p>
                    )}

                    {/* Address & Phone preview */}
                    <div className="space-y-1.5 pt-2 border-t border-border/60 text-xs text-muted-foreground">
                      {(address || city) && (
                        <div className="flex items-center gap-2">
                          <Building2 className="size-3.5 shrink-0" />
                          <span className="truncate">
                            {[address, city].filter(Boolean).join(", ")}
                          </span>
                        </div>
                      )}
                      {phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="size-3.5 shrink-0" />
                          <span>{phone}</span>
                        </div>
                      )}
                      {latitude && longitude && (
                        <div className="flex items-center gap-2 text-primary font-medium">
                          <Navigation className="size-3.5 shrink-0" />
                          <span>GPS : {latitude}, {longitude}</span>
                        </div>
                      )}
                    </div>

                    {/* Action button preview */}
                    <Button
                      className="w-full mt-2"
                      size="sm"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? (
                        <Loader2 className="size-3.5 animate-spin mr-1.5" />
                      ) : (
                        <Check className="size-3.5 mr-1.5" />
                      )}
                      Enregistrer ces paramètres
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
