import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Crown, Zap, Mail, Loader2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { usePlan } from "@/contexts/PlanContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useState } from "react";
import { logger } from "@/lib/logger";
export default function Plans() {
  const { t } = useI18n();
  const { planTier, isLoading } = usePlan();
  const { session, user } = useAuth();
  const [upgrading, setUpgrading] = useState(false);
  // Anual preseleccionado (estrategia 2026-07-11): el uso es estacional/por
  // volcados — el anual cubre todo el año fiscal; el mensual queda como
  // "pago por volcado" sin permanencia.
  const [billing, setBilling] = useState<"annual" | "monthly">("annual");

  const handleStripeCheckout = () => {
    // Feature not available (Stripe integrations removed)
    toast.info(t("common.comingSoon") || "Coming Soon");
  };

  // Cantidades = las REALES de src/lib/plans.ts (Free: 3 IA/mes, lote de 3;
  // Pro: 60 IA/mes, lote de 20). OpenRouter propio = solo Pro.
  const basicFeatures = [
    { text: t("plans.features.unlimitedTrips"), included: true },
    { text: t("plans.features.unlimitedProjects"), included: true },
    { text: t("plans.features.stops25"), included: true },
    { text: t("plans.features.ai3"), included: true },
    { text: t("plans.features.callsheetBatch3"), included: true },
    { text: t("plans.features.calendarSync"), included: true },
    { text: t("plans.features.reportsUnlimited"), included: true },
    { text: t("plans.features.csvExport"), included: true },
    { text: t("plans.features.byoOpenrouter"), included: false },
  ];

  // Lo fuerte primero: la IA es el motivo de compra
  const proFeatures = [
    { text: t("plans.features.ai60"), included: true },
    { text: t("plans.features.callsheetBulk20"), included: true },
    { text: t("plans.features.byoOpenrouter"), included: true },
    { text: t("plans.features.unlimitedTrips"), included: true },
    { text: t("plans.features.unlimitedProjects"), included: true },
    { text: t("plans.features.stops25"), included: true },
    { text: t("plans.features.calendarSync"), included: true },
    { text: t("plans.features.reportsUnlimited"), included: true },
    { text: t("plans.features.csvExport"), included: true },
    { text: t("plans.features.prioritySupport"), included: true },
  ];

  return (
    <MainLayout backgroundVariant="plans">
      {/* Altura estándar de página (sin centrado vertical ni translate: el
          título quedaba pegado al borde superior) */}
      <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
        {/* Header */}
        <div className="text-center space-y-2 animate-fade-in mb-8">
          <div className="flex items-center justify-center gap-2">
            <Crown className="w-6 h-6 text-muted-foreground" />
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{t("plans.title")}</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl mx-auto">
            {t("plans.subtitle")}
          </p>
        </div>

            {/* Toggle mensual/anual — anual preseleccionado con badge de ahorro */}
            <div className="flex justify-center mb-8 animate-fade-in">
              <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1">
                <button
                  type="button"
                  onClick={() => setBilling("monthly")}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    billing === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("plans.billingMonthly")}
                </button>
                <button
                  type="button"
                  onClick={() => setBilling("annual")}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2 ${
                    billing === "annual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("plans.billingAnnual")}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-chip ${
                    billing === "annual" ? "bg-primary-foreground/20" : "bg-success/20 text-success"
                  }`}>
                    {t("plans.annualBadge")}
                  </span>
                </button>
              </div>
            </div>

            {/* Plans Grid - 2 columns */}
            <div className="grid gap-6 md:grid-cols-2 animate-fade-in animation-delay-100 mb-6">
              {/* Basic Plan */}
              <div className="bg-zinc-900/40 backdrop-blur-md p-6 rounded-lg border border-zinc-800/80 flex flex-col transition-colors hover:border-zinc-700/80">
              <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">{t("plans.basic.name")}</h2>
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-bold">0 €</span>
                <span className="text-muted-foreground text-sm">/{t("plans.forever")}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t("plans.basic.description")}</p>
            </div>

            <ul className="space-y-2 flex-1 mb-4">
              {basicFeatures.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  {feature.included ? (
                    <Check className="w-4 h-4 text-foreground shrink-0 mt-0.5" />
                  ) : (
                    <X className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                  )}
                  <span className={`text-sm ${feature.included ? "text-foreground" : "text-muted-foreground/50"}`}>
                    {feature.text}
                  </span>
                </li>
              ))}
            </ul>

            <Button 
              variant="outline" 
              className="w-full py-5 border-zinc-700/80 bg-zinc-950/20 hover:bg-zinc-800/60 text-sm disabled:opacity-100 disabled:bg-zinc-950/30 disabled:border-zinc-800/80 disabled:text-zinc-500" 
              disabled={planTier === "basic" || upgrading || isLoading}
            >
              {upgrading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : planTier === "basic" ? (
                t("plans.currentPlan")
              ) : (
                t("plans.basic.name")
              )}
            </Button>
          </div>

              {/* Pro Plan */}
              <div className="bg-zinc-900/40 backdrop-blur-md p-6 rounded-lg border border-white/15 ring-1 ring-white/10 relative flex flex-col transition-colors hover:border-white/20">
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-zinc-950 hover:bg-white font-medium px-3 py-1 text-xs shadow-sm">
              {t("plans.mostPopular")}
            </Badge>
            
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <Crown className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">{t("plans.pro.name")}</h2>
              </div>
              {billing === "annual" ? (
                <>
                  <div className="flex items-baseline gap-1 mb-0.5">
                    <span className="text-3xl font-bold">49,99 €</span>
                    <span className="text-muted-foreground text-sm">/{t("plans.perYear")}</span>
                  </div>
                  <p className="text-xs font-medium text-success mb-1">{t("plans.annualEquiv")}</p>
                </>
              ) : (
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-bold">8,99 €</span>
                  <span className="text-muted-foreground text-sm">/{t("plans.perMonth")}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t("plans.pro.description")}</p>
            </div>

            <ul className="space-y-2 flex-1 mb-4">
              {proFeatures.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-foreground shrink-0 mt-0.5" />
                  <span className="text-sm">{feature.text}</span>
                </li>
              ))}
            </ul>

            <Button
              className="w-full bg-muted text-muted-foreground font-medium py-5 text-sm cursor-not-allowed"
              disabled={true}
            >
              {t("common.comingSoon")}
            </Button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">{t("plans.cancelAnytime")}</p>
          </div>
        </div>

            {/* Enterprise CTA Banner */}
            <div className="bg-zinc-900/35 backdrop-blur-md px-6 py-8 rounded-lg border border-zinc-800/80 text-center animate-fade-in animation-delay-200">
              <h3 className="text-sm font-semibold mb-2">{t("plans.needMore")}</h3>
              <p className="text-muted-foreground text-xs mb-4 max-w-xl mx-auto">
                {t("plans.enterpriseContact")}
              </p>
              <Button 
                variant="outline"
                className="h-9 px-4 text-xs border-zinc-700/80 bg-zinc-950/20 text-muted-foreground/50 cursor-not-allowed"
                disabled={true}
              >
                {t("common.comingSoon")}
              </Button>
            </div>
      </div>
    </MainLayout>
  );
}
