import { useMemo } from "react";
import { usePlan } from "@/contexts/PlanContext";
import { useTrips } from "@/contexts/TripsContext";
import { useProjects } from "@/contexts/ProjectsContext";
import { useI18n } from "@/hooks/use-i18n";

export interface LimitCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  message?: string;
}

/**
 * Hook to check and enforce plan limits
 */
export function usePlanLimits() {
  const { limits, planTier } = usePlan();
  const { trips } = useTrips();
  const { projects } = useProjects();
  const { t } = useI18n();

  // Count trips by source (AI vs non-AI)
  const tripCounts = useMemo(() => {
    const aiTrips = trips.filter((trip) => trip.callsheet_job_id).length;
    const nonAiTrips = trips.filter((trip) => !trip.callsheet_job_id).length;
    return {
      total: trips.length,
      ai: aiTrips,
      nonAi: nonAiTrips,
    };
  }, [trips]);

  // Count active (non-archived) projects
  const activeProjectsCount = useMemo(() => {
    return projects.filter((p) => !p.archived).length;
  }, [projects]);

  /**
   * Check if user can add more trips
   */
  const canAddTrip = useMemo((): LimitCheckResult => {
    if (tripCounts.total >= limits.maxActiveTrips) {
      return {
        allowed: false,
        current: tripCounts.total,
        limit: limits.maxActiveTrips,
        remaining: 0,
        message: t("limits.maxTripsReached"),
      };
    }
    return {
      allowed: true,
      current: tripCounts.total,
      limit: limits.maxActiveTrips,
      remaining: limits.maxActiveTrips - tripCounts.total,
    };
  }, [tripCounts.total, limits.maxActiveTrips, t]);

  /**
   * Check if user can add trips created via AI
   */
  const canAddAITrip = useMemo((): LimitCheckResult => {
    // First check total limit
    if (tripCounts.total >= limits.maxActiveTrips) {
      return {
        allowed: false,
        current: tripCounts.ai,
        limit: limits.maxActiveTripsAI,
        remaining: 0,
        message: t("limits.maxTripsReached"),
      };
    }
    // Then check AI-specific limit
    if (tripCounts.ai >= limits.maxActiveTripsAI) {
      return {
        allowed: false,
        current: tripCounts.ai,
        limit: limits.maxActiveTripsAI,
        remaining: 0,
        message: t("limits.maxAITripsReached"),
      };
    }
    return {
      allowed: true,
      current: tripCounts.ai,
      limit: limits.maxActiveTripsAI,
      remaining: Math.min(
        limits.maxActiveTripsAI - tripCounts.ai,
        limits.maxActiveTrips - tripCounts.total
      ),
    };
  }, [tripCounts, limits, t]);

  /**
   * Check if user can add non-AI trips (manual/CSV/Calendar/Drive)
   */
  const canAddNonAITrip = useMemo((): LimitCheckResult => {
    // First check total limit
    if (tripCounts.total >= limits.maxActiveTrips) {
      return {
        allowed: false,
        current: tripCounts.nonAi,
        limit: limits.maxActiveTripsNonAI,
        remaining: 0,
        message: t("limits.maxTripsReached"),
      };
    }
    // Then check non-AI specific limit
    if (tripCounts.nonAi >= limits.maxActiveTripsNonAI) {
      return {
        allowed: false,
        current: tripCounts.nonAi,
        limit: limits.maxActiveTripsNonAI,
        remaining: 0,
        message: t("limits.maxNonAITripsReached"),
      };
    }
    return {
      allowed: true,
      current: tripCounts.nonAi,
      limit: limits.maxActiveTripsNonAI,
      remaining: Math.min(
        limits.maxActiveTripsNonAI - tripCounts.nonAi,
        limits.maxActiveTrips - tripCounts.total
      ),
    };
  }, [tripCounts, limits, t]);

  /**
   * Check if user can add more projects
   */
  const canAddProject = useMemo((): LimitCheckResult => {
    if (activeProjectsCount >= limits.maxActiveProjects) {
      return {
        allowed: false,
        current: activeProjectsCount,
        limit: limits.maxActiveProjects,
        remaining: 0,
        message: t("limits.maxProjectsReached"),
      };
    }
    return {
      allowed: true,
      current: activeProjectsCount,
      limit: limits.maxActiveProjects,
      remaining: limits.maxActiveProjects - activeProjectsCount,
    };
  }, [activeProjectsCount, limits.maxActiveProjects, t]);

  /**
   * Check number of stops for a trip
   */
  const checkStopsLimit = (stopsCount: number): LimitCheckResult => {
    if (stopsCount > limits.maxStopsPerTrip) {
      return {
        allowed: false,
        current: stopsCount,
        limit: limits.maxStopsPerTrip,
        remaining: 0,
        message: t("limits.maxStopsReached"),
      };
    }
    return {
      allowed: true,
      current: stopsCount,
      limit: limits.maxStopsPerTrip,
      remaining: limits.maxStopsPerTrip - stopsCount,
    };
  };

  /**
   * Check import limit for CSV
   */
  const checkCSVImportLimit = (tripsToImport: number): LimitCheckResult => {
    const remainingSlots = canAddNonAITrip.remaining;
    const effectiveLimit = Math.min(limits.maxTripsPerCSVImport, remainingSlots);
    
    if (tripsToImport > effectiveLimit) {
      return {
        allowed: false,
        current: tripsToImport,
        limit: effectiveLimit,
        remaining: effectiveLimit,
        message: t("limits.csvImportExceedsLimit"),
      };
    }
    return {
      allowed: true,
      current: tripsToImport,
      limit: effectiveLimit,
      remaining: effectiveLimit - tripsToImport,
    };
  };

  /**
   * Check import limit for Calendar
   */
  const checkCalendarImportLimit = (tripsToImport: number): LimitCheckResult => {
    const remainingSlots = canAddNonAITrip.remaining;
    const effectiveLimit = Math.min(limits.maxTripsPerCalendarImport, remainingSlots);
    
    if (tripsToImport > effectiveLimit) {
      return {
        allowed: false,
        current: tripsToImport,
        limit: effectiveLimit,
        remaining: effectiveLimit,
        message: t("limits.calendarImportExceedsLimit"),
      };
    }
    return {
      allowed: true,
      current: tripsToImport,
      limit: effectiveLimit,
      remaining: effectiveLimit - tripsToImport,
    };
  };

  /**
   * Check import limit for Drive
   */
  const checkDriveImportLimit = (tripsToImport: number): LimitCheckResult => {
    const remainingSlots = canAddAITrip.remaining; // Drive imports use AI
    const effectiveLimit = Math.min(limits.maxTripsPerDriveImport, remainingSlots);
    
    if (tripsToImport > effectiveLimit) {
      return {
        allowed: false,
        current: tripsToImport,
        limit: effectiveLimit,
        remaining: effectiveLimit,
        message: t("limits.driveImportExceedsLimit"),
      };
    }
    return {
      allowed: true,
      current: tripsToImport,
      limit: effectiveLimit,
      remaining: effectiveLimit - tripsToImport,
    };
  };

  return {
    planTier,
    limits,
    tripCounts,
    activeProjectsCount,
    canAddTrip,
    canAddAITrip,
    canAddNonAITrip,
    canAddProject,
    checkStopsLimit,
    checkCSVImportLimit,
    checkCalendarImportLimit,
    checkDriveImportLimit,
  };
}
