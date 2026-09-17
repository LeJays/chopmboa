import { useAuth } from "@/hooks/use-auth";
import { useAction, useMutation, api } from "@/lib/neon-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BarChart3,
  Check,
  ChefHat,
  ClipboardList,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Settings,
  Sparkles,
  Store,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
  Zap,
  CreditCard,
  ShoppingBag,
  Star,
  Mail,
  Phone,
} from "lucide-react";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  PLANS,
  formatFcfa,
  formatDateTime,
  ORDER_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  TABLE_STATUS_LABELS,
} from "@/lib/chopmboa";
import {
  mapRestaurant,
  mapOrder,
  mapItem,
  mapCategory,
  mapTable,
  mapAudit,
  type UIRestaurant,
  type UIOrder,
  type UIMenuItem,
  type UIMenuCategory,
  type UITable,
  type UIAuditLog,
  type UIMember,
  type UIKpis,
} from "@/lib/neonMappers";
import { usePollAction } from "@/hooks/use-poll";
import { useStaffContext, ROLE_HOME, type StaffContext } from "@/hooks/use-staff-context";
import logo from "@/assets/logo.svg";
import {
  CreateRestaurantDialog,
  CreateItemDialog,
  EditItemDialog,
  CreateTableDialog,
  CreateCategoryDialog,
  CreateOrderDialog,
  StaffDialog,
  EditStaffDialog,
  STAFF_ROLES,
  type StaffDraft,
  type EditStaffDraft,
} from "@/components/dashboard/dialogs";
import {
  KpiCard,
  EmptyState,
  RevenueBars,
  StatusBadge,
} from "@/components/dashboard/widgets";
import { KitchenView, PosView, WaiterView, DeliveriesView } from "./RoleWorkspaces";

const ROLE_LABELS: Record<string, string> = {
  manager: "Gérant",
  kitchen: "Cuisine",
  cashier: "Caisse",
  delivery: "Livreur",
  waiter: "Serveur",
};

