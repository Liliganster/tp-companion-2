import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatSupabaseError } from "@/lib/supabaseErrors";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";
import { cascadeDeleteTripById } from "@/lib/cascadeDelete";
import { calculateTripEmissions } from "@/lib/emissions";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { parseLocaleNumber } from "@/lib/number";

export type Trip = {
  id: string;
  date: string;
  route: string[];
  project: string; 
  projectId?: string; // Added for relational link
  purpose: string;
  passengers: number;
  invoice?: string; // Legacy: invoice_number
  invoiceAmount?: number; // New: extracted amount from invoice
  invoiceCurrency?: string; // New: currency (EUR, USD, etc.)
  invoiceJobId?: string; // New: link to invoice_job
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
  addTrip: (trip: Trip) => Promise<boolean>;
  updateTrip: (id: string, patch: Partial<Trip>) => Promise<boolean>;
  deleteTrip: (id: string) => Promise<void>;
  // Deprecated compatibility
  // setTrips...
};

const TripsContext = createContext<TripsContextValue | null>(null);

export function TripsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const emissionsInput = useMemo(() => {
    return {
      fuelType: profile.fuelType,
      fuelLPer100Km: parseLocaleNumber(profile.fuelLPer100Km),
      evKwhPer100Km: parseLocaleNumber(profile.evKwhPer100Km),
      gridKgCo2PerKwh: parseLocaleNumber(profile.gridKgCo2PerKwh),
    };
  }, [profile.evKwhPer100Km, profile.fuelLPer100Km, profile.fuelType, profile.gridKgCo2PerKwh]);

  const shouldUseFuelBasedEmissions = useMemo(() => {
    const fuelL = Number(emissionsInput.fuelLPer100Km);
    const evKwh = Number(emissionsInput.evKwhPer100Km);
    if (emissionsInput.fuelType === "gasoline" || emissionsInput.fuelType === "diesel") {
      return Number.isFinite(fuelL) && fuelL > 0;
    }
    if (emissionsInput.fuelType === "ev") {
      return Number.isFinite(evKwh) && evKwh > 0;
    }
    return false;
  }, [emissionsInput.evKwhPer100Km, emissionsInput.fuelLPer100Km, emissionsInput.fuelType]);

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
            invoiceAmount: t.invoice_amount,
            invoiceCurrency: t.invoice_currency,
            invoiceJobId: t.invoice_job_id,
            distance: t.distance_km || 0,
            co2: shouldUseFuelBasedEmissions
              ? calculateTripEmissions({ distanceKm: t.distance_km || 0, ...emissionsInput }).co2Kg
              : (Number.isFinite(Number(t.co2_kg)) && Number(t.co2_kg) > 0
                ? Number(t.co2_kg)
                : calculateTripEmissions({ distanceKm: t.distance_km || 0, ...emissionsInput }).co2Kg),
            ratePerKmOverride: t.rate_per_km_override,
            specialOrigin: t.special_origin,
            documents: t.documents || []
          }));
          setTrips(mapped);

          // Best-effort: if the user configured vehicle emissions, keep DB values in sync so views (e.g. project_totals) match.
          if (shouldUseFuelBasedEmissions) {
            const updates = (data as any[])
              .map((t: any) => {
                const distanceKm = t.distance_km || 0;
                const next = calculateTripEmissions({ distanceKm, ...emissionsInput }).co2Kg;
                const prev = Number(t.co2_kg);
                const prevValid = Number.isFinite(prev) && prev > 0;
                if (!prevValid || Math.abs(prev - next) > 0.1) return { id: t.id, co2_kg: next };
                return null;
              })
              .filter(Boolean) as Array<{ id: string; co2_kg: number }>;

            if (updates.length > 0) {
              // Fire-and-forget updates; avoid blocking the UI.
              Promise.allSettled(
                updates.map((u) => supabase.from("trips").update({ co2_kg: u.co2_kg }).eq("id", u.id)),
              ).catch(() => null);
            }
          }
        }
        setLoading(false);
      }
    }

    fetchTrips();

    return () => { mounted = false; };
  }, [user, emissionsInput, shouldUseFuelBasedEmissions]);

  const addTrip = useCallback(async (trip: Trip): Promise<boolean> => {
    console.log("[TripsContext] addTrip called with:", trip);
    if (!supabase) {
      console.error("[TripsContext] Supabase client is missing");
      return false;
    }
    if (!user) {
      console.error("[TripsContext] User is missing");
      return false;
    }

    const normalizedTrip: Trip = {
      ...trip,
      co2: Number.isFinite(Number(trip.co2)) && Number(trip.co2) > 0
        ? Number(trip.co2)
        : calculateTripEmissions({ distanceKm: trip.distance, ...emissionsInput }).co2Kg,
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
      invoice_amount: normalizedTrip.invoiceAmount,
      invoice_currency: normalizedTrip.invoiceCurrency,
      invoice_job_id: normalizedTrip.invoiceJobId,
      documents: normalizedTrip.documents
    };
    
    console.log("[TripsContext] Sending payload to Supabase:", dbPayload);

    const { error } = await supabase.from("trips").insert(dbPayload);

    if (error) {
      console.error("[TripsContext] Error adding trip:", error);
      toast.error(formatSupabaseError(error, "Error guardando viaje: " + error.message));
      setTrips(prev => prev.filter(t => t.id !== normalizedTrip.id));
      return false;
    } else {
        console.log("[TripsContext] Trip saved successfully");
        return true;
    }
  }, [user, emissionsInput]);

  const updateTrip = useCallback(async (id: string, patch: Partial<Trip>): Promise<boolean> => {
    if (!supabase || !user) return false;

    const nextPatch: Partial<Trip> = { ...patch };
    if (patch.distance !== undefined && patch.co2 === undefined) {
      nextPatch.co2 = calculateTripEmissions({ distanceKm: patch.distance, ...emissionsInput }).co2Kg;
    }

    setTrips(prev => prev.map(t => t.id === id ? { ...t, ...nextPatch } : t));

    const dbPatch: any = {};
    if (patch.date !== undefined) {
      dbPatch.trip_date = patch.date;
    }
    if (patch.purpose !== undefined) dbPatch.purpose = patch.purpose;
    if (patch.passengers !== undefined) dbPatch.passengers = patch.passengers;
    if (nextPatch.distance !== undefined) dbPatch.distance_km = nextPatch.distance;
    if (nextPatch.co2 !== undefined) dbPatch.co2_kg = nextPatch.co2;
    if (patch.route !== undefined) dbPatch.route = patch.route;
    if (patch.ratePerKmOverride !== undefined) dbPatch.rate_per_km_override = patch.ratePerKmOverride;
    if (patch.specialOrigin !== undefined) dbPatch.special_origin = patch.specialOrigin;
    if (patch.invoice !== undefined) dbPatch.invoice_number = patch.invoice;
    if (patch.invoiceAmount !== undefined) dbPatch.invoice_amount = patch.invoiceAmount;
    if (patch.invoiceCurrency !== undefined) dbPatch.invoice_currency = patch.invoiceCurrency;
    if (patch.invoiceJobId !== undefined) dbPatch.invoice_job_id = patch.invoiceJobId;
    if (patch.documents !== undefined) dbPatch.documents = patch.documents;
    if (patch.callsheet_job_id !== undefined) dbPatch.callsheet_job_id = patch.callsheet_job_id;
    if (patch.projectId !== undefined) dbPatch.project_id = patch.projectId;

    if (Object.keys(dbPatch).length > 0) {
      const { error } = await supabase.from("trips").update(dbPatch).eq("id", id);
      if (error) {
        console.error("Error updating trip:", error);
        toast.error(formatSupabaseError(error, "Error actualizando viaje"));
        return false;
      }
    }
    return true;
  }, [user, emissionsInput]);

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
