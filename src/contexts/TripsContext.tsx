import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatSupabaseError } from "@/lib/supabaseErrors";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";
import { cascadeDeleteTripById } from "@/lib/cascadeDelete";
import { calculateCO2KgFromKm } from "@/lib/emissions";

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
  callsheet_job_id?: string; // Reference to callsheet_job (project document)
  documents?: Array<{
    id: string;
    name: string;
    mimeType: string;
    driveFileId?: string;
    storagePath?: string;
    createdAt: string; // ISO
  }>; // For trip-specific documents only
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
            project: t.projects?.name || "Unknown",
            projectId: t.project_id,
            callsheet_job_id: t.callsheet_job_id,
            purpose: t.purpose || "",
            passengers: t.passengers || 0,
            invoice: t.invoice_number,
            distance: t.distance_km || 0,
            co2: Number.isFinite(Number(t.co2_kg)) && Number(t.co2_kg) > 0
              ? Number(t.co2_kg)
              : calculateCO2KgFromKm(t.distance_km || 0),
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

    const normalizedTrip: Trip = {
      ...trip,
      co2: Number.isFinite(Number(trip.co2)) && Number(trip.co2) > 0
        ? Number(trip.co2)
        : calculateCO2KgFromKm(trip.distance),
    };

    setTrips(prev => [normalizedTrip, ...prev]);

    // Lookup project_id if not provided but name exists?
    // This is risky. Better to rely on projectId if passed.
    // Ideally consumers (AddTripModal) pass the ID.
    // If not, we define project_id as null.
    // But if we want to save, we construct payload.
    
    // NOTE: This assumes caller provided projectId if they want relational link.
    // AddTripModal currently DOES NOT have projectId in state, only name. 
    // We need to fix AddTripModal to resolve ID from name.

    const dbPayload = {
      id: normalizedTrip.id,
      user_id: user.id,
      project_id: normalizedTrip.projectId || null,
      callsheet_job_id: normalizedTrip.callsheet_job_id || null,
      trip_date: normalizedTrip.date,
      purpose: normalizedTrip.purpose,
      passengers: normalizedTrip.passengers,
      distance_km: normalizedTrip.distance,
      co2_kg: normalizedTrip.co2,
      route: normalizedTrip.route,
      rate_per_km_override: normalizedTrip.ratePerKmOverride,
      special_origin: normalizedTrip.specialOrigin,
      invoice_number: normalizedTrip.invoice,
      documents: normalizedTrip.documents
    };
    
    console.log("[TripsContext] Sending payload to Supabase:", dbPayload);

    const { error } = await supabase.from("trips").insert(dbPayload);

    if (error) {
      console.error("[TripsContext] Error adding trip:", error);
      toast.error(formatSupabaseError(error, "Error guardando viaje: " + error.message));
      setTrips(prev => prev.filter(t => t.id !== normalizedTrip.id));
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
    if (patch.callsheet_job_id !== undefined) dbPatch.callsheet_job_id = patch.callsheet_job_id;
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

    try {
      await cascadeDeleteTripById(supabase, id);
    } catch (err) {
      console.error("[TripsContext] Cascade delete failed:", err);
      toast.error(formatSupabaseError(err, "No se pudo borrar el viaje y sus datos asociados"));
      if (removedTrip) {
        setTrips((prev) => (prev.some((t) => t.id === removedTrip!.id) ? prev : [removedTrip!, ...prev]));
      }
      throw err;
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
