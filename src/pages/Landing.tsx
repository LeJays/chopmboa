import { motion } from "framer-motion";
import {
  ArrowRight,
  BellRing,
  Bike,
  Check,
  QrCode,
  ScanLine,
  Smartphone,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PLANS, formatFcfa } from "@/lib/chopmboa";
import logo from "@/assets/logo.svg";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
};

const MODULES = [
  {
    icon: UtensilsCrossed,
    title: "Encaissement POS",
    text: "Prise de commande tactile, panier, variantes et suppléments. Ticket imprimable en 80 mm.",
  },
  {
    icon: BellRing,
    title: "Kitchen Display",
    text: "File de préparation en temps réel avec alerte si un plat dépasse 15 minutes.",
  },
  {
    icon: QrCode,
    title: "Menu QR Code",
    text: "Le client scanne, commande et suit sa commande depuis son smartphone. Zéro installation.",
  },
  {
    icon: Bike,
    title: "Livraison suivie",
    text: "Assignation des livreurs, position GPS en direct et validation à la remise.",
  },
  {
    icon: Wallet,
    title: "Mobile Money",
    text: "MTN MoMo et Orange Money intégrés nativement, en plus des espèces et de la carte.",
  },
  {
    icon: TrendingUp,
    title: "Analytics propriétaire",
    text: "CA du jour, ticket moyen, top plats et courbe sur 7 jours, mis à jour en continu.",
  },
];

