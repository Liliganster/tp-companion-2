import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type SavedReport = {
  id: string;
  createdAt: string; // ISO
  month: string; // "01".."12"
  year: string; // "2024"
  project: string; // "all" or project name
  tripIds: string[];
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalDistanceKm: number;
  tripsCount: number;
  driver: string;
  address: string;
  licensePlate: string;
};

const STORAGE_KEY = "reports";

function safeId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

const DEFAULT_REPORTS: SavedReport[] = [];

function readStoredReports(): SavedReport[] {
  if (typeof window === "undefined") return DEFAULT_REPORTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_REPORTS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_REPORTS;
    return parsed as SavedReport[];
  } catch {
    return DEFAULT_REPORTS;
  }
}

function writeStoredReports(reports: SavedReport[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

type ReportsContextValue = {
  reports: SavedReport[];
  addReport: (report: Omit<SavedReport, "id" | "createdAt"> & Partial<Pick<SavedReport, "id" | "createdAt">>) => SavedReport;
  deleteReport: (id: string) => void;
  clearReports: () => void;
};

const ReportsContext = createContext<ReportsContextValue | null>(null);

export function ReportsProvider({ children }: { children: ReactNode }) {
  const [reports, setReportsState] = useState<SavedReport[]>(() => readStoredReports());

  const setReports = useCallback((next: SavedReport[] | ((prev: SavedReport[]) => SavedReport[])) => {
    setReportsState((prev) => {
      const resolved = typeof next === "function" ? (next as (p: SavedReport[]) => SavedReport[])(prev) : next;
      writeStoredReports(resolved);
      return resolved;
    });
  }, []);

  const addReport = useCallback<ReportsContextValue["addReport"]>((report) => {
    const nextReport: SavedReport = {
      id: report.id ?? safeId(),
      createdAt: report.createdAt ?? new Date().toISOString(),
      month: report.month,
      year: report.year,
      project: report.project,
      tripIds: report.tripIds,
      startDate: report.startDate,
      endDate: report.endDate,
      totalDistanceKm: report.totalDistanceKm,
      tripsCount: report.tripsCount,
      driver: report.driver,
      address: report.address,
      licensePlate: report.licensePlate,
    };

    setReports((prev) => [nextReport, ...prev]);
    return nextReport;
  }, [setReports]);

  const deleteReport = useCallback((id: string) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
  }, [setReports]);

  const clearReports = useCallback(() => {
    setReports([]);
  }, [setReports]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setReportsState(readStoredReports());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<ReportsContextValue>(() => ({ reports, addReport, deleteReport, clearReports }), [reports, addReport, deleteReport, clearReports]);

  return <ReportsContext.Provider value={value}>{children}</ReportsContext.Provider>;
}

export function useReports() {
  const ctx = useContext(ReportsContext);
  if (!ctx) throw new Error("useReports must be used within a ReportsProvider");
  return ctx;
}

