import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChefHat } from "lucide-react";
import { ORDER_STATUS_LABELS } from "@/lib/chopmboa";

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
              </p>
            <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
            {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="rounded-xl bg-primary-muted p-2.5 text-primary">
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
      <ChefHat className="size-8 text-muted-foreground/50" />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function RevenueBars({
  data,
}: {
  data: { day: string; totalFcfa: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.totalFcfa));
  return (
    <div className="flex h-48 items-end gap-2 sm:gap-3">
      {data.map((d) => (
        <div
          key={d.day}
          className="flex h-full flex-1 flex-col items-center justify-end gap-2"
        >
          <span className="text-[10px] font-semibold text-muted-foreground">
            {d.totalFcfa > 0 ? d.totalFcfa.toLocaleString("fr-FR") : ""}
          </span>
          <div
            className="w-full rounded-t-md bg-gradient-to-t from-orange-600/90 to-amber-400 transition-all"
            style={{ height: `${Math.max(2, (d.totalFcfa / max) * 100)}%` }}
          />
          <span className="text-xs font-medium text-muted-foreground">
            {d.day}
          </span>
        </div>
      ))}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  confirmed: "bg-blue-100 text-blue-800 border-blue-200",
  in_kitchen: "bg-orange-100 text-orange-800 border-orange-200",
  ready: "bg-emerald-100 text-emerald-800 border-emerald-200",
  served: "bg-slate-100 text-slate-700 border-slate-200",
  delivered: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[status] ?? ""}>
      {ORDER_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
