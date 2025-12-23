import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "./AuthContext";

export type Project = {
  id: string;
  name: string;
  producer?: string;
  description?: string;
  ratePerKm: number;
  starred: boolean;
  archived?: boolean;
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !supabase) {
      setProjects([]);
      setLoading(false);
      return;
    }

    let mounted = true;

    async function fetchProjects() {
      const { data, error } = await supabase!
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching projects:", error);
      }

      if (mounted) {
        if (data) {
          // Map DB snake_case to CamelCase if needed
          // Assuming DB columns map exactly to frontend types OR we map them
          // DB: name, producer, description, rate_per_km, starred, archived
          // Stats fields might be missing in DB or separate.
          // For now, we'll assume the DB has these columns OR we default them.
          // Note: The schema I created earlier didn't have specific stats columns (trips, totalKm etc).
          // They were discussed as "computed".
          // If the DB doesn't have them, we must set them to 0 or calculate them.
          // For "Database Persistence Audit", we want to load what is there.
          // Realistically, to match the UI, we should calculate stats from TRIPS.
          // But that requires fetching all trips.
          // For now, let's map what we have and default stats to 0.
          const mapped = data.map((p: any) => ({
            id: p.id,
            name: p.name,
            producer: p.producer,
            description: p.description,
            ratePerKm: p.rate_per_km ? Number(p.rate_per_km) : 0,
            starred: p.starred,
            archived: p.archived,
            // Stats - temporary zeros until we implement aggregation
            trips: p.trips_count || 0,
            totalKm: p.total_km || 0,
            documents: 0,
            invoices: 0,
            estimatedCost: 0,
            shootingDays: 0,
            kmPerDay: 0,
            co2Emissions: 0,
          }));
          setProjects(mapped);
        }
        setLoading(false);
      }
    }

    fetchProjects();

    return () => { mounted = false; };
  }, [user]);

  const addProject = useCallback(async (project: Project) => {
    if (!supabase || !user) return;

    // Optimistic update
    setProjects(prev => [project, ...prev]);

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
      // Revert optimistic update?
      setProjects(prev => prev.filter(p => p.id !== project.id));
    }
  }, [user]);

  const updateProject = useCallback(async (id: string, patch: Partial<Project>) => {
    if (!supabase || !user) return;

    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));

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
      if (error) console.error("Error updating project:", error);
    }
  }, [user]);

  const deleteProject = useCallback(async (id: string) => {
    if (!supabase || !user) return;

    setProjects(prev => prev.filter(p => p.id !== id));

    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) {
      console.error("Error deleting project:", error);
       // Revert...
    }
  }, [user]);

  const toggleStar = useCallback(async (id: string) => {
    const project = projects.find(p => p.id === id);
    if (project) {
      await updateProject(id, { starred: !project.starred });
    }
  }, [projects, updateProject]);

  const value = useMemo<ProjectsContextValue>(() => ({ 
    projects, 
    loading, 
    addProject, 
    updateProject, 
    deleteProject, 
    toggleStar 
  }), [projects, loading, addProject, updateProject, deleteProject, toggleStar]);

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used within a ProjectsProvider");
  return ctx;
}
