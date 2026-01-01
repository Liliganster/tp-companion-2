import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatSupabaseError } from "@/lib/supabaseErrors";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";
import { cascadeDeleteTripById } from "@/lib/cascadeDelete";
import { calculateTripEmissions } from "@/lib/emissions";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { parseLocaleNumber } from "@/lib/number";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TripInputSchema } from "@/lib/schemas";
import { isOffline, readOfflineCache, writeOfflineCache } from "@/lib/offlineCache";

export type Trip = {
  id: string;
  date: string;
  route: string[];
  project: string; 
  projectId?: string | null; // Added for relational link
  purpose: string;
  passengers: number;
  invoice?: string; // Legacy: invoice_number
  invoiceAmount?: number | null; // New: extracted amount from invoice
  invoiceCurrency?: string | null; // New: currency (EUR, USD, etc.)
  invoiceJobId?: string | null; // New: link to invoice_job
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
    bucketId?: "callsheets" | "project_documents";
    kind?: "invoice" | "document";
    invoiceJobId?: string;
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
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["trips", user?.id ?? "anon"] as const, [user?.id]);
  const offlineCacheKey = useMemo(() => (user?.id ? `cache:trips:v1:${user.id}` : null), [user?.id]);

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

  const tripsQuery = useQuery({
    queryKey,
    enabled: Boolean(user && supabase),
    queryFn: async (): Promise<Trip[]> => {
      if (!supabase || !user) {
        if (offlineCacheKey) return readOfflineCache<Trip[]>(offlineCacheKey, 30 * 24 * 60 * 60 * 1000) ?? [];
        return [];
      }

      if (offlineCacheKey && isOffline()) {
        return readOfflineCache<Trip[]>(offlineCacheKey, 30 * 24 * 60 * 60 * 1000) ?? [];
      }

      const { data, error } = await supabase
        .from("trips")
        .select("*, projects(name)")
        .order("trip_date", { ascending: false });

      if (error) {
        console.error("Error fetching trips:", error);
        const cached = offlineCacheKey ? readOfflineCache<Trip[]>(offlineCacheKey, 30 * 24 * 60 * 60 * 1000) : null;
        if (cached && cached.length > 0) return cached;
        if (!isOffline()) toast.error(formatSupabaseError(error, "Error cargando viajes"));
        return [];
      }

      const mapped = (data ?? []).map((t: any) => ({
        id: t.id,
        date: t.trip_date || t.date_value || "",
        route: t.route || [],
        project: t.projects?.name || "Unknown",
        projectId: t.project_id,
        callsheet_job_id: t.callsheet_job_id,
        purpose: t.purpose || "",
        passengers: t.passengers || 0,
        invoice: t.invoice_number,
        invoiceAmount: t.invoice_amount ?? null,
        invoiceCurrency: t.invoice_currency ?? null,
        invoiceJobId: t.invoice_job_id ?? null,
        distance: t.distance_km || 0,
        co2: Number.isFinite(Number(t.co2_kg)) ? Number(t.co2_kg) : 0,
        ratePerKmOverride: t.rate_per_km_override,
        specialOrigin: t.special_origin,
        documents: t.documents || [],
      }));

      if (offlineCacheKey) writeOfflineCache(offlineCacheKey, mapped);
      return mapped;
    },
  });

  const trips: Trip[] = useMemo(() => {
    const base = (tripsQuery.data ?? []) as Trip[];
    return base.map((t) => {
      const stored = Number(t.co2);
      const storedValid = Number.isFinite(stored) && stored > 0;
      const computed = calculateTripEmissions({ distanceKm: t.distance, ...emissionsInput }).co2Kg;
      return {
        ...t,
        co2: shouldUseFuelBasedEmissions ? computed : storedValid ? stored : computed,
      };
    });
  }, [emissionsInput, shouldUseFuelBasedEmissions, tripsQuery.data]);

  const loading = tripsQuery.isLoading;

  // Best-effort: if the user configured vehicle emissions, keep DB values in sync so views (e.g. project_totals) match.
  const lastEmissionsSyncKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !supabase) return;
    if (!shouldUseFuelBasedEmissions) return;
    const key = JSON.stringify(emissionsInput);
    if (lastEmissionsSyncKeyRef.current === key) return;
    lastEmissionsSyncKeyRef.current = key;

    const base = (tripsQuery.data ?? []) as Trip[];
    if (base.length === 0) return;

    const updates = base
      .map((t) => {
        const next = calculateTripEmissions({ distanceKm: t.distance, ...emissionsInput }).co2Kg;
        const prev = Number(t.co2);
        const prevValid = Number.isFinite(prev) && prev > 0;
        if (!prevValid || Math.abs(prev - next) > 0.1) return { id: t.id, co2: next };
        return null;
      })
      .filter(Boolean) as Array<{ id: string; co2: number }>;

    if (updates.length === 0) return;

    // Update cache immediately so other views can use consistent values.
    queryClient.setQueryData<Trip[]>(queryKey, (prev) => {
      const list = prev ?? [];
      const map = new Map(updates.map((u) => [u.id, u.co2]));
      return list.map((t) => (map.has(t.id) ? { ...t, co2: map.get(t.id)! } : t));
    });

    // Fire-and-forget DB updates.
    void Promise.allSettled(updates.map((u) => supabase.from("trips").update({ co2_kg: u.co2 }).eq("id", u.id)));
  }, [emissionsInput, queryClient, queryKey, shouldUseFuelBasedEmissions, tripsQuery.data, user]);

  // Keep invoice fields in sync when AI extraction updates trips in DB.
  useEffect(() => {
    if (!user || !supabase) return;

    const channel = supabase
      .channel("trips-invoice-sync")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "trips", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          const next = payload?.new as any;
          if (!next?.id) return;
          queryClient.setQueryData<Trip[]>(queryKey, (prev) =>
            (prev ?? []).map((t) =>
              t.id === next.id
                ? {
                    ...t,
                    invoiceAmount: next.invoice_amount ?? null,
                    invoiceCurrency: next.invoice_currency ?? null,
                    invoiceJobId: next.invoice_job_id ?? null,
                    documents: next.documents ?? t.documents,
                    co2: Number.isFinite(Number(next.co2_kg)) ? Number(next.co2_kg) : t.co2,
                    distance: Number.isFinite(Number(next.distance_km)) ? Number(next.distance_km) : t.distance,
                  }
                : t,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, queryKey, user]);

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

    const parsedInput = TripInputSchema.safeParse({
      id: trip.id,
      date: trip.date,
      distance: Number(trip.distance),
      passengers: Number(trip.passengers),
      purpose: trip.purpose,
      projectId: trip.projectId ?? null,
    });

    if (!parsedInput.success) {
      const issues = parsedInput.error.issues.map((i) => i.message).join("; ");
      toast.error(`Datos del viaje inválidos. ${issues}`);
      return false;
    }

    const normalizedTrip: Trip = {
      ...trip,
      co2: Number.isFinite(Number(trip.co2)) && Number(trip.co2) > 0
        ? Number(trip.co2)
        : calculateTripEmissions({ distanceKm: trip.distance, ...emissionsInput }).co2Kg,
    };

    const prevTrips = (queryClient.getQueryData<Trip[]>(queryKey) ?? []) as Trip[];
    queryClient.setQueryData<Trip[]>(queryKey, [normalizedTrip, ...prevTrips]);

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
      queryClient.setQueryData<Trip[]>(queryKey, (prev) => (prev ?? []).filter((t) => t.id !== normalizedTrip.id));
      return false;
    } else {
        console.log("[TripsContext] Trip saved successfully");
        queryClient.invalidateQueries({ queryKey }).catch(() => null);
        return true;
    }
  }, [emissionsInput, queryClient, queryKey, user]);

  const updateTrip = useCallback(async (id: string, patch: Partial<Trip>): Promise<boolean> => {
    if (!supabase || !user) return false;

    const nextPatch: Partial<Trip> = { ...patch };
    if (patch.distance !== undefined && patch.co2 === undefined) {
      nextPatch.co2 = calculateTripEmissions({ distanceKm: patch.distance, ...emissionsInput }).co2Kg;
    }

    if (nextPatch.date !== undefined || nextPatch.distance !== undefined || nextPatch.passengers !== undefined || nextPatch.projectId !== undefined) {
      const candidate = {
        id,
        date: nextPatch.date ?? "1970-01-01",
        distance: nextPatch.distance !== undefined ? Number(nextPatch.distance) : 1,
        passengers: nextPatch.passengers !== undefined ? Number(nextPatch.passengers) : 0,
        purpose: nextPatch.purpose,
        projectId: nextPatch.projectId ?? null,
      };
      const parsed = TripInputSchema.safeParse(candidate);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => i.message).join("; ");
        toast.error(`Datos del viaje inválidos. ${issues}`);
        return false;
      }
    }

    queryClient.setQueryData<Trip[]>(queryKey, (prev) =>
      (prev ?? []).map((t) => (t.id === id ? { ...t, ...nextPatch } : t)),
    );

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
        queryClient.invalidateQueries({ queryKey }).catch(() => null);
        return false;
      }
    }
    return true;
  }, [emissionsInput, queryClient, queryKey, user]);

  const deleteTrip = useCallback(async (id: string) => {
    if (!supabase || !user) return;

    const prevTrips = (queryClient.getQueryData<Trip[]>(queryKey) ?? []) as Trip[];
    const removedTrip = prevTrips.find((t) => t.id === id);
    queryClient.setQueryData<Trip[]>(queryKey, prevTrips.filter((t) => t.id !== id));

    try {
      await cascadeDeleteTripById(supabase, id);
      queryClient.invalidateQueries({ queryKey }).catch(() => null);
      // Cascade delete can remove orphan projects and update reports, so keep those in sync.
      queryClient.invalidateQueries({ queryKey: ["projects", user.id] }).catch(() => null);
      queryClient.invalidateQueries({ queryKey: ["reports", user.id] }).catch(() => null);
    } catch (err) {
      console.error("[TripsContext] Cascade delete failed:", err);
      toast.error(formatSupabaseError(err, "No se pudo borrar el viaje y sus datos asociados"));
      if (removedTrip) {
        queryClient.setQueryData<Trip[]>(queryKey, (prev) =>
          (prev ?? []).some((t) => t.id === removedTrip.id) ? (prev ?? []) : [removedTrip, ...(prev ?? [])],
        );
      }
      throw err;
    }
  }, [queryClient, queryKey, user]);

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
