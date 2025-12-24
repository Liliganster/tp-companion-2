import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Car, Calendar, Route, Leaf, FileText, Sparkles, Eye, Trash2, Upload, Receipt } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/hooks/use-i18n";
import { tf } from "@/lib/i18n";
import { supabase } from "@/lib/supabaseClient";

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
  const { t, locale, language } = useI18n();
  const [realCallSheets, setRealCallSheets] = useState<ProjectDocument[]>([]);

  useEffect(() => {
    if (open && project?.name) {
      const fetchCallSheets = async () => {
        const { data, error } = await supabase
          .from("callsheet_results")
          .select("job_id, project_value, callsheet_jobs!inner(id, storage_path, created_at)")
          .ilike("project_value", project.name.trim());

        if (error) {
          console.error("Error fetching project callsheets:", error);
          return;
        }

        const mapped: ProjectDocument[] = (data || []).map((item: any) => {
           const job = item.callsheet_jobs;
           const path = job.storage_path || "Unknown";
           const name = path.split("/").pop() || path;
           return {
             id: job.id,
             name: name,
             type: "call-sheet"
           };
        });
        
        // Remove duplicates if any
        const unique = mapped.filter((v, i, a) => a.findIndex(v2 => v2.id === v.id) === i);
        setRealCallSheets(unique);
      };

      fetchCallSheets();
    } else {
        setRealCallSheets([]);
    }
  }, [open, project?.name]);

  if (!project) return null;

  const allCallSheets = [...(project.callSheets || []), ...realCallSheets];
  const uniqueCallSheets = allCallSheets.filter((v, i, a) => a.findIndex(v2 => v2.id === v.id) === i);

  const totalInvoicedLabel = `${project.totalInvoiced.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl font-semibold">{project.name}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-80px)]">
          <div className="px-6 pb-6 space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">{t("projectDetail.totalKm")}</p>
                <div className="flex items-center gap-2">
                  <Car className="w-5 h-5 text-primary" />
                  <span className="text-xl font-bold">{project.totalKm.toFixed(1)} km</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">{t("projectDetail.shootingDays")}</p>
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-muted-foreground" />
                  <span className="text-xl font-bold">{project.shootingDays}</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">{t("projectDetail.kmPerDay")}</p>
                <div className="flex items-center gap-2">
                  <Route className="w-5 h-5 text-success" />
                  <span className="text-xl font-bold">{project.kmPerDay.toFixed(1)} km</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">{t("projectDetail.co2Estimated")}</p>
                <div className="flex items-center gap-2">
                  <Leaf className="w-5 h-5 text-warning" />
                  <span className="text-xl font-bold">{project.co2Emissions.toFixed(1)} kg</span>
                </div>
              </div>
            </div>

            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-medium">{t("projectDetail.callSheetsTitle")}</h3>
                </div>
                <Button variant="outline" size="sm" className="text-primary border-primary hover:bg-primary/10">
                  <FileText className="w-4 h-4 mr-2" />
                  {t("projectDetail.uploadCallSheets")}
                </Button>
              </div>

              {uniqueCallSheets.length > 0 ? (
                <div className="space-y-2">
                  {uniqueCallSheets.map((doc) => (
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
                <p className="text-sm text-muted-foreground italic">{t("projectDetail.noCallSheets")}</p>
              )}
            </div>

            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-medium">{t("projectDetail.invoicesTitle")}</h3>
                </div>
                <Button size="sm" className="bg-primary hover:bg-primary/90">
                  <Upload className="w-4 h-4 mr-2" />
                  {t("projectDetail.attachInvoice")}
                </Button>
              </div>

              <p className="text-sm mb-3">
                {tf(language, "tripDetail.totalDocumented", { amount: totalInvoicedLabel })}
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
                <p className="text-sm text-muted-foreground italic">{t("projectDetail.noInvoices")}</p>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
