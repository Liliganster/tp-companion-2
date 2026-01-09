import { createContext, ReactNode, useContext, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { PlanTier, PlanLimits, getPlanLimits, DEFAULT_PLAN } from "@/lib/plans";

export type { PlanTier, PlanLimits };

interface PlanContextValue {
  /** Current plan tier for the user */
  planTier: PlanTier;
  /** Plan limits for the current tier */
  limits: PlanLimits;
  /** Check if a feature is available (e.g., AI type) */
  isAITypeAllowed: (type: "callsheet" | "invoice" | "expense") => boolean;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // For now, all users are "basic" plan
  // Later this will be fetched from user_profiles or a subscription service
  const planTier: PlanTier = useMemo(() => {
    // When Stripe/subscription is implemented, this will check:
    // 1. User's subscription status from Supabase
    // 2. Or a dedicated subscription service
    // For now, everyone is on the basic plan
    return DEFAULT_PLAN;
  }, [user]);

  const limits = useMemo(() => getPlanLimits(planTier), [planTier]);

  const isAITypeAllowed = useMemo(() => {
    return (type: "callsheet" | "invoice" | "expense") => {
      return limits.allowedAITypes.includes(type);
    };
  }, [limits]);

  const value: PlanContextValue = {
    planTier,
    limits,
    isAITypeAllowed,
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
      isAITypeAllowed: (type) => limits.allowedAITypes.includes(type),
    };
  }
  return ctx;
}
