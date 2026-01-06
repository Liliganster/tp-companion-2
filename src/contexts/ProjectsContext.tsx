import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "./AuthContext";
import { toast } from "sonner";
import { cascadeDeleteProjectById } from "@/lib/cascadeDelete";
import { formatSupabaseError } from "@/lib/supabaseErrors";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isOffline, readOfflineCache, writeOfflineCache } from "@/lib/offlineCache";
import type { Trip } from "@/contexts/TripsContext";

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
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["projects", user?.id ?? "anon"] as const, [user?.id]);
  const offlineCacheKey = useMemo(() => (user?.id ? `cache:projects:v1:${user.id}` : null), [user?.id]);

  const refreshProjects = useCallback(() => {
    if (!user) return;
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey, user]);

  const projectsQuery = useQuery({
    queryKey,
    enabled: Boolean(user && supabase),
    queryFn: async (): Promise<Project[]> => {
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
        console.error("Error fetching projects:", projectsError);
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
            console.warn("Error fetching project totals:", totalsError);
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

  const addProject = useCallback(async (project: Project) => {
    if (!supabase || !user) return;

    // Check if project already exists (by name)
    const { data: existing, error: checkError } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", project.name)
      .maybeSingle();

    if (checkError) {
      console.error("Error checking for existing project:", checkError);
      toast.error("Error: " + checkError.message);
      return;
    }

    if (existing) {
      console.warn(`Project "${project.name}" already exists, skipping insert`);
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
      console.error("Error adding project:", error);
      
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
  }, [queryClient, queryKey, user]);

  const updateProject = useCallback(async (id: string, patch: Partial<Project>) => {
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
        console.error("Error updating project:", error);
        void queryClient.invalidateQueries({ queryKey });
      }
    }
  }, [queryClient, queryKey, user]);

  const deleteProject = useCallback(async (id: string) => {
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
      console.error("[ProjectsContext] Cascade delete failed:", err);
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
  }, [queryClient, queryKey, user]);

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
