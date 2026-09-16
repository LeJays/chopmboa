import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { usePollAction } from "@/hooks/use-poll";
import { useStaffContext } from "@/hooks/use-staff-context";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/neon-actions";
import { formatFcfa } from "@/lib/chopmboa";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  ShoppingBag,
  Store,
  Users,
  UtensilsCrossed,
  Printer,
  RefreshCw,
  Award,
  Sparkles,
  ShieldAlert,
  SlidersHorizontal,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface RestaurantComparisonItem {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  revenueAllTime: number;
  revenueToday: number;
  revenue7d: number;
  revenue30d: number;
  revenueSharePercent: number;
  totalOrders: number;
  ordersToday: number;
  activeOrders: number;
  avgTicket: number;
  avgTicketToday: number;
  totalTables: number;
  occupiedTables: number;
  occupancyRate: number;
  menuItemsCount: number;
  menuAvailableCount: number;
  staffCount: number;
  staffBreakdown: {
    manager: number;
    kitchen: number;
    cashier: number;
    waiter: number;
    delivery: number;
  };
}

interface OwnerComparisonData {
  summary: {
    totalRestaurants: number;
    totalRevenueAllTime: number;
    totalRevenueToday: number;
    totalOrdersAllTime: number;
    totalOrdersToday: number;
    totalActiveOrders: number;
    overallAvgTicket: number;
    totalTables: number;
    totalTablesOccupied: number;
    overallOccupancyRate: number;
    totalStaff: number;
    totalMenuItems: number;
  };
  highlights: {
    topByRevenue: RestaurantComparisonItem | null;
    topByOrders: RestaurantComparisonItem | null;
    topByAvgTicket: RestaurantComparisonItem | null;
    topByOccupancy: RestaurantComparisonItem | null;
  };
  restaurants: RestaurantComparisonItem[];
  chartData: Record<string, any>[];
}

const PALETTE = [
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#6366f1", // Indigo
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#8b5cf6", // Violet
];

type SortMetric = "revenueAllTime" | "revenueToday" | "totalOrders" | "avgTicket" | "occupancyRate";

