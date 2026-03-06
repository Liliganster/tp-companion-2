import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useProjects } from "@/contexts/ProjectsContext";
import { useI18n } from "@/hooks/use-i18n";
import { useTrips } from "@/contexts/TripsContext";
import { useMemo, useState } from "react";

type MainFilter = "project" | "week" | "month" | "year";

const DAY_NAMES_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DAY_NAMES_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const MONTH_NAMES_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTH_NAMES_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function getWeekRange(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function getDayOfWeekIndex(date: Date) {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}

const selectClass = "h-6 rounded-md border border-border bg-muted px-1.5 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-ring";

export function ProjectChart() {
  const { projects } = useProjects();
  const { trips } = useTrips();
  const { t, language } = useI18n();

  const [mainFilter, setMainFilter] = useState<MainFilter>("project");
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");

  const dayNames = language === "de" ? DAY_NAMES_DE : language === "en" ? DAY_NAMES_EN : DAY_NAMES_ES;
  const monthNames = language === "de" ? MONTH_NAMES_DE : language === "en" ? MONTH_NAMES_EN : MONTH_NAMES_ES;

  // All project names for the second filter
  const projectNames = useMemo(() => {
    return projects.map((p) => p.name).sort((a, b) => a.localeCompare(b));
  }, [projects]);

  // Available years from trip data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const trip of trips) {
      if (trip.date) years.add(new Date(trip.date).getFullYear());
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [trips]);

  const data = useMemo(() => {
    const now = new Date();

    if (mainFilter === "project") {
      const kmByProjectId = new Map<string, number>();
      const kmByProjectName = new Map<string, number>();

      for (const trip of trips) {
        const distance = Number(trip.distance);
        if (!Number.isFinite(distance) || distance <= 0) continue;
        if (trip.projectId) {
          kmByProjectId.set(trip.projectId, (kmByProjectId.get(trip.projectId) ?? 0) + distance);
          continue;
        }
        const nameKey = (trip.project ?? "").trim().toLowerCase();
        if (!nameKey) continue;
        kmByProjectName.set(nameKey, (kmByProjectName.get(nameKey) ?? 0) + distance);
      }

      return projects
        .map((p) => {
          const nameKey = (p.name ?? "").trim().toLowerCase();
          const km = kmByProjectId.get(p.id) ?? (nameKey ? kmByProjectName.get(nameKey) : undefined) ?? 0;
          return { name: p.name, km: Math.round(km * 10) / 10 };
        })
        .filter((d) => selectedProject === "all" || d.name === selectedProject)
        .sort((a, b) => b.km - a.km || a.name.localeCompare(b.name));
    }

    if (mainFilter === "week") {
      const { start, end } = getWeekRange(now);
      const buckets = Array.from({ length: 7 }, () => 0);

      for (const trip of trips) {
        if (!trip.date) continue;
        const td = new Date(trip.date);
        if (td < start || td > end) continue;
        const distance = Number(trip.distance);
        if (!Number.isFinite(distance) || distance <= 0) continue;
        buckets[getDayOfWeekIndex(td)] += distance;
      }

      return buckets.map((km, i) => ({ name: dayNames[i], km: Math.round(km * 10) / 10 }));
    }

    if (mainFilter === "month") {
      const year = now.getFullYear();
      const month = now.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const buckets = Array.from({ length: daysInMonth }, () => 0);

      for (const trip of trips) {
        if (!trip.date) continue;
        const td = new Date(trip.date);
        if (td.getMonth() !== month || td.getFullYear() !== year) continue;
        const distance = Number(trip.distance);
        if (!Number.isFinite(distance) || distance <= 0) continue;
        buckets[td.getDate() - 1] += distance;
      }

      return buckets.map((km, i) => ({ name: String(i + 1), km: Math.round(km * 10) / 10 }));
    }

    if (mainFilter === "year") {
      const year = selectedYear === "all" ? now.getFullYear() : Number(selectedYear);
      const buckets = Array.from({ length: 12 }, () => 0);

      for (const trip of trips) {
        if (!trip.date) continue;
        const td = new Date(trip.date);
        if (td.getFullYear() !== year) continue;
        const distance = Number(trip.distance);
        if (!Number.isFinite(distance) || distance <= 0) continue;
        buckets[td.getMonth()] += distance;
      }

      return buckets.map((km, i) => ({ name: monthNames[i], km: Math.round(km * 10) / 10 }));
    }

    return [];
  }, [trips, projects, mainFilter, selectedProject, selectedYear, dayNames, monthNames]);

  const mainOptions: { value: MainFilter; label: string }[] = [
    { value: "project", label: t("chart.filterProject") },
    { value: "week", label: t("chart.filterWeek") },
    { value: "month", label: t("chart.filterMonth") },
    { value: "year", label: t("chart.filterYear") },
  ];

  const chartTitle = useMemo(() => {
    switch (mainFilter) {
      case "week": return t("chart.kmByWeek");
      case "month": return t("chart.kmByMonth");
      case "year": return t("chart.kmByYear");
      default: return t("chart.kmByProject");
    }
  }, [mainFilter, t]);

  // Show second filter only for "project" and "year"
  const showSecondFilter = mainFilter === "project" || mainFilter === "year";

  return (
    <div className="glass-card p-4 animate-fade-in animation-delay-300 flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="font-semibold text-sm text-foreground">{chartTitle}</h2>
        <div className="flex items-center gap-1.5">
          <select
            value={mainFilter}
            onChange={(e) => {
              setMainFilter(e.target.value as MainFilter);
              setSelectedProject("all");
              setSelectedYear("all");
            }}
            className={selectClass}
          >
            {mainOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {showSecondFilter && mainFilter === "project" && (
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className={`${selectClass} max-w-[110px] truncate`}
            >
              <option value="all">{t("chart.filterAllProjects")}</option>
              {projectNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}

          {showSecondFilter && mainFilter === "year" && availableYears.length > 0 && (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className={selectClass}
            >
              <option value="all">{new Date().getFullYear()}</option>
              {availableYears.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      
      <div className="flex-1 min-h-32">
        {data.length === 0 || data.every((d) => d.km === 0) ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            {t("chart.noData")}
          </div>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
            <XAxis 
              dataKey="name" 
              stroke="hsl(var(--foreground))" 
              fontSize={11} 
              tickLine={true} 
              axisLine={true}
              tick={{ fill: "hsl(var(--foreground))" }}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))" 
              fontSize={12} 
              tickLine={true} 
              axisLine={true}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                padding: "8px 12px",
                color: "hsl(var(--foreground))"
              }} 
              labelStyle={{
                color: "hsl(var(--foreground))"
              }} 
              formatter={(value: number) => [`${value} km`, t("chart.distance")]}
              cursor={false}
            />
            <Bar 
              dataKey="km" 
              radius={[4, 4, 0, 0]} 
              fill="#129446"
            />
          </BarChart>
        </ResponsiveContainer>
        )}
      </div>

    </div>
  );
}
