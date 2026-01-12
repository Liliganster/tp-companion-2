import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "./AuthContext";
import { usePlan } from "./PlanContext";
import { toast } from "sonner";
import { cascadeDeleteProjectById } from "@/lib/cascadeDelete";
import { formatSupabaseError } from "@/lib/supabaseErrors";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isOffline, readOfflineCache, writeOfflineCache } from "@/lib/offlineCache";
import type { Trip } from "@/contexts/TripsContext";
import { getLocalFirstKey, readLocalFirst, writeLocalFirst } from "@/lib/localFirstStore";
import { calculateTripEmissions } from "@/lib/emissions";
import { useEmissionsInput } from "@/hooks/use-emissions-input";
import { logger } from "@/lib/logger";

const PROJECT_TOTALS_AVAILABLE_KEY = "fbp.project_totals.available";
const PROJECT_TOTALS_MISSING_NOTIFIED_KEY = "fbp.project_totals.missing_notified";

function readLocalStorageFlag(key: string): boolean | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    // ignore
  }
  return null;
}

function writeLocalStorageFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore
  }
}

export type Project = {
  id: string;
  name: string;
  producer?: string;
  description?: string;
  ratePerKm: number;
  starred: boolean;
  archived?: boolean;
  createdAt: string;
  trips: number;
  totalKm: number;
  documents: number;
  invoices: number;
  estimatedCost: number;
  shootingDays: number;
  kmPerDay: number;
  co2Emissions: number;
};

type LocalProjectRecord = {
  id: string;
  name: string;
  producer?: string;
  description?: string;
  ratePerKm: number;
  starred: boolean;
  archived?: boolean;
  createdAt: string;
};

