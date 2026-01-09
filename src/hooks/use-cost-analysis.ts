import { useMemo } from "react";
import { parseLocaleNumber } from "@/lib/number";
import type { Trip } from "@/contexts/TripsContext";
import type { Project } from "@/contexts/ProjectsContext";
import type { UserProfile } from "@/contexts/UserProfileContext";

export type PeriodFilter = "this-month" | "last-quarter" | "this-year" | "all" | `year-${number}`;

export type ProjectCostData = {
  projectId: string;
  projectName: string;
  distance: number;
  trips: number;
  tripsData: Trip[];
  realCost: number;
  reimbursement: number;
  balance: number;
  isProfitable: boolean;
  costPerKm: number;
};

export type CostSummary = {
  totalDistance: number;
  totalTrips: number;
  realCost: number;
  reimbursement: number;
  balance: number;
  isProfitable: boolean;
  costPerKm: number;
  // Breakdown
  fuelCost: number;
  tollsCost: number;
  parkingCost: number;
  otherCost: number;
};

export type CostAnalysisResult = {
  summary: CostSummary;
  projectCosts: ProjectCostData[];
  availableYears: number[];
  filteredTrips: Trip[];
  energyPerKm: number;
  hasVehicleConfig: boolean;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const normalized = value.replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function parseTripDate(value: string): Date | null {
  if (!value) return null;
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(value);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return new Date(year, month - 1, day);
  }
  const dt = new Date(value);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

export function useCostAnalysis(
  trips: Trip[],
  projects: Project[],
  profile: UserProfile,
  periodFilter: PeriodFilter
): CostAnalysisResult {
  // Calculate available years from trips
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    trips.forEach((trip) => {
      const dt = parseTripDate(trip.date);
      if (dt) years.add(dt.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [trips]);

  // Check if vehicle configuration is complete
  const hasVehicleConfig = useMemo(() => {
    if (profile.fuelType === "ev") {
      return Boolean(profile.evKwhPer100Km && profile.electricityPricePerKwh);
    } else if (profile.fuelType === "gasoline" || profile.fuelType === "diesel") {
      return Boolean(profile.fuelLPer100Km && profile.fuelPricePerLiter);
    }
    return false;
  }, [profile.electricityPricePerKwh, profile.evKwhPer100Km, profile.fuelLPer100Km, profile.fuelPricePerLiter, profile.fuelType]);

  // Calculate energy cost per km from profile settings
  const energyPerKm = useMemo(() => {
    if (profile.fuelType === "ev") {
      const kwhPer100 = parseLocaleNumber(profile.evKwhPer100Km) ?? 0;
      const pricePerKwh = parseLocaleNumber(profile.electricityPricePerKwh) ?? 0;
      if (kwhPer100 > 0 && pricePerKwh > 0) return (kwhPer100 / 100) * pricePerKwh;
    } else if (profile.fuelType === "gasoline" || profile.fuelType === "diesel") {
      const litersPer100 = parseLocaleNumber(profile.fuelLPer100Km) ?? 0;
      const pricePerLiter = parseLocaleNumber(profile.fuelPricePerLiter) ?? 0;
      if (litersPer100 > 0 && pricePerLiter > 0) return (litersPer100 / 100) * pricePerLiter;
    }
    return 0;
  }, [profile.electricityPricePerKwh, profile.evKwhPer100Km, profile.fuelLPer100Km, profile.fuelPricePerLiter, profile.fuelType]);

  // Get reimbursement rate per km
  const ratePerKm = useMemo(() => parseLocaleNumber(profile.ratePerKm) ?? 0, [profile.ratePerKm]);
  const passengerSurcharge = useMemo(() => parseLocaleNumber(profile.passengerSurcharge) ?? 0, [profile.passengerSurcharge]);

  // Filter trips by period
  const filteredTrips = useMemo(() => {
    if (periodFilter === "all") return trips;

    const now = new Date();

    if (periodFilter === "this-month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return trips.filter((trip) => {
        const dt = parseTripDate(trip.date);
        return dt ? dt >= startOfMonth && dt <= now : false;
      });
    }

    if (periodFilter === "last-quarter") {
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      return trips.filter((trip) => {
        const dt = parseTripDate(trip.date);
        return dt ? dt >= threeMonthsAgo && dt <= now : false;
      });
    }

    if (periodFilter === "this-year") {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return trips.filter((trip) => {
        const dt = parseTripDate(trip.date);
        return dt ? dt >= startOfYear && dt <= now : false;
      });
    }

    // Year filter (year-2024, year-2023, etc.)
    if (periodFilter.startsWith("year-")) {
      const year = parseInt(periodFilter.replace("year-", ""), 10);
      if (Number.isFinite(year)) {
        return trips.filter((trip) => {
          const dt = parseTripDate(trip.date);
          return dt ? dt.getFullYear() === year : false;
        });
      }
    }

    return trips;
  }, [periodFilter, trips]);

  // Calculate trip real cost (fuel estimated + real expenses)
  const calculateTripRealCost = (trip: Trip): number => {
    const distance = toNumber(trip.distance);
    const fuelCost = distance * energyPerKm;
    const toll = toNumber(trip.tollAmount);
    const parking = toNumber(trip.parkingAmount);
    const other = toNumber(trip.otherExpenses);
    // Note: fuelAmount is the actual fuel receipt amount - if present, use it instead of estimated
    const actualFuel = toNumber(trip.fuelAmount);
    const finalFuelCost = actualFuel > 0 ? actualFuel : fuelCost;
    return finalFuelCost + toll + parking + other;
  };

  // Calculate trip reimbursement - needs project rate
  const calculateTripReimbursement = (trip: Trip, projectRatePerKm: number): number => {
    const distance = toNumber(trip.distance);
    // Priority: trip override > project rate > profile rate
    const baseRate = trip.ratePerKmOverride ?? (projectRatePerKm > 0 ? projectRatePerKm : ratePerKm);
    const passengers = toNumber(trip.passengers);
    return distance * baseRate + passengers * passengerSurcharge;
  };

  // Calculate project costs
  const projectCosts = useMemo(() => {
    return projects.map((project) => {
      const projectTrips = filteredTrips.filter((t) => t.projectId === project.id);
      const distance = projectTrips.reduce((sum, t) => sum + toNumber(t.distance), 0);
      const realCost = projectTrips.reduce((sum, t) => sum + calculateTripRealCost(t), 0);
      // Use project's ratePerKm for reimbursement calculation
      const projectRate = project.ratePerKm ?? 0;
      const reimbursement = projectTrips.reduce((sum, t) => sum + calculateTripReimbursement(t, projectRate), 0);
      const balance = reimbursement - realCost;

      return {
        projectId: project.id,
        projectName: project.name,
        distance,
        trips: projectTrips.length,
        tripsData: projectTrips,
        realCost,
        reimbursement,
        balance,
        isProfitable: balance >= 0,
        costPerKm: distance > 0 ? realCost / distance : 0,
      };
    }).filter((p) => p.trips > 0); // Only show projects with trips in period
  }, [filteredTrips, projects, energyPerKm, ratePerKm, passengerSurcharge]);

  // Create a map of project rates for quick lookup
  const projectRateMap = useMemo(() => {
    const map = new Map<string, number>();
    projects.forEach((p) => map.set(p.id, p.ratePerKm ?? 0));
    return map;
  }, [projects]);

  // Calculate summary
  const summary = useMemo((): CostSummary => {
    const totalDistance = filteredTrips.reduce((sum, t) => sum + toNumber(t.distance), 0);
    const totalTrips = filteredTrips.length;

    // Fuel cost breakdown
    let fuelCost = 0;
    filteredTrips.forEach((t) => {
      const actualFuel = toNumber(t.fuelAmount);
      if (actualFuel > 0) {
        fuelCost += actualFuel;
      } else {
        fuelCost += toNumber(t.distance) * energyPerKm;
      }
    });

    const tollsCost = filteredTrips.reduce((sum, t) => sum + toNumber(t.tollAmount), 0);
    const parkingCost = filteredTrips.reduce((sum, t) => sum + toNumber(t.parkingAmount), 0);
    const otherCost = filteredTrips.reduce((sum, t) => sum + toNumber(t.otherExpenses), 0);

    const realCost = fuelCost + tollsCost + parkingCost + otherCost;
    
    // Calculate reimbursement using project rates
    const reimbursement = filteredTrips.reduce((sum, t) => {
      const projectRate = t.projectId ? projectRateMap.get(t.projectId) ?? 0 : 0;
      return sum + calculateTripReimbursement(t, projectRate);
    }, 0);
    
    const balance = reimbursement - realCost;

    return {
      totalDistance,
      totalTrips,
      realCost,
      reimbursement,
      balance,
      isProfitable: balance >= 0,
      costPerKm: totalDistance > 0 ? realCost / totalDistance : 0,
      fuelCost,
      tollsCost,
      parkingCost,
      otherCost,
    };
  }, [filteredTrips, energyPerKm, projectRateMap, ratePerKm, passengerSurcharge]);

  return {
    summary,
    projectCosts,
    availableYears,
    filteredTrips,
    energyPerKm,
    hasVehicleConfig,
  };
}
