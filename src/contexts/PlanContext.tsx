import { createContext, ReactNode, useContext, useMemo, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { PlanTier, PlanLimits, getPlanLimits, DEFAULT_PLAN } from "@/lib/plans";
import { supabase } from "@/lib/supabaseClient";
import { logger } from "@/lib/logger";

export type { PlanTier, PlanLimits };

interface SubscriptionData {
  plan_tier: PlanTier;
  status: string;
  started_at: string | null;
  expires_at: string | null;
  custom_limits: Record<string, number> | null;
  price_cents: number | null;
  currency: string;
}

function normalizePlanTier(input: unknown): PlanTier {
  const v = String(input ?? "").trim().toLowerCase();
  if (v === "pro") return "pro";
  // historical/default values
  if (v === "free") return "basic";
  if (v === "basic") return "basic";
  return DEFAULT_PLAN;
}

interface PlanContextValue {
  /** Current plan tier for the user */
  planTier: PlanTier;
  /** Plan limits for the current tier */
  limits: PlanLimits;
  /** Subscription status */
  status: string;
  /** Whether plan is loading from database */
  isLoading: boolean;
  /** Check if a feature is available (e.g., AI type) */
  isAITypeAllowed: (type: "callsheet" | "invoice" | "expense") => boolean;
  /** Refresh subscription from database */
  refreshSubscription: () => Promise<void>;
  /** Upgrade to a plan tier */
  upgradeToPlan: (tier: PlanTier) => Promise<boolean>;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch subscription from database
  const fetchSubscription = useCallback(async () => {
    if (!user?.id) {
      setSubscription(null);
      setIsLoading(false);
      return;
    }

    try {
      // Preferred: a single column on user_profiles
      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("plan_tier")
        .eq("id", user.id)
        .maybeSingle();

      if (!profileError && profile) {
        setSubscription({
          plan_tier: normalizePlanTier((profile as any).plan_tier),
          status: "active",
          started_at: null,
          expires_at: null,
          custom_limits: null,
          price_cents: null,
          currency: "EUR",
        });
        return;
      }

      // Default
      setSubscription({
        plan_tier: DEFAULT_PLAN,
        status: "active",
        started_at: null,
        expires_at: null,
        custom_limits: null,
        price_cents: 0,
        currency: "EUR",
      });
    } catch (err) {
      logger.warn("[PlanContext] Failed to fetch subscription", err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Fetch subscription on mount and when user changes
  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("user_subscription_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_profiles",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          if (!payload.new) return;
          const next = payload.new as any;
          if (typeof next.plan_tier !== "undefined") {
            setSubscription((prev) => ({
              ...(prev ?? {
                plan_tier: DEFAULT_PLAN,
                status: "active",
                started_at: null,
                expires_at: null,
                custom_limits: null,
                price_cents: null,
                currency: "EUR",
              }),
              plan_tier: normalizePlanTier(next.plan_tier),
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Plan tier from subscription or default
  const planTier: PlanTier = useMemo(() => {
    if (!subscription) return DEFAULT_PLAN;
    
    // Check if subscription is expired
    if (subscription.expires_at) {
      const expiresAt = new Date(subscription.expires_at);
      if (expiresAt < new Date()) {
        return DEFAULT_PLAN; // Expired subscription falls back to basic
      }
    }
    
    return subscription.plan_tier || DEFAULT_PLAN;
  }, [subscription]);

  // Merge default limits with custom limits from subscription
  const limits = useMemo(() => {
    const baseLimits = getPlanLimits(planTier);
    
    if (!subscription?.custom_limits) return baseLimits;
    
    // Custom limits override base limits
    return {
      ...baseLimits,
      maxActiveTrips: subscription.custom_limits.maxTrips ?? baseLimits.maxActiveTrips,
      maxActiveProjects: subscription.custom_limits.maxProjects ?? baseLimits.maxActiveProjects,
      aiJobsPerMonth: subscription.custom_limits.maxAiJobsPerMonth ?? baseLimits.aiJobsPerMonth,
      maxStopsPerTrip: subscription.custom_limits.maxStopsPerTrip ?? baseLimits.maxStopsPerTrip,
      maxRouteTemplates: subscription.custom_limits.maxRouteTemplates ?? baseLimits.maxRouteTemplates,
    };
  }, [planTier, subscription?.custom_limits]);

  const isAITypeAllowed = useMemo(() => {
    return (type: "callsheet" | "invoice" | "expense") => {
      return limits.allowedAITypes.includes(type);
    };
  }, [limits]);

  // Upgrade flow: redirect to Stripe Payment Link (plan tier is set by webhook).
  const upgradeToPlan = useCallback(async (tier: PlanTier): Promise<boolean> => {
    if (typeof window === "undefined") return false;
    if (!user?.id) return false;

    // Only Pro is purchasable right now.
    if (tier !== "pro") return false;

    const paymentLink = (import.meta.env.VITE_STRIPE_PAYMENT_LINK as string | undefined) ?? "";
    if (!paymentLink || paymentLink.includes("test_XXXXXX")) {
      logger.warn("[PlanContext] Missing/placeholder VITE_STRIPE_PAYMENT_LINK");
      return false;
    }

    const url = new URL(paymentLink);
    url.searchParams.set("client_reference_id", user.id);
    if (user.email) url.searchParams.set("prefilled_email", user.email);

    window.location.href = url.toString();
    return true;
  }, [user?.email, user?.id]);

  const value: PlanContextValue = {
    planTier,
    limits,
    status: subscription?.status || "active",
    isLoading,
    isAITypeAllowed,
    refreshSubscription: fetchSubscription,
    upgradeToPlan,
  };

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) {
    // Return default values if used outside provider (shouldn't happen)
    const limits = getPlanLimits(DEFAULT_PLAN);
    return {
      planTier: DEFAULT_PLAN,
      limits,
      status: "active",
      isLoading: false,
      isAITypeAllowed: (type) => limits.allowedAITypes.includes(type),
      refreshSubscription: async () => {},
      upgradeToPlan: async () => false,
    };
  }
  return ctx;
}
