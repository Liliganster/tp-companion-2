/**
 * Stripe configuration and plan definitions
 */

export type PlanId = "free" | "pro";

export interface StripePlan {
  id: PlanId;
  name: string;
  priceId: string | null; // Stripe Price ID (null for free plan)
  priceEur: number;
  aiExtractionsPerMonth: number;
  maxProjects: number;
  features: string[];
}

/**
 * Plan configuration - Price IDs should be set in environment variables
 */
export const STRIPE_PLANS: Record<PlanId, StripePlan> = {
  free: {
    id: "free",
    name: "Free",
    priceId: null,
    priceEur: 0,
    aiExtractionsPerMonth: 5,
    maxProjects: 5,
    features: [
      "unlimited_trips",
      "basic_reports",
      "csv_export",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceId: import.meta.env.VITE_STRIPE_PRICE_PRO || null,
    priceEur: 9.99,
    aiExtractionsPerMonth: 100,
    maxProjects: -1, // unlimited
    features: [
      "unlimited_trips",
      "unlimited_projects",
      "advanced_reports",
      "google_calendar",
      "route_templates",
      "cost_analysis",
      "priority_support",
    ],
  },
};

/**
 * Get Stripe publishable key from environment
 */
export const getStripePublishableKey = (): string | null => {
  return import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || null;
};

/**
 * Check if Stripe is configured
 */
export const isStripeConfigured = (): boolean => {
  return Boolean(getStripePublishableKey());
};

/**
 * Get plan by ID
 */
export const getPlan = (planId: PlanId): StripePlan => {
  return STRIPE_PLANS[planId];
};

/**
 * Get plan limits for a user's subscription
 */
export const getPlanLimits = (planId: PlanId) => {
  const plan = STRIPE_PLANS[planId];
  return {
    aiExtractionsPerMonth: plan.aiExtractionsPerMonth,
    maxProjects: plan.maxProjects,
  };
};
