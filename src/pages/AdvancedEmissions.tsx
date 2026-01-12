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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Settings2,
  Download,
  Info,
  Loader2,
  FileSpreadsheet,
  FileText,
  File as FileIcon,
  ChevronsDown,
  Search,
  Clock,
  Filter,
  ArrowUpNarrowWide,
  ArrowDownWideNarrow,
  Calendar,
  Layers,
  Users,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n";
import { useTrips } from "@/contexts/TripsContext";
import { useProjects } from "@/contexts/ProjectsContext";
import { calculateTreesNeeded, calculateTripEmissions } from "@/lib/emissions";
import { useEmissionsInput } from "@/hooks/use-emissions-input";

type EmissionsResult = {
  id: string;
  rank: number;
  name: string;
  co2Kg: number;
  distanceKm: number;
  trips: number;
  passengers: number;
  earliestDateMs?: number | null;
  latestDateMs?: number | null;
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
  } else if (timeRange === "6months") {
    start.setDate(start.getDate() - 180);
    prevEnd.setDate(prevEnd.getDate() - 180);
    prevStart.setDate(prevStart.getDate() - 360);
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

const ADV_EMISSIONS_CONFIG_KEY = "advancedEmissions:config:v3";
const ITEMS_PER_PAGE = 5;

function loadAdvancedEmissionsConfig(): {
  viewMode: string;
  sortBy: string;
  sortDirection: "asc" | "desc";
  timeRange: string;
} {
  try {
    if (typeof window === "undefined") {
      return { viewMode: "projects", sortBy: "co2", sortDirection: "desc", timeRange: "all" };
    }
    const raw = window.localStorage.getItem(ADV_EMISSIONS_CONFIG_KEY);
    if (!raw) {
      return { viewMode: "projects", sortBy: "co2", sortDirection: "desc", timeRange: "all" };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { viewMode: "projects", sortBy: "co2", sortDirection: "desc", timeRange: "all" };
    }

    const rawSortBy = typeof (parsed as any).sortBy === "string" ? (parsed as any).sortBy : "co2";
    const sortBy = rawSortBy === "efficiency" ? "co2" : rawSortBy;

    return {
      viewMode: typeof (parsed as any).viewMode === "string" ? (parsed as any).viewMode : "projects",
      sortBy,
      sortDirection: (parsed as any).sortDirection === "asc" ? "asc" : "desc",
      timeRange: typeof (parsed as any).timeRange === "string" ? (parsed as any).timeRange : "all",
    };
  } catch {
    return { viewMode: "projects", sortBy: "co2", sortDirection: "desc", timeRange: "all" };
  }
}

export default function AdvancedEmissions() {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const { trips } = useTrips();
  const { projects } = useProjects();
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  const { emissionsInput: baseEmissionsInput, isLoading: isLoadingEmissionsData } = useEmissionsInput();

  const numberFormatter0 = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    [locale],
  );

  const kgFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 1 }),
    [locale],
  );

  const fallbackTripName = t("advancedEmissions.fallbackTripName");
  const fallbackProjectName = t("advancedEmissions.fallbackProjectName");

  const [configModalOpen, setConfigModalOpen] = useState(false);

  // Configuration state
  const [viewMode, setViewMode] = useState(() => loadAdvancedEmissionsConfig().viewMode);
  const [sortBy, setSortBy] = useState(() => loadAdvancedEmissionsConfig().sortBy);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(() => loadAdvancedEmissionsConfig().sortDirection);
  const [timeRange, setTimeRange] = useState(() => loadAdvancedEmissionsConfig().timeRange);
  const [searchTerm, setSearchTerm] = useState("");

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [searchTerm, sortBy, sortDirection, timeRange, viewMode]);

  // Clean up old localStorage key on mount
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem("advancedEmissions:config:v1");
      window.localStorage.removeItem("advancedEmissions:config:v2");
    } catch {
      // Ignore localStorage errors (e.g., private browsing)
    }
  }, []);


  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(
        ADV_EMISSIONS_CONFIG_KEY,
        JSON.stringify({ viewMode, sortBy, sortDirection, timeRange })
      );
    } catch {
      // ignore
    }
  }, [sortBy, sortDirection, timeRange, viewMode]);

  const computed = useMemo(() => {
    const now = new Date();
    const { start, end } = getRange(now, timeRange);

    const projectNameById = new Map(projects.map((p) => [p.id, p.name] as const));

    const sumTripCo2 = (distanceKm: number, fuelLiters?: number | null, evKwhUsed?: number | null) =>
      calculateTripEmissions({
        distanceKm,
        fuelLiters,
        evKwhUsed,
        ...baseEmissionsInput,
      }).co2Kg;

    const inRange = (d: Date) => d >= start && d <= end;

    const currentTrips = trips.filter((tr) => {
      const dt = parseTripDate(tr.date);
      return dt ? inRange(dt) : false;
    });

    type Agg = {
      id: string;
      name: string;
      co2Kg: number;
      distanceKm: number;
      trips: number;
      passengers: number;
      earliestDateMs: number | null;
      latestDateMs: number | null;
    };

    const aggregate = (source: typeof trips) => {
      const map = new Map<string, Agg>();
      for (const tr of source) {
        const distance = Number.isFinite(Number(tr.distance)) ? Number(tr.distance) : 0;
        const co2 = sumTripCo2(distance, tr.fuelLiters, tr.evKwhUsed);
        const passengers = Math.max(0, Math.floor(Number.isFinite(Number(tr.passengers)) ? Number(tr.passengers) : 0));
        const dt = parseTripDate(tr.date);
        const dtMs = dt ? dt.getTime() : null;

        if (viewMode === "all") {
          const key = tr.id;
          const name = tr.project || fallbackTripName;
          const cur = map.get(key) ?? { id: key, name, co2Kg: 0, distanceKm: 0, trips: 0, passengers: 0, earliestDateMs: null, latestDateMs: null };
          cur.co2Kg += co2;
          cur.distanceKm += distance;
          cur.trips += 1;
          cur.passengers += passengers;
          if (dtMs != null && (cur.earliestDateMs == null || dtMs < cur.earliestDateMs)) cur.earliestDateMs = dtMs;
          if (dtMs != null && (cur.latestDateMs == null || dtMs > cur.latestDateMs)) cur.latestDateMs = dtMs;
          map.set(key, cur);
        } else {
          const key = tr.projectId || (tr.project || "unknown").trim().toLowerCase();
          const resolvedName = tr.projectId ? (projectNameById.get(tr.projectId) ?? tr.project) : tr.project;
          const name = resolvedName || fallbackProjectName;
          const cur = map.get(key) ?? { id: String(key), name, co2Kg: 0, distanceKm: 0, trips: 0, passengers: 0, earliestDateMs: null, latestDateMs: null };
          cur.co2Kg += co2;
          cur.distanceKm += distance;
          cur.trips += 1;
          cur.passengers += passengers;
          if (dtMs != null && (cur.earliestDateMs == null || dtMs < cur.earliestDateMs)) cur.earliestDateMs = dtMs;
          if (dtMs != null && (cur.latestDateMs == null || dtMs > cur.latestDateMs)) cur.latestDateMs = dtMs;
          map.set(key, cur);
        }
      }
      return Array.from(map.values());
    };

    const curAgg = aggregate(currentTrips);

    const results: EmissionsResult[] = curAgg.map((a) => ({
      id: a.id,
      rank: 0,
      name: a.name,
      co2Kg: clampRound(a.co2Kg, 1),
      distanceKm: clampRound(a.distanceKm, 0),
      trips: a.trips,
      passengers: a.passengers,
      earliestDateMs: a.earliestDateMs,
      latestDateMs: a.latestDateMs,
    }));

    const compare = (aVal: number, bVal: number) => (sortDirection === "asc" ? aVal - bVal : bVal - aVal);

    const sorted = [...results].sort((a, b) => {
      if (sortBy === "distance") return compare(a.distanceKm, b.distanceKm);
      return compare(a.co2Kg, b.co2Kg);
    });

    sorted.forEach((r, idx) => {
      r.rank = idx + 1;
    });
    
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const filtered = normalizedSearch
      ? sorted.filter((r) => r.name.toLowerCase().includes(normalizedSearch))
      : sorted;

    // Totals are based on the full (time-range) dataset, not the search filter.
    const rawTotalCo2 = curAgg.reduce((acc, a) => acc + a.co2Kg, 0);
    const rawTotalDistance = curAgg.reduce((acc, a) => acc + a.distanceKm, 0);
    const treesNeeded = calculateTreesNeeded(rawTotalCo2, 20);
    
    return {
      results: sorted,
      filtered,
      totalCo2: clampRound(rawTotalCo2, 1),
      totalDistanceKm: clampRound(rawTotalDistance, 0),
      treesNeeded,
    };
  }, [baseEmissionsInput, fallbackProjectName, fallbackTripName, projects, sortBy, sortDirection, timeRange, trips, viewMode, searchTerm]);

  const maxCo2Kg = useMemo(
    () => computed.filtered.reduce((max, r) => Math.max(max, r.co2Kg), 0),
    [computed.filtered],
  );

  const toggleSortDirection = () => {
    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const resetFilters = () => {
    setSearchTerm("");
    setTimeRange("all");
  };

  const treeWord = computed.treesNeeded === 1
    ? t("advancedEmissions.treeSingular")
    : t("advancedEmissions.treePlural");

  const getExportData = () => {
    const rows = computed.filtered ?? [];
    return rows.map(r => ({
      Rank: r.rank,
      Name: r.name,
      "CO2 (kg)": r.co2Kg,
      "Distance (km)": r.distanceKm,
      Trips: r.trips,
      Passengers: r.passengers,
    }));
  };

  const handleExportCsv = () => {
    const data = getExportData();
    if (data.length === 0) return;
    
    const header = Object.keys(data[0]);
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      if (/[\n\r",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const lines = [
      header.map(escape).join(","),
      ...data.map(row => Object.values(row).map(escape).join(","))
    ];

    const fileBase = `advanced-emissions-${timeRange}-${viewMode}-${sortBy}-${sortDirection}`;
    downloadTextFile(lines.join("\n"), `${fileBase}.csv`, "text/csv;charset=utf-8");
  };

  const handleExportExcel = () => {
    const data = getExportData();
    if (data.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Emissions");
    
    const fileBase = `advanced-emissions-${timeRange}-${viewMode}-${sortBy}-${sortDirection}`;
    XLSX.writeFile(workbook, `${fileBase}.xlsx`);
  };

  const handleExportPdf = () => {
    const rows = computed.filtered ?? [];
    if (rows.length === 0) return;

    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.text(t("advancedEmissions.pageTitle"), 14, 22);
    
    doc.setFontSize(11);
    doc.text(`${t("advancedEmissions.timeRange")}: ${timeRange}`, 14, 30);
    doc.text(`Total CO2: ${computed.totalCo2} kg`, 14, 36);

    const tableHeaders = [["Rank", "Name", "CO2 (kg)", "Dist (km)", "Trips", "Passengers"]];

    const tableData = rows.map(r => [
      r.rank,
      r.name,
      r.co2Kg,
      r.distanceKm,
      r.trips,
      r.passengers,
    ]);

    autoTable(doc, {
      head: tableHeaders,
      body: tableData,
      startY: 44,
    });

    const fileBase = `advanced-emissions-${timeRange}-${viewMode}-${sortBy}-${sortDirection}`;
    doc.save(`${fileBase}.pdf`);
  };

  return (
    <MainLayout>
      <div className="page-container flex flex-col">
        {/* Header */}
        <div className="glass-panel p-6 md:p-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-fade-in">
          <div className="flex min-w-0 items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/advanced")} className="shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold leading-tight tracking-tight">
                {t("advancedEmissions.pageTitle")}
              </h1>
              <p className="text-muted-foreground mt-1 text-xs sm:text-sm leading-snug sm:leading-normal">
                {t("advancedEmissions.pageSubtitle")}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 sm:gap-3 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setConfigModalOpen(true)}
              className="gap-2"
              aria-label={t("advancedEmissions.configureButton")}
            >
              <Settings2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t("advancedEmissions.configureButton")}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="gap-2 bg-primary hover:bg-primary/90" type="button">
                  <Download className="w-4 h-4" />
                  {t("advancedEmissions.export")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportExcel} className="gap-2 cursor-pointer">
                  <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                  <span>Excel (.xlsx)</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf} className="gap-2 cursor-pointer">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span>PDF (.pdf)</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportCsv} className="gap-2 cursor-pointer">
                  <FileIcon className="w-4 h-4 text-gray-500" />
                  <span>CSV (.csv)</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div>
          {isLoadingEmissionsData ? (
            <div className="flex flex-col items-center justify-center h-full animate-fade-in">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Cargando datos de emisiones...</p>
            </div>
          ) : (
            /* Results State */
            <div className="flex flex-col gap-6 animate-fade-in">
              {/* 1) Total + compensation */}
              <div className="grid gap-6 lg:grid-cols-2">
                <section className="relative overflow-hidden p-6 sm:p-8 glass-card h-full">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-primary/20 blur-[80px] rounded-full" />
                  <div className="absolute bottom-0 left-0 w-40 h-40 bg-white/5 blur-[80px] rounded-full" />
                  <div className="relative z-10 text-center">
                    <p className="text-primary text-[10px] font-black uppercase tracking-[0.3em] mb-4">
                      {t("advancedEmissions.totalFootprintTitle")}
                    </p>
                    <div className="flex flex-col items-center leading-none">
                      <h2 className="text-6xl sm:text-7xl font-black tracking-tighter">
                        {kgFormatter.format(computed.totalCo2)}
                      </h2>
                      <span className="text-base sm:text-lg text-muted-foreground font-light mt-2 tracking-widest uppercase">
                        {t("advancedEmissions.totalFootprintUnit")}
                      </span>
                    </div>
                  </div>
                </section>

                <section className="relative overflow-hidden p-6 sm:p-8 glass-card h-full">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 blur-[80px] rounded-full" />
                  <div className="absolute bottom-0 left-0 w-40 h-40 bg-primary/10 blur-[80px] rounded-full" />
                  <div className="relative z-10 text-center">
                    <p className="text-foreground text-[10px] font-black uppercase tracking-[0.3em] mb-4">
                      {t("advancedEmissions.compensationTitle")}
                    </p>
                    <div className="flex flex-col items-center leading-none">
                      <h2 className="text-6xl sm:text-7xl font-black tracking-tighter">
                        {numberFormatter0.format(computed.treesNeeded)}
                      </h2>
                      <span className="text-base sm:text-lg text-muted-foreground font-light mt-2 tracking-widest uppercase">
                        {treeWord}
                      </span>
                    </div>
                  </div>
                </section>
              </div>

            {/* 3) Analysis controls */}
            <section className="space-y-3 shrink-0">
              <div className="flex flex-col lg:flex-row gap-3">
                <div className="relative flex-1 group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={16} />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t("advancedEmissions.searchPlaceholder")}
                    className="h-[46px] pl-11 bg-secondary/50 border-border/70 focus-visible:ring-0 focus-visible:border-primary/50"
                  />
                </div>

                <div className="relative group lg:w-60">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={16} />
                  <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger className="h-[46px] pl-11 bg-secondary/50 border-border/70 uppercase text-[10px] font-bold tracking-wider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("advancedEmissions.allTime")}</SelectItem>
                      <SelectItem value="7days">{t("advancedEmissions.last7Days")}</SelectItem>
                      <SelectItem value="30days">{t("advancedEmissions.last30Days")}</SelectItem>
                      <SelectItem value="90days">{t("advancedEmissions.last90Days")}</SelectItem>
                      <SelectItem value="6months">{t("advancedEmissions.last6Months")}</SelectItem>
                      <SelectItem value="year">{t("advancedEmissions.thisYear")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="relative group lg:w-60">
                  <Layers className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={16} />
                  <Select value={viewMode} onValueChange={setViewMode}>
                    <SelectTrigger className="h-[46px] pl-11 bg-secondary/50 border-border/70 uppercase text-[10px] font-bold tracking-wider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="projects">{t("advancedEmissions.viewModeProjectsOnly")}</SelectItem>
                      <SelectItem value="all">{t("advancedEmissions.viewModeAllTrips")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* 4) Breakdown */}
            <section className="glass-card overflow-hidden shadow-xl flex flex-col min-h-0 flex-1">
              <div className="p-6 border-b border-border/70 bg-secondary/20 flex justify-between items-center">
                <h3 className="text-foreground font-bold text-sm tracking-tight flex items-center gap-2">
                  <Filter size={16} className="text-primary" />
                  {viewMode === "all" ? t("advancedEmissions.breakdownTitleTrips") : t("advancedEmissions.breakdownTitle")}
                </h3>

                <Button
                  variant="outline"
                  size="icon"
                  type="button"
                  onClick={toggleSortDirection}
                  aria-label={sortDirection === "asc" ? t("advancedEmissions.sortDirectionAsc") : t("advancedEmissions.sortDirectionDesc")}
                  title={sortDirection === "asc" ? t("advancedEmissions.sortDirectionAsc") : t("advancedEmissions.sortDirectionDesc")}
                  className="bg-background/40"
                >
                  {sortDirection === "asc" ? (
                    <ArrowUpNarrowWide className="w-4 h-4 text-primary" />
                  ) : (
                    <ArrowDownWideNarrow className="w-4 h-4 text-primary" />
                  )}
                </Button>
              </div>

              <div className="p-4 space-y-2">
                {computed.results.length === 0 ? (
                  <div className="p-12 text-center">
                    <h4 className="font-semibold">{t("advancedEmissions.noResultsTitle")}</h4>
                    <p className="text-sm text-muted-foreground mt-2">{t("advancedEmissions.noResultsBody")}</p>
                    <div className="mt-4 flex justify-center">
                      <Button variant="outline" type="button" className="gap-2" onClick={() => setConfigModalOpen(true)}>
                        <Settings2 className="w-4 h-4" />
                        {t("advancedEmissions.configureButton")}
                      </Button>
                    </div>
                  </div>
                ) : computed.filtered.length === 0 ? (
                  <div className="p-16 text-center">
                    <Search size={32} className="text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">
                      {t("advancedEmissions.noFilterResultsTitle")}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">{t("advancedEmissions.noFilterResultsBody")}</p>
                    <button
                      onClick={resetFilters}
                      className="mt-4 text-[10px] text-primary font-black uppercase hover:text-primary/80 transition-colors underline decoration-2 underline-offset-4"
                    >
                      {t("advancedEmissions.resetFilters")}
                    </button>
                  </div>
                ) : (
                  <>
                    {computed.filtered.slice(0, visibleCount).map((result, idx) => (
                      <div
                        key={result.id}
                        className="flex items-center gap-4 p-4 hover:bg-secondary/30 rounded-md transition-all group relative overflow-hidden"
                      >
                        <div className="w-8 h-8 rounded-[5px] bg-secondary/60 flex items-center justify-center font-black text-[10px] text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                          {idx + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between mb-3 items-center">
                            <div className="min-w-0">
                              <h4 className="text-foreground font-bold text-sm truncate group-hover:translate-x-1 transition-transform">
                                {result.name}
                              </h4>
                              <div className="flex items-center gap-3 mt-1.5">
                                {(() => {
                                  const ms = result.latestDateMs;
                                  const startMs = result.earliestDateMs;
                                  if (!ms && !startMs) return null;

                                  const formatShort = (value: number) =>
                                    new Date(value).toLocaleDateString(locale, { day: "2-digit", month: "short" });

                                  const formatShortWithYear = (value: number) =>
                                    new Date(value).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });

                                  let label: string;
                                  if (viewMode === "projects" && startMs && ms) {
                                    const start = new Date(startMs);
                                    const end = new Date(ms);
                                    label = start.getFullYear() === end.getFullYear()
                                      ? `${formatShort(startMs)} - ${formatShort(ms)}`
                                      : `${formatShortWithYear(startMs)} - ${formatShortWithYear(ms)}`;
                                  } else {
                                    label = formatShort(ms ?? startMs!);
                                  }

                                  return (
                                    <span className="text-[9px] text-muted-foreground flex items-center gap-1 bg-secondary/40 px-2 py-0.5 rounded-[3px]">
                                      <Calendar size={10} className="text-primary/70" /> {label}
                                    </span>
                                  );
                                })()}
                                <span className="text-[9px] text-muted-foreground flex items-center gap-1 font-medium">
                                  <Layers size={10} /> {result.trips} {t("advancedEmissions.tripsLabel")}
                                </span>
                                <span className="text-[9px] text-muted-foreground flex items-center gap-1 font-medium">
                                  <Users size={10} /> {result.passengers} {t("trips.passengers")}
                                </span>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-foreground font-black text-sm tracking-tight">
                                {kgFormatter.format(result.co2Kg)}{" "}
                                <span className="text-[10px] text-muted-foreground font-normal">kg</span>
                              </div>
                              <div className="text-[8px] text-primary font-black mt-1 uppercase tracking-tighter">
                                {t("advancedEmissions.co2TotalLabel")}
                              </div>
                            </div>
                          </div>

                            <div className="w-full bg-secondary/40 h-1.5 rounded-full overflow-hidden p-[1px]">
                              <div
                              className="h-full rounded-full bg-white/30 transition-all duration-700 ease-out"
                              style={{ width: `${maxCo2Kg > 0 ? Math.max(3, Math.min(100, (result.co2Kg / maxCo2Kg) * 100)) : 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    {computed.filtered.length > visibleCount && (
                      <button
                        onClick={() => setVisibleCount((prev) => prev + ITEMS_PER_PAGE)}
                        className="w-full flex items-center justify-center gap-2 text-sm text-primary hover:text-primary/80 font-medium py-3 rounded-md hover:bg-muted/50 transition-colors"
                      >
                        <ChevronsDown className="w-4 h-4" />
                        {t("trips.loadMore")} ({computed.filtered.length - visibleCount} {t("advancedCosts.remaining")})
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>
            </div>
          )}
        </div>
      </div>

      {/* Configuration Modal */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("advancedEmissions.configTitle")}</DialogTitle>
            <DialogDescription>{t("advancedEmissions.configSubtitle")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
                      <SelectItem value="distance">{t("advancedEmissions.sortByDistance")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t("advancedEmissions.sortByHelp")}
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
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