export function Reports() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { context: staffContext, loading: staffLoading } = useStaffContext();
  const [periodFilter, setPeriodFilter] = useState<"all" | "today" | "7d" | "30d">("all");
  const [sortKey, setSortKey] = useState<SortMetric>("revenueAllTime");

  const reportsPoll = usePollAction<OwnerComparisonData>(
    api.reports.ownerComparison,
    {},
    15000,
  );

  const isOwner = staffContext?.role === "owner";
  const data = reportsPoll.data;
  const isLoading = reportsPoll.loading && !data;

  // Contrôle d'accès : seul le propriétaire accède à la page comparative multi-restaurants
  if (!staffLoading && !isOwner) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/20 px-4 text-center">
        <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 shadow-sm">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <ShieldAlert className="size-6" />
          </div>
          <h1 className="mt-4 text-xl font-bold tracking-tight text-foreground">
            Accès réservé au propriétaire
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            En tant que gérant ou membre du personnel, vous avez accès à la gestion de votre établissement assigné. Le rapport comparatif consolidé de l'ensemble des restaurants est strictement réservé au propriétaire.
          </p>
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate("/dashboard")} className="gap-2">
              <ArrowLeft className="size-4" />
              Retourner au dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Tri de la liste des restaurants
  const sortedRestaurants = [...(data?.restaurants ?? [])].sort((a, b) => {
    if (sortKey === "revenueAllTime") return b.revenueAllTime - a.revenueAllTime;
    if (sortKey === "revenueToday") return b.revenueToday - a.revenueToday;
    if (sortKey === "totalOrders") return b.totalOrders - a.totalOrders;
    if (sortKey === "avgTicket") return b.avgTicket - a.avgTicket;
    if (sortKey === "occupancyRate") return b.occupancyRate - a.occupancyRate;
    return 0;
  });

  const getRevenueForPeriod = (item: RestaurantComparisonItem) => {
    if (periodFilter === "today") return item.revenueToday;
    if (periodFilter === "7d") return item.revenue7d;
    if (periodFilter === "30d") return item.revenue30d;
    return item.revenueAllTime;
  };

  const pieData = (data?.restaurants ?? [])
    .filter((r) => r.revenueAllTime > 0)
    .map((r, idx) => ({
      name: r.name,
      value: r.revenueAllTime,
      color: PALETTE[idx % PALETTE.length],
    }));

  return (
    <div className="min-h-screen bg-muted/15 pb-16 text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/dashboard")}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BarChart3 className="size-4" />
              </div>
              <div>
                <h1 className="text-base font-bold leading-none tracking-tight sm:text-lg">
                  Rapport comparatif multi-restaurants
                </h1>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  Synthèse et comparatif consolidé de tous vos établissements
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="hidden border-primary/30 bg-primary/5 text-primary sm:inline-flex"
            >
              Vue Propriétaire
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => reportsPoll.refresh()}
              disabled={reportsPoll.loading}
              className="gap-1.5"
            >
              <RefreshCw
                className={`size-3.5 ${reportsPoll.loading ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Actualiser</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5"
            >
              <Printer className="size-3.5" />
              <span className="hidden sm:inline">Imprimer</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-28" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-36" />
                    <Skeleton className="mt-2 h-3 w-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && data && data.restaurants.length === 0 && (
          <Card className="mt-8 text-center">
            <CardContent className="py-12">
              <Store className="mx-auto size-12 text-muted-foreground/60" />
              <h2 className="mt-4 text-xl font-bold tracking-tight">
                Aucun restaurant à comparer
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Créez au moins un restaurant pour visualiser les analyses et métriques comparatives consolidées.
              </p>
              <div className="mt-6">
                <Button onClick={() => navigate("/dashboard")} className="gap-2">
                  <ArrowLeft className="size-4" />
                  Aller au dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Data view */}
        {!isLoading && data && data.restaurants.length > 0 && (
          <div className="space-y-8">
            {/* Global consolidated KPI Cards */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Performance globale consolidée ({data.summary.totalRestaurants} établissement{data.summary.totalRestaurants > 1 ? "s" : ""})
                  </h2>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Chiffre d'affaires total
                    </CardTitle>
                    <TrendingUp className="size-4 text-emerald-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black tracking-tight text-foreground">
                      {formatFcfa(data.summary.totalRevenueAllTime)}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-semibold text-emerald-600">
                        {formatFcfa(data.summary.totalRevenueToday)}
                      </span>{" "}
                      réalisés aujourd'hui
                    </p>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Commandes totales
                    </CardTitle>
                    <ShoppingBag className="size-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black tracking-tight text-foreground">
                      {data.summary.totalOrdersAllTime.toLocaleString("fr-FR")}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-semibold text-primary">
                        {data.summary.totalOrdersToday}
                      </span>{" "}
                      aujourd'hui · {data.summary.totalActiveOrders} en cours
                    </p>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Panier moyen pondéré
                    </CardTitle>
                    <Award className="size-4 text-amber-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black tracking-tight text-foreground">
                      {formatFcfa(data.summary.overallAvgTicket)}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Moyenne tous restaurants confondus
                    </p>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Occupation des tables
                    </CardTitle>
                    <UtensilsCrossed className="size-4 text-indigo-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black tracking-tight text-foreground">
                      {data.summary.overallOccupancyRate}%
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {data.summary.totalTablesOccupied} sur {data.summary.totalTables} tables occupées
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Highlights / Podium / Best performers */}
            {data.restaurants.length > 1 && (
              <section>
                <div className="mb-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Palmarès des établissements
                  </h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {data.highlights.topByRevenue && (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 transition-colors">
                      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                        <Award className="size-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">
                          Top Chiffre d'Affaires
                        </span>
                      </div>
                      <p className="mt-2 truncate font-bold text-foreground">
                        {data.highlights.topByRevenue.name}
                      </p>
                      <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatFcfa(data.highlights.topByRevenue.revenueAllTime)}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {data.highlights.topByRevenue.revenueSharePercent}% du CA global
                      </p>
                    </div>
                  )}

                  {data.highlights.topByOrders && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 transition-colors">
                      <div className="flex items-center gap-2 text-primary">
                        <Sparkles className="size-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">
                          Plus Forte Fréquentation
                        </span>
                      </div>
                      <p className="mt-2 truncate font-bold text-foreground">
                        {data.highlights.topByOrders.name}
                      </p>
                      <p className="text-sm font-semibold text-primary">
                        {data.highlights.topByOrders.totalOrders} commandes
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {data.highlights.topByOrders.ordersToday} enregistrées aujourd'hui
                      </p>
                    </div>
                  )}

                  {data.highlights.topByAvgTicket && (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 transition-colors">
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                        <TrendingUp className="size-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">
                          Meilleur Panier Moyen
                        </span>
                      </div>
                      <p className="mt-2 truncate font-bold text-foreground">
                        {data.highlights.topByAvgTicket.name}
                      </p>
                      <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                        {formatFcfa(data.highlights.topByAvgTicket.avgTicket)} / commande
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Ticket le plus élevé du groupe
                      </p>
                    </div>
                  )}

                  {data.highlights.topByOccupancy && (
                    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 transition-colors">
                      <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                        <Store className="size-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">
                          Taux de Remplissage
                        </span>
                      </div>
                      <p className="mt-2 truncate font-bold text-foreground">
                        {data.highlights.topByOccupancy.name}
                      </p>
                      <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                        {data.highlights.topByOccupancy.occupancyRate}% d'occupation
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {data.highlights.topByOccupancy.occupiedTables} / {data.highlights.topByOccupancy.totalTables} tables occupées
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Visual Charts */}
            <section className="grid gap-6 lg:grid-cols-3">
              {/* Bar comparison */}
              <Card className="shadow-sm lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-base">
                      Comparatif du Chiffre d'Affaires par Restaurant
                    </CardTitle>
                    <CardDescription>
                      Comparaison du volume d'affaires total et du jour
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.restaurants.map((r) => ({
                          name: r.name.split("—")[0].trim(),
                          "CA Total (k FCFA)": Math.round(r.revenueAllTime / 1000),
                          "CA Aujourd'hui (k FCFA)": Math.round(r.revenueToday / 1000),
                        }))}
                        margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 12 }}
                          interval={0}
                          angle={-15}
                          textAnchor="end"
                        />
                        <YAxis tick={{ fontSize: 11 }} />
                        <RechartsTooltip
                          formatter={(value: any) => [`${(Number(value) * 1000).toLocaleString("fr-FR")} FCFA`]}
                        />
                        <Legend />
                        <Bar
                          dataKey="CA Total (k FCFA)"
                          fill="#10b981"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="CA Aujourd'hui (k FCFA)"
                          fill="#f59e0b"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Pie chart revenue share */}
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Répartition du CA</CardTitle>
                  <CardDescription>Part contributive de chaque site</CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={3}
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value: any) => [formatFcfa(Number(value))]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {data.restaurants.map((r, i) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                          />
                          <span className="truncate">{r.name}</span>
                        </div>
                        <span className="font-semibold text-muted-foreground">
                          {r.revenueSharePercent}%
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Detailed Comparative Table */}
            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold tracking-tight">
                    Tableau comparatif détaillé
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Analyse côte à côte des indicateurs financiers, opérationnels et humains
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 rounded-lg border bg-card p-1 text-xs">
                    <span className="px-2 text-muted-foreground flex items-center gap-1">
                      <SlidersHorizontal className="size-3" /> Trier par :
                    </span>
                    <button
                      onClick={() => setSortKey("revenueAllTime")}
                      className={`rounded px-2 py-1 font-medium transition-colors ${
                        sortKey === "revenueAllTime"
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      CA Total
                    </button>
                    <button
                      onClick={() => setSortKey("revenueToday")}
                      className={`rounded px-2 py-1 font-medium transition-colors ${
                        sortKey === "revenueToday"
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      Aujourd'hui
                    </button>
                    <button
                      onClick={() => setSortKey("totalOrders")}
                      className={`rounded px-2 py-1 font-medium transition-colors ${
                        sortKey === "totalOrders"
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      Commandes
                    </button>
                    <button
                      onClick={() => setSortKey("avgTicket")}
                      className={`rounded px-2 py-1 font-medium transition-colors ${
                        sortKey === "avgTicket"
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      Panier
                    </button>
                    <button
                      onClick={() => setSortKey("occupancyRate")}
                      className={`rounded px-2 py-1 font-medium transition-colors ${
                        sortKey === "occupancyRate"
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      Tables
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Établissement</th>
                        <th className="px-4 py-3">CA Total</th>
                        <th className="px-4 py-3">Aujourd'hui</th>
                        <th className="px-4 py-3">Commandes</th>
                        <th className="px-4 py-3">Panier Moyen</th>
                        <th className="px-4 py-3">Occupation Tables</th>
                        <th className="px-4 py-3">Carte</th>
                        <th className="px-4 py-3">Équipe</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sortedRestaurants.map((rest, index) => (
                        <tr
                          key={rest.id}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 py-3.5">
                            <div className="flex items-start gap-2.5">
                              <span
                                className="mt-1 size-2 rounded-full shrink-0"
                                style={{
                                  backgroundColor: PALETTE[index % PALETTE.length],
                                }}
                              />
                              <div>
                                <p className="font-bold text-foreground">
                                  {rest.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {rest.address || "Adresse non renseignée"}
                                </p>
                                <div className="mt-1 flex items-center gap-1.5">
                                  <Badge
                                    variant={rest.isActive ? "default" : "secondary"}
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {rest.isActive ? "Ouvert" : "Fermé"}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">
                                    Part: {rest.revenueSharePercent}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <p className="font-bold text-foreground">
                              {formatFcfa(rest.revenueAllTime)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              7j: {formatFcfa(rest.revenue7d)}
                            </p>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <p className="font-bold text-emerald-600 dark:text-emerald-400">
                              {formatFcfa(rest.revenueToday)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {rest.ordersToday} cmd du jour
                            </p>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <p className="font-semibold text-foreground">
                              {rest.totalOrders}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {rest.activeOrders > 0 ? (
                                <span className="font-medium text-primary">
                                  {rest.activeOrders} en préparation
                                </span>
                              ) : (
                                "Aucune en cours"
                              )}
                            </p>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <p className="font-semibold text-foreground">
                              {formatFcfa(rest.avgTicket)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Auj: {formatFcfa(rest.avgTicketToday)}
                            </p>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="w-28">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="font-semibold">
                                  {rest.occupancyRate}%
                                </span>
                                <span className="text-muted-foreground text-[11px]">
                                  {rest.occupiedTables}/{rest.totalTables}
                                </span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full bg-indigo-500 rounded-full transition-all"
                                  style={{ width: `${rest.occupancyRate}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <p className="font-semibold text-foreground">
                              {rest.menuAvailableCount} plats
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {rest.menuItemsCount} au total
                            </p>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Users className="size-3.5 text-muted-foreground" />
                              <span className="font-semibold text-foreground">
                                {rest.staffCount}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {rest.staffBreakdown.manager} gérant · {rest.staffBreakdown.waiter + rest.staffBreakdown.kitchen + rest.staffBreakdown.cashier} staff
                            </p>
                          </td>

                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Navigate to dashboard with this restaurant selected
                                navigate(`/dashboard?restaurantId=${rest.id}`);
                              }}
                              className="gap-1 text-xs"
                            >
                              Gérer
                              <ChevronRight className="size-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
