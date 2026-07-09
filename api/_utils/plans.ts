/**
 * Planes de Fahrtenbuch Pro (lado servidor) — Fase 1: solo Free y Pro.
 * Duplicado de src/lib/plans.ts para uso en las funciones API.
 *
 * "basic" = plan Free. El servidor solo usa aiJobsPerMonth (cuota IA) y
 * maxCallsheetsPerBatch/maxCallsheetsPerWorkerRun (proceso por lotes).
 * OJO: UNLIMITED (Infinity) se convierte en null si se serializa a JSON.
 */

export type PlanTier = "basic" | "pro";

export const UNLIMITED = Number.POSITIVE_INFINITY;

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
  // Free: viajes manuales ilimitados + 3 callsheets IA/mes.
  basic: {
    maxActiveTrips: UNLIMITED,
    maxActiveTripsAI: UNLIMITED,
    maxActiveTripsNonAI: UNLIMITED,
    maxStopsPerTrip: 25,          // Google Directions Advanced SKU limit
    aiJobsPerMonth: 3,
    allowedAITypes: ["callsheet"], // invoice/expense hibernados (Fase 1)
    maxActiveProjects: UNLIMITED,
    maxRouteTemplates: UNLIMITED,
    maxDistanceCalculationsPerMonth: UNLIMITED,
    maxTripsPerCSVImport: 200,
    maxTripsPerCalendarImport: 200,
    maxTripsPerDriveImport: 20,

    maxSavedReportsPerMonth: -1,

    maxCallsheetsPerBatch: 3,
    maxCallsheetsPerWorkerRun: 1,
  },

  // Pro: 60 callsheets IA/mes y proceso por lotes.
  pro: {
    maxActiveTrips: UNLIMITED,
    maxActiveTripsAI: UNLIMITED,
    maxActiveTripsNonAI: UNLIMITED,
    maxStopsPerTrip: 25,          // Google Directions Advanced SKU limit
    aiJobsPerMonth: 60,
    allowedAITypes: ["callsheet"], // invoice/expense hibernados (Fase 1)
    maxActiveProjects: UNLIMITED,
    maxRouteTemplates: UNLIMITED,
    maxDistanceCalculationsPerMonth: UNLIMITED,
    maxTripsPerCSVImport: 200,
    maxTripsPerCalendarImport: 200,
    maxTripsPerDriveImport: 200,

    maxSavedReportsPerMonth: -1,

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
