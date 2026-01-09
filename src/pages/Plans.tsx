import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Crown, Zap, Building2, Mail, Loader2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { usePlan } from "@/contexts/PlanContext";
import { PLAN_LIMITS } from "@/lib/plans";
import { toast } from "sonner";
import { useState } from "react";

export default function Plans() {
  const { t } = useI18n();
  const { planTier, isLoading, upgradeToPlan, refreshSubscription } = usePlan();
  const [upgrading, setUpgrading] = useState(false);

  const handleUpgrade = async (tier: "basic" | "pro") => {
    setUpgrading(true);
    try {
      const success = await upgradeToPlan(tier);
      if (success) {
        toast.success(
          tier === "pro" 
            ? "¡Bienvenido a Pro! Ya tienes acceso a todas las funciones." 
            : "Plan actualizado correctamente."
        );
      } else {
        toast.error("No se pudo actualizar el plan. Inténtalo de nuevo.");
      }
    } catch (err) {
      toast.error("Error al actualizar el plan.");
    } finally {
      setUpgrading(false);
    }
  };

  const basicFeatures = [
    { text: t("plans.features.trips20"), included: true },
    { text: t("plans.features.projects3"), included: true },
    { text: t("plans.features.ai5"), included: true },
    { text: t("plans.features.stops10"), included: true },
    { text: t("plans.features.csvExport"), included: true },
    { text: t("plans.features.basicReports"), included: true },
    { text: t("plans.features.calendarSync"), included: false },
    { text: t("plans.features.routeTemplates"), included: false },
    { text: t("plans.features.costAnalysis"), included: false },
  ];

  const proFeatures = [
    { text: t("plans.features.trips2000"), included: true },
    { text: t("plans.features.projects30"), included: true },
    { text: t("plans.features.ai60"), included: true },
    { text: t("plans.features.stops25"), included: true },
    { text: t("plans.features.csvExport"), included: true },
    { text: t("plans.features.advancedReports"), included: true },
    { text: t("plans.features.calendarSync"), included: true },
    { text: t("plans.features.routeTemplates50"), included: true },
    { text: t("plans.features.costAnalysis"), included: true },
    { text: t("plans.features.prioritySupport"), included: true },
  ];

  const enterpriseFeatures = [
    { text: t("plans.features.unlimitedTrips"), included: true },
    { text: t("plans.features.unlimitedProjects"), included: true },
    { text: t("plans.features.customAI"), included: true },
    { text: t("plans.features.unlimitedStops"), included: true },
    { text: t("plans.features.allExports"), included: true },
    { text: t("plans.features.customReports"), included: true },
    { text: t("plans.features.calendarSync"), included: true },
    { text: t("plans.features.unlimitedTemplates"), included: true },
    { text: t("plans.features.fullAnalytics"), included: true },
    { text: t("plans.features.dedicatedSupport"), included: true },
    { text: t("plans.features.sla"), included: true },
    { text: t("plans.features.customIntegrations"), included: true },
  ];

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto space-y-8 py-8">
        {/* Header */}
        <div className="text-center space-y-4 animate-fade-in">
          <div className="flex items-center justify-center gap-2">
            <Crown className="w-8 h-8 text-yellow-500" />
            <h1 className="text-3xl sm:text-4xl font-bold">{t("plans.title")}</h1>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t("plans.subtitle")}
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-3 gap-6 animate-fade-in animation-delay-100">
          {/* Basic Plan */}
          <div className="glass-card p-6 rounded-xl border border-border/50 flex flex-col">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-blue-400" />
                <h2 className="text-xl font-semibold">{t("plans.basic.name")}</h2>
              </div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold">0 €</span>
                <span className="text-muted-foreground">/{t("plans.forever")}</span>
              </div>
              <p className="text-sm text-muted-foreground">{t("plans.basic.description")}</p>
            </div>

            <ul className="space-y-3 flex-1 mb-6">
              {basicFeatures.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  {feature.included ? (
                    <Check className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <X className="w-5 h-5 text-muted-foreground/50 shrink-0 mt-0.5" />
                  )}
                  <span className={feature.included ? "text-foreground" : "text-muted-foreground/50"}>
                    {feature.text}
                  </span>
                </li>
              ))}
            </ul>

            <Button 
              variant="outline" 
              className="w-full" 
              disabled={planTier === "basic" || upgrading || isLoading}
              onClick={() => handleUpgrade("basic")}
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
          <div className="glass-card p-6 rounded-xl border-2 border-primary relative flex flex-col">
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
              {t("plans.mostPopular")}
            </Badge>
            
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-5 h-5 text-yellow-500" />
                <h2 className="text-xl font-semibold">{t("plans.pro.name")}</h2>
              </div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold">19 €</span>
                <span className="text-muted-foreground">/{t("plans.perMonth")}</span>
              </div>
              <p className="text-sm text-muted-foreground">{t("plans.pro.description")}</p>
            </div>

            <ul className="space-y-3 flex-1 mb-6">
              {proFeatures.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{feature.text}</span>
                </li>
              ))}
            </ul>

            <Button 
              className="w-full"
              disabled={planTier === "pro" || upgrading || isLoading}
              onClick={() => handleUpgrade("pro")}
            >
              {upgrading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : planTier === "pro" ? (
                t("plans.currentPlan")
              ) : (
                t("plans.upgradeToPro")
              )}
            </Button>
          </div>

          {/* Enterprise Plan */}
          <div className="glass-card p-6 rounded-xl border border-border/50 bg-gradient-to-br from-slate-900/50 to-slate-800/30 flex flex-col">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-5 h-5 text-purple-400" />
                <h2 className="text-xl font-semibold">{t("plans.enterprise.name")}</h2>
              </div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold">{t("plans.custom")}</span>
              </div>
              <p className="text-sm text-muted-foreground">{t("plans.enterprise.description")}</p>
            </div>

            <ul className="space-y-3 flex-1 mb-6">
              {enterpriseFeatures.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                  <span>{feature.text}</span>
                </li>
              ))}
            </ul>

            <Button 
              variant="outline"
              className="w-full border-purple-500/50 hover:bg-purple-500/10"
              onClick={() => window.location.href = "mailto:enterprise@fahrtenbuch.pro?subject=Enterprise Plan Inquiry"}
            >
              <Mail className="w-4 h-4 mr-2" />
              {t("plans.contactSales")}
            </Button>
          </div>
        </div>

        {/* Enterprise CTA */}
        <div className="glass-card p-8 rounded-xl text-center animate-fade-in animation-delay-200">
          <h3 className="text-xl font-semibold mb-2">{t("plans.needMore")}</h3>
          <p className="text-muted-foreground mb-4 max-w-xl mx-auto">
            {t("plans.enterpriseContact")}
          </p>
          <Button 
            variant="outline"
            onClick={() => window.location.href = "mailto:enterprise@fahrtenbuch.pro?subject=Enterprise Plan Inquiry"}
          >
            {t("plans.contactSales")}
          </Button>
        </div>
      </div>
    </MainLayout>
  );
}
