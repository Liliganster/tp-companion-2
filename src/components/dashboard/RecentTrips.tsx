import { Link } from "react-router-dom";
import { MapPin, ArrowRight, Calendar, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";

interface Trip {
  id: string;
  date: string;
  from: string;
  to: string;
  distance: number;
  project: string;
  passengers?: number;
}

const mockTrips: Trip[] = [
  {
    id: "1",
    date: "2024-01-15",
    from: "Berlin HQ",
    to: "München Studio",
    distance: 584,
    project: "Film Production XY",
    passengers: 2,
  },
  {
    id: "2",
    date: "2024-01-14",
    from: "München Studio",
    to: "Köln Location",
    distance: 575,
    project: "Film Production XY",
  },
  {
    id: "3",
    date: "2024-01-13",
    from: "Home Office",
    to: "Berlin HQ",
    distance: 45,
    project: "Internal",
  },
  {
    id: "4",
    date: "2024-01-12",
    from: "Berlin HQ",
    to: "Hamburg Meeting",
    distance: 289,
    project: "Client ABC",
    passengers: 1,
  },
];

export function RecentTrips() {
  const { t, locale } = useI18n();
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

      <div className="space-y-3">
        {mockTrips.map((trip, index) => (
          <div
            key={trip.id}
            className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer group animate-slide-up"
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
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-primary shrink-0" />
                  <span className="truncate">{trip.from}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{trip.to}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-sm">{trip.distance} km</p>
                {trip.passengers && (
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
