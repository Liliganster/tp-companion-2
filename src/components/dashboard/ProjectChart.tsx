import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useProjects } from "@/contexts/ProjectsContext";
import { getProjectsForDashboard } from "@/lib/projects";
import { useI18n } from "@/hooks/use-i18n";
import { useTrips } from "@/contexts/TripsContext";

export function ProjectChart() {
  const { projects } = useProjects();
  const { trips } = useTrips();
  const dashboardProjects = getProjectsForDashboard(projects);
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

  const data = dashboardProjects
    .map((p) => {
      const nameKey = (p.name ?? "").trim().toLowerCase();
      const km = kmByProjectId.get(p.id) ?? (nameKey ? kmByProjectName.get(nameKey) : undefined) ?? 0;
      return { name: p.name, km: Math.round(km * 10) / 10 };
    })
    .sort((a, b) => b.km - a.km || a.name.localeCompare(b.name));
  const { t } = useI18n();

  return (
    <div className="glass-card p-5 animate-fade-in animation-delay-300 flex flex-col h-full">
      <h2 className="font-semibold text-lg mb-4 text-foreground">{t("chart.kmByProject")}</h2>
      
      <div className="flex-1 min-h-48">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No hay datos para mostrar.
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
              fill="hsl(var(--muted-foreground))"
            />
          </BarChart>
        </ResponsiveContainer>
        )}
      </div>

    </div>
  );
}