type ProjectsContextValue = {
  projects: Project[];
  loading: boolean;
  refreshProjects: () => void;
  addProject: (project: Project) => Promise<void>;
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  toggleStar: (id: string) => Promise<void>;
  // Deprecated compatibility (optional, but better to remove to force refactor)
  // setProjects: ... // Removed
};

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { planTier } = usePlan();
  const queryClient = useQueryClient();
  const { emissionsInput } = useEmissionsInput();
  const queryKey = useMemo(() => ["projects", user?.id ?? "anon"] as const, [user?.id]);
  const offlineCacheKey = useMemo(() => (user?.id ? `cache:projects:v1:${user.id}` : null), [user?.id]);
  const localProjectsKey = useMemo(() => getLocalFirstKey("projects", user?.id), [user?.id]);
  const localTripsKey = useMemo(() => getLocalFirstKey("trips", user?.id), [user?.id]);
  const isLocalFirst = planTier === "basic";

  const refreshProjects = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const projectsQuery = useQuery({
    queryKey,
    enabled: isLocalFirst || Boolean(user && supabase),
    queryFn: async (): Promise<Project[]> => {
      if (isLocalFirst) {
        // Seed local-first storage from Supabase once (helps existing users migrate to local-first).
        if (user && supabase && !isOffline()) {
          const seedFlagKey = `fbp.localfirst:seeded:v1:${user.id}`;
          const alreadySeeded = (() => {
            try {
              return localStorage.getItem(seedFlagKey) === "1";
            } catch {
              return false;
            }
          })();

          const existingProjects = readLocalFirst<LocalProjectRecord[]>(localProjectsKey) ?? [];
          const existingTrips = readLocalFirst<Trip[]>(localTripsKey) ?? [];

          if (!alreadySeeded && existingProjects.length === 0 && existingTrips.length === 0) {
            try {
              const [projectsRes, tripsRes] = await Promise.all([
                supabase
                  .from("projects")
                  .select("id,name,producer,description,rate_per_km,starred,archived,created_at")
                  .order("created_at", { ascending: false }),
                supabase
                  .from("trips")
                  .select("*, projects(name)")
                  .order("trip_date", { ascending: false }),
              ]);

              if (projectsRes.error) throw projectsRes.error;
              if (tripsRes.error) throw tripsRes.error;

              const remoteProjects = projectsRes.data;
              const remoteTrips = tripsRes.data;

              const seededProjects: LocalProjectRecord[] = (remoteProjects ?? []).map((p: any) => ({
                id: String(p.id),
                name: String(p.name ?? "").trim(),
                producer: p.producer ?? undefined,
                description: p.description ?? undefined,
                ratePerKm: Number(p.rate_per_km) || 0,
                starred: Boolean(p.starred),
                archived: Boolean(p.archived),
                createdAt: p.created_at ?? new Date().toISOString(),
              }));

              const seededTrips: Trip[] = (remoteTrips ?? []).map((t: any) => ({
                id: String(t.id),
                date: t.trip_date || t.date_value || "",
                route: t.route || [],
                project: t.projects?.name || "Unknown",
                projectId: t.project_id,
                purpose: t.purpose || "",
                passengers: t.passengers || 0,
                invoice: t.invoice_number,
                distance: t.distance_km || 0,
                co2: 0,
                ratePerKmOverride: t.rate_per_km_override,
                specialOrigin: t.special_origin,
                tollAmount: t.toll_amount ?? null,
                parkingAmount: t.parking_amount ?? null,
                otherExpenses: t.other_expenses ?? null,
                fuelAmount: t.fuel_amount ?? null,
                fuelLiters: Number.isFinite(Number(t.fuel_liters)) ? Number(t.fuel_liters) : null,
                evKwhUsed: Number.isFinite(Number(t.ev_kwh_used)) ? Number(t.ev_kwh_used) : null,
                documents: (t.documents || []).filter((d: any) => d.kind !== "client_meta"),
              })) as unknown as Trip[];

              if (seededProjects.length > 0) writeLocalFirst(localProjectsKey, seededProjects);
              if (seededTrips.length > 0) writeLocalFirst(localTripsKey, seededTrips);

              try {
                localStorage.setItem(seedFlagKey, "1");
              } catch {
                // ignore
              }
            } catch (e) {
              logger.warn("[ProjectsContext] Local-first seed failed", e);
            }
          }
        }

        const base = readLocalFirst<LocalProjectRecord[]>(localProjectsKey) ?? [];
        const trips = readLocalFirst<Trip[]>(localTripsKey) ?? [];

        const totals = new Map<
          string,
          { trips: number; totalKm: number; co2Kg: number; documents: number }
        >();

        for (const trip of trips) {
          const pid = String((trip as any)?.projectId ?? "").trim();
          if (!pid) continue;

          const acc = totals.get(pid) ?? { trips: 0, totalKm: 0, co2Kg: 0, documents: 0 };
          acc.trips += 1;
          acc.totalKm += Number((trip as any)?.distance ?? 0) || 0;
          acc.documents += Array.isArray((trip as any)?.documents) ? (trip as any).documents.length : 0;
          acc.co2Kg += calculateTripEmissions({
            distanceKm: Number((trip as any)?.distance ?? 0) || 0,
            ...emissionsInput,
          }).co2Kg;
          totals.set(pid, acc);
        }

        return [...base]
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
          .map((p) => {
            const t = totals.get(p.id) ?? { trips: 0, totalKm: 0, co2Kg: 0, documents: 0 };
            const totalKm = t.totalKm;
            const tripsCount = t.trips;
            const ratePerKm = Number(p.ratePerKm) || 0;
            return {
              id: p.id,
              name: p.name,
              producer: p.producer,
              description: p.description,
              ratePerKm,
              starred: Boolean(p.starred),
              createdAt: p.createdAt,
              archived: Boolean(p.archived),
              trips: tripsCount,
              totalKm,
              documents: t.documents,
              invoices: 0,
              estimatedCost: totalKm * ratePerKm,
              shootingDays: tripsCount,
              kmPerDay: tripsCount > 0 ? totalKm / tripsCount : 0,
              co2Emissions: t.co2Kg,
            };
          });
      }

      if (!user || !supabase) {
        if (offlineCacheKey) return readOfflineCache<Project[]>(offlineCacheKey, 30 * 24 * 60 * 60 * 1000) ?? [];
        return [];
      }

      if (offlineCacheKey && isOffline()) {
        return readOfflineCache<Project[]>(offlineCacheKey, 30 * 24 * 60 * 60 * 1000) ?? [];
      }

      const { data: projectsData, error: projectsError } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (projectsError) {
        logger.warn("Error fetching projects", projectsError);
        const cached = offlineCacheKey ? readOfflineCache<Project[]>(offlineCacheKey, 30 * 24 * 60 * 60 * 1000) : null;
        if (cached && cached.length > 0) return cached;
        if (!isOffline()) toast.error("Error loading projects: " + projectsError.message);
        return [];
      }

      let totalsData: any[] | null = null;
      const cachedAvailability = readLocalStorageFlag(PROJECT_TOTALS_AVAILABLE_KEY);
      if (cachedAvailability !== false) {
        const { data, error: totalsError, status } = await supabase.from("project_totals").select("*");

        if (totalsError) {
          const missing = status === 404 || /Could not find the relation/i.test(totalsError.message ?? "");
          if (missing) {
            writeLocalStorageFlag(PROJECT_TOTALS_AVAILABLE_KEY, false);

            const alreadyNotified = readLocalStorageFlag(PROJECT_TOTALS_MISSING_NOTIFIED_KEY) === true;
            if (!alreadyNotified) {
              writeLocalStorageFlag(PROJECT_TOTALS_MISSING_NOTIFIED_KEY, true);
              toast.warning("Falta la vista 'project_totals' en Supabase. Ejecuta las migraciones para activar totales/importe.");
            }
          } else if (import.meta.env.DEV) {
            logger.warn("Error fetching project totals", totalsError);
          }
        } else {
          totalsData = (data ?? []) as any[];
          writeLocalStorageFlag(PROJECT_TOTALS_AVAILABLE_KEY, true);
        }
      }

      const totalsMap = new Map((totalsData || []).map((t: any) => [t.project_id, t]));

      const mapped = (projectsData ?? []).map((p: any) => {
        const totals = totalsMap.get(p.id);
        const totalKm = totals?.total_distance_km || 0;
        const trips = totals?.total_trips || 0;
        const totalInvoiced = (totals?.total_invoiced_eur || 0) + (totals?.total_trip_invoices_eur || 0);

        return {
          id: p.id,
          name: p.name,
          producer: p.producer,
          description: p.description,
          ratePerKm: p.rate_per_km ? Number(p.rate_per_km) : 0,
          starred: p.starred,
          createdAt: p.created_at,
          archived: p.archived,
          trips: trips,
          totalKm: totalKm,
          documents: 0,
          invoices: totalInvoiced,
          estimatedCost: totalKm * (p.rate_per_km || 0),
          shootingDays: trips,
          kmPerDay: trips > 0 ? totalKm / trips : 0,
          co2Emissions: totals?.total_co2_kg || 0,
        };
      });

      if (offlineCacheKey) writeOfflineCache(offlineCacheKey, mapped);
      return mapped;
    },
  });

  const projects = projectsQuery.data ?? [];
  const loading = projectsQuery.isLoading;

  useEffect(() => {
    if (isLocalFirst) return;
    if (!user || !supabase) return;

    let timer: any = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        refreshProjects();
      }, 400);
    };

    const channel = supabase
      .channel("projects-totals-refresh")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoice_jobs", filter: `user_id=eq.${user.id}` },
        () => schedule(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trips", filter: `user_id=eq.${user.id}` },
        () => schedule(),
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [refreshProjects, user]);

  // In local-first, CO₂ totals depend on emissions settings; refresh derived values on change.
  const emissionsKey = useMemo(() => JSON.stringify(emissionsInput), [emissionsInput]);
  useEffect(() => {
    if (!isLocalFirst) return;
    void queryClient.invalidateQueries({ queryKey });
  }, [emissionsKey, isLocalFirst, queryClient, queryKey]);

  const addProject = useCallback(async (project: Project) => {
    if (isLocalFirst) {
      const base = readLocalFirst<LocalProjectRecord[]>(localProjectsKey) ?? [];
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
      const key = normalize(project.name);
      if (key && base.some((p) => normalize(String(p?.name ?? "")) === key)) {
        toast.info(`El proyecto "${project.name}" ya existe`);
        return;
      }

      const record: LocalProjectRecord = {
        id: project.id,
        name: project.name,
        producer: project.producer,
        description: project.description,
        ratePerKm: project.ratePerKm,
        starred: project.starred,
        archived: project.archived,
        createdAt: project.createdAt || new Date().toISOString(),
      };

      writeLocalFirst(localProjectsKey, [record, ...base]);
      void queryClient.invalidateQueries({ queryKey });
      return;
    }

    if (!supabase || !user) return;

    // Check if project already exists (by name)
    const { data: existing, error: checkError } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", project.name)
      .maybeSingle();

    if (checkError) {
      logger.warn("Error checking for existing project", checkError);
      toast.error("Error: " + checkError.message);
      return;
    }

    if (existing) {
      logger.debug(`Project "${project.name}" already exists, skipping insert`);
      toast.info(`El proyecto "${project.name}" ya existe`);
      return;
    }

    // Optimistic update
    const prev = (queryClient.getQueryData<Project[]>(queryKey) ?? []) as Project[];
    queryClient.setQueryData<Project[]>(queryKey, [project, ...prev]);

    const { error } = await supabase.from("projects").insert({
      id: project.id, // Use client-generated ID if provided, else DB generates? Schema has gen_random_uuid() default but allows insert
      user_id: user.id,
      name: project.name,
      producer: project.producer,
      description: project.description,
      rate_per_km: project.ratePerKm,
      starred: project.starred,
      archived: project.archived
    });

    if (error) {
      logger.warn("Error adding project", error);
      
      // Handle UNIQUE constraint violation
      if (error.code === '23505') {
        toast.error(`El proyecto "${project.name}" ya existe`);
      } else {
        toast.error("Error creating project: " + error.message);
      }
      
      // Revert optimistic update
      queryClient.setQueryData<Project[]>(
        queryKey,
        (cur) => (cur ?? []).filter((p) => p.id !== project.id),
      );
    }
  }, [isLocalFirst, localProjectsKey, queryClient, queryKey, user]);

  const updateProject = useCallback(async (id: string, patch: Partial<Project>) => {
    if (isLocalFirst) {
      const base = readLocalFirst<LocalProjectRecord[]>(localProjectsKey) ?? [];
      const next = base.map((p) =>
        p.id === id
          ? {
              ...p,
              ...(patch.name !== undefined ? { name: patch.name } : null),
              ...(patch.producer !== undefined ? { producer: patch.producer } : null),
              ...(patch.description !== undefined ? { description: patch.description } : null),
              ...(patch.ratePerKm !== undefined ? { ratePerKm: patch.ratePerKm } : null),
              ...(patch.starred !== undefined ? { starred: patch.starred } : null),
              ...(patch.archived !== undefined ? { archived: patch.archived } : null),
            }
          : p,
      );

      writeLocalFirst(localProjectsKey, next);
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["trips", user?.id ?? "anon"] });
      void queryClient.invalidateQueries({ queryKey: ["reports", user?.id ?? "anon"] });
      return;
    }

    if (!supabase || !user) return;

    queryClient.setQueryData<Project[]>(queryKey, (prev) => (prev ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)));

    // Map patch to DB columns
    const dbPatch: any = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.producer !== undefined) dbPatch.producer = patch.producer;
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.ratePerKm !== undefined) dbPatch.rate_per_km = patch.ratePerKm;
    if (patch.starred !== undefined) dbPatch.starred = patch.starred;
    if (patch.archived !== undefined) dbPatch.archived = patch.archived;
    
    // Stats are read-only in this context mostly, so we don't update them in DB 'projects' table directly usually
    // unless we chose to persist stats. My schema didn't have stats columns.
    
    if (Object.keys(dbPatch).length > 0) {
      const { error } = await supabase.from("projects").update(dbPatch).eq("id", id);
      if (error) {
        logger.warn("Error updating project", error);
        void queryClient.invalidateQueries({ queryKey });
      }
    }
  }, [isLocalFirst, localProjectsKey, queryClient, queryKey, user]);

  const deleteProject = useCallback(async (id: string) => {
    if (isLocalFirst) {
      const base = readLocalFirst<LocalProjectRecord[]>(localProjectsKey) ?? [];
      writeLocalFirst(
        localProjectsKey,
        base.filter((p) => String(p?.id ?? "").trim() !== String(id).trim()),
      );

      const tripsKey = ["trips", user?.id ?? "anon"] as const;
      const storedTrips = readLocalFirst<Trip[]>(localTripsKey) ?? [];
      const nextTrips = storedTrips.filter((t) => String((t as any)?.projectId ?? "").trim() !== String(id).trim());
      writeLocalFirst(localTripsKey, nextTrips);
      queryClient.setQueryData<Trip[]>(tripsKey, nextTrips);

      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: tripsKey });
      void queryClient.invalidateQueries({ queryKey: ["reports", user?.id ?? "anon"] });
      return;
    }

    if (!supabase || !user) return;

    const prev = (queryClient.getQueryData<Project[]>(queryKey) ?? []) as Project[];
    const removedProject = prev.find((p) => p.id === id);
    queryClient.setQueryData<Project[]>(
      queryKey,
      prev.filter((p) => p.id !== id),
    );

    const tripsQueryKey = ["trips", user.id] as const;
    const reportsQueryKey = ["reports", user.id] as const;
    const prevTrips = (queryClient.getQueryData<Trip[]>(tripsQueryKey) ?? []) as Trip[];

    // Optimistic: remove trips that belong to this project so the UI updates immediately.
    if (prevTrips.length > 0) {
      queryClient.setQueryData<Trip[]>(
        tripsQueryKey,
        prevTrips.filter((t) => String((t as any)?.projectId ?? "") !== id),
      );
    }

    try {
      await cascadeDeleteProjectById(supabase, id);
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: tripsQueryKey });
      void queryClient.invalidateQueries({ queryKey: reportsQueryKey });
    } catch (err) {
      logger.warn("[ProjectsContext] Cascade delete failed", err);
      toast.error(formatSupabaseError(err, "No se pudo borrar el proyecto y sus datos asociados"));
      if (removedProject) {
        queryClient.setQueryData<Project[]>(
          queryKey,
          (cur) => ((cur ?? []).some((p) => p.id === removedProject.id) ? (cur ?? []) : [removedProject, ...(cur ?? [])]),
        );
      }
      queryClient.setQueryData<Trip[]>(tripsQueryKey, prevTrips);
      throw err;
    }
  }, [isLocalFirst, localProjectsKey, localTripsKey, queryClient, queryKey, user]);

  const toggleStar = useCallback(async (id: string) => {
    const project = projects.find(p => p.id === id);
    if (project) {
      await updateProject(id, { starred: !project.starred });
    }
  }, [projects, updateProject]);

  const value = useMemo<ProjectsContextValue>(() => ({ 
    projects, 
    loading, 
    refreshProjects,
    addProject, 
    updateProject, 
    deleteProject, 
    toggleStar 
  }), [projects, loading, refreshProjects, addProject, updateProject, deleteProject, toggleStar]);

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used within a ProjectsProvider");
  return ctx;
}
