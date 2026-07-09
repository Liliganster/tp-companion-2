/**
 * Planes de Fahrtenbuch Pro — Fase 1: solo Free y Pro.
 *
 * "basic" = plan Free (nombre histórico en BD; la CHECK constraint de
 * user_profiles.plan_tier acepta basic/pro). El diferenciador real es la
 * cuota mensual de callsheets IA: Free 3/mes, Pro 60/mes. Los viajes
 * manuales son ilimitados en ambos.
 *
 * UNLIMITED (Infinity) solo se usa en cliente; no serializar a JSON.
 */

export type PlanTier = "basic" | "pro";

export const UNLIMITED = Number.POSITIVE_INFINITY;

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
    maxDistanceCalculationsPerMonth: UNLIMITED, // sin enforcement; el coste de Maps se ataca con caché (Fase 2)

    maxTripsPerCSVImport: 200,
    maxTripsPerCalendarImport: 200,
    maxTripsPerDriveImport: 20,

    maxSavedReportsPerMonth: -1, // -1 = unlimited

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

/**
 * Get the plan limits for a given tier
 * Defaults to "basic" if tier is unknown
 */
export function getPlanLimits(tier: PlanTier | string | undefined | null): PlanLimits {
  return PLAN_LIMITS[normalizePlanTier(tier)];
}

/**
 * Default plan for all users
 */
export const DEFAULT_PLAN: PlanTier = "basic";
