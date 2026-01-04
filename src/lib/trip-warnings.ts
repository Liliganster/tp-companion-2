export type TripWarningType =
  | "duplicate"
  | "improbable_distance"
  | "zero_distance"
  | "missing_route"
  | "invalid_date"
  | "missing_project";

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
  projectId?: string | null;
};

const IMPROBABLE_DISTANCE_KM = 1500;

function pushWarning(byId: Record<string, TripWarning[]>, tripId: string, warning: TripWarning) {
  (byId[tripId] ??= []).push(warning);
}

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

export function computeTripWarnings(trips: TripWarningInput[], t: (key: string) => string) {
  const byId: Record<string, TripWarning[]> = {};
  const duplicateKeyToIds = new Map<string, string[]>();

  for (const trip of trips) {
    const distance = Number(trip.distance);
    const routeClean = Array.isArray(trip.route) ? trip.route.map((s) => String(s ?? "").trim()).filter(Boolean) : [];
    const routeNormalized = normalizeRoute(routeClean);
    const hasValidDate = Number.isFinite(Date.parse(trip.date));

    if (hasValidDate && routeNormalized) {
      const key = `${trip.date}|${routeNormalized}`;
      const list = duplicateKeyToIds.get(key);
      if (list) list.push(trip.id);
      else duplicateKeyToIds.set(key, [trip.id]);
    }

    if (!hasValidDate) {
      pushWarning(byId, trip.id, {
        type: "invalid_date",
        title: t("tripWarning.invalidDate"),
        details: trip.date ? String(trip.date) : t("tripWarning.noDate"),
      });
    }

    if (routeClean.length < 2) {
      pushWarning(byId, trip.id, {
        type: "missing_route",
        title: t("tripWarning.incompleteRoute"),
        details: t("tripWarning.missingOriginDestination"),
      });
    }

    if (!Number.isFinite(distance) || distance <= 0) {
      pushWarning(byId, trip.id, {
        type: "zero_distance",
        title: t("tripWarning.zeroDistance"),
        details: Number.isFinite(distance) ? `${distance} km` : t("tripWarning.noDistance"),
      });
    } else if (distance > IMPROBABLE_DISTANCE_KM) {
      pushWarning(byId, trip.id, {
        type: "improbable_distance",
        title: t("tripWarning.improbableDistance"),
        details: `${distance} km`,
      });
    }

    if (trip.projectId == null) {
      pushWarning(byId, trip.id, {
        type: "missing_project",
        title: t("tripWarning.noProject"),
        details: t("tripWarning.assignProject"),
      });
    }
  }

  for (const [key, ids] of duplicateKeyToIds) {
    if (ids.length < 2) continue;
    const [, routePart] = key.split("|");
    const routeLabel = routePart ? routePart.replace(/\s*->\s*/g, " -> ") : "";

    for (const id of ids) {
      pushWarning(byId, id, {
        type: "duplicate",
        title: t("tripWarning.duplicateTrip"),
        details: routeLabel ? `${t("tripWarning.sameDateAndRoute")} (${routeLabel})` : t("tripWarning.sameDateAndRoute"),
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
          message: [dateLabel, routeLabel, w.details].filter(Boolean).join(" · "),
          tripId: trip.id,
        }));
      });
    },
  };
}
