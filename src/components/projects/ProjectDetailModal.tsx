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
import { useAuth } from "@/contexts/AuthContext";
import { optimizeCallsheetLocationsAndDistance } from "@/lib/callsheetOptimization";
import { uuidv4 } from "@/lib/utils";

const DEBUG = import.meta.env.DEV;

interface ProjectDocument {
  id: string;
  name: string;
  type: "call-sheet" | "invoice" | "document" | "other";
  status?: string;
  storage_path?: string;
  project_id?: string | null;
  needs_review_reason?: string;
  invoice_job_id?: string;
  extracted_amount?: number;
  extracted_currency?: string;
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
  const { getAccessToken } = useAuth();
  const [realCallSheets, setRealCallSheets] = useState<ProjectDocument[]>([]);
  const [projectDocs, setProjectDocs] = useState<ProjectDocument[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [triggeringWorker, setTriggeringWorker] = useState(false);
  const realCallSheetsRef = useRef<ProjectDocument[]>([]);

  useEffect(() => {
    realCallSheetsRef.current = realCallSheets;
  }, [realCallSheets]);

  // Debug: verificar que project.id se pasa correctamente
  useEffect(() => {
    if (open && project) {
      if (DEBUG) console.log("ProjectDetailModal opened with project:", { id: project.id, name: project.name });
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
        if (DEBUG) console.log("[Materialize] Trip already exists for job:", job.id);
        processedJobsRef.current.add(job.id);
        return;
      }

      if (DEBUG) console.log("[Materialize] Processing job:", job.id);
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
            console.warn("[Materialize] No result found for DONE job:", job.id, "- marking as failed");
            // Job is marked as "done" but has no extraction results - this is an error state
            // Mark it as failed so user can see it and re-process
            await supabase
              .from("callsheet_jobs")
              .update({ 
                status: "failed", 
                needs_review_reason: "Job marked as done but no extraction results found in database" 
              })
              .eq("id", job.id);
            processedJobsRef.current.add(job.id);
            return;
        }

        if (DEBUG) console.log("[Materialize] Extracted result:", result);

        const extractedProject = (result?.project_value ?? "").trim();
        if (extractedProject && normalizeProjectName(extractedProject) !== normalizeProjectName(project.name)) {
          console.warn("[Materialize] Project mismatch:", extractedProject, "vs", project.name);
          const reason = `Project mismatch: AI extracted "${extractedProject}" but file is in project "${project.name}"`;
          toast.warning("El proyecto extraído por IA no coincide, pero se creará el viaje igualmente. Revisa el resultado.");
          // Best-effort persist a review hint without blocking trip creation.
          await supabase
            .from("callsheet_jobs")
            .update({ needs_review_reason: reason })
            .eq("id", job.id);
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
        
        if (DEBUG) console.log("[Materialize] Optimizing locations:", rawLocations);
        const token = await getAccessToken();
        const { locations: normalizedLocs, distanceKm } = await optimizeCallsheetLocationsAndDistance({
          profile,
          rawLocations,
          accessToken: token,
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
    [addTrip, calculateCO2, getAccessToken, hasTripForJob, normalizeProjectName, profile, project]
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

        // Materialize trips from jobs that are already done (but only once per modal open)
        // This runs after initial fetch to create trips for jobs that completed before modal opened
        const doneJobs = allDocs.filter(doc => doc.status === 'done');
        if (doneJobs.length > 0) {
          // Use setTimeout to avoid blocking the UI and to run after state is set
          setTimeout(() => {
            Promise.all(doneJobs.map(doc => materializeTripFromJob({
              id: doc.id,
              storage_path: doc.storage_path,
              status: doc.status
            }))).catch(console.error);
          }, 100);
        }
      };

      const fetchProjectDocs = async () => {
          // Fetch project documents.
          // We intentionally avoid PostgREST embedding here because project_documents has no direct FK to invoice_results
          // and embedding can fail with a 400 depending on schema cache / relationships.
          const { data: docs, error: docsError } = await supabase
            .from("project_documents")
            .select("*")
            .eq("project_id", project.id);

          if (docsError) {
            console.error("Error fetching project documents:", docsError);
            return;
          }

          const rows = Array.isArray(docs) ? docs : [];
          const invoiceJobIds = Array.from(
            new Set(rows.map((d: any) => d?.invoice_job_id).filter((id: any) => typeof id === "string" && id)),
          );

          const invoiceJobsById = new Map<string, any>();
          const invoiceResultsByJobId = new Map<string, any>();

          if (invoiceJobIds.length > 0) {
            const { data: jobs, error: jobsError } = await supabase
              .from("invoice_jobs")
              .select("id, status, needs_review_reason")
              .in("id", invoiceJobIds);

            if (jobsError) {
              console.warn("Error fetching invoice jobs:", jobsError);
            } else {
              for (const j of (jobs ?? []) as any[]) invoiceJobsById.set(String(j.id), j);
            }

            const { data: results, error: resultsError } = await supabase
              .from("invoice_results")
              .select("job_id, total_amount, currency")
              .in("job_id", invoiceJobIds);

            if (resultsError) {
              console.warn("Error fetching invoice results:", resultsError);
            } else {
              for (const r of (results ?? []) as any[]) invoiceResultsByJobId.set(String(r.job_id), r);
            }
          }

          setProjectDocs(
            rows.map((d: any) => {
              const jobId = typeof d?.invoice_job_id === "string" ? d.invoice_job_id : undefined;
              const job = jobId ? invoiceJobsById.get(jobId) : null;
              const result = jobId ? invoiceResultsByJobId.get(jobId) : null;

              return {
                id: d.id,
                name: d.name,
                type: (d.type as any) || "invoice",
                storage_path: d.storage_path,
                invoice_job_id: jobId,
                status: job?.status,
                needs_review_reason: job?.needs_review_reason,
                extracted_amount: result?.total_amount,
                extracted_currency: result?.currency,
              };
            }),
          );
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
        if (doneJobs.length > 0) {
          // Only materialize jobs that haven't been processed yet
          const unprocessedDone = doneJobs.filter((j: any) => !processedJobsRef.current.has(j.id));
          if (unprocessedDone.length > 0) {
            await Promise.allSettled(unprocessedDone.map((j: any) => materializeTripFromJob(j)));
          }
        }

        // 3) Poll invoice jobs too
        const invoiceJobIds = projectDocs
          .map(d => d.invoice_job_id)
          .filter(Boolean);

        if (invoiceJobIds.length > 0) {
          const { data: invoiceJobs } = await supabase
            .from("invoice_jobs")
            .select("id, status, needs_review_reason")
            .in("id", invoiceJobIds);

          if (invoiceJobs && invoiceJobs.length > 0) {
            // Fetch results for done jobs
            const doneInvoiceJobIds = invoiceJobs
              .filter((j: any) => j.status === "done")
              .map((j: any) => j.id);

            let invoiceResults: any[] = [];
            if (doneInvoiceJobIds.length > 0) {
              const { data } = await supabase
                .from("invoice_results")
                .select("job_id, total_amount, currency")
                .in("job_id", doneInvoiceJobIds);
              invoiceResults = data || [];
            }

            setProjectDocs((prev) => {
              let changed = false;
              const updated = prev.map(doc => {
                if (!doc.invoice_job_id) return doc;
                
                const job = invoiceJobs.find((j: any) => j.id === doc.invoice_job_id);
                if (!job) return doc;

                const result = invoiceResults.find((r: any) => r.job_id === doc.invoice_job_id);

                if (
                  doc.status !== job.status ||
                  doc.needs_review_reason !== job.needs_review_reason ||
                  doc.extracted_amount !== result?.total_amount ||
                  doc.extracted_currency !== result?.currency
                ) {
                  changed = true;
                  return {
                    ...doc,
                    status: job.status,
                    needs_review_reason: job.needs_review_reason,
                    extracted_amount: result?.total_amount,
                    extracted_currency: result?.currency
                  };
                }
                return doc;
              });

              return changed ? updated : prev;
            });
          }
        }

        // 4) If nothing is pending, stop polling.
        const hasPending = (jobs ?? []).some(
          (j: any) => j?.status === "queued" || j?.status === "processing" || j?.status === "created",
        );
        const hasInvoicePending = projectDocs.some(
          (d: any) => d.status === "queued" || d.status === "processing" || d.status === "created"
        );
        
        if (!hasPending && !hasInvoicePending && interval) {
          if (DEBUG) console.log("[Polling] No pending jobs, stopping polling");
          clearInterval(interval);
          interval = null;
        }
      } catch (err) {
        console.error("[Polling] Error:", err);
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
  
  const handleExtract = async (doc: ProjectDocument, isReprocess = false) => {
    if (doc.status === 'queued' || doc.status === 'processing') {
      toast.info("El documento ya se está procesando");
      return;
    }
    
    // Si es re-procesamiento, confirmar primero
    if (doc.status === 'done' && !isReprocess) {
      if (!confirm("Este documento ya fue procesado. ¿Quieres volver a procesarlo? Se borrarán los datos anteriores y se hará una nueva extracción con IA.")) {
        return;
      }
    }
    
    try {
      // Si está en 'done', limpiar datos anteriores
      if (doc.status === 'done') {
        // 1. Eliminar el viaje asociado a este job
        const tripToDelete = trips.find(t => t.callsheet_job_id === doc.id);
        if (tripToDelete) {
          const { error: tripError } = await supabase
            .from("trips")
            .delete()
            .eq("id", tripToDelete.id);
          if (tripError) console.error("Error eliminando viaje anterior:", tripError);
        }

        // 2. Eliminar resultados de extracción anteriores
        const { error: resultsError } = await supabase
          .from("callsheet_results")
          .delete()
          .eq("job_id", doc.id);
        if (resultsError) console.error("Error eliminando resultados:", resultsError);

        // 3. Eliminar ubicaciones anteriores
        const { error: locsError } = await supabase
          .from("callsheet_locations")
          .delete()
          .eq("job_id", doc.id);
        if (locsError) console.error("Error eliminando ubicaciones:", locsError);

        // 4. Marcar el job para re-procesamiento
        processedJobsRef.current.delete(doc.id);
      }

      // Poner en cola para procesamiento
      const { error } = await supabase
        .from("callsheet_jobs")
        .update({ status: "queued", project_id: project?.id ?? null })
        .eq("id", doc.id);
            
      if (error) throw error;
        
      toast.success(doc.status === 'done' ? "Re-procesamiento iniciado" : "Extracción iniciada. El proceso comenzará en breve.");
      setRealCallSheets(prev => prev.map(p => p.id === doc.id ? { ...p, status: 'queued' } : p));
    } catch (e: any) {
      toast.error("Error al iniciar extracción: " + e.message);
    }
  };

  const handleTriggerWorker = async () => {
    setTriggeringWorker(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Sesión no válida");
        return;
      }

      const res = await fetch('/api/callsheets/trigger-worker', { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
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

  const handleExtractInvoice = async (doc: ProjectDocument) => {
    if (doc.status === 'queued' || doc.status === 'processing') {
      toast.info("La factura ya se está procesando");
      return;
    }
    
    if (doc.status === 'done') {
      if (!confirm("Esta factura ya fue procesada. ¿Quieres volver a procesarla? Se borrarán los datos anteriores.")) {
        return;
      }
    }
    
    try {
      if (!doc.invoice_job_id) {
        toast.error("Esta factura no tiene un job de extracción asociado");
        return;
      }

      // If it's done, clean previous results
      if (doc.status === 'done') {
        const { error: resultsError } = await supabase
          .from("invoice_results")
          .delete()
          .eq("job_id", doc.invoice_job_id);
        if (resultsError) console.error("Error eliminando resultados:", resultsError);
      }

      // Queue the job
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Sesión no válida");
        return;
      }

      const res = await fetch('/api/invoices/queue', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ jobId: doc.invoice_job_id })
      });

      if (!res.ok) throw new Error('Error al encolar job');

      toast.success(doc.status === 'done' ? "Re-procesamiento iniciado" : "Extracción iniciada");
      setProjectDocs(prev => prev.map(p => 
        p.id === doc.id ? { ...p, status: 'queued' } : p
      ));
    } catch (e: any) {
      toast.error("Error al iniciar extracción: " + e.message);
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
                        <Receipt className="w-4 h-4 text-primary shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm truncate">{doc.name}</span>
                          {doc.extracted_amount !== undefined && (
                            <span className="text-xs text-muted-foreground">
                              {doc.extracted_amount.toFixed(2)} {doc.extracted_currency || 'EUR'}
                            </span>
                          )}
                        </div>
                        {doc.status === 'queued' || doc.status === 'processing' ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : null}
                        {doc.status === 'needs_review' ? (
                          <span title={doc.needs_review_reason} className="text-[10px] px-1.5 py-0.5 rounded-full cursor-help bg-orange-500/20 text-orange-500">
                            Revisar
                          </span>
                        ) : null}
                        {doc.status === 'failed' ? (
                          <span title={doc.needs_review_reason} className="text-[10px] px-1.5 py-0.5 rounded-full cursor-help bg-red-500/20 text-red-500">
                            Error
                          </span>
                        ) : null}
                        {!doc.storage_path && <span className="text-[10px] text-muted-foreground bg-secondary px-1 rounded">Viaje</span>}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {doc.invoice_job_id && doc.status !== 'queued' && doc.status !== 'processing' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-yellow-500 hover:text-yellow-400" 
                            onClick={() => handleExtractInvoice(doc)} 
                            title={doc.status === 'done' ? "Volver a procesar" : "Extraer datos con IA"}
                          >
                            <Sparkles className="w-4 h-4" />
                          </Button>
                        )}
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
                        {sheet.status !== 'queued' && sheet.status !== 'processing' && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-yellow-500 hover:text-yellow-400" 
                            onClick={() => handleExtract(sheet)} 
                            title={sheet.status === 'done' ? "Volver a procesar con IA" : "Extraer datos con IA"}
                          >
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
