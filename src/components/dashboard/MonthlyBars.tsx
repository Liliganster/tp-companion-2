/**
 * Barras km/€ de los últimos 6 meses — Fase 4 del PLAN.md (zona "paisaje").
 */
import { useMemo } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTrips } from "@/contexts/TripsContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useI18n } from "@/hooks/use-i18n";
import { parseLocaleNumber } from "@/lib/number";
import { billableAmount } from "@/lib/tripMoney";
import { parseTripDate } from "@/lib/tripDates";

export function MonthlyBars() {
  const { t, locale } = useI18n();
  const { trips } = useTrips();
  const { profile } = useUserProfile();

  const data = useMemo(() => {
    const defaultRate = parseLocaleNumber(profile.ratePerKm) || 0;
    const surcharge = parseLocaleNumber(profile.passengerSurcharge) || 0;
    const now = new Date();

    return Array.from({ length: 6 }, (_, i) => {
      const start = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const monthTrips = trips.filter((trip) => {
        const dt = parseTripDate(trip.date);
        return dt != null && dt >= start && dt < end;
      });
      return {
        label: start.toLocaleDateString(locale, { month: "short" }),
        km: Math.round(monthTrips.reduce((acc, trip) => acc + (Number.isFinite(trip.distance) ? trip.distance : 0), 0)),
        eur: Math.round(billableAmount(monthTrips, defaultRate, surcharge)),
      };
    });
  }, [trips, profile.ratePerKm, profile.passengerSurcharge, locale]);

  // Mockup Claude Design 2026-07-12: km en azul (chart-1), € en cian claro
  // (chart-2), barras con la punta redondeada y leyenda de cuadraditos.
  return (
    <div className="glass-card p-5 h-full flex flex-col min-h-[260px]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold">{t("dashboard.monthlyBarsTitle")}</h2>
        <div className="flex gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-chart-1" /> km
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-chart-2" /> €
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 0, left: -18, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="km" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="eur" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => [name === "eur" ? `${value} €` : `${value} km`, ""]}
            />
            <Bar yAxisId="km" dataKey="km" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} maxBarSize={20} />
            <Bar yAxisId="eur" dataKey="eur" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
