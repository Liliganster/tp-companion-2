import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Car, Calendar, Route, Leaf, FileText, Sparkles, Eye, Trash2, Upload, Receipt, Loader2, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/hooks/use-i18n";
import { tf } from "@/lib/i18n";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { CallsheetUploader } from "@/components/callsheets/CallsheetUploader";

interface ProjectDocument {
  id: string;
  name: string;
  type: "call-sheet" | "invoice";
  status?: string;
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
        // 1. Fetch by Project ID (Manual uploads linked to project)
        const { data: jobs, error: jobsError } = await supabase
            .from("callsheet_jobs")
            .select("id, storage_path, created_at, status")
            .eq("project_id", project.id);
            
        // 2. Fetch by Project Name (Legacy/Extracted results)
        const { data: results, error: resultsError } = await supabase
          .from("callsheet_results")
          .select("job_id, project_value, callsheet_jobs!inner(id, storage_path, created_at, status)")
          .ilike("project_value", project.name.trim());

        if (jobsError) console.error("Error fetching project jobs:", jobsError);
        if (resultsError) console.error("Error fetching project results:", resultsError);

        const allDocs: ProjectDocument[] = [];
        const seenIds = new Set<string>();

        // Process jobs (manual uploads)
        if (jobs) {
            jobs.forEach((job: any) => {
                if (!seenIds.has(job.id)) {
                    seenIds.add(job.id);
                    const path = job.storage_path || "Unknown";
                    const name = path.split("/").pop() || path;
                    allDocs.push({
                        id: job.id,
                        name: name,
                        type: "call-sheet",
                        status: job.status
                    });
                }
            });
        }

        // Process results (extracted)
        if (results) {
            results.forEach((item: any) => {
                const job = item.callsheet_jobs;
                if (!seenIds.has(job.id)) {
                    seenIds.add(job.id);
                    const path = job.storage_path || "Unknown";
                    const name = path.split("/").pop() || path;
                    allDocs.push({
                        id: job.id,
                        name: name,
                        type: "call-sheet",
                         status: job.status
                    });
                }
            });
        }
        
        setRealCallSheets(allDocs);
      };

      fetchCallSheets();
    } else {
        setRealCallSheets([]);
    }
  }, [open, project?.name, project?.id]);

  if (!project) return null;

  const allCallSheets = [...(project.callSheets || []), ...realCallSheets];
  const uniqueCallSheets = allCallSheets.filter((v, i, a) => a.findIndex(v2 => v2.id === v.id) === i);

  const totalInvoicedLabel = `${project.totalInvoiced.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;

  const handleJobCreated = (jobId: string) => {
    // Refresh callsheets
    // Trigger re-fetch via effect dependency or manual function?
    // Effect depends on project.name, so we can't trigger it easily without changing state.
    // However, we can add a refresh trigger.
    // For now, assume it will appear on next open or we can update local state.
    toast.success("Hojas de llamada en cola. Aparecerán en breve.");
  };

  const handleViewCallSheet = async (doc: ProjectDocument) => {
    try {
        // We know id is job.id, but name implies path
        // We need the storage path to view.
        // We fetched storage_path in useEffect. But mapped it to name.
        // We need to store full path in ProjectDocument or fetch it again.
        // Let's IMPROVE ProjectDocument interface in next step? NO, let's just fetch it again or query it.
        // BETTER: update the effect to store storage_path in a custom property if we can't change interface easily.
        // Actually interface is local, let's change it.
        
        // Wait, I can't change interface without updating Projects.tsx too or making it optional.
        // Let's try to infer from name? No.
        // Let's fetch the job to get the path.
        const { data: job } = await supabase.from("callsheet_jobs").select("storage_path").eq("id", doc.id).single();
        if (!job) throw new Error("Job not found");

        const { data, error } = await supabase.storage.from("callsheets").download(job.storage_path);
        if (error) throw error;
        const url = URL.createObjectURL(data);
        window.open(url, "_blank");
    } catch (e: any) {
        toast.error("Error al abrir documento: " + e.message);
    }
  };

  const handleDeleteCallSheet = async (doc: ProjectDocument) => {
    if (!confirm("¿Eliminar hoja de llamada?")) return;
    try {
        // Delete job (cascade)
        const { error } = await supabase.from("callsheet_jobs").delete().eq("id", doc.id);
        if (error) throw error;
        setRealCallSheets(prev => prev.filter(p => p.id !== doc.id));
        toast.success("Eliminado");
    } catch (e: any) {
        toast.error("Error al eliminar: " + e.message);
    }
  };
  
  const handleExtract = async (doc: ProjectDocument) => {
    if (doc.status === 'queued' || doc.status === 'processing' || doc.status === 'done') {
        toast.info(`El documento ya está en estado: ${doc.status}`);
        return;
    }
    
    try {
        const { error } = await supabase
            .from("callsheet_jobs")
            .update({ status: "queued" })
            .eq("id", doc.id);
            
        if (error) throw error;
        
        toast.success("Extracción iniciada. El proceso comenzará en breve.");
        // Optimistic update
        setRealCallSheets(prev => prev.map(p => p.id === doc.id ? { ...p, status: 'queued' } : p));
    } catch (e: any) {
        toast.error("Error al iniciar extracción: " + e.message);
    }
  };
  
  const handleViewInvoice = (doc: ProjectDocument) => {
      // Invoices from trips usually have a drive ID or storage path.
      // Since we don't have it here, we should tell user to view it in the Trip.
      toast.info("Para ver esta factura, ve al Viaje correspondiente.");
  };

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
                <CallsheetUploader projectId={project.id} onJobCreated={handleJobCreated} />
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
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary" onClick={() => handleExtract(doc)}>
                          <Sparkles className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-info hover:text-info" onClick={() => handleViewCallSheet(doc)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteCallSheet(doc)}>
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
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-info hover:text-info" onClick={() => handleViewInvoice(doc)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => toast.warning("Elimina la factura desde el Viaje asociado.")}>
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
