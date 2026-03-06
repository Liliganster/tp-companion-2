import { Link } from "react-router-dom";
import { ArrowRight, Star, FolderOpen } from "lucide-react";
import { useProjects } from "@/contexts/ProjectsContext";
import { useTrips } from "@/contexts/TripsContext";
import { getProjectsForDashboard } from "@/lib/projects";
import { useI18n } from "@/hooks/use-i18n";

const RING_COLORS = [
  "#129446", // green
  "#3b82f6", // blue
  "#ef4444", // red
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
];

export function ProjectsRingCard() {
  const { projects } = useProjects();
  const { trips } = useTrips();
  const { t, locale } = useI18n();
  const dashboardProjects = getProjectsForDashboard(projects);
  const allActive = projects.filter((p) => !p.archived);
  const starred = allActive.filter((p) => p.starred);
  const hasSelection = starred.length > 0;

  // Build km data per project
  const kmByProject = new Map<string, number>();
  for (const trip of trips) {
    const d = Number(trip.distance) || 0;
    if (trip.projectId) {
      kmByProject.set(trip.projectId, (kmByProject.get(trip.projectId) ?? 0) + d);
    } else if (trip.project) {
      kmByProject.set(trip.project, (kmByProject.get(trip.project) ?? 0) + d);
    }
  }

  const displayProjects = hasSelection
    ? starred.slice(0, RING_COLORS.length)
    : [];

  const maxKm = Math.max(
    ...displayProjects.map((p) => kmByProject.get(p.id) ?? kmByProject.get(p.name) ?? 0),
    1
  );

  const totalKmStarred = starred.reduce((sum, p) => sum + (kmByProject.get(p.id) ?? kmByProject.get(p.name) ?? 0), 0);
  const totalKmAll = Array.from(kmByProject.values()).reduce((a, b) => a + b, 0);
  const displayKm = hasSelection ? totalKmStarred : totalKmAll;

  const totalCount = allActive.length;
  const centerNumber = hasSelection ? starred.length : totalCount;
  const size = 120;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="glass-card p-4 animate-fade-in transition-colors duration-200 hover:bg-accent/40 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="text-sm font-semibold leading-tight text-foreground uppercase tracking-wide">
          {t("dashboard.activeProjects")}
        </div>
      </div>

      {/* Split layout: left stats, right ring */}
      <div className="grid grid-cols-2 gap-3">
        {/* Left: stats */}
        <div className="min-w-0 flex flex-col">
          <div className="text-2xl font-bold text-foreground mb-2">{totalCount}</div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg border border-border bg-muted text-muted-foreground">
              <span className="font-medium flex items-center gap-1"><Star className="w-3 h-3 text-yellow-500 fill-yellow-500" /> {t("dashboard.starred") ?? "Starred"}</span>
              <span className="font-bold tabular-nums text-foreground">{starred.length}</span>
            </div>
            <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg border border-border bg-muted text-muted-foreground">
              <span className="font-medium flex items-center gap-1"><FolderOpen className="w-3 h-3" /> {t("dashboard.totalKm") ?? "Total km"}</span>
              <span className="font-bold tabular-nums text-foreground">{Math.round(displayKm).toLocaleString(locale)} km</span>
            </div>
          </div>
        </div>

        {/* Right: ring chart */}
        <div className="flex flex-col items-center">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {hasSelection ? (
              displayProjects.map((project, i) => {
                const km = kmByProject.get(project.id) ?? kmByProject.get(project.name) ?? 0;
                const ratio = maxKm > 0 ? km / maxKm : 0;
                const ringWidth = 10;
                const gap = 3;
                const lastIdx = displayProjects.length - 1;
                const r = (size / 2) - 8 - (lastIdx - i) * (ringWidth + gap);
                const circumference = 2 * Math.PI * r;
                const dashLen = ratio * circumference;
                const color = RING_COLORS[i % RING_COLORS.length];

                return (
                  <g key={project.id}>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" className="text-muted/30" strokeWidth={ringWidth} />
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={ringWidth}
                      strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                      strokeDashoffset={circumference * 0.25} strokeLinecap="round" className="transition-all duration-700" />
                  </g>
                );
              })
            ) : (
              <>
                <circle cx={cx} cy={cy} r={45} fill="none" stroke="currentColor" className="text-muted/30" strokeWidth={10} />
                <circle cx={cx} cy={cy} r={45} fill="none" stroke="#129446" strokeWidth={10}
                  strokeDasharray={`${2 * Math.PI * 45}`} strokeDashoffset={0} strokeLinecap="round" />
              </>
            )}
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="fill-foreground font-bold" fontSize={16}>
              {centerNumber}
            </text>
          </svg>

          {/* Legend */}
          {hasSelection && displayProjects.length > 0 && (
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
              {displayProjects.map((project, i) => (
                <div key={project.id} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: RING_COLORS[i % RING_COLORS.length] }} />
                  <span className="truncate max-w-[70px]">{project.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action link */}
      <div className="mt-auto pt-2">
        <Link
          to="/projects"
          className="text-sm font-medium text-[#129446] hover:text-[#129446]/80 inline-flex items-center gap-1"
        >
          {t("dashboard.viewProjects")} <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
