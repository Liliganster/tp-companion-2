/**
 * Tarjetas del dashboard — Fase 4 del PLAN.md.
 *
 * - ReportReadyCard: contextual los primeros días del mes → informe del mes
 *   anterior listo para generar.
 * - CarMarginCard: sustituto del odómetro — Kilometergeld facturado menos
 *   coste real por km del PERFIL (sin fotos, sin IA).
 * - ProUsageCard: % de uso profesional manual (km totales anuales del perfil
 *   ÷ km profesionales registrados).
 *
 * (El contador de IA vive como chip pequeño en la cabecera del dashboard —
 * decisión de la propietaria — y como línea en el modal de subida.)
 */
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { useTrips } from "@/contexts/TripsContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { parseLocaleNumber } from "@/lib/number";
import { tripKilometrageAmount, vehicleCostPerKm } from "@/lib/tripMoney";
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
  const hasPrevMonthTrips = trips.some((trip) => {
    const dt = parseTripDate(trip.date);
    return dt != null && dt >= prevStart && dt <= prevEnd;
  });
  if (!hasPrevMonthTrips) return null;

  const toDateOnly = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const monthName = prevStart.toLocaleDateString(locale, { month: "long" });
  const link = `/reports/view?project=all&startDate=${toDateOnly(prevStart)}&endDate=${toDateOnly(prevEnd)}`;

  return (
    <div className="glass-card p-4 border-primary/40 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <FileText className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">{tf("dashboard.reportReadyTitle", { month: monthName })}</span>
      </div>
      <Button asChild size="sm" className="w-full sm:w-auto">
        <Link to={link}>{t("dashboard.reportReadyCta")}</Link>
      </Button>
    </div>
  );
}

export function CarMarginCard() {
  const { t, tf, locale } = useI18n();
  const { trips } = useTrips();
  const { profile } = useUserProfile();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthTrips = trips.filter((trip) => {
    const dt = parseTripDate(trip.date);
    return dt != null && dt >= startOfMonth && dt < startOfNextMonth;
  });

  const defaultRate = parseLocaleNumber(profile.ratePerKm) || 0;
  const kmMonth = monthTrips.reduce((acc, trip) => acc + (Number.isFinite(trip.distance) ? trip.distance : 0), 0);
  const billed = monthTrips.reduce((acc, trip) => acc + tripKilometrageAmount(trip, defaultRate), 0);
  const costPerKm = vehicleCostPerKm(profile);

  return (
    <div className="glass-card p-4 h-full flex flex-col">
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-2">{t("dashboard.carMarginTitle")}</h2>
      {costPerKm == null ? (
        <p className="text-sm text-muted-foreground my-auto">{t("dashboard.carMarginMissing")}</p>
      ) : (
        (() => {
          const cost = costPerKm * kmMonth;
          const margin = billed - cost;
          return (
            <>
              <p className={`text-3xl font-bold ${margin >= 0 ? "text-success" : "text-destructive"}`}>
                {margin >= 0 ? "+" : ""}
                {eur(margin, locale)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tf("dashboard.carMarginMonth", { amount: eur(margin, locale) })}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {tf("dashboard.carMarginDetail", { billed: eur(billed, locale), cost: eur(cost, locale) })}
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
    <div className="glass-card p-4 h-full flex flex-col">
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-2">{t("dashboard.proUsageTitle")}</h2>
      {pct == null ? (
        <p className="text-sm text-muted-foreground my-auto">{t("dashboard.proUsageMissing")}</p>
      ) : (
        <>
          <p className="text-3xl font-bold">{pct.toLocaleString(locale, { maximumFractionDigits: 1 })} %</p>
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {tf("dashboard.proUsageDetail", {
              workKm: Math.round(kmWorkYear).toLocaleString(locale),
              totalKm: Math.round(annualTotal).toLocaleString(locale),
              year,
            })}
          </p>
        </>
      )}
    </div>
  );
}
