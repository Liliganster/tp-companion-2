import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Settings2,
  Download,
  Sprout,
  Fuel,
  Gauge,
  TreePine,
  Info,
  Save,
  Flame,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";

// Mock data for results
const mockResults = [
  {
    id: 1,
    rank: 1,
    name: "WENN DAS LICHT GEFRIERT",
    rating: "Muy pobre",
    trend: "Mejorando",
    co2Kg: 28.6,
    efficiency: 0.28,
    distanceKm: 104,
    trips: 2,
  },
];

export default function AdvancedEmissions() {
  const navigate = useNavigate();
  const { t, tf } = useI18n();
  const [isConfigured, setIsConfigured] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);

  // Configuration state
  const [viewMode, setViewMode] = useState("projects");
  const [sortBy, setSortBy] = useState("co2");
  const [timeRange, setTimeRange] = useState("30days");
  const [fuelEfficiency, setFuelEfficiency] = useState("12");

  const handleSaveConfig = () => {
    setIsConfigured(true);
    setConfigModalOpen(false);
  };

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/advanced")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">{t("advancedEmissions.pageTitle")}</h1>
              <p className="text-muted-foreground mt-1">
                {t("advancedEmissions.pageSubtitle")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button className="gap-2 bg-primary hover:bg-primary/90">
              <Download className="w-4 h-4" />
              {t("advancedEmissions.export")}
            </Button>
          </div>
        </div>

        {/* Content based on configuration state */}
        {!isConfigured ? (
          /* Empty/Welcome State */
          <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
            <div className="mb-6">
              <Sprout className="w-20 h-20 text-success" />
            </div>
            <h2 className="text-xl font-semibold mb-4">{t("advancedEmissions.welcomeTitle")}</h2>
            <p className="text-muted-foreground text-center max-w-lg mb-8">
              {t("advancedEmissions.welcomeBody")}
            </p>
            <Button
              variant="add"
              onClick={() => setConfigModalOpen(true)}
              className="gap-2"
            >
              <Settings2 className="w-4 h-4" />
              {t("advancedEmissions.configureButton")}
            </Button>
          </div>
        ) : (
          /* Results State */
          <div className="space-y-6 animate-fade-in">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">{t("advancedEmissions.totalEmissions")}</span>
                  <Flame className="w-5 h-5 text-destructive" />
                </div>
                <p className="text-2xl font-bold text-destructive">28.6 kg</p>
              </div>

              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">{t("advancedEmissions.avgEfficiency")}</span>
                  <Gauge className="w-5 h-5 text-primary" />
                </div>
                <p className="text-2xl font-bold text-primary">0.28 kg/km</p>
              </div>

              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">{t("advancedEmissions.fuelConsumption")}</span>
                  <Fuel className="w-5 h-5 text-cyan-400" />
                </div>
                <p className="text-2xl font-bold text-cyan-400">12.5 L</p>
              </div>

              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">{t("advancedEmissions.treesNeeded")}</span>
                  <TreePine className="w-5 h-5 text-success" />
                </div>
                <p className="text-2xl font-bold text-success">2</p>
              </div>
            </div>

            {/* Results List */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                {tf("advancedEmissions.resultsTitle", { count: mockResults.length })}
              </h3>

              {mockResults.map((result) => (
                <div key={result.id} className="glass-card p-5">
                  <div className="flex items-start gap-4">
                    {/* Rank Badge */}
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/20 text-amber-500 font-bold">
                      #{result.rank}
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-4">
                        <h4 className="font-semibold">{result.name}</h4>
                        <span className="px-2 py-0.5 text-xs rounded-full bg-destructive/20 text-destructive">
                          {result.rating}
                        </span>
                        <span className="px-2 py-0.5 text-xs rounded-full bg-success/20 text-success flex items-center gap-1">
                          ✓ {result.trend}
                        </span>
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{t("advancedEmissions.metricCo2Kg")}</p>
                          <p className="text-lg font-semibold">{result.co2Kg}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{t("advancedEmissions.metricEfficiency")}</p>
                          <p className="text-lg font-semibold">{result.efficiency}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{t("advancedEmissions.metricDistance")}</p>
                          <p className="text-lg font-semibold">{result.distanceKm}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">{t("advancedEmissions.metricTrips")}</p>
                          <p className="text-lg font-semibold">{result.trips}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Configuration Modal */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("advancedEmissions.configTitle")}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {t("advancedEmissions.configSubtitle")}
            </p>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              {/* View Mode */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  {t("advancedEmissions.viewMode")}
                </Label>
                <Select value={viewMode} onValueChange={setViewMode}>
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="projects">{t("advancedEmissions.viewModeProjectsOnly")}</SelectItem>
                    <SelectItem value="all">{t("advancedEmissions.viewModeAllTrips")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort By */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  {t("advancedEmissions.sortBy")}
                </Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="co2">{t("advancedEmissions.sortByCo2")}</SelectItem>
                    <SelectItem value="efficiency">{t("advancedEmissions.sortByEfficiency")}</SelectItem>
                    <SelectItem value="distance">{t("advancedEmissions.sortByDistance")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("advancedEmissions.sortByHelp")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Time Range */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  {t("advancedEmissions.timeRange")}
                </Label>
                <Select value={timeRange} onValueChange={setTimeRange}>
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7days">{t("advancedEmissions.last7Days")}</SelectItem>
                    <SelectItem value="30days">{t("advancedEmissions.last30Days")}</SelectItem>
                    <SelectItem value="90days">{t("advancedEmissions.last90Days")}</SelectItem>
                    <SelectItem value="year">{t("advancedEmissions.thisYear")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("advancedEmissions.selectPeriodHelp")}
                </p>
              </div>

              {/* Fuel Efficiency */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  {t("advancedEmissions.fuelEfficiency")}
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={fuelEfficiency}
                    onChange={(e) => setFuelEfficiency(e.target.value)}
                    className="bg-secondary/50 pr-16"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    L/100km
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("advancedEmissions.fuelEfficiencyHelp")}
                </p>
              </div>
            </div>

            {/* Info Box */}
            <div className="p-4 rounded-lg bg-secondary/30 border border-border/50">
              <div className="flex items-start gap-3">
                <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-medium mb-1">{t("advancedEmissions.aboutTitle")}</h4>
                  <p className="text-xs text-muted-foreground">
                    {t("advancedEmissions.aboutBody")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfigModalOpen(false)}>
              {t("advancedEmissions.cancel")}
            </Button>
            <Button variant="save" onClick={handleSaveConfig} className="gap-2">
              <Save className="w-4 h-4" />
              {t("advancedEmissions.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
