import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Car, Calendar, Route, Leaf, FileText, Sparkles, Eye, Trash2, Upload, Receipt, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/hooks/use-i18n";
import { tf } from "@/lib/i18n";
import { supabase } from "@/lib/supabaseClient";
import { cascadeDeleteCallsheetJobById, cascadeDeleteInvoiceJobById } from "@/lib/cascadeDelete";
import { toast } from "sonner";
import { CallsheetUploader } from "@/components/callsheets/CallsheetUploader";
import { ProjectInvoiceUploader } from "@/components/projects/ProjectInvoiceUploader";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useProjects } from "@/contexts/ProjectsContext";
import { calculateTripEmissions } from "@/lib/emissions";
import { parseLocaleNumber } from "@/lib/number";
import { useTrips, type Trip } from "@/contexts/TripsContext";
import { useAuth } from "@/contexts/AuthContext";
import { optimizeCallsheetLocationsAndDistance } from "@/lib/callsheetOptimization";
import { uuidv4 } from "@/lib/utils";
import { parseMonthlyQuotaExceededReason } from "@/lib/aiQuotaReason";
import { cancelCallsheetJobs, cancelInvoiceJobs } from "@/lib/aiJobCancellation";

const DEBUG = import.meta.env.DEV;

interface ProjectDocument {
  id: string;
  name: string;
  type: "call-sheet" | "invoice" | "document" | "other";
  status?: string;
  storage_path?: string;
  created_at?: string;
  project_id?: string | null;
  needs_review_reason?: string;
  invoice_job_id?: string;
  extracted_amount?: number;
  extracted_currency?: string;
  extracted_purpose?: string;
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
  const { t, tf, locale } = useI18n();
  const { profile } = useUserProfile();
  const { trips, addTrip, updateTrip } = useTrips();
  const { refreshProjects } = useProjects();
  const { getAccessToken } = useAuth();
  const [realCallSheets, setRealCallSheets] = useState<ProjectDocument[]>([]);
  const [projectDocs, setProjectDocs] = useState<ProjectDocument[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [triggeringWorker, setTriggeringWorker] = useState(false);
  const [pendingTrips, setPendingTrips] = useState<Trip[]>([]);
  const [showPendingTrips, setShowPendingTrips] = useState(false);
  const realCallSheetsRef = useRef<ProjectDocument[]>([]);
  const projectDocsRef = useRef<ProjectDocument[]>([]);
  const quotaNotifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    realCallSheetsRef.current = realCallSheets;
  }, [realCallSheets]);

  useEffect(() => {
    projectDocsRef.current = projectDocs;
  }, [projectDocs]);

  useEffect(() => {
    if (!open) quotaNotifiedRef.current = new Set();
  }, [open]);

  // Debug: verificar que project.id se pasa correctamente
  useEffect(() => {
    if (open && project) {
      if (DEBUG) console.log("ProjectDetailModal opened with project:", { id: project.id, name: project.name });
    }
  }, [open, project]);

  const processedJobsRef = useRef<Set<string>>(new Set());
  const inFlightJobsRef = useRef<Set<string>>(new Set());
  const processedInvoiceJobsRef = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelCallsheetJobIdsRef = useRef<Set<string>>(new Set());
  const cancelInvoiceJobIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Reset per-project session state
    processedJobsRef.current = new Set();
    inFlightJobsRef.current = new Set();
    processedInvoiceJobsRef.current = new Set();
    cancelCallsheetJobIdsRef.current = new Set();
    cancelInvoiceJobIdsRef.current = new Set();
    
    // Create new abort controller when modal opens
    if (open) {
      abortControllerRef.current = new AbortController();
    }
    
    // Cleanup when modal closes or project changes
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      // Clear pending trips when closing
      if (!open) {
        setPendingTrips([]);
        setShowPendingTrips(false);
      }
    };
  }, [project?.id, open]);

  const emissionsInput = useMemo(() => {
    return {
      fuelType: profile.fuelType,
      fuelLPer100Km: parseLocaleNumber(profile.fuelLPer100Km),
      evKwhPer100Km: parseLocaleNumber(profile.evKwhPer100Km),
      gridKgCo2PerKwh: parseLocaleNumber(profile.gridKgCo2PerKwh),
    };
  }, [profile.evKwhPer100Km, profile.fuelLPer100Km, profile.fuelType, profile.gridKgCo2PerKwh]);

  const calculateCO2 = useCallback((distance: number) => {
    return calculateTripEmissions({ distanceKm: distance, ...emissionsInput }).co2Kg;
  }, [emissionsInput]);

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
    async (job: { id: string; storage_path?: string | null; status?: string | null }, autoSave: boolean = false) => {
      if (!project) return null;
      if (!job?.id) return null;
      if (processedJobsRef.current.has(job.id)) return null;
      if (inFlightJobsRef.current.has(job.id)) return null;

      const storagePath = (job.storage_path ?? "").trim();
      if (!storagePath) {
          console.warn("[Materialize] Job missing storage path:", job.id);
          return null;
      }

      // Avoid duplicates if the trip already exists
      if (hasTripForJob(job.id, storagePath)) {
        if (DEBUG) console.log("[Materialize] Trip already exists for job:", job.id);
        processedJobsRef.current.add(job.id);
        return null;
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
          toast.warning(t("projectDetail.toastProjectMismatch"));
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
          toast.warning(t("projectDetail.toastMissingDate"));
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
          toast.warning(t("projectDetail.toastMissingLocations"));
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

        if (autoSave) {
          const ok = await addTrip(nextTrip);
          if (ok) {
            toast.success(t("projectDetail.toastTripCreatedFromAi"));
          } else {
            toast.error(t("projectDetail.toastTripCreatedFromAiFailed"));
          }
          processedJobsRef.current.add(job.id);
          return null;
        } else {
          // Add to pending trips list for batch review
          processedJobsRef.current.add(job.id);
          return nextTrip;
        }

      } catch (e: any) {
        console.error(e);
        if (autoSave) {
          toast.error(tf("projectDetail.toastTripCreatedFromAiError", { message: e?.message ?? String(e) }));
        }
        return null;
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
                        created_at: job.created_at,
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
                        created_at: job.created_at,
                        storage_path: job.storage_path
                    });
                }
            });
        }
        
        // Deduplicate by file name to avoid double-counting when users re-upload the same document.
        const statusScore = (s: string) => {
          switch (String(s ?? "")) {
            case "processing":
              return 6;
            case "queued":
              return 5;
            case "created":
              return 4;
            case "done":
              return 3;
            case "needs_review":
              return 2;
            case "out_of_quota":
              return 1;
            case "failed":
              return 0;
            default:
              return -1;
          }
        };

        const tripJobIds = new Set<string>(
          (trips ?? []).map((tr) => String((tr as any)?.callsheet_job_id ?? "").trim()).filter(Boolean),
        );

        const byName = new Map<string, ProjectDocument>();
        for (const doc of allDocs) {
          const key = String(doc.name ?? "")
            .trim()
            .toLowerCase();
          if (!key) continue;

          const cur = byName.get(key);
          if (!cur) {
            byName.set(key, doc);
            continue;
          }

          const docHasTrip = tripJobIds.has(String(doc.id ?? ""));
          const curHasTrip = tripJobIds.has(String(cur.id ?? ""));
          if (docHasTrip && !curHasTrip) {
            byName.set(key, doc);
            continue;
          }
          if (!docHasTrip && curHasTrip) continue;

          const ds = statusScore(String(doc.status ?? "")) - statusScore(String(cur.status ?? ""));
          if (ds > 0) {
            byName.set(key, doc);
            continue;
          }
          if (ds < 0) continue;

          const tCur = Date.parse(String(cur.created_at ?? ""));
          const tDoc = Date.parse(String(doc.created_at ?? ""));
          if (Number.isFinite(tDoc) && Number.isFinite(tCur) && tDoc > tCur) {
            byName.set(key, doc);
          }
        }

        setRealCallSheets(Array.from(byName.values()));

        // Materialize trips from jobs that are already done (but only once per modal open)
        // This runs after initial fetch to create trips for jobs that completed before modal opened
        const doneJobs = Array.from(byName.values()).filter(doc => doc.status === 'done');
        if (doneJobs.length > 0) {
          // Use setTimeout to avoid blocking the UI and to run after state is set
          setTimeout(async () => {
            // Check if modal was closed while waiting
            if (abortControllerRef.current?.signal.aborted) {
              return;
            }
            
            const results = await Promise.allSettled(doneJobs.map(doc => materializeTripFromJob({
              id: doc.id,
              storage_path: doc.storage_path,
              status: doc.status
            }, false)));
            
            // Check again after async operation
            if (abortControllerRef.current?.signal.aborted) {
              return;
            }
            
            const newPendingTrips = results
              .filter(r => r.status === 'fulfilled' && r.value !== null)
              .map(r => (r as PromiseFulfilledResult<Trip>).value);
            
            if (newPendingTrips.length > 0 && !abortControllerRef.current?.signal.aborted) {
              setPendingTrips(newPendingTrips);
              setShowPendingTrips(true);
            }
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
              .select("job_id, total_amount, currency, purpose")
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
                extracted_purpose: result?.purpose,
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

  // Keep project invoices/documents list fresh when uploads/deletes happen elsewhere (trip modal, cost analysis, etc).
  useEffect(() => {
    if (!open || !project?.id) return;

    let timer: any = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        setRefreshTrigger((p) => p + 1);
      }, 300);
    };

    const channel = supabase
      .channel(`project-documents-${project.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_documents", filter: `project_id=eq.${project.id}` },
        () => schedule(),
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [open, project?.id]);

  // While modal is open, poll for completed extractions and materialize trips.
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (!open || !project?.id) return;

    const tick = async () => {
      // Check if aborted
      if (abortControllerRef.current?.signal.aborted) {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        return;
      }

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
        
        // Check again after async operation
        if (abortControllerRef.current?.signal.aborted) {
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
          return;
        }

        const notifyQuotaIfNeeded = (items: Array<{ id: string; status?: string; needs_review_reason?: string }>) => {
          const newlyHit: Array<{ id: string; reason?: string }> = [];
          for (const it of items ?? []) {
            const id = String((it as any).id ?? "");
            if (!id) continue;
            const status = String((it as any).status ?? "");
            if (status !== "out_of_quota" && status !== "needs_review") continue;
            const reason = String((it as any).needs_review_reason ?? "");
            if (!parseMonthlyQuotaExceededReason(reason)) continue;
            if (quotaNotifiedRef.current.has(id)) continue;
            quotaNotifiedRef.current.add(id);
            newlyHit.push({ id, reason });
          }

          if (newlyHit.length === 0) return;

          const parsed = parseMonthlyQuotaExceededReason(newlyHit[0]?.reason);
          const description =
            parsed?.used != null && parsed?.limit != null
              ? tf("aiQuota.monthlyLimitReachedBody", { used: String(parsed.used), limit: String(parsed.limit) })
              : t("aiQuota.monthlyLimitReachedBodyGeneric");

          toast.error(t("aiQuota.monthlyLimitReachedTitle"), { description });
        };

        notifyQuotaIfNeeded((jobs as any[]) ?? []);

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
          // Check if aborted before processing
          if (abortControllerRef.current?.signal.aborted) {
            if (interval) {
              clearInterval(interval);
              interval = null;
            }
            return;
          }
          
          // Only materialize jobs that haven't been processed yet
          const unprocessedDone = doneJobs.filter((j: any) => !processedJobsRef.current.has(j.id));
          if (unprocessedDone.length > 0) {
            const results = await Promise.allSettled(unprocessedDone.map((j: any) => materializeTripFromJob(j, false)));
            
            // Check again after async operation
            if (abortControllerRef.current?.signal.aborted) {
              if (interval) {
                clearInterval(interval);
                interval = null;
              }
              return;
            }
            
            const newPendingTrips = results
              .filter(r => r.status === 'fulfilled' && r.value !== null)
              .map(r => (r as PromiseFulfilledResult<Trip>).value);
            
            if (newPendingTrips.length > 0 && !abortControllerRef.current?.signal.aborted) {
              setPendingTrips(prev => [...prev, ...newPendingTrips]);
              setShowPendingTrips(true);
            }
          }
        }

        // 3) Poll invoice jobs too
        const invoiceJobIds = projectDocsRef.current
          .map(d => d.invoice_job_id)
          .filter(Boolean);

        if (invoiceJobIds.length > 0) {
          const { data: invoiceJobs } = await supabase
            .from("invoice_jobs")
            .select("id, status, needs_review_reason")
            .in("id", invoiceJobIds);

          if (invoiceJobs && invoiceJobs.length > 0) {
            notifyQuotaIfNeeded((invoiceJobs as any[]) ?? []);
            // Fetch results for done jobs
            const doneInvoiceJobIds = invoiceJobs
              .filter((j: any) => j.status === "done")
              .map((j: any) => j.id);

            let invoiceResults: any[] = [];
            if (doneInvoiceJobIds.length > 0) {
              const { data } = await supabase
                .from("invoice_results")
                .select("job_id, total_amount, currency, purpose")
                .in("job_id", doneInvoiceJobIds);
              invoiceResults = data || [];
            }

            const newlyDone = doneInvoiceJobIds.filter((id: string) => !processedInvoiceJobsRef.current.has(id));
            if (newlyDone.length > 0) {
              for (const id of newlyDone) processedInvoiceJobsRef.current.add(id);
              refreshProjects();
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
                  doc.extracted_currency !== result?.currency ||
                  doc.extracted_purpose !== result?.purpose
                ) {
                  changed = true;
                  return {
                    ...doc,
                    status: job.status,
                    needs_review_reason: job.needs_review_reason,
                    extracted_amount: result?.total_amount,
                    extracted_currency: result?.currency,
                    extracted_purpose: result?.purpose,
                  };
                }
                return doc;
              });

              return changed ? updated : prev;
            });
          }
        }

        // 4) If nothing is pending, stop polling.
        if (abortControllerRef.current?.signal.aborted) {
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
          return;
        }
        
        const hasPending = (jobs ?? []).some(
          (j: any) => j?.status === "queued" || j?.status === "processing" || j?.status === "created",
        );
        const hasInvoicePending = projectDocsRef.current.some(
          (d: any) => d.status === "queued" || d.status === "processing" || d.status === "created"
        );
        
        if (!hasPending && !hasInvoicePending && interval) {
          if (DEBUG) console.log("[Polling] No pending jobs, stopping polling");
          clearInterval(interval);
          interval = null;
        }
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === 'AbortError') {
          if (DEBUG) console.log("[Polling] Aborted");
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
          return;
        }
        console.error("[Polling] Error:", err);
      }
    };

    interval = setInterval(tick, 2000);
    void tick();

    return () => {
      if (DEBUG) console.log("[Polling] Cleanup: stopping interval");
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
  }, [open, project?.id, refreshProjects, materializeTripFromJob]);

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

  const handleJobCreated = (jobId: string) => {
    const id = String(jobId ?? "").trim();
    if (id) cancelCallsheetJobIdsRef.current.add(id);
    setRefreshTrigger((p) => p + 1);
    toast.success(t("projectDetail.toastDocumentUploaded"));
  };

  const handleUploadComplete = (jobIds: string[]) => {
    for (const jobId of jobIds ?? []) {
      const id = String(jobId ?? "").trim();
      if (id) cancelInvoiceJobIdsRef.current.add(id);
    }
    setRefreshTrigger((p) => p + 1);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      void cancelCallsheetJobs(Array.from(cancelCallsheetJobIdsRef.current));
      void cancelInvoiceJobs(Array.from(cancelInvoiceJobIdsRef.current));
    }
    onOpenChange(nextOpen);
  };

  const handleViewCallSheet = async (doc: ProjectDocument) => {
     if (doc.storage_path) {
          try {
            const { data, error } = await supabase.storage.from("callsheets").download(doc.storage_path);
            if (error) throw error;
            const url = URL.createObjectURL(data);
            window.open(url, "_blank");
          } catch (e: any) {
            toast.error(tf("projectDetail.toastOpenPdfError", { message: e.message }));
          }
     } else {
         toast.error(t("projectDetail.toastStoragePathMissing"));
     }
  };

  const handleDeleteCallSheet = async (doc: ProjectDocument) => {
      if (!confirm("¿Estás seguro de eliminar esta hoja de llamada? Se borrarán los datos asociados.")) return;
       try {
      await cascadeDeleteCallsheetJobById(supabase, doc.id);
        
        toast.success(t("projectDetail.toastCallsheetDeleted"));
        setRealCallSheets(prev => prev.filter(p => p.id !== doc.id));
    } catch (e: any) {
        toast.error(tf("projectDetail.toastDeleteError", { message: e.message }));
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

      cancelCallsheetJobIdsRef.current.add(doc.id);
        
      toast.success(doc.status === "done" ? t("projectDetail.toastReprocessingStarted") : t("projectDetail.toastExtractionStarted"));
      setRealCallSheets(prev => prev.map(p => p.id === doc.id ? { ...p, status: 'queued' } : p));
    } catch (e: any) {
      toast.error(tf("projectDetail.toastExtractionStartError", { message: e.message }));
    }
  };

  const handleTriggerWorker = async () => {
    setTriggeringWorker(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error(t("projectDetail.toastInvalidSession"));
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
      
      toast.success(tf("projectDetail.toastWorkerExecuted", { count: data.processed || 0 }));
      setRefreshTrigger(p => p + 1);
    } catch (e: any) {
      toast.error(tf("projectDetail.toastWorkerError", { message: e.message }));
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
            toast.error(tf("projectDetail.toastOpenDocumentError", { message: e.message }));
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
        toast.error(t("projectDetail.toastInvoiceNoJob"));
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
        toast.error(t("projectDetail.toastInvalidSession"));
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

      cancelInvoiceJobIdsRef.current.add(doc.invoice_job_id);

      toast.success(doc.status === "done" ? t("projectDetail.toastReprocessingStarted") : t("projectDetail.toastExtractionStartedShort"));
      setProjectDocs(prev => prev.map(p => 
        p.id === doc.id ? { ...p, status: 'queued' } : p
      ));
    } catch (e: any) {
      toast.error(tf("projectDetail.toastExtractionStartError", { message: e.message }));
    }
  };

  const handleDeleteInvoice = async (doc: ProjectDocument) => {
    if (!confirm(t("projectDetail.confirmDeleteInvoice") as any)) return;

    // Optimistic UI update
    setProjectDocs((prev) => prev.filter((p) => p.id !== doc.id));

    try {
      if (doc.invoice_job_id) {
        const { data: job, error: jobFetchError } = await supabase
          .from("invoice_jobs")
          .select("id, trip_id, storage_path")
          .eq("id", doc.invoice_job_id)
          .maybeSingle();

        if (jobFetchError) throw jobFetchError;

        const tripId = typeof (job as any)?.trip_id === "string" ? (job as any).trip_id : "";
        const storagePath =
          typeof (job as any)?.storage_path === "string"
            ? (job as any).storage_path
            : (doc.storage_path ?? "");

        await cascadeDeleteInvoiceJobById(supabase, doc.invoice_job_id);

        if (tripId) {
          const target = trips.find((t) => t.id === tripId);
          const nextDocs = (target?.documents ?? []).filter((d) => {
            if (d?.invoiceJobId && d.invoiceJobId === doc.invoice_job_id) return false;
            if (storagePath && d?.storagePath && d.storagePath === storagePath) return false;
            return true;
          });

          await updateTrip(tripId, {
            invoiceAmount: null,
            invoiceCurrency: null,
            invoiceJobId: null,
            documents: nextDocs,
          });
        }
      } else {
        // Legacy: only a project_documents row
        if (doc.storage_path) {
          const { error: storageError } = await supabase.storage.from("project_documents").remove([doc.storage_path]);
          if (storageError) throw storageError;
        }
        const { error } = await supabase.from("project_documents").delete().eq("id", doc.id);
        if (error) throw error;
      }

      toast.success(t("projectDetail.toastInvoiceDeleted"));
      refreshProjects();
    } catch (e: any) {
      // Rollback optimistic removal
      setProjectDocs((prev) => (prev.some((p) => p.id === doc.id) ? prev : [doc, ...prev]));
      toast.error(tf("projectDetail.toastDeleteError", { message: e.message }));
    }
  };

  const handleSaveAllPendingTrips = async () => {
    if (pendingTrips.length === 0) return;
    
    const results = await Promise.allSettled(pendingTrips.map(trip => addTrip(trip)));
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - succeeded;
    
    if (failed === 0) {
      toast.success(tf("projectDetail.toastTripsCreatedFromAi", { count: succeeded }));
    } else if (succeeded === 0) {
      toast.error(tf("projectDetail.toastTripsCreatedFromAiFailed", { count: failed }));
    } else {
      toast.warning(`${succeeded} viajes guardados, ${failed} fallaron`);
    }
    
    setPendingTrips([]);
    setShowPendingTrips(false);
  };

  const handleDiscardPendingTrips = () => {
    // Mark jobs as processed but don't create trips
    setPendingTrips([]);
    setShowPendingTrips(false);
  };

  const handleRemovePendingTrip = (tripId: string) => {
    setPendingTrips(prev => prev.filter(t => t.id !== tripId));
  };

  return (
    <>
      {/* Pending Trips Review Dialog */}
      <Dialog open={showPendingTrips} onOpenChange={setShowPendingTrips}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4">
            <DialogTitle className="text-xl font-semibold">
              Viajes procesados ({pendingTrips.length})
            </DialogTitle>
            <DialogDescription>
              Revisa los viajes extraídos automáticamente y guárdalos todos juntos
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-200px)] px-6">
            <div className="space-y-4 pb-4">
              {pendingTrips.map((trip, index) => (
                <div key={trip.id} className="glass-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-lg">Viaje {index + 1}</span>
                      <span className="text-sm text-muted-foreground">{trip.date}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleRemovePendingTrip(trip.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Propósito:</span> {trip.purpose}</p>
                    <p><span className="text-muted-foreground">Distancia:</span> {trip.distance.toFixed(1)} km</p>
                    <p><span className="text-muted-foreground">CO2:</span> {trip.co2.toFixed(2)} kg</p>
                    <div>
                      <span className="text-muted-foreground">Ruta:</span>
                      <ul className="ml-4 mt-1 space-y-0.5">
                        {trip.route.map((loc, i) => (
                          <li key={i} className="text-xs">
                            {i + 1}. {loc}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="p-6 pt-4 border-t flex items-center justify-between gap-4">
            <Button variant="outline" onClick={handleDiscardPendingTrips}>
              Descartar todos
            </Button>
            <Button onClick={handleSaveAllPendingTrips} disabled={pendingTrips.length === 0}>
              Guardar {pendingTrips.length} viajes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Main Project Detail Dialog */}
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl font-semibold">{project.name}</DialogTitle>
          <DialogDescription className="sr-only">{project.name}</DialogDescription>
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
                          {doc.extracted_purpose && (
                            <span className="text-xs text-muted-foreground truncate" title={doc.extracted_purpose}>
                              {doc.extracted_purpose}
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
                        {doc.status === 'out_of_quota' ? (
                          <span title={doc.needs_review_reason} className="text-[10px] px-1.5 py-0.5 rounded-full cursor-help bg-violet-500/20 text-violet-200">
                            {t("aiQuota.outOfQuotaBadge")}
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
                        {sheet.status === 'out_of_quota' ? (
                          <span title={sheet.needs_review_reason} className="text-[10px] px-1.5 py-0.5 rounded-full cursor-help bg-violet-500/20 text-violet-200">
                            {t("aiQuota.outOfQuotaBadge")}
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
    </>
  );
}
