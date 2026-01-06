import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatSupabaseError } from "@/lib/supabaseErrors";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";
import { cascadeDeleteProjectById, cascadeDeleteTripById } from "@/lib/cascadeDelete";
import { calculateTripEmissions } from "@/lib/emissions";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { parseLocaleNumber } from "@/lib/number";
import { useElectricityMapsCarbonIntensity } from "@/hooks/use-electricity-maps";
import { useClimatiqFuelFactor } from "@/hooks/use-climatiq";
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
  clientName?: string; // Metadata from template/input (stored in documents)
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

  const { data: atGrid } = useElectricityMapsCarbonIntensity("AT", {
    enabled: profile.fuelType === "ev",
  });

  const { data: fuelFactor } = useClimatiqFuelFactor(
    profile.fuelType === "diesel" ? profile.fuelType : null,
    { enabled: profile.fuelType === "diesel" },
  );

  const emissionsInput = useMemo(() => {
    return {
      fuelType: profile.fuelType,
      fuelLPer100Km: parseLocaleNumber(profile.fuelLPer100Km),
      fuelKgCo2ePerLiter: fuelFactor?.kgCo2ePerLiter ?? null,
      fuelKgCo2ePerKm: fuelFactor?.kgCo2ePerKm ?? null,
      evKwhPer100Km: parseLocaleNumber(profile.evKwhPer100Km),
      gridKgCo2PerKwh: atGrid?.kgCo2PerKwh ?? null,
    };
  }, [atGrid?.kgCo2PerKwh, fuelFactor?.kgCo2ePerLiter, fuelFactor?.kgCo2ePerKm, profile.evKwhPer100Km, profile.fuelLPer100Km, profile.fuelType]);

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
        project: t.projects?.name || (() => {
          const docs = t.documents || [];
          const meta = docs.find((d: any) => d.kind === "client_meta");
          return meta?.name || "Unknown";
        })(),
        projectId: t.project_id,
        clientName: (() => {
            const docs = t.documents || [];
            const meta = docs.find((d: any) => d.kind === "client_meta");
            return meta?.name || undefined;
        })(),
        callsheet_job_id: t.callsheet_job_id,
        purpose: t.purpose || "",
        passengers: t.passengers || 0,
        invoice: t.invoice_number,
        invoiceAmount: t.invoice_amount ?? null,
        invoiceCurrency: t.invoice_currency ?? null,
        invoiceJobId: t.invoice_job_id ?? null,
        distance: t.distance_km || 0,
        co2: 0, // Will be recalculated using API data in the trips memo
        ratePerKmOverride: t.rate_per_km_override,
        specialOrigin: t.special_origin,
        documents: (t.documents || []).filter((d: any) => d.kind !== "client_meta"),
      }));

      if (offlineCacheKey) writeOfflineCache(offlineCacheKey, mapped);
      return mapped;
    },
  });

  const trips: Trip[] = useMemo(() => {
    const base = (tripsQuery.data ?? []) as Trip[];
    // Always recalculate CO2 using current API data (Climatiq/Electricity Maps)
    // Never trust stored values - APIs dictate the calculation
    return base.map((t) => {
      const computed = calculateTripEmissions({ distanceKm: t.distance, ...emissionsInput }).co2Kg;
      return {
        ...t,
        co2: computed,
      };
    });
  }, [emissionsInput, tripsQuery.data]);

  const loading = tripsQuery.isLoading;

  // Best-effort: keep DB values in sync with API-calculated emissions
  const lastEmissionsSyncKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !supabase) return;
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
  }, [emissionsInput, queryClient, queryKey, tripsQuery.data, user]);

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
                    documents: (next.documents || []).filter((d: any) => d.kind !== "client_meta"),
                    clientName: (() => {
                        const docs = next.documents || [];
                        const meta = docs.find((d: any) => d.kind === "client_meta");
                        return meta?.name || undefined;
                    })(),
                    project: t.projectId 
                        ? t.project 
                        : (next.documents || []).find((d: any) => d.kind === "client_meta")?.name || "Unknown",
                    // Don't update co2 from DB - always recalculate using API data
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
      co2: calculateTripEmissions({ distanceKm: trip.distance, ...emissionsInput }).co2Kg,
    };

    const callsheetJobId = String(normalizedTrip.callsheet_job_id ?? "").trim();
    const prevTrips = (queryClient.getQueryData<Trip[]>(queryKey) ?? []) as Trip[];

    if (callsheetJobId) {
      const cached = prevTrips.find((t) => String(t.callsheet_job_id ?? "").trim() === callsheetJobId);
      if (cached) return true;

      try {
        const { data, error } = await supabase
          .from("trips")
          .select("id")
          .eq("user_id", user.id)
          .eq("callsheet_job_id", callsheetJobId)
          .limit(1)
          .maybeSingle();

        if (!error && data?.id) {
          queryClient.invalidateQueries({ queryKey }).catch(() => null);
          return true;
        }
      } catch {
        // ignore and continue with insert
      }
    }

    queryClient.setQueryData<Trip[]>(queryKey, [normalizedTrip, ...prevTrips]);

    // Handle Client Name metadata in documents
    let documentsToSave = normalizedTrip.documents || [];
    if (!normalizedTrip.projectId && normalizedTrip.project && normalizedTrip.project !== "Unknown") {
        const meta = {
            id: crypto.randomUUID(),
            kind: "client_meta",
            name: normalizedTrip.project,
            createdAt: new Date().toISOString()
        };
        documentsToSave = [...documentsToSave, meta] as any;
    }

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
      documents: documentsToSave
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
        if (callsheetJobId && normalizedTrip.projectId) {
          try {
            await supabase
              .from("callsheet_jobs")
              .update({ project_id: normalizedTrip.projectId })
              .eq("id", callsheetJobId);
          } catch {
            // ignore
          }
        }
        queryClient.invalidateQueries({ queryKey }).catch(() => null);
        return true;
    }
  }, [emissionsInput, queryClient, queryKey, user]);

  const updateTrip = useCallback(async (id: string, patch: Partial<Trip>): Promise<boolean> => {
    if (!supabase || !user) return false;

    const prevTrips = (queryClient.getQueryData<Trip[]>(queryKey) ?? []) as Trip[];
    const prevTrip = prevTrips.find((t) => t.id === id) ?? null;
    const previousProjectId = typeof prevTrip?.projectId === "string" ? prevTrip.projectId.trim() : "";

    // Treat `undefined` as "not provided" so we don't accidentally wipe optional fields
    // when callers pass a full trip object with omitted/undefined properties.
    const safePatch = Object.fromEntries(
      Object.entries(patch as Record<string, unknown>).filter(([, value]) => value !== undefined),
    ) as Partial<Trip>;

    const nextPatch: Partial<Trip> = { ...safePatch };
    // Always recalculate CO2 if distance changes, using current API data
    if (safePatch.distance !== undefined) {
      nextPatch.co2 = calculateTripEmissions({ distanceKm: safePatch.distance, ...emissionsInput }).co2Kg;
    }

    const cachedProjects = (queryClient.getQueryData(["projects", user.id]) ?? []) as Array<any>;
    const normalizeKey = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

    // If the caller passes only a project name (common when saving from generic forms),
    // try to resolve the relational projectId to keep DB + documents consistent.
    if (nextPatch.projectId === undefined && typeof safePatch.project === "string") {
      const key = normalizeKey(safePatch.project);
      if (key) {
        const match = cachedProjects.find((p) => normalizeKey(String(p?.name ?? "")) === key);
        const pid = typeof match?.id === "string" ? match.id.trim() : "";
        if (pid) nextPatch.projectId = pid;
      }
    }

    // Fallback: if projects cache isn't ready, resolve by querying Supabase (best-effort).
    if (nextPatch.projectId === undefined && typeof safePatch.project === "string") {
      const rawName = safePatch.project.replace(/\s+/g, " ").trim();
      if (rawName) {
        try {
          const { data, error } = await supabase
            .from("projects")
            .select("id, name")
            .eq("user_id", user.id)
            .ilike("name", rawName)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!error && data?.id) {
            nextPatch.projectId = String((data as any).id).trim();
          }
        } catch {
          // ignore
        }
      }
    }

    // If the caller passes a projectId, keep the display name in sync too.
    if (nextPatch.projectId !== undefined) {
      const pid = typeof nextPatch.projectId === "string" ? nextPatch.projectId.trim() : "";
      if (pid) {
        const match = cachedProjects.find((p) => String(p?.id ?? "").trim() === pid);
        const name = typeof match?.name === "string" ? match.name.trim() : "";
        if (name) nextPatch.project = name;
      }
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
    if (safePatch.date !== undefined) {
      dbPatch.trip_date = safePatch.date;
    }
    if (safePatch.purpose !== undefined) dbPatch.purpose = safePatch.purpose;
    if (safePatch.passengers !== undefined) dbPatch.passengers = safePatch.passengers;
    if (nextPatch.distance !== undefined) dbPatch.distance_km = nextPatch.distance;
    if (nextPatch.co2 !== undefined) dbPatch.co2_kg = nextPatch.co2;
    if (safePatch.route !== undefined) dbPatch.route = safePatch.route;
    if (safePatch.ratePerKmOverride !== undefined) dbPatch.rate_per_km_override = safePatch.ratePerKmOverride;
    if (safePatch.specialOrigin !== undefined) dbPatch.special_origin = safePatch.specialOrigin;
    if (safePatch.invoice !== undefined) dbPatch.invoice_number = safePatch.invoice;
    if (safePatch.invoiceAmount !== undefined) dbPatch.invoice_amount = safePatch.invoiceAmount;
    if (safePatch.invoiceCurrency !== undefined) dbPatch.invoice_currency = safePatch.invoiceCurrency;
    if (safePatch.invoiceJobId !== undefined) dbPatch.invoice_job_id = safePatch.invoiceJobId;
    
    // Handle documents and client metadata
    const nextDocuments = safePatch.documents;
    
    // If we are setting a clientName (explicitly passed) or we are setting project_id to Null (and need to persist the name?)
    // Actually, updateTrip usually receives "project" string in the patch if we updated the type? No, existing type has `project`.
    // But `project` in type is usually the display name.
    
    // If patch has clientName, we must update documents.
    if (safePatch.clientName !== undefined) {
        // Fetch current documents if not in patch
      const currentDocs = nextDocuments || (trips.find(t => t.id === id)?.documents || []);
      const filtered = currentDocs.filter((d: any) => d.kind !== "client_meta");
        
        if (safePatch.clientName) {
            filtered.push({
                id: crypto.randomUUID(),
                kind: "client_meta",
                name: safePatch.clientName,
                createdAt: new Date().toISOString()
            } as any);
        }
        dbPatch.documents = filtered;
    } else if (safePatch.documents !== undefined) {
      dbPatch.documents = safePatch.documents;
    }
    
    // Also if we are setting projectId to a valid ID, we should remove client_meta?
    if (safePatch.projectId && safePatch.projectId !== null) {
        // If we are assigning to a real project, remove the client meta unless explicitly told otherwise.
        // But we might not have `documents` in the patch.
        // Let's rely on the caller to handle this? Or handle it here.
        // Safest: The caller (Add Trip Modal) will likely pass the full state.
        // Let's just handle `clientName` in patch.
    }
    
    if (safePatch.callsheet_job_id !== undefined) dbPatch.callsheet_job_id = safePatch.callsheet_job_id;
    if (nextPatch.projectId !== undefined) dbPatch.project_id = nextPatch.projectId;

    if (Object.keys(dbPatch).length > 0) {
      const { error } = await supabase.from("trips").update(dbPatch).eq("id", id);
      if (error) {
        console.error("Error updating trip:", error);
        toast.error(formatSupabaseError(error, "Error actualizando viaje"));
        queryClient.invalidateQueries({ queryKey }).catch(() => null);
        return false;
      }
    }

    if (nextPatch.projectId !== undefined) {
      const nextProjectId = nextPatch.projectId;
      const currentTrips = (queryClient.getQueryData<Trip[]>(queryKey) ?? []) as Trip[];
      const existingTrip = currentTrips.find((t) => t.id === id) ?? null;
      const jobId = String(safePatch.callsheet_job_id ?? prevTrip?.callsheet_job_id ?? existingTrip?.callsheet_job_id ?? "").trim();
      if (jobId) {
        const { error: callsheetJobMoveError } = await supabase
          .from("callsheet_jobs")
          .update({ project_id: nextProjectId ?? null })
          .eq("id", jobId);
        if (callsheetJobMoveError) {
          console.warn("[TripsContext] No se pudo mover el callsheet al nuevo proyecto:", callsheetJobMoveError);
        }
      }

      const callsheetPaths = (prevTrip?.documents ?? existingTrip?.documents ?? [])
        .filter((d: any) => String(d?.bucketId ?? "").trim() !== "project_documents")
        .map((d: any) => String(d?.storagePath ?? d?.path ?? "").trim())
        .filter(Boolean);

      if (callsheetPaths.length > 0) {
        const { error: callsheetPathsMoveError } = await supabase
          .from("callsheet_jobs")
          .update({ project_id: nextProjectId ?? null })
          .in("storage_path", callsheetPaths);
        if (callsheetPathsMoveError) {
          console.warn("[TripsContext] No se pudo mover el callsheet por storage_path:", callsheetPathsMoveError);
        }
      }

      // Keep invoice jobs/documents consistent with the trip's project when the user moves a trip.
      const { error: invoiceJobsMoveError } = await supabase
        .from("invoice_jobs")
        .update({ project_id: nextProjectId ?? null })
        .eq("trip_id", id);
      if (invoiceJobsMoveError) {
        console.warn("[TripsContext] No se pudo actualizar invoice_jobs.project_id al mover el viaje:", invoiceJobsMoveError);
      }

      const nextProjectIdStr = typeof nextProjectId === "string" ? nextProjectId.trim() : "";
      if (nextProjectIdStr) {
        let projectDocsMoveError: any = null;
        const invoiceJobIds = new Set<string>();
        const primaryInvoiceJobId = String(prevTrip?.invoiceJobId ?? existingTrip?.invoiceJobId ?? "").trim();
        if (primaryInvoiceJobId) invoiceJobIds.add(primaryInvoiceJobId);
        for (const doc of prevTrip?.documents ?? existingTrip?.documents ?? []) {
          const jid = String((doc as any)?.invoiceJobId ?? "").trim();
          if (jid) invoiceJobIds.add(jid);
        }

        const invoiceJobIdList = Array.from(invoiceJobIds);
        if (invoiceJobIdList.length > 0) {
          // Some older rows may have NULL trip_id, so update by job id as well (best-effort).
          const { error: invoiceJobsByIdError } = await supabase
            .from("invoice_jobs")
            .update({ project_id: nextProjectId ?? null })
            .in("id", invoiceJobIdList);
          if (invoiceJobsByIdError) {
            console.warn("[TripsContext] No se pudo actualizar invoice_jobs por id al mover el viaje:", invoiceJobsByIdError);
          }

          const { error: docsByJobError } = await supabase
            .from("project_documents")
            .update({ project_id: nextProjectIdStr })
            .in("invoice_job_id", invoiceJobIdList);
          if (docsByJobError) {
            projectDocsMoveError = projectDocsMoveError ?? docsByJobError;
            console.warn("[TripsContext] No se pudo mover project_documents por invoice_job_id:", docsByJobError);
          }
        }

        const projectDocumentPaths = (prevTrip?.documents ?? existingTrip?.documents ?? [])
          .filter((d) => d?.bucketId === "project_documents")
          .map((d) => String(d?.storagePath ?? "").trim())
          .filter(Boolean);

        if (projectDocumentPaths.length > 0) {
          const { error: docsByPathError } = await supabase
            .from("project_documents")
            .update({ project_id: nextProjectIdStr })
            .in("storage_path", projectDocumentPaths);
          if (docsByPathError) {
            projectDocsMoveError = projectDocsMoveError ?? docsByPathError;
            console.warn("[TripsContext] No se pudo mover project_documents por storage_path:", docsByPathError);
          }
        }

        if (projectDocsMoveError) {
          toast.error(
            formatSupabaseError(
              projectDocsMoveError,
              "No se pudieron mover algunas facturas/documentos al nuevo proyecto",
            ),
          );
        }
      }

      // If the trip was moved away from a project and that project now has 0 trips, delete it.
      // This keeps the project list clean and avoids "empty" projects lingering after reassignments.
      if (previousProjectId && previousProjectId !== nextProjectIdStr) {
        try {
          const { count, error: countError } = await supabase
            .from("trips")
            .select("id", { count: "exact", head: true })
            .eq("project_id", previousProjectId);

          if (!countError && count === 0) {
            const projectsQueryKey = ["projects", user.id] as const;
            const prevProjects = (queryClient.getQueryData(projectsQueryKey) ?? []) as Array<any>;
            queryClient.setQueryData(
              projectsQueryKey,
              prevProjects.filter((p) => String((p as any)?.id ?? "").trim() !== previousProjectId),
            );

            try {
              await cascadeDeleteProjectById(supabase, previousProjectId);
            } catch (deleteErr) {
              console.warn("[TripsContext] No se pudo borrar el proyecto vacío tras mover el viaje:", deleteErr);
              queryClient.setQueryData(projectsQueryKey, prevProjects);
            }

            queryClient.invalidateQueries({ queryKey: projectsQueryKey }).catch(() => null);
            queryClient.invalidateQueries({ queryKey: ["reports", user.id] }).catch(() => null);
          }
        } catch (e) {
          console.warn("[TripsContext] No se pudo comprobar/borrar proyecto vacío tras mover el viaje:", e);
        }
      }

      // Ensure project totals/list update without requiring a full refresh.
      queryClient.invalidateQueries({ queryKey: ["projects", user.id] }).catch(() => null);
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
