import logo from "@/assets/logo.svg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import type { StaffContext } from "@/hooks/use-staff-context";
import { STAFF_ROLE_LABELS } from "@/lib/chopmboa";
import { getNotificationPermission, subscribeToPush } from "@/lib/push-notifications";
import { Bell, BellOff, LogOut } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

/* ====================================================================== */
/* ChopMboa — shell des espaces par rôle (cuisine, caisse, salle,         */
/* livraison). En-tête compact avec restaurant, rôle et déconnexion.      */
/* ====================================================================== */

export function RoleShell({
  context,
  title,
  icon,
  actions,
  children,
}: {
  context: StaffContext;
  title: string;
  icon: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setNotifPermission(getNotificationPermission());
  }, []);

  const handleEnableNotifications = async () => {
    const ok = await subscribeToPush(context.primaryRestaurantId ?? undefined);
    if (ok) {
      setNotifPermission("granted");
      toast.success("Notifications activées — vous serez alerté même en arrière-plan !");
    } else {
      const perm = getNotificationPermission();
      setNotifPermission(perm);
      if (perm === "denied") {
        toast.error("Notifications bloquées. Autorisez-les dans les paramètres de votre navigateur.");
      }
    }
  };

  const roleBadge =
    context.role === "owner"
      ? "Propriétaire"
      : context.role
        ? STAFF_ROLE_LABELS[context.role]
        : "Membre";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <img src={logo} alt="ChopMboa" className="size-8 rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-bold">{context.primaryRestaurantName ?? "ChopMboa"}</p>
              <Badge variant="secondary" className="shrink-0">
                {roleBadge}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {icon}
              <span className="truncate">{title}</span>
              <span className="hidden sm:inline">· {context.fullName}</span>
            </div>
          </div>
          {actions}

          {/* Bouton notifications push */}
          {notifPermission !== "unsupported" && notifPermission !== "granted" && (
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:flex items-center gap-1.5 text-xs h-8 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400"
              onClick={handleEnableNotifications}
              title="Activer les notifications push"
            >
              <Bell className="size-3.5" />
              <span>Notifs</span>
            </Button>
          )}
          {notifPermission === "granted" && (
            <span title="Notifications actives" className="hidden sm:flex items-center text-emerald-600">
              <Bell className="size-4" />
            </span>
          )}
          {notifPermission === "denied" && (
            <span title="Notifications bloquées" className="hidden sm:flex items-center text-muted-foreground">
              <BellOff className="size-4" />
            </span>
          )}

          <Button
            variant="ghost"
            size="icon"
            aria-label="Se déconnecter"
            onClick={async () => {
              await signOut();
              navigate("/auth?mode=signin");
            }}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5">{children}</main>
    </div>
  );
}

/** Écran affiché quand un compte sans restaurant (rôle non attribué) se connecte. */
export function NoWorkspace() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <img src={logo} alt="ChopMboa" className="size-14 rounded-xl" />
      <div>
        <h1 className="text-lg font-bold">Aucun espace de travail</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Votre compte n'est rattaché à aucun restaurant. Demandez au
          propriétaire de vous attribuer un rôle, puis reconnectez-vous.
        </p>
      </div>
      <Button
        variant="outline"
        onClick={async () => {
          await signOut();
          navigate("/auth?mode=signin");
        }}
      >
        Se déconnecter
      </Button>
    </div>
  );
}
