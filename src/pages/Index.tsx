import { MainLayout } from "@/components/layout/MainLayout";
import { KPICard } from "@/components/dashboard/KPICard";
import { NotificationDropdown } from "@/components/dashboard/NotificationDropdown";
import { RecentTrips } from "@/components/dashboard/RecentTrips";
import { ProjectChart } from "@/components/dashboard/ProjectChart";
import { Button } from "@/components/ui/button";
import { Route, FolderKanban, Leaf, Plus, Settings, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
export default function Index() {
  return <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="glass-card p-5 animate-fade-in rounded">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-zinc-50">
                  Welcome back, <span className="text-white">Max</span>
                </h1>
                <p className="text-muted-foreground mt-1">
                  Here's your mileage overview for this month
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
          <KPICard title="Total Distance" value="6,220 km" subtitle="This month" icon={<Route className="w-5 h-5 text-primary" />} trend={{
          value: 12,
          label: "vs last month"
        }} variant="primary" />
          <KPICard title="Active Projects" value="5" subtitle="With trips" icon={<FolderKanban className="w-5 h-5 text-amber-500" />} variant="accent" />
          <KPICard title="CO₂ Emissions" value="1,244 kg" subtitle="Estimated" icon={<Leaf className="w-5 h-5 text-success" />} trend={{
          value: -5,
          label: "vs last month"
        }} />
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ProjectChart />
          <RecentTrips />
        </div>
      </div>
    </MainLayout>;
}