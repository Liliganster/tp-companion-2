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

  // Reports
  maxSavedReportsPerMonth: number; // -1 = unlimited

  // Callsheet batch upload
  maxCallsheetsPerBatch: number;      // Max PDFs per upload operation
  maxCallsheetsPerWorkerRun: number; // Max PDFs processed per worker execution
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

    // Reports
    maxSavedReportsPerMonth: 1,

    // Callsheet batch
    maxCallsheetsPerBatch: 1,
    maxCallsheetsPerWorkerRun: 1,
  },

  pro: {
    // Pro plan - full features for power users
    maxActiveTrips: 200,
    maxActiveTripsAI: 200,
    maxActiveTripsNonAI: 200,
    maxStopsPerTrip: 25,          // Google Directions Advanced SKU limit
    aiJobsPerMonth: 60,
    allowedAITypes: ["callsheet", "invoice", "expense"],
    maxActiveProjects: 30,
    maxRouteTemplates: 50,
    maxDistanceCalculationsPerMonth: 1000,
    maxTripsPerCSVImport: 200,
    maxTripsPerCalendarImport: 200,
    maxTripsPerDriveImport: 200,

    // Reports
    maxSavedReportsPerMonth: -1,

    // Callsheet batch
    maxCallsheetsPerBatch: 20,
    maxCallsheetsPerWorkerRun: 5,
  },
};

function normalizePlanTier(tier: PlanTier | string | undefined | null): PlanTier {
  const value = String(tier ?? "").trim().toLowerCase();
  if (value === "pro" || value === "pro_plan" || value === "pro plan") return "pro";
  return "basic";
}

export function getPlanLimits(tier: PlanTier | string | undefined | null): PlanLimits {
  return PLAN_LIMITS[normalizePlanTier(tier)];
}

export const DEFAULT_PLAN: PlanTier = "basic";
