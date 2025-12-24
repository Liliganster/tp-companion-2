import { MainLayout } from "@/components/layout/MainLayout";
import { KPICard } from "@/components/dashboard/KPICard";
import { NotificationDropdown } from "@/components/dashboard/NotificationDropdown";
import { RecentTrips } from "@/components/dashboard/RecentTrips";
import { ProjectChart } from "@/components/dashboard/ProjectChart";
import { Button } from "@/components/ui/button";
import { Plus, Settings, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useProjects } from "@/contexts/ProjectsContext";
import { getProjectsForDashboard } from "@/lib/projects";
import { useI18n } from "@/hooks/use-i18n";
import { useTrips } from "@/contexts/TripsContext";
import { calculateCO2KgFromKm } from "@/lib/emissions";

function sumKm(trips: Array<{ distance: number }>): number {
  return trips.reduce((acc, t) => acc + (Number.isFinite(Number(t.distance)) ? Number(t.distance) : 0), 0);
}

function sumCo2(trips: Array<{ co2?: number; distance: number }>): number {
  return trips.reduce((acc, t) => {
    const co2 = Number(t.co2);
    if (Number.isFinite(co2) && co2 > 0) return acc + co2;
    return acc + calculateCO2KgFromKm(t.distance);
  }, 0);
}

export default function Index() {
  const { profile } = useUserProfile();
  const { t, locale } = useI18n();
  const { projects } = useProjects();
  const { trips } = useTrips();
  const dashboardProjects = getProjectsForDashboard(projects);

  const kpiTitleClassName = "text-base font-semibold leading-tight text-foreground uppercase tracking-wide";
  const kpiTitleWrapperClassName = "p-0 rounded-none bg-transparent";

  const totalKm = sumKm(trips);
  const co2Kg = sumCo2(trips);
  const co2Rating = co2Kg <= 500 ? "A" : co2Kg <= 1000 ? "B" : co2Kg <= 1500 ? "C" : "D";
  const co2RatingColor =
    co2Rating === "A"
      ? "text-success"
      : co2Rating === "B"
        ? "text-emerald-500"
        : co2Rating === "C"
          ? "text-amber-500"
          : "text-destructive";
  const bubbleBaseClassName =
    "relative h-20 w-20 rounded-full glass overflow-hidden flex items-center justify-center backdrop-blur-xl backdrop-saturate-150 ring-1 ring-white/10";
  const bubbleValueClassName =
    "relative text-[44px] font-extrabold leading-none tracking-tight whitespace-nowrap";
  const bubbleValueClassNameSmall =
    "relative text-[38px] font-extrabold leading-none tracking-tight whitespace-nowrap";

  const getTintedBubbleStyle = (tint: string) =>
    ({
      background: `radial-gradient(circle at 30% 25%, rgba(${tint},0.45), rgba(${tint},0.12) 45%, rgba(0,0,0,0) 72%),
        radial-gradient(circle at 70% 75%, rgba(255,255,255,0.22), rgba(255,255,255,0) 62%),
        rgba(255,255,255,0.04)`,
      border: "1px solid rgba(255,255,255,0.18)",
      boxShadow: `0 14px 34px rgba(0,0,0,0.28),
        inset 0 0 26px rgba(${tint},0.22),
        0 0 18px rgba(${tint},0.18)`,
    }) as const;

  const distanceBubbleTint = "34,197,94";
  const distanceBubbleStyle = getTintedBubbleStyle(distanceBubbleTint);

  const co2BubbleTint =
    co2Rating === "A"
      ? "34,197,94"
      : co2Rating === "B"
        ? "16,185,129"
        : co2Rating === "C"
          ? "245,158,11"
          : "239,68,68";

  const co2BubbleStyle = getTintedBubbleStyle(co2BubbleTint);
  return <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6">
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
              {/* AI Quota */}
              <div className="flex items-center gap-2 px-3 py-2 border rounded border-inherit bg-[#311084]">
                <Sparkles className="w-4 h-4 text-[#fcfcfc]" />
                <span className="text-sm font-medium">47/100</span>
              </div>
              {/* Warnings Bell */}
              <NotificationDropdown />
              {/* Action buttons */}
              
            </div>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <KPICard
            title="DISTANCIA TOTAL"
            value={`${totalKm.toLocaleString(locale)} km`}
            subtitle={undefined}
            icon={<div className={kpiTitleClassName}>{t("dashboard.totalDistance")}</div>}
            iconWrapperClassName={kpiTitleWrapperClassName}
            hideTitle
            variant="primary"
            valueGradient={false}
            valueClassName="text-white"
            action={<Link to="/trips" className="text-xs text-primary hover:underline">{t("dashboard.viewTrips")}</Link>}
          />
          <KPICard
            title="PROYECTOS ACTIVOS"
            value={dashboardProjects.length}
            subtitle={undefined}
            icon={<div className={kpiTitleClassName}>{t("dashboard.activeProjects")}</div>}
            iconWrapperClassName={kpiTitleWrapperClassName}
            hideTitle
            variant="accent"
            action={<Link to="/projects" className="text-xs text-primary hover:underline">{t("dashboard.viewProjects")}</Link>}
          />
          <KPICard
            title={"EMISIONES CO\u2082"}
            value={`${co2Kg.toLocaleString(locale)} kg`}
            subtitle={undefined}
             icon={<div className={kpiTitleClassName}>{t("dashboard.co2Emissions")}</div>}
             hideTitle
             iconWrapperClassName={kpiTitleWrapperClassName}
             headerRight={<div className="absolute top-4 right-4 flex flex-col items-center text-center">
               <div style={co2BubbleStyle} className={bubbleBaseClassName}>
                 <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/15 via-white/5 to-transparent" />
                 <div className="pointer-events-none absolute -top-3 -left-3 h-10 w-10 rounded-full bg-white/25 blur-xl" />
                 <div className={`${bubbleValueClassName} ${co2RatingColor}`}>{co2Rating}</div>
               </div>
               <div className="mt-2 text-[10px] leading-tight text-muted-foreground">&nbsp;</div>
             </div>}
             action={<Link to="/advanced/emissions" className="text-xs text-primary hover:underline">{t("dashboard.viewCo2")}</Link>}
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
