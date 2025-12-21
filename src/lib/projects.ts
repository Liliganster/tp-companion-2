import type { Project } from "@/contexts/ProjectsContext";

export function getProjectsForDashboard(projects: Project[]) {
  const withTrips = projects.filter((p) => p.trips > 0);
  const starredWithTrips = withTrips.filter((p) => p.starred);
  const selected = starredWithTrips.length > 0 ? starredWithTrips : withTrips;

  return [...selected].sort((a, b) => b.totalKm - a.totalKm || a.name.localeCompare(b.name));
}
