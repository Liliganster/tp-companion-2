import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Printer, ArrowLeft, FileSpreadsheet, FileText, FileDown, Save, Archive } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTrips } from "@/contexts/TripsContext";
import { useProjects } from "@/contexts/ProjectsContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useReports, type SavedReport } from "@/contexts/ReportsContext";
import { usePlan } from "@/contexts/PlanContext";
import { useI18n } from "@/hooks/use-i18n";
import { buildProjectZip } from "@/hooks/use-project-export";
import { useOdometer } from "@/contexts/OdometerContext";

interface ReportTrip {
  date: string;
  project: string;
  producer: string;
  route: string[];
  passengers: number;
  distance: number;
  reimbursement: number;
}

/* Mock report data (unused)
const mockReportTrips: ReportTrip[] = [
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

const getProjectKey = (value: string) => value.trim().toLowerCase();

export default function ReportView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { profile } = useUserProfile();
  const { t, tf, locale } = useI18n();
  const { trips: allTrips } = useTrips();
  const { projects } = useProjects();
  const { reports, addReport } = useReports();
  const { planTier, limits } = usePlan();
  const { computeRatio, getImageUrl, snapshots: odoSnapshots } = useOdometer();
  const reportId = searchParams.get("reportId");
  const savedReport = reportId ? reports.find((r) => r.id === reportId) : undefined;

  if (reportId && !savedReport) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 sm:px-6 py-4 print:hidden">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => navigate("/reports")} className="px-2 sm:px-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">{t("reportView.backToReports")}</span>
              <span className="sm:hidden">{t("reportView.backShort")}</span>
            </Button>
          </div>
        </div>
        <div className="max-w-3xl mx-auto p-6">
          <h1 className="text-xl font-semibold">{t("reportView.notFoundTitle")}</h1>
          <p className="text-muted-foreground mt-2">{t("reportView.notFoundBody")}</p>
        </div>
      </div>
    );
  }
  
  const rawProjectParam = searchParams.get("project") ?? "all";
  const selectedMonth = savedReport?.month ?? (searchParams.get("month") || "");
  const selectedYear = savedReport?.year ?? (searchParams.get("year") || "");
  const queryStartDate = searchParams.get("startDate") || "";
  const queryEndDate = searchParams.get("endDate") || "";
  const normalizeProjectParam = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "all";
    const lower = trimmed.toLowerCase();
    if (trimmed === "all" || lower === "todos los proyectos" || lower === "all projects" || lower === "alle projekte") return "all";
    return trimmed;
  };

  const projectFilter = normalizeProjectParam(rawProjectParam);
  const effectiveProject = savedReport?.project ?? projectFilter;
  const projectLabel = effectiveProject === "all" ? t("reports.allProjects") : effectiveProject;

  const formatDateShort = (dateOnly: string) =>
    new Date(`${dateOnly}T00:00:00`).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });

  const effectiveStartDate = savedReport?.startDate ?? queryStartDate;
  const effectiveEndDate = savedReport?.endDate ?? queryEndDate;

  const period = savedReport
    ? `${formatDateShort(savedReport.startDate)} - ${formatDateShort(savedReport.endDate)}`
    : effectiveStartDate && effectiveEndDate
      ? `${formatDateShort(effectiveStartDate)} - ${formatDateShort(effectiveEndDate)}`
      : (searchParams.get("period") || "");
  const driver = savedReport?.driver ?? (searchParams.get("driver") || profile.fullName);
  const address = savedReport?.address ?? (searchParams.get("address") || [profile.baseAddress, profile.city].filter(Boolean).join(", "));
  const licensePlate = savedReport?.licensePlate ?? (searchParams.get("licensePlate") || profile.licensePlate);

  // Compute odometer ratio for the report period (needs >= 2 snapshots that bracket the period)
  const odometerRatio = effectiveStartDate && effectiveEndDate
    ? computeRatio(effectiveStartDate, effectiveEndDate)
    : null;

  // Single snapshot fallback: find the best snapshot in/near the period for synthetic ratio
  const fallbackOdoSnap = odometerRatio ? null : (() => {
    if (!effectiveStartDate || !effectiveEndDate || odoSnapshots.length === 0) return null;
    const inPeriod = odoSnapshots.filter(
      (s) => s.snapshot_date >= effectiveStartDate && s.snapshot_date <= effectiveEndDate
    );
    if (inPeriod.length > 0) return inPeriod[inPeriod.length - 1];
    return odoSnapshots.reduce((prev, cur) =>
      Math.abs(cur.snapshot_date.localeCompare(effectiveEndDate)) <
      Math.abs(prev.snapshot_date.localeCompare(effectiveEndDate))
        ? cur : prev
    );
  })();


  const getProducerForProject = (projectName: string) => {
    const key = getProjectKey(projectName);
    if (!key) return "";
    const found = projects.find((p) => getProjectKey(p.name) === key);
    return found?.producer ?? "";
  };

  const getTripTime = (date: string) => {
    const time = Date.parse(date);
    return Number.isFinite(time) ? time : 0;
  };

  const monthIndex = selectedMonth ? Math.max(0, Math.min(11, Number.parseInt(selectedMonth, 10) - 1)) : null;
  const yearValue = selectedYear ? Number.parseInt(selectedYear, 10) : null;

  const rangeStartTime = effectiveStartDate ? Date.parse(`${effectiveStartDate}T00:00:00`) : 0;
  const rangeEndTime = effectiveEndDate ? Date.parse(`${effectiveEndDate}T23:59:59.999`) : 0;
  const hasValidRange = Boolean(effectiveStartDate && effectiveEndDate && Number.isFinite(rangeStartTime) && Number.isFinite(rangeEndTime));

  const filteredTrips = allTrips
    .filter((t) => {
      if (savedReport) return savedReport.tripIds.includes(t.id);
      const time = getTripTime(t.date);
      if (!time) return false;
      const d = new Date(time);
      const matchesPeriod = hasValidRange
        ? time >= rangeStartTime && time <= rangeEndTime
        : monthIndex == null || yearValue == null
          ? true
          : d.getFullYear() === yearValue && d.getMonth() === monthIndex;
      const matchesProject = effectiveProject === "all" || t.project === effectiveProject;
      return matchesPeriod && matchesProject;
    })
    .sort((a, b) => getTripTime(a.date) - getTripTime(b.date) || a.id.localeCompare(b.id));

  // Parse rates from profile
  const parseLocaleNumber = (value: string | undefined) => {
    if (!value) return 0;
    const parsed = parseFloat(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const ratePerKm = parseLocaleNumber(profile.ratePerKm);
  const passengerSurcharge = parseLocaleNumber(profile.passengerSurcharge);

  const reportTrips: ReportTrip[] = filteredTrips.map((trip) => {
    const time = getTripTime(trip.date);
    const dateLabel = time
      ? new Date(time).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })
      : trip.date;

    const passengers = Number.isFinite(trip.passengers) ? trip.passengers : 0;
    const distance = Number.isFinite(trip.distance) ? trip.distance : 0;
    const producer = trip.clientName || getProducerForProject(trip.project);
    const reimbursement = (distance * ratePerKm) + (passengers * passengerSurcharge);

    return {
      date: dateLabel,
      project: trip.project,
      producer,
      route: trip.route,
      passengers,
      distance,
      reimbursement,
    };
  });

  const trips = reportTrips;
  const totalDistance = trips.reduce((acc, trip) => acc + (Number.isFinite(trip.distance) ? trip.distance : 0), 0);
  const totalReimbursement = trips.reduce((acc, trip) => acc + (Number.isFinite(trip.reimbursement) ? trip.reimbursement : 0), 0);

  // Synthetic ratio from 1 snapshot: reading_km = totalKm, workKm = trips total distance
  const synthOdoRatio = (!odometerRatio && fallbackOdoSnap && fallbackOdoSnap.reading_km > 0)
    ? (() => {
        const totalKm = fallbackOdoSnap.reading_km;
        const workKm = Math.min(totalDistance, totalKm);
        const privateKm = Math.max(0, totalKm - workKm);
        const pct = totalKm > 0 ? Math.min(100, (workKm / totalKm) * 100) : 0;
        return { startSnapshot: fallbackOdoSnap, endSnapshot: fallbackOdoSnap, totalKm, workKm, privateKm, pct };
      })()
    : null;

  // Final display ratio: prefer full 2-snapshot ratio, fallback to synthetic
  const displayOdoRatio = odometerRatio ?? synthOdoRatio;

  const downloadTextFile = (content: string, fileName: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const escapeCsv = (value: unknown) => {
    const raw = value == null ? "" : String(value);
    const needsQuotes = /[",\n\r]/.test(raw);
    const escaped = raw.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };

  const sanitizeFilePart = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);

  const fileBase = `${t("reportView.filePrefix")}_${sanitizeFilePart(period)}_${sanitizeFilePart(projectLabel)}`;

  const companyOrClientLabel = t("reportView.colCompanyProducer");

  // For HTML table, split company/producer into two lines keeping the /
  const companyOrClientLabelHtml = (<>{t("reportView.colCompanyProducer").split("/")[0]}/<br/>{t("reportView.colCompanyProducer").split("/")[1]}</>);

  const headers = [
    t("reportView.colDate"),
    t("reportView.colProject"),
    companyOrClientLabel,
    t("reportView.colRoute"),
    t("reportView.colPassengers"),
    t("reportView.colDistanceKm"),
    t("reportView.colReimbursement"),
  ];

  const pdfHeaders = [
    t("reportView.colDate"),
    t("reportView.colProject"),
    t("reportView.colRoute"),
    t("reportView.colPassengersShort"),
    t("reportView.colDistanceKm"),
    t("reportView.colReimbursement"),
  ];

  const rows = trips.map((trip) => [
    trip.date,
    trip.project,
    trip.producer,
    trip.route.join(" -> "),
    trip.passengers,
    trip.distance,
    trip.reimbursement.toFixed(2),
  ]);

  const pdfRows = trips.map((trip) => {
    // Clean route: normalize whitespace and join with " > "
    const cleanRoute = (str: string) => str.replace(/\r?\n|\r/g, ", ").replace(/\s+/g, " ").trim();
    const routeStr = trip.route.map(cleanRoute).join(" > ");
    return [
      trip.date,
      trip.project,
      routeStr,
      String(trip.passengers),
      trip.distance.toFixed(1) + " km",
      trip.reimbursement.toFixed(2) + " \u20ac",
    ];
  });

  const canSave = !savedReport && filteredTrips.length > 0;

  const handleSave = async () => {
    if (!canSave) return;

    const toDateOnlyLocal = (time: number) => {
      const d = new Date(time);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    let startDateToSave = "";
    let endDateToSave = "";

    if (hasValidRange) {
      startDateToSave = effectiveStartDate;
      endDateToSave = effectiveEndDate;
    } else if (selectedMonth && selectedYear) {
      const monthIndexForSave = Math.max(0, Math.min(11, Number.parseInt(selectedMonth, 10) - 1));
      const yearValueForSave = Number.parseInt(selectedYear, 10);
      const start = new Date(yearValueForSave, monthIndexForSave, 1);
      const end = new Date(yearValueForSave, monthIndexForSave + 1, 0);
      startDateToSave = toDateOnlyLocal(start.getTime());
      endDateToSave = toDateOnlyLocal(end.getTime());
    } else {
      const times = filteredTrips.map((t) => getTripTime(t.date)).filter(Boolean);
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      startDateToSave = toDateOnlyLocal(minTime);
      endDateToSave = toDateOnlyLocal(maxTime);
    }

    let savedNext: SavedReport | null = null;
    try {
      savedNext = await addReport({
        month: selectedMonth || "",
        year: selectedYear || "",
        project: effectiveProject,
        tripIds: filteredTrips.map((t) => t.id),
        startDate: startDateToSave,
        endDate: endDateToSave,
        totalDistanceKm: totalDistance,
        tripsCount: filteredTrips.length,
        driver,
        address,
        licensePlate,
      });
    } catch {
      // addReport already shows the error toast (e.g. monthly limit reached)
      return;
    }

    toast({
      title: t("reportView.toastSavedTitle"),
      description: t("reportView.toastSavedBody"),
    });

    navigate(`/reports/view?reportId=${encodeURIComponent(savedNext.id)}`, { replace: true });
  };

  const handleExport = (format: "excel" | "pdf" | "csv") => {
    // Basic plan: block export of unsaved reports if monthly limit already used
    if (!savedReport && limits.maxSavedReportsPerMonth !== -1) {
      const now = new Date();
      const reportsThisMonth = reports.filter(r => {
        const d = new Date(r.createdAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      if (reportsThisMonth.length >= limits.maxSavedReportsPerMonth) {
        toast({ title: t("limits.maxReportsPerMonthReached") });
        return;
      }
    }

    const formatNames = {
      excel: "Excel",
      pdf: "PDF",
      csv: "CSV",
    };
    toast({
      title: tf("reportView.toastExportingTitle", { format: formatNames[format] }),
      description: t("reportView.toastExportingBody"),
    });

    (async () => {
      try {
        if (format === "csv") {
          const csv = [headers, ...rows].map((r) => r.map(escapeCsv).join(",")).join("\r\n");
          downloadTextFile(csv, `${fileBase}.csv`, "text/csv;charset=utf-8");
          return;
        }

        if (format === "excel") {
          const XLSX = await import("xlsx");
          const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, t("reportView.sheetName"));
          XLSX.writeFile(wb, `${fileBase}.xlsx`, { compression: true });
          return;
        }

        const { jsPDF } = await import("jspdf");
        const autoTableModule = await import("jspdf-autotable");
        const autoTable = autoTableModule.default;

        const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 40;
        const headerBottomY = 120;
        const availableWidth = pageWidth - margin * 2;

        const drawLabelValueLeft = (x: number, y: number, label: string, value: string) => {
          const labelText = `${label}: `;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.text(labelText, x, y);
          const labelWidth = doc.getTextWidth(labelText);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(11); // Ensure value is also 11
          doc.text(value, x + labelWidth, y, { maxWidth: pageWidth / 2 - margin - (x + labelWidth) });
        };

        const drawLabelValueRight = (rightEdge: number, y: number, label: string, value: string) => {
          const labelText = `${label}: `;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(11);
          const valueWidth = doc.getTextWidth(value);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          const labelWidth = doc.getTextWidth(labelText);
          const minStartX = pageWidth / 2 + 20;
          const startX = Math.max(minStartX, rightEdge - (labelWidth + valueWidth));
          doc.text(labelText, startX, y);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(11);
          doc.text(value, startX + labelWidth, y, { maxWidth: rightEdge - (startX + labelWidth) });
        };

        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text(t("reportView.reportTitle"), pageWidth / 2, 44, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.text(`${t("reportView.periodLabel")}: ${period}`, pageWidth / 2, 64, { align: "center" });

        const leftX = margin;
        const rightEdge = pageWidth - margin;
        const metaY1 = 82;
        const metaY2 = 96;
        const metaY3 = 110;

        drawLabelValueLeft(leftX, metaY1, t("reportView.driverLabel"), driver);
        drawLabelValueLeft(leftX, metaY2, t("reportView.licensePlateLabel"), licensePlate);
        drawLabelValueLeft(leftX, metaY3, t("reportView.addressLabel"), address);

        drawLabelValueRight(rightEdge, metaY1, t("reportView.projectLabel"), projectLabel);
        drawLabelValueRight(rightEdge, metaY2, t("reportView.passengerSurchargeLabel"), `${profile.passengerSurcharge || "0"} €`);
        drawLabelValueRight(rightEdge, metaY3, t("reportView.ratePerKmLabel"), `${profile.ratePerKm || "0"} €`);

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(margin, headerBottomY, pageWidth - margin, headerBottomY);

        // Odometer summary card — works with 1 or 2 snapshots
        const pdfOdoRatio = displayOdoRatio;
        let tableStartY = headerBottomY + 18;
        if (pdfOdoRatio) {
          const cardH = 50; // Increased to 50 for 11pt
          const cardY = headerBottomY + 6;
          doc.setFillColor(248, 248, 248);
          doc.roundedRect(margin, cardY, availableWidth, cardH, 2, 2, "F");
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.roundedRect(margin, cardY, availableWidth, cardH, 2, 2, "S");

          // Title row
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9); // Standardized title
          doc.setTextColor(100, 100, 100);
          doc.text(t("odometer.calcTitle").toUpperCase(), margin + 6, cardY + 13);

          // Metrics row — 11pt font, evenly spaced
          doc.setFont("helvetica", "normal");
          doc.setFontSize(11);
          doc.setTextColor(30, 30, 30);
          const metrics = [
            `${t("odometer.totalKm")}: ${Number(pdfOdoRatio.totalKm).toFixed(0)} km`,
            `${t("odometer.workKm")}: ${Number(pdfOdoRatio.workKm).toFixed(0)} km`,
            `${t("odometer.privateKm")}: ${Number(pdfOdoRatio.privateKm).toFixed(0)} km`,
            `${t("odometer.workPct")}: ${Number(pdfOdoRatio.pct).toFixed(1)} %`,
          ];
          const colW = availableWidth / metrics.length;
          metrics.forEach((text, i) => {
            doc.text(text, margin + 6 + colW * i, cardY + 30);
          });

          // Footer note
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(140, 140, 140);
          const isSingleSnap = pdfOdoRatio.startSnapshot.id === pdfOdoRatio.endSnapshot.id;
          const snapNote = isSingleSnap
            ? `${pdfOdoRatio.startSnapshot.snapshot_date} | ${Number(pdfOdoRatio.startSnapshot.reading_km).toFixed(0)} km`
            : `${pdfOdoRatio.startSnapshot.snapshot_date} \u2192 ${pdfOdoRatio.endSnapshot.snapshot_date}  |  ${Number(pdfOdoRatio.startSnapshot.reading_km).toFixed(0)} \u2192 ${Number(pdfOdoRatio.endSnapshot.reading_km).toFixed(0)} km`;
          doc.text(snapNote, margin + 6, cardY + 44);

          doc.setDrawColor(0, 0, 0);
          doc.setTextColor(0, 0, 0);
          tableStartY = cardY + cardH + 10;
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);

        const computeColumnWidths = () => {
          const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
          const pad = 6;

          // 6 columns: Date, Project, Route, Passengers, Distance, Reimbursement
          const min = [60, 80, 280, 55, 60, 70];
          const max = [70, 110, 500, 65, 75, 90];

          const desired = pdfHeaders.map((header, colIndex) => {
            let maxTextWidth = doc.getTextWidth(String(header));
            for (const row of pdfRows) {
              const raw = row[colIndex] ?? "";
              const text =
                colIndex === 2 ? String(raw).slice(0, 80) : String(raw);
              maxTextWidth = Math.max(maxTextWidth, doc.getTextWidth(text));
            }
            return clamp(maxTextWidth + pad, min[colIndex] ?? 50, max[colIndex] ?? 80);
          });

          let widths = desired.slice();
          const sum = () => widths.reduce((acc, w) => acc + w, 0);

          if (sum() > availableWidth) {
            const reducible = [2, 1, 0, 4, 5];
            for (let iteration = 0; iteration < 4 && sum() > availableWidth; iteration++) {
              const overflow = sum() - availableWidth;
              const totalSlack = reducible.reduce((acc, i) => acc + Math.max(0, widths[i] - min[i]), 0);
              if (totalSlack <= 0) break;

              for (const i of reducible) {
                const slack = Math.max(0, widths[i] - min[i]);
                if (!slack) continue;
                const reduce = Math.min(slack, overflow * (slack / totalSlack));
                widths[i] -= reduce;
              }
            }
          } else if (sum() < availableWidth) {
            const extra = availableWidth - sum();
            const routeIndex = 2;
            widths[routeIndex] = Math.min(max[routeIndex], widths[routeIndex] + extra);
          }

          widths = widths.map((w) => Math.floor(w));
          return widths;
        };

        const columnWidths = computeColumnWidths();

        autoTable(doc, {
          head: [pdfHeaders],
          body: pdfRows,
          foot: [
            [
              { content: "", colSpan: 3, styles: { fillColor: [255, 255, 255] } },
              { content: `${t("reportView.totalShort")}:`, styles: { halign: "right", fillColor: [255, 255, 255] } },
              { content: `${totalDistance.toFixed(1)} km`, styles: { halign: "right", fontStyle: "bold" } },
              { content: `${totalReimbursement.toFixed(2)} €`, styles: { halign: "right", fontStyle: "bold" } },
            ],
          ],
          startY: tableStartY,
          theme: "grid",
          styles: { 
            fontSize: 9, 
            cellPadding: { top: 5, right: 6, bottom: 5, left: 6 }, 
            textColor: [30, 30, 30], 
            lineColor: [220, 220, 220], 
            lineWidth: 0.3,
            valign: "middle",
            overflow: "linebreak",
          },
          headStyles: { 
            fillColor: [255, 255, 255], 
            textColor: [30, 30, 30], 
            fontStyle: "bold", 
            fontSize: 9, 
            lineColor: [180, 180, 180], 
            lineWidth: 0.4,
            valign: "middle",
          },
          footStyles: { 
            fillColor: [255, 255, 255], 
            textColor: 0, 
            fontSize: 9, 
            lineColor: [180, 180, 180], 
            lineWidth: 0.4,
            fontStyle: "bold",
          },
          margin: { left: margin, right: margin },
          columnStyles: {
            0: { cellWidth: columnWidths[0] },
            1: { cellWidth: columnWidths[1] },
            2: { cellWidth: columnWidths[2] },
            3: { cellWidth: columnWidths[3], halign: "center" },
            4: { cellWidth: columnWidths[4], halign: "right" },
            5: { cellWidth: columnWidths[5], halign: "right" },
          },
        });

        doc.save(`${fileBase}.pdf`);

        toast({
          title: t("reportView.toastPdfDownloadedTitle"),
          description: t("reportView.toastPdfDownloadedBody"),
        });
      } catch {
        toast({
          title: t("reportView.toastExportErrorTitle"),
          description: t("reportView.toastExportErrorBody"),
          variant: "destructive",
        });
      }
    })();
  };

  const handleExportZip = () => {
    if (planTier !== "pro") {
      toast({ title: t("reportView.exportZipProOnly") });
      return;
    }
    if (filteredTrips.length === 0) {
      toast({ title: t("reportView.exportZipEmpty") });
      return;
    }

    toast({
      title: t("reportView.exportZipPreparing"),
      description: t("reportView.toastExportingBody"),
    });

    (async () => {
      try {
        // 1. Generate PDF blob in-memory
        const { jsPDF } = await import("jspdf");
        const autoTableModule = await import("jspdf-autotable");
        const autoTable = autoTableModule.default;

        const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 40;
        const headerBottomY = 120;
        const availableWidth = pageWidth - margin * 2;

        const drawLabelValueLeft = (x: number, y: number, label: string, value: string) => {
          const labelText = `${label}: `;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.text(labelText, x, y);
          const labelWidth = doc.getTextWidth(labelText);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(11);
          doc.text(value, x + labelWidth, y, { maxWidth: pageWidth / 2 - margin - (x + labelWidth) });
        };

        const drawLabelValueRight = (rightEdge: number, y: number, label: string, value: string) => {
          const labelText = `${label}: `;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(11);
          const valueWidth = doc.getTextWidth(value);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          const labelWidth = doc.getTextWidth(labelText);
          const minStartX = pageWidth / 2 + 20;
          const startX = Math.max(minStartX, rightEdge - (labelWidth + valueWidth));
          doc.text(labelText, startX, y);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(11);
          doc.text(value, startX + labelWidth, y, { maxWidth: rightEdge - (startX + labelWidth) });
        };

        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text(t("reportView.reportTitle"), pageWidth / 2, 44, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.text(`${t("reportView.periodLabel")}: ${period}`, pageWidth / 2, 64, { align: "center" });

        const leftX = margin;
        const rightEdge = pageWidth - margin;
        const metaY1 = 82;
        const metaY2 = 96;
        const metaY3 = 110;

        drawLabelValueLeft(leftX, metaY1, t("reportView.driverLabel"), driver);
        drawLabelValueLeft(leftX, metaY2, t("reportView.licensePlateLabel"), licensePlate);
        drawLabelValueLeft(leftX, metaY3, t("reportView.addressLabel"), address);
        drawLabelValueRight(rightEdge, metaY1, t("reportView.projectLabel"), projectLabel);
        drawLabelValueRight(rightEdge, metaY2, t("reportView.passengerSurchargeLabel"), `${profile.passengerSurcharge || "0"} €`);
        drawLabelValueRight(rightEdge, metaY3, t("reportView.ratePerKmLabel"), `${profile.ratePerKm || "0"} €`);

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(margin, headerBottomY, pageWidth - margin, headerBottomY);

        // Odometer summary card — works with 1 or 2 snapshots
        const zipOdoRatio = displayOdoRatio;
        let tableStartY = headerBottomY + 18;
        if (zipOdoRatio) {
          const cardH = 50;
          const cardY = headerBottomY + 6;
          doc.setFillColor(248, 248, 248);
          doc.roundedRect(margin, cardY, availableWidth, cardH, 2, 2, "F");
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.roundedRect(margin, cardY, availableWidth, cardH, 2, 2, "S");

          // Title
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.setTextColor(100, 100, 100);
          doc.text(t("odometer.calcTitle").toUpperCase(), margin + 6, cardY + 13);

          // Metrics row — 11pt
          doc.setFont("helvetica", "normal");
          doc.setFontSize(11);
          doc.setTextColor(30, 30, 30);
          const zipMetrics = [
            `${t("odometer.totalKm")}: ${Number(zipOdoRatio.totalKm).toFixed(0)} km`,
            `${t("odometer.workKm")}: ${Number(zipOdoRatio.workKm).toFixed(0)} km`,
            `${t("odometer.privateKm")}: ${Number(zipOdoRatio.privateKm).toFixed(0)} km`,
            `${t("odometer.workPct")}: ${Number(zipOdoRatio.pct).toFixed(1)} %`,
          ];
          const zipColW = availableWidth / zipMetrics.length;
          zipMetrics.forEach((text, i) => {
            doc.text(text, margin + 6 + zipColW * i, cardY + 30);
          });

          // Note
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(140, 140, 140);
          const zipIsSingle = zipOdoRatio.startSnapshot.id === zipOdoRatio.endSnapshot.id;
          const zipNote = zipIsSingle
            ? `${zipOdoRatio.startSnapshot.snapshot_date} | ${Number(zipOdoRatio.startSnapshot.reading_km).toFixed(0)} km`
            : `${zipOdoRatio.startSnapshot.snapshot_date} \u2192 ${zipOdoRatio.endSnapshot.snapshot_date}  |  ${Number(zipOdoRatio.startSnapshot.reading_km).toFixed(0)} \u2192 ${Number(zipOdoRatio.endSnapshot.reading_km).toFixed(0)} km`;
          doc.text(zipNote, margin + 6, cardY + 44);

          doc.setDrawColor(0, 0, 0);
          doc.setTextColor(0, 0, 0);
          tableStartY = cardY + cardH + 10;
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);

        const computeColumnWidths = () => {
          const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
          const pad = 6;
          // 6 columns: Date, Project, Route, Passengers, Distance, Reimbursement
          const min = [60, 80, 280, 55, 60, 70];
          const max = [70, 110, 500, 65, 75, 90];
          const desired = pdfHeaders.map((header, colIndex) => {
            let maxTextWidth = doc.getTextWidth(String(header));
            for (const row of pdfRows) {
              const raw = row[colIndex] ?? "";
              const text = colIndex === 2 ? String(raw).slice(0, 80) : String(raw);
              maxTextWidth = Math.max(maxTextWidth, doc.getTextWidth(text));
            }
            return clamp(maxTextWidth + pad, min[colIndex] ?? 50, max[colIndex] ?? 80);
          });
          let widths = desired.slice();
          const sum = () => widths.reduce((acc, w) => acc + w, 0);
          if (sum() > availableWidth) {
            const reducible = [2, 1, 0, 4, 5];
            for (let iteration = 0; iteration < 4 && sum() > availableWidth; iteration++) {
              const overflow = sum() - availableWidth;
              const totalSlack = reducible.reduce((acc, i) => acc + Math.max(0, widths[i] - min[i]), 0);
              if (totalSlack <= 0) break;
              for (const i of reducible) {
                const slack = Math.max(0, widths[i] - min[i]);
                if (!slack) continue;
                const reduce = Math.min(slack, overflow * (slack / totalSlack));
                widths[i] -= reduce;
              }
            }
          } else if (sum() < availableWidth) {
            const extra = availableWidth - sum();
            widths[2] = Math.min(max[2], widths[2] + extra);
          }
          widths = widths.map((w) => Math.floor(w));
          return widths;
        };

        const columnWidths = computeColumnWidths();
        autoTable(doc, {
          head: [pdfHeaders],
          body: pdfRows,
          foot: [[
            { content: "", colSpan: 3, styles: { fillColor: [255, 255, 255] } },
            { content: `${t("reportView.totalShort")}:`, styles: { halign: "right", fillColor: [255, 255, 255] } },
            { content: `${totalDistance.toFixed(1)} km`, styles: { halign: "right", fontStyle: "bold" } },
            { content: `${totalReimbursement.toFixed(2)} €`, styles: { halign: "right", fontStyle: "bold" } },
          ]],
          startY: tableStartY,
          theme: "grid",
          styles: { 
            fontSize: 9, 
            cellPadding: { top: 5, right: 6, bottom: 5, left: 6 }, 
            textColor: [30, 30, 30], 
            lineColor: [220, 220, 220], 
            lineWidth: 0.3,
            valign: "middle",
            overflow: "linebreak",
          },
          headStyles: { 
            fillColor: [255, 255, 255], 
            textColor: [30, 30, 30], 
            fontStyle: "bold", 
            fontSize: 9, 
            lineColor: [180, 180, 180], 
            lineWidth: 0.4,
            valign: "middle",
          },
          footStyles: { 
            fillColor: [255, 255, 255], 
            textColor: 0, 
            fontSize: 9, 
            lineColor: [180, 180, 180], 
            lineWidth: 0.4,
            fontStyle: "bold",
          },
          margin: { left: margin, right: margin },
          columnStyles: {
            0: { cellWidth: columnWidths[0] },
            1: { cellWidth: columnWidths[1] },
            2: { cellWidth: columnWidths[2] },
            3: { cellWidth: columnWidths[3], halign: "center" },
            4: { cellWidth: columnWidths[4], halign: "right" },
            5: { cellWidth: columnWidths[5], halign: "right" },
          },
        });

        const pdfBlob = doc.output("blob");
        const pdfFileName = `${fileBase}.pdf`;

        // 2. Build ZIP
        const zipBlob = await buildProjectZip({
          reportBlob: pdfBlob,
          reportFileName: pdfFileName,
          trips: filteredTrips,
        });

        // 3. Odometer photos (Pro only, non-fatal)
        let finalZipBlob = zipBlob;
        if (planTier === "pro" && odometerRatio) {
          try {
            const JSZipModule = await import("jszip");
            const JSZipCls = JSZipModule.default;
            const zip = await JSZipCls.loadAsync(zipBlob);
            const fetchOdoImg = async (path: string) => {
              const signedUrl = await getImageUrl(path);
              if (!signedUrl) return null;
              const res = await fetch(signedUrl);
              return res.ok ? res.arrayBuffer() : null;
            };
            if (odometerRatio.startSnapshot.image_storage_path) {
              const buf = await fetchOdoImg(odometerRatio.startSnapshot.image_storage_path);
              if (buf) {
                const ext = odometerRatio.startSnapshot.image_storage_path.split(".").pop() ?? "jpg";
                zip.file(`odometro/foto_inicio_${odometerRatio.startSnapshot.snapshot_date}.${ext}`, buf);
              }
            }
            if (odometerRatio.endSnapshot.image_storage_path && odometerRatio.endSnapshot.id !== odometerRatio.startSnapshot.id) {
              const buf = await fetchOdoImg(odometerRatio.endSnapshot.image_storage_path);
              if (buf) {
                const ext = odometerRatio.endSnapshot.image_storage_path.split(".").pop() ?? "jpg";
                zip.file(`odometro/foto_fin_${odometerRatio.endSnapshot.snapshot_date}.${ext}`, buf);
              }
            }
            finalZipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
          } catch {
            // Non-fatal: proceed without odometer photos
          }
        }

        // 4. Trigger download
        const url = URL.createObjectURL(finalZipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileBase}_con_documentacion.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        toast({ title: t("reportView.exportZipDone") });
      } catch {
        toast({
          title: t("reportView.exportZipError"),
          description: t("reportView.toastExportErrorBody"),
          variant: "destructive",
        });
      }
    })();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 sm:px-6 py-4 print:hidden">
        <div className="max-w-[1800px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => navigate("/reports")} className="px-2 sm:px-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">{t("reportView.backToReports")}</span>
            <span className="sm:hidden">{t("reportView.backShort")}</span>
          </Button>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t("reportView.export")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover">
                <DropdownMenuItem onClick={() => handleExport("excel")}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  {t("reportView.exportExcel")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf")}>
                  <FileText className="w-4 h-4 mr-2" />
                  {t("reportView.exportPdf")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("csv")}>
                  <FileDown className="w-4 h-4 mr-2" />
                  {t("reportView.exportCsv")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleExportZip}
                  disabled={planTier !== "pro"}
                  className={planTier !== "pro" ? "opacity-50" : ""}
                >
                  <Archive className="w-4 h-4 mr-2" />
                  <span className="flex-1">{t("reportView.exportZip")}</span>
                  {planTier !== "pro" && (
                    <span className="ml-2 text-[10px] font-bold bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                      PRO
                    </span>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t("reportView.print")}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="p-4 sm:p-6 overflow-auto print:p-0 print:overflow-visible print:bg-white print:text-black">
        <div className="max-w-[1800px] mx-auto print:max-w-none">
          <div className="bg-slate-800 text-white rounded-lg p-4 sm:p-6 lg:p-8 print:bg-white print:text-black print:rounded-none print:p-8">
            {/* Report Header */}
            <div className="text-center mb-6">
              <h1 className="text-lg sm:text-xl font-bold mb-1">{t("reportView.reportTitle")}</h1>
              <p className="text-xs sm:text-sm text-slate-300 print:text-black">
                {t("reportView.periodLabel")}: {period}
              </p>
            </div>

            {/* Report Meta Info */}
            <div className="flex flex-col sm:flex-row sm:justify-between gap-3 mb-6 text-xs sm:text-sm">
              <div>
                <p>
                  <span className="font-semibold">{t("reportView.driverLabel")}:</span> {driver}
                </p>
                <p>
                  <span className="font-semibold">{t("reportView.licensePlateLabel")}:</span> {licensePlate}
                </p>
                <p>
                  <span className="font-semibold">{t("reportView.addressLabel")}:</span> {address}
                </p>
              </div>
              <div className="sm:text-right">
                <p>
                  <span className="font-semibold">{t("reportView.projectLabel")}:</span> {projectLabel}
                </p>
                <p>
                  <span className="font-semibold">{t("reportView.passengerSurchargeLabel")}:</span> {profile.passengerSurcharge || "0"} €
                </p>
                <p>
                  <span className="font-semibold">{t("reportView.ratePerKmLabel")}:</span> {profile.ratePerKm || "0"} €
                </p>
              </div>
            </div>

            <hr className="hidden print:block border-black mb-4" />

            {/* Odometer Summary Card — works with 1 or 2+ snapshots */}
            {displayOdoRatio && (
              <div className="mb-4 rounded-lg bg-slate-700/50 border border-slate-600/60 print:bg-gray-50 print:border-gray-200 p-3 sm:p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 print:text-gray-500 mb-2">
                  {t("odometer.calcTitle")}
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs sm:text-sm">
                  <div>
                    <span className="text-slate-400 print:text-gray-500">{t("odometer.totalKm")}: </span>
                    <span className="font-semibold">{Number(displayOdoRatio.totalKm).toFixed(0)} km</span>
                  </div>
                  <div>
                    <span className="text-slate-400 print:text-gray-500">{t("odometer.workKm")}: </span>
                    <span className="font-semibold">{Number(displayOdoRatio.workKm).toFixed(0)} km</span>
                  </div>
                  <div>
                    <span className="text-slate-400 print:text-gray-500">{t("odometer.privateKm")}: </span>
                    <span className="font-semibold">{Number(displayOdoRatio.privateKm).toFixed(0)} km</span>
                  </div>
                  <div>
                    <span className="text-slate-400 print:text-gray-500">{t("odometer.workPct")}: </span>
                    <span className="font-semibold">{Number(displayOdoRatio.pct).toFixed(1)} %</span>
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-slate-500 print:text-gray-400">
                  {displayOdoRatio.startSnapshot.snapshot_date}
                  {displayOdoRatio.startSnapshot.id !== displayOdoRatio.endSnapshot.id && (
                    <>{" \u2192 "}{displayOdoRatio.endSnapshot.snapshot_date}</>
                  )}
                  {" | "}
                  {Number(displayOdoRatio.startSnapshot.reading_km).toFixed(0)}{displayOdoRatio.startSnapshot.extraction_status === "user_edited" ? " (mod.)" : ""}
                  {displayOdoRatio.startSnapshot.id !== displayOdoRatio.endSnapshot.id && (
                    <>{" \u2192 "}{Number(displayOdoRatio.endSnapshot.reading_km).toFixed(0)}{displayOdoRatio.endSnapshot.extraction_status === "user_edited" ? " (mod.)" : ""}</>
                  )} km
                </p>
              </div>
            )}

            {/* Report Table */}
            <div className="overflow-x-auto -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 print:overflow-visible print:mx-0 print:px-0">
              <table className="w-full text-xs sm:text-sm min-w-[700px] print:min-w-0 print:text-[9px] print:leading-tight table-fixed print:table-fixed">
                <colgroup>
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "32%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "14%" }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-600 print:border-black">
                    <th className="text-left py-3 px-2 print:py-2 print:px-1 font-semibold whitespace-nowrap">{t("reportView.colDate")}</th>
                    <th className="text-left py-3 px-2 print:py-2 print:px-1 font-semibold whitespace-nowrap">{t("reportView.colProject")}</th>
                    <th className="text-left py-3 px-2 print:py-2 print:px-1 font-semibold hidden md:table-cell leading-tight">
                      {companyOrClientLabelHtml}
                    </th>
                    <th className="text-left py-3 px-2 print:py-2 print:px-1 font-semibold whitespace-nowrap">{t("reportView.colRoute")}</th>
                    <th className="text-center py-3 px-2 print:py-2 print:px-1 font-semibold whitespace-nowrap hidden sm:table-cell">
                      {t("reportView.colPassengersShort")}
                    </th>
                    <th className="text-right py-3 px-2 print:py-2 print:px-1 font-semibold whitespace-nowrap">{t("reportView.colDistanceKm")}</th>
                    <th className="text-right py-3 px-2 print:py-2 print:px-1 font-semibold whitespace-nowrap">{t("reportView.colReimbursement")}</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((trip, index) => (
                    <tr key={index} className="border-b border-slate-700/50 print:border-black">
                      <td className="py-3 sm:py-4 px-2 print:py-2 print:px-1 align-top whitespace-nowrap">
                        {trip.date}
                      </td>
                      <td className="py-3 sm:py-4 px-2 print:py-2 print:px-1 align-top overflow-hidden text-ellipsis whitespace-nowrap">
                        {trip.project}
                      </td>
                      <td className="py-3 sm:py-4 px-2 print:py-2 print:px-1 align-top hidden md:table-cell overflow-hidden text-ellipsis whitespace-nowrap">
                        {trip.producer}
                      </td>
                      <td className="py-3 sm:py-4 px-2 print:py-2 print:px-1 align-top text-slate-300 max-w-[200px] sm:max-w-none truncate sm:whitespace-normal print:text-black print:truncate-none print:max-w-none print:whitespace-normal print:break-words">
                        {trip.route.join(" -> ")}
                      </td>
                      <td className="py-3 sm:py-4 px-2 print:py-2 print:px-1 align-top text-center hidden sm:table-cell">
                        {trip.passengers}
                      </td>
                      <td className="py-3 sm:py-4 px-2 print:py-2 print:px-1 align-top text-right whitespace-nowrap">
                        {trip.distance.toFixed(1)}
                      </td>
                      <td className="py-3 sm:py-4 px-2 print:py-2 print:px-1 align-top text-right font-semibold whitespace-nowrap text-green-500 print:text-black">
                        {trip.reimbursement.toFixed(2)} €
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-500 print:hidden">
                    <td colSpan={4} className="py-3 px-2 text-right font-semibold hidden sm:table-cell">
                    </td>
                    <td className="py-3 px-2 text-right font-semibold hidden sm:table-cell">
                    </td>
                    <td className="py-3 px-2 text-right font-semibold whitespace-nowrap">
                      {t("reportView.totalShort")}: {totalDistance.toFixed(1)} km
                    </td>
                    <td className="py-3 px-2 text-right font-semibold whitespace-nowrap text-green-500 print:text-black">
                      {t("reportView.totalShort")}: {totalReimbursement.toFixed(2)} €
                    </td>
                  </tr>
                  <tr className="hidden print:table-row border-t-2 border-black">
                    <td colSpan={4} className="py-2 px-1">
                    </td>
                    <td className="py-2 px-1">
                    </td>
                    <td className="py-2 px-1 text-right font-semibold text-[9px] whitespace-nowrap">
                      {t("reportView.totalShort")}: {totalDistance.toFixed(1)} km
                    </td>
                    <td className="py-2 px-1 text-right font-semibold text-[9px] whitespace-nowrap">
                      {t("reportView.totalShort")}: {totalReimbursement.toFixed(2)} €
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {!savedReport && (
              <div className="flex justify-end mt-4 print:hidden">
                <Button onClick={handleSave} disabled={!canSave}>
                  <Save className="w-4 h-4 mr-2" />
                  {t("reportView.saveReport")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
