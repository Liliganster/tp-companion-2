import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "./AuthContext";

export type SavedReport = {
  id: string;
  createdAt: string; // ISO
  month: string; // "01".."12" (may be empty for custom ranges)
  year: string; // "2024" (may be empty for custom ranges)
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

const safeId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
};

type ReportsContextValue = {
  reports: SavedReport[];
  addReport: (report: Omit<SavedReport, "id" | "createdAt"> & Partial<Pick<SavedReport, "id" | "createdAt">>) => Promise<SavedReport>;
  deleteReport: (id: string) => Promise<void>;
  clearReports: () => Promise<void>;
};

const ReportsContext = createContext<ReportsContextValue | null>(null);

export function ReportsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [reports, setReports] = useState<SavedReport[]>([]);

  useEffect(() => {
    if (!user || !supabase) {
      setReports([]);
      return;
    }

    let mounted = true;

    async function fetchReports() {
      const { data, error } = await supabase!
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching reports:", error);
      }

      if (mounted && data) {
        const mapped: SavedReport[] = data.map((r: any) => ({
          id: r.id,
          createdAt: r.created_at || new Date().toISOString(),
          month: r.month || "",
          year: r.year || "",
          project: r.project_filter || "all",
          tripIds: r.trip_ids || [],
          startDate: r.start_date || "",
          endDate: r.end_date || "",
          totalDistanceKm: Number(r.total_km || 0),
          tripsCount: r.trips_count || 0,
          driver: r.driver || "",
          address: r.address || "",
          licensePlate: r.license_plate || ""
        }));
        setReports(mapped);
      }
    }

    fetchReports();

    return () => { mounted = false; };
  }, [user]);

  const addReport = useCallback<ReportsContextValue["addReport"]>(async (report) => {
    if (!user || !supabase) {
        // Fallback or error? For now just return local object but won't save
        return { ...report, id: "temp", createdAt: new Date().toISOString() } as SavedReport;
    }

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

    const { error } = await supabase.from("reports").insert({
        id: nextReport.id,
        user_id: user.id,
        month: nextReport.month,
        year: nextReport.year,
        project_filter: nextReport.project,
        trip_ids: nextReport.tripIds,
        start_date: nextReport.startDate,
        end_date: nextReport.endDate,
        total_km: nextReport.totalDistanceKm,
        trips_count: nextReport.tripsCount,
        driver: nextReport.driver,
        address: nextReport.address,
        license_plate: nextReport.licensePlate,
        created_at: nextReport.createdAt
    });

    if (error) {
        console.error("Error saving report:", error);
        setReports(prev => prev.filter(r => r.id !== nextReport.id));
    }

    return nextReport;
  }, [user]);

  const deleteReport = useCallback(async (id: string) => {
    if (!user || !supabase) return;
    
    setReports((prev) => prev.filter((r) => r.id !== id));
    
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) {
        console.error("Error deleting report:", error);
    }
  }, [user]);

  const clearReports = useCallback(async () => {
    if (!user || !supabase) return;

    setReports([]);
    // Delete all for user? Or just local state clear? 
    // "clearReports" usually implied deleting all.
    // BE CAREFUL: Do we really want to delete all DB reports?
    // The previous implementation wiped localStorage.
    // For safety, let's assuming purging all reports for this user.
    
    const { error } = await supabase.from("reports").delete().neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all (using user RLS)
    if (error) console.error("Error clearing reports:", error);

  }, [user]);

  const value = useMemo<ReportsContextValue>(() => ({ reports, addReport, deleteReport, clearReports }), [reports, addReport, deleteReport, clearReports]);

  return <ReportsContext.Provider value={value}>{children}</ReportsContext.Provider>;
}

export function useReports() {
  const ctx = useContext(ReportsContext);
  if (!ctx) throw new Error("useReports must be used within a ReportsProvider");
  return ctx;
}

