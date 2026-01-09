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
      <div className="max-w-6xl mx-auto h-[calc(100vh-4rem)] flex flex-col justify-center py-4 px-4">
        {/* Header */}
        <div className="text-center space-y-2 animate-fade-in mb-4">
          <div className="flex items-center justify-center gap-2">
            <Crown className="w-6 h-6 text-yellow-500" />
            <h1 className="text-2xl sm:text-3xl font-bold">{t("plans.title")}</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl mx-auto">
            {t("plans.subtitle")}
          </p>
        </div>

        {/* Plans Grid - 2 columns */}
        <div className="grid md:grid-cols-2 gap-4 animate-fade-in animation-delay-100 mb-4">
          {/* Basic Plan */}
          <div className="bg-zinc-900/50 backdrop-blur-sm p-5 rounded-md border border-zinc-800 flex flex-col hover:border-zinc-700 transition-colors">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-blue-400" />
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
                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
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
              className="w-full py-4 rounded-md border-zinc-700 hover:bg-zinc-800 text-sm" 
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
          <div className="bg-zinc-900/50 backdrop-blur-sm p-5 rounded-md border-2 border-zinc-700 relative flex flex-col hover:border-zinc-600 transition-colors">
            <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-yellow-500 text-black hover:bg-yellow-500 font-medium px-3 py-0.5 rounded-full text-xs">
              {t("plans.mostPopular")}
            </Badge>
            
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <Crown className="w-4 h-4 text-yellow-500" />
                <h2 className="text-lg font-semibold">{t("plans.pro.name")}</h2>
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-bold">19 €</span>
                <span className="text-muted-foreground text-sm">/{t("plans.perMonth")}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t("plans.pro.description")}</p>
            </div>

            <ul className="space-y-2 flex-1 mb-4">
              {proFeatures.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span className="text-sm">{feature.text}</span>
                </li>
              ))}
            </ul>

            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 rounded-md text-sm"
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
        <div className="bg-zinc-900/50 backdrop-blur-sm p-4 rounded-md border border-zinc-800 text-center animate-fade-in animation-delay-200">
          <h3 className="text-sm font-semibold mb-1">{t("plans.needMore")}</h3>
          <p className="text-muted-foreground text-xs mb-2 max-w-xl mx-auto">
            {t("plans.enterpriseContact")}
          </p>
          <Button 
            variant="outline"
            size="sm"
            className="text-xs py-2"
            onClick={() => window.location.href = "mailto:enterprise@fahrtenbuch.pro?subject=Enterprise Plan Inquiry"}
          >
            <Mail className="w-3 h-3 mr-1" />
            {t("plans.contactSales")}
          </Button>
        </div>
      </div>
    </MainLayout>
  );
}
