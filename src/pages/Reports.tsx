import { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  Download,
  Printer,
  Calendar,
  CheckCircle,
  Clock,
  Eye,
  AlertTriangle,
  Check,
  Trash2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

interface Report {
  id: string;
  period: string;
  project: string;
  totalKm: number;
  trips: number;
  generatedAt: string;
  status: "complete" | "pending";
}

interface TripWarning {
  tripId: string;
  date: string;
  route: string;
  warning: string;
}

const mockReports: Report[] = [
  {
    id: "1",
    period: "19-11-2019 - 02-12-2025",
    project: "Todos los proyectos",
    totalKm: 2840,
    trips: 12,
    generatedAt: "2025-12-21T10:30:00",
    status: "complete",
  },
];

// Mock warnings
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

export default function Reports() {
  const navigate = useNavigate();
  const [selectedProject, setSelectedProject] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("01");
  const [selectedYear, setSelectedYear] = useState("2024");
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [warnings, setWarnings] = useState<TripWarning[]>([]);
  const { toast } = useToast();

  const handleGenerateClick = () => {
    if (selectedMonth === "01" && selectedProject === "all") {
      setWarnings(mockWarnings);
    } else {
      setWarnings([]);
    }
    setVerificationModalOpen(true);
  };

  const handleGenerateReport = () => {
    setVerificationModalOpen(false);
    toast({
      title: "Informe generado",
      description: "El informe fiscal se ha generado correctamente.",
    });
    navigateToReportView();
  };

  const navigateToReportView = () => {
    const params = new URLSearchParams({
      period: "19-11-2019 - 02-12-2025",
      driver: "lilianmartinez357",
      address: "Laurenzgasse, 6/31, Wien",
      licensePlate: "W-123AB",
      project: getProjectName(selectedProject),
    });
    navigate(`/reports/view?${params.toString()}`);
  };

  const getProjectName = (value: string) => {
    const projects: Record<string, string> = {
      all: "Todos los proyectos",
      film: "Film Production XY",
      client: "Client ABC",
      internal: "Internal",
    };
    return projects[value] || value;
  };

  const getMonthName = (month: string) => {
    const date = new Date(2024, parseInt(month) - 1);
    return date.toLocaleString("es", { month: "long" });
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              Reports
            </h1>
            <p className="text-muted-foreground mt-1">
              Generate and manage mileage reports
            </p>
          </div>
        </div>

        {/* Report Generator */}
        <div className="glass-card p-6 animate-fade-in animation-delay-100">
          <h2 className="font-semibold text-lg mb-4">Generate New Report</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  <SelectItem value="film">Film Production XY</SelectItem>
                  <SelectItem value="client">Client ABC</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Month</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i} value={String(i + 1).padStart(2, "0")}>
                      {new Date(2024, i).toLocaleString("en", { month: "long" })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Year</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2023">2023</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button className="w-full" onClick={handleGenerateClick}>
                <FileText className="w-4 h-4" />
                Generate Report
              </Button>
            </div>
          </div>
        </div>

        {/* Reports Table */}
        <div className="glass-card overflow-hidden animate-fade-in animation-delay-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left py-3 px-4 w-12">
                    <Checkbox />
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase text-muted-foreground whitespace-nowrap">
                    Generado el
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase text-muted-foreground whitespace-nowrap">
                    Período del informe
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                    Proyecto
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold uppercase text-muted-foreground whitespace-nowrap">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {mockReports.map((report) => (
                  <tr key={report.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="py-4 px-4">
                      <Checkbox />
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      {new Date(report.generatedAt).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      {report.period}
                    </td>
                    <td className="py-4 px-4 hidden sm:table-cell">
                      {report.project}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="link"
                          size="sm"
                          className="text-primary h-auto p-0"
                          onClick={navigateToReportView}
                        >
                          Ver
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive h-8 w-8"
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
        </div>
      </div>

      {/* Verification Modal */}
      <Dialog open={verificationModalOpen} onOpenChange={setVerificationModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generar informe fiscal</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
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
                          {warning.date} • {warning.warning}
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

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setVerificationModalOpen(false)}
            >
              Atrás
            </Button>
            <Button
              className="flex-1"
              onClick={handleGenerateReport}
            >
              Generar informe
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
