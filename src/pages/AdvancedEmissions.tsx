import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { useTrips } from "@/contexts/TripsContext";
import { useProjects } from "@/contexts/ProjectsContext";
import { calculateTreesNeeded, calculateTripEmissions } from "@/lib/emissions";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { parseLocaleNumber } from "@/lib/number";
import { useElectricityMapsCarbonIntensity } from "@/hooks/use-electricity-maps";
import { useClimatiqFuelFactor } from "@/hooks/use-climatiq";

type EmissionsResult = {
  id: string;
  rank: number;
  name: string;
  rating: "excellent" | "good" | "fair" | "poor";
  trend: "stable" | "new" | "improving" | "worsening";
  co2Kg: number;
  efficiency: number;
  distanceKm: number;
  trips: number;
  fuelLiters?: number;  // For gasoline/diesel
  kwhUsed?: number;      // For EV
};

function downloadTextFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseTripDate(value: string): Date | null {
  if (!value) return null;
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

function clampRound(value: number, decimals: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function getRange(now: Date, timeRange: string): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const end = new Date(now);
  const start = new Date(now);
  const prevEnd = new Date(now);
  const prevStart = new Date(now);

  if (timeRange === "all") {
    start.setTime(0);
    start.setHours(0, 0, 0, 0);
    // "All time" has no meaningful previous window. Reuse the same window to keep trend stable.
    prevStart.setTime(start.getTime());
    prevEnd.setTime(end.getTime());
  } else if (timeRange === "7days") {
    start.setDate(start.getDate() - 7);
    prevEnd.setDate(prevEnd.getDate() - 7);
    prevStart.setDate(prevStart.getDate() - 14);
  } else if (timeRange === "90days") {
    start.setDate(start.getDate() - 90);
    prevEnd.setDate(prevEnd.getDate() - 90);
    prevStart.setDate(prevStart.getDate() - 180);
  } else if (timeRange === "year") {
    start.setFullYear(start.getFullYear(), 0, 1);
    start.setHours(0, 0, 0, 0);
    prevEnd.setFullYear(prevEnd.getFullYear() - 1, 11, 31);
    prevEnd.setHours(23, 59, 59, 999);
    prevStart.setFullYear(prevStart.getFullYear() - 1, 0, 1);
    prevStart.setHours(0, 0, 0, 0);
  } else {
    // default: 30 days
    start.setDate(start.getDate() - 30);
    prevEnd.setDate(prevEnd.getDate() - 30);
    prevStart.setDate(prevStart.getDate() - 60);
  }

  return { start, end, prevStart, prevEnd };
}

function getRatingFromEfficiencyKgPerKm(eff: number): EmissionsResult["rating"] {
  // Simple heuristic categories: lower kg/km is better.
  if (eff <= 0.12) return "excellent";
  if (eff <= 0.16) return "good";
  if (eff <= 0.22) return "fair";
  return "poor";
}

function getTrendLabel(current: number, previous: number): EmissionsResult["trend"] {
  // Lower is better. Compare % change and bucket it.
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return "stable";
  if (previous <= 0) return current > 0 ? "new" : "stable";

  const deltaPct = ((current - previous) / previous) * 100;
  if (deltaPct <= -5) return "improving";
  if (deltaPct >= 5) return "worsening";
  return "stable";
}

const ADV_EMISSIONS_CONFIG_KEY = "advancedEmissions:config:v2";

function loadAdvancedEmissionsConfig(): {
  isConfigured: boolean;
  viewMode: string;
  sortBy: string;
  timeRange: string;
  fuelEfficiency: string;
} {
  try {
    if (typeof window === "undefined") {
      return { isConfigured: false, viewMode: "projects", sortBy: "co2", timeRange: "all", fuelEfficiency: "0" };
    }
    const raw = window.localStorage.getItem(ADV_EMISSIONS_CONFIG_KEY);
    if (!raw) {
      return { isConfigured: false, viewMode: "projects", sortBy: "co2", timeRange: "all", fuelEfficiency: "0" };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { isConfigured: false, viewMode: "projects", sortBy: "co2", timeRange: "all", fuelEfficiency: "0" };
    }

    return {
      isConfigured: Boolean((parsed as any).isConfigured),
      viewMode: typeof (parsed as any).viewMode === "string" ? (parsed as any).viewMode : "projects",
      sortBy: typeof (parsed as any).sortBy === "string" ? (parsed as any).sortBy : "co2",
      timeRange: typeof (parsed as any).timeRange === "string" ? (parsed as any).timeRange : "all",
      fuelEfficiency: typeof (parsed as any).fuelEfficiency === "string" ? (parsed as any).fuelEfficiency : "0",
    };
  } catch {
    return { isConfigured: false, viewMode: "projects", sortBy: "co2", timeRange: "all", fuelEfficiency: "0" };
  }
}

export default function AdvancedEmissions() {
  const navigate = useNavigate();
  const { t, tf } = useI18n();
  const { trips } = useTrips();
  const { projects } = useProjects();
  const { profile } = useUserProfile();

  const { data: atGrid, isLoading: isLoadingGrid } = useElectricityMapsCarbonIntensity("AT", {
    enabled: profile.fuelType === "ev",
  });
  const gridKgCo2PerKwh = atGrid?.kgCo2PerKwh ?? null;
  const { data: fuelFactor, isLoading: isLoadingFuel } = useClimatiqFuelFactor(
    profile.fuelType === "gasoline" || profile.fuelType === "diesel" ? profile.fuelType : null,
    { enabled: profile.fuelType === "gasoline" || profile.fuelType === "diesel" },
  );

  const isLoadingEmissionsData = isLoadingGrid || isLoadingFuel;

  const ratingLabel = useMemo(
    () => (rating: EmissionsResult["rating"]) => {
      switch (rating) {
        case "excellent":
          return t("advancedEmissions.ratingExcellent");
        case "good":
          return t("advancedEmissions.ratingGood");
        case "fair":
          return t("advancedEmissions.ratingFair");
        default:
          return t("advancedEmissions.ratingPoor");
      }
    },
    [t],
  );

  const trendLabel = useMemo(
    () => (trend: EmissionsResult["trend"]) => {
      switch (trend) {
        case "improving":
          return t("advancedEmissions.trendImproving");
        case "worsening":
          return t("advancedEmissions.trendWorsening");
        case "new":
          return t("advancedEmissions.trendNew");
        default:
          return t("advancedEmissions.trendStable");
      }
    },
    [t],
  );

  const fallbackTripName = t("advancedEmissions.fallbackTripName");
  const fallbackProjectName = t("advancedEmissions.fallbackProjectName");

  const [isConfigured, setIsConfigured] = useState(() => loadAdvancedEmissionsConfig().isConfigured);
  const [configModalOpen, setConfigModalOpen] = useState(false);

  // Configuration state
  const [viewMode, setViewMode] = useState(() => loadAdvancedEmissionsConfig().viewMode);
  const [sortBy, setSortBy] = useState(() => loadAdvancedEmissionsConfig().sortBy);
  const [timeRange, setTimeRange] = useState(() => loadAdvancedEmissionsConfig().timeRange);
  const [fuelEfficiency, setFuelEfficiency] = useState(() => loadAdvancedEmissionsConfig().fuelEfficiency);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(
        ADV_EMISSIONS_CONFIG_KEY,
        JSON.stringify({ isConfigured, viewMode, sortBy, timeRange, fuelEfficiency })
      );
    } catch {
      // ignore
    }
  }, [fuelEfficiency, isConfigured, sortBy, timeRange, viewMode]);

  const computed = useMemo(() => {
    const now = new Date();
    const { start, end, prevStart, prevEnd } = getRange(now, timeRange);
    const fuelLPer100Km = Number.parseFloat(String(fuelEfficiency).replace(",", "."));
    const fuelRate = Number.isFinite(fuelLPer100Km) && fuelLPer100Km > 0 ? fuelLPer100Km : 0;
    const profileFuelRate = parseLocaleNumber(profile.fuelLPer100Km);

    // The config modal controls the "analysis assumptions" (fuel efficiency). 
    // Only use local config if explicitly saved (isConfigured). Otherwise default to User Profile.
    const analysisFuelRate =
      isConfigured && fuelRate > 0 
        ? fuelRate 
        : Number.isFinite(profileFuelRate) && Number(profileFuelRate) > 0 
          ? Number(profileFuelRate) 
          : fuelRate;

    const shouldUseAnalysisFuelRate =
      (profile.fuelType === "gasoline" || profile.fuelType === "diesel") && analysisFuelRate > 0;

    const projectNameById = new Map(projects.map((p) => [p.id, p.name] as const));

    const sumTripCo2 = (distanceKm: number, co2?: number) => {
      // Always recalculate emissions based on current profile settings
      // to ensure the ranking reflects the latest configuration.
      // Previously stored trip.co2 values may be outdated if the profile changed.
      const res = calculateTripEmissions({
        distanceKm,
        fuelType: profile.fuelType,
        fuelLPer100Km: shouldUseAnalysisFuelRate ? analysisFuelRate : parseLocaleNumber(profile.fuelLPer100Km),
        fuelKgCo2ePerLiter: fuelFactor?.kgCo2ePerLiter ?? null,
        fuelKgCo2ePerKm: fuelFactor?.kgCo2ePerKm ?? null,
        evKwhPer100Km: parseLocaleNumber(profile.evKwhPer100Km),
        gridKgCo2PerKwh,
      });
      return res.co2Kg;
    };

    const inRange = (d: Date) => d >= start && d <= end;
    const inPrevRange = (d: Date) => d >= prevStart && d <= prevEnd;

    const currentTrips = trips.filter((tr) => {
      const dt = parseTripDate(tr.date);
      return dt ? inRange(dt) : false;
    });

    const prevTrips = trips.filter((tr) => {
      const dt = parseTripDate(tr.date);
      return dt ? inPrevRange(dt) : false;
    });

    type Agg = {
      id: string;
      name: string;
      co2Kg: number;
      distanceKm: number;
      trips: number;
    };

    const aggregate = (source: typeof trips) => {
      const map = new Map<string, Agg>();
      for (const tr of source) {
        const distance = Number.isFinite(Number(tr.distance)) ? Number(tr.distance) : 0;
        const co2 = sumTripCo2(distance, tr.co2);

        if (viewMode === "all") {
          const key = tr.id;
          const name = tr.project || fallbackTripName;
          const cur = map.get(key) ?? { id: key, name, co2Kg: 0, distanceKm: 0, trips: 0 };
          cur.co2Kg += co2;
          cur.distanceKm += distance;
          cur.trips += 1;
          map.set(key, cur);
        } else {
          const key = tr.projectId || (tr.project || "unknown").trim().toLowerCase();
          const resolvedName = tr.projectId ? (projectNameById.get(tr.projectId) ?? tr.project) : tr.project;
          const name = resolvedName || fallbackProjectName;
          const cur = map.get(key) ?? { id: String(key), name, co2Kg: 0, distanceKm: 0, trips: 0 };
          cur.co2Kg += co2;
          cur.distanceKm += distance;
          cur.trips += 1;
          map.set(key, cur);
        }
      }
      return Array.from(map.values());
    };

    const curAgg = aggregate(currentTrips);
    const prevAgg = aggregate(prevTrips);
    const prevById = new Map(prevAgg.map((a) => [a.id, a] as const));

    const results: EmissionsResult[] = curAgg.map((a) => {
      const efficiency = a.distanceKm > 0 ? a.co2Kg / a.distanceKm : 0;
      const prev = prevById.get(a.id);
      const prevEff = prev && prev.distanceKm > 0 ? prev.co2Kg / prev.distanceKm : 0;

      // Calculate fuel/electricity consumption
      const fuelLiters = analysisFuelRate > 0 ? (a.distanceKm * analysisFuelRate) / 100 : 0;
      const kwhUsed = profile.evKwhPer100Km ? (a.distanceKm * parseLocaleNumber(profile.evKwhPer100Km)) / 100 : 0;
      
      return {
        id: a.id,
        rank: 0,
        name: a.name,
        rating: getRatingFromEfficiencyKgPerKm(efficiency),
        trend: getTrendLabel(efficiency, prevEff),
        co2Kg: clampRound(a.co2Kg, 1),
        efficiency: clampRound(efficiency, 2),
        distanceKm: clampRound(a.distanceKm, 0),
        trips: a.trips,
        fuelLiters: clampRound(fuelLiters, 1),
        kwhUsed: clampRound(kwhUsed, 1),
      };
    });

    const sorted = [...results].sort((a, b) => {
      if (sortBy === "distance") return b.distanceKm - a.distanceKm;
      if (sortBy === "efficiency") return b.efficiency - a.efficiency;
      return b.co2Kg - a.co2Kg;
    });

    sorted.forEach((r, idx) => {
      r.rank = idx + 1;
    });
    
    // Filter by selected project if in projects view
    const filtered = selectedProjectId && viewMode === "projects"
      ? sorted.filter(r => r.id === selectedProjectId)
      : sorted;

    // Recalculate totals based on filter
    const displayResults = filtered;
    const filteredTotalCo2 = displayResults.reduce((acc, r) => acc + r.co2Kg, 0);
    const filteredTotalDistance = displayResults.reduce((acc, r) => acc + r.distanceKm, 0);
    const filteredAvgEfficiency = filteredTotalDistance > 0 ? filteredTotalCo2 / filteredTotalDistance : 0;
    const filteredLiters = analysisFuelRate > 0 ? (filteredTotalDistance * analysisFuelRate) / 100 : 0;
    const filteredTreesNeeded = calculateTreesNeeded(filteredTotalCo2, 20);
    
    return {
      results: sorted,
      filtered: displayResults,
      totalCo2: clampRound(filteredTotalCo2, 1),
      avgEfficiency: clampRound(filteredAvgEfficiency, 2),
      fuelLiters: clampRound(filteredLiters, 1),
      treesNeeded: filteredTreesNeeded,
    };
  }, [fallbackProjectName, fallbackTripName, fuelEfficiency, fuelFactor?.kgCo2ePerLiter, gridKgCo2PerKwh, profile.evKwhPer100Km, profile.fuelLPer100Km, profile.fuelType, projects, sortBy, timeRange, trips, viewMode]);

  const handleSaveConfig = () => {
    setIsConfigured(true);
    setConfigModalOpen(false);
  };

  const handleExport = () => {
    const rows = computed.results ?? [];

    const header = [
      "rank",
      "name",
      "co2Kg",
      "efficiencyKgPerKm",
      "distanceKm",
      "trips",
      "rating",
      "trend",
    ];

    const escape = (v: unknown) => {
      const s = String(v ?? "");
      if (/[\n\r",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const lines: string[] = [];
    lines.push(header.join(","));
    for (const r of rows) {
      lines.push(
        [
          r.rank,
          r.name,
          r.co2Kg,
          r.efficiency,
          r.distanceKm,
          r.trips,
          ratingLabel(r.rating),
          trendLabel(r.trend),
        ].map(escape).join(","),
      );
    }

    // Add summary row at end
    lines.push("");
    lines.push(["total", "", computed.totalCo2, computed.avgEfficiency, "", "", "", ""].map(escape).join(","));

    const fileBase = `advanced-emissions-${timeRange}-${viewMode}-${sortBy}`;
    downloadTextFile(lines.join("\n"), `${fileBase}.csv`, "text/csv;charset=utf-8");
  };

  return (
    <MainLayout>
      <div className="max-w-[1800px] mx-auto space-y-6">
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
            <Button
              variant="outline"
              type="button"
              onClick={() => setConfigModalOpen(true)}
              className="gap-2"
              aria-label={t("advancedEmissions.configureButton")}
            >
              <Settings2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t("advancedEmissions.configureButton")}</span>
            </Button>
            <Button className="gap-2 bg-primary hover:bg-primary/90" type="button" onClick={handleExport}>
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
        ) : isLoadingEmissionsData ? (
          <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Cargando datos de emisiones...</p>
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
                <p className="text-2xl font-bold text-destructive">{computed.totalCo2} kg</p>
              </div>

              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">{t("advancedEmissions.avgEfficiency")}</span>
                  <Gauge className="w-5 h-5 text-primary" />
                </div>
                <p className="text-2xl font-bold text-primary">{computed.avgEfficiency} kg/km</p>
              </div>

              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">{t("advancedEmissions.fuelConsumption")}</span>
                  <Fuel className="w-5 h-5 text-cyan-400" />
                </div>
                <p className="text-2xl font-bold text-cyan-400">{computed.fuelLiters} L</p>
              </div>

              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">{t("advancedEmissions.treesNeeded")}</span>
                  <TreePine className="w-5 h-5 text-success" />
                </div>
                <p className="text-2xl font-bold text-success">{computed.treesNeeded}</p>
              </div>
            </div>

            {/* Results List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {tf("advancedEmissions.resultsTitle", { count: computed.filtered.length })}
                </h3>
                {viewMode === "projects" && computed.results.length > 0 && (
                  <Select value={selectedProjectId || "all"} onValueChange={(value) => setSelectedProjectId(value === "all" ? null : value)}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filtrar por proyecto..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los proyectos</SelectItem>
                      {computed.results.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {computed.filtered.length === 0 ? (
                <div className="glass-card p-8 text-center">
                  <h4 className="font-semibold">{t("advancedEmissions.noResultsTitle")}</h4>
                  <p className="text-sm text-muted-foreground mt-2">{t("advancedEmissions.noResultsBody")}</p>
                  <div className="mt-4 flex justify-center">
                    <Button variant="outline" type="button" className="gap-2" onClick={() => setConfigModalOpen(true)}>
                      <Settings2 className="w-4 h-4" />
                      {t("advancedEmissions.configureButton")}
                    </Button>
                  </div>
                </div>
              ) : (
                computed.filtered.map((result) => (
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
                          {ratingLabel(result.rating)}
                        </span>
                        <span className={cn(
                          "px-2 py-0.5 text-xs rounded-full flex items-center gap-1",
                          result.trend === "improving"
                            ? "bg-success/20 text-success"
                            : result.trend === "worsening"
                              ? "bg-destructive/20 text-destructive"
                              : "bg-secondary/40 text-muted-foreground"
                        )}>
                          {result.trend === "improving" ? "↓" : result.trend === "worsening" ? "↑" : "→"} {trendLabel(result.trend)}
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
                        {profile.fuelType !== "ev" && result.fuelLiters !== undefined && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">{t("advancedEmissions.fuelConsumption")}</p>
                            <p className="text-lg font-semibold">{result.fuelLiters} L</p>
                          </div>
                        )}
                        {profile.fuelType === "ev" && result.kwhUsed !== undefined && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">{t("advancedEmissions.electricConsumption")}</p>
                            <p className="text-lg font-semibold">{result.kwhUsed} kWh</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Configuration Modal */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("advancedEmissions.configTitle")}</DialogTitle>
            <DialogDescription>{t("advancedEmissions.configSubtitle")}</DialogDescription>
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
                    <SelectItem value="all">{t("advancedEmissions.allTime")}</SelectItem>
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
