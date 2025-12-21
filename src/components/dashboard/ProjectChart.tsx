import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useProjects } from "@/contexts/ProjectsContext";
import { getProjectsForDashboard } from "@/lib/projects";
import { useI18n } from "@/hooks/use-i18n";

export function ProjectChart() {
  const { projects } = useProjects();
  const dashboardProjects = getProjectsForDashboard(projects);
  const data = dashboardProjects.map((p) => ({ name: p.name, km: p.totalKm }));
  const { t } = useI18n();

  return (
    <div className="glass-card p-5 animate-fade-in animation-delay-300">
      <h2 className="font-semibold text-lg mb-4 text-foreground">{t("chart.kmByProject")}</h2>
      
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
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
              fill="hsl(210, 100%, 50%)"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
