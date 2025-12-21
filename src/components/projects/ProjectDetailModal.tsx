import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Car, Calendar, Route, Leaf, FileText, Sparkles, Eye, Trash2, Upload, Receipt } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ProjectDocument {
  id: string;
  name: string;
  type: "call-sheet" | "invoice";
}

interface ProjectDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: {
    id: string;
    name: string;
    totalKm: number;
    shootingDays: number;
    kmPerDay: number;
    co2Emissions: number;
    callSheets: ProjectDocument[];
    invoices: ProjectDocument[];
    totalInvoiced: number;
  } | null;
}

export function ProjectDetailModal({ open, onOpenChange, project }: ProjectDetailModalProps) {
  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl font-semibold">{project.name}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-80px)]">
          <div className="px-6 pb-6 space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Kilómetros totales</p>
                <div className="flex items-center gap-2">
                  <Car className="w-5 h-5 text-primary" />
                  <span className="text-xl font-bold">{project.totalKm.toFixed(1)} km</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Días de rodaje</p>
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-muted-foreground" />
                  <span className="text-xl font-bold">{project.shootingDays}</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Km por día de rodaje</p>
                <div className="flex items-center gap-2">
                  <Route className="w-5 h-5 text-success" />
                  <span className="text-xl font-bold">{project.kmPerDay.toFixed(1)} km</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Emisiones CO₂ Est.</p>
                <div className="flex items-center gap-2">
                  <Leaf className="w-5 h-5 text-warning" />
                  <span className="text-xl font-bold">{project.co2Emissions.toFixed(1)} kg</span>
                </div>
              </div>
            </div>

            {/* Call Sheets Section */}
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-medium">Hojas de llamada del proyecto</h3>
                </div>
                <Button variant="outline" size="sm" className="text-primary border-primary hover:bg-primary/10">
                  <FileText className="w-4 h-4 mr-2" />
                  Subir hojas de llamada (hasta 20)
                </Button>
              </div>

              {project.callSheets.length > 0 ? (
                <div className="space-y-2">
                  {project.callSheets.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{doc.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary">
                          <Sparkles className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-info hover:text-info">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Aún no hay hojas de llamada subidas para este proyecto.
                </p>
              )}
            </div>

            {/* Invoices Section */}
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-medium">Facturas del proyecto</h3>
                </div>
                <Button size="sm" className="bg-primary hover:bg-primary/90">
                  <Upload className="w-4 h-4 mr-2" />
                  Adjuntar factura
                </Button>
              </div>

              <p className="text-sm mb-3">
                Total documentado: <span className="font-semibold">{project.totalInvoiced.toFixed(2)} €</span>
              </p>

              {project.invoices.length > 0 ? (
                <div className="space-y-2">
                  {project.invoices.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{doc.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-info hover:text-info">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Aún no hay facturas subidas para este proyecto.
                </p>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}