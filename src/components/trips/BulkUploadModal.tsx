import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Sparkles, FileSpreadsheet, CloudUpload, Loader2, Link, MapPin, Calendar, Building2, CheckCircle, Save } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/hooks/use-i18n";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { useUserProfile } from "@/contexts/UserProfileContext";
import { useProjects } from "@/contexts/ProjectsContext";
import { uuidv4 } from "@/lib/utils";
import { optimizeCallsheetLocationsAndDistance } from "@/lib/callsheetOptimization";
import { useAuth } from "@/contexts/AuthContext";
import { parseMonthlyQuotaExceededReason } from "@/lib/aiQuotaReason";

interface SavedTrip {
  id: string;
  date: string;
  route: string[];
  project: string;
  projectId?: string;
  purpose: string;
  passengers: number;
  invoice?: string;
  distance: number;
  ratePerKmOverride?: number | null;
  specialOrigin?: "base" | "continue" | "return";
  documents?: any[];
}

interface BulkUploadModalProps {
  trigger: React.ReactNode;
  onSave?: (data: SavedTrip) => void;
}

export function BulkUploadModal({ trigger, onSave }: BulkUploadModalProps) {
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);
  
  // AI Tab State
  const [aiStep, setAiStep] = useState<"upload" | "processing" | "review">("upload");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobMetaById, setJobMetaById] = useState<
    Record<string, { fileName: string; mimeType: string; storagePath: string }>
  >({});
  const [extractedData, setExtractedData] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [processingTotal, setProcessingTotal] = useState(0);
  const [processingDone, setProcessingDone] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  
  // Review form state
  const [reviewDate, setReviewDate] = useState("");
  const [reviewProject, setReviewProject] = useState("");
  const [reviewProducer, setReviewProducer] = useState("");
  const [reviewLocations, setReviewLocations] = useState<string[]>([]);
  
  const [reviewDistance, setReviewDistance] = useState("0");
  const [isOptimizing, setIsOptimizing] = useState(false);
  
  const { t, tf, locale } = useI18n();
  const exampleText = t("bulk.examplePlaceholder");
  const { getAccessToken } = useAuth();

  // Reset state when modal closes or tab changes
  useEffect(() => {
    if (!open) {
      resetAiState();
    }
  }, [open]);

  const resetAiState = () => {
    setAiStep("upload");
    setSelectedFiles([]);
    setJobIds([]);
    setCurrentJobId(null);
    setJobMetaById({});
    setExtractedData(null);
    setAiLoading(false);
    setIsOptimizing(false);
    setProcessingTotal(0);
    setProcessingDone(0);
    setReviewDate("");
    setReviewProject("");
    setReviewProducer("");
    setReviewLocations([]);
    setReviewDistance("0");
    setReviewLocations([]);
    setReviewDistance("0");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const normalizeHeaderKey = (raw: string): string =>
    String(raw ?? "")
      .trim()
      .replace(/^\uFEFF/, "")
      .toLowerCase();

  const parseDriveFileId = (input: string): string | null => {
    const trimmed = String(input ?? "").trim();
    if (!trimmed) return null;

    // Raw id
    if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed) && !trimmed.includes("/") && !trimmed.includes("?")) return trimmed;

    // URL patterns
    const m1 = /[?&]id=([^&]+)/.exec(trimmed);
    if (m1?.[1]) return decodeURIComponent(m1[1]);
    const m2 = /\/file\/d\/([^/]+)/.exec(trimmed);
    if (m2?.[1]) return decodeURIComponent(m2[1]);

    return null;
  };

  function detectDelimiter(headerLine: string): "," | ";" {
    // Count separators outside quotes
    let inQuotes = false;
    let commas = 0;
    let semis = 0;
    for (let i = 0; i < headerLine.length; i++) {
      const ch = headerLine[i];
      if (ch === '"') {
        if (inQuotes && headerLine[i + 1] === '"') {
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (inQuotes) continue;
      if (ch === ",") commas += 1;
      if (ch === ";") semis += 1;
    }
    return semis > commas ? ";" : ",";
  }

  function parseCsvLine(line: string, delimiter: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (!inQuotes && ch === delimiter) {
        out.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }

    out.push(cur.trim());
    return out;
  }

  const parseDateToIso = (raw: string): string | null => {
    const v = String(raw ?? "").trim();
    if (!v) return null;

    // ISO: YYYY-MM-DD
    const iso = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(v);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    // DD-MM-YYYY or DD/MM/YYYY
    const dmy = /^([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{4})$/.exec(v);
    if (dmy) {
      const dd = String(Number(dmy[1])).padStart(2, "0");
      const mm = String(Number(dmy[2])).padStart(2, "0");
      const yyyy = dmy[3];
      return `${yyyy}-${mm}-${dd}`;
    }

    const time = Date.parse(v);
    if (!Number.isFinite(time)) return null;
    const dt = new Date(time);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const readCsvTextFromFile = async (file: File): Promise<string> => {
    const text = await file.text();
    // remove BOM if present
    return text.replace(/^\uFEFF/, "");
  };

  const resolveProjectIdByName = async (projectNameRaw: string, sourceLabel: string): Promise<string | undefined> => {
    const trimmed = String(projectNameRaw ?? "").trim();
    if (!trimmed) return undefined;

    const existing = projects.find((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.id;

    const newProjectId = uuidv4();
    await addProject({
      id: newProjectId,
      name: trimmed,
      producer: "",
      description: `Created from CSV import: ${sourceLabel}`,
      ratePerKm: 0.30,
      starred: false,
      trips: 0,
      totalKm: 0,
      documents: 0,
      invoices: 0,
      estimatedCost: 0,
      shootingDays: 0,
      kmPerDay: 0,
      co2Emissions: 0,
    });
    return newProjectId;
  };

  const computeDistanceKmIfMissing = async (
    routeValues: string[],
    region?: string,
    accessToken?: string | null,
  ): Promise<number | null> => {
    const origin = routeValues[0];
    const destination = routeValues[routeValues.length - 1];
    const waypoints = routeValues.slice(1, -1);
    if (!origin || !destination) return null;
    if (!accessToken) return null;

    try {
      const response = await fetch("/api/google/directions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ origin, destination, waypoints, region }),
      });

      const data = (await response.json().catch(() => null)) as { totalDistanceMeters?: number } | null;
      const meters = typeof data?.totalDistanceMeters === "number" ? data.totalDistanceMeters : null;
      if (!response.ok || meters == null) return null;
      const km = Math.round((meters / 1000) * 10) / 10;
      return km;
    } catch {
      return null;
    }
  };

  const parseCsvTrips = (rawCsv: string): { trips: SavedTrip[]; errors: string[] } => {
    const text = String(rawCsv ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!text) return { trips: [], errors: ["CSV vacío"] };

    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length < 2) return { trips: [], errors: ["CSV debe incluir cabecera + al menos una fila"] };

    const headerLine = lines[0];
    const delimiter = detectDelimiter(headerLine);
    const headers = parseCsvLine(headerLine, delimiter).map(normalizeHeaderKey);

    const idx = (key: string) => headers.findIndex((h) => h === key);
    const iDate = idx("date");
    const iProject = idx("projectname");
    const iOrigin = idx("origin");
    const iDestination = idx("destination");

    const iReason = idx("reason");
    const iDistance = (() => {
      const a = idx("distance");
      if (a >= 0) return a;
      const b = idx("km");
      if (b >= 0) return b;
      return -1;
    })();

    if (iDate < 0 || iProject < 0 || iOrigin < 0 || iDestination < 0) {
      return {
        trips: [],
        errors: ["Faltan cabeceras requeridas: date, projectName, origin, destination"],
      };
    }

    const reserved = new Set(["date", "projectname", "origin", "destination", "reason", "distance", "km"]);

    const errors: string[] = [];
    const tripsOut: SavedTrip[] = [];

    for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
      const rowRaw = lines[rowIdx];
      const cols = parseCsvLine(rowRaw, delimiter);
      const get = (i: number) => (i >= 0 ? String(cols[i] ?? "").trim() : "");

      const dateIso = parseDateToIso(get(iDate));
      const projectName = get(iProject);
      const reason = iReason >= 0 ? get(iReason) : "";

      const originRaw = get(iOrigin);
      const destinationRaw = get(iDestination);
      const origin = originRaw || profile.baseAddress || "";
      const destination = destinationRaw || profile.baseAddress || "";

      if (!dateIso) {
        errors.push(`Fila ${rowIdx + 1}: fecha inválida`);
        continue;
      }
      if (!projectName.trim()) {
        errors.push(`Fila ${rowIdx + 1}: projectName vacío`);
        continue;
      }
      if (!origin || !destination) {
        errors.push(`Fila ${rowIdx + 1}: origin/destination vacíos (y no hay dirección base)`);
        continue;
      }

      const stops: string[] = [];
      for (let i = 0; i < headers.length; i++) {
        if (reserved.has(headers[i])) continue;
        const v = String(cols[i] ?? "").trim();
        if (v) stops.push(v);
      }

      const routeValues = [origin, ...stops, destination].filter((x) => String(x ?? "").trim().length > 0);

      let distanceKm = 0;
      if (iDistance >= 0) {
        const raw = get(iDistance).replace(",", ".");
        const n = Number.parseFloat(raw);
        if (Number.isFinite(n) && n > 0) distanceKm = n;
      }

      tripsOut.push({
        id: uuidv4(),
        date: dateIso,
        route: routeValues,
        project: projectName,
        purpose: reason,
        passengers: 0,
        distance: distanceKm,
        specialOrigin: "base",
      });
    }

    return { trips: tripsOut, errors };
  };

  const importCsvText = async (rawCsv: string, sourceLabel: string) => {
    if (!onSave) return;
    if (csvBusy) return;

    setCsvBusy(true);
    try {
      const token = await getAccessToken();
      const { trips: parsedTrips, errors } = parseCsvTrips(rawCsv);
      if (errors.length > 0) {
        toast.error(errors.slice(0, 3).join("\n"));
      }

      if (parsedTrips.length === 0) {
        toast.error(t("bulk.errorNoValidTrips"));
        return;
      }

      let ok = 0;
      let failed = 0;

      // sequential to avoid rate limits and keep ordering
      for (const trip of parsedTrips) {
        try {
          const projectId = await resolveProjectIdByName(trip.project, sourceLabel);

          let distance = trip.distance;
          if (!Number.isFinite(distance) || distance <= 0) {
            const computedKm = await computeDistanceKmIfMissing(trip.route, undefined, token);
            if (typeof computedKm === "number" && computedKm > 0) distance = computedKm;
          }

          onSave({ ...trip, projectId, distance });
          ok += 1;
        } catch (e) {
          console.error(e);
          failed += 1;
        }
      }

      if (ok > 0) toast.success(tf("bulk.toastImportedTrips", { count: ok }));
      if (failed > 0) toast.error(tf("bulk.toastFailedTrips", { count: failed }));

      // keep the text for user inspection; close if everything ok
      if (failed === 0) setOpen(false);
    } finally {
      setCsvBusy(false);
    }
  };

  const handleCsvFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readCsvTextFromFile(file);
      setCsvText(text);
      toast.success(t("bulk.toastCsvLoaded"));
    } catch (err) {
      console.error(err);
      toast.error(t("bulk.errorCsvRead"));
    } finally {
      e.target.value = "";
    }
  };

  const importFromGoogleDrive = async () => {
    const token = await getAccessToken();
    if (!token) {
      toast.error(t("bulk.errorLoginDrive"));
      return;
    }

    const input = window.prompt(t("bulk.promptDriveLink"));
    const fileId = parseDriveFileId(input ?? "");
    if (!fileId) {
      toast.error(t("bulk.errorDetectFileId"));
      return;
    }

    try {
      const response = await fetch(`/api/google/drive/download?fileId=${encodeURIComponent(fileId)}&name=${encodeURIComponent("import.csv")}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || t("bulk.errorDriveDownload"));
      }
      const text = await response.text();
      setCsvText(text.replace(/^\uFEFF/, ""));
      toast.success(t("bulk.toastCsvImportedDrive"));
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? t("bulk.errorDriveDownload"));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    if (files.length > 20) {
      toast.error(t("bulk.errorMaxDocuments"));
      e.target.value = "";
      return;
    }

    for (const file of files) {
      if (file.type !== "application/pdf") {
        toast.error(t("bulk.errorOnlyPdf"));
        e.target.value = "";
        return;
      }
    }

    setSelectedFiles(files);
  };

  const startAiProcess = async () => {
    if (selectedFiles.length === 0) return;
    
    setAiLoading(true);
    setAiStep("processing");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error(t("bulk.errorNotAuthenticated"));

      const createdJobIds: string[] = [];
      const metaById: Record<string, { fileName: string; mimeType: string; storagePath: string }> = {};
      let successCount = 0;
      let failCount = 0;

      for (const file of selectedFiles) {
        let createdJobId: string | null = null;
        try {
          // 1. Create Job
          const { data: job, error: jobError } = await supabase
            .from("callsheet_jobs")
            .insert({
              user_id: user.id,
              storage_path: "pending",
              status: "created",
            })
            .select()
            .single();

          if (jobError) throw jobError;
          createdJobId = job.id;

          // 2. Upload File
          const filePath = `${user.id}/${job.id}/${file.name}`;
          const { error: uploadError } = await supabase.storage.from("callsheets").upload(filePath, file);
          if (uploadError) throw uploadError;

          // 3. Queue Job
          const { error: updateError } = await supabase
            .from("callsheet_jobs")
            .update({ storage_path: filePath, status: "queued" })
            .eq("id", job.id);
          if (updateError) throw updateError;

          createdJobIds.push(job.id);
          metaById[job.id] = { fileName: file.name, mimeType: file.type, storagePath: filePath };
          successCount += 1;
        } catch (err) {
          console.error(err);
          failCount += 1;
          if (createdJobId) {
            try {
              await supabase.from("callsheet_jobs").delete().eq("id", createdJobId);
            } catch {
              // ignore
            }
          }
        }
      }

      if (successCount === 0) {
        setAiStep("upload");
        toast.error(t("bulk.errorUploadNone"));
        return;
      }

      if (successCount > 0) toast.success(tf("bulk.toastUploadedDocs", { count: successCount }));
      if (failCount > 0) toast.error(tf("bulk.toastFailedDocs", { count: failCount }));

      setJobIds(createdJobIds);
      setJobMetaById(metaById);
      setCurrentJobId(null);
      setProcessingTotal(createdJobIds.length);
      setProcessingDone(0);
      // Kick the worker once so users don't have to wait for cron.
      try {
        const token = await getAccessToken();
        await fetch("/api/callsheets/trigger-worker", {
          method: "POST",
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
            "Content-Type": "application/json",
          },
        });
      } catch {
        // ignore: polling will still update if cron runs
      }

    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t("bulk.errorUploadDoc"));
    }
    finally {
      setAiLoading(false);
    }
  };

  // Polling Effect
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (aiStep === "processing" && jobIds.length > 0) {
      const checkStatus = async () => {
        try {
          const { data: jobs, error: jobsError } = await supabase
            .from("callsheet_jobs")
            .select("id, status, needs_review_reason")
            .in("id", jobIds);

          if (jobsError || !jobs) return;

          const doneIds = jobs.filter((j: any) => j.status === "done").map((j: any) => j.id);
          const failedJobs = jobs.filter((j: any) => j.status === "failed" || j.status === "needs_review" || j.status === "out_of_quota");
          const failedIds = failedJobs.map((j: any) => j.id);

          setProcessingDone(doneIds.length);

          if (failedIds.length > 0) {
            const quotaJob = failedJobs.find((j: any) => parseMonthlyQuotaExceededReason(j.needs_review_reason));
            let failureDescription: string | undefined;
            if (quotaJob) {
              const parsed = parseMonthlyQuotaExceededReason(quotaJob.needs_review_reason);
              failureDescription =
                parsed?.used != null && parsed?.limit != null
                  ? tf("aiQuota.monthlyLimitReachedBody", { used: String(parsed.used), limit: String(parsed.limit) })
                  : t("aiQuota.monthlyLimitReachedBodyGeneric");
            } else {
              const firstReason = String(failedJobs[0]?.needs_review_reason ?? "").trim();
              if (firstReason) failureDescription = firstReason;
            }

            toast.error(tf("bulk.toastFailedDocs", { count: failedIds.length }), {
              description: failureDescription,
            });

            // Remove failed jobs from the queue so we don't keep polling them.
            const remainingJobIds = jobIds.filter((id) => !failedIds.includes(id));
            setJobIds((prev) => prev.filter((id) => !failedIds.includes(id)));
            setJobMetaById((prev) => {
              const next = { ...prev };
              failedIds.forEach((id) => {
                delete next[id];
              });
              return next;
            });

            // If everything failed (no remaining queued jobs and no done jobs), stop the processing UI.
            if (remainingJobIds.length === 0 && doneIds.length === 0) {
              clearInterval(interval);
              setAiStep("upload");
              setAiLoading(false);
              setSelectedFiles([]);
              setJobIds([]);
              setCurrentJobId(null);
              setJobMetaById({});
              setProcessingTotal(0);
              setProcessingDone(0);
            }
          }

          // If a job is done, move to review for the first completed one.
          const nextReadyJobId = doneIds[0];
          if (nextReadyJobId) {
            clearInterval(interval);
            setCurrentJobId(nextReadyJobId);

            const { data: result, error: resultError } = await supabase
              .from("callsheet_results")
              .select("*")
              .eq("job_id", nextReadyJobId)
              .maybeSingle();

            const { data: locs, error: locsError } = await supabase
              .from("callsheet_locations")
              .select("*")
              .eq("job_id", nextReadyJobId);

            if (resultError || locsError) return;
            if (!result) return;

            setExtractedData({ result, locations: locs || [] });
            setReviewDate(result.date_value || "");
            setReviewProject(result.project_value || "");
            setReviewProducer(result.producer_value || "");
            optimizeRoute(locs || []);
          }
        } catch (e) {
          console.error("Polling error", e);
        }
      };

      interval = setInterval(checkStatus, 2000);
      void checkStatus();
    }

    return () => clearInterval(interval);
  }, [aiStep, jobIds]);

  const optimizeRoute = async (rawLocations: any[]) => {
      setIsOptimizing(true);
      // Use raw strings if formatted_address is missing/null
      const currentLocs = rawLocations.map(l => l.formatted_address || l.address_raw);

      try {
        const token = await getAccessToken();
        const { locations: normalizedLocs, distanceKm } = await optimizeCallsheetLocationsAndDistance({
        profile,
        rawLocations: currentLocs,
        accessToken: token,
        });

        setReviewLocations(normalizedLocs);
        if (typeof distanceKm === "number") setReviewDistance(String(distanceKm));

      } catch (e) {
          console.error("Optimization failed", e);
          // Still create the trip with what we have
          setReviewLocations(currentLocs);
      } finally {
          setIsOptimizing(false);
          setAiLoading(false);
          setAiStep("review");
      }
  };

  const { profile } = useUserProfile();
  const { projects, addProject } = useProjects();

// Duplicate SavedTrip interface removed; projectId is declared in the top SavedTrip interface.

  const handleSaveTrip = async () => {
    if (!onSave) return;
    if (!currentJobId) return;
    const currentMeta = jobMetaById[currentJobId];
    if (!currentMeta) return;
    
    // Use base address for Origin and Destination
    const baseAddress = profile.baseAddress || "";
    
    // Construct route: Origin -> [Extracted Stops] -> Destination
    // Only add base address if it exists, otherwise just use extracted locations (though strictly user wants base -> stops -> base)
    // If baseAddress is empty, we might want to prompt or just leave it. Assuming it exists or user is fine with empty for now if not set.
    const fullRoute = baseAddress 
        ? [baseAddress, ...reviewLocations, baseAddress]
        : reviewLocations;

    const trimmedProjectName = reviewProject.trim();
    let projectIdToUse: string | undefined;

    // 1. Resolve Project ID
    if (trimmedProjectName) {
        const existingProject = projects.find(p => p.name.trim().toLowerCase() === trimmedProjectName.toLowerCase());
        
        if (existingProject) {
            projectIdToUse = existingProject.id;
        } else {
            // New Project
            const newProjectId = uuidv4();
            projectIdToUse = newProjectId;
            
            await addProject({
                id: newProjectId,
                name: trimmedProjectName,
                producer: reviewProducer,
              description: `Created from AI Upload: ${currentMeta.fileName}`,
                ratePerKm: 0.30, 
                starred: false,
                trips: 0,
                totalKm: 0,
                documents: 0,
                invoices: 0,
                estimatedCost: 0,
                shootingDays: 0,
                kmPerDay: 0,
                co2Emissions: 0
            });
            toast.success(`Proyecto "${trimmedProjectName}" creado automáticamente`);
        }
    }

    // Create trip object
    const newTrip: SavedTrip = {
        id: uuidv4(),
        date: reviewDate,
        project: trimmedProjectName,
        projectId: projectIdToUse, // Pass the ID
        purpose: "Rodaje: " + reviewProducer, // Default purpose
        route: fullRoute, 
        passengers: 0,
        distance: parseFloat(reviewDistance) || 0,
        specialOrigin: "base",
        documents: currentMeta.storagePath ? [{
            id: crypto.randomUUID(),
            name: currentMeta.fileName || "Documento Original",
            mimeType: currentMeta.mimeType || "application/pdf",
            storagePath: currentMeta.storagePath,
            createdAt: new Date().toISOString()
        }] : undefined
    };

    onSave(newTrip);
    toast.success("Viaje guardado correctamente");

    const remainingJobIds = jobIds.filter((id) => id !== currentJobId);

    // Remove the current job and continue with the next ones (if any).
    setJobIds((prev) => prev.filter((id) => id !== currentJobId));
    setJobMetaById((prev) => {
      const next = { ...prev };
      delete next[currentJobId];
      return next;
    });

    setCurrentJobId(null);
    setExtractedData(null);
    setIsOptimizing(false);
    setReviewDate("");
    setReviewProject("");
    setReviewProducer("");
    setReviewLocations([]);
    setReviewDistance("0");

    if (remainingJobIds.length > 0) {
      setProcessingTotal(remainingJobIds.length);
      setProcessingDone(0);
      setAiStep("processing");
    } else {
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>{t("bulk.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("bulk.title")}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="csv" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-6">
            <TabsTrigger value="csv" className="gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              {t("bulk.tabCsv")}
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-2">
              <Sparkles className="w-4 h-4" />
              {t("bulk.tabAi")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="csv" className="space-y-6">
             {/* CSV Config logic remains same ... */}
            <div className="rounded-lg border border-border/50 bg-secondary/30 p-4 space-y-3">
              <h4 className="font-semibold text-sm uppercase tracking-wide">{t("bulk.csvInstructionsTitle")}</h4>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                <li>{t("bulk.csvInstructionsRequired")}</li>
                <li>{t("bulk.csvInstructionsStops")}</li>
                <li>{t("bulk.csvInstructionsSeparator")}</li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <input
                type="file"
                ref={csvFileInputRef}
                className="hidden"
                accept=".csv,text/csv"
                onChange={handleCsvFileSelect}
              />
              <Button
                variant="outline"
                className="h-12 gap-2"
                type="button"
                onClick={() => csvFileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4" />
                {t("bulk.selectCsvFile")}
              </Button>
              <Button
                variant="outline"
                className="h-12 gap-2"
                type="button"
                onClick={() => void importFromGoogleDrive()}
              >
                <CloudUpload className="w-4 h-4" />
                {t("bulk.importFromDrive")}
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">{t("bulk.or")}</span>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("bulk.pasteCsv")}</Label>
              <Textarea
                placeholder={exampleText}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="min-h-[140px] font-mono text-sm bg-secondary/30"
              />
              <Button
                variant="secondary"
                className="w-full"
                disabled={!csvText.trim() || csvBusy}
                type="button"
                onClick={() => void importCsvText(csvText, "pasted")}
              >
                {t("bulk.processPasted")}
              </Button>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("bulk.cancel")}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="ai" className="space-y-6">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="application/pdf"
                multiple
                onChange={handleFileSelect}
            />
            
            {aiStep === "upload" && (
                <>
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-border/50 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                    >
                    <Sparkles className="w-12 h-12 text-primary mx-auto mb-4" />
                    <p className="font-medium text-lg">
                      {selectedFiles.length > 0
                        ? selectedFiles.length === 1
                          ? selectedFiles[0].name
                          : `${selectedFiles.length} archivos seleccionados`
                        : t("bulk.aiDropTitle")}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {selectedFiles.length > 0 ? "Click para cambiar archivos" : t("bulk.aiDropSubtitle")}
                    </p>
                    </div>

                    <p className="text-sm text-muted-foreground text-center">
                        Suba sus hojas de rodaje (Call Sheets) en PDF. Nuestra IA extraerá automáticamente fechas, lugares, producción y proyectos.
                    </p>

                    <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        {t("bulk.cancel")}
                    </Button>
                    <Button 
                        variant="add" 
                        className="gap-2" 
                        onClick={startAiProcess} 
                      disabled={selectedFiles.length === 0 || aiLoading}
                    >
                        {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {t("bulk.aiProcess")}
                    </Button>
                    </div>
                </>
            )}

            {aiStep === "processing" && (
                <div className="text-center py-12 space-y-4">
                    <Loader2 className="w-16 h-16 text-primary animate-spin mx-auto" />
                    <div>
                        <h3 className="text-lg font-medium">
                    {isOptimizing ? "Optimizando ruta y direcciones..." : "Analizando documentos..."}
                        </h3>
                  <p className="text-muted-foreground">
                    {processingTotal > 1 ? `Completados ${processingDone}/${processingTotal}` : "Esto puede tomar unos segundos."}
                  </p>
                    </div>
                </div>
            )}

            {aiStep === "review" && (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex items-center gap-2 text-green-500 mb-4">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-medium">Datos extraídos exitosamente</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Proyecto</Label>
                            <Input 
                                value={reviewProject} 
                                onChange={(e) => setReviewProject(e.target.value)} 
                                className="bg-secondary/30"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Fecha</Label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    value={reviewDate} 
                                    onChange={(e) => setReviewDate(e.target.value)} 
                                    className="pl-9 bg-secondary/30"
                                />
                            </div>
                        </div>
                        <div className="space-y-2 col-span-2">
                            <Label>Productora</Label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    value={reviewProducer} 
                                    onChange={(e) => setReviewProducer(e.target.value)} 
                                    className="pl-9 bg-secondary/30"
                                />
                            </div>
                        </div>

                        <div className="space-y-2 col-span-2">
                            <Label>Distancia (km)</Label>
                            <Input 
                                type="number"
                                value={reviewDistance} 
                                onChange={(e) => setReviewDistance(e.target.value)} 
                                className="bg-secondary/30"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Ubicaciones / Ruta ({reviewLocations.length})</Label>
                        
                        <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
                           <MapPin className="w-3 h-3 text-green-500" />
                           <span className="font-semibold">Origen:</span> {profile.baseAddress || "No definido"}
                        </div>

                        <Card className="bg-secondary/20">
                            <CardContent className="p-3 max-h-48 overflow-y-auto space-y-2">
                                {reviewLocations.map((loc, idx) => (
                                    <div key={idx} className="flex items-start gap-2 text-sm p-2 bg-background rounded border border-border/50">
                                        <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                                        <span>{loc}</span>
                                    </div>
                                ))}
                                {reviewLocations.length === 0 && (
                                    <p className="text-sm text-muted-foreground italic">{t("bulk.noLocationsFound")}</p>
                                )}
                            </CardContent>
                        </Card>

                        <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                           <MapPin className="w-3 h-3 text-red-500" />
                           <span className="font-semibold">Destino:</span> {profile.baseAddress || "No definido"}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={resetAiState}>
                            Volver
                        </Button>
                        <Button onClick={handleSaveTrip} className="gap-2">
                            <Save className="w-4 h-4" />
                            {t("bulk.saveTrip")}
                        </Button>
                    </div>
                </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
