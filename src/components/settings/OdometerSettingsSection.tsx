import { useState, useRef, useCallback, useEffect, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gauge, Trash2, Lock, Image as ImageIcon, Loader2, AlertCircle, Camera, X, QrCode, Pencil } from "lucide-react";
import { useOdometer, OdometerSnapshot } from "@/contexts/OdometerContext";
import { usePlan } from "@/contexts/PlanContext";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/hooks/use-i18n";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

// ─── Thumbnail with signed URL loading ──────────────────────────────────────
function OdometerThumbnail({ storagePath, alt }: { storagePath: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const { getImageUrl } = useOdometer();

  const load = useCallback(async () => {
    if (url) { setLightbox(true); return; }
    const signed = await getImageUrl(storagePath);
    if (signed) { setUrl(signed); setLightbox(true); }
  }, [storagePath, url, getImageUrl]);

  return (
    <>
      <button
        type="button"
        onClick={load}
        className="flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:opacity-75"
        title={alt}
      >
        <ImageIcon className="w-3 h-3 shrink-0" />
        <span className="sr-only">{alt}</span>
        {!url && <span>📷</span>}
        {url && <img src={url} alt={alt} className="w-8 h-8 object-cover rounded border border-border" />}
      </button>

      {lightbox && url && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-zoom-out"
          onClick={() => setLightbox(false)}
        >
          <img src={url} alt={alt} className="max-h-[90vh] max-w-[90vw] rounded shadow-2xl" />
        </div>
      )}
    </>
  );
}

// ─── Add snapshot form (inline dialog) ──────────────────────────────────────
type AddFormProps = {
  onClose: () => void;
};

