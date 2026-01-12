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
      toast.error(t("auth.pleaseSignIn"));
      return;
    }

    setUpgrading(true);
    logger.debug("[Plans] Redirecting to Stripe Payment Link...");
    
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
    { text: t("plans.features.trips20"), included: true },
    { text: t("plans.features.projects3"), included: true },
    { text: t("plans.features.basicReports"), included: true },
    { text: t("plans.features.ai5"), included: true },
    { text: t("plans.features.csvExport"), included: true },
    { text: t("plans.features.routeTemplates5"), included: true },
  ];

  const proFeatures = [
    { text: t("plans.features.trips2000"), included: true },
    { text: t("plans.features.projects30"), included: true },
    { text: t("plans.features.advancedReports"), included: true },
    { text: t("plans.features.ai60"), included: true },
    { text: t("plans.features.calendarSync"), included: true },
    { text: t("plans.features.routeTemplates50"), included: true },
    { text: t("plans.features.costAnalysis"), included: true },
    { text: t("plans.features.prioritySupport"), included: true },
  ];

  return (
    <MainLayout backgroundVariant="plans">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-6xl flex-col justify-center px-4 py-10 lg:px-8 lg:-translate-y-16">
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
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-zinc-950 hover:bg-white font-medium px-3 py-1 rounded-full text-xs shadow-sm">
              {t("plans.mostPopular")}
            </Badge>
            
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <Crown className="w-4 h-4 text-muted-foreground" />
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
                  <Check className="w-4 h-4 text-foreground shrink-0 mt-0.5" />
                  <span className="text-sm">{feature.text}</span>
                </li>
              ))}
            </ul>

            <Button 
              className="w-full bg-zinc-600 hover:bg-zinc-600/80 text-white/50 font-medium py-5 text-sm cursor-not-allowed"
              disabled={true}
            >
              {t("common.comingSoon")}
            </Button>
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
