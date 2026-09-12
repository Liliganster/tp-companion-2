type ProjectIdentity = { id: string; name: string };
type ProjectTrip = { projectId?: string | null; project?: string | null; date: string };

/** Legacy name links are safe only when the name identifies one project. */
export function resolveLegacyProjectId(projects: readonly ProjectIdentity[], name: string | null | undefined): string | undefined {
  const key = (name ?? '').trim().toLowerCase();
  if (!key) return undefined;
  const matches = projects.filter(project => project.name.trim().toLowerCase() === key);
  return matches.length === 1 ? matches[0].id : undefined;
}

/** Shared selection for project rows, their totals and the detail modal. */
export function groupProjectTrips<T extends ProjectTrip>(
  trips: readonly T[], projects: readonly ProjectIdentity[], selectedYear = 'all',
): Map<string, T[]> {
  const groups = new Map<string, T[]>(projects.map(project => [project.id, []]));
  for (const trip of trips) {
    if (selectedYear !== 'all' && !trip.date.startsWith(selectedYear + '-')) continue;
    // An explicit ID remains authoritative after a rename or move.
    const id = trip.projectId || resolveLegacyProjectId(projects, trip.project);
    if (id && groups.has(id)) groups.get(id)!.push(trip);
  }
  return groups;
}
