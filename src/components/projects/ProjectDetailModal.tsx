import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Car, Calendar, Route, Leaf, FileText, Sparkles, Eye, Trash2, Upload, Receipt, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/hooks/use-i18n";
import { tf } from "@/lib/i18n";
import { supabase } from "@/lib/supabaseClient";
import { cascadeDeleteCallsheetJobById } from "@/lib/cascadeDelete";
import { toast } from "sonner";
import { CallsheetUploader } from "@/components/callsheets/CallsheetUploader";
import { ProjectInvoiceUploader } from "@/components/projects/ProjectInvoiceUploader";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useTrips, type Trip } from "@/contexts/TripsContext";
import { optimizeCallsheetLocationsAndDistance } from "@/lib/callsheetOptimization";
import { uuidv4 } from "@/lib/utils";

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
  const { profile } = useUserProfile();
  const { trips, addTrip } = useTrips();
  const [realCallSheets, setRealCallSheets] = useState<ProjectDocument[]>([]);
  const [projectDocs, setProjectDocs] = useState<ProjectDocument[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const realCallSheetsRef = useRef<ProjectDocument[]>([]);

  useEffect(() => {
    realCallSheetsRef.current = realCallSheets;
  }, [realCallSheets]);

  // Debug: verificar que project.id se pasa correctamente
  useEffect(() => {
    if (open && project) {
      console.log("ProjectDetailModal opened with project:", { id: project.id, name: project.name });
    }
  }, [open, project]);

  const processedJobsRef = useRef<Set<string>>(new Set());
  const inFlightJobsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Reset per-project session state
    processedJobsRef.current = new Set();
    inFlightJobsRef.current = new Set();
  }, [project?.id, open]);

  const calculateCO2 = useCallback((distance: number) => Math.round(distance * 0.12 * 10) / 10, []);

  const hasTripForJob = useCallback(
    (jobId: string | undefined, storagePath: string | undefined) => {
      if (!jobId && !storagePath) return false;
      return trips.some((trip) => {
        if (jobId && trip.callsheet_job_id === jobId) return true;
        if (!storagePath) return false;
        return (trip.documents ?? []).some((d) => d?.storagePath === storagePath);
      });
    },
    [trips]
  );

  const normalizeProjectName = useCallback((value: string) => value.trim().toLowerCase(), []);

  const materializeTripFromJob = useCallback(
    async (job: { id: string; storage_path?: string | null; status?: string | null }) => {
      if (!project) return;
      if (!job?.id) return;
      if (processedJobsRef.current.has(job.id)) return;
      if (inFlightJobsRef.current.has(job.id)) return;

      const storagePath = (job.storage_path ?? "").trim();
      if (!storagePath) {
          console.warn("[Materialize] Job missing storage path:", job.id);
          return;
      }

      // Avoid duplicates if the trip already exists
      if (hasTripForJob(job.id, storagePath)) {
        console.log("[Materialize] Trip already exists for job:", job.id);
        processedJobsRef.current.add(job.id);
        return;
      }

      console.log("[Materialize] Processing job:", job.id);
      inFlightJobsRef.current.add(job.id);

      try {
        const [{ data: result, error: resultError }, { data: locs, error: locsError }] = await Promise.all([
          supabase.from("callsheet_results").select("*").eq("job_id", job.id).maybeSingle(),
          supabase.from("callsheet_locations").select("*").eq("job_id", job.id),
        ]);

        if (resultError) {
             console.error("[Materialize] Error fetching results:", resultError);
             return;
        }
        if (locsError) {
             console.error("[Materialize] Error fetching locations:", locsError);
             return;
        }
        
        if (!result) {
            console.warn("[Materialize] No result found for DONE job:", job.id);
            // If it's done but has no result, it might be a weird state.
            // We won't mark processed so it retries or we can manually inspect.
            return;
        }

        console.log("[Materialize] Extracted result:", result);

        const extractedProject = (result?.project_value ?? "").trim();
        if (extractedProject && normalizeProjectName(extractedProject) !== normalizeProjectName(project.name)) {
          console.warn("[Materialize] Project mismatch:", extractedProject, "vs", project.name);
          const reason = `Project mismatch: AI extracted "${extractedProject}" but file is in project "${project.name}"`;
          toast.warning("Documento no coincide con el proyecto. Revisa manualmente.");
          // Best-effort persist (requires UPDATE policy on callsheet_jobs)
          await supabase
            .from("callsheet_jobs")
            .update({ status: "needs_review", needs_review_reason: reason })
            .eq("id", job.id);
          processedJobsRef.current.add(job.id);
          return;
        }

        const date = (result?.date_value ?? "").toString().trim();
        if (!date) {
          console.warn("[Materialize] Missing date value");
          const reason = "Missing date_value in extracted result";
          toast.warning("No se pudo extraer la fecha. Revisa manualmente.");
          await supabase
            .from("callsheet_jobs")
            .update({ status: "needs_review", needs_review_reason: reason })
            .eq("id", job.id);
          processedJobsRef.current.add(job.id);
          return;
        }

        const rawLocations = (locs ?? [])
          .map((l: any) => (l?.formatted_address || l?.address_raw || l?.name_raw || "").toString())
          .map((s: string) => s.trim())
          .filter(Boolean);

        if (rawLocations.length === 0) {
          console.warn("[Materialize] Missing locations");
          const reason = "Missing locations in extracted result";
          toast.warning("No se pudieron extraer ubicaciones. Revisa manualmente.");
          await supabase
            .from("callsheet_jobs")
            .update({ status: "needs_review", needs_review_reason: reason })
            .eq("id", job.id);
          processedJobsRef.current.add(job.id);
          return;
        }
        
        console.log("[Materialize] Optimizing locations:", rawLocations);
        const { locations: normalizedLocs, distanceKm } = await optimizeCallsheetLocationsAndDistance({
          profile,
          rawLocations,
        });

        const base = (profile.baseAddress ?? "").trim();
        const route = base ? [base, ...normalizedLocs, base] : normalizedLocs;

        const distance = typeof distanceKm === "number" ? distanceKm : 0;
        const producer = (result?.producer_value ?? "").trim();
        const purpose = producer ? `Rodaje: ${producer}` : "Rodaje";

        const nextTrip: Trip = {
          id: uuidv4(),
          date,
          route,
          project: project.name,
          projectId: project.id,
          callsheet_job_id: job.id, // Reference to project callsheet
          purpose,
          passengers: 0,
          invoice: undefined,
          distance,
          co2: calculateCO2(distance),
          ratePerKmOverride: null,
          specialOrigin: "base",
          documents: [
            {
              id: `${job.id}-callsheet`,
              name: storagePath.split("/").pop() || "Callsheet",
              mimeType: "application/pdf",
              storagePath,
              createdAt: new Date().toISOString(),
            },
          ],
        };

        await addTrip(nextTrip);
        toast.success("Viaje creado desde IA del proyecto");

        processedJobsRef.current.add(job.id);

      } catch (e: any) {
        console.error(e);
        toast.error("Error creando viaje desde extracción: " + (e?.message ?? String(e)));
      } finally {
        inFlightJobsRef.current.delete(job.id);
      }
    },
    [addTrip, calculateCO2, hasTripForJob, normalizeProjectName, profile, project]
  );

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

        // Materialize trips from jobs that are already done
        const doneJobs = allDocs.filter(doc => doc.status === 'done');
        if (doneJobs.length > 0) {
          Promise.all(doneJobs.map(doc => materializeTripFromJob({
            id: doc.id,
            storage_path: doc.storage_path,
            status: doc.status
          }))).catch(console.error);
        }
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

      Promise.all([fetchCallSheets(), fetchProjectDocs()]).catch(console.error);
    } else {
        setRealCallSheets([]);
        setProjectDocs([]);
    }
  }, [open, project?.name, project?.id, refreshTrigger]);

  // While modal is open, poll for completed extractions and materialize trips.
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (!open || !project?.id) return;

    const tick = async () => {
      try {
        const visibleIds = (realCallSheetsRef.current ?? []).map((d) => d.id).filter(Boolean);

        let q = supabase
          .from("callsheet_jobs")
          .select("id, storage_path, created_at, status, needs_review_reason");

        // Some legacy/extracted jobs may not have project_id set.
        // Poll by visible IDs as well so UI can move from queued/processing -> done.
        if (visibleIds.length > 0) {
          const inList = visibleIds.join(",");
          q = q.or(`project_id.eq.${project.id},id.in.(${inList})`);
        } else {
          q = q.eq("project_id", project.id);
        }

        const { data: jobs } = await q;

        // 1) Keep UI in sync so spinners stop when status changes.
        if (jobs && jobs.length > 0) {
          setRealCallSheets((prev) => {
            const byId = new Map<string, ProjectDocument>();
            for (const d of prev) byId.set(d.id, d);

            let changed = false;
            for (const job of jobs as any[]) {
              const existing = byId.get(job.id);
              const path = job.storage_path || existing?.storage_path || "";
              const name = (existing?.name || path.split("/").pop() || path || "Documento").toString();

              const next: ProjectDocument = {
                id: job.id,
                name,
                type: "call-sheet",
                status: job.status,
                storage_path: job.storage_path,
                needs_review_reason: job.needs_review_reason,
              };

              if (
                !existing ||
                existing.status !== next.status ||
                existing.storage_path !== next.storage_path ||
                existing.needs_review_reason !== next.needs_review_reason ||
                existing.name !== next.name
              ) {
                changed = true;
                byId.set(job.id, next);
              }
            }

            return changed ? Array.from(byId.values()) : prev;
          });
        }

        // 2) Materialize trips for completed jobs.
        const doneJobs = (jobs ?? []).filter((j: any) => j.status === "done");
        await Promise.all(doneJobs.map((j: any) => materializeTripFromJob(j)));

        // 3) If nothing is pending, stop polling.
        const hasPending = (jobs ?? []).some(
          (j: any) => j?.status === "queued" || j?.status === "processing" || j?.status === "created",
        );
        if (!hasPending && interval) {
          clearInterval(interval);
          interval = null;
        }
      } catch {
        // silent polling failure
      }
    };

    interval = setInterval(tick, 2000);
    void tick();

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [open, project?.id, materializeTripFromJob]);

  if (!project) return null;

  function uniqueDocuments(docs: ProjectDocument[]) {
      const map = new Map<string, ProjectDocument>();
      docs.forEach(d => map.set(d.id, d));
      return Array.from(map.values());
  }

  // Only use dynamically fetched data, not the props, to avoid duplicates
  const allCallSheets = realCallSheets;
  const allInvoices = projectDocs;

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
      await cascadeDeleteCallsheetJobById(supabase, doc.id);
        
        toast.success("Hoja de llamada eliminada");
        setRealCallSheets(prev => prev.filter(p => p.id !== doc.id));
    } catch (e: any) {
        toast.error("Error al eliminar: " + e.message);
    }
  };
  
  const handleExtract = async (doc: ProjectDocument) => {
    if (doc.status === 'queued' || doc.status === 'processing') {
      toast.info("El documento ya se está procesando");
      return;
    }
    if (doc.status === 'done') {
      toast.info("El documento ya fue procesado");
      return;
    }
    
    try {
        const { error } = await supabase
            .from("callsheet_jobs")
        .update({ status: "queued", project_id: project?.id ?? null })
            .eq("id", doc.id);
            
        if (error) throw error;
        
        toast.success("Extracción iniciada. El proceso comenzará en breve.");
        setRealCallSheets(prev => prev.map(p => p.id === doc.id ? { ...p, status: 'queued' } : p));
    } catch (e: any) {
        toast.error("Error al iniciar extracción: " + e.message);
    }
  };

  const [triggeringWorker, setTriggeringWorker] = useState(false);

  const handleTriggerWorker = async () => {
    setTriggeringWorker(true);
    try {
      const res = await fetch('/api/callsheets/trigger-worker', { method: 'POST' });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || 'Error al procesar');
      }
      
      toast.success(`Worker ejecutado: ${data.processed || 0} trabajos procesados`);
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error("Error al ejecutar worker: " + e.message);
    } finally {
      setTriggeringWorker(false);
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
          const { error: storageError } = await supabase.storage.from("project_documents").remove([doc.storage_path]);
          if (storageError) throw storageError;

          const { error } = await supabase.from("project_documents").delete().eq("id", doc.id);
          if (error) throw error;
                
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
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleTriggerWorker}
                    disabled={triggeringWorker}
                    className="h-9"
                  >
                    {triggeringWorker ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Procesar ahora
                      </>
                    )}
                  </Button>
                  <CallsheetUploader projectId={project.id} onJobCreated={handleJobCreated} />
                </div>
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
                        {sheet.status === 'queued' || sheet.status === 'processing' ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : null}
                        {sheet.status === 'needs_review' ? (
                          <span title={sheet.needs_review_reason} className="text-[10px] px-1.5 py-0.5 rounded-full cursor-help bg-orange-500/20 text-orange-500">
                            Revisar
                          </span>
                        ) : null}
                        {sheet.status === 'failed' ? (
                          <span title={sheet.needs_review_reason} className="text-[10px] px-1.5 py-0.5 rounded-full cursor-help bg-red-500/20 text-red-500">
                            Error
                          </span>
                        ) : null}
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
