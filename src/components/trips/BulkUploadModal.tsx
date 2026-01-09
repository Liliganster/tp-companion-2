import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Sparkles, FileSpreadsheet, CloudUpload, Loader2, MapPin, Calendar, Building2, CheckCircle, Save } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/hooks/use-i18n";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { useUserProfile } from "@/contexts/UserProfileContext";
import { useProjects } from "@/contexts/ProjectsContext";
import { useTrips } from "@/contexts/TripsContext";
import { uuidv4 } from "@/lib/utils";
import { optimizeCallsheetLocationsAndDistance } from "@/lib/callsheetOptimization";
import { useAuth } from "@/contexts/AuthContext";

import { cancelCallsheetJobs } from "@/lib/aiJobCancellation";

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
  callsheet_job_id?: string;
  documents?: any[];
}

interface BulkUploadModalProps {
  trigger: React.ReactNode;
  onSave?: (data: SavedTrip) => Promise<boolean> | boolean | void;
}

let googleApiJsPromise: Promise<void> | null = null;
let googlePickerApiPromise: Promise<void> | null = null;

async function loadGoogleApiJs() {
  if (typeof window === "undefined") throw new Error("Google API no disponible");
  const w = window as any;
  if (w.gapi?.load) return;

  if (!googleApiJsPromise) {
    googleApiJsPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://apis.google.com/js/api.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("No se pudo cargar Google API"));
      document.head.appendChild(script);
    });
  }

  await googleApiJsPromise;
}

async function loadGooglePickerApi() {
  if (!googlePickerApiPromise) {
    googlePickerApiPromise = (async () => {
      await loadGoogleApiJs();
      const w = window as any;
      await new Promise<void>((resolve, reject) => {
        if (!w.gapi?.load) return reject(new Error("Google API no disponible"));
        w.gapi.load("picker", { callback: () => resolve() });
      });
    })();
  }

  await googlePickerApiPromise;
}

async function openGoogleDrivePicker(params: {
  apiKey: string;
  oauthToken: string;
  title: string;
  mimeTypes?: string[];
}): Promise<{ fileId: string; name: string; mimeType: string } | null> {
  await loadGooglePickerApi();

  const w = window as any;
  const google = w.google;
  if (!google?.picker) throw new Error("Google Drive Picker no disponible");

  const mimeTypes = Array.isArray(params.mimeTypes) && params.mimeTypes.length > 0
    ? params.mimeTypes
    : ["text/csv", "application/vnd.google-apps.spreadsheet", "application/vnd.ms-excel"];

  const view = new google.picker.DocsView(google.picker.ViewId.DOCS);
  view.setIncludeFolders(false);
  view.setSelectFolderEnabled(false);
  view.setMimeTypes(mimeTypes.join(","));

  return await new Promise((resolve) => {
    const picker = new google.picker.PickerBuilder()
      .setDeveloperKey(params.apiKey)
      .setOAuthToken(params.oauthToken)
      .setOrigin(window.location.origin)
      .setTitle(params.title)
      .addView(view)
      .setCallback((data: any) => {
        const action = data?.action;
        if (action === google.picker.Action.CANCEL) return resolve(null);
        if (action !== google.picker.Action.PICKED) return;
        const doc = Array.isArray(data?.docs) ? data.docs[0] : null;
        if (!doc?.id) return resolve(null);
        resolve({
          fileId: String(doc.id),
          name: typeof doc.name === "string" ? doc.name : "import.csv",
          mimeType: typeof doc.mimeType === "string" ? doc.mimeType : "",
        });
      })
      .build();

    picker.setVisible(true);
  });
}

