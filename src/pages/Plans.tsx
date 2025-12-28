import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Check, Crown, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { useI18n } from "@/hooks/use-i18n";

export default function Plans() {
  const { t, tf, language } = useI18n();

  const priceFormatter = useMemo(() => {
    const locale = language === "de" ? "de-DE" : language === "en" ? "en-US" : "es-ES";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }, [language]);

  const plans = useMemo(() => {
    if (language === "de") {
      return [
        {
          name: "Kostenlos",
          priceEur: 0,
          period: "dauerhaft",
          description: "Perfekt zum Einstieg",
          features: ["Unbegrenzte Fahrten", "5 Projekte", "Basisberichte", "10 KI-Extraktionen/Monat", "CSV-Export"],
          limitations: ["Keine Google-Calendar-Synchronisation"],
          current: true,
        },
        {
          name: "Pro",
          priceEur: 9.99,
          period: "pro Monat",
          description: "Für Profis und Teams",
          features: [
            "Unbegrenzte Fahrten",
            "Unbegrenzte Projekte",
            "Erweiterte Berichte",
            "100 KI-Extraktionen/Monat",
            "Google-Calendar-Integration",
            "Routen-Vorlagen",
            "Kostenanalyse",
            "Priorisierter Support",
          ],
          limitations: [],
          current: false,
          popular: true,
        },
      ] as const;
    }

    if (language === "en") {
      return [
        {
          name: "Free",
          priceEur: 0,
          period: "forever",
          description: "Perfect for getting started",
          features: ["Unlimited trips", "5 projects", "Basic reports", "10 AI extractions/month", "CSV export"],
          limitations: ["No Google Calendar sync"],
          current: true,
        },
        {
          name: "Pro",
          priceEur: 9.99,
          period: "per month",
          description: "For professionals and teams",
          features: [
            "Unlimited trips",
            "Unlimited projects",
            "Advanced reports",
            "100 AI extractions/month",
            "Google Calendar integration",
            "Route templates",
            "Cost analysis",
            "Priority support",
          ],
          limitations: [],
          current: false,
          popular: true,
        },
      ] as const;
    }

    return [
      {
        name: "Gratis",
        priceEur: 0,
        period: "para siempre",
        description: "Perfecto para empezar",
        features: ["Viajes ilimitados", "5 proyectos", "Informes básicos", "10 extracciones IA/mes", "Exportación CSV"],
        limitations: ["Sin sincronización con Google Calendar"],
        current: true,
      },
      {
        name: "Pro",
        priceEur: 9.99,
        period: "al mes",
        description: "Para profesionales y equipos",
        features: [
          "Viajes ilimitados",
          "Proyectos ilimitados",
          "Informes avanzados",
          "100 extracciones IA/mes",
          "Integración con Google Calendar",
          "Plantillas de rutas",
          "Análisis de costes",
          "Soporte prioritario",
        ],
        limitations: [],
        current: false,
        popular: true,
      },
    ] as const;
  }, [language]);

  return (
    <MainLayout>
      <div className="relative">
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/12 via-transparent to-fuchsia-500/10" />
          <div className="absolute -top-40 -left-40 h-[34rem] w-[34rem] rounded-full bg-violet-500/10 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 h-[34rem] w-[34rem] rounded-full bg-fuchsia-500/10 blur-3xl" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center animate-fade-in">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center justify-center gap-3">
            <Crown className="w-8 h-8 text-warning" />
            {t("plans.title")}
          </h1>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            {t("plans.subtitle")}
          </p>
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {plans.map((plan, index) => (
            <div
              key={plan.name}
              className={cn(
                "glass-card p-6 animate-slide-up relative",
                plan.popular && "border-yellow-500/40 shadow-lg shadow-yellow-500/10"
              )}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-yellow-400 text-xs font-semibold text-black shadow-lg shadow-yellow-500/30 ring-1 ring-yellow-200/60">
                  {t("plans.mostPopular")}
                </div>
              )}

              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  {plan.name === "Pro" ? (
                    <Sparkles className="w-5 h-5 text-yellow-300" />
                  ) : (
                    <Zap className="w-5 h-5 text-sky-400" />
                  )}
                  <h2 className="text-xl font-semibold">{plan.name}</h2>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-violet-200 via-violet-100 to-fuchsia-200 bg-clip-text text-transparent drop-shadow-sm">
                    {priceFormatter.format(plan.priceEur)}
                  </span>
                  <span className="text-muted-foreground">/{plan.period}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {plan.description}
                </p>
              </div>

              <div className="space-y-3 mb-6">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-success shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
                {plan.limitations.map((limitation) => (
                  <div
                    key={limitation}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <div className="w-4 h-4 flex items-center justify-center shrink-0">
                      <div className="w-1.5 h-0.5 bg-muted-foreground rounded" />
                    </div>
                    <span>{limitation}</span>
                  </div>
                ))}
              </div>

              {plan.current ? (
                <Button variant="outline" className="w-full" disabled>
                  {t("plans.currentPlan")}
                </Button>
              ) : (
                <Button variant="add" className="w-full">
                  {tf("plans.upgradeTo", { name: plan.name })}
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* FAQ or additional info */}
        <div className="glass-card p-6 text-center animate-fade-in animation-delay-300">
          <h3 className="font-semibold mb-2">{t("plans.needMoreAi")}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t("plans.contactBody")}
          </p>
          <Button variant="outline">{t("plans.contactSales")}</Button>
        </div>
      </div>
      </div>
    </MainLayout>
  );
}