type PlanInfo = {
  planCode: "free" | "pro" | "business";
  planName: string;
  maxRestaurants: number;
  maxTablesPerRestaurant: number;
  status: "trial" | "active" | "expired" | "cancelled";
  inTrial: boolean;
  trialEndsAt?: number;
  trialDaysLeft?: number;
};

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paramRestaurantId = searchParams.get("restaurantId");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<UIMenuItem | null>(null);
  const [newTableOpen, setNewTableOpen] = useState(false);
  const [newRestaurantOpen, setNewRestaurantOpen] = useState(false);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newStaffOpen, setNewStaffOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<UIMember | null>(null);
  const [qrTable, setQrTable] = useState<UITable | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrMenuUrl, setQrMenuUrl] = useState<string>("");
  const [confirmSeedOpen, setConfirmSeedOpen] = useState(false);
  const [seedPending, setSeedPending] = useState(false);

  /* ------------------------- Neon-backed data ------------------------- */
  const restaurantsPoll = usePollAction<unknown[]>(api.restaurants.listMine, {});
  const planPoll = usePollAction<PlanInfo>(api.plans.effective, {});
  const membersPoll = usePollAction<unknown[]>(
    api.restaurants.listMembers,
    selectedId ? { restaurantId: selectedId } : null,
  );
  const kpisPoll = usePollAction<UIKpis>(
    api.restaurants.kpis,
    selectedId ? { restaurantId: selectedId } : null,
  );
  const ordersPoll = usePollAction<unknown[]>(
    api.orders.listRecent,
    selectedId ? { restaurantId: selectedId, limit: 25 } : null,
  );
  const menuPoll = usePollAction<unknown[]>(
    api.menu.listItems,
    selectedId ? { restaurantId: selectedId } : null,
  );
  const categoriesPoll = usePollAction<unknown[]>(
    api.menu.listCategories,
    selectedId ? { restaurantId: selectedId } : null,
  );
  const tablesPoll = usePollAction<unknown[]>(
    api.tables.list,
    selectedId ? { restaurantId: selectedId } : null,
  );
  const tableUsagePoll = usePollAction<{ count: number; max: number; canAdd: boolean }>(
    api.tables.usage,
    selectedId ? { restaurantId: selectedId } : null,
  );
  const auditPoll = usePollAction<unknown[]>(
    api.audit.listByRestaurant,
    selectedId ? { restaurantId: selectedId } : null,
  );

  const restaurants: UIRestaurant[] = (restaurantsPoll.data ?? []).map((r) =>
    mapRestaurant(r as never),
  );
  const planInfo = planPoll.data;
  const orders: UIOrder[] = (ordersPoll.data ?? []).map((o) => mapOrder(o as never));
  const menuItems: UIMenuItem[] = (menuPoll.data ?? []).map((i) => mapItem(i as never));
  const categories: UIMenuCategory[] = (categoriesPoll.data ?? []).map((c) =>
    mapCategory(c as never),
  );
  const tables: UITable[] = (tablesPoll.data ?? []).map((t) => mapTable(t as never));
  const auditLogs: UIAuditLog[] = (auditPoll.data ?? []).map((l) => mapAudit(l as never));
  const members: UIMember[] = (membersPoll.data ?? []).map((m) => {
    const row = m as {
      id: string;
      role: string;
      full_name: string;
      email: string | null;
      phone?: string | null;
      avatar_url?: string | null;
      user_id?: string;
      is_owner: boolean;
    };
    return {
      id: row.id,
      role: row.role,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone ?? null,
      avatarUrl: row.avatar_url ?? null,
      userId: row.user_id,
      isOwner: row.is_owner,
    };
  });

  /* --------------------------- mutations ------------------------------ */
  const createRestaurant = useAction(api.restaurants.create);
  const createCategoryAction = useAction(api.menu.createCategory);
  const createOrderAction = useAction(api.orders.create);
  const createStaff = useAction(api.staff.createAndAssign);
  const updateStaff = useAction(api.staff.update);
  const changeStaffRole = useAction(api.staff.changeRole);
  const removeStaff = useAction(api.staff.remove);
  const createItem = useAction(api.menu.createItem);
  const updateItem = useAction(api.menu.updateItem);
  const deleteItem = useAction(api.menu.deleteItem);
  const createTable = useAction(api.tables.create);
  const cycleTable = useAction(api.tables.cycleStatus);
  const removeTable = useAction(api.tables.remove);
  const setOrderStatus = useAction(api.orders.setStatus);
  const markPaid = useAction(api.orders.markPaid);
  const activatePlan = useAction(api.plans.activate);
  const seedDemo = useAction(api.demoSeed.seedForCurrentUser);
  const ensurePlansAction = useAction(api.plans.ensure);
  const startTrial = useAction(api.plans.startTrialIfMissing);
  const syncPlan = useAction(api.plans.sync);

  const firstRestaurantId = restaurants?.[0]?.id ?? null;
  const activeId = selectedId ?? firstRestaurantId;

  // Connexion par rôle : un employé (caisse, cuisine, salle, livraison) qui
  // atteint /dashboard est renvoyé vers son espace de travail.
  const { context: staffContext } = useStaffContext();
  const isOwner = staffContext?.role === "owner" || (user as any)?.role === "owner";

  useEffect(() => {
    if (
      staffContext &&
      staffContext.role &&
      staffContext.role !== "owner" &&
      staffContext.role !== "manager"
    ) {
      navigate(ROLE_HOME[staffContext.role] ?? "/dashboard", { replace: true });
    }
  }, [staffContext, navigate]);

  useEffect(() => {
    if (paramRestaurantId && restaurants && restaurants.some((r) => r.id === paramRestaurantId)) {
      setSelectedId(paramRestaurantId);
    } else if (restaurants && restaurants.length > 0 && !selectedId) {
      setSelectedId(restaurants[0].id);
    }
  }, [restaurants, selectedId, paramRestaurantId]);

  useEffect(() => {
    void (async () => {
      // Catalogue → essai auto (14j accès BUSINESS) → expiration paresseuse.
      try {
        await ensurePlansAction();
        await startTrial();
        await syncPlan();
      } catch (err) {
        console.warn("Plan bootstrap:", err);
      }
    })();
  }, [ensurePlansAction, startTrial, syncPlan]);

  const refreshAll = () => {
    restaurantsPoll.refresh();
    planPoll.refresh();
    ordersPoll.refresh();
    menuPoll.refresh();
    categoriesPoll.refresh();
    tablesPoll.refresh();
    tableUsagePoll.refresh();
    auditPoll.refresh();
    kpisPoll.refresh();
    membersPoll.refresh();
  };

  type StaffRoleValue = (typeof STAFF_ROLES)[number]["value"];

  const handleStaffRole = async (m: UIMember, role: StaffRoleValue) => {
    try {
      await changeStaffRole({
        restaurantId: activeId!,
        staffId: m.id,
        role,
      });
      toast.success("Rôle mis à jour.");
      membersPoll.refresh();
      auditPoll.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Échec du changement de rôle.",
      );
    }
  };

  const handleStaffRemove = async (m: UIMember) => {
    try {
      await removeStaff({ restaurantId: activeId!, staffId: m.id });
      toast.success("Membre retiré de l'équipe.");
      membersPoll.refresh();
      auditPoll.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec du retrait.");
    }
  };

  const handleSeed = async () => {
    setSeedPending(true);
    try {
      await seedDemo();
      toast.success("Données de démonstration créées !");
      setConfirmSeedOpen(false);
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec du seed démo.");
    } finally {
      setSeedPending(false);
    }
  };

  const openQr = (t: UITable) => {
    const url = `${window.location.origin}/t/${t.qrCodeToken}`;
    setQrMenuUrl(url);
    QRCode.toDataURL(url, {
      width: 320,
      margin: 2,
      color: { dark: "#0B0B0C", light: "#FFFFFF" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
    setQrTable(t);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth?mode=signin");
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Une erreur est survenue.");
    }
  };

  if (restaurantsPoll.loading && restaurants === undefined) {
    return (
      <main className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto max-w-6xl space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      </main>
    );
  }

  if (restaurants.length === 0) {
    return (
      <main className="min-h-screen bg-background">
        <header className="border-b border-border/60">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
            <a href="/dashboard" className="flex items-center gap-2">
              <img src={logo} alt="ChopMboa" className="size-9 rounded-xl" />
              <span className="text-lg font-extrabold tracking-tight">
                ChopMboa
              </span>
            </a>
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-muted-foreground sm:block">
                {user?.email}
              </span>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                Déconnexion
              </Button>
            </div>
          </div>
        </header>
        <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-muted text-primary">
            <Store className="size-7" />
          </div>
          <h1 className="mt-6 text-2xl font-extrabold tracking-tight">
            Bienvenue{user?.name ? ` ${user.name}` : ""} !
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            {isOwner
              ? "Créez votre premier restaurant pour démarrer, ou injectez les données de démonstration camerounaises pour explorer ChopMboa."
              : "Bienvenue sur ChopMboa. Seul le propriétaire peut créer des restaurants. Veuillez patienter pendant qu'un établissement vous est attribué."}
          </p>
          {isOwner ? (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button onClick={() => setNewRestaurantOpen(true)}>
                <Plus className="size-4" />
                Créer mon restaurant
              </Button>
              <Button variant="outline" onClick={() => setConfirmSeedOpen(true)}>
                <Sparkles className="size-4" />
                Charger la démo
              </Button>
            </div>
          ) : (
            <div className="mt-8 max-w-md rounded-xl border border-border/80 bg-muted/30 p-4 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">Accès restreint aux gérants</p>
              <p className="mt-1">
                La création d'établissement est une prérogative exclusive du propriétaire. Si un établissement vous a été assigné, actualisez la page ou contactez l'administrateur.
              </p>
            </div>
          )}

          <Card className="mt-12 w-full text-left shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Votre abonnement</CardTitle>
              <CardDescription>
                {planInfo
                  ? planInfo.inTrial
                    ? `Essai BUSINESS — ${planInfo.trialDaysLeft} jour(s) restant(s), restaurants et tables illimités jusqu'au ${formatDateTime(planInfo.trialEndsAt ?? Date.now())}.`
                    : `Plan ${planInfo.planName} — ${planInfo.maxRestaurants === -1 ? "restaurants illimités" : `${planInfo.maxRestaurants} restaurant(s)`}, ${planInfo.maxTablesPerRestaurant === -1 ? "tables illimitées" : `${planInfo.maxTablesPerRestaurant} tables`}.`
                  : "Essai BUSINESS de 14 jours en cours d'activation…"}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <CreateRestaurantDialog
          open={newRestaurantOpen}
          onOpenChange={setNewRestaurantOpen}
          onCreate={async (data) => {
            if (!isOwner) {
              toast.error("Seul le propriétaire a le droit de créer un restaurant.");
              return;
            }
            try {
              await createRestaurant(data);
              toast.success("Restaurant créé !");
              setNewRestaurantOpen(false);
              refreshAll();
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Échec de la création.",
              );
            }
          }}
        />
        <Dialog open={confirmSeedOpen} onOpenChange={setConfirmSeedOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Charger les données de démo ?</DialogTitle>
              <DialogDescription>
                3 restaurants camerounais (Chez Maman, Le Petit Sahel, Grill
                House Douala) avec menus, tables et commandes seront créés pour
                votre compte.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmSeedOpen(false)}
              >
                Annuler
              </Button>
              <Button onClick={handleSeed} disabled={seedPending}>
                {seedPending && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Charger la démo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    );
  }

  const activeRestaurant =
    restaurants.find((r) => r.id === activeId) ?? restaurants[0];

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <a href="/dashboard" className="flex items-center gap-2">
              <img src={logo} alt="ChopMboa" className="size-9 rounded-xl" />
              <span className="hidden text-lg font-extrabold tracking-tight sm:block">
                ChopMboa
              </span>
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Store className="size-4 text-primary" />
                  <span className="max-w-40 truncate">
                    {activeRestaurant.name}
                  </span>
                  {restaurants.length > 1 && (
                    <Badge variant="secondary" className="ml-1">
                      {restaurants.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>Mes restaurants</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {restaurants.map((r) => (
                  <DropdownMenuItem
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={r.id === activeId ? "bg-primary-muted" : undefined}
                  >
                    <Store className="mr-2 size-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{r.name}</span>
                    {r.id === activeId && <Check className="size-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(activeId ? `/settings?restaurantId=${activeId}` : "/settings")}>
                  <Settings className="mr-2 size-4 text-primary" />
                  Paramètres de l'établissement
                </DropdownMenuItem>
                {isOwner && (
                  <>
                    <DropdownMenuItem onClick={() => navigate("/reports")}>
                      <BarChart3 className="mr-2 size-4 text-primary" />
                      Rapports comparatifs
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setNewRestaurantOpen(true)}>
                      <Plus className="mr-2 size-4" />
                      Nouveau restaurant
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(activeId ? `/settings?restaurantId=${activeId}` : "/settings")}
              className="gap-2 hidden sm:inline-flex text-xs"
            >
              <Settings className="size-4 text-primary" />
              <span>Paramètres</span>
            </Button>

            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/reports")}
                className="gap-2 hidden md:inline-flex text-xs"
              >
                <BarChart3 className="size-4 text-primary" />
                <span>Rapports</span>
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {planInfo && (
              <Badge
                variant="outline"
                className="hidden border-primary/30 bg-primary-muted text-primary sm:inline-flex"
              >
                {planInfo.inTrial
                  ? `Essai BUSINESS · ${planInfo.trialDaysLeft}j`
                  : `Plan ${planInfo.planName}`}
              </Badge>
            )}
            <span className="hidden text-sm text-muted-foreground md:block">
              {user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Déconnexion
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              {activeRestaurant.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {activeRestaurant.city ?? "Cameroun"} ·{" "}
              {activeRestaurant.isActive ? "Ouvert" : "Fermé"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setNewOrderOpen(true)}>
              <ClipboardList className="size-4" /> Commande
            </Button>
            <Button variant="outline" size="sm" onClick={() => setNewItemOpen(true)}>
              <Plus className="size-4" /> Plat
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNewCategoryOpen(true)}
            >
              <Plus className="size-4" /> Catégorie
            </Button>
            <Button variant="outline" size="sm" onClick={() => setNewTableOpen(true)}>
              <Plus className="size-4" /> Table
            </Button>
          </div>
        </div>

        {planInfo?.inTrial && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary-muted px-4 py-3">
            <Zap className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-sm leading-relaxed">
              <span className="font-bold">
                Essai BUSINESS actif — {planInfo.trialDaysLeft} jour(s) restant(s).
              </span>{" "}
              <span className="text-muted-foreground">
                Vous profitez de l'accès BUSINESS (restaurants et tables
                illimités) jusqu'au{" "}
                {formatDateTime(planInfo.trialEndsAt ?? Date.now())}. Passez à
                un plan payant pour conserver ces avantages.
              </span>
            </p>
          </div>
        )}

        {/* Espaces de travail opérationnels (Accès rapide propriétaire) */}
        <div className="mt-6 p-4 rounded-2xl border border-border bg-card shadow-2xs">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
            Accès rapide aux espaces opérationnels
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <Button
              variant="outline"
              className="h-14 justify-start gap-3 hover:border-primary hover:bg-primary/5 transition-all w-full cursor-pointer"
              onClick={() => setTab("caisse")}
            >
              <span className="text-xl">💰</span>
              <div className="text-left min-w-0">
                <p className="text-xs font-extrabold leading-tight">Caisse / POS</p>
                <p className="text-[10px] text-muted-foreground truncate leading-normal">Prise de commandes & encaissement</p>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-14 justify-start gap-3 hover:border-primary hover:bg-primary/5 transition-all w-full cursor-pointer"
              onClick={() => setTab("cuisine")}
            >
              <span className="text-xl">🍳</span>
              <div className="text-left min-w-0">
                <p className="text-xs font-extrabold leading-tight">Cuisine / KDS</p>
                <p className="text-[10px] text-muted-foreground truncate leading-normal">Écran de préparation en cuisine</p>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-14 justify-start gap-3 hover:border-primary hover:bg-primary/5 transition-all w-full cursor-pointer"
              onClick={() => setTab("serveur")}
            >
              <span className="text-xl">🏃‍♂️</span>
              <div className="text-left min-w-0">
                <p className="text-xs font-extrabold leading-tight">Service de Table</p>
                <p className="text-[10px] text-muted-foreground truncate leading-normal">Serveurs & commandes en salle</p>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-14 justify-start gap-3 hover:border-primary hover:bg-primary/5 transition-all w-full cursor-pointer"
              onClick={() => setTab("livraison")}
            >
              <span className="text-xl">🛵</span>
              <div className="text-left min-w-0">
                <p className="text-xs font-extrabold leading-tight">Livreurs / Courses</p>
                <p className="text-[10px] text-muted-foreground truncate leading-normal">Affectation & suivi des courses</p>
              </div>
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-6">
          <TabsList className="w-full justify-start overflow-x-auto sm:w-auto flex-wrap gap-1">
            <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
            <TabsTrigger value="orders">Commandes</TabsTrigger>
            <TabsTrigger value="menu">Menu</TabsTrigger>
            <TabsTrigger value="tables">Tables & QR</TabsTrigger>
            <TabsTrigger value="staff">👥 Équipe ({members.length})</TabsTrigger>
            <TabsTrigger value="caisse">💰 Caisse</TabsTrigger>
            <TabsTrigger value="cuisine">🍳 Cuisine</TabsTrigger>
            <TabsTrigger value="serveur">🏃‍♂️ Serveurs</TabsTrigger>
            <TabsTrigger value="livraison">🛵 Livraisons</TabsTrigger>
            <TabsTrigger value="abonnement">Abonnement</TabsTrigger>
            <TabsTrigger value="audit">Journal</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="CA aujourd'hui"
                value={kpisPoll.data ? formatFcfa(kpisPoll.data.revenueTodayFcfa) : "—"}
                sub={`${kpisPoll.data?.ordersToday ?? 0} commandes`}
                icon={Wallet}
              />
              <KpiCard
                label="Ticket moyen"
                value={kpisPoll.data ? formatFcfa(kpisPoll.data.avgTicketFcfa) : "—"}
                sub="aujourd'hui"
                icon={TrendingUp}
              />
              <KpiCard
                label="Commandes actives"
                value={String(kpisPoll.data?.activeOrders ?? 0)}
                sub="en cours dans le restaurant"
                icon={ClipboardList}
              />
              <KpiCard
                label="Tables occupées"
                value={
                  kpisPoll.data
                    ? `${kpisPoll.data.occupiedTables}/${kpisPoll.data.tableCount}`
                    : "—"
                }
                sub={`${kpisPoll.data?.menuCount ?? 0} plats au menu`}
                icon={Store}
              />
            </div>

            <Card className="border-border/70 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">
                  Chiffre d'affaires — 7 derniers jours
                </CardTitle>
                <CardDescription>Commandes non annulées, en FCFA</CardDescription>
              </CardHeader>
              <CardContent>
                {kpisPoll.data ? (
                  <RevenueBars data={kpisPoll.data.revenueSeries} />
                ) : (
                  <Skeleton className="h-48" />
                )}
              </CardContent>
            </Card>

            {/* Nouvelles Analyses - Vue d'ensemble du restaurant sélectionné */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* Carte 1: Répartition des paiements */}
              <Card className="border-border/70 shadow-none">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold">Modes de paiement</CardTitle>
                    <CreditCard className="size-4 text-muted-foreground" />
                  </div>
                  <CardDescription>Transactions validées aujourd'hui</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-2">
                  {kpisPoll.data?.paymentMethodBreakdown ? (
                    <>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground flex items-center gap-1.5">
                            <span className="size-2 rounded-full bg-emerald-500 inline-block" />
                            💵 Cash / Espèces
                          </span>
                          <span className="font-extrabold text-foreground">
                            {formatFcfa(kpisPoll.data.paymentMethodBreakdown.cashVolume)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground pl-3">
                          <span>{kpisPoll.data.paymentMethodBreakdown.cash} commande(s)</span>
                          <span>
                            {kpisPoll.data.ordersToday > 0 
                              ? Math.round((kpisPoll.data.paymentMethodBreakdown.cash / kpisPoll.data.ordersToday) * 100) 
                              : 0}%
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1 pt-1.5 border-t border-border/50">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground flex items-center gap-1.5">
                            <span className="size-2 rounded-full bg-orange-500 inline-block" />
                            📱 Mobile Money
                          </span>
                          <span className="font-extrabold text-foreground">
                            {formatFcfa(kpisPoll.data.paymentMethodBreakdown.momoVolume)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground pl-3">
                          <span>{kpisPoll.data.paymentMethodBreakdown.momo} commande(s)</span>
                          <span>
                            {kpisPoll.data.ordersToday > 0 
                              ? Math.round((kpisPoll.data.paymentMethodBreakdown.momo / kpisPoll.data.ordersToday) * 100) 
                              : 0}%
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <Skeleton className="h-20" />
                  )}
                </CardContent>
              </Card>

              {/* Carte 2: Canaux de service */}
              <Card className="border-border/70 shadow-none">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold">Canaux de service</CardTitle>
                    <ShoppingBag className="size-4 text-muted-foreground" />
                  </div>
                  <CardDescription>Commandes d'aujourd'hui</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-2">
                  {kpisPoll.data?.orderTypeBreakdown ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <span className="size-1.5 rounded-full bg-blue-500" />
                          🍽️ Sur place
                        </span>
                        <span className="font-extrabold">{kpisPoll.data.orderTypeBreakdown.dine_in}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs border-t border-border/40 pt-2">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <span className="size-1.5 rounded-full bg-indigo-500" />
                          🛵 Livraison
                        </span>
                        <span className="font-extrabold">{kpisPoll.data.orderTypeBreakdown.delivery}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs border-t border-border/40 pt-2">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <span className="size-1.5 rounded-full bg-amber-500" />
                          🛍️ À emporter
                        </span>
                        <span className="font-extrabold">{kpisPoll.data.orderTypeBreakdown.takeout}</span>
                      </div>
                    </div>
                  ) : (
                    <Skeleton className="h-20" />
                  )}
                </CardContent>
              </Card>

              {/* Carte 3: Top Plats les plus vendus */}
              <Card className="border-border/70 shadow-none">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold">Top Plats vendus</CardTitle>
                    <Star className="size-4 text-amber-500 fill-amber-500" />
                  </div>
                  <CardDescription>Plats les plus populaires de l'établissement</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 pt-1">
                  {kpisPoll.data?.topItems && kpisPoll.data.topItems.length > 0 ? (
                    kpisPoll.data.topItems.map((item: any, idx: number) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <span className="truncate max-w-[150px] font-medium text-foreground">
                          {idx + 1}. {item.name}
                        </span>
                        <span className="font-extrabold shrink-0 text-muted-foreground text-[11px]">
                          {item.quantity_sold} portion(s)
                        </span>
                      </div>
                    ))
                  ) : kpisPoll.data?.topItems ? (
                    <div className="text-center py-4 text-xs text-muted-foreground">
                      Aucune vente enregistrée pour le moment.
                    </div>
                  ) : (
                    <Skeleton className="h-20" />
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-border/70 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base">
                    Dernières commandes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {orders.slice(0, 5).map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2.5"
                    >
                      <div>
                        <p className="text-sm font-semibold">{o.orderNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {ORDER_TYPE_LABELS[o.orderType]} ·{" "}
                          {formatDateTime(o.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatFcfa(o.totalFcfa)}</p>
                        <StatusBadge status={o.status} />
                      </div>
                    </div>
                  ))}
                  {orders.length === 0 && (
                    <EmptyState
                      title="Aucune commande"
                      hint="Les commandes prises à la caisse ou via QR Code apparaîtront ici en temps réel."
                    />
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70 shadow-none">
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">
                      L'équipe du restaurant
                    </CardTitle>
                    <CardDescription>
                      Créez les comptes (email + mot de passe) et attribuez les
                      rôles : gérant, caisse, cuisine, serveur, livreur.
                    </CardDescription>
                  </div>
                  <Button size="sm" onClick={() => setNewStaffOpen(true)}>
                    <Plus className="mr-1.5 size-4" />
                    Ajouter
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-3.5 hover:border-border transition-all shadow-xs"
                    >
                      <div className="flex min-w-0 items-center gap-3.5">
                        <div className="relative size-12 shrink-0 overflow-hidden rounded-full border border-border/80 bg-muted flex items-center justify-center shadow-xs">
                          {m.avatarUrl ? (
                            <img
                              src={m.avatarUrl}
                              alt={m.fullName}
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center font-bold text-sm bg-primary/10 text-primary">
                              {m.fullName
                                ? m.fullName
                                    .split(" ")
                                    .filter(Boolean)
                                    .slice(0, 2)
                                    .map((n) => n[0])
                                    .join("")
                                    .toUpperCase()
                                : (m.isOwner ? <Store className="size-5" /> : <ChefHat className="size-5" />)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {m.fullName || "Membre de l'équipe"}
                            </p>
                            <Badge
                              variant={m.isOwner ? "default" : "secondary"}
                              className="text-[11px] font-medium"
                            >
                              {m.isOwner ? "Propriétaire" : (ROLE_LABELS[m.role] ?? m.role)}
                            </Badge>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {m.email && (
                              <span className="flex items-center gap-1.5 truncate">
                                <Mail className="size-3 text-muted-foreground/70 shrink-0" />
                                <span className="truncate">{m.email}</span>
                              </span>
                            )}
                            <span className="flex items-center gap-1.5">
                              <Phone className="size-3 text-muted-foreground/70 shrink-0" />
                              {m.phone ? (
                                <span>{m.phone}</span>
                              ) : (
                                <span className="italic text-muted-foreground/50">Non renseigné</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-xs font-medium hover:border-primary hover:text-primary cursor-pointer"
                          onClick={() => setEditingStaff(m)}
                        >
                          <Pencil className="size-3.5" />
                          Modifier
                        </Button>
                        {!m.isOwner && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 cursor-pointer text-muted-foreground hover:text-foreground"
                                aria-label="Options du membre"
                              >
                                <Settings className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Changer le rôle</DropdownMenuLabel>
                              {STAFF_ROLES.map((r) => (
                                <DropdownMenuItem
                                  key={r.value}
                                  className="cursor-pointer"
                                  onClick={() => void handleStaffRole(m, r.value)}
                                >
                                  <span className="mr-2 inline-flex size-4 items-center justify-center">
                                    {m.role === r.value && (
                                      <Check className="size-4 text-primary" />
                                    )}
                                  </span>
                                  {r.label}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="cursor-pointer text-destructive focus:text-destructive"
                                onClick={() => void handleStaffRemove(m)}
                              >
                                Retirer de l'équipe
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  ))}
                  {members.length === 0 && (
                    <EmptyState
                      title="Aucun membre"
                      hint="Ajoutez vos serveurs, caissiers et cuisiniers avec leurs comptes."
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="orders" className="mt-6 space-y-4">
            {orders.map((order) => (
              <Card key={order.id} className="border-border/70 shadow-none">
                <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{order.orderNumber}</p>
                      <StatusBadge status={order.status} />
                      <Badge variant={order.paymentStatus === "paid" ? "secondary" : "outline"}>
                        {order.paymentStatus === "paid" ? "Payé" : "À encaisser"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ORDER_TYPE_LABELS[order.orderType]} ·{" "}
                      {PAYMENT_METHOD_LABELS[order.paymentMethod]} ·{" "}
                      {formatDateTime(order.createdAt)}
                      {order.customerName ? ` · ${order.customerName}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-extrabold">
                      {formatFcfa(order.totalFcfa)}
                    </span>
                    {order.status === "pending" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          run(
                            () =>
                              setOrderStatus({ orderId: order.id, status: "confirmed" }),
                            "Commande confirmée.",
                          )
                        }
                      >
                        Confirmer
                      </Button>
                    )}
                    {order.status === "confirmed" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          run(
                            () =>
                              setOrderStatus({ orderId: order.id, status: "in_kitchen" }),
                            "Commande envoyée en cuisine.",
                          )
                        }
                      >
                        En cuisine
                      </Button>
                    )}
                    {order.status === "in_kitchen" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          run(
                            () => setOrderStatus({ orderId: order.id, status: "ready" }),
                            "Commande prête !",
                          )
                        }
                      >
                        Prête
                      </Button>
                    )}
                    {order.status === "ready" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          run(
                            () => setOrderStatus({ orderId: order.id, status: "served" }),
                            "Commande servie.",
                          )
                        }
                      >
                        Servie
                      </Button>
                    )}
                    {order.paymentStatus === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          run(() => markPaid({ orderId: order.id }), "Paiement encaissé.")
                        }
                      >
                        Encaisser
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {orders.length === 0 && (
              <EmptyState
                title="Aucune commande"
                hint="Les commandes apparaîtront ici dès la première vente."
              />
            )}
          </TabsContent>

          <TabsContent value="menu" className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {categories.map((c) => (
                  <Badge key={c.id} variant="secondary">
                    {c.name}
                  </Badge>
                ))}
              </div>
              <Button size="sm" onClick={() => setNewItemOpen(true)}>
                <Plus className="size-4" /> Ajouter un plat
              </Button>
            </div>
            <Card className="border-border/70 shadow-none">
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plat</TableHead>
                      <TableHead>Catégorie</TableHead>
                      <TableHead className="text-right">Prix</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {menuItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="size-11 rounded-lg border border-border/70 bg-muted/40 overflow-hidden flex items-center justify-center shrink-0">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="size-full object-cover"
                                />
                              ) : (
                                <UtensilsCrossed className="size-5 text-muted-foreground/40" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate flex items-center gap-1.5">
                                {item.name}
                                {!item.isAvailable && (
                                  <Badge variant="outline" className="text-[10px] py-0">
                                    Épuisé
                                  </Badge>
                                )}
                              </p>
                              <p className="max-w-72 truncate text-xs text-muted-foreground">
                                {item.description ?? ""}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {categories.find((c) => c.id === item.categoryId)?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatFcfa(item.priceFcfa)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1"
                              onClick={() => setEditingItem(item)}
                            >
                              <Pencil className="size-3" />
                              <span className="hidden sm:inline">Éditer</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={() =>
                                run(
                                  () =>
                                    updateItem({
                                      itemId: item.id,
                                      isAvailable: !item.isAvailable,
                                    }),
                                  item.isAvailable ? "Plat épuisé." : "Plat remis en vente.",
                                )
                              }
                            >
                              {item.isAvailable ? "Épuiser" : "Remettre"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs text-destructive hover:text-destructive"
                              onClick={() =>
                                run(
                                  () => deleteItem({ itemId: item.id }),
                                  "Plat retiré du menu.",
                                )
                              }
                            >
                              Retirer
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {menuItems.length === 0 && (
                  <EmptyState
                    title="Menu vide"
                    hint="Ajoutez vos premiers plats, ou chargez la démo."
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tables" className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {tableUsagePoll.data
                  ? `${tableUsagePoll.data.count}/${
                      tableUsagePoll.data.max === -1
                        ? "∞"
                        : tableUsagePoll.data.max
                    } tables utilisées`
                  : "Chargement…"}
              </p>
              <Button
                size="sm"
                disabled={tableUsagePoll.data ? !tableUsagePoll.data.canAdd : false}
                onClick={() => setNewTableOpen(true)}
              >
                <Plus className="size-4" /> Ajouter une table
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tables.map((t) => (
                <Card key={t.id} className="border-border/70 shadow-none">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex size-11 items-center justify-center rounded-xl bg-primary-muted text-primary">
                        <QrCode className="size-5" />
                      </div>
                      <Badge
                        variant={
                          t.status === "free"
                            ? "secondary"
                            : t.status === "occupied"
                              ? "default"
                              : "outline"
                        }
                      >
                        {TABLE_STATUS_LABELS[t.status]}
                      </Badge>
                    </div>
                    <p className="mt-3 font-bold">Table {t.tableNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.capacity} places · QR {t.qrCodeToken.slice(0, 8)}…
                    </p>
                    <div className="mt-4 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => openQr(t)}
                      >
                        <QrCode className="mr-1 size-4" /> QR
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-muted-foreground cursor-not-allowed bg-muted/20 hover:bg-muted/20"
                        disabled
                        title="L'état de la table est automatique : 'libre' ou 'occupé' selon les commandes et paiements."
                      >
                        Auto
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() =>
                          run(() => removeTable({ tableId: t.id }), "Table retirée.")
                        }
                      >
                        Retirer
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {tables.length === 0 && (
              <EmptyState
                title="Aucune table"
                hint="Chaque table génère un QR Code unique pour la commande client."
              />
            )}
          </TabsContent>

          <TabsContent value="staff" className="mt-6 space-y-4">
            <Card className="border-border/70 shadow-none">
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">
                    L'équipe du restaurant
                  </CardTitle>
                  <CardDescription>
                    Créez les comptes (email + mot de passe) et attribuez les
                    rôles : gérant, caisse, cuisine, serveur, livreur.
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setNewStaffOpen(true)}>
                  <Plus className="mr-1.5 size-4" />
                  Ajouter un membre
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-3.5 hover:border-border transition-all shadow-xs"
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
                      <div className="relative size-12 shrink-0 overflow-hidden rounded-full border border-border/80 bg-muted flex items-center justify-center shadow-xs">
                        {m.avatarUrl ? (
                          <img
                            src={m.avatarUrl}
                            alt={m.fullName}
                            className="size-full object-cover"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center font-bold text-sm bg-primary/10 text-primary">
                            {m.fullName
                              ? m.fullName
                                  .split(" ")
                                  .filter(Boolean)
                                  .slice(0, 2)
                                  .map((n) => n[0])
                                  .join("")
                                  .toUpperCase()
                              : (m.isOwner ? <Store className="size-5" /> : <ChefHat className="size-5" />)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {m.fullName || "Membre de l'équipe"}
                          </p>
                          <Badge
                            variant={m.isOwner ? "default" : "secondary"}
                            className="text-[11px] font-medium"
                          >
                            {m.isOwner ? "Propriétaire" : (ROLE_LABELS[m.role] ?? m.role)}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {m.email && (
                            <span className="flex items-center gap-1.5 truncate">
                              <Mail className="size-3 text-muted-foreground/70 shrink-0" />
                              <span className="truncate">{m.email}</span>
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <Phone className="size-3 text-muted-foreground/70 shrink-0" />
                            {m.phone ? (
                              <span>{m.phone}</span>
                            ) : (
                              <span className="italic text-muted-foreground/50">Non renseigné</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs font-medium hover:border-primary hover:text-primary cursor-pointer"
                        onClick={() => setEditingStaff(m)}
                      >
                        <Pencil className="size-3.5" />
                        Modifier
                      </Button>
                      {!m.isOwner && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 cursor-pointer text-muted-foreground hover:text-foreground"
                              aria-label="Options du membre"
                            >
                              <Settings className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Changer le rôle</DropdownMenuLabel>
                            {STAFF_ROLES.map((r) => (
                              <DropdownMenuItem
                                key={r.value}
                                className="cursor-pointer"
                                onClick={() => void handleStaffRole(m, r.value)}
                              >
                                <span className="mr-2 inline-flex size-4 items-center justify-center">
                                  {m.role === r.value && (
                                    <Check className="size-4 text-primary" />
                                  )}
                                </span>
                                {r.label}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="cursor-pointer text-destructive focus:text-destructive"
                              onClick={() => void handleStaffRemove(m)}
                            >
                              Retirer de l'équipe
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                ))}
                {members.length === 0 && (
                  <EmptyState
                    title="Aucun membre"
                    hint="Ajoutez vos serveurs, caissiers et cuisiniers avec leurs comptes."
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="abonnement" className="mt-6 space-y-6">
            <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary-muted px-4 py-3">
              <Zap className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                <span className="font-bold text-foreground">
                  Comment fonctionne l'essai :
                </span>{" "}
                tout nouveau compte — même sur le plan FREE — démarre avec 14
                jours d'accès BUSINESS (restaurants et tables illimités). À la
                fin de l'essai, le plan FREE revient à 1 restaurant et 5
                tables ; les plans PRO et BUSINESS conservent leurs limites
                après paiement Mobile Money.
              </p>
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              {PLANS.map((plan) => {
                const isCurrent =
                  !planInfo?.inTrial && planInfo?.planCode === plan.code;
                return (
                  <Card
                    key={plan.code}
                    className={
                      isCurrent
                        ? "border-primary/50 shadow-md ring-1 ring-primary/40"
                        : "border-border/70 shadow-none"
                    }
                  >
                    <CardContent className="flex h-full flex-col pt-6">
                      <h3 className="text-lg font-extrabold">{plan.name}</h3>
                      <p className="mt-2 text-2xl font-extrabold">
                        {plan.priceFcfa === 0
                          ? "0"
                          : plan.priceFcfa.toLocaleString("fr-FR")}{" "}
                        <span className="text-sm font-medium text-muted-foreground">
                          FCFA/mois
                        </span>
                      </p>
                      <ul className="mt-4 flex-1 space-y-2">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-sm">
                            <Check className="mt-0.5 size-4 text-primary" />
                            <span className="text-muted-foreground">{f}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        className="mt-6"
                        variant={
                          isCurrent
                            ? "secondary"
                            : plan.highlight
                              ? "default"
                              : "outline"
                        }
                        disabled={isCurrent}
                        onClick={async () => {
                          try {
                            const res = await activatePlan({
                              planCode: plan.code,
                            });
                            toast.success(
                              res?.trialEndsAt
                                ? `Plan ${plan.name} activé — accès BUSINESS pendant 14 jours !`
                                : `Plan ${plan.name} activé.`,
                            );
                            refreshAll();
                          } catch (err) {
                            toast.error(
                              err instanceof Error
                                ? err.message
                                : "Échec de l'activation.",
                            );
                          }
                        }}
                      >
                        {isCurrent ? "Plan actuel" : "Activer"}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="audit" className="mt-6">
            <Card className="border-border/70 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Journal d'audit</CardTitle>
                <CardDescription>
                  Traçabilité des actions sensibles de ce restaurant.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start justify-between gap-4 rounded-lg border border-border/70 px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium">{log.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.metadata ?? ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </div>
                ))}
                {auditLogs.length === 0 && (
                  <EmptyState
                    title="Journal vide"
                    hint="Chaque action sensible est tracée ici."
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="caisse" className="mt-6 space-y-4">
            <Card className="border-border/70 shadow-none">
              <CardHeader>
                <CardTitle>Caisse & Encaissement</CardTitle>
                <CardDescription>
                  Gérez les encaissements, marquez les commandes payées et suivez les règlements.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activeId ? (
                  <PosView
                    restaurantId={activeId}
                    context={staffContext || {
                      userId: user?.id || "",
                      fullName: user?.email || "Propriétaire",
                      email: user?.email || null,
                      role: "owner",
                      restaurants: (restaurants || []).map(r => ({ id: r.id, name: r.name, isOwner: true })),
                      primaryRestaurantId: activeId,
                      primaryRestaurantName: restaurants?.find(r => r.id === activeId)?.name || null
                    }}
                    embedded
                  />
                ) : (
                  <EmptyState title="Aucun restaurant sélectionné" hint="Veuillez sélectionner ou créer un restaurant pour accéder à la caisse." />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cuisine" className="mt-6 space-y-4">
            <Card className="border-border/70 shadow-none">
              <CardHeader>
                <CardTitle>Écran de Préparation Cuisine</CardTitle>
                <CardDescription>
                  Suivez les commandes en temps réel et marquez les préparations prêtes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activeId ? (
                  <KitchenView
                    restaurantId={activeId}
                    context={staffContext || {
                      userId: user?.id || "",
                      fullName: user?.email || "Propriétaire",
                      email: user?.email || null,
                      role: "owner",
                      restaurants: (restaurants || []).map(r => ({ id: r.id, name: r.name, isOwner: true })),
                      primaryRestaurantId: activeId,
                      primaryRestaurantName: restaurants?.find(r => r.id === activeId)?.name || null
                    }}
                    embedded
                  />
                ) : (
                  <EmptyState title="Aucun restaurant sélectionné" hint="Veuillez sélectionner ou créer un restaurant pour accéder à la cuisine." />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="serveur" className="mt-6 space-y-4">
            <Card className="border-border/70 shadow-none">
              <CardHeader>
                <CardTitle>Service de Table & Salle</CardTitle>
                <CardDescription>
                  Suivez le statut de préparation de chaque table et marquez les plats comme servis.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activeId ? (
                  <WaiterView
                    restaurantId={activeId}
                    context={staffContext || {
                      userId: user?.id || "",
                      fullName: user?.email || "Propriétaire",
                      email: user?.email || null,
                      role: "owner",
                      restaurants: (restaurants || []).map(r => ({ id: r.id, name: r.name, isOwner: true })),
                      primaryRestaurantId: activeId,
                      primaryRestaurantName: restaurants?.find(r => r.id === activeId)?.name || null
                    }}
                    embedded
                  />
                ) : (
                  <EmptyState title="Aucun restaurant sélectionné" hint="Veuillez sélectionner ou créer un restaurant pour accéder au service." />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="livraison" className="mt-6 space-y-4">
            <Card className="border-border/70 shadow-none">
              <CardHeader>
                <CardTitle>Livreurs & Courses</CardTitle>
                <CardDescription>
                  Gérez l'expédition des livraisons, le départ en course et la finalisation des livraisons à domicile.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activeId ? (
                  <DeliveriesView
                    restaurantId={activeId}
                    context={staffContext || {
                      userId: user?.id || "",
                      fullName: user?.email || "Propriétaire",
                      email: user?.email || null,
                      role: "owner",
                      restaurants: (restaurants || []).map(r => ({ id: r.id, name: r.name, isOwner: true })),
                      primaryRestaurantId: activeId,
                      primaryRestaurantName: restaurants?.find(r => r.id === activeId)?.name || null
                    }}
                    embedded
                  />
                ) : (
                  <EmptyState title="Aucun restaurant sélectionné" hint="Veuillez sélectionner ou créer un restaurant pour accéder aux livraisons." />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <CreateRestaurantDialog
        open={newRestaurantOpen}
        onOpenChange={setNewRestaurantOpen}
        onCreate={async (data) => {
          if (!isOwner) {
            toast.error("Seul le propriétaire a le droit de créer un restaurant.");
            return;
          }
          try {
            await createRestaurant(data);
            toast.success("Restaurant créé !");
            setNewRestaurantOpen(false);
            setTab("overview");
            refreshAll();
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Échec de la création.",
            );
          }
        }}
      />
      <CreateItemDialog
        open={newItemOpen}
        onOpenChange={setNewItemOpen}
        categories={categories}
        onCreate={async (data) => {
          try {
            await createItem({
              restaurantId: activeId!,
              name: data.name,
              description: data.description,
              priceFcfa: data.priceFcfa,
              categoryId: data.categoryId || undefined,
              preparationTimeMin: data.preparationTimeMin,
              imageUrl: data.imageUrl,
            });
            toast.success("Plat ajouté au menu !");
            setNewItemOpen(false);
            refreshAll();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Échec de l'ajout.");
          }
        }}
      />
      <EditItemDialog
        open={!!editingItem}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null);
        }}
        item={editingItem}
        categories={categories}
        onSave={async (data) => {
          try {
            await updateItem({
              itemId: data.id,
              name: data.name,
              description: data.description,
              priceFcfa: data.priceFcfa,
              categoryId: data.categoryId || null,
              imageUrl: data.imageUrl,
            });
            toast.success("Plat mis à jour !");
            setEditingItem(null);
            refreshAll();
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Échec de la mise à jour.",
            );
          }
        }}
      />
      <CreateTableDialog
        open={newTableOpen}
        onOpenChange={setNewTableOpen}
        onCreate={async (data) => {
          try {
            await createTable({ ...data, restaurantId: activeId! });
            toast.success("Table créée avec son QR Code !");
            setNewTableOpen(false);
            refreshAll();
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Échec de la création.",
            );
          }
        }}
      />
      <CreateCategoryDialog
        open={newCategoryOpen}
        onOpenChange={setNewCategoryOpen}
        onCreate={async (name) => {
          try {
            await createCategoryAction({ restaurantId: activeId!, name });
            toast.success("Catégorie créée !");
            setNewCategoryOpen(false);
            refreshAll();
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Échec de la création.",
            );
          }
        }}
      />
      <StaffDialog
        open={newStaffOpen}
        onOpenChange={setNewStaffOpen}
        onCreate={async (data: StaffDraft) => {
          try {
            const res = await createStaff({
              restaurantId: activeId!,
              fullName: data.fullName,
              email: data.email,
              phone: data.phone ?? null,
              password: data.password,
              role: data.role as StaffRoleValue,
              avatarUrl: data.avatarUrl ?? null,
            });
            toast.success(
              res.accountCreated
                ? `${data.fullName} ajouté à l'équipe — compte créé avec le mot de passe fourni.`
                : `${data.fullName} assigné — un compte existait déjà, son mot de passe est inchangé.`,
            );
            setNewStaffOpen(false);
            membersPoll.refresh();
            auditPoll.refresh();
            return null;
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : "Échec de la création.";
            toast.error(msg);
            return msg;
          }
        }}
      />
      <EditStaffDialog
        open={!!editingStaff}
        onOpenChange={(open) => {
          if (!open) setEditingStaff(null);
        }}
        member={editingStaff}
        onSave={async (data: EditStaffDraft) => {
          try {
            await updateStaff({
              restaurantId: activeId!,
              staffId: data.staffId,
              fullName: data.fullName,
              email: data.email,
              phone: data.phone ?? null,
              role: data.role,
              avatarUrl: data.avatarUrl ?? null,
              password: data.password,
            });
            toast.success(`${data.fullName} mis à jour avec succès.`);
            setEditingStaff(null);
            membersPoll.refresh();
            auditPoll.refresh();
            return null;
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : "Échec de la modification.";
            toast.error(msg);
            return msg;
          }
        }}
      />
      <CreateOrderDialog
        open={newOrderOpen}
        onOpenChange={setNewOrderOpen}
        tables={tables.map((t) => ({ id: t.id, tableNumber: t.tableNumber }))}
        menuItems={menuItems}
        onCreate={async (data) => {
          try {
            const res = await createOrderAction({
              restaurantId: activeId!,
              orderType: "dine_in",
              tableId: data.tableId,
              paymentMethod: data.paymentMethod,
              notes: data.notes,
              items: data.items,
            });
            toast.success(
              `Commande ${res.orderNumber} enregistrée (${formatFcfa(res.totalFcfa)}).`,
            );
            setNewOrderOpen(false);
            refreshAll();
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Échec de la commande.",
            );
          }
        }}
      />
      <Dialog open={!!qrTable} onOpenChange={(o) => !o && setQrTable(null)}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>
              QR Code — Table {qrTable?.tableNumber}
            </DialogTitle>
            <DialogDescription>
              Imprimez et collez sur la table : vos clients scannent, voient le
              menu et commandent depuis leur téléphone.
            </DialogDescription>
          </DialogHeader>
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR Code table ${qrTable?.tableNumber}`}
              className="mx-auto size-64 rounded-xl border border-border"
            />
          ) : (
            <Skeleton className="mx-auto size-64" />
          )}
          <p className="break-all text-xs text-muted-foreground">{qrMenuUrl}</p>
          <DialogFooter className="justify-center">
            <Button
              variant="outline"
              onClick={() => {
                const w = window.open(qrMenuUrl, "_blank");
                w?.focus();
              }}
            >
              Aperçu du menu client
            </Button>
            <Button
              onClick={() => {
                if (!qrDataUrl) return;
                const a = document.createElement("a");
                a.href = qrDataUrl;
                a.download = `chopmboa-qr-table-${qrTable?.tableNumber ?? ""}.png`;
                a.click();
              }}
              disabled={!qrDataUrl}
            >
              Télécharger le PNG
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