export function BulkUploadModal({ trigger, onSave }: BulkUploadModalProps) {
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);
  
  // AI Tab State
  const [aiStep, setAiStep] = useState<"upload" | "processing" | "review">("upload");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [jobMetaById, setJobMetaById] = useState<
    Record<string, { fileName: string; mimeType: string; storagePath: string }>
  >({});
  const [aiLoading, setAiLoading] = useState(false);
  const [processingTotal, setProcessingTotal] = useState(0);
  const [processingDone, setProcessingDone] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  
  type JobStatus = "created" | "queued" | "processing" | "done" | "failed" | "needs_review" | "out_of_quota" | string;
  type JobState = { status: JobStatus; needsReviewReason?: string | null };
  type ReviewTrip = {
    date: string;
    project: string;
    producer: string;
    rawLocations: string[];
    locations: string[];
    distance: string;
    distanceDirty: boolean;
    optimizing: boolean;
  };

  const [jobStateById, setJobStateById] = useState<Record<string, JobState>>({});
  const [reviewByJobId, setReviewByJobId] = useState<Record<string, ReviewTrip>>({});
  const [savingByJobId, setSavingByJobId] = useState<Record<string, boolean>>({});
  const [savedByJobId, setSavedByJobId] = useState<Record<string, boolean>>({});

  const jobResultsLoadingRef = useRef(new Set<string>());
  const failureToastShownRef = useRef(new Set<string>());
  const optimizeChainRef = useRef(Promise.resolve());
  const reviewByJobIdRef = useRef<Record<string, ReviewTrip>>({});
  const savedByJobIdRef = useRef<Record<string, boolean>>({});
  const activeJobIdsRef = useRef<string[]>([]);
  const cancelRequestedRef = useRef(false);
  const triggerWorkerAbortRef = useRef<AbortController | null>(null);
  const dragDepthRef = useRef(0);
  
  const { t, tf, locale } = useI18n();
  const exampleText = t("bulk.examplePlaceholder");
  const { getAccessToken } = useAuth();
  const { profile } = useUserProfile();
  const { projects, addProject } = useProjects();
  const { trips } = useTrips();

  // Reset state when modal closes or tab changes
  useEffect(() => {
    if (open) {
      cancelRequestedRef.current = false;
      activeJobIdsRef.current = [];
      return;
    }

    resetAiState();
  }, [open]);

  const resetAiState = () => {
    setAiStep("upload");
    setSelectedFiles([]);
    setJobIds([]);
    setJobMetaById({});
    setAiLoading(false);
    setProcessingTotal(0);
    setProcessingDone(0);
    setJobStateById({});
    setReviewByJobId({});
    setSavingByJobId({});
    setSavedByJobId({});
    jobResultsLoadingRef.current.clear();
    failureToastShownRef.current.clear();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  useEffect(() => {
    reviewByJobIdRef.current = reviewByJobId;
  }, [reviewByJobId]);

  useEffect(() => {
    savedByJobIdRef.current = savedByJobId;
  }, [savedByJobId]);

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

    // Ensure Google is connected before asking for a Drive link/fileId.
    // Otherwise users only see the prompt but the download will always fail.
    setCsvBusy(true);
    try {
      const statusRes = await fetch("/api/google/oauth/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const statusData: any = await statusRes.json().catch(() => null);
      const scopes = typeof statusData?.scopes === "string" ? statusData.scopes : "";
      const hasDriveScope = scopes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .includes("drive");
      const connected = Boolean(statusData?.connected) && hasDriveScope;

      if (!statusRes.ok || !connected) {
        const returnTo = `${window.location.pathname}${window.location.search}`;
        const startRes = await fetch("/api/google/oauth/start", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ scopes: ["drive"], returnTo }),
        });
        const startData: any = await startRes.json().catch(() => null);
        if (!startRes.ok || !startData?.authUrl) throw new Error(startData?.error || "OAuth start failed");
        window.location.href = startData.authUrl;
        return;
      }

      const pickerApiKey = import.meta.env.VITE_GOOGLE_PICKER_API_KEY as string | undefined;
      if (!pickerApiKey) {
        toast.error(t("bulk.errorDrivePickerNotConfigured"));
        return;
      }

      const tokenRes = await fetch("/api/google/oauth/access-token", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const tokenData: any = await tokenRes.json().catch(() => null);
      if (!tokenRes.ok || !tokenData?.accessToken) {
        throw new Error(tokenData?.message ?? tokenData?.error ?? "Google token failed");
      }

      const picked = await openGoogleDrivePicker({
        apiKey: pickerApiKey,
        oauthToken: tokenData.accessToken,
        title: t("bulk.drivePickerTitle"),
      });
      if (!picked) return;

      const exportMimeType =
        picked.mimeType === "application/vnd.google-apps.spreadsheet" ? "text/csv" : "";

      const url =
        `/api/google/drive/download?fileId=${encodeURIComponent(picked.fileId)}` +
        `&name=${encodeURIComponent(picked.name || "import.csv")}` +
        (exportMimeType ? `&exportMimeType=${encodeURIComponent(exportMimeType)}` : "");

      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || t("bulk.errorDriveDownload"));
      }

      const text = await response.text();
      setCsvText(text.replace(/^\uFEFF/, ""));
      toast.success(t("bulk.toastCsvImportedDrive"));
    } catch (err: any) {
      toast.error("Google", { description: err?.message ?? t("settings.googleConnectFailed") });
    } finally {
      setCsvBusy(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    selectAiFiles(files);
  };

  const selectAiFiles = (files: File[]) => {
    const nextFiles = Array.from(files ?? []).filter(Boolean);
    if (nextFiles.length === 0) return;

    if (nextFiles.length > 20) {
      toast.error(t("bulk.errorMaxDocuments"));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    for (const file of nextFiles) {
      if (file.type !== "application/pdf") {
        toast.error(t("bulk.errorOnlyPdf"));
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    setSelectedFiles(nextFiles);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onDropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer?.files ?? []);
    selectAiFiles(droppedFiles);
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragActive(false);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };

  const startAiProcess = async () => {
    if (selectedFiles.length === 0) return;
    
    setAiLoading(true);
    setAiStep("processing");
    try {
      cancelRequestedRef.current = false;
      activeJobIdsRef.current = [];

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error(t("bulk.errorNotAuthenticated"));

      setJobStateById({});
      setReviewByJobId({});
      setSavingByJobId({});
      setSavedByJobId({});
      jobResultsLoadingRef.current.clear();
      failureToastShownRef.current.clear();

      const createdJobIds: string[] = [];
      const metaById: Record<string, { fileName: string; mimeType: string; storagePath: string }> = {};
      let successCount = 0;
      let failCount = 0;
      let reusedCount = 0;

      for (const file of selectedFiles) {
        if (cancelRequestedRef.current) break;
        let createdJobId: string | null = null;
        try {
          // Avoid duplicates: if the same file was already uploaded previously (user closed modal / re-tried),
          // reuse the existing job instead of creating a new one.
          const existingPattern = `%/${file.name}`;
          const existingQuery = supabase
            .from("callsheet_jobs")
            .select("id, storage_path, status, created_at")
            .eq("user_id", user.id)
            .ilike("storage_path", existingPattern)
            .order("created_at", { ascending: false })
            .limit(5);

          const { data: existingRows, error: existingError } = await existingQuery;
          if (!existingError && Array.isArray(existingRows) && existingRows.length > 0) {
            const candidates = existingRows
              .map((r: any) => ({
                id: String(r?.id ?? ""),
                storagePath: String(r?.storage_path ?? "").trim(),
                status: String(r?.status ?? "").trim(),
                createdAt: String(r?.created_at ?? "").trim(),
              }))
              .filter((r) => r.id && r.storagePath && r.storagePath !== "pending");

            if (candidates.length > 0) {
              const statusScore = (s: string) => {
                switch (s) {
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

              candidates.sort((a, b) => {
                const ds = statusScore(b.status) - statusScore(a.status);
                if (ds !== 0) return ds;
                const ta = Date.parse(a.createdAt);
                const tb = Date.parse(b.createdAt);
                if (Number.isFinite(tb) && Number.isFinite(ta) && tb !== ta) return tb - ta;
                return b.id.localeCompare(a.id);
              });

              const best = candidates[0];
              if (!createdJobIds.includes(best.id)) createdJobIds.push(best.id);
              activeJobIdsRef.current.push(best.id);
              metaById[best.id] = { fileName: file.name, mimeType: file.type, storagePath: best.storagePath };
              reusedCount += 1;
              successCount += 1;

              // If it was left in "created"/"failed", re-queue it so processing continues (no new AI cost multiplier).
              if (best.status === "created" || best.status === "failed" || best.status === "cancelled") {
                try {
                  await supabase
                    .from("callsheet_jobs")
                    .update({ status: "queued", needs_review_reason: null })
                    .eq("id", best.id);
                } catch {
                  // ignore
                }
              }

              continue;
            }
          }

          if (cancelRequestedRef.current) break;

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
          activeJobIdsRef.current.push(job.id);

          if (cancelRequestedRef.current) break;

          // 2. Upload File
          const filePath = `${user.id}/${job.id}/${file.name}`;
          const { error: uploadError } = await supabase.storage.from("callsheets").upload(filePath, file);
          if (uploadError) throw uploadError;

          if (cancelRequestedRef.current) break;

          // 3. Queue Job
          const { error: updateError } = await supabase
            .from("callsheet_jobs")
            .update({ storage_path: filePath, status: "queued" })
            .eq("id", job.id);
          if (updateError) throw updateError;

          createdJobIds.push(job.id);
          activeJobIdsRef.current.push(job.id);
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

      if (cancelRequestedRef.current) {
        void cancelCallsheetJobs(createdJobIds);
        return;
      }

      if (successCount === 0) {
        setAiStep("upload");
        toast.error(t("bulk.errorUploadNone"));
        return;
      }

      if (successCount > 0) toast.success(tf("bulk.toastUploadedDocs", { count: successCount }));
      if (reusedCount > 0) toast.info(tf("bulk.toastReusedDocs", { count: reusedCount }));
      if (failCount > 0) toast.error(tf("bulk.toastFailedDocs", { count: failCount }));

      const existingTripJobIds = new Set<string>(
        (trips ?? []).map((tr) => String((tr as any)?.callsheet_job_id ?? "").trim()).filter(Boolean),
      );
      const alreadySaved: Record<string, boolean> = {};
      let alreadySavedCount = 0;
      for (const id of createdJobIds) {
        if (existingTripJobIds.has(id)) {
          alreadySaved[id] = true;
          alreadySavedCount += 1;
        }
      }
      if (alreadySavedCount > 0) {
        setSavedByJobId(alreadySaved);
        toast.info(tf("bulk.toastAlreadySavedDocs", { count: alreadySavedCount }));
      }

      setJobIds(createdJobIds);
      setJobMetaById(metaById);
      setProcessingTotal(createdJobIds.length);
      setProcessingDone(0);
      // Kick the worker once so users don't have to wait for cron.
      try {
        if (cancelRequestedRef.current) return;
        const token = await getAccessToken();
        triggerWorkerAbortRef.current?.abort();
        const controller = new AbortController();
        triggerWorkerAbortRef.current = controller;
        // Do not await: the worker call can take long and we don't want to block the modal UX.
        void fetch("/api/callsheets/trigger-worker", {
          method: "POST",
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        }).catch(() => null);
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

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      cancelRequestedRef.current = true;
      triggerWorkerAbortRef.current?.abort();
      void cancelCallsheetJobs([...jobIds, ...activeJobIdsRef.current]);
    }

    setOpen(nextOpen);
  };

  // Multi-job: carga resultados para TODOS los documentos completados y los muestra en paralelo.
  const enqueueOptimization = (jobId: string, rawLocations: string[]) => {
    optimizeChainRef.current = optimizeChainRef.current
      .then(async () => {
        setReviewByJobId((prev) => {
          const cur = prev[jobId];
          if (!cur) return prev;
          return { ...prev, [jobId]: { ...cur, optimizing: true } };
        });

        const token = await getAccessToken();
        const { locations: normalizedLocs, distanceKm } = await optimizeCallsheetLocationsAndDistance({
          profile,
          rawLocations,
          accessToken: token,
        });

        setReviewByJobId((prev) => {
          const cur = prev[jobId];
          if (!cur) return prev;
          const nextDistance = cur.distanceDirty
            ? cur.distance
            : typeof distanceKm === "number"
              ? String(distanceKm)
              : cur.distance;
          return {
            ...prev,
            [jobId]: {
              ...cur,
              locations: Array.isArray(normalizedLocs) ? normalizedLocs : cur.locations,
              distance: nextDistance,
              optimizing: false,
            },
          };
        });
      })
      .catch((e) => {
        console.error("Optimization failed", e);
        setReviewByJobId((prev) => {
          const cur = prev[jobId];
          if (!cur) return prev;
          return { ...prev, [jobId]: { ...cur, optimizing: false } };
        });
      });
  };

  const loadJobResult = async (jobId: string) => {
    if (jobResultsLoadingRef.current.has(jobId)) return;
    if (reviewByJobIdRef.current[jobId]) return;
    if (savedByJobIdRef.current[jobId]) return;

    jobResultsLoadingRef.current.add(jobId);
    try {
      const [{ data: result, error: resultError }, { data: locs, error: locsError }] = await Promise.all([
        supabase.from("callsheet_results").select("*").eq("job_id", jobId).maybeSingle(),
        supabase.from("callsheet_locations").select("*").eq("job_id", jobId),
      ]);

      if (resultError || locsError || !result) return;

      const rawLocations = (locs ?? [])
        .map((l: any) => String(l?.formatted_address || l?.address_raw || l?.name_raw || "").trim())
        .filter(Boolean);

      setReviewByJobId((prev) => {
        if (prev[jobId]) return prev;
        return {
          ...prev,
          [jobId]: {
            date: String((result as any).date_value ?? ""),
            project: String((result as any).project_value ?? ""),
            producer: String((result as any).producer_value ?? ""),
            rawLocations,
            locations: rawLocations,
            distance: "0",
            distanceDirty: false,
            optimizing: false,
          },
        };
      });

      if (rawLocations.length > 0) enqueueOptimization(jobId, rawLocations);
    } finally {
      jobResultsLoadingRef.current.delete(jobId);
    }
  };

  // Poll job statuses y carga resultados según vayan llegando.
  useEffect(() => {
    const active = (aiStep === "processing" || aiStep === "review") && jobIds.length > 0;
    if (!active) return;

    const checkStatus = async () => {
      try {
        const { data: jobs, error: jobsError } = await supabase
          .from("callsheet_jobs")
          .select("id, status, needs_review_reason")
          .in("id", jobIds);

        if (jobsError || !jobs) return;

        const doneIds = jobs.filter((j: any) => j.status === "done").map((j: any) => String(j.id));
        const failedJobs = jobs.filter(
          (j: any) => j.status === "failed" || j.status === "needs_review" || j.status === "out_of_quota",
        );

        const hasPending = jobs.some((j: any) => {
          const s = String(j?.status ?? "");
          return s === "created" || s === "queued" || s === "processing";
        });

        setProcessingDone(doneIds.length);
        setJobStateById((prev) => {
          const next = { ...prev };
          for (const j of jobs as any[]) {
            next[String(j.id)] = { status: String(j.status) as JobStatus, needsReviewReason: j.needs_review_reason ?? null };
          }
          return next;
        });

        for (const j of failedJobs as any[]) {
          const id = String(j.id);
          if (failureToastShownRef.current.has(id)) continue;
          failureToastShownRef.current.add(id);

          const status = String(j.status ?? "");
          if (status === "out_of_quota") {
            toast.error(t("bulk.outOfQuotaTitle"), { description: t("bulk.outOfQuotaMessage") });
          } else {
            toast.error(t("bulk.errorProcessOneDoc"), {
              description: String(j.needs_review_reason ?? "").trim() || undefined,
            });
          }
        }

        const pendingLoads = doneIds.filter((id) => !reviewByJobIdRef.current[id] && !savedByJobIdRef.current[id]);
        if (pendingLoads.length > 0) await Promise.allSettled(pendingLoads.map((id) => loadJobResult(id)));

        // Move to review as soon as there are no pending jobs.
        if (aiStep === "processing" && (!hasPending || doneIds.length > 0)) setAiStep("review");
      } catch (e) {
        console.error("Polling error", e);
      }
    };

    const interval = setInterval(checkStatus, 2000);
    void checkStatus();

    return () => {
      clearInterval(interval);
    };
  }, [aiStep, jobIds, t, tf]);

  const jobsForUi = useMemo(() => {
    return jobIds.map((id) => {
      const meta = jobMetaById[id];
      const state = jobStateById[id];
      const review = reviewByJobId[id];
      const saving = Boolean(savingByJobId[id]);
      const saved = Boolean(savedByJobId[id]);
      return {
        id,
        fileName: meta?.fileName ?? id,
        status: (state?.status ?? "queued") as JobStatus,
        reason: state?.needsReviewReason ?? null,
        review,
        saving,
        saved,
      };
    });
  }, [jobIds, jobMetaById, jobStateById, reviewByJobId, savingByJobId, savedByJobId]);

  const jobStats = useMemo(() => {
    const total = jobsForUi.length;
    const done = jobsForUi.filter((j) => j.status === "done").length;
    const ready = jobsForUi.filter((j) => Boolean(j.review) && !j.saved && !j.review?.optimizing).length;
    const saved = jobsForUi.filter((j) => j.saved).length;
    const failed = jobsForUi.filter((j) => j.status === "failed" || j.status === "needs_review" || j.status === "out_of_quota").length;
    const pending = total - done - failed;
    return { total, done, ready, saved, failed, pending };
  }, [jobsForUi]);

  // UI safety net: if all jobs are terminal, stop the processing step immediately.
  useEffect(() => {
    if (aiStep !== "processing") return;
    if (jobStats.total === 0) return;
    if (jobStats.pending === 0) setAiStep("review");
  }, [aiStep, jobStats.pending, jobStats.total]);

  const createdProjectsByNameRef = useRef<Record<string, string>>({});

  const resolveProjectId = async (projectName: string, producer: string, fileName: string): Promise<string | undefined> => {
    const trimmed = projectName.trim();
    if (!trimmed) return undefined;

    const key = trimmed.toLowerCase();
    const cached = createdProjectsByNameRef.current[key];
    if (cached) return cached;

    const existingProject = projects.find((p) => p.name.trim().toLowerCase() === key);
    if (existingProject?.id) {
      createdProjectsByNameRef.current[key] = existingProject.id;
      return existingProject.id;
    }

    const newProjectId = uuidv4();
    await addProject({
      id: newProjectId,
      name: trimmed,
      producer,
      description: `Creado desde IA: ${fileName}`,
      ratePerKm: 0.3,
      starred: false,
      trips: 0,
      totalKm: 0,
      documents: 0,
      invoices: 0,
      estimatedCost: 0,
      shootingDays: 0,
      kmPerDay: 0,
      co2Emissions: 0,
    } as any);

    // Best-effort: if the project already existed, fetch its real id by name.
    const { data } = await supabase.from("projects").select("id").eq("name", trimmed).limit(1).maybeSingle();
    const id = data?.id ? String((data as any).id) : newProjectId;
    createdProjectsByNameRef.current[key] = id;
    return id;
  };

  const updateReview = (jobId: string, patch: Partial<ReviewTrip>) => {
    setReviewByJobId((prev) => {
      const cur = prev[jobId];
      if (!cur) return prev;
      return { ...prev, [jobId]: { ...cur, ...patch } };
    });
  };

  const saveTripForJob = async (jobId: string): Promise<boolean> => {
    if (!onSave) return false;
    const meta = jobMetaById[jobId];
    const review = reviewByJobId[jobId];
    if (!meta || !review) return false;
    if (savingByJobId[jobId] || savedByJobId[jobId]) return true;

    setSavingByJobId((prev) => ({ ...prev, [jobId]: true }));
    try {
      const trimmedProjectName = review.project.trim();
      const producer = (review.producer ?? "").trim();
      const projectIdToUse = await resolveProjectId(trimmedProjectName, producer, meta.fileName);

      const baseAddress = (profile.baseAddress ?? "").trim();
      const stops = review.locations.map((l) => (l ?? "").trim()).filter(Boolean);
      const route = baseAddress ? [baseAddress, ...stops, baseAddress] : stops;

      const newTrip: SavedTrip = {
        id: uuidv4(),
        date: review.date,
        project: trimmedProjectName,
        projectId: projectIdToUse,
        purpose: producer ? tf("bulk.purposeWithProducer", { producer }) : t("bulk.purposeDefault"),
        route,
        passengers: 0,
        distance: Number.parseFloat(String(review.distance).replace(",", ".")) || 0,
        specialOrigin: "base",
        documents: meta.storagePath
          ? [
              {
                id: crypto.randomUUID(),
                name: meta.fileName || t("bulk.originalDocumentName"),
                mimeType: meta.mimeType || "application/pdf",
                storagePath: meta.storagePath,
                bucketId: "callsheets",
                kind: "document",
                createdAt: new Date().toISOString(),
              },
            ]
          : undefined,
        callsheet_job_id: jobId,
      };

      const out = await Promise.resolve(onSave(newTrip));
      const ok = typeof out === "boolean" ? out : true;
      if (ok) setSavedByJobId((prev) => ({ ...prev, [jobId]: true }));
      return ok;
    } catch (e) {
      console.error(e);
      toast.error(t("bulk.errorSaveTrip"));
      return false;
    } finally {
      setSavingByJobId((prev) => ({ ...prev, [jobId]: false }));
    }
  };

  const saveAllReadyTrips = async () => {
    const readyIds = Object.keys(reviewByJobId).filter((id) => {
      if (savedByJobId[id]) return false;
      const review = reviewByJobId[id];
      return Boolean(review) && !review.optimizing;
    });
    if (readyIds.length === 0) return;

    let okCount = 0;
    let failCount = 0;

    for (const id of readyIds) {
      const ok = await saveTripForJob(id);
      if (ok) okCount += 1;
      else failCount += 1;
    }

    if (okCount > 0) toast.success(tf("bulk.toastSavedTrips", { count: okCount }));
    if (failCount > 0) toast.error(tf("bulk.toastFailedTrips", { count: failCount }));
  };

  const renderJobStatusBadge = (status: JobStatus, saved: boolean) => {
    if (saved) {
      return (
        <Badge variant="outline" className="border-green-500/40 text-green-500">
          {t("bulk.statusSaved")}
        </Badge>
      );
    }

    switch (status) {
      case "done":
        return (
          <Badge variant="outline" className="border-green-500/40 text-green-500">
            {t("bulk.statusReady")}
          </Badge>
        );
      case "processing":
        return <Badge variant="secondary">{t("bulk.statusProcessing")}</Badge>;
      case "queued":
      case "created":
        return <Badge variant="secondary">{t("bulk.statusQueued")}</Badge>;
      case "failed":
        return <Badge variant="destructive">{t("bulk.statusFailed")}</Badge>;
      case "needs_review":
        return (
          <Badge variant="outline" className="border-orange-500/40 text-orange-500">
            {t("bulk.statusNeedsReview")}
          </Badge>
        );
      case "out_of_quota":
        return (
          <Badge variant="destructive" className="bg-red-500/20 border-red-500/40 text-red-500">
            {t("bulk.statusOutOfQuota")}
          </Badge>
        );

      default:
        return (
          <Badge variant="outline" title={String(status)}>
            {String(status)}
          </Badge>
        );
    }
  };

  const handleSaveTrip = async () => {
    await saveAllReadyTrips();
    return;
    /*
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
        purpose: reviewProducer ? tf("bulk.purposeWithProducer", { producer: reviewProducer }) : t("bulk.purposeDefault"), // Default purpose
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
    */
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto">
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
                        onDrop={onDropFiles}
                        onDragEnter={onDragEnter}
                        onDragLeave={onDragLeave}
                        onDragOver={onDragOver}
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                          isDragActive
                            ? "border-primary/70 bg-primary/5"
                            : "border-border/50 hover:border-primary/50"
                        }`}
                    >
                    <Sparkles className="w-12 h-12 text-primary mx-auto mb-4" />
                    <p className="font-medium text-lg">
                      {selectedFiles.length > 0
                        ? selectedFiles.length === 1
                          ? selectedFiles[0].name
                          : tf("bulk.aiFilesSelected", { count: selectedFiles.length })
                        : t("bulk.aiDropTitle")}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {selectedFiles.length > 0 ? t("bulk.aiChangeFilesHint") : t("bulk.aiDropSubtitle")}
                    </p>
                    </div>

                    <p className="text-sm text-muted-foreground text-center">
                      {t("bulk.aiDescription")}
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
              <div className="space-y-4">
                <div className="text-center py-10 space-y-3">
                  {jobStats.total > 0 && jobStats.pending === 0 ? (
                    <CheckCircle className="w-12 h-12 text-primary mx-auto" />
                  ) : (
                    <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
                  )}
                  <div>
                    <h3 className="text-lg font-medium">{t("bulk.aiProcessingTitle")}</h3>
                    <p className="text-muted-foreground">
                      {jobStats.total > 0
                        ? tf("bulk.aiProcessingProgress", {
                            done: jobStats.done,
                            total: jobStats.total,
                            pending: jobStats.pending,
                            failed: jobStats.failed,
                          })
                        : t("bulk.aiProcessingHint")}
                    </p>
                  </div>
                </div>

                {jobsForUi.length > 0 && (
                  <Card className="bg-secondary/20">
                    <CardContent className="p-3 space-y-2 max-h-64 overflow-y-auto">
                      {jobsForUi.map((job) => (
                        <div
                          key={job.id}
                          className="flex items-center justify-between gap-3 p-2 bg-background rounded border border-border/50"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{job.fileName}</p>
                            {job.reason && <p className="text-xs text-muted-foreground truncate">{job.reason}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {job.review?.optimizing && (
                              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            )}
                            {renderJobStatusBadge(job.status, job.saved)}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {aiStep === "review" && (
              <>
                {/*
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
                */}

                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-green-500">
                      <CheckCircle className="w-5 h-5" />
                      <div>
                        <p className="font-medium">{t("bulk.aiParallelReviewTitle")}</p>
                        <p className="text-sm text-muted-foreground">
                          {tf("bulk.aiParallelReviewStats", {
                            ready: jobStats.ready,
                            saved: jobStats.saved,
                            pending: jobStats.pending,
                            failed: jobStats.failed,
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" type="button" onClick={resetAiState}>
                        {t("bulk.back")}
                      </Button>
                      <Button
                        type="button"
                        className="gap-2"
                        onClick={() => void saveAllReadyTrips()}
                        disabled={!onSave || jobStats.ready === 0}
                      >
                        <Save className="w-4 h-4" />
                        {t("bulk.saveAll")}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {jobsForUi.map((job) => {
                      const review = job.review;
                      const showProcessing = job.status === "processing" || job.status === "queued" || job.status === "created";
                      const showFailed = job.status === "failed" || job.status === "needs_review" || job.status === "out_of_quota";
                      const showDoneNoReview = job.status === "done" && !review && !job.saved;

                      return (
                        <Card key={job.id} className="bg-secondary/10">
                          <CardContent className="p-4 space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium truncate">{job.fileName}</p>
                                {job.reason && <p className="text-xs text-muted-foreground truncate">{job.reason}</p>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {review?.optimizing && (
                                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                )}
                                {renderJobStatusBadge(job.status, job.saved)}
                              </div>
                            </div>

                            {review && job.status === "done" && (
                              <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>{t("tripModal.project")}</Label>
                                    <Input
                                      value={review.project}
                                      onChange={(e) => updateReview(job.id, { project: e.target.value })}
                                      className="bg-secondary/30"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>{t("tripModal.date")}</Label>
                                    <div className="relative">
                                      <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                      <Input
                                        value={review.date}
                                        onChange={(e) => updateReview(job.id, { date: e.target.value })}
                                        className="pl-9 bg-secondary/30"
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-2 sm:col-span-2">
                                    <Label>{t("bulk.producerLabel")}</Label>
                                    <div className="relative">
                                      <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                      <Input
                                        value={review.producer}
                                        onChange={(e) => updateReview(job.id, { producer: e.target.value })}
                                        className="pl-9 bg-secondary/30"
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-2 sm:col-span-2">
                                    <Label>{t("tripModal.distance")}</Label>
                                    <Input
                                      type="number"
                                      value={review.distance}
                                      onChange={(e) =>
                                        updateReview(job.id, { distance: e.target.value, distanceDirty: true })
                                      }
                                      className="bg-secondary/30"
                                    />
                                    {review.optimizing && (
                                      <p className="text-xs text-muted-foreground">{t("bulk.optimizingHint")}</p>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <Label>{tf("bulk.locationsRouteLabel", { count: review.locations.length })}</Label>

                                  <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
                                    <MapPin className="w-3 h-3 text-green-500" />
                                    <span className="font-semibold">{t("bulk.originLabel")}:</span>{" "}
                                    {profile.baseAddress || t("bulk.notSet")}
                                  </div>

                                  <Card className="bg-secondary/20">
                                    <CardContent className="p-3 max-h-48 overflow-y-auto space-y-2">
                                      {review.locations.map((loc, idx) => (
                                        <div
                                          key={idx}
                                          className="flex items-start gap-2 text-sm p-2 bg-background rounded border border-border/50"
                                        >
                                          <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                                          <span>{loc}</span>
                                        </div>
                                      ))}
                                      {review.locations.length === 0 && (
                                        <p className="text-sm text-muted-foreground italic">{t("bulk.noLocationsFound")}</p>
                                      )}
                                    </CardContent>
                                  </Card>

                                  <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                                    <MapPin className="w-3 h-3 text-red-500" />
                                    <span className="font-semibold">{t("bulk.destinationLabel")}:</span>{" "}
                                    {profile.baseAddress || t("bulk.notSet")}
                                  </div>
                                </div>

                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    className="gap-2"
                                    onClick={() => void saveTripForJob(job.id)}
                                    disabled={!onSave || job.saving || job.saved || review.optimizing}
                                  >
                                    {job.saving ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Save className="w-4 h-4" />
                                    )}
                                    {job.saved ? t("bulk.statusSaved") : t("bulk.saveTrip")}
                                  </Button>
                                </div>
                              </>
                            )}

                            {showProcessing && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>
                                  {job.status === "processing"
                                    ? t("bulk.statusProcessingEllipsis")
                                    : t("bulk.statusQueuedEllipsis")}
                                </span>
                              </div>
                            )}

                            {showDoneNoReview && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>{t("bulk.loadingResults")}</span>
                              </div>
                            )}

                            {showFailed && (
                              <>
                                {job.status === "out_of_quota" ? (
                                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 space-y-2">
                                    <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                                      {t("bulk.outOfQuotaTitle")}
                                    </p>
                                    <p className="text-xs text-red-600/80 dark:text-red-400/80">
                                      {t("bulk.outOfQuotaMessage")}
                                    </p>
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="w-full gap-1"
                                      onClick={() => {
                                        // Navegar a página de planes/suscripción
                                        window.location.href = "/settings?tab=subscription";
                                      }}
                                    >
                                      {t("bulk.outOfQuotaButton")}
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="text-sm text-muted-foreground">
                                    {job.reason || t("bulk.docProcessFailed")}
                                  </div>
                                )}
                              </>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
