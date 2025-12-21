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
  
  const period = searchParams.get("period") || "19-11-2019 - 02-12-2025";
  const driver = searchParams.get("driver") || "lilianmartinez357";
  const address = searchParams.get("address") || "Laurenzgasse, 6/31, Wien";
  const licensePlate = searchParams.get("licensePlate") || "W-123AB";
  const projectFilter = searchParams.get("project") || "Todos los proyectos";

  const trips = mockReportTrips;
  const totalDistance = trips.reduce((acc, trip) => acc + trip.distance, 0);

  const handleExport = (format: "excel" | "pdf" | "csv") => {
    const formatNames = {
      excel: "Excel",
      pdf: "PDF",
      csv: "CSV",
    };
    toast({
      title: `Exportando a ${formatNames[format]}`,
      description: "El archivo se descargará en breve.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => navigate("/reports")} className="px-2 sm:px-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Volver a informes</span>
            <span className="sm:hidden">Volver</span>
          </Button>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Exportar</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover">
                <DropdownMenuItem onClick={() => handleExport("excel")}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf")}>
                  <FileText className="w-4 h-4 mr-2" />
                  PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("csv")}>
                  <FileDown className="w-4 h-4 mr-2" />
                  CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm">
              <Printer className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Imprimir</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="p-4 sm:p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <div className="bg-slate-800 text-white rounded-lg p-4 sm:p-6 lg:p-8">
            {/* Report Header */}
            <div className="text-center mb-6">
              <h1 className="text-lg sm:text-xl font-bold mb-1">Registro de viajes / Fahrtenbuch</h1>
              <p className="text-xs sm:text-sm text-slate-300">Período: {period}</p>
            </div>

            {/* Report Meta Info */}
            <div className="flex flex-col sm:flex-row sm:justify-between gap-3 mb-6 text-xs sm:text-sm">
              <div>
                <p><span className="font-semibold">Conductor:</span> {driver}</p>
                <p><span className="font-semibold">Dirección:</span> {address}</p>
              </div>
              <div className="sm:text-right">
                <p><span className="font-semibold">Matrícula(s):</span> {licensePlate}</p>
                <p><span className="font-semibold">Proyecto:</span> {projectFilter}</p>
              </div>
            </div>

            {/* Report Table */}
            <div className="overflow-x-auto -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
              <table className="w-full text-xs sm:text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-600">
                    <th className="text-left py-3 px-2 font-semibold whitespace-nowrap">Fecha</th>
                    <th className="text-left py-3 px-2 font-semibold whitespace-nowrap">Proyecto</th>
                    <th className="text-left py-3 px-2 font-semibold whitespace-nowrap hidden md:table-cell">Empresa/Productor</th>
                    <th className="text-left py-3 px-2 font-semibold whitespace-nowrap">Ruta</th>
                    <th className="text-center py-3 px-2 font-semibold whitespace-nowrap hidden sm:table-cell">Pasajeros</th>
                    <th className="text-right py-3 px-2 font-semibold whitespace-nowrap">Distancia</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((trip, index) => (
                    <tr key={index} className="border-b border-slate-700/50">
                      <td className="py-3 sm:py-4 px-2 align-top whitespace-nowrap">
                        {trip.date}
                      </td>
                      <td className="py-3 sm:py-4 px-2 align-top">
                        {trip.project}
                      </td>
                      <td className="py-3 sm:py-4 px-2 align-top hidden md:table-cell">
                        {trip.producer}
                      </td>
                      <td className="py-3 sm:py-4 px-2 align-top text-slate-300 max-w-[200px] sm:max-w-none truncate sm:whitespace-normal">
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
                  <tr className="border-t-2 border-slate-500">
                    <td colSpan={5} className="py-4 px-2 text-right font-semibold hidden sm:table-cell">
                      Total de kilómetros recorridos:
                    </td>
                    <td className="py-4 px-2 text-left font-semibold sm:hidden" colSpan={3}>
                      Total:
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
