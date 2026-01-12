import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  AlertTriangle,
  Check,
  Trash2,
  Calendar,
  ChevronsDown,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useTrips } from "@/contexts/TripsContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useReports } from "@/contexts/ReportsContext";
import { useI18n } from "@/hooks/use-i18n";

interface TripWarning {
  tripId: string;
  date: string;
  route: string;
  warning: string;
}

// Reports are stored locally when generated.

/* Mock data (unused)
const mockWarnings: TripWarning[] = [
  {
    tripId: "4",
    date: "12-01-2024",
    route: "Berlin HQ → Hamburg",
    warning: "Distancia inusual detectada",
  },
];

// Mock report data for viewing
const mockReportTrips = [
  {
    date: "19-11-2019",
    project: "Fundbox",
    producer: "",
    route: ["Laurenzgasse, 6/31, Wien, Austria", "Stadtpark, Parkring 1, 1010 Wien, Austria", "Josefsgasse 12, 1080 Wien, Austria", "Mattiellistraße 2, 1040 Wien, Austria", "Lichtenfelsgasse & Rathausplatz, 1010 Wien, Austria", "Laurenzgasse, 6/31, Wien, Austria"],
    passengers: 0,
    distance: 14.5,
  },
  {
    date: "19-11-2019",
    project: "Fundbox",
    producer: "",
    route: ["Laurenzgasse, 6/31, Wien, Austria", "Stadtpark, Parkring 1, 1010 Wien, Austria", "Josefsgasse 12, 1080 Wien, Austria", "Mattiellistraße 2, 1040 Wien, Austria", "Lichtenfelsgasse & Rathausplatz, 1010 Wien, Austria", "Laurenzgasse, 6/31, Wien, Austria"],
    passengers: 0,
    distance: 14.5,
  },
  {
    date: "06-05-2024",
    project: "HOFER PREIS 2024",
    producer: "ovi office e.U.",
    route: ["Laurenzgasse, 6/31, Wien, Austria", "Rustenschacherallee 9, 1020 Wien, Austria", "Rustenschacherallee 32, 1020 Wien, Austria", "Laurenzgasse, 6/31, Wien, Austria"],
    passengers: 0,
    distance: 16.7,
  },
  {
    date: "07-05-2024",
    project: "HOFER PREIS 2024",
    producer: "ovi office e.U.",
    route: ["Laurenzgasse, 6/31, Wien, Austria", "Erzbischofgasse 13, 1130 Wien, Austria", "Erzbischofgasse 13, 1130 Wien, Austria", "Laurenzgasse, 6/31, Wien, Austria"],
    passengers: 0,
    distance: 19.0,
  },
  {
    date: "07-05-2024",
    project: "HOFER PREIS 2024",
    producer: "ovi office e.U.",
    route: ["Laurenzgasse, 6/31, Wien, Austria", "Erzbischofgasse 6C, 1130 Wien, Austria", "Erzbischofgasse 8, 1130 Wien, Austria", "Laurenzgasse, 6/31, Wien, Austria"],
    passengers: 0,
    distance: 18.8,
  },
  {
    date: "08-05-2024",
    project: "HOFER PREIS 2024",
    producer: "ovi office e.U.",
    route: ["Laurenzgasse, 6/31, Wien, Austria", "Nottendorfer G. 2, 1030 Wien, Austria", "Högelmüllergasse 15/8, 1050 Wien, Austria", "Laurenzgasse, 6/31, Wien, Austria"],
    passengers: 0,
    distance: 14.9,
  },
  {
    date: "19-11-2024",
    project: "Fundbox",
    producer: "",
    route: ["Laurenzgasse, 6/31, Wien, Austria", "Stadtpark, Parkring 1, 1010 Wien, Austria", "Opernring 2, 1010 Wien, Austria", "Vienna, Austria", "Vienna, Austria", "Laurenzgasse, 6/31, Wien, Austria"],
    passengers: 0,
    distance: 8.9,
  },
];
*/

