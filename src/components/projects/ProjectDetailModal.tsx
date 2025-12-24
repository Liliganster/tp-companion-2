import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Car, Calendar, Route, Leaf, FileText, Sparkles, Eye, Trash2, Upload, Receipt } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/hooks/use-i18n";
import { tf } from "@/lib/i18n";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { CallsheetUploader } from "@/components/callsheets/CallsheetUploader";
import { ProjectInvoiceUploader } from "@/components/projects/ProjectInvoiceUploader";

interface ProjectDocument {
  id: string;
  name: string;
  type: "call-sheet" | "invoice" | "document" | "other";
  status?: string;
  storage_path?: string;
  needs_review_reason?: string;
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
  const [projectDocs, setProjectDocs] = useState<ProjectDocument[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (open && project?.name) {
      const fetchCallSheets = async () => {
        // 1. Fetch by Project ID (Manual uploads linked to project)
        const { data: jobs, error: jobsError } = await supabase
            .from("callsheet_jobs")
            .select("id, storage_path, created_at, status, needs_review_reason")
            .eq("project_id", project.id);
            
        // 2. Fetch by Project Name (Legacy/Extracted results)
        const { data: results, error: resultsError } = await supabase
          .from("callsheet_results")
          .select("job_id, project_value, callsheet_jobs!inner(id, storage_path, created_at, status, needs_review_reason)")
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
                        status: job.status,
                        storage_path: job.storage_path
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
                        status: job.status,
                        storage_path: job.storage_path
                    });
                }
            });
        }
        
        setRealCallSheets(allDocs);
      };

      const fetchProjectDocs = async () => {
          const { data, error } = await supabase
            .from("project_documents")
            .select("*")
            .eq("project_id", project.id);
            
          if (data) {
              setProjectDocs(data.map((d: any) => ({
                  id: d.id,
                  name: d.name,
                  type: (d.type as any) || "invoice",
                  storage_path: d.storage_path
              })));
          }
      };

      fetchCallSheets();
      if (project.id) fetchProjectDocs();
    } else {
        setRealCallSheets([]);
        setProjectDocs([]);
    }
  }, [open, project?.name, project?.id, refreshTrigger]);

  if (!project) return null;

  function uniqueDocuments(docs: ProjectDocument[]) {
      const map = new Map<string, ProjectDocument>();
      docs.forEach(d => map.set(d.id, d));
      return Array.from(map.values());
  }

  const allCallSheets = uniqueDocuments([...(project.callSheets || []), ...realCallSheets]);
  const allInvoices = uniqueDocuments([...(project.invoices || []), ...projectDocs]);

  const totalInvoicedLabel = `${project.totalInvoiced.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;

  const handleJobCreated = () => {
    setRefreshTrigger(p => p + 1);
    toast.success("Documento subido.");
  };
  
  const handleUploadComplete = () => {
     setRefreshTrigger(p => p + 1);
  };

  const handleViewCallSheet = async (doc: ProjectDocument) => {
     if (doc.storage_path) {
          try {
            const { data, error } = await supabase.storage.from("callsheets").download(doc.storage_path);
            if (error) throw error;
            const url = URL.createObjectURL(data);
            window.open(url, "_blank");
          } catch (e: any) {
            toast.error("Error al abrir PDF: " + e.message);
          }
     } else {
         toast.error("Ruta del archivo no disponible.");
     }
  };

  const handleDeleteCallSheet = async (doc: ProjectDocument) => {
      if (!confirm("¿Estás seguro de eliminar esta hoja de llamada? Se borrarán los datos asociados.")) return;
       try {
        const { error } = await supabase
            .from("callsheet_jobs")
            .delete()
            .eq("id", doc.id);
            
        if (error) throw error;
        
        toast.success("Hoja de llamada eliminada");
        setRealCallSheets(prev => prev.filter(p => p.id !== doc.id));
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
        setRealCallSheets(prev => prev.map(p => p.id === doc.id ? { ...p, status: 'queued' } : p));
    } catch (e: any) {
        toast.error("Error al iniciar extracción: " + e.message);
    }
  };

  const handleViewInvoice = async (doc: ProjectDocument) => {
      if (doc.storage_path) {
          // Project document (Project Invoices)
           try {
            const { data, error } = await supabase.storage.from("project_documents").download(doc.storage_path);
            if (error) throw error;
            const url = URL.createObjectURL(data);
            window.open(url, "_blank");
          } catch (e: any) {
            toast.error("Error al abrir documento: " + e.message);
          }
      } else {
          // Trip Invoice (likely linked to a trip)
          toast.info("Para ver esta factura, ve al Viaje correspondiente.");
      }
  };

  const handleDeleteInvoice = async (doc: ProjectDocument) => {
      if (doc.storage_path) {
          // Project document
           if (!confirm("¿Eliminar factura del proyecto?")) return;
            try {
                const { error } = await supabase.from("project_documents").delete().eq("id", doc.id);
                if (error) throw error;
                
                await supabase.storage.from("project_documents").remove([doc.storage_path]);
                
                setProjectDocs(prev => prev.filter(p => p.id !== doc.id));
                toast.success("Factura eliminada");
            } catch (e: any) {
                toast.error("Error al eliminar: " + e.message);
            }
      } else {
          toast.warning("Esta factura pertenece a un viaje. Elimínala desde el viaje asociado.");
      }
  };

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

            {/* Invoices */}
            <div className="glass-card p-4">
               <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-2">
                   <Receipt className="w-5 h-5 text-muted-foreground" />
                   <h3 className="font-medium">{t("projectDetail.invoicesTitle")}</h3>
                 </div>
                 <ProjectInvoiceUploader projectId={project.id} onUploadComplete={handleUploadComplete} />
               </div>

              <div className="space-y-2">
                {allInvoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t("projectDetail.noInvoices")}
                  </p>
                ) : (
                  allInvoices.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors group">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-sm truncate">{doc.name}</span>
                        {!doc.storage_path && <span className="text-[10px] text-muted-foreground bg-secondary px-1 rounded">Viaje</span>}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewInvoice(doc)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                         <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteInvoice(doc)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Call Sheets */}
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-medium">{t("projectDetail.callSheetsTitle")}</h3>
                </div>
                <CallsheetUploader projectId={project.id} onJobCreated={handleJobCreated} />
              </div>

              <div className="space-y-2">
                {allCallSheets.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t("projectDetail.noCallSheets")}
                  </p>
                ) : (
                  allCallSheets.map((sheet) => (
                    <div key={sheet.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors group">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-sm truncate">{sheet.name}</span>
                        {sheet.status && (
                            <span title={sheet.needs_review_reason} className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize cursor-help ${
                                sheet.status === 'done' ? 'bg-green-500/20 text-green-500' :
                                sheet.status === 'failed' ? 'bg-red-500/20 text-red-500' :
                                sheet.status === 'queued' ? 'bg-yellow-500/20 text-yellow-500' :
                                sheet.status === 'needs_review' ? 'bg-orange-500/20 text-orange-500' :
                                'bg-gray-500/20 text-gray-500'
                            }`}>
                                {sheet.status === 'needs_review' ? 'Revisar' : sheet.status}
                            </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {sheet.status !== 'done' && sheet.status !== 'queued' && sheet.status !== 'processing' && (
                             <Button variant="ghost" size="icon" className="h-8 w-8 text-yellow-500 hover:text-yellow-400" onClick={() => handleExtract(sheet)} title="Extraer datos con IA">
                                <Sparkles className="w-4 h-4" />
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewCallSheet(sheet)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteCallSheet(sheet)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
