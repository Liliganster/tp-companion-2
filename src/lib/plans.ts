/**
 * Plan configuration for Trip Companion
 * 
 * This file defines the limits for each plan tier.
 * Currently only "basic" plan is implemented. "pro" will be added later.
 */

export type PlanTier = "basic" | "pro";

export interface PlanLimits {
  // Trips
  maxActiveTrips: number;                    // Total active trips (manual + CSV + Calendar + Drive + AI)
  maxActiveTripsAI: number;                  // Trips created via AI extraction
  maxActiveTripsNonAI: number;               // Trips created manually/CSV/Calendar/Drive
  maxStopsPerTrip: number;                   // Maximum waypoints/stops per trip

  // AI
  aiJobsPerMonth: number;                    // Monthly AI extraction jobs (callsheet, invoice, expense)
  allowedAITypes: ("callsheet" | "invoice" | "expense")[]; // Types of AI extraction allowed

  // Projects
  maxActiveProjects: number;                 // Maximum active (non-archived) projects

  // Templates
  maxRouteTemplates: number;                 // Reusable route templates

  // Google Maps calculations
  maxDistanceCalculationsPerMonth: number;   // Google Maps distance calculations

  // Import limits (per single import operation)
  maxTripsPerCSVImport: number;
  maxTripsPerCalendarImport: number;
  maxTripsPerDriveImport: number;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  basic: {
    // Trips
    maxActiveTrips: 20,
    maxActiveTripsAI: 5,
    maxActiveTripsNonAI: 15,
    maxStopsPerTrip: 10,

    // AI - 5 jobs/month, allows callsheet and invoice extraction
    aiJobsPerMonth: 5,
    allowedAITypes: ["callsheet", "invoice"],

    // Projects
    maxActiveProjects: 3,

    // Templates
    maxRouteTemplates: 5,

    // Google Maps
    maxDistanceCalculationsPerMonth: 20,

    // Import limits
    maxTripsPerCSVImport: 20,
    maxTripsPerCalendarImport: 20,
    maxTripsPerDriveImport: 20,
  },

  pro: {
    // Pro plan will be configured later with higher/unlimited values
    // For now, using same as basic (will be updated when pro is implemented)
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
};

/**
 * Get the plan limits for a given tier
 * Defaults to "basic" if tier is unknown
 */
export function getPlanLimits(tier: PlanTier | string | undefined | null): PlanLimits {
  if (tier === "pro") return PLAN_LIMITS.pro;
  return PLAN_LIMITS.basic;
}

/**
 * Default plan for all users
 */
export const DEFAULT_PLAN: PlanTier = "basic";
