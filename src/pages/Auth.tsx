import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_HOME } from "@/hooks/use-staff-context";
import { useRef } from "react";
import logo from "@/assets/logo.svg";
import {
  ArrowRight,
  BadgeCheck,
  Bike,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  QrCode,
  Store,
  Wallet,
  Zap,
} from "lucide-react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

/** Translate Convex Auth Password errors into friendly French messages. */
function passwordErrorMessage(message: string, mode: "signup" | "signin") {
  const m = message.toLowerCase();
  if (m.includes("account already exists")) {
    return "Un compte existe déjà avec cet email. Basculez sur « Se connecter ».";
  }
  if (m.includes("invalid credentials") || m.includes("account not found")) {
    return mode === "signin"
      ? "Email ou mot de passe incorrect."
      : "Impossible de créer le compte. Vérifiez vos informations.";
  }
  if (m.includes("password")) {
    return "Mot de passe invalide : 8 caractères minimum.";
  }
  return message;
}

/** Split-screen branded inscription / connexion — email + mot de passe. */
function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Évite que l'effet ci-dessous n'écrase la redirection par rôle du submit.
  const handledRef = useRef(false);

  /**
   * Redirection vers l'espace de travail du rôle (owner → dashboard,
   * kitchen → KDS, cashier → caisse…). Juste après `signIn`, le jeton de
   * session peut mettre quelques centaines de millisecondes à s'attacher au
   * client Convex : whoAmI renvoie alors null (requête anonyme). On réessaie
   * donc brièvement avant de retomber sur le fallback.
   */
  const goToRoleHome = useCallback(
    async (explicitReturnTo: string | null) => {
      if (explicitReturnTo) {
        navigate(explicitReturnTo);
        return;
      }
      navigate(redirect);
    },
    [navigate, redirect],
  );

  // Déjà connecté en arrivant sur /auth → rôle résolu puis redirection.
  useEffect(() => {
    if (authLoading || !isAuthenticated || isLoading || handledRef.current) {
      return;
    }
    handledRef.current = true;
    void goToRoleHome(searchParams.get("returnTo"));
  }, [authLoading, isAuthenticated, isLoading, goToRoleHome, searchParams]);

  const validate = (): string | null => {
    if (mode === "signup" && fullName.trim().length < 2) {
      return "Indiquez votre nom complet pour créer votre compte.";
    }
    if (!email.trim() || !email.includes("@")) {
      return "Entrez une adresse email valide.";
    }
    if (password.length < 8) {
      return "Le mot de passe doit contenir au moins 8 caractères.";
    }
    if (mode === "signup" && password !== confirmPassword) {
      return "Les deux mots de passe ne correspondent pas.";
    }
    return null;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    try {
      await signIn("password", {
        email: email.trim(),
        password,
        // On sign-up the provider stores the name on the user profile.
        ...(mode === "signup" ? { name: fullName.trim() } : {}),
        flow: mode === "signup" ? "signUp" : "signIn",
      });

      setPassword("");
      setConfirmPassword("");

      // Connexion par rôle : chaque rôle arrive sur son espace de travail.
      // Un returnTo explicite dans l'URL reste prioritaire.
      handledRef.current = true;
      await goToRoleHome(searchParams.get("returnTo"));
    } catch (err) {
      console.error("Password auth error:", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(passwordErrorMessage(message, mode));
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (value: "signup" | "signin") => {
    setMode(value);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* ------------------------- Brand panel ------------------------- */}
      <aside className="cm-brand-panel relative hidden w-[46%] flex-col justify-between overflow-hidden p-10 lg:flex">
        <a href="/" className="relative flex items-center gap-3">
          <img src={logo} alt="ChopMboa" className="size-11 rounded-2xl" />
          <span className="text-xl font-extrabold tracking-tight text-white">
            ChopMboa
          </span>
        </a>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white">
            Gérez. Vendez.{" "}
            <span className="cm-gradient-text">Livrez.</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            Le système d'exploitation des restaurants camerounais — caisse,
            cuisine, tables, commandes et Mobile Money en FCFA.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              { icon: Store, text: "Multi-restaurants selon votre plan" },
              { icon: QrCode, text: "Menu QR Code par table, en temps réel" },
              { icon: Wallet, text: "MTN MoMo, Orange Money et espèces" },
              { icon: Bike, text: "Livraison suivie de bout en bout" },
            ].map((f) => (
              <li key={f.text} className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-white/10 text-amber-400">
                  <f.icon className="size-4" />
                </span>
                <span className="text-sm text-white/85">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
          <Zap className="size-4 shrink-0 text-amber-400" />
          <p className="text-xs leading-relaxed text-amber-200/90">
            <span className="font-bold text-amber-300">
              14 jours d'accès BUSINESS offerts
            </span>{" "}
            dès l'inscription — sans carte bancaire.
          </p>
        </div>
      </aside>

      {/* --------------------------- Form side -------------------------- */}
      <main className="flex flex-1 flex-col">
        <div className="flex items-center justify-between px-4 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-2 lg:hidden">
            <img src={logo} alt="ChopMboa" className="size-9 rounded-xl" />
            <span className="text-lg font-extrabold tracking-tight">
              ChopMboa
            </span>
          </a>
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <a href="/">← Retour au site</a>
          </Button>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 pb-14">
          <Card className="w-full max-w-md shadow-xl shadow-orange-900/5">
            <div className="px-6 pt-6 text-center">
              <div className="mb-4 flex justify-center">
                <img
                  src={logo}
                  alt="ChopMboa"
                  width={64}
                  height={64}
                  className="size-16 cursor-pointer rounded-2xl"
                  onClick={() => navigate("/")}
                />
              </div>
              <h1 className="text-xl font-extrabold tracking-tight">
                {mode === "signup"
                  ? "Créez votre compte ChopMboa"
                  : "Bon retour !"}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {mode === "signup"
                  ? "Votre essai de 14 jours avec accès BUSINESS démarre automatiquement."
                  : "Connectez-vous pour retrouver vos restaurants."}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                {(
                  [
                    ["signup", "Inscription"],
                    ["signin", "Connexion"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => switchMode(value)}
                    className={
                      mode === value
                        ? "rounded-md bg-card px-3 py-1.5 text-sm font-semibold shadow-sm"
                        : "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4 pt-5">
                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nom complet *</Label>
                    <Input
                      id="fullName"
                      name="fullName"
                      autoComplete="name"
                      placeholder="Ex: Marie Ngo Bassa"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      disabled={isLoading}
                      required
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email professionnel</Label>
                  <Input
                    id="email"
                    name="email"
                    placeholder="vous@restaurant.cm"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      <Lock className="size-4" />
                    </span>
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        mode === "signup" ? "new-password" : "current-password"
                      }
                      placeholder="8 caractères minimum"
                      className="pl-9 pr-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={
                        showPassword
                          ? "Masquer le mot de passe"
                          : "Afficher le mot de passe"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">
                      Confirmer le mot de passe
                    </Label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Ressaisissez votre mot de passe"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={isLoading}
                      required
                      minLength={8}
                    />
                  </div>
                )}
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {mode === "signup"
                        ? "Création du compte…"
                        : "Connexion…"}
                    </>
                  ) : (
                    <>
                      {mode === "signup" ? "Créer mon compte" : "Se connecter"}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
                {mode === "signup" ? (
                  <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    Essai gratuit de 14 jours, accès BUSINESS complet · Sans carte
                    bancaire · Ensuite, le plan FREE reste gratuit (1
                    restaurant, 5 tables).
                  </p>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">
                    Pas encore de compte ?{" "}
                    <button
                      type="button"
                      className="font-semibold text-primary hover:underline"
                      onClick={() => switchMode("signup")}
                    >
                      Inscrivez-vous
                    </button>
                  </p>
                )}
              </CardContent>
            </form>
          </Card>
        </div>
      </main>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense fallback={null}>
      <Auth {...props} />
    </Suspense>
  );
}
