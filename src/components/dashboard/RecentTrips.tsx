/**
 * Últimos viajes — zona "paisaje" del dashboard. Estilo del mockup de Claude
 * Design (2026-07-12): filas limpias con separador fino — ruta en negrita,
 * fecha debajo en gris, y a la derecha los km en gris y el € en negrita
 * (mismo cálculo de dinero que el informe: billableAmount por viaje).
 */
import { Link } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n";
import { useTrips } from "@/contexts/TripsContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { parseLocaleNumber } from "@/lib/number";
import { billableAmount } from "@/lib/tripMoney";

export function RecentTrips() {
  const { t, locale } = useI18n();
  const { trips, loading } = useTrips();
  const { profile } = useUserProfile();

  const defaultRate = parseLocaleNumber(profile.ratePerKm) || 0;
  const surcharge = parseLocaleNumber(profile.passengerSurcharge) || 0;

  const recentTrips = trips.slice(0, 5).map((trip) => {
    const route = Array.isArray(trip.route) ? trip.route : [];
    const routeParts = route.filter((part) => typeof part === "string" && part.trim().length > 0);
    return {
      id: trip.id,
      date: trip.date,
      routeText: routeParts.length > 0 ? routeParts.join(" → ") : "-",
      distance: Number.isFinite(Number(trip.distance)) ? Number(trip.distance) : 0,
      amount: billableAmount([trip], defaultRate, surcharge),
    };
  });

  return (
    <div className="glass-card p-5 animate-fade-in animation-delay-200 flex flex-col h-full">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold">{t("dashboard.recentTrips")}</h2>
        <Link to="/trips" className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">
          {t("dashboard.viewAll")}
        </Link>
      </div>

      <div className="flex-1">
        {!loading && recentTrips.length === 0 ? (
          <div className="text-sm text-muted-foreground py-3">No hay viajes recientes.</div>
        ) : null}

        {recentTrips.map((trip) => (
          <Link
            to="/trips"
            key={trip.id}
            className="flex items-center justify-between gap-3 py-3 border-b border-border/60 last:border-0 hover:bg-accent/30 transition-colors rounded-lg px-2 -mx-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug truncate" title={trip.routeText}>
                {trip.routeText}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{new Date(trip.date).toLocaleDateString(locale)}</p>
            </div>
            <div className="flex items-baseline gap-3 shrink-0 tabular-nums">
              <span className="text-sm text-muted-foreground">
                {trip.distance.toLocaleString(locale, { maximumFractionDigits: 1 })} km
              </span>
              <span className="text-sm font-bold">
                {trip.amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
