import { createContext, ReactNode, useContext, useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./AuthContext";
import { PlanTier, PlanLimits, getPlanLimits, DEFAULT_PLAN } from "@/lib/plans";
import { logger } from "@/lib/logger";

export type { PlanTier, PlanLimits };

export type AiQuotaPolicy = { limit: number; period: 'monthly' | 'annual'; periodStart: string; periodEnd: string };

interface SubscriptionData {
  userId: string;
  aiQuota?: AiQuotaPolicy;
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
  subscriptionError: boolean;
  hasConfirmedSubscription: boolean;
  aiQuota?: AiQuotaPolicy;
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
  const { user, getAccessToken } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failedUserId, setFailedUserId] = useState<string | null>(null);
  const requestId = useRef(0);
  const activeUserId = useRef(user?.id);
  activeUserId.current = user?.id;
  // Never reuse one account's confirmed plan while switching to another.
  const currentSubscription = subscription?.userId === user?.id ? subscription : null;
  const subscriptionError = Boolean(user?.id && failedUserId === user.id);
  const hasConfirmedSubscription = Boolean(currentSubscription);

  // Fetch subscription from database
  const fetchSubscription = useCallback(async () => {
    const sequence = ++requestId.current;
    const userId = user?.id;
    const isCurrent = () => sequence === requestId.current && activeUserId.current === userId;
    if (!user?.id) {
      setSubscription(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("missing_session");
      const response = await fetch("/api/user/subscription", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`subscription_fetch_failed:${response.status}`);
      const data = await response.json();
      if (!isCurrent()) return;
      setFailedUserId(null);
      setSubscription({
        userId: user.id,
        plan_tier: normalizePlanTier(data?.tier),
        aiQuota: data?.aiQuota,
        status: typeof data?.status === "string" ? data.status : "free",
        started_at: typeof data?.startedAt === "string" ? data.startedAt : null,
        expires_at: typeof data?.expiresAt === "string" ? data.expiresAt : null,
        custom_limits: null,
        price_cents: typeof data?.priceCents === "number" ? data.priceCents : 0,
        currency: typeof data?.currency === "string" ? data.currency : "EUR",
      });
    } catch (err) {
      logger.warn("[PlanContext] Failed to fetch subscription", err);
      if (isCurrent()) setFailedUserId(user.id);
      // Preserve only this account's last server-confirmed plan. On first-load
      // errors the UI reports unavailable; API authorization still fails closed.
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [user?.id, getAccessToken]);

  // Fetch subscription on mount and when user changes
  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Plan tier from currentSubscription or default
  const planTier: PlanTier = useMemo(() => {
    if (!currentSubscription) return DEFAULT_PLAN;
    
    // Check if currentSubscription is expired
    if (currentSubscription.expires_at) {
      const expiresAt = new Date(currentSubscription.expires_at);
      if (expiresAt < new Date()) {
        return DEFAULT_PLAN; // Expired currentSubscription falls back to basic
      }
    }
    
    return currentSubscription.plan_tier || DEFAULT_PLAN;
  }, [currentSubscription]);

  // Merge default limits with custom limits from currentSubscription
  const limits = useMemo(() => {
    const baseLimits = getPlanLimits(planTier);
    
    if (!currentSubscription?.custom_limits) return baseLimits;
    
    // Custom limits override base limits
    return {
      ...baseLimits,
      maxActiveTrips: currentSubscription.custom_limits.maxTrips ?? baseLimits.maxActiveTrips,
      maxActiveProjects: currentSubscription.custom_limits.maxProjects ?? baseLimits.maxActiveProjects,
      aiJobsPerMonth: currentSubscription.custom_limits.maxAiJobsPerMonth ?? baseLimits.aiJobsPerMonth,
      maxStopsPerTrip: currentSubscription.custom_limits.maxStopsPerTrip ?? baseLimits.maxStopsPerTrip,
      maxRouteTemplates: currentSubscription.custom_limits.maxRouteTemplates ?? baseLimits.maxRouteTemplates,
    };
  }, [planTier, currentSubscription?.custom_limits]);

  const isAITypeAllowed = useMemo(() => {
    return (type: "callsheet" | "invoice" | "expense") => {
      return limits.allowedAITypes.includes(type);
    };
  }, [limits]);

  // Upgrade flow: returns false as payment provider is removed
  const upgradeToPlan = useCallback(async (tier: PlanTier): Promise<boolean> => {
    logger.warn("[PlanContext] Cannot upgrade. Payment provider integrations are removed.");
    return false;
  }, []);

  const value: PlanContextValue = {
    subscriptionError,
    hasConfirmedSubscription,
    aiQuota: currentSubscription?.aiQuota,
    planTier,
    limits,
    status: currentSubscription?.status || (subscriptionError ? "unavailable" : "loading"),
    isLoading: isLoading || Boolean(user?.id && !currentSubscription && !subscriptionError),
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
      subscriptionError: false,
      hasConfirmedSubscription: false,
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
