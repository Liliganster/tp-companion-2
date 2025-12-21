export type TripWarningType = "duplicate" | "improbable_distance";

export type TripWarning = {
  type: TripWarningType;
  title: string;
  details: string;
};

export type TripWarningInput = {
  id: string;
  date: string;
  route: string[];
  distance: number;
};

const IMPROBABLE_DISTANCE_KM = 1500;

function normalizeRoute(route: string[]) {
  return route
    .map((stop) => stop.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(" -> ")
    .toLowerCase();
}

function formatRoute(route: string[]) {
  return route
    .map((stop) => stop.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(" -> ");
}

export function computeTripWarnings(trips: TripWarningInput[]) {
  const byId: Record<string, TripWarning[]> = {};
  const duplicateKeyToIds = new Map<string, string[]>();

  for (const trip of trips) {
    const key = `${trip.date}|${normalizeRoute(trip.route)}`;
    const list = duplicateKeyToIds.get(key);
    if (list) list.push(trip.id);
    else duplicateKeyToIds.set(key, [trip.id]);

    if (trip.distance > IMPROBABLE_DISTANCE_KM) {
      (byId[trip.id] ??= []).push({
        type: "improbable_distance",
        title: "Distancia improbable",
        details: `${trip.distance} km`,
      });
    }
  }

  for (const [key, ids] of duplicateKeyToIds) {
    if (ids.length < 2) continue;
    const [, routePart] = key.split("|");
    const routeLabel = routePart ? routePart.replace(/\s*->\s*/g, " -> ") : "";

    for (const id of ids) {
      (byId[id] ??= []).push({
        type: "duplicate",
        title: "Viaje duplicado",
        details: routeLabel ? `Misma fecha y ruta (${routeLabel})` : "Misma fecha y ruta",
      });
    }
  }

  return {
    byId,
    total: Object.values(byId).reduce((acc, list) => acc + list.length, 0),
    toNotifications: (opts?: { dateLocale?: string }) => {
      const dateLocale = opts?.dateLocale ?? "es-ES";
      return trips.flatMap((trip) => {
        const warnings = byId[trip.id] ?? [];
        if (warnings.length === 0) return [];
        const dateLabel = (() => {
          const time = Date.parse(trip.date);
          if (!Number.isFinite(time)) return trip.date;
          return new Date(time).toLocaleDateString(dateLocale, { day: "2-digit", month: "2-digit", year: "numeric" });
        })();
        const routeLabel = formatRoute(trip.route);

        return warnings.map((w) => ({
          id: `${trip.id}:${w.type}`,
          type: "warning" as const,
          title: w.title,
          message: `${dateLabel} • ${routeLabel}${w.type === "improbable_distance" ? ` • ${trip.distance} km` : ""}`,
          tripId: trip.id,
        }));
      });
    },
  };
}

