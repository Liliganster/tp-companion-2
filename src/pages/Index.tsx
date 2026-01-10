import { useEffect, useMemo, useRef, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { KPICard } from "@/components/dashboard/KPICard";
import { NotificationDropdown } from "@/components/dashboard/NotificationDropdown";
import { RecentTrips } from "@/components/dashboard/RecentTrips";
import { ProjectChart } from "@/components/dashboard/ProjectChart";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Plus, Settings, Sparkles, Check, AlertCircle, Loader2, Car } from "lucide-react";
import { Link } from "react-router-dom";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useProjects } from "@/contexts/ProjectsContext";
import { getProjectsForDashboard } from "@/lib/projects";
import { useI18n } from "@/hooks/use-i18n";
import { useTrips } from "@/contexts/TripsContext";
import { calculateTreesNeeded, calculateTripEmissions, TripEmissionsInput } from "@/lib/emissions";
import { parseLocaleNumber } from "@/lib/number";
import { useAuth } from "@/contexts/AuthContext";
import { useEmissionsInput } from "@/hooks/use-emissions-input";
import { usePlan } from "@/contexts/PlanContext";
import { usePlanLimits } from "@/hooks/use-plan-limits";

function parseTripDate(value: string): Date | null {
  if (!value) return null;

  // Prefer parsing YYYY-MM-DD as local date to avoid timezone drift.
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/.exec(value);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return new Date(year, month - 1, day);
  }

  const dt = new Date(value);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

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
  trips: Array<{ co2?: number; distance: number }>,
  emissionsInput: Omit<TripEmissionsInput, "distanceKm">,
): number {
  return trips.reduce((acc, t) => {
    // Always recalculate to reflect current profile settings
    return acc + calculateTripEmissions({ distanceKm: t.distance, ...emissionsInput }).co2Kg;
  }, 0);
}

