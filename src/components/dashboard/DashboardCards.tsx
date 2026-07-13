/**
 * Tarjetas del dashboard — Fase 4 del PLAN.md.
 *
 * - ReportReadyCard: contextual los primeros días del mes → informe del mes
 *   anterior listo para generar.
 * - CarMarginCard: sustituto del odómetro — margen por km (tarifa Kilometergeld
 *   menos coste real por km del PERFIL, sin fotos ni IA; cifra por km desde el
 *   mockup de Claude Design 2026-07-12).
 * - ProUsageCard: % de uso profesional manual (km totales anuales del perfil
 *   ÷ km profesionales registrados).
 *
 * (El contador de IA vive como chip pequeño en la cabecera del dashboard —
 * decisión de la propietaria — y como línea en el modal de subida.)
 */
import { Link } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n";
import { useTrips } from "@/contexts/TripsContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { parseLocaleNumber } from "@/lib/number";
import { vehicleCostPerKm } from "@/lib/tripMoney";
import { parseTripDate } from "@/lib/tripDates";
import { Button } from "@/components/ui/button";

function eur(value: number, locale: string, decimals = 0) {
  return `${value.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} €`;
}

export function ReportReadyCard() {
  const { t, tf, locale } = useI18n();
  const { trips } = useTrips();

  const now = new Date();
  if (now.getDate() > 7) return null;

  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const prevMonthTrips = trips.filter((trip) => {
    const dt = parseTripDate(trip.date);
    return dt != null && dt >= prevStart && dt <= prevEnd;
  });
  if (prevMonthTrips.length === 0) return null;

  const toDateOnly = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const monthName = prevStart.toLocaleDateString(locale, { month: "long" });
  const link = `/reports/view?project=all&startDate=${toDateOnly(prevStart)}&endDate=${toDateOnly(prevEnd)}`;

  // Banner con tinte azul + CTA degradado (mockup Claude Design 2026-07-12)
  return (
    <div className="glass-card p-5 border-primary/40 bg-primary/5 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{tf("dashboard.reportReadyTitle", { month: monthName })}</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          {tf("dashboard.reportReadyDesc", { count: prevMonthTrips.length })}
        </p>
      </div>
      <Button asChild className="w-full sm:w-auto shrink-0">
        <Link to={link}>{t("dashboard.reportReadyCta")}</Link>
      </Button>
    </div>
  );
}

export function CarMarginCard() {
  const { t, tf, locale } = useI18n();
  const { profile } = useUserProfile();

  // Mockup Claude Design 2026-07-12: la cifra protagonista es el margen POR
  // KM (tarifa − coste real), no el total del mes — es estable y se entiende
  // de un vistazo; el desglose va en la sublínea.
  const defaultRate = parseLocaleNumber(profile.ratePerKm) || 0;
  const costPerKm = vehicleCostPerKm(profile);

  return (
    <div className="glass-card p-5 h-full flex flex-col">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        {t("dashboard.carMarginTitle")}
      </h2>
      {costPerKm == null ? (
        <p className="text-sm text-muted-foreground my-auto">{t("dashboard.carMarginMissing")}</p>
      ) : (
        (() => {
          const margin = defaultRate - costPerKm;
          return (
            <>
              <p className={`text-4xl font-bold tracking-tight tabular-nums ${margin >= 0 ? "text-primary" : "text-destructive"}`}>
                {eur(margin, locale, 2)}
                <span className="text-base font-medium text-muted-foreground"> /km</span>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {tf("dashboard.carMarginPerKmDetail", { rate: eur(defaultRate, locale, 2), cost: eur(costPerKm, locale, 2) })}
              </p>
            </>
          );
        })()
      )}
    </div>
  );
}

export function ProUsageCard() {
  const { t, tf, locale } = useI18n();
  const { trips } = useTrips();
  const { profile } = useUserProfile();

  const year = new Date().getFullYear();
  const kmWorkYear = trips.reduce((acc, trip) => {
    const dt = parseTripDate(trip.date);
    if (!dt || dt.getFullYear() !== year) return acc;
    return acc + (Number.isFinite(trip.distance) ? trip.distance : 0);
  }, 0);

  const annualTotal = parseLocaleNumber(profile.annualCarTotalKm) || 0;
  const pct = annualTotal > 0 ? Math.min(100, (kmWorkYear / annualTotal) * 100) : null;

  return (
    <div className="glass-card p-5 h-full flex flex-col">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        {t("dashboard.proUsageTitle")}
      </h2>
      {pct == null ? (
        <p className="text-sm text-muted-foreground my-auto">{t("dashboard.proUsageMissing")}</p>
      ) : (
        <>
          <p className="text-4xl font-bold tracking-tight tabular-nums">
            {pct.toLocaleString(locale, { maximumFractionDigits: 1 })} %
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {tf("dashboard.proUsageDetail", {
              workKm: Math.round(kmWorkYear).toLocaleString(locale),
              totalKm: Math.round(annualTotal).toLocaleString(locale),
              year,
            })}
          </p>
          <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full [background:var(--gradient-primary)] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}
