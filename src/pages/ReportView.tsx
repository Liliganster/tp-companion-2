import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Printer, ArrowLeft, FileSpreadsheet, FileText, FileDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTrips } from "@/contexts/TripsContext";
import { useProjects } from "@/contexts/ProjectsContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useI18n } from "@/hooks/use-i18n";

interface ReportTrip {
  date: string;
  project: string;
  producer: string;
  route: string[];
  passengers: number;
  distance: number;
}

// Mock report data
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

export default function ReportView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { profile } = useUserProfile();
  const { t, tf, locale } = useI18n();
  const { trips: allTrips } = useTrips();
  const { projects } = useProjects();
  
  const period = searchParams.get("period") || "19-11-2019 - 02-12-2025";
  const driver = searchParams.get("driver") || profile.fullName;
  const address = searchParams.get("address") || [profile.baseAddress, profile.city].filter(Boolean).join(", ");
  const licensePlate = searchParams.get("licensePlate") || profile.licensePlate;
  const rawProjectParam = searchParams.get("project") ?? "all";
  const selectedMonth = searchParams.get("month") || "";
  const selectedYear = searchParams.get("year") || "";

  const normalizeProjectParam = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "all";
    const lower = trimmed.toLowerCase();
    if (trimmed === "all" || lower === "todos los proyectos" || lower === "all projects" || lower === "alle projekte") return "all";
    return trimmed;
  };

  const projectFilter = normalizeProjectParam(rawProjectParam);
  const projectLabel = projectFilter === "all" ? t("reports.allProjects") : projectFilter;

  const getTripTime = (date: string) => {
    const time = Date.parse(date);
    return Number.isFinite(time) ? time : 0;
  };

  const monthIndex = selectedMonth ? Math.max(0, Math.min(11, Number.parseInt(selectedMonth, 10) - 1)) : null;
  const yearValue = selectedYear ? Number.parseInt(selectedYear, 10) : null;

  const filteredTrips = allTrips
    .filter((t) => {
      const time = getTripTime(t.date);
      if (!time) return false;
      const d = new Date(time);
      const matchesPeriod =
        monthIndex == null || yearValue == null ? true : d.getFullYear() === yearValue && d.getMonth() === monthIndex;
      const matchesProject = projectFilter === "all" || t.project === projectFilter;
      return matchesPeriod && matchesProject;
    })
    .sort((a, b) => getTripTime(a.date) - getTripTime(b.date) || a.id.localeCompare(b.id));

  const reportTrips: ReportTrip[] = filteredTrips.map((trip) => {
    const time = getTripTime(trip.date);
    const dateLabel = time
      ? new Date(time).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })
      : trip.date;
    const producer = projects.find((p) => p.name === trip.project)?.producer ?? "";

    return {
      date: dateLabel,
      project: trip.project,
      producer,
      route: trip.route,
      passengers: trip.passengers,
      distance: trip.distance,
    };
  });

  const trips = reportTrips;
  const totalDistance = trips.reduce((acc, trip) => acc + trip.distance, 0);

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

  const headers = [
    t("reportView.colDate"),
    t("reportView.colProject"),
    t("reportView.colCompanyProducer"),
    t("reportView.colRoute"),
    t("reportView.colPassengers"),
    t("reportView.colDistanceKm"),
  ];
  const rows = trips.map((trip) => [
    trip.date,
    trip.project,
    trip.producer,
    trip.route.join(" -> "),
    trip.passengers,
    trip.distance,
  ]);

  const handleExport = (format: "excel" | "pdf" | "csv") => {
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
        const margin = 48;
        const headerBottomY = 112;

        const drawLabelValueLeft = (x: number, y: number, label: string, value: string) => {
          const labelText = `${label}: `;
          doc.setFont("helvetica", "bold");
          doc.text(labelText, x, y);
          const labelWidth = doc.getTextWidth(labelText);
          doc.setFont("helvetica", "normal");
          doc.text(value, x + labelWidth, y, { maxWidth: pageWidth / 2 - margin - (x + labelWidth) });
        };

        const drawLabelValueRight = (rightEdge: number, y: number, label: string, value: string) => {
          const labelText = `${label}: `;
          doc.setFont("helvetica", "normal");
          const valueWidth = doc.getTextWidth(value);
          doc.setFont("helvetica", "bold");
          const labelWidth = doc.getTextWidth(labelText);
          const minStartX = pageWidth / 2 + 20;
          const startX = Math.max(minStartX, rightEdge - (labelWidth + valueWidth));
          doc.text(labelText, startX, y);
          doc.setFont("helvetica", "normal");
          doc.text(value, startX + labelWidth, y, { maxWidth: rightEdge - (startX + labelWidth) });
        };

        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text(t("reportView.reportTitle"), pageWidth / 2, 44, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.text(`${t("reportView.periodLabel")}: ${period}`, pageWidth / 2, 64, { align: "center" });

        const leftX = margin;
        const rightEdge = pageWidth - margin;
        const metaY1 = 86;
        const metaY2 = 104;

        drawLabelValueLeft(leftX, metaY1, t("reportView.driverLabel"), driver);
        drawLabelValueLeft(leftX, metaY2, t("reportView.addressLabel"), address);

        drawLabelValueRight(rightEdge, metaY1, t("reportView.licensePlateLabel"), licensePlate);
        drawLabelValueRight(rightEdge, metaY2, t("reportView.projectLabel"), projectLabel);

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.line(margin, headerBottomY, pageWidth - margin, headerBottomY);

        autoTable(doc, {
          head: [headers],
          body: rows.map((r) => [r[0], r[1], r[2], r[3], String(r[4] ?? ""), String(r[5] ?? "")]),
          foot: [
            [
              { content: `${t("reportView.totalDistanceLabel")}:`, colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
              { content: `${totalDistance.toFixed(1)} km`, styles: { halign: "right", fontStyle: "bold" } },
            ],
          ],
          startY: headerBottomY + 18,
          theme: "grid",
          styles: { fontSize: 9, cellPadding: 4, textColor: 0, lineColor: 0, lineWidth: 0.5 },
          headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: "bold", lineColor: 0, lineWidth: 0.5 },
          footStyles: { fillColor: [255, 255, 255], textColor: 0, lineColor: 0, lineWidth: 0.5 },
          margin: { left: margin, right: margin },
          columnStyles: {
            0: { cellWidth: 70 },
            1: { cellWidth: 100 },
            2: { cellWidth: 140 },
            3: { cellWidth: 270 },
            4: { cellWidth: 80, halign: "center" },
            5: { cellWidth: 90, halign: "right" },
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 sm:px-6 py-4 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
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
        <div className="max-w-7xl mx-auto print:max-w-none">
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
                  <span className="font-semibold">{t("reportView.addressLabel")}:</span> {address}
                </p>
              </div>
              <div className="sm:text-right">
                <p>
                  <span className="font-semibold">{t("reportView.licensePlateLabel")}:</span> {licensePlate}
                </p>
                <p>
                  <span className="font-semibold">{t("reportView.projectLabel")}:</span> {projectLabel}
                </p>
              </div>
            </div>

            <hr className="hidden print:block border-black mb-4" />

            {/* Report Table */}
            <div className="overflow-x-auto -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 print:overflow-visible print:mx-0 print:px-0">
              <table className="w-full text-xs sm:text-sm min-w-[600px] print:min-w-0 print:text-[11px]">
                <thead>
                  <tr className="border-b border-slate-600 print:border-black">
                    <th className="text-left py-3 px-2 font-semibold whitespace-nowrap">{t("reportView.colDate")}</th>
                    <th className="text-left py-3 px-2 font-semibold whitespace-nowrap">{t("reportView.colProject")}</th>
                    <th className="text-left py-3 px-2 font-semibold whitespace-nowrap hidden md:table-cell">
                      {t("reportView.colCompanyProducer")}
                    </th>
                    <th className="text-left py-3 px-2 font-semibold whitespace-nowrap">{t("reportView.colRoute")}</th>
                    <th className="text-center py-3 px-2 font-semibold whitespace-nowrap hidden sm:table-cell">
                      {t("reportView.colPassengers")}
                    </th>
                    <th className="text-right py-3 px-2 font-semibold whitespace-nowrap">{t("reportView.colDistance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((trip, index) => (
                    <tr key={index} className="border-b border-slate-700/50 print:border-black">
                      <td className="py-3 sm:py-4 px-2 align-top whitespace-nowrap">
                        {trip.date}
                      </td>
                      <td className="py-3 sm:py-4 px-2 align-top">
                        {trip.project}
                      </td>
                      <td className="py-3 sm:py-4 px-2 align-top hidden md:table-cell">
                        {trip.producer}
                      </td>
                      <td className="py-3 sm:py-4 px-2 align-top text-slate-300 max-w-[200px] sm:max-w-none truncate sm:whitespace-normal print:text-black print:truncate-none print:max-w-none print:whitespace-normal print:break-words">
                        {trip.route.join(" -> ")}
                      </td>
                      <td className="py-3 sm:py-4 px-2 align-top text-center hidden sm:table-cell">
                        {trip.passengers}
                      </td>
                      <td className="py-3 sm:py-4 px-2 align-top text-right font-semibold whitespace-nowrap">
                        {trip.distance.toFixed(1)} km
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-500 print:border-black">
                    <td colSpan={5} className="py-4 px-2 text-right font-semibold hidden sm:table-cell">
                      {t("reportView.totalDistanceLabel")}:
                    </td>
                    <td className="py-4 px-2 text-left font-semibold sm:hidden" colSpan={3}>
                      {t("reportView.totalShort")}:
                    </td>
                    <td className="py-4 px-2 text-right font-bold text-base sm:text-lg whitespace-nowrap">
                      {totalDistance.toFixed(1)} km
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
