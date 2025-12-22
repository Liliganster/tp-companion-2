import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Trip = {
  id: string;
  date: string;
  route: string[];
  project: string;
  purpose: string;
  passengers: number;
  invoice?: string;
  warnings?: string[];
  co2: number;
  distance: number;
  ratePerKmOverride?: number | null;
  specialOrigin?: "base" | "continue" | "return";
  documents?: Array<{
    id: string;
    name: string;
    mimeType: string;
    driveFileId: string;
    createdAt: string; // ISO
  }>;
};

const STORAGE_KEY = "trips";

const calculateCO2 = (distance: number) => Math.round(distance * 0.12 * 10) / 10;

const DEFAULT_TRIPS: Trip[] = [
  {
    id: "1",
    date: "2024-01-15",
    route: ["Berlin HQ", "Leipzig", "München Studio"],
    project: "Film Production XY",
    purpose: "Location scouting",
    passengers: 2,
    distance: 584,
    co2: calculateCO2(584),
  },
  {
    id: "2",
    date: "2024-01-14",
    route: ["München Studio", "Nürnberg", "Frankfurt", "Köln Location"],
    project: "Film Production XY",
    purpose: "Equipment transport",
    passengers: 0,
    distance: 575,
    co2: calculateCO2(575),
  },
  {
    id: "3",
    date: "2024-01-13",
    route: ["Home Office", "Berlin HQ"],
    project: "Internal",
    purpose: "Office meeting",
    passengers: 0,
    distance: 45,
    co2: calculateCO2(45),
  },
  {
    id: "4",
    date: "2024-01-12",
    route: ["Berlin HQ", "Hannover", "Hamburg Meeting"],
    project: "Client ABC",
    purpose: "Client presentation",
    passengers: 1,
    warnings: ["Unusual distance"],
    distance: 289,
    co2: calculateCO2(289),
  },
  {
    id: "5",
    date: "2024-01-11",
    route: ["Hamburg Meeting", "Berlin HQ"],
    project: "Client ABC",
    purpose: "Return trip",
    passengers: 0,
    distance: 289,
    co2: calculateCO2(289),
  },
];

function readStoredTrips(): Trip[] {
  if (typeof window === "undefined") return DEFAULT_TRIPS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TRIPS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_TRIPS;
    return parsed as Trip[];
  } catch {
    return DEFAULT_TRIPS;
  }
}

function writeStoredTrips(trips: Trip[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
}

type TripsContextValue = {
  trips: Trip[];
  setTrips: (trips: Trip[] | ((prev: Trip[]) => Trip[])) => void;
};

const TripsContext = createContext<TripsContextValue | null>(null);

export function TripsProvider({ children }: { children: ReactNode }) {
  const [trips, setTripsState] = useState<Trip[]>(() => readStoredTrips());

  const setTrips = useCallback<TripsContextValue["setTrips"]>((next) => {
    setTripsState((prev) => {
      const resolved = typeof next === "function" ? (next as (p: Trip[]) => Trip[])(prev) : next;
      writeStoredTrips(resolved);
      return resolved;
    });
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setTripsState(readStoredTrips());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<TripsContextValue>(() => ({ trips, setTrips }), [trips, setTrips]);

  return <TripsContext.Provider value={value}>{children}</TripsContext.Provider>;
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error("useTrips must be used within a TripsProvider");
  return ctx;
}
