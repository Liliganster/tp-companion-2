import { Link } from "react-router-dom";
import { MapPin, ArrowRight, Calendar, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { useTrips } from "@/contexts/TripsContext";

interface Trip {
  id: string;
  date: string;
  routeText: string;
  distance: number;
  project: string;
  passengers?: number;
}

function toRecentTrip(trip: { id: string; date: string; route: string[]; distance: number; project: string; passengers: number; }): Trip {
  const route = Array.isArray(trip.route) ? trip.route : [];
  const routeParts = route.filter((part) => typeof part === "string" && part.trim().length > 0);
  const routeText = routeParts.length > 0 ? routeParts.join(" → ") : "-";

  return {
    id: trip.id,
    date: trip.date,
    routeText,
    distance: Number.isFinite(Number(trip.distance)) ? Number(trip.distance) : 0,
    project: trip.project || "-",
    passengers: Number.isFinite(Number(trip.passengers)) ? Number(trip.passengers) : undefined,
  };
}

export function RecentTrips() {
  const { t, locale } = useI18n();
  const { trips, loading } = useTrips();
  const recentTrips = trips.slice(0, 3).map((trip) => toRecentTrip(trip));
  return (
    <div className="glass-card p-5 animate-fade-in animation-delay-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">{t("dashboard.recentTrips")}</h2>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/trips" className="flex items-center gap-1">
            {t("dashboard.viewAll")}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
      </div>

      <div className="space-y-2">
        {!loading && recentTrips.length === 0 ? (
          <div className="text-sm text-muted-foreground">No hay viajes recientes.</div>
        ) : null}

        {recentTrips.map((trip, index) => (
          <div
            key={trip.id}
            className="p-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group animate-slide-up"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{new Date(trip.date).toLocaleDateString(locale)}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                    {trip.project}
                  </span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-primary shrink-0" />
                  <span className="leading-snug break-words" title={trip.routeText}>
                    {trip.routeText}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-sm">{trip.distance} km</p>
                {typeof trip.passengers === "number" && trip.passengers > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <Users className="w-3 h-3" />
                    {trip.passengers}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
