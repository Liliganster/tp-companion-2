import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Check, Crown, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Free",
    price: "€0",
    period: "forever",
    description: "Perfect for getting started",
    features: [
      "Unlimited trips",
      "5 projects",
      "Basic reports",
      "10 AI extractions/month",
      "CSV export",
    ],
    limitations: ["No Google Calendar sync"],
    current: true,
  },
  {
    name: "Pro",
    price: "€9.99",
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
];

export default function Plans() {
  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center animate-fade-in">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center justify-center gap-3">
            <Crown className="w-8 h-8 text-warning" />
            Choose Your Plan
          </h1>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Upgrade to Pro for unlimited features and advanced analytics
          </p>
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {plans.map((plan, index) => (
            <div
              key={plan.name}
              className={cn(
                "glass-card p-6 animate-slide-up relative",
                plan.popular && "border-primary/50 shadow-lg shadow-primary/10"
              )}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-primary to-accent text-xs font-medium text-primary-foreground">
                  Most Popular
                </div>
              )}

              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  {plan.name === "Pro" ? (
                    <Sparkles className="w-5 h-5 text-accent" />
                  ) : (
                    <Zap className="w-5 h-5 text-muted-foreground" />
                  )}
                  <h2 className="text-xl font-semibold">{plan.name}</h2>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold gradient-text">
                    {plan.price}
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
                  Current Plan
                </Button>
              ) : (
                <Button variant="add" className="w-full">
                  Upgrade to {plan.name}
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* FAQ or additional info */}
        <div className="glass-card p-6 text-center animate-fade-in animation-delay-300">
          <h3 className="font-semibold mb-2">Need more AI extractions?</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Contact us for enterprise plans with higher limits and custom features.
          </p>
          <Button variant="outline">Contact Sales</Button>
        </div>
      </div>
    </MainLayout>
  );
}
