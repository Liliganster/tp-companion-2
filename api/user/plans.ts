/**
 * Plan configuration for user subscription endpoint
 */

export type PlanTier = "basic" | "pro" | "enterprise";

export interface PlanLimits {
  maxTrips: number;
  maxProjects: number;
  maxAiJobsPerMonth: number;
  maxStopsPerTrip: number;
  maxRouteTemplates: number;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  basic: {
    maxTrips: 20,
    maxProjects: 3,
    maxAiJobsPerMonth: 5,
    maxStopsPerTrip: 10,
    maxRouteTemplates: 5,
  },
  pro: {
    maxTrips: 2000,
    maxProjects: 30,
    maxAiJobsPerMonth: 60,
    maxStopsPerTrip: 25,
    maxRouteTemplates: 50,
  },
  enterprise: {
    maxTrips: 999999,
    maxProjects: 999999,
    maxAiJobsPerMonth: 999999,
    maxStopsPerTrip: 100,
    maxRouteTemplates: 999999,
  },
};

export function getPlanLimits(tier: PlanTier): PlanLimits {
  return PLAN_LIMITS[tier] || PLAN_LIMITS.basic;
}
