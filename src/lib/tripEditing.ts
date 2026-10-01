import { resolveLegacyProjectId } from './projectTrips';

/** Both editors preserve explicit links and only use confirmed IDs for new links. */
export async function resolveEditedTripProjectId(
  name: string,
  original: { project?: string; projectId?: string | null } | null | undefined,
  projects: readonly { id: string; name: string }[],
  create: () => Promise<string>,
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (trimmed === original?.project?.trim() && original.projectId) return original.projectId;
  return resolveLegacyProjectId(projects, trimmed) ?? await create();
}

/** Document reviews allow one location; manual journeys need at least two. */
export function isValidTripEdit(input: {
  date: string; route: string[]; distance: number | null; passengers: number | null;
  documentTrip: boolean; expenses: { raw: string; value: number | null }[];
}): boolean {
  const { date, route, distance, passengers, documentTrip, expenses } = input;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date &&
    route.length >= (documentTrip ? 1 : 2) && route.every(stop => Boolean(stop.trim())) &&
    distance != null && Number.isFinite(distance) && distance >= 0 && distance <= 10000 &&
    passengers != null && Number.isInteger(passengers) && passengers >= 0 && passengers <= 99 &&
    expenses.every(({ raw, value }) => !raw.trim() || (value != null && Number.isFinite(value) && value >= 0));
}
