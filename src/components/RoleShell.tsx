import logo from "@/assets/logo.svg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import type { StaffContext } from "@/hooks/use-staff-context";
import { STAFF_ROLE_LABELS } from "@/lib/chopmboa";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";

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
          <Button
            variant="ghost"
            size="icon"
            aria-label="Se déconnecter"
            onClick={async () => {
              await signOut();
              navigate("/");
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
          navigate("/");
        }}
      >
        Se déconnecter
      </Button>
    </div>
  );
}
