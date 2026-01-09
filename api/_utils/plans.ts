/**
 * Plan configuration for Trip Companion (Server-side)
 * 
 * This file defines the limits for each plan tier.
 * Duplicated from src/lib/plans.ts for API usage (different module system)
 */

export type PlanTier = "basic" | "pro";

export interface PlanLimits {
  // Trips
  maxActiveTrips: number;
  maxActiveTripsAI: number;
  maxActiveTripsNonAI: number;
  maxStopsPerTrip: number;

  // AI
  aiJobsPerMonth: number;
  allowedAITypes: ("callsheet" | "invoice" | "expense")[];

  // Projects
  maxActiveProjects: number;

  // Templates
  maxRouteTemplates: number;

  // Google Maps
  maxDistanceCalculationsPerMonth: number;

  // Import limits
  maxTripsPerCSVImport: number;
  maxTripsPerCalendarImport: number;
  maxTripsPerDriveImport: number;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  basic: {
    maxActiveTrips: 20,
    maxActiveTripsAI: 5,
    maxActiveTripsNonAI: 15,
    maxStopsPerTrip: 10,
    aiJobsPerMonth: 5,
    allowedAITypes: ["callsheet", "invoice"],
    maxActiveProjects: 3,
    maxRouteTemplates: 5,
    maxDistanceCalculationsPerMonth: 20,
    maxTripsPerCSVImport: 20,
    maxTripsPerCalendarImport: 20,
    maxTripsPerDriveImport: 20,
  },

  pro: {
    // Pro plan - full features for power users
    maxActiveTrips: 2000,
    maxActiveTripsAI: 2000,
    maxActiveTripsNonAI: 2000,
    maxStopsPerTrip: 25,          // Google Directions Advanced SKU limit
    aiJobsPerMonth: 60,
    allowedAITypes: ["callsheet", "invoice", "expense"],
    maxActiveProjects: 30,
    maxRouteTemplates: 50,
    maxDistanceCalculationsPerMonth: 1000,
    maxTripsPerCSVImport: 2000,
    maxTripsPerCalendarImport: 2000,
    maxTripsPerDriveImport: 2000,
  },
};

export function getPlanLimits(tier: PlanTier | string | undefined | null): PlanLimits {
  if (tier === "pro") return PLAN_LIMITS.pro;
  return PLAN_LIMITS.basic;
}

export const DEFAULT_PLAN: PlanTier = "basic";
