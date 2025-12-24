import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatSupabaseError } from "@/lib/supabaseErrors";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";

export type Trip = {
  id: string;
  date: string;
  route: string[];
  project: string; 
  projectId?: string; // Added for relational link
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
    driveFileId?: string;
    storagePath?: string;
    createdAt: string; // ISO
  }>;
};

type TripsContextValue = {
  trips: Trip[];
  loading: boolean;
  addTrip: (trip: Trip) => Promise<void>;
  updateTrip: (id: string, patch: Partial<Trip>) => Promise<void>;
  deleteTrip: (id: string) => Promise<void>;
  // Deprecated compatibility
  // setTrips...
};

const TripsContext = createContext<TripsContextValue | null>(null);

const calculateCO2 = (distance: number) => Math.round(distance * 0.12 * 10) / 10;

export function TripsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !supabase) {
      setTrips([]);
      setLoading(false);
      return;
    }

    let mounted = true;

    async function fetchTrips() {
      // Join with projects to get name
      const { data, error } = await supabase!
        .from("trips")
        .select("*, projects(name)")
        .order("trip_date", { ascending: false });

      if (error) {
        console.error("Error fetching trips:", error);
        toast.error(formatSupabaseError(error, "Error cargando viajes"));
      }

      if (mounted) {
        if (data) {
          const mapped: Trip[] = data.map((t: any) => ({
            id: t.id,
            date: t.trip_date || t.date_value || "",
            route: t.route || [],
            project: t.projects?.name || "Unknown", // Fallback if join null (e.g. deleted project)
            projectId: t.project_id,
            purpose: t.purpose || "",
            passengers: t.passengers || 0,
            invoice: t.invoice_number,
            distance: t.distance_km || 0,
            co2: t.co2_kg || calculateCO2(t.distance_km || 0),
            ratePerKmOverride: t.rate_per_km_override,
            specialOrigin: t.special_origin,
            documents: t.documents || []
          }));
          setTrips(mapped);
        }
        setLoading(false);
      }
    }

    fetchTrips();

    return () => { mounted = false; };
  }, [user]);

  const addTrip = useCallback(async (trip: Trip) => {
    console.log("[TripsContext] addTrip called with:", trip);
    if (!supabase) {
      console.error("[TripsContext] Supabase client is missing");
      return;
    }
    if (!user) {
      console.error("[TripsContext] User is missing");
      return;
    }

    setTrips(prev => [trip, ...prev]);

    // Lookup project_id if not provided but name exists?
    // This is risky. Better to rely on projectId if passed.
    // Ideally consumers (AddTripModal) pass the ID.
    // If not, we define project_id as null.
    // But if we want to save, we construct payload.
    
    // NOTE: This assumes caller provided projectId if they want relational link.
    // AddTripModal currently DOES NOT have projectId in state, only name. 
    // We need to fix AddTripModal to resolve ID from name.

    const dbPayload = {
      id: trip.id,
      user_id: user.id,
      project_id: trip.projectId || null, // Important
      // Some Supabase schemas include both columns; keep them in sync.
      trip_date: trip.date,
      purpose: trip.purpose,
      passengers: trip.passengers,
      distance_km: trip.distance,
      co2_kg: trip.co2,
      route: trip.route,
      rate_per_km_override: trip.ratePerKmOverride,
      special_origin: trip.specialOrigin,
      invoice_number: trip.invoice,
      documents: trip.documents
    };
    
    console.log("[TripsContext] Sending payload to Supabase:", dbPayload);

    const { error } = await supabase.from("trips").insert(dbPayload);

    if (error) {
      console.error("[TripsContext] Error adding trip:", error);
      toast.error(formatSupabaseError(error, "Error guardando viaje: " + error.message));
      setTrips(prev => prev.filter(t => t.id !== trip.id));
    } else {
        console.log("[TripsContext] Trip saved successfully");
    }
  }, [user]);

  const updateTrip = useCallback(async (id: string, patch: Partial<Trip>) => {
    if (!supabase || !user) return;

    setTrips(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));

    const dbPatch: any = {};
    if (patch.date !== undefined) {
      dbPatch.trip_date = patch.date;
    }
    if (patch.purpose !== undefined) dbPatch.purpose = patch.purpose;
    if (patch.passengers !== undefined) dbPatch.passengers = patch.passengers;
    if (patch.distance !== undefined) dbPatch.distance_km = patch.distance;
    if (patch.co2 !== undefined) dbPatch.co2_kg = patch.co2;
    if (patch.route !== undefined) dbPatch.route = patch.route;
    if (patch.ratePerKmOverride !== undefined) dbPatch.rate_per_km_override = patch.ratePerKmOverride;
    if (patch.specialOrigin !== undefined) dbPatch.special_origin = patch.specialOrigin;
    if (patch.invoice !== undefined) dbPatch.invoice_number = patch.invoice;
    if (patch.documents !== undefined) dbPatch.documents = patch.documents;
    if (patch.projectId !== undefined) dbPatch.project_id = patch.projectId;

    if (Object.keys(dbPatch).length > 0) {
      const { error } = await supabase.from("trips").update(dbPatch).eq("id", id);
      if (error) {
        console.error("Error updating trip:", error);
        toast.error(formatSupabaseError(error, "Error actualizando viaje"));
      }
    }
  }, [user]);

  const deleteTrip = useCallback(async (id: string) => {
    if (!supabase || !user) return;

    let removedTrip: Trip | undefined;
    setTrips((prev) => {
      removedTrip = prev.find((t) => t.id === id);
      return prev.filter((t) => t.id !== id);
    });

    // Fetch documents from DB (in case local state is stale)
    const { data: tripRow, error: tripFetchError } = await supabase
      .from("trips")
      .select("documents")
      .eq("id", id)
      .maybeSingle();

    if (tripFetchError) {
      console.warn("[TripsContext] Could not fetch trip before delete:", tripFetchError);
    }

    const docsFromDb = (tripRow as any)?.documents;
    const docsFromLocal = removedTrip?.documents;
    const docs: any[] = Array.isArray(docsFromDb)
      ? docsFromDb
      : Array.isArray(docsFromLocal)
        ? docsFromLocal
        : [];

    const storagePaths = Array.from(
      new Set(
        docs
          .map((d) => {
            const p = typeof d?.storagePath === "string" ? d.storagePath : typeof d?.path === "string" ? d.path : "";
            const trimmed = (p ?? "").trim();
            return trimmed ? trimmed : null;
          })
          .filter(Boolean) as string[]
      )
    );

    // 1) Delete associated files from Storage (callsheets bucket)
    if (storagePaths.length > 0) {
      const { error: storageError } = await supabase.storage.from("callsheets").remove(storagePaths);
      if (storageError) {
        console.error("[TripsContext] Error deleting callsheet files:", storageError);
        toast.error(
          formatSupabaseError(
            storageError,
            "No se pudieron borrar los documentos del viaje (revisa políticas de Storage)"
          )
        );
        // Restore local state since we couldn't fully delete associated data
        if (removedTrip) {
          setTrips((prev) => (prev.some((t) => t.id === removedTrip!.id) ? prev : [removedTrip!, ...prev]));
        }
        return;
      }

      // 2) Delete associated extractor DB rows (best-effort)
      const { error: jobsDeleteError } = await supabase
        .from("callsheet_jobs")
        .delete()
        .in("storage_path", storagePaths);

      if (jobsDeleteError) {
        console.warn("[TripsContext] Could not delete callsheet_jobs for deleted trip:", jobsDeleteError);
        toast.error(formatSupabaseError(jobsDeleteError, "No se pudieron borrar algunos datos de IA asociados"));
      }
    }

    // 3) Remove this trip from any saved reports (best-effort)
    try {
      const { data: affectedReports, error: reportsFetchError } = await supabase
        .from("reports")
        .select("id, trip_ids")
        .contains("trip_ids", [id]);

      if (reportsFetchError) {
        console.warn("[TripsContext] Could not fetch affected reports:", reportsFetchError);
      } else if (affectedReports && affectedReports.length > 0) {
        await Promise.all(
          affectedReports.map(async (r: any) => {
            const currentIds: string[] = Array.isArray(r.trip_ids) ? r.trip_ids : [];
            const nextIds = currentIds.filter((tid) => tid !== id);
            if (nextIds.length === currentIds.length) return;
            const { error: updateError } = await supabase.from("reports").update({ trip_ids: nextIds }).eq("id", r.id);
            if (updateError) {
              console.warn("[TripsContext] Could not update report trip_ids:", updateError);
            }
          })
        );
      }
    } catch (err) {
      console.warn("[TripsContext] Unexpected error cleaning reports:", err);
    }

    // 4) Delete the trip row itself
    const { error: deleteError } = await supabase.from("trips").delete().eq("id", id);
    if (deleteError) {
      console.error("Error deleting trip:", deleteError);
      toast.error(formatSupabaseError(deleteError, "Error borrando viaje"));
      // Restore local state if DB deletion failed
      if (removedTrip) {
        setTrips((prev) => (prev.some((t) => t.id === removedTrip!.id) ? prev : [removedTrip!, ...prev]));
      }
    }
  }, [user]);

  const value = useMemo<TripsContextValue>(() => ({ 
    trips, 
    loading, 
    addTrip, 
    updateTrip, 
    deleteTrip 
  }), [trips, loading, addTrip, updateTrip, deleteTrip]);

  return <TripsContext.Provider value={value}>{children}</TripsContext.Provider>;
}

export function useTrips() {
  const ctx = useContext(TripsContext);
  if (!ctx) throw new Error("useTrips must be used within a TripsProvider");
  return ctx;
}
