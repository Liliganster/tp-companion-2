/**
 * Dashboard — Fase 4 del PLAN.md. Regla: arriba todo es accionable, abajo
 * todo es paisaje. Fuera los chips crípticos de cuota, los anillos y la
 * nota A-D; el contador de IA sigue visible (decisión de la propietaria)
 * pero como tarjeta transparente con estados.
 */
import type { ReactNode } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { RecentTrips } from "@/components/dashboard/RecentTrips";
import { AttentionBell } from "@/components/dashboard/AttentionBell";
import { CarMarginCard, ProUsageCard, ReportReadyCard } from "@/components/dashboard/DashboardCards";
import { MonthlyBars } from "@/components/dashboard/MonthlyBars";
import { ArrowDown, ArrowUp, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useI18n } from "@/hooks/use-i18n";
import { useTrips } from "@/contexts/TripsContext";
import { useAiQuota } from "@/hooks/use-ai-quota";
import { calculateTreesNeeded, calculateTripEmissions, TripEmissionsInput } from "@/lib/emissions";
import { parseLocaleNumber } from "@/lib/number";
import { useEmissionsInput } from "@/hooks/use-emissions-input";
import { billableAmount } from "@/lib/tripMoney";
import { parseTripDate } from "@/lib/tripDates";

function percentageChange(current: number, previous: number): number {
  const cur = Number.isFinite(current) ? current : 0;
  const prev = Number.isFinite(previous) ? previous : 0;
  if (prev <= 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

function sumKm(trips: Array<{ distance: number }>): number {
  return trips.reduce((acc, t) => acc + (Number.isFinite(Number(t.distance)) ? Number(t.distance) : 0), 0);
}

function sumCo2(
  trips: Array<{ co2?: number; distance: number; fuelLiters?: number | null; evKwhUsed?: number | null }>,
  emissionsInput: Omit<TripEmissionsInput, "distanceKm">,
): number {
  return trips.reduce((acc, t) => {
    return acc + calculateTripEmissions({ distanceKm: t.distance, fuelLiters: t.fuelLiters, evKwhUsed: t.evKwhUsed, ...emissionsInput }).co2Kg;
  }, 0);
}

function Trend({ value, higherIsBetter, label }: { value: number; higherIsBetter: boolean; label: string }) {
  const up = value >= 0;
  const good = up === higherIsBetter;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${good ? "text-success" : "text-destructive"}`}>
      <Icon className="w-3 h-3" />
      {Math.abs(value)}% <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function FlatKpi({
  label,
  value,
  sub,
  to,
  big = false,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  to: string;
  big?: boolean;
}) {
  return (
    <Link to={to} className="block h-full">
      <div className="glass-card p-4 h-full flex flex-col gap-1 hover:border-primary/40 transition-colors">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`font-bold text-foreground tabular-nums ${big ? "text-3xl sm:text-4xl" : "text-2xl"}`}>{value}</span>
        {sub}
      </div>
    </Link>
  );
}

export default function Index() {
  const { profile } = useUserProfile();
  const { t, tf, locale } = useI18n();
  const { trips } = useTrips();
  const { emissionsInput } = useEmissionsInput();
  // Contador de IA pequeño en la cabecera (decisión de la propietaria):
  // solo la cifra, sin mensaje de renovación; clicable a Planes.
  const aiQuota = useAiQuota();

  const hour = new Date().getHours();
  const greeting = hour >= 6 && hour < 12
    ? t("dashboard.greetingMorning")
    : hour >= 12 && hour < 20
      ? t("dashboard.greetingAfternoon")
      : t("dashboard.greetingEvening");

  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const tripsThisMonth = trips.filter((trip) => {
    const dt = parseTripDate(trip.date);
    return dt != null && dt >= startOfThisMonth && dt < startOfNextMonth;
  });
  const tripsPrevMonth = trips.filter((trip) => {
    const dt = parseTripDate(trip.date);
    return dt != null && dt >= startOfPrevMonth && dt < startOfThisMonth;
  });

  // Onboarding: sin tarifa y dirección base la distancia y el dinero no se
  // calculan solos — el fallo más confuso para un usuario nuevo (o para el
  // que vuelve tras meses). El banner desaparece solo al completar el perfil.
  const rateMissing = !(parseLocaleNumber(profile.ratePerKm) > 0);
  const baseMissing = !profile.baseAddress.trim();
  const profileIncomplete = rateMissing || baseMissing;

  // € a facturar del mes: kilometraje + pasajeros + gastos (coherente con el informe)
  const defaultRate = parseLocaleNumber(profile.ratePerKm) || 0;
  const surcharge = parseLocaleNumber(profile.passengerSurcharge) || 0;
  const billableThisMonth = billableAmount(tripsThisMonth, defaultRate, surcharge);
  const billablePrevMonth = billableAmount(tripsPrevMonth, defaultRate, surcharge);

  const kmThisMonth = sumKm(tripsThisMonth);
  const kmPrevMonth = sumKm(tripsPrevMonth);
  const co2ThisMonth = sumCo2(tripsThisMonth, emissionsInput);
  const treesThisMonth = calculateTreesNeeded(co2ThisMonth);

  const eur0 = (v: number) => `${Math.round(v).toLocaleString(locale)} €`;

  return (
    <MainLayout>
      <div className="page-container flex flex-col gap-3">
        {/* Cabecera: saludo + contador de IA pequeño + campana de atención
            (estilo Unity; sin botones redundantes con Viajes — decisión de
            la propietaria). El ancho 85% centrado lo pone .page-container. */}
        <div className="glass-panel p-4 md:p-5 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-foreground text-xl sm:text-2xl font-semibold leading-tight tracking-tight">
                {greeting}
                {profile.fullName.trim() ? <span className="text-foreground"> {profile.fullName.trim()}</span> : null}
              </h1>
              <p className="text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/plans"
                className="flex items-center gap-2 px-3 py-1.5 border rounded-lg border-border bg-muted hover:bg-muted/70 transition-colors"
                title={t("dashboard.aiCounterTitle")}
              >
                <Sparkles className="w-4 h-4 text-muted-foreground" />
                <span
                  className={`text-xs font-medium tabular-nums ${
                    !aiQuota.bypass && aiQuota.used != null && Number.isFinite(aiQuota.limit) && aiQuota.used >= aiQuota.limit
                      ? "text-destructive"
                      : "text-foreground"
                  }`}
                >
                  {aiQuota.loading && aiQuota.used == null
                    ? "…"
                    : aiQuota.bypass
                      ? `${aiQuota.used ?? 0}`
                      : `${aiQuota.used ?? "—"}/${Number.isFinite(aiQuota.limit) ? aiQuota.limit : "∞"}`}
                </span>
              </Link>
              <AttentionBell />
            </div>
          </div>
        </div>

        {/* Banner "completa tu perfil": guía al usuario a la tarifa y la
            dirección base para que todo se calcule solo */}
        {profileIncomplete && (
          <div className="glass-card border-warning/40 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <span className="p-2 rounded-lg bg-warning/15 text-warning shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t("dashboard.setupTitle")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {rateMissing && baseMissing
                    ? t("dashboard.setupBothMissing")
                    : rateMissing
                      ? t("dashboard.setupRateMissing")
                      : t("dashboard.setupBaseMissing")}
                </p>
              </div>
            </div>
            <Button size="sm" className="shrink-0" onClick={() => window.dispatchEvent(new CustomEvent("fb:open-settings"))}>
              {t("dashboard.setupCta")}
            </Button>
          </div>
        )}

        {/* Fila de 4 cifras planas (sin anillos, sin nota A-D) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <FlatKpi
            label={t("dashboard.kpiBillableMonth")}
            value={eur0(billableThisMonth)}
            big
            to="/reports"
            sub={<Trend value={percentageChange(billableThisMonth, billablePrevMonth)} higherIsBetter label={t("dashboard.vsPrevMonth")} />}
          />
          <FlatKpi
            label={t("dashboard.kpiKmMonth")}
            value={`${Math.round(kmThisMonth).toLocaleString(locale)} km`}
            to="/trips"
            sub={<Trend value={percentageChange(kmThisMonth, kmPrevMonth)} higherIsBetter label={t("dashboard.vsPrevMonth")} />}
          />
          <FlatKpi
            label={t("dashboard.kpiTripsMonth")}
            value={`${tripsThisMonth.length}`}
            to="/trips"
            sub={<Trend value={percentageChange(tripsThisMonth.length, tripsPrevMonth.length)} higherIsBetter label={t("dashboard.vsPrevMonth")} />}
          />
          <FlatKpi
            label={t("dashboard.kpiCo2Month")}
            value={`${co2ThisMonth.toFixed(0)} kg`}
            to="/trips"
            sub={
              <span className="text-xs text-muted-foreground" title={t("dashboard.equivalentTreesTooltip")}>
                {tf("dashboard.treesPerYearShort", { trees: treesThisMonth })}
              </span>
            }
          />
        </div>

        {/* Informe contextual (días 1-7): banner a todo lo ancho; devuelve
            null el resto del mes sin dejar hueco */}
        <ReportReadyCard />

        {/* Margen del coche + % de uso profesional: siempre a ancho
            completo, mitad y mitad (la atención vive en la campana de la
            cabecera, estilo Unity) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <CarMarginCard />
          <ProUsageCard />
        </div>

        {/* Paisaje: barras km/€ de 6 meses + últimos viajes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <MonthlyBars />
          <RecentTrips />
        </div>
      </div>
    </MainLayout>
  );
}
