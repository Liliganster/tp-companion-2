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

        const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 40;
        const availableWidth = pageWidth - margin * 2;

        const drawLabelValueLeft = (x: number, y: number, label: string, value: string) => {
          const labelText = `${label}: `;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.text(labelText, x, y);
          const labelWidth = doc.getTextWidth(labelText);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(value, x + labelWidth, y);
        };

        const drawLabelValueRight = (rightEdge: number, y: number, label: string, value: string) => {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          const fullText = `${label}: ${value}`;
          const textWidth = doc.getTextWidth(fullText);
          const startX = rightEdge - textWidth;
          doc.text(`${label}: `, startX, y);
          const labelWidth = doc.getTextWidth(`${label}: `);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(value, startX + labelWidth, y);
        };

        // Helper to draw "label: VALUE" with bold value
        const drawMetricBold = (x: number, y: number, label: string, value: string) => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          const labelText = `${label}: `;
          doc.text(labelText, x, y);
          const labelW = doc.getTextWidth(labelText);
          doc.setFont("helvetica", "bold");
          doc.text(value, x + labelW, y);
          return doc.getTextWidth(labelText + value);
        };

        doc.setTextColor(0, 0, 0);

        // Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.text(t("reportView.reportTitle"), pageWidth / 2, 55, { align: "center" });

        // Period
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`${t("reportView.periodLabel")}: ${period}`, pageWidth / 2, 72, { align: "center" });

        // App name below period
        doc.setFontSize(8);
        doc.setTextColor(160, 160, 160);
        doc.text("Fahrtenbuch Pro", pageWidth / 2, 84, { align: "center" });
        doc.setTextColor(0, 0, 0);

        const leftX = margin;
        const rightEdge = pageWidth - margin;
        const metaY1 = 100;
        const metaY2 = 113;
        const metaY3 = 126;

        drawLabelValueLeft(leftX, metaY1, t("reportView.driverLabel"), driver);
        drawLabelValueLeft(leftX, metaY2, t("reportView.licensePlateLabel"), licensePlate);
        drawLabelValueLeft(leftX, metaY3, t("reportView.addressLabel"), address);

        drawLabelValueRight(rightEdge, metaY1, t("reportView.projectLabel"), projectLabel);
        drawLabelValueRight(rightEdge, metaY2, t("reportView.passengerSurchargeLabel"), `${profile.passengerSurcharge || "0"} €`);
        drawLabelValueRight(rightEdge, metaY3, t("reportView.ratePerKmLabel"), `${profile.ratePerKm || "0"} €`);

        const headerBottomY = 140;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(margin, headerBottomY, pageWidth - margin, headerBottomY);

        // Odometer summary card
        const pdfOdoRatio = displayOdoRatio;
        let tableStartY = headerBottomY + 18;
        if (pdfOdoRatio) {
          const cardH = 62;
          const cardY = headerBottomY + 6;
          doc.setFillColor(248, 248, 248);
          doc.roundedRect(margin, cardY, availableWidth, cardH, 2, 2, "F");
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.roundedRect(margin, cardY, availableWidth, cardH, 2, 2, "S");

          // Title row
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.setTextColor(100, 100, 100);
          doc.text(t("odometer.calcTitle").toUpperCase(), margin + 8, cardY + 12);

          // Metrics row 1 — totalKm, workKm, privateKm with bold values
          doc.setTextColor(30, 30, 30);
          const mX = margin + 8;
          const mY1 = cardY + 26;
          const metricItems = [
            { label: t("odometer.totalKm"), value: `${Number(pdfOdoRatio.totalKm).toFixed(0)} km` },
            { label: t("odometer.workKm"), value: `${Number(pdfOdoRatio.workKm).toFixed(0)} km` },
            { label: t("odometer.privateKm"), value: `${Number(pdfOdoRatio.privateKm).toFixed(0)} km` },
          ];
          const mColW = (availableWidth - 16) / 3;
          metricItems.forEach((item, i) => {
            drawMetricBold(mX + mColW * i, mY1, item.label, item.value);
          });

          // Metrics row 2 — workPct
          const mY2 = cardY + 40;
          drawMetricBold(mX, mY2, t("odometer.workPct"), `${Number(pdfOdoRatio.pct).toFixed(1)} %`);

          // Footer note
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(140, 140, 140);
          const isSingleSnap = pdfOdoRatio.startSnapshot.id === pdfOdoRatio.endSnapshot.id;
          const snapNote = isSingleSnap
            ? `${pdfOdoRatio.startSnapshot.snapshot_date} | ${Number(pdfOdoRatio.startSnapshot.reading_km).toFixed(0)}${pdfOdoRatio.startSnapshot.extraction_status === "user_edited" ? " (mod.)" : ""} km`
            : `${pdfOdoRatio.startSnapshot.snapshot_date} \u2192 ${pdfOdoRatio.endSnapshot.snapshot_date}  |  ${Number(pdfOdoRatio.startSnapshot.reading_km).toFixed(0)} \u2192 ${Number(pdfOdoRatio.endSnapshot.reading_km).toFixed(0)} km`;
          doc.text(snapNote, mX, cardY + 52);

          doc.setDrawColor(0, 0, 0);
          doc.setTextColor(0, 0, 0);
          tableStartY = cardY + cardH + 12;
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);

        // Simple proportional widths for portrait A4 (535pt available)
        // Route gets all remaining space after allocating fixed widths
        const fixedWidths = [55, 82, 0, 55, 72, 72]; // Date, Project, Route(placeholder), Passengers, Distance, Reimbursement
        const fixedTotal = fixedWidths.reduce((a, b) => a + b, 0);
        fixedWidths[2] = availableWidth - fixedTotal; // Route = all remaining space
        const columnWidths = fixedWidths;

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
          theme: "plain",
          styles: { 
            font: "helvetica",
            fontSize: 9, 
            cellPadding: { top: 5, right: 4, bottom: 5, left: 4 }, 
            textColor: [0, 0, 0], 
            valign: "middle",
            overflow: "linebreak",
            lineWidth: { bottom: 0.3 },
            lineColor: [220, 220, 220],
          },
          headStyles: { 
            font: "helvetica",
            fillColor: [255, 255, 255], 
            textColor: [0, 0, 0], 
            fontStyle: "bold", 
            fontSize: 9,
            valign: "middle",
            cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
            lineWidth: { bottom: 0.5 },
            lineColor: [160, 160, 160],
          },
          footStyles: { 
            font: "helvetica",
            fillColor: [255, 255, 255], 
            textColor: [0, 0, 0], 
            fontSize: 9,
            fontStyle: "bold",
            lineWidth: { top: 0.8 },
            lineColor: [0, 0, 0],
          },
          margin: { left: margin, right: margin },
          columnStyles: {
            0: { cellWidth: columnWidths[0] },
            1: { cellWidth: columnWidths[1] },
            2: { cellWidth: columnWidths[2], overflow: "linebreak" },
            3: { cellWidth: columnWidths[3], halign: "center" },
            4: { cellWidth: columnWidths[4], halign: "right" },
            5: { cellWidth: columnWidths[5], halign: "right" },
          },
          didDrawPage: (data: { table?: { head?: Array<{ cells?: Record<string, { x: number; width: number; y: number; height: number }> }> } }) => {
            // Draw line under header row
            if (data.table?.head?.[0]) {
              const headerCells = data.table.head[0].cells;
              if (headerCells) {
                const firstCell = headerCells[0];
                const lastCell = headerCells[Object.keys(headerCells).length - 1];
                if (firstCell && lastCell) {
                  doc.setDrawColor(180, 180, 180);
                  doc.setLineWidth(0.5);
                  doc.line(firstCell.x, firstCell.y + firstCell.height, lastCell.x + lastCell.width, lastCell.y + lastCell.height);
                }
              }
            }
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

        const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 40;
        const availableWidth = pageWidth - margin * 2;

        const drawLabelValueLeft = (x: number, y: number, label: string, value: string) => {
          const labelText = `${label}: `;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.text(labelText, x, y);
          const labelWidth = doc.getTextWidth(labelText);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(value, x + labelWidth, y);
        };

        const drawLabelValueRight = (rightEdge: number, y: number, label: string, value: string) => {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          const fullText = `${label}: ${value}`;
          const textWidth = doc.getTextWidth(fullText);
          const startX = rightEdge - textWidth;
          doc.text(`${label}: `, startX, y);
          const labelWidth = doc.getTextWidth(`${label}: `);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(value, startX + labelWidth, y);
        };

        // Helper to draw "label: VALUE" with bold value
        const drawMetricBold = (x: number, y: number, label: string, value: string) => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          const labelText = `${label}: `;
          doc.text(labelText, x, y);
          const labelW = doc.getTextWidth(labelText);
          doc.setFont("helvetica", "bold");
          doc.text(value, x + labelW, y);
          return doc.getTextWidth(labelText + value);
        };

        doc.setTextColor(0, 0, 0);

        // Title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.text(t("reportView.reportTitle"), pageWidth / 2, 55, { align: "center" });

        // Period
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`${t("reportView.periodLabel")}: ${period}`, pageWidth / 2, 72, { align: "center" });

        // App name below period
        doc.setFontSize(8);
        doc.setTextColor(160, 160, 160);
        doc.text("Fahrtenbuch Pro", pageWidth / 2, 84, { align: "center" });
        doc.setTextColor(0, 0, 0);

        const leftX = margin;
        const rightEdge = pageWidth - margin;
        const metaY1 = 100;
        const metaY2 = 113;
        const metaY3 = 126;

        drawLabelValueLeft(leftX, metaY1, t("reportView.driverLabel"), driver);
        drawLabelValueLeft(leftX, metaY2, t("reportView.licensePlateLabel"), licensePlate);
        drawLabelValueLeft(leftX, metaY3, t("reportView.addressLabel"), address);
        drawLabelValueRight(rightEdge, metaY1, t("reportView.projectLabel"), projectLabel);
        drawLabelValueRight(rightEdge, metaY2, t("reportView.passengerSurchargeLabel"), `${profile.passengerSurcharge || "0"} €`);
        drawLabelValueRight(rightEdge, metaY3, t("reportView.ratePerKmLabel"), `${profile.ratePerKm || "0"} €`);

        const headerBottomY = 140;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(margin, headerBottomY, pageWidth - margin, headerBottomY);

        // Odometer summary card
        const zipOdoRatio = displayOdoRatio;
        let tableStartY = headerBottomY + 18;
        if (zipOdoRatio) {
          const cardH = 62;
          const cardY = headerBottomY + 6;
          doc.setFillColor(248, 248, 248);
          doc.roundedRect(margin, cardY, availableWidth, cardH, 2, 2, "F");
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.3);
          doc.roundedRect(margin, cardY, availableWidth, cardH, 2, 2, "S");

          // Title row
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.setTextColor(100, 100, 100);
          doc.text(t("odometer.calcTitle").toUpperCase(), margin + 8, cardY + 12);

          // Metrics row 1 — totalKm, workKm, privateKm with bold values
          doc.setTextColor(30, 30, 30);
          const mX = margin + 8;
          const mY1 = cardY + 26;
          const metricItems = [
            { label: t("odometer.totalKm"), value: `${Number(zipOdoRatio.totalKm).toFixed(0)} km` },
            { label: t("odometer.workKm"), value: `${Number(zipOdoRatio.workKm).toFixed(0)} km` },
            { label: t("odometer.privateKm"), value: `${Number(zipOdoRatio.privateKm).toFixed(0)} km` },
          ];
          const mColW = (availableWidth - 16) / 3;
          metricItems.forEach((item, i) => {
            drawMetricBold(mX + mColW * i, mY1, item.label, item.value);
          });

          // Metrics row 2 — workPct
          const mY2 = cardY + 40;
          drawMetricBold(mX, mY2, t("odometer.workPct"), `${Number(zipOdoRatio.pct).toFixed(1)} %`);

          // Footer note
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(140, 140, 140);
          const zipIsSingle = zipOdoRatio.startSnapshot.id === zipOdoRatio.endSnapshot.id;
          const zipNote = zipIsSingle
            ? `${zipOdoRatio.startSnapshot.snapshot_date} | ${Number(zipOdoRatio.startSnapshot.reading_km).toFixed(0)}${zipOdoRatio.startSnapshot.extraction_status === "user_edited" ? " (mod.)" : ""} km`
            : `${zipOdoRatio.startSnapshot.snapshot_date} \u2192 ${zipOdoRatio.endSnapshot.snapshot_date}  |  ${Number(zipOdoRatio.startSnapshot.reading_km).toFixed(0)} \u2192 ${Number(zipOdoRatio.endSnapshot.reading_km).toFixed(0)} km`;
          doc.text(zipNote, mX, cardY + 52);

          doc.setDrawColor(0, 0, 0);
          doc.setTextColor(0, 0, 0);
          tableStartY = cardY + cardH + 12;
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);

        // Simple proportional widths for portrait A4
        const fixedWidths = [55, 82, 0, 55, 72, 72];
        const fixedTotal = fixedWidths.reduce((a, b) => a + b, 0);
        fixedWidths[2] = availableWidth - fixedTotal;
        const columnWidths = fixedWidths;
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
          theme: "plain",
          styles: { 
            font: "helvetica",
            fontSize: 9, 
            cellPadding: { top: 5, right: 4, bottom: 5, left: 4 }, 
            textColor: [0, 0, 0], 
            valign: "middle",
            overflow: "linebreak",
            lineWidth: { bottom: 0.3 },
            lineColor: [220, 220, 220],
          },
          headStyles: { 
            font: "helvetica",
            fillColor: [255, 255, 255], 
            textColor: [0, 0, 0], 
            fontStyle: "bold", 
            fontSize: 9,
            valign: "middle",
            cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
            lineWidth: { bottom: 0.5 },
            lineColor: [160, 160, 160],
          },
          footStyles: { 
            font: "helvetica",
            fillColor: [255, 255, 255], 
            textColor: [0, 0, 0], 
            fontSize: 9,
            fontStyle: "bold",
            lineWidth: { top: 0.8 },
            lineColor: [0, 0, 0],
          },
          margin: { left: margin, right: margin },
          columnStyles: {
            0: { cellWidth: columnWidths[0] },
            1: { cellWidth: columnWidths[1] },
            2: { cellWidth: columnWidths[2], overflow: "linebreak" },
            3: { cellWidth: columnWidths[3], halign: "center" },
            4: { cellWidth: columnWidths[4], halign: "right" },
            5: { cellWidth: columnWidths[5], halign: "right" },
          },
          didDrawPage: (data: { table?: { head?: Array<{ cells?: Record<string, { x: number; width: number; y: number; height: number }> }> } }) => {
            if (data.table?.head?.[0]) {
              const headerCells = data.table.head[0].cells;
              if (headerCells) {
                const firstCell = headerCells[0];
                const lastCell = headerCells[Object.keys(headerCells).length - 1];
                if (firstCell && lastCell) {
                  doc.setDrawColor(180, 180, 180);
                  doc.setLineWidth(0.5);
                  doc.line(firstCell.x, firstCell.y + firstCell.height, lastCell.x + lastCell.width, lastCell.y + lastCell.height);
                }
              }
            }
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
    <div className="min-h-screen bg-background print:bg-white print:min-h-0">
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
      <div className="p-4 sm:p-6 overflow-auto print:p-0 print:m-0 print:overflow-visible print:bg-white print:text-black">
        <div className="max-w-[1800px] mx-auto print:max-w-none print:m-0">
          <div className="bg-slate-800 text-white rounded-lg p-4 sm:p-6 lg:p-8 print:bg-white print:text-black print:rounded-none print:p-2 print:shadow-none">
            {/* Report Header */}
            <div className="text-center mb-6">
              <h1 className="text-lg sm:text-xl font-bold mb-1 print:text-black">{t("reportView.reportTitle")}</h1>
              <p className="text-xs sm:text-sm text-slate-300 print:text-black">
                {t("reportView.periodLabel")}: {period}
              </p>
              <p className="text-[10px] text-slate-400 print:text-gray-400 mt-1">Fahrtenbuch Pro</p>
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
              <table className="w-full text-xs sm:text-sm min-w-[700px] print:min-w-0 print:text-[9pt] print:leading-normal table-fixed print:table-auto">
                <colgroup className="print:hidden">
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "32%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "14%" }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-600 print:border-gray-300">
                    <th className="text-left py-3 px-2 print:py-2 print:px-2 font-semibold whitespace-nowrap text-white print:text-black">{t("reportView.colDate")}</th>
                    <th className="text-left py-3 px-2 print:py-2 print:px-2 font-semibold whitespace-nowrap text-white print:text-black">{t("reportView.colProject")}</th>
                    <th className="text-left py-3 px-2 print:py-2 print:px-2 font-semibold hidden md:table-cell print:hidden leading-tight text-white">
                      {companyOrClientLabelHtml}
                    </th>
                    <th className="text-left py-3 px-2 print:py-2 print:px-2 font-semibold whitespace-nowrap text-white print:text-black">{t("reportView.colRoute")}</th>
                    <th className="text-center py-3 px-2 print:py-2 print:px-2 font-semibold whitespace-nowrap hidden sm:table-cell print:table-cell text-white print:text-black">
                      {t("reportView.colPassengersShort")}
                    </th>
                    <th className="text-right py-3 px-2 print:py-2 print:px-2 font-semibold whitespace-nowrap text-white print:text-black">{t("reportView.colDistanceKm")}</th>
                    <th className="text-right py-3 px-2 print:py-2 print:px-2 font-semibold whitespace-nowrap text-white print:text-black">{t("reportView.colReimbursement")}</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((trip, index) => (
                    <tr key={index} className={`border-b border-slate-700/50 print:border-gray-200 ${index % 2 === 1 ? 'bg-muted/30' : ''}`}>
                      <td className="py-3 sm:py-4 px-2 print:py-2 print:px-2 align-top whitespace-nowrap print:text-black">
                        {trip.date}
                      </td>
                      <td className="py-3 sm:py-4 px-2 print:py-2 print:px-2 align-top overflow-hidden text-ellipsis whitespace-nowrap print:text-black">
                        {trip.project}
                      </td>
                      <td className="py-3 sm:py-4 px-2 print:py-2 print:px-2 align-top hidden md:table-cell print:hidden overflow-hidden text-ellipsis whitespace-nowrap">
                        {trip.producer}
                      </td>
                      <td className="py-3 sm:py-4 px-2 print:py-2 print:px-2 align-top text-slate-300 max-w-[200px] sm:max-w-none truncate sm:whitespace-normal print:text-black print:max-w-none print:whitespace-normal print:break-words print:overflow-visible">
                        <span className="hidden print:inline">{trip.route.join(" > ")}</span>
                        <span className="print:hidden">{trip.route.join(" -> ")}</span>
                      </td>
                      <td className="py-3 sm:py-4 px-2 print:py-2 print:px-2 align-top text-center hidden sm:table-cell print:table-cell print:text-black">
                        {trip.passengers}
                      </td>
                      <td className="py-3 sm:py-4 px-2 print:py-2 print:px-2 align-top text-right whitespace-nowrap print:text-black">
                        {trip.distance.toFixed(1)} <span className="hidden print:inline">km</span>
                      </td>
                      <td className="py-3 sm:py-4 px-2 print:py-2 print:px-2 align-top text-right font-semibold whitespace-nowrap text-green-500 print:text-black">
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
                  <tr className="hidden print:table-row border-t border-gray-300">
                    <td colSpan={3} className="py-2 px-2">
                    </td>
                    <td className="py-2 px-2 text-right font-bold print:text-black">
                      {t("reportView.totalShort")}:
                    </td>
                    <td className="py-2 px-2 text-right font-bold print:text-black whitespace-nowrap">
                      {totalDistance.toFixed(1)} km
                    </td>
                    <td className="py-2 px-2 text-right font-bold print:text-black whitespace-nowrap">
                      {totalReimbursement.toFixed(2)} €
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
