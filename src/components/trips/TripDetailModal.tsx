import { useMemo, useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MapPin, FileText, CircleDot, Eye, Receipt, Trash2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { TripGoogleMap } from "@/components/trips/TripGoogleMap";
import { Trip, useTrips } from "@/contexts/TripsContext";
import { useProjects } from "@/contexts/ProjectsContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { cascadeDeleteInvoiceJobById } from "@/lib/cascadeDelete";
import { parseMonthlyQuotaExceededReason } from "@/lib/aiQuotaReason";
import { cancelInvoiceJobs } from "@/lib/aiJobCancellation";

interface TripDetailModalProps {
  trip: Trip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TripDetailModal({ trip, open, onOpenChange }: TripDetailModalProps) {
  const { t, tf, locale } = useI18n();
  const { profile } = useUserProfile();
  const { trips, updateTrip } = useTrips();
  const { projects, refreshProjects } = useProjects();
  const { getAccessToken } = useAuth();
  const { toast } = useToast();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDocName, setPreviewDocName] = useState<string>("");
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const invoiceInputRef = useRef<HTMLInputElement>(null);
  const [invoicePurpose, setInvoicePurpose] = useState<string>("");
  const [invoiceStatus, setInvoiceStatus] = useState<string>("");
  const [invoiceError, setInvoiceError] = useState<string>("");
  const quotaToastShownRef = useRef(false);

  const liveTrip = useMemo(() => {
    if (!trip) return null;
    return trips.find((t) => t.id === trip.id) ?? trip;
  }, [trip, trips]);

  useEffect(() => {
    if (!open) {
      setPreviewUrl(null);
      setPreviewDocName("");
      setInvoicePurpose("");
      setInvoiceStatus("");
      setInvoiceError("");
      quotaToastShownRef.current = false;
    } else if (liveTrip?.documents && liveTrip.documents.length > 0) {
        // Auto-load the first document
        viewDocument(liveTrip.documents[0]);
    }
  }, [liveTrip, open]);

  // Poll invoice extraction while modal is open so the trip gets updated with the extracted amount/currency.
  const invoiceJobId = liveTrip?.invoiceJobId ?? null;
  const liveTripId = liveTrip?.id ?? null;

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && invoiceJobId) {
      void cancelInvoiceJobs([invoiceJobId]);
    }
    onOpenChange(nextOpen);
  };

  useEffect(() => {
    if (!open || !supabase) return;
    if (!invoiceJobId || !liveTripId) return;

    let stopped = false;
    let interval: any = null;

    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (interval) clearInterval(interval);
      interval = null;
    };

    const tick = async () => {
      if (stopped) return;
      const { data: job, error: jobError } = await supabase
        .from("invoice_jobs")
        .select("id, status, needs_review_reason")
        .eq("id", invoiceJobId)
        .maybeSingle();

      if (jobError || !job) return;
      setInvoiceStatus(job.status || "");
      setInvoiceError(job.needs_review_reason || "");

      if (job.status === "cancelled") {
        stop();
        return;
      }

      if (job.status === "failed" || job.status === "needs_review" || job.status === "out_of_quota") {
        if (!quotaToastShownRef.current && (job.status === "out_of_quota" || job.status === "needs_review")) {
          const parsed = parseMonthlyQuotaExceededReason(job.needs_review_reason);
          if (parsed) {
            quotaToastShownRef.current = true;
            const description =
              parsed.used != null && parsed.limit != null
                ? tf("aiQuota.monthlyLimitReachedBody", {
                    used: String(parsed.used),
                    limit: String(parsed.limit),
                  })
                : t("aiQuota.monthlyLimitReachedBodyGeneric");
            toast({
              title: t("aiQuota.monthlyLimitReachedTitle"),
              description,
              variant: "destructive",
            });
          }
        }
        stop();
        return;
      }

      if (job.status !== "done") return;

      const { data: result } = await supabase
        .from("invoice_results")
        .select("total_amount, currency, purpose")
        .eq("job_id", invoiceJobId)
        .maybeSingle();

      if (!result) return;

      setInvoicePurpose(result.purpose || "");
      const amount = Number(result.total_amount);
      const currency = (result.currency || "EUR").toUpperCase();
      if (Number.isFinite(amount) && amount > 0) {
        await updateTrip(liveTripId, { invoiceAmount: amount, invoiceCurrency: currency });
      }

      refreshProjects();
      stop();
    };

    interval = setInterval(() => void tick(), 4000);
    void tick();

    return () => {
      stop();
    };
  }, [invoiceJobId, liveTripId, open, refreshProjects, updateTrip]);

  if (!liveTrip) return null;

  const formattedDate = (() => {
    const raw = liveTrip.date?.trim?.() ?? "";
    const time = Date.parse(raw);
    if (!raw) return "-";
    if (!Number.isFinite(time)) return raw;
    return new Date(time).toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  })();

  const documentedTotal = 0;
  const documentedTotalLabel = `${documentedTotal.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;

  const tripDocuments = liveTrip.documents ?? [];
  const totalDocumentedDisplay = (() => {
    const amount = Number(liveTrip.invoiceAmount);
    if (Number.isFinite(amount) && amount > 0) {
      const currency = (liveTrip.invoiceCurrency || "EUR").toUpperCase();
      return `${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
    }
    if (liveTrip.invoiceJobId) {
      if (invoiceStatus === "out_of_quota") return t("aiQuota.outOfQuotaBadge");
      if (invoiceStatus === "needs_review") return t("tripDetail.invoiceNeedsReview");
      if (invoiceStatus === "failed") return t("tripDetail.invoiceFailed");
      if (invoiceStatus === "cancelled") return t("tripDetail.invoiceCancelled");
      return t("tripDetail.invoiceExtracting");
    }
    return t("tripDetail.totalDocumentedEmpty");
  })();

  const onAttachInvoice = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!supabase) return;

    // Ensure the trip is linked to a real project so the invoice can appear under the project and in analyses.
    let resolvedProjectId: string | null = liveTrip.projectId ?? null;
    if (!resolvedProjectId) {
      const projectName = (liveTrip.project ?? "").trim();
      const byExact = projects.find((p) => p.name === projectName);
      const byLoose =
        !byExact && projectName
          ? projects.find((p) => (p.name ?? "").toLowerCase() === projectName.toLowerCase())
          : undefined;
      resolvedProjectId = (byExact?.id ?? byLoose?.id ?? null) as any;

      if (resolvedProjectId) {
        const ok = await updateTrip(liveTrip.id, { projectId: resolvedProjectId });
        if (!ok) resolvedProjectId = null;
      }
    }

    if (!resolvedProjectId) {
      toast({
        title: t("tripDetail.errorTitle"),
        description: t("tripDetail.missingProjectIdForInvoice"),
        variant: "destructive",
      });
      if (invoiceInputRef.current) invoiceInputRef.current.value = "";
      return;
    }

    const list = Array.from(files);
    if (list.length > 1) {
      toast({
        title: t("tripDetail.errorTitle"),
        description: t("tripDetail.onlyOneInvoice"),
        variant: "destructive",
      });
      if (invoiceInputRef.current) invoiceInputRef.current.value = "";
      return;
    }

    setInvoiceBusy(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) throw new Error(t("tripDetail.authRequired"));

      const userId = data.user.id;
      const file = list[0]!;
      const safeName = file.name.replace(/\s+/g, " ").trim();
      const storagePath = `${userId}/trip-invoices/${liveTrip.id}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage.from("project_documents").upload(storagePath, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data: jobData, error: jobError } = await supabase
        .from("invoice_jobs")
        .insert({
          project_id: resolvedProjectId,
          trip_id: liveTrip.id,
          user_id: userId,
          storage_path: storagePath,
          status: "created",
        })
        .select("id")
        .single();
      if (jobError) throw jobError;

      // Also register under the project so it appears in project invoice list immediately.
      const { error: projectDocError } = await supabase.from("project_documents").insert({
        project_id: resolvedProjectId,
        user_id: userId,
        name: safeName,
        storage_path: storagePath,
        type: "invoice",
        invoice_job_id: jobData.id,
      });
      if (projectDocError) throw projectDocError;

      const invoiceDoc: NonNullable<Trip["documents"]>[number] = {
        id: crypto.randomUUID(),
        name: safeName,
        mimeType: file.type || "application/octet-stream",
        storagePath,
        bucketId: "project_documents",
        kind: "invoice",
        invoiceJobId: jobData.id,
        createdAt: new Date().toISOString(),
      };

      const nextDocs = [...tripDocuments, invoiceDoc];
      const ok = await updateTrip(liveTrip.id, { documents: nextDocs, invoiceJobId: jobData.id });
      if (!ok) throw new Error(t("tripDetail.attachSaveFailed"));

      // Queue for IA processing (preferred)
      let queued = false;
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/invoices/queue", {
          method: "POST",
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ jobId: jobData.id }),
        });
        queued = res.ok;
      } catch (queueErr) {
        console.warn("Failed to queue invoice job:", queueErr);
      }

      // Fallback: queue directly via RLS if API isn't reachable.
      if (!queued) {
        const { error: queueDbError } = await supabase.from("invoice_jobs").update({ status: "queued" }).eq("id", jobData.id);
        if (!queueDbError) queued = true;
      }

      setInvoiceStatus(queued ? "queued" : "created");
      setInvoiceError("");

      toast({
        title: t("tripDetail.invoiceAttachedTitle"),
        description: t("tripDetail.invoiceAttachedBody"),
      });

      void viewDocument(invoiceDoc);
      refreshProjects();
    } catch (e: any) {
      console.error(e);
      toast({
        title: t("tripDetail.errorTitle"),
        description: e?.message ?? t("tripDetail.attachFailed"),
        variant: "destructive",
      });
    } finally {
      setInvoiceBusy(false);
      if (invoiceInputRef.current) invoiceInputRef.current.value = "";
    }
  };

  const deleteTripInvoice = async () => {
    const jobId = typeof liveTrip.invoiceJobId === "string" ? liveTrip.invoiceJobId : "";
    if (!jobId) return;

    if (!confirm(t("projectDetail.confirmDeleteInvoice") as any)) return;

    setInvoiceBusy(true);
    try {
      const nextDocs = (tripDocuments ?? []).filter((d) => {
        if (d?.kind === "invoice") return false;
        if (d?.invoiceJobId && d.invoiceJobId === jobId) return false;
        return true;
      });

      await cascadeDeleteInvoiceJobById(supabase, jobId);

      // Ensure local state updates immediately (in addition to realtime sync).
      await updateTrip(liveTrip.id, {
        invoiceAmount: null,
        invoiceCurrency: null,
        invoiceJobId: null,
        documents: nextDocs,
      });

      setInvoicePurpose("");
      setInvoiceStatus("");
      setInvoiceError("");
      setPreviewUrl(null);
      setPreviewDocName("");

      toast({
        title: t("projectDetail.toastInvoiceDeleted"),
      });
      refreshProjects();
    } catch (e: any) {
      console.error(e);
      toast({
        title: t("tripDetail.errorTitle"),
        description: e?.message ?? t("tripDetail.attachFailed"),
        variant: "destructive",
      });
    } finally {
      setInvoiceBusy(false);
    }
  };


  const viewDocument = async (doc: NonNullable<Trip["documents"]>[number]) => {
    // Handle Supabase Storage files
    if (doc.storagePath) {
      try {
        const bucket = doc.bucketId || "callsheets";
        const { data, error } = await supabase.storage
          .from(bucket)
          .download(doc.storagePath);

        if (error) throw error;

        const url = URL.createObjectURL(data);
        setPreviewUrl(url);
        setPreviewDocName(doc.name);
      } catch (e) {
        console.error("Preview error:", e);
        toast({ title: t("tripDetail.errorTitle"), description: t("tripDetail.previewLoadFailed"), variant: "destructive" });
      }
      return;
    }

    // Handle Google Drive files
    const token = await getAccessToken();
    if (!token) return;

    // For Google Drive, we might not get a blob easily if it's a GDoc, 
    // but assuming it's a file we can try to download as blob for preview
    // or keep legacy download behavior if it fails.
    try {
        const response = await fetch(
            `/api/google/drive/download?fileId=${encodeURIComponent(doc.driveFileId!)}&name=${encodeURIComponent(doc.name)}`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!response.ok) throw new Error(t("tripDetail.driveFetchFailed"));
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setPreviewDocName(doc.name);
    } catch {
        toast({ title: "Drive", description: t("tripDetail.driveFetchFailed"), variant: "destructive" });
    }
  };

  return (
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle>{t("tripDetail.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("tripDetail.title")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col md:flex-row h-[600px]">
          <div className="w-full md:w-80 p-4 space-y-4 overflow-y-auto border-r border-border/50 bg-secondary/20">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.date")}</Label>
              <p className="font-semibold">{formattedDate}</p>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.project")}</Label>
              <p className="font-semibold">{liveTrip.project}</p>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.driver")}</Label>
              <p className="font-semibold">{profile.fullName || t("tripDetail.currentUser")}</p>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.purpose")}</Label>
              <p className="font-semibold">{liveTrip.purpose}</p>
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-primary" />
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.route")}</Label>
              </div>
              <div className="space-y-2 ml-1">
                {liveTrip.route.map((stop, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <CircleDot
                        className={`w-4 h-4 ${index === 0 || index === liveTrip.route.length - 1 ? "text-primary" : "text-muted-foreground"
                          }`}
                      />
                      {index < liveTrip.route.length - 1 && <div className="w-0.5 h-6 bg-border" />}
                    </div>
                    <span className="text-sm">{stop}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.totalDistance")}</Label>
              <p className="text-2xl font-bold text-primary">{liveTrip.distance} km</p>
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground block">
                    {t("tripDetail.invoicesTitle")}
                  </Label>
                  {invoiceStatus ? (
                    <p className="text-xs text-muted-foreground">
                      {t("tripDetail.invoiceStatusLabel")}: {invoiceStatus}
                      {invoiceStatus === "needs_review" && invoiceError ? ` — ${invoiceError}` : null}
                    </p>
                  ) : null}
                  {invoicePurpose ? (
                    <p className="text-xs text-muted-foreground truncate" title={invoicePurpose}>
                      {invoicePurpose}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={invoiceInputRef}
                    type="file"
                    className="hidden"
                    accept="application/pdf,image/*"
                    onChange={(e) => void onAttachInvoice(e.target.files)}
                  />
                  {liveTrip.invoiceJobId ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      type="button"
                      disabled={invoiceBusy}
                      onClick={() => void deleteTripInvoice()}
                    >
                      <Trash2 className="w-3 h-3" />
                      {t("trips.delete")}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1"
                    type="button"
                    disabled={invoiceBusy}
                    onClick={() => invoiceInputRef.current?.click()}
                  >
                    <Receipt className="w-3 h-3" />
                    {t("tripDetail.attachInvoice")}
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{tf("tripDetail.totalDocumented", { amount: totalDocumentedDisplay })}</p>
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            <Tabs defaultValue="map" className="flex-1 flex flex-col">
              <div className="flex-1 relative">
                <TabsContent value="map" className="absolute inset-0 m-0">
                  <TripGoogleMap route={liveTrip.route} open={open} />
                </TabsContent>

                <TabsContent value="document" className="absolute inset-0 m-0 bg-secondary/20">
                  <div className="w-full h-full p-6 overflow-auto">
                    {previewUrl ? (
                        <div className="flex flex-col h-full">
                            <div className="flex-1 bg-background rounded border border-border/50 overflow-hidden">
                                {previewDocName.toLowerCase().endsWith(".pdf") || previewDocName.toLowerCase().endsWith(".jpg") || previewDocName.toLowerCase().endsWith(".png") ? (
                                     <iframe src={previewUrl} className="w-full h-full" title={t("tripDetail.previewFrameTitle")} />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-center p-4">
                                        <FileText className="w-12 h-12 text-muted-foreground mb-2" />
                                        <p>{t("tripDetail.previewUnavailable")}</p>
                                        <Button variant="outline" size="sm" asChild className="mt-4">
                                            <a href={previewUrl} download={previewDocName}>
                                                {t("tripDetail.downloadFile")}
                                            </a>
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <>
                        <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-muted-foreground" />
                            <h3 className="font-medium">{t("tripDetail.tabDocument")}</h3>
                        </div>
                    </div>

                        {tripDocuments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[70%] text-center space-y-2">
                            <p className="text-muted-foreground">{t("tripDetail.noDocuments")}</p>
                        </div>
                        ) : (
                        <div className="space-y-2">
                            {tripDocuments.map((doc) => (
                            <div key={doc.id} className="glass-card p-3 flex items-center justify-between">
                                <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{doc.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{doc.mimeType}</p>
                                </div>
                                <Button variant="outline" size="sm" type="button" onClick={() => viewDocument(doc)}>
                                <Eye className="w-4 h-4 mr-2" />
                                {t("reports.view")}
                                </Button>
                            </div>
                            ))}
                        </div>
                        )}
                        </>
                    )}
                  </div>
                </TabsContent>
              </div>

              <div className="p-2 border-t border-border/50 bg-background">
                <TabsList className="w-full max-w-xs mx-auto">
                  <TabsTrigger value="map" className="flex-1 gap-2">
                    <MapPin className="w-4 h-4" />
                    {t("tripDetail.tabMap")}
                  </TabsTrigger>
                  <TabsTrigger value="document" className="flex-1 gap-2">
                    <FileText className="w-4 h-4" />
                    {t("tripDetail.tabDocument")}
                  </TabsTrigger>
                </TabsList>
              </div>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
