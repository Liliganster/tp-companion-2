import type { Project } from "@/contexts/ProjectsContext";

export function getProjectsForDashboard(projects: Project[]) {
  const eligible = projects.filter((p) => !p.archived);
  const starred = eligible.filter((p) => p.starred);
  const selected = starred.length > 0 ? starred : eligible;

  return [...selected].sort((a, b) => b.totalKm - a.totalKm || a.name.localeCompare(b.name));
}
