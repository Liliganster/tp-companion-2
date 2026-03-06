import { useEffect, useMemo, useRef, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { KPICard } from "@/components/dashboard/KPICard";
import { NotificationDropdown } from "@/components/dashboard/NotificationDropdown";
import { RecentTrips } from "@/components/dashboard/RecentTrips";
import { ProjectsRingCard } from "@/components/dashboard/ProjectsRingCard";
import { ProjectChart } from "@/components/dashboard/ProjectChart";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, ArrowRight, Plus, Settings, Sparkles, Check, AlertCircle, Loader2, Car } from "lucide-react";
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
import { logger } from "@/lib/logger";

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
  trips: Array<{ co2?: number; distance: number; fuelLiters?: number | null; evKwhUsed?: number | null }>,
  emissionsInput: Omit<TripEmissionsInput, "distanceKm">,
): number {
  return trips.reduce((acc, t) => {
    // Always recalculate to reflect current profile settings
    return acc + calculateTripEmissions({ distanceKm: t.distance, fuelLiters: t.fuelLiters, evKwhUsed: t.evKwhUsed, ...emissionsInput }).co2Kg;
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

      // Only show loading state if we don't have data yet
      if (aiUsedThisMonth === null) {
        setAiQuotaLoading(true);
      }

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
          throw new Error("AI quota endpoint did not return JSON");
        }

        const data = await response.json();
        
        if (!cancelled) {
          setAiBypassEnabled(data.bypass === true);
          setAiLimitFromApi(data.limit);
          setAiUsedThisMonth(data.used);
        }
      } catch (e) {
        logger.warn("Error fetching AI quota from API, trying Supabase fallback", e);
        // Fallback: count callsheet_jobs directly from Supabase client
        try {
          const { supabase } = await import("@/lib/supabaseClient");
          if (supabase && user?.id) {
            const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
            const { count, error } = await supabase
              .from("callsheet_jobs")
              .select("id", { count: "exact" })
              .range(0, 0)
              .eq("user_id", user.id)
              .eq("status", "done")
              .gte("processed_at", startOfMonth);
            if (!error && typeof count === "number" && !cancelled) {
              setAiUsedThisMonth(count);
              setAiLimitFromApi(limits.aiJobsPerMonth);
              setAiBypassEnabled(false);
              aiQuotaPollingDisabled.current = true;
              return;
            }
          }
        } catch (fallbackErr) {
          logger.warn("Supabase fallback for AI quota also failed", fallbackErr);
        }
        if (!cancelled) setAiUsedThisMonth(null);
      } finally {
        if (!cancelled) setAiQuotaLoading(false);
      }
    }

    void fetchAiQuota();
    
    return () => {
      cancelled = true;
    };
  }, [user?.id, getAccessToken, limits.aiJobsPerMonth]);

  const hour = new Date().getHours();
  const greeting = hour >= 6 && hour < 12
    ? t("dashboard.greetingMorning")
    : hour >= 12 && hour < 20
      ? t("dashboard.greetingAfternoon")
      : t("dashboard.greetingEvening");

  const kpiTitleClassName = "text-sm font-semibold leading-tight text-foreground uppercase tracking-wide";
  const kpiTitleWrapperClassName = "p-0 rounded-none bg-transparent border-0";

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
    const co2TrendColor = "text-muted-foreground";

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
  const aiQuotaTextColor = "text-foreground";
  /* New Card Design Helpers */
  const StatusRow = ({ label, value, status = "neutral", icon: Icon }: { label: string, value: string, status?: "success" | "warning" | "destructive" | "neutral", icon?: any }) => (
    <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg border border-border bg-muted text-muted-foreground">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="w-3 h-3" />}
        <span className="font-bold tabular-nums text-foreground">{value}</span>
      </div>
    </div>
  );

  return <MainLayout>
      <div className="page-container lg:h-full lg:flex lg:flex-col lg:gap-3 lg:py-1">
        {/* Header */}
        <div className="glass-panel p-4 md:p-5 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-foreground text-xl sm:text-2xl font-semibold leading-tight tracking-tight">
                  {greeting} <span className="text-foreground">{profile.fullName.split(" ")[0]}</span>
                </h1>
                <p className="text-muted-foreground mt-1">
                  {t("dashboard.subtitle")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 border rounded-lg border-border bg-muted">
                <Car className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium tabular-nums text-foreground">{tripCounts.total}/{limits.maxActiveTrips}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 border rounded-lg border-border bg-muted">
                <Sparkles className="w-4 h-4 text-muted-foreground" />
                <span className={`text-xs font-medium tabular-nums ${aiQuotaTextColor}`}>{aiQuotaText}</span>
              </div>
              {/* Warnings Bell */}
              <NotificationDropdown />
            </div>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <KPICard
            title="DISTANCIA TOTAL"
            value={<div className="mt-1">
              <div className="grid grid-cols-2 gap-3">
                {/* Left: stats */}
                <div className="min-w-0 flex flex-col">
                  <div className="text-2xl font-bold text-foreground mb-2">{totalKm.toLocaleString(locale)} <span className="text-sm text-muted-foreground font-medium">km</span></div>
                  <div className="grid gap-1.5">
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
                </div>
                {/* Right: ring chart */}
                <div className="flex flex-col items-center">
                  <svg width={120} height={120} viewBox="0 0 120 120">
                    {/* Last month (inner - older) */}
                    <circle cx={60} cy={60} r={38} fill="none" stroke="hsl(var(--muted) / 0.3)" strokeWidth={10} />
                    <circle cx={60} cy={60} r={38} fill="none" stroke="#3b82f6" strokeWidth={10}
                      strokeDasharray={`${(kmPrevMonth / Math.max(kmThisMonth, kmPrevMonth, 1)) * 2 * Math.PI * 38} ${2 * Math.PI * 38}`}
                      strokeDashoffset={2 * Math.PI * 38 * 0.25} strokeLinecap="round" className="transition-all duration-700" />
                    {/* This month (outer - newer) */}
                    <circle cx={60} cy={60} r={51} fill="none" stroke="hsl(var(--muted) / 0.3)" strokeWidth={10} />
                    <circle cx={60} cy={60} r={51} fill="none" stroke="#129446" strokeWidth={10}
                      strokeDasharray={`${(kmThisMonth / Math.max(kmThisMonth, kmPrevMonth, 1)) * 2 * Math.PI * 51} ${2 * Math.PI * 51}`}
                      strokeDashoffset={2 * Math.PI * 51 * 0.25} strokeLinecap="round" className="transition-all duration-700" />
                    <text x={60} y={60} textAnchor="middle" dominantBaseline="central" className="fill-foreground font-bold" fontSize={16}>
                      {kmThisMonth.toLocaleString(locale)}
                    </text>
                  </svg>
                  <div className="flex gap-2 mt-0.5">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="w-2 h-2 rounded-full bg-[#129446]" />
                      {t("dashboard.thisMonth")}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                      {t("dashboard.lastMonth")}
                    </div>
                  </div>
                </div>
              </div>
            </div>}
            icon={<div className={kpiTitleClassName}>{t("dashboard.totalDistance")}</div>}
            iconWrapperClassName={kpiTitleWrapperClassName}
            hideTitle
            variant="primary"
            valueGradient={false}
            action={<Link to="/trips" className="text-sm font-medium text-[#129446] hover:text-[#129446]/80 mt-2 inline-flex items-center gap-1">{t("dashboard.viewTrips")} <ArrowRight className="w-4 h-4" /></Link>}
          />
          
          <ProjectsRingCard />

          <KPICard
            title={"EMISIONES CO\u2082"}
            icon={<div className={kpiTitleClassName}>{t("dashboard.co2Emissions")}</div>}
            iconWrapperClassName={kpiTitleWrapperClassName}
            hideTitle
            value={isLoadingEmissionsData ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="mt-1">
              <div className="grid grid-cols-2 gap-3">
                {/* Left: stats */}
                <div className="min-w-0 flex flex-col">
                  <div className="text-2xl font-bold text-foreground mb-2">{co2ThisMonth.toFixed(0)} <span className="text-sm text-muted-foreground font-medium">kg</span></div>
                  <div className="grid gap-1.5">
                    <StatusRow 
                      label={t("dashboard.trend")}
                      value={`${Math.abs(co2TrendValue)}%`}
                      status={co2TrendPositive ? "destructive" : "success"} 
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
                {/* Right: ring chart */}
                <div className="flex flex-col items-center">
                  {(() => {
                    const maxCo2 = 1500;
                    const ratio = Math.min(co2ThisMonth / maxCo2, 1);
                    const ratingColor = co2Rating === "A" ? "#129446" : co2Rating === "B" ? "#3b82f6" : co2Rating === "C" ? "#f59e0b" : "#ef4444";
                    const r = 51;
                    const circumference = 2 * Math.PI * r;
                    return (
                      <svg width={120} height={120} viewBox="0 0 120 120">
                        <circle cx={60} cy={60} r={r} fill="none" stroke="hsl(var(--muted) / 0.3)" strokeWidth={10} />
                        <circle cx={60} cy={60} r={r} fill="none" stroke={ratingColor} strokeWidth={10}
                          strokeDasharray={`${ratio * circumference} ${circumference}`}
                          strokeDashoffset={circumference * 0.25} strokeLinecap="round" className="transition-all duration-700" />
                        <text x={60} y={60} textAnchor="middle" dominantBaseline="central" className="fill-foreground font-bold" fontSize={32}>
                          {co2Rating}
                        </text>
                      </svg>
                    );
                  })()}
                  <div className="flex gap-2 mt-0.5">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: co2Rating === "A" ? "#129446" : co2Rating === "B" ? "#3b82f6" : co2Rating === "C" ? "#f59e0b" : "#ef4444" }} />
                      CO₂ {t("dashboard.thisMonth")}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}
            action={<Link to="/advanced/emissions" className="text-sm font-medium text-[#129446] hover:text-[#129446]/80 mt-2 inline-flex items-center gap-1">{t("dashboard.viewCo2")} <ArrowRight className="w-4 h-4" /></Link>}
          />
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:flex-1 lg:min-h-0">
          <ProjectChart />
          <RecentTrips />
        </div>
      </div>
    </MainLayout>;
}