export default function Index() {
  const { profile } = useUserProfile();
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const { projects } = useProjects();
  const { trips } = useTrips();
  const { limits } = usePlan();
  const { tripCounts } = usePlanLimits();
  const dashboardProjects = getProjectsForDashboard(projects);
  
  // Trips quota
  const tripsQuotaFull = tripCounts.total >= limits.maxActiveTrips;

  // AI monthly quota from API (respects plan and bypass)
  const [aiUsedThisMonth, setAiUsedThisMonth] = useState<number | null>(null);
  const [aiLimitFromApi, setAiLimitFromApi] = useState<number>(limits.aiJobsPerMonth);
  const [aiBypassEnabled, setAiBypassEnabled] = useState(false);
  const [aiQuotaLoading, setAiQuotaLoading] = useState(false);
  const { getAccessToken } = useAuth();
  const aiQuotaPollingDisabled = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchAiQuota() {
      if (aiQuotaPollingDisabled.current) return;
      if (!user?.id) {
        setAiUsedThisMonth(null);
        return;
      }

      setAiQuotaLoading(true);

      try {
        const token = await getAccessToken();
        if (!token) {
          if (!cancelled) setAiUsedThisMonth(null);
          return;
        }

        const response = await fetch("/api/user/ai-quota", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch AI quota");
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          // In Vite dev, /api routes may not be served by the backend.
          // Avoid spamming console with JSON parse errors.
          if (import.meta.env.DEV) {
            aiQuotaPollingDisabled.current = true;
            if (!cancelled) {
              setAiBypassEnabled(false);
              setAiLimitFromApi(limits.aiJobsPerMonth);
              setAiUsedThisMonth(null);
            }
            return;
          }
          throw new Error("AI quota endpoint did not return JSON");
        }

        const data = await response.json();
        
        if (!cancelled) {
          setAiBypassEnabled(data.bypass === true);
          setAiLimitFromApi(data.limit);
          setAiUsedThisMonth(data.used);
        }
      } catch (e) {
        // If the backend isn't available in dev, don't keep retrying.
        if (import.meta.env.DEV && e instanceof SyntaxError) {
          aiQuotaPollingDisabled.current = true;
        } else {
          console.error("Error fetching AI quota:", e);
        }
        if (!cancelled) setAiUsedThisMonth(null);
      } finally {
        if (!cancelled) setAiQuotaLoading(false);
      }
    }

    void fetchAiQuota();
    const id = setInterval(fetchAiQuota, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user?.id, getAccessToken, limits.aiJobsPerMonth]);

  const kpiTitleClassName = "text-base font-semibold leading-tight text-foreground uppercase tracking-wide";
  const kpiTitleWrapperClassName = "p-0 rounded-none bg-transparent";

  const { emissionsInput, isLoading: isLoadingEmissionsData } = useEmissionsInput();

  const totalKm = sumKm(trips);
  const co2Kg = sumCo2(trips, emissionsInput);

  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const tripsThisMonth = trips.filter((trip) => {
    const dt = parseTripDate(trip.date);
    if (!dt) return false;
    return dt >= startOfThisMonth && dt < startOfNextMonth;
  });

  const tripsPrevMonth = trips.filter((trip) => {
    const dt = parseTripDate(trip.date);
    if (!dt) return false;
    return dt >= startOfPrevMonth && dt < startOfThisMonth;
  });

  const kmThisMonth = sumKm(tripsThisMonth);
  const kmPrevMonth = sumKm(tripsPrevMonth);
  const co2ThisMonth = sumCo2(tripsThisMonth, emissionsInput);
  const co2PrevMonth = sumCo2(tripsPrevMonth, emissionsInput);
  const treesThisMonth = calculateTreesNeeded(co2ThisMonth, 20);
  // Rating matches the month-over-month bubble context (monthly emissions).
  const co2Rating = co2ThisMonth <= 500 ? "A" : co2ThisMonth <= 1000 ? "B" : co2ThisMonth <= 1500 ? "C" : "D";
    const co2TrendValue = percentageChange(co2ThisMonth, co2PrevMonth);
    const co2TrendPositive = co2TrendValue >= 0;
    const Co2TrendIcon = co2TrendPositive ? ArrowUp : ArrowDown;
    const co2TrendColor = co2TrendPositive ? "text-success" : "text-destructive";

  const distanceTrendValue = percentageChange(kmThisMonth, kmPrevMonth);
  const distanceTrendPositive = distanceTrendValue >= 0;

  // AI Quota display - show ∞ when bypass is enabled
  // AI Quota display - when bypass=1 (testing mode), show count without limit
  const aiQuotaText = aiQuotaLoading 
    ? "…" 
    : aiUsedThisMonth == null 
      ? `—/${aiLimitFromApi}` 
      : aiBypassEnabled 
        ? `${aiUsedThisMonth}` // Testing mode: just show count, no limit
        : `${aiUsedThisMonth}/${aiLimitFromApi}`;
  const aiQuotaTextColor =
    aiBypassEnabled 
      ? "text-emerald-300" // Green when in testing mode
      : aiUsedThisMonth != null && aiUsedThisMonth >= aiLimitFromApi 
        ? "text-amber-200" 
        : "text-zinc-50";
  /* New Card Design Helpers */
  const StatusRow = ({ label, value, status = "neutral", icon: Icon }: { label: string, value: string, status?: "success" | "warning" | "destructive" | "neutral", icon?: any }) => (
    <div className={`flex items-center justify-between text-xs px-2 py-1.5 rounded border border-transparent ${
      status === "success" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
      status === "warning" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
      status === "destructive" ? "bg-red-500/10 text-red-400 border-red-500/20" :
      "bg-white/5 text-zinc-300 border-white/10"
    }`}>
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="w-3 h-3" />}
        <span className="font-bold tabular-nums text-white">{value}</span>
      </div>
    </div>
  );

  return <MainLayout>
      <div className="max-w-[1800px] mx-auto space-y-6">
        {/* Header */}
        <div className="glass-card p-5 animate-fade-in rounded">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-zinc-50">
                  {t("dashboard.welcomeBackPrefix")} <span className="text-white">{profile.fullName}</span>
                </h1>
                <p className="text-muted-foreground mt-1">
                  {t("dashboard.subtitle")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Trips Quota */}
              <div className={`flex items-center gap-2 px-3 py-2 border rounded border-inherit ${tripsQuotaFull ? 'bg-red-900/50' : 'bg-[#0d4731]'}`}>
                <Car className="w-4 h-4 text-[#fcfcfc]" />
                <span className={`text-sm font-medium tabular-nums ${tripsQuotaFull ? 'text-red-300' : 'text-emerald-300'}`}>{tripCounts.total}/{limits.maxActiveTrips}</span>
              </div>
              {/* AI Quota */}
              <div className="flex items-center gap-2 px-3 py-2 border rounded border-inherit bg-[#311084]">
                <Sparkles className="w-4 h-4 text-[#fcfcfc]" />
                <span className={`text-sm font-medium tabular-nums ${aiQuotaTextColor}`}>{aiQuotaText}</span>
              </div>
              {/* Warnings Bell */}
              <NotificationDropdown />
            </div>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KPICard
            title="DISTANCIA TOTAL"
            value={<div className="mt-1">
              <div className="text-3xl font-bold text-white mb-3">{totalKm.toLocaleString(locale)} <span className="text-lg text-muted-foreground font-medium">km</span></div>
              <div className="grid gap-2">
                <StatusRow 
                  label={t("dashboard.thisMonth")} 
                  value={`${kmThisMonth.toLocaleString(locale)} km`} 
                  status="neutral"
                />
                <StatusRow 
                  label={t("dashboard.trend")} 
                  value={`${Math.abs(distanceTrendValue)}%`} 
                  status={distanceTrendPositive ? "success" : "destructive"}
                  icon={distanceTrendPositive ? ArrowUp : ArrowDown}
                />
              </div>
            </div>}
            icon={<div className={kpiTitleClassName}>{t("dashboard.totalDistance")}</div>}
            iconWrapperClassName={kpiTitleWrapperClassName}
            hideTitle
            variant="primary"
            valueGradient={false}
            action={<Link to="/trips" className="text-xs text-primary hover:underline mt-2 inline-block">{t("dashboard.viewTrips")}</Link>}
          />
          
          <KPICard
            title="PROYECTOS ACTIVOS"
            value={dashboardProjects.length}
            icon={<div className={kpiTitleClassName}>{t("dashboard.activeProjects")}</div>}
            iconWrapperClassName={kpiTitleWrapperClassName}
            hideTitle
            variant="accent"
            valueClassName="text-white"
            action={<Link to="/projects" className="text-xs text-primary hover:underline">{t("dashboard.viewProjects")}</Link>}
          />

          <KPICard
            title={"EMISIONES CO\u2082"}
            icon={<div className={kpiTitleClassName}>{t("dashboard.co2Emissions")}</div>}
            iconWrapperClassName={kpiTitleWrapperClassName}
            hideTitle
            headerRight={
              <div className={`text-6xl font-black tracking-tighter ml-4 ${
                co2Rating === "A" ? "text-emerald-500" :
                co2Rating === "B" ? "text-emerald-400" :
                co2Rating === "C" ? "text-amber-500" : "text-red-500"
              }`}>
                {co2Rating}
              </div>
            }
            value={isLoadingEmissionsData ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="mt-1">
              <div className="flex flex-col gap-2">
                <StatusRow 
                  label={t("dashboard.thisMonth")} 
                  value={`${co2ThisMonth.toFixed(0)} kg`}
                  status={co2Rating === "A" ? "success" : co2Rating === "B" || co2Rating === "C" ? "warning" : "destructive"}
                />
                 <StatusRow 
                  label={t("dashboard.trend")}
                  value={`${Math.abs(co2TrendValue)}%`}
                  status={co2TrendPositive ? "success" : "neutral"} 
                  icon={co2TrendPositive ? ArrowUp : ArrowDown}
                />
                <StatusRow 
                  label={t("dashboard.status")}
                  value={co2Rating === "A" ? t("dashboard.excellent") : co2Rating === "B" ? t("dashboard.good") : t("dashboard.improvable")}
                  status={co2Rating === "A" ? "success" : "neutral"}
                  icon={co2Rating === "A" ? Check : AlertCircle}
                />
                <StatusRow
                  label={t("dashboard.equivalentTrees")}
                  value={`${treesThisMonth}`}
                  status="neutral"
                />
              </div>
            </div>
            )}
            action={<Link to="/advanced/emissions" className="text-xs text-primary hover:underline mt-2 inline-block">{t("dashboard.viewCo2")}</Link>}
          />
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ProjectChart />
          <RecentTrips />
        </div>
      </div>
    </MainLayout>;
}