const STEPS = [
  {
    icon: ScanLine,
    title: "Le client scanne",
    text: "Un QR Code par table, généré automatiquement par ChopMboa.",
  },
  {
    icon: Smartphone,
    title: "Il commande",
    text: "Menu interactif, suppléments, note spéciale — direct depuis son téléphone.",
  },
  {
    icon: BellRing,
    title: "La cuisine s'anime",
    text: "Le KDS affiche la commande instantanément. Vous suivez tout au dashboard.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <a href="/" className="flex items-center gap-2">
            <img src={logo} alt="ChopMboa" className="size-9 rounded-xl" />
            <span className="text-lg font-extrabold tracking-tight">
              ChopMboa
            </span>
          </a>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#modules" className="transition-colors hover:text-foreground">
              Modules
            </a>
            <a href="#comment" className="transition-colors hover:text-foreground">
              Comment ça marche
            </a>
            <a href="#tarifs" className="transition-colors hover:text-foreground">
              Tarifs
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <a href="/auth?mode=signin&returnTo=%2Fdashboard">Se connecter</a>
            </Button>
            <Button asChild>
              <a href="/auth?mode=signup&returnTo=%2Fdashboard">
                Essai gratuit
                <ArrowRight className="size-4" />
              </a>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="cm-hero-grid relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-3xl text-center"
          >
            <Badge
              variant="outline"
              className="mb-6 gap-2 border-primary/30 bg-primary-muted px-3 py-1 text-primary"
            >
              <UtensilsCrossed className="size-3.5" />
              Le système d'exploitation des restaurants camerounais
            </Badge>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
              Gérez. Vendez.{" "}
              <span className="cm-gradient-text">Livrez.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              ChopMboa réunit la caisse, la cuisine, les tables, les menu QR
              Codes et la livraison dans un seul outil — pensé pour le Cameroun,
              en FCFA, avec MTN MoMo et Orange Money.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 px-7 text-base">
                <a href="/auth?returnTo=%2Fdashboard">
                  Démarrer l'essai gratuit
                  <ArrowRight className="size-5" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-7 text-base">
                <a href="#tarifs">Voir les tarifs</a>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              14 jours d'accès BUSINESS offerts · Sans carte bancaire · Dès 0
              FCFA/mois
            </p>
          </motion.div>

          {/* Hero mock: mini POS/KDS strip */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.15 }}
            className="mx-auto mt-14 max-w-4xl"
          >
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-orange-900/10">
              <div className="flex items-center justify-between border-b border-border bg-muted/60 px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-red-400" />
                  <span className="size-2.5 rounded-full bg-amber-400" />
                  <span className="size-2.5 rounded-full bg-orange-500" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  ChopMboa OS — Caisse & Cuisine
                </span>
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                  EN DIRECT
                </span>
              </div>
              <div className="grid gap-px bg-border sm:grid-cols-3">
                <div className="bg-card p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Nouvelles commandes
                  </p>
                  <p className="mt-2 text-2xl font-extrabold">3</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Table T4 · CMD-0042
                  </p>
                </div>
                <div className="bg-card p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    CA aujourd'hui
                  </p>
                  <p className="mt-2 text-2xl font-extrabold text-primary">
                    184 500
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    FCFA · 41 commandes
                  </p>
                </div>
                <div className="bg-card p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Livreurs en route
                  </p>
                  <p className="mt-2 text-2xl font-extrabold">2</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Bonapriso · Akwa
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className="mx-auto max-w-6xl px-4 py-20">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Six modules, un seul outil
          </h2>
          <p className="mt-3 text-muted-foreground">
            Chaque module parle aux autres : une commande passe, la cuisine est
            alertée, le stock descend, le dashboard grimpe.
          </p>
        </motion.div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m, i) => (
            <motion.div
              key={m.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <Card className="group h-full border-border/70 shadow-none transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-orange-900/5">
                <CardContent className="pt-6">
                  <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary-muted text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <m.icon className="size-5" />
                  </div>
                  <h3 className="font-bold">{m.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {m.text}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Comment ça marche */}
      <section id="comment" className="border-y border-border/60 bg-muted/40 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Une commande, zéro friction
            </h2>
            <p className="mt-3 text-muted-foreground">
              Du scan du QR Code à l'assiette servie, tout circule en temps réel.
            </p>
          </motion.div>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.title}
                {...fadeUp}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="relative"
              >
                <div className="flex items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-card text-primary shadow-sm ring-1 ring-border">
                    <s.icon className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary">
                      Étape {i + 1}
                    </p>
                    <h3 className="mt-1 font-bold">{s.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {s.text}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Tarifs */}
      <section id="tarifs" className="mx-auto max-w-6xl px-4 py-20">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Des tarifs en FCFA, sans surprise
          </h2>
          <p className="mt-3 text-muted-foreground">
            Commencez gratuitement. Passez au niveau supérieur quand vos
            restaurants grandissent.
          </p>
        </motion.div>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.code}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
              className={plan.highlight ? "lg:-mt-4 lg:mb-4" : ""}
            >
              <Card
                className={
                  plan.highlight
                    ? "relative h-full border-primary/50 shadow-xl shadow-orange-900/10 ring-1 ring-primary/40"
                    : "relative h-full border-border/70 shadow-none"
                }
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-foreground">
                    Le plus choisi
                  </span>
                )}
                <CardContent className="flex h-full flex-col pt-6">
                  <h3 className="text-lg font-extrabold">{plan.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="text-4xl font-extrabold tracking-tight">
                      {plan.priceFcfa === 0 ? "0" : plan.priceFcfa.toLocaleString("fr-FR")}
                    </span>
                    <span className="text-sm font-medium text-muted-foreground">
                      FCFA/mois
                    </span>
                  </div>
                  <p className="mt-2 rounded-lg bg-primary-muted px-3 py-1.5 text-xs font-semibold text-primary">
                    14 jours d'accès BUSINESS inclus — même sur FREE
                  </p>
                  <ul className="mt-5 flex-1 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    className="mt-6 w-full"
                    variant={plan.highlight ? "default" : "outline"}
                  >
                    <a href={`/auth?returnTo=%2Fdashboard%3Fplan%3D${plan.code}`}>
                      {plan.priceFcfa === 0 ? "Commencer gratuitement" : `Essayer ${plan.name}`}
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Tous les plans démarrent avec 14 jours d'accès BUSINESS · Après l'essai, le
          plan FREE reste gratuit (1 restaurant, 5 tables) · Paiement Mobile
          Money · Résiliable à tout moment
        </p>
      </section>

      {/* Preuve sociale */}
      <section className="border-y border-border/60 bg-muted/40 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid gap-8 text-center sm:grid-cols-3">
            {[
              { value: "3", label: "restaurants de démonstration prêts à l'emploi" },
              { value: "0 FCFA", label: "pour démarrer avec le plan FREE" },
              { value: "15 min", label: "pour passer de l'inscription au premier plat" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-4xl font-extrabold text-primary">{stat.value}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <motion.div
          {...fadeUp}
          className="cm-price-badge relative overflow-hidden rounded-3xl border border-primary/30 px-6 py-14 text-center"
        >
          <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">
            Votre restaurant mérite son système d'exploitation
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Rejoignez les premières tables qui gèrent tout ChopMboa — de la
            caisse à la livraison.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-8 text-base">
              <a href="/auth?returnTo=%2Fdashboard">
                Créer mon compte
                <ArrowRight className="size-5" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base">
              <a href="/auth?returnTo=%2Fdashboard&demo=1">Voir la démo avec données</a>
            </Button>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <img src={logo} alt="ChopMboa" className="size-7 rounded-lg" />
            <span className="font-bold">ChopMboa</span>
            <span className="text-sm text-muted-foreground">· Gérez. Vendez. Livrez.</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © 2026 ChopMboa · Yaoundé — Douala, Cameroun
          </p>
        </div>
      </footer>
    </div>
  );
}