export default function Reports() {
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const { t, tf, locale } = useI18n();
  const { trips } = useTrips();
  const { reports, deleteReport } = useReports();

  const startDateRef = useRef<HTMLInputElement | null>(null);
  const endDateRef = useRef<HTMLInputElement | null>(null);

  const openDatePicker = (ref: React.RefObject<HTMLInputElement | null>) => {
    const el = ref.current;
    if (!el) return;
    // showPicker() exists in Chromium-based browsers.
    (el as any).showPicker?.();
    el.focus();
  };

  const [selectedProject, setSelectedProject] = useState("all");
  
  // Pagination state - show 5 reports initially
  const ITEMS_PER_PAGE = 5;
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  
  // Validate selectedProject against trips list
  useEffect(() => {
    if (selectedProject === "all") return;
    
    // Get unique projects from trips
    const uniqueProjects = Array.from(
      new Set(trips.map((t) => t.project).map((p) => p.trim()).filter(Boolean))
    );
    
    if (uniqueProjects.length > 0 && !uniqueProjects.includes(selectedProject)) {
       setSelectedProject("all");
    }
  }, [selectedProject, trips]);
  const [reportType, setReportType] = useState<"filmcrew" | "general">("filmcrew");
  const toDateInputValue = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const now = new Date();
  const defaultStart = toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  const defaultEnd = toDateInputValue(now);

  const [startDate, setStartDate] = useState<string>(defaultStart);
  const [endDate, setEndDate] = useState<string>(defaultEnd);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [warnings, setWarnings] = useState<TripWarning[]>([]);
  const { toast } = useToast();

  const getTripTime = (date: string) => {
    const time = Date.parse(date);
    return Number.isFinite(time) ? time : 0;
  };

  const getDateOnlyTime = (dateOnly: string, endOfDay: boolean) => {
    if (!dateOnly) return null;
    const isoLocal = `${dateOnly}T${endOfDay ? "23:59:59.999" : "00:00:00"}`;
    const time = Date.parse(isoLocal);
    return Number.isFinite(time) ? time : null;
  };

  const formatDateShort = (dateOnly: string) =>
    new Date(`${dateOnly}T00:00:00`).toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const getSelectionRangeLabel = (rangeStart: string, rangeEnd: string) => {
    if (rangeStart && rangeEnd) return `${formatDateShort(rangeStart)} - ${formatDateShort(rangeEnd)}`;
    if (rangeStart && !rangeEnd) return `${formatDateShort(rangeStart)} - `;
    if (!rangeStart && rangeEnd) return ` - ${formatDateShort(rangeEnd)}`;
    return "";
  };

  const isRangeValid = () => {
    const startTime = getDateOnlyTime(startDate, false);
    const endTime = getDateOnlyTime(endDate, true);
    if (startTime == null || endTime == null) return true;
    return startTime <= endTime;
  };

  const getTripsForSelection = () => {
    const startTime = getDateOnlyTime(startDate, false);
    const endTime = getDateOnlyTime(endDate, true);

    return trips
      .filter((t) => {
        const time = getTripTime(t.date);
        if (!time) return false;

        const matchesPeriod =
          (startTime == null || time >= startTime) &&
          (endTime == null || time <= endTime);
        const matchesProject = selectedProject === "all" || t.project === selectedProject;
        return matchesPeriod && matchesProject;
      })
      .sort((a, b) => getTripTime(a.date) - getTripTime(b.date) || a.id.localeCompare(b.id));
  };

  const handleGenerateClick = () => {
    if (!isRangeValid()) {
      toast({
        title: t("reports.toastInvalidRangeTitle"),
        description: t("reports.toastInvalidRangeBody"),
      });
      return;
    }

    const selectedTrips = getTripsForSelection();
    const nextWarnings: TripWarning[] = [];

    selectedTrips.forEach((trip) => {
      const time = getTripTime(trip.date);
      const formattedDate = time
        ? new Date(time).toLocaleDateString(locale, {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })
        : trip.date;

      if (!Number.isFinite(trip.distance) || trip.distance <= 0) {
        nextWarnings.push({
          tripId: trip.id,
          date: formattedDate,
          route: trip.route.join(" -> "),
          warning: t("reports.warningZeroDistance"),
        });
      }

      if (trip.distance > 1500) {
        nextWarnings.push({
          tripId: trip.id,
          date: formattedDate,
          route: trip.route.join(" -> "),
          warning: t("reports.warningImprobableDistance"),
        });
      }

      if (!trip.purpose?.trim()) {
        nextWarnings.push({
          tripId: trip.id,
          date: formattedDate,
          route: trip.route.join(" -> "),
          warning: t("reports.warningMissingPurpose"),
        });
      }
    });

    setWarnings(nextWarnings);
    setVerificationModalOpen(true);
  };

  const handleGenerateReport = () => {
    setVerificationModalOpen(false);
    if (!isRangeValid()) {
      toast({
        title: t("reports.toastInvalidRangeTitle"),
        description: t("reports.toastInvalidRangeBody"),
      });
      return;
    }

    const selectedTrips = getTripsForSelection();

    const effectiveStartDate = startDate || (selectedTrips[0]?.date ? new Date(getTripTime(selectedTrips[0].date)).toISOString().slice(0, 10) : "");
    const effectiveEndDate = endDate || (selectedTrips[selectedTrips.length - 1]?.date ? new Date(getTripTime(selectedTrips[selectedTrips.length - 1].date)).toISOString().slice(0, 10) : "");
    const periodLabel = getSelectionRangeLabel(effectiveStartDate, effectiveEndDate);

    toast({
      title: t("reports.toastGeneratedTitle"),
      description: t("reports.toastGeneratedBody"),
    });
    const params = new URLSearchParams({
      period: periodLabel,
      driver: profile.fullName,
      address: [profile.baseAddress, profile.city].filter(Boolean).join(", "),
      licensePlate: profile.licensePlate,
      project: selectedProject,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      trips: String(selectedTrips.length),
      reportType: reportType,
    });
    navigate(`/reports/view?${params.toString()}`);
  };

  const navigateToReportView = (id: string) => {
    navigate(`/reports/view?reportId=${encodeURIComponent(id)}`);
  };

  const getProjectName = (value: string) => {
    return value === "all" ? t("reports.allProjects") : value;
  };

  return (
    <MainLayout>
      <div className="page-container">
        {/* Header */}
        <div className="glass-panel p-6 md:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6 animate-fade-in">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              {t("reports.title")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("reports.subtitle")}
            </p>
          </div>
        </div>

        {/* Report Generator */}
        <div className="glass-card p-6 animate-fade-in animation-delay-100">
          <h2 className="font-semibold text-lg mb-4">{t("reports.generateNew")}</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <div className="space-y-2">
              <Label>{t("reports.project")}</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder={t("reports.selectProject")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("reports.allProjects")}</SelectItem>
                  {Array.from(
                    new Set(trips.map((t) => t.project).map((p) => p.trim()).filter(Boolean))
                  )
                    .sort((a, b) => a.localeCompare(b))
                    .map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("reports.reportType")}</Label>
              <Select value={reportType} onValueChange={(v) => setReportType(v as "filmcrew" | "general")}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="filmcrew">{t("reports.reportTypeFilmCrew")}</SelectItem>
                  <SelectItem value="general">{t("reports.reportTypeGeneral")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>{t("reports.from")}</Label>
              <div className="relative">
                <button
                  type="button"
                  aria-label={t("reports.from")}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-white"
                  onClick={() => openDatePicker(startDateRef)}
                >
                  <Calendar className="w-4 h-4" />
                </button>
                <Input
                  ref={startDateRef}
                  type="date"
                  className="bg-transparent border-b border-border text-left pl-9 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>{t("reports.to")}</Label>
              <div className="relative">
                <button
                  type="button"
                  aria-label={t("reports.to")}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-white"
                  onClick={() => openDatePicker(endDateRef)}
                >
                  <Calendar className="w-4 h-4" />
                </button>
                <Input
                  ref={endDateRef}
                  type="date"
                  className="bg-transparent border-b border-border text-left pl-9 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-end">
              <Button className="w-full" onClick={handleGenerateClick}>
                <FileText className="w-4 h-4" />
                {t("reports.generateReport")}
              </Button>
            </div>
          </div>
        </div>

        {/* Reports Table */}
        <div className="glass-card overflow-hidden animate-fade-in animation-delay-200">
          <div className={reports.length > 8 ? "overflow-x-auto overflow-y-auto max-h-[32rem]" : "overflow-x-auto"}>
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left py-3 px-4 w-12">
                    <Checkbox />
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase text-muted-foreground whitespace-nowrap">
                    {t("reports.tableGeneratedAt")}
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase text-muted-foreground whitespace-nowrap">
                    {t("reports.tablePeriod")}
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                    {t("reports.project")}
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold uppercase text-muted-foreground whitespace-nowrap">
                    {t("reports.tableActions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {reports.slice(0, visibleCount).map((report) => (
                  <tr key={report.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="py-4 px-4">
                      <Checkbox />
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      {new Date(report.createdAt).toLocaleDateString(locale, {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      {new Date(`${report.startDate}T00:00:00`).toLocaleDateString(locale, {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}{" "}
                      -{" "}
                      {new Date(`${report.endDate}T00:00:00`).toLocaleDateString(locale, {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-4 px-4 hidden sm:table-cell">
                      {getProjectName(report.project)}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="link"
                          size="sm"
                          className="text-primary h-auto p-0"
                          onClick={() => navigateToReportView(report.id)}
                        >
                          {t("reports.view")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive h-8 w-8"
                          onClick={() => deleteReport(report.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Load More Button */}
          {reports.length > visibleCount && (
            <div className="p-4 border-t border-border/50">
              <button
                onClick={() => setVisibleCount(prev => prev + ITEMS_PER_PAGE)}
                className="w-full flex items-center justify-center gap-2 text-sm text-primary hover:text-primary/80 font-medium py-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                <ChevronsDown className="w-4 h-4" />
                {t("trips.loadMore")} ({reports.length - visibleCount} {t("advancedCosts.remaining")})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Verification Modal */}
      <Dialog open={verificationModalOpen} onOpenChange={setVerificationModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("reports.verifyTitle")}</DialogTitle>
            <DialogDescription className="sr-only">{t("reports.verifyTitle")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <h4 className="font-semibold text-sm mb-2">{t("reports.verifyChecklistTitle")}</h4>
              <p className="text-sm text-muted-foreground">{t("reports.verifyChecklistBody")}</p>
            </div>

            {warnings.length === 0 ? (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-success/10 border border-success/30">
                <Check className="w-5 h-5 text-success shrink-0" />
                <p className="text-sm text-success">{t("reports.verifyNoProblems")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-warning">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    {tf("reports.verifyFoundWarnings", { count: warnings.length })}
                  </span>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {warnings.map((warning, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/30"
                    >
                      <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium">{warning.route}</p>
                        <p className="text-muted-foreground text-xs">
                          {warning.date} - {warning.warning}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t("reports.verifyContinueOrReview")}</p>
              </div>
            )}

            <div className="hidden">
            <div>
              <h4 className="font-semibold text-sm mb-2">Lista de verificación pre-exportación</h4>
              <p className="text-sm text-muted-foreground">
                El sistema ha revisado los viajes del período seleccionado en busca de posibles problemas.
              </p>
            </div>

            {warnings.length === 0 ? (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-success/10 border border-success/30">
                <Check className="w-5 h-5 text-success shrink-0" />
                <p className="text-sm text-success">
                  No se encontraron problemas potenciales. Listo para generar.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-warning">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Se encontraron {warnings.length} advertencia(s)
                  </span>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {warnings.map((warning, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/30"
                    >
                      <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium">{warning.route}</p>
                        <p className="text-muted-foreground text-xs">
                          {warning.date} - {warning.warning}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Puedes continuar con la generación del informe o revisar los viajes antes.
                </p>
              </div>
            )}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setVerificationModalOpen(false)}>
              {t("reports.back")}
            </Button>
            <Button className="flex-1" onClick={handleGenerateReport}>
              {t("reports.generateReport")}
            </Button>
          </div>

          <div className="hidden flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setVerificationModalOpen(false)}
            >
              {t("reports.back")}
            </Button>
            <Button
              className="flex-1"
              onClick={handleGenerateReport}
            >
              {t("reports.generateReport")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
