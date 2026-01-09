import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Crown, Zap, Mail, Loader2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { usePlan } from "@/contexts/PlanContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useState } from "react";

// Payment Link de Stripe - créalo en https://dashboard.stripe.com/payment-links
// Después de crearlo, copia el URL y pégalo aquí
const STRIPE_PAYMENT_LINK = import.meta.env.VITE_STRIPE_PAYMENT_LINK || "https://buy.stripe.com/test_XXXXXX";

export default function Plans() {
  const { t } = useI18n();
  const { planTier, isLoading } = usePlan();
  const { session, user } = useAuth();
  const [upgrading, setUpgrading] = useState(false);

  const handleStripeCheckout = () => {
    if (!session?.access_token || !user?.id) {
      toast.error("Por favor inicia sesión");
      return;
    }

    setUpgrading(true);
    console.log("[Plans] Redirecting to Stripe Payment Link...");
    
    // Agregar client_reference_id para identificar al usuario en el webhook
    const paymentUrl = new URL(STRIPE_PAYMENT_LINK);
    paymentUrl.searchParams.set("client_reference_id", user.id);
    if (user.email) {
      paymentUrl.searchParams.set("prefilled_email", user.email);
    }
    
    // Redirigir al Payment Link de Stripe
    window.location.href = paymentUrl.toString();
  };

  const basicFeatures = [
    { text: t("plans.features.unlimitedTrips"), included: true },
    { text: t("plans.features.projects3"), included: true },
    { text: t("plans.features.basicReports"), included: true },
    { text: t("plans.features.ai5"), included: true },
    { text: t("plans.features.csvExport"), included: true },
    { text: t("plans.features.calendarSync"), included: false },
  ];

  const proFeatures = [
    { text: t("plans.features.unlimitedTrips"), included: true },
    { text: t("plans.features.unlimitedProjects"), included: true },
    { text: t("plans.features.advancedReports"), included: true },
    { text: t("plans.features.ai60"), included: true },
    { text: t("plans.features.calendarSync"), included: true },
    { text: t("plans.features.routeTemplates"), included: true },
    { text: t("plans.features.costAnalysis"), included: true },
    { text: t("plans.features.prioritySupport"), included: true },
  ];

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-8 py-8 px-4">
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

        {/* Plans Grid - 2 columns */}
        <div className="grid md:grid-cols-2 gap-6 animate-fade-in animation-delay-100">
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
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-black hover:bg-yellow-500">
              {t("plans.mostPopular")}
            </Badge>
            
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-5 h-5 text-yellow-500" />
                <h2 className="text-xl font-semibold">{t("plans.pro.name")}</h2>
              </div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold">9,99 €</span>
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
              onClick={handleStripeCheckout}
            >
              {upgrading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : planTier === "pro" ? (
                t("plans.currentPlan")
              ) : (
                t("plans.upgradeButton")
              )}
            </Button>
          </div>
        </div>

        {/* Enterprise CTA Banner */}
        <div className="glass-card p-6 rounded-xl text-center animate-fade-in animation-delay-200">
          <h3 className="text-lg font-semibold mb-2">{t("plans.needMore")}</h3>
          <p className="text-muted-foreground text-sm mb-4 max-w-xl mx-auto">
            {t("plans.enterpriseContact")}
          </p>
          <Button 
            variant="outline"
            size="sm"
            onClick={() => window.location.href = "mailto:enterprise@fahrtenbuch.pro?subject=Enterprise Plan Inquiry"}
          >
            <Mail className="w-4 h-4 mr-2" />
            {t("plans.contactSales")}
          </Button>
        </div>
      </div>
    </MainLayout>
  );
}