function AddSnapshotForm({ onClose }: AddFormProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { getAccessToken, user } = useAuth();
  const { addSnapshot, updateSnapshotExtraction, deleteSnapshot } = useOdometer();

  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  // Fallback: shown only if AI fails to read the km
  const [showFallback, setShowFallback] = useState(false);
  const [fallbackKm, setFallbackKm] = useState("");
  const [pendingSnapshotId, setPendingSnapshotId] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // Allow empty type — camera captures on many mobile browsers leave file.type blank
    if (f.type && !f.type.startsWith("image/")) {
      toast({ title: t("expenseScan.invalidFileType"), variant: "destructive" });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast({ title: t("expenseScan.fileTooLarge"), variant: "destructive" });
      return;
    }
    setFile(f);
    setShowFallback(false);
    setFallbackKm("");
    const reader = new FileReader();
    reader.onload = () => setFilePreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const handleSave = async () => {
    if (!file || !user?.id || !supabase) return;
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);

      // 1. Create draft row — date = today, source = dashboard, km = 0 (AI fills it)
      const snapshotId = await addSnapshot({
        snapshot_date: today,
        reading_km: 0,
        source: "dashboard",
        image_storage_path: null,
        extraction_status: "manual",
      });

      if (!snapshotId) {
        toast({ title: t("odometer.toastSaveError"), description: "Fallo al crear registro (BD)", variant: "destructive" });
        setSaving(false);
        return;
      }

      // 2. Upload photo to Supabase Storage
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/${snapshotId}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("odometer-images")
        .upload(path, file, { upsert: true });

      if (uploadError) {
        await deleteSnapshot(snapshotId);
        toast({ title: t("odometer.toastSaveError"), description: "Fallo al subir Storage (Falta Bucket?)", variant: "destructive" });
        setSaving(false);
        return;
      }

      await supabase
        .from("odometer_snapshots")
        .update({ image_storage_path: path })
        .eq("id", snapshotId);

      // 3. AI extraction
      setExtracting(true);
      try {
        const token = await getAccessToken();
        if (token) {
          const response = await fetch("/api/odometer/extract", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ storagePath: path, snapshotId }),
          });
          const data = await response.json().catch(() => null);
          if (response.ok && data?.reading_km != null) {
            await updateSnapshotExtraction(snapshotId, data.reading_km, "ai");
            toast({ title: t("odometer.toastAdded") });
            onClose();
          } else {
            // AI couldn't read the km — show manual fallback
            setPendingSnapshotId(snapshotId);
            setShowFallback(true);
          }
        }
      } catch {
        setPendingSnapshotId(snapshotId);
        setShowFallback(true);
      } finally {
        setExtracting(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleFallbackSave = async () => {
    const km = parseFloat(fallbackKm.replace(",", "."));
    if (!pendingSnapshotId || isNaN(km) || km <= 0) return;
    await updateSnapshotExtraction(pendingSnapshotId, km, "manual");
    toast({ title: t("odometer.toastAdded") });
    onClose();
  };

  return (
    <div className="glass-card p-4 space-y-4 border border-primary/20">
      <h3 className="font-medium text-sm">{t("odometer.dialogTitle")}</h3>

      {/* Photo upload */}
      <div className="space-y-2">
        <div
          className={cn(
            "flex flex-col items-center justify-center gap-2 border border-dashed rounded-lg p-4 cursor-pointer hover:border-primary/50 transition-colors text-xs text-muted-foreground min-h-[80px]",
            filePreview && "border-primary/40 cursor-default"
          )}
          onClick={() => !filePreview && galleryInputRef.current?.click()}
        >
          {filePreview ? (
            <img src={filePreview} alt="preview" className="max-h-48 rounded object-contain" />
          ) : (
            <>
              <ImageIcon className="w-7 h-7 opacity-40" />
              <span className="text-center">{t("expenseScan.dragDropText")}</span>
            </>
          )}
        </div>

        {!filePreview && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-xs"
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera className="w-3.5 h-3.5" />
            {t("odometer.captureTakePhoto")}
          </Button>
        )}

        {filePreview && (
          <button
            type="button"
            className="text-[10px] text-muted-foreground underline underline-offset-2"
            onClick={() => { setFile(null); setFilePreview(null); setShowFallback(false); setFallbackKm(""); }}
          >
            {t("odometer.captureOr")}
          </button>
        )}

        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
        <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>

      {/* AI extracting indicator */}
      {extracting && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t("odometer.extractingAi")}
        </p>
      )}

      {/* Fallback: AI couldn't read km automatically */}
      {showFallback && !extracting && (
        <div className="space-y-2">
          <p className="text-xs text-amber-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {t("odometer.toastExtractError")}
          </p>
          <div className="flex gap-2">
            <Input
              inputMode="numeric"
              placeholder="ej. 98000"
              value={fallbackKm}
              onChange={(e) => setFallbackKm(e.target.value)}
              className="bg-secondary/50 text-sm h-8"
            />
            <Button size="sm" onClick={handleFallbackSave} disabled={!fallbackKm}>
              {t("odometer.dialogSave")}
            </Button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!showFallback && (
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving || extracting}>
            {t("settings.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || extracting || !file}
          >
            {(saving || extracting) && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            {extracting ? t("odometer.extractingAi") : t("odometer.dialogSave")}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Ratio card ───────────────────────────────────────────────────────────────
function OdometerRatioCard({ year, setYear }: { year: number; setYear: (y: number) => void }) {
  const { t, tf } = useI18n();
  const { computeRatio, snapshots } = useOdometer();

    const periodStart = `${year}-01-01`;
    const periodEnd = `${year}-12-31`;
    const ratio = computeRatio(periodStart, periodEnd);
  const snapshotCount = snapshots.length;
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("odometer.calcTitle")}</h3>
        <Select value={String(year)} onValueChange={(v) => setYear(+v)}>
          <SelectTrigger className="w-24 h-7 text-xs bg-secondary/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!ratio ? (
        <p className="text-xs text-muted-foreground">
          {snapshotCount === 0 ? t("odometer.noSnapshots") : t("odometer.oneSnapshot")}
        </p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("odometer.totalKm")}</span>
            <span className="font-medium tabular-nums">{ratio.totalKm.toLocaleString()} km</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("odometer.workKm")}</span>
            <span className="font-medium tabular-nums">{Math.round(ratio.workKm).toLocaleString()} km</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("odometer.privateKm")}</span>
            <span className="font-medium tabular-nums">{Math.round(ratio.privateKm).toLocaleString()} km</span>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-primary font-medium">
                {tf("odometer.pctLabel", { pct: ratio.pct.toFixed(1) })}
              </span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${ratio.pct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{ratio.startSnapshot.snapshot_date}</span>
              <span>{ratio.endSnapshot.snapshot_date}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────
export function OdometerSettingsSection() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { planTier } = usePlan();
  const navigate = useNavigate();
  const { snapshots, loading, deleteSnapshot, refresh, updateSnapshotExtraction } = useOdometer();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [editState, setEditState] = useState<{ id: string; km: string; note: string } | null>(null);

  const handleEditSave = async () => {
    if (!editState) return;
    const km = parseFloat(editState.km.replace(",", "."));
    if (isNaN(km) || km <= 0) return;
    await updateSnapshotExtraction(editState.id, km, "user_edited", editState.note.trim() || null);
    toast({ title: t("odometer.toastCorrected") });
    setEditState(null);
  };

  // QR mobile capture state
  type QrState = "idle" | "generating" | "waiting" | "success" | "error";
  const [qrState, setQrState] = useState<QrState>("idle");
  const [qrError, setQrError] = useState("");
  const [qrToken, setQrToken] = useState("");
  const [qrSnapshotId, setQrSnapshotId] = useState("");

  // Poll every 3s for the draft snapshot to finish AI extraction
  useEffect(() => {
    if (!qrSnapshotId || qrState !== "waiting" || !supabase) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("odometer_snapshots")
        .select("image_storage_path, reading_km, extraction_status")
        .eq("id", qrSnapshotId)
        .maybeSingle();
      if (cancelled) return;
      
      // Wait until AI has finished its attempt (so it's no longer "manual"), 
      // or at least wait for image_storage_path AND a non-zero reading or a failed extraction
      if (data && data.extraction_status !== "manual") {
        clearInterval(interval);
        setQrState("success");
        // Refresh context so the new snapshot appears in the table
        await refresh();
        setTimeout(() => {
          setQrState("idle");
          setQrToken("");
          setQrSnapshotId("");
        }, 3000);
      }
    }, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [qrSnapshotId, qrState, refresh]);

  const handleOpenQr = async () => {
    if (!user?.id || !supabase) return;
    setQrState("generating");
    setQrError("");
    try {
      // Generate token entirely client-side — no Vercel function needed for this step.
      // Works in both dev and production. The draft row is inserted directly via
      // Supabase RLS (own_odometer_snapshots allows the authenticated user).
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const today = new Date().toISOString().slice(0, 10);

      const { data: snap, error } = await supabase
        .from("odometer_snapshots")
        .insert({
          user_id: user.id,
          snapshot_date: today,
          reading_km: 0,           // placeholder — filled in after AI extraction
          source: "manual",
          extraction_status: "manual",
          capture_token: token,
          capture_expires_at: expiresAt,
        } as any)
        .select("id")
        .single();

      if (error || !snap) {
        throw new Error(error?.message ?? "Could not create QR session");
      }

      setQrToken(token);
      setQrSnapshotId(snap.id);
      setQrState("waiting");
    } catch (err: any) {
      setQrError(err?.message ?? "Unknown error");
      setQrState("error");
    }
  };

  const handleCloseQr = async () => {
    // Delete the orphaned draft snapshot if the user closes without completing
    if (qrSnapshotId && (qrState === "waiting" || qrState === "error")) {
      await supabase?.from("odometer_snapshots").delete().eq("id", qrSnapshotId);
    }
    setQrState("idle");
    setQrToken("");
    setQrSnapshotId("");
  };

  // Pro gate
  if (planTier !== "pro") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium">{t("odometer.title")}</h2>
        <div className="glass-card p-6 flex flex-col items-center gap-3 text-center">
          <Lock className="w-8 h-8 text-muted-foreground" />
          <p className="font-medium">{t("odometer.proOnly")}</p>
          <p className="text-sm text-muted-foreground max-w-xs">{t("odometer.proOnlyBody")}</p>
          <Button
            variant="default"
            size="sm"
            onClick={() => navigate("/plans")}
          >
            {t("odometer.upgradeCta")}
          </Button>
        </div>
      </div>
    );
  }

  const handleDelete = async (id: string) => {
    const ok = window.confirm(t("odometer.deleteConfirm"));
    if (!ok) return;
    await deleteSnapshot(id);
    toast({ title: t("odometer.toastDeleted") });
  };

  const extractionBadge = (snap: OdometerSnapshot) => {
    if (snap.extraction_status === "ai") {
      return (
        <span className="text-[10px] bg-primary/10 text-primary px-1 rounded">
          {t("odometer.extractedByAi")}
        </span>
      );
    }
    if (snap.extraction_status === "user_edited") {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-500/10 text-amber-600 px-1 rounded">
          {t("odometer.userEdited")}
        </span>
      );
    }
    if (snap.extraction_status === "failed") {
      return (
        <span className="flex items-center gap-0.5 text-[10px] text-destructive">
          {t("odometer.extractionFailed")}
        </span>
      );
    }
    return (
      <span className="text-[10px] text-muted-foreground">{t("odometer.editedManual")}</span>
    );
  };

  return (
    <div className="space-y-5">
      {/* QR mobile-camera modal */}
      {qrState !== "idle" && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-xs space-y-4 relative">
            {/* Close */}
            <button
              type="button"
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
              onClick={handleCloseQr}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center space-y-1">
              <QrCode className="w-7 h-7 mx-auto text-primary" />
              <h3 className="font-semibold">{t("odometer.qrTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("odometer.qrBody")}</p>
            </div>

            {qrState === "generating" && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}

            {qrState === "error" && (
              <div className="space-y-3 text-center">
                <p className="text-sm text-destructive">{qrError || "Error"}</p>
                <Button size="sm" variant="outline" onClick={handleOpenQr}>
                  Reintentar
                </Button>
              </div>
            )}

            {(qrState === "waiting" || qrState === "success") && qrToken && (() => {
              const captureUrl = `${window.location.origin}/odometer-capture?token=${qrToken}`;
              const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(captureUrl)}&margin=2&format=svg`;
              return (
                <div className="space-y-3">
                  <div className="bg-white rounded-xl p-2 flex items-center justify-center">
                    {qrState === "waiting" && (
                      <img
                        src={qrImgSrc}
                        alt="QR code"
                        width={220}
                        height={220}
                        className="rounded"
                      />
                    )}
                    {qrState === "success" && (
                      <div className="w-[220px] h-[220px] flex flex-col items-center justify-center gap-2">
                        <span className="text-4xl">✓</span>
                        <span className="text-sm font-medium text-green-600">{t("odometer.qrSuccess")}</span>
                      </div>
                    )}
                  </div>

                  {qrState === "waiting" && (
                    <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {t("odometer.qrWaiting")}
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" />
            {t("odometer.title")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t("odometer.subtitle")}</p>
        </div>
        {!showForm && (
          <div className="flex items-center gap-2">
            {/* QR / phone camera button */}
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs"
              onClick={handleOpenQr}
              disabled={qrState !== "idle"}
              title={t("odometer.qrButton")}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t("odometer.qrButton")}</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              {t("odometer.addReading")}
            </Button>
          </div>
        )}
      </div>

      {showForm && (
        <AddSnapshotForm onClose={() => setShowForm(false)} />
      )}

      {/* Snapshots table */}
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("bulk.loadingResults")}</p>
      ) : snapshots.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("odometer.noSnapshots")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[500px]">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-left">
                <th className="py-2 pr-3 font-medium">{t("odometer.date")}</th>
                <th className="py-2 pr-3 font-medium">{t("odometer.readingKm")}</th>
                <th className="py-2 pr-3 font-medium">{t("odometer.photo")}</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snap) => {
                const isEditing = editState?.id === snap.id;
                return (
                  <Fragment key={snap.id}>
                    <tr className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="py-2 pr-3 tabular-nums">{snap.snapshot_date}</td>
                      <td className="py-2 pr-3">
                        {isEditing ? (
                          <Input
                            inputMode="numeric"
                            value={editState.km}
                            onChange={(e) => setEditState((s) => s ? { ...s, km: e.target.value } : s)}
                            className="bg-secondary/50 text-xs h-7 w-28"
                            autoFocus
                          />
                        ) : (
                          <>
                            <span className="font-medium tabular-nums">
                              {Number(snap.reading_km).toLocaleString()} km
                            </span>{" "}
                            {extractionBadge(snap)}
                          </>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {snap.image_storage_path ? (
                          <OdometerThumbnail
                            storagePath={snap.image_storage_path}
                            alt={t("odometer.thumbnailAlt")}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={handleEditSave}
                              disabled={!editState.note.trim() || !editState.km}
                            >
                              OK
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] px-2"
                              onClick={() => setEditState(null)}
                            >
                              {t("settings.cancel")}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditState({ id: snap.id, km: String(snap.reading_km), note: "" })}
                              className="text-muted-foreground hover:text-primary transition-colors"
                              title={t("odometer.editKmLabel")}
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(snap.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title={t("odometer.deleteConfirm")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isEditing && (
                      <tr className="border-b border-amber-500/20 bg-amber-500/5">
                        <td colSpan={4} className="pb-3 pt-1 px-2">
                          <div className="space-y-1">
                            <p className="text-[10px] text-amber-600 font-medium">
                              {t("odometer.correctionNoteLabel")} *
                            </p>
                            <Textarea
                              rows={2}
                              placeholder={t("odometer.correctionNotePlaceholder")}
                              value={editState.note}
                              onChange={(e) => setEditState((s) => s ? { ...s, note: e.target.value } : s)}
                              className="text-xs bg-secondary/50 min-h-0 resize-none"
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Ratio calculation */}
      <OdometerRatioCard year={year} setYear={setYear} />
    </div>
  );
}
