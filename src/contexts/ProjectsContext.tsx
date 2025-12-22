import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Project = {
  id: string;
  name: string;
  producer?: string;
  description?: string;
  ratePerKm: number;
  starred: boolean;
  trips: number;
  totalKm: number;
  documents: number;
  invoices: number;
  estimatedCost: number;
  shootingDays: number;
  kmPerDay: number;
  co2Emissions: number;
};

const STORAGE_KEY = "projects";

const DEFAULT_PROJECTS: Project[] = [
  {
    id: "1",
    name: "Film Production XY",
    producer: "XY Productions GmbH",
    description: "Feature film production across multiple locations in Germany",
    ratePerKm: 0.35,
    starred: true,
    trips: 24,
    totalKm: 4850,
    documents: 12,
    invoices: 3,
    estimatedCost: 1697.5,
    shootingDays: 15,
    kmPerDay: 323.3,
    co2Emissions: 582,
  },
  {
    id: "2",
    name: "Client ABC",
    producer: "ABC Corporation",
    description: "Regular client meetings and presentations",
    ratePerKm: 0.3,
    starred: true,
    trips: 8,
    totalKm: 1520,
    documents: 4,
    invoices: 1,
    estimatedCost: 456,
    shootingDays: 5,
    kmPerDay: 304,
    co2Emissions: 182.4,
  },
  {
    id: "3",
    name: "Internal",
    producer: undefined,
    description: "Internal company travel and office commutes",
    ratePerKm: 0.3,
    starred: false,
    trips: 15,
    totalKm: 890,
    documents: 0,
    invoices: 0,
    estimatedCost: 267,
    shootingDays: 10,
    kmPerDay: 89,
    co2Emissions: 106.8,
  },
  {
    id: "4",
    name: "Event Z",
    producer: "Event Agency Z",
    description: "Corporate event setup and management",
    ratePerKm: 0.32,
    starred: false,
    trips: 6,
    totalKm: 650,
    documents: 3,
    invoices: 2,
    estimatedCost: 208,
    shootingDays: 3,
    kmPerDay: 216.7,
    co2Emissions: 78,
  },
];

function readStoredProjects(): Project[] {
  if (typeof window === "undefined") return DEFAULT_PROJECTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROJECTS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_PROJECTS;
    return (parsed as Partial<Project>[]).map((item) => ({
      ...item,
      invoices: typeof item?.invoices === "number" ? item.invoices : 0,
    })) as Project[];
  } catch {
    return DEFAULT_PROJECTS;
  }
}

function writeStoredProjects(projects: Project[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

type ProjectsContextValue = {
  projects: Project[];
  setProjects: (projects: Project[] | ((prev: Project[]) => Project[])) => void;
  toggleStar: (id: string) => void;
};

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjectsState] = useState<Project[]>(() => readStoredProjects());

  const setProjects = useCallback<ProjectsContextValue["setProjects"]>((next) => {
    setProjectsState((prev) => {
      const resolved = typeof next === "function" ? (next as (p: Project[]) => Project[])(prev) : next;
      writeStoredProjects(resolved);
      return resolved;
    });
  }, []);

  const toggleStar = useCallback((id: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, starred: !p.starred } : p)));
  }, [setProjects]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setProjectsState(readStoredProjects());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<ProjectsContextValue>(() => ({ projects, setProjects, toggleStar }), [projects, setProjects, toggleStar]);

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used within a ProjectsProvider");
  return ctx;
}
