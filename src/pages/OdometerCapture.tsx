/**
 * /odometer-capture — Public mobile page for QR-code-based odometer photo capture.
 *
 * Flow:
 *  1. Desktop generates a QR code containing this URL + a short-lived token.
 *  2. User scans QR with phone → this page opens in the phone browser.
 *  3. User takes a photo (camera is opened directly via capture="environment").
 *  4. Photo is uploaded to Supabase Storage via a signed URL from the server.
 *  5. Server runs AI extraction and updates the snapshot.
 *  6. Desktop detects the update via polling and closes the QR modal.
 *
 * NO authentication required — the token IS the access credential.
 */

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n";
import { Loader2, Camera, CheckCircle2, XCircle, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

type CaptureState = "loading" | "ready" | "uploading" | "success" | "error" | "expired";

export default function OdometerCapture() {
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const token = searchParams.get("token") ?? "";

  const [state, setState] = useState<CaptureState>("loading");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [signedUploadUrl, setSignedUploadUrl] = useState("");
  const [uploadPath, setUploadPath] = useState("");
  const [extractedKm, setExtractedKm] = useState<number | null>(null);

  // Two separate inputs: direct camera, and gallery picker (iOS needs both separately)
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Validate token and get upload URL on mount
  useEffect(() => {
    if (!token) {
      setState("expired");
      return;
    }
    fetch(`/api/odometer/capture-info?token=${encodeURIComponent(token)}`)
      .then((res) => res.json().then((d) => ({ ok: res.ok, status: res.status, data: d })))
      .then(({ ok, status, data }) => {
        if (data.alreadyUsed) {
          setState("success");
          return;
        }
        if (!ok || status === 404 || status === 410) {
          setState("expired");
          return;
        }
        setSignedUploadUrl(data.signedUploadUrl);
        setUploadPath(data.uploadPath);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [token]);

  const handleFile = (f: File) => {
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async () => {
    if (!file || !signedUploadUrl || !uploadPath) return;
    setState("uploading");
    try {
      // 1. PUT file to Supabase Storage via the signed upload URL
      const uploadRes = await fetch(signedUploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Storage upload failed");

      // 2. Notify server → it updates the snapshot and runs AI extraction
      const finishRes = await fetch("/api/odometer/finish-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, uploadPath, mimeType: file.type || "image/jpeg" }),
      });
      if (!finishRes.ok) {
        const err = await finishRes.json().catch(() => ({}));
        if (finishRes.status === 404 || finishRes.status === 410) {
          setState("expired");
          return;
        }
        throw new Error((err as any).error || "Finish failed");
      }
      const result = await finishRes.json().catch(() => ({}));
      if ((result as any).reading_km) setExtractedKm((result as any).reading_km);
      setState("success");
    } catch {
      setState("error");
    }
  };

  // Common input change handler
  const cardClass =
    "min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 gap-6";

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (state === "loading") {
    return (
      <div className={cardClass}>
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-slate-300 text-sm">{t("odometer.captureLoading")}</p>
      </div>
    );
  }

  // ── Expired ──────────────────────────────────────────────────────────────────
  if (state === "expired") {
    return (
      <div className={cardClass}>
        <XCircle className="w-12 h-12 text-destructive" />
        <p className="text-center text-sm text-slate-300 max-w-xs">
          {t("odometer.captureExpired")}
        </p>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  if (state === "success") {
    return (
      <div className={cardClass}>
        <CheckCircle2 className="w-16 h-16 text-green-400" />
        <p className="text-center font-medium">{t("odometer.captureSuccess")}</p>
        {extractedKm != null && (
          <p className="text-2xl font-bold tabular-nums text-primary">
            {extractedKm.toLocaleString()} km
          </p>
        )}
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (state === "error") {
    return (
      <div className={cardClass}>
        <XCircle className="w-12 h-12 text-destructive" />
        <p className="text-center text-sm text-slate-300 max-w-xs">
          {t("odometer.captureError")}
        </p>
        <Button variant="outline" onClick={() => { setFile(null); setPreview(null); setState("ready"); }}>
          Reintentar
        </Button>
      </div>
    );
  }

  // ── Uploading ────────────────────────────────────────────────────────────────
  if (state === "uploading") {
    return (
      <div className={cardClass}>
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-slate-300 text-sm">{t("odometer.captureLoading")}</p>
      </div>
    );
  }

  // ── Ready ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col p-6 gap-5 max-w-md mx-auto pt-10">
      {/* Header */}
      <div className="text-center space-y-2">
        <Camera className="w-10 h-10 mx-auto text-primary" />
        <h1 className="text-xl font-bold">{t("odometer.captureTitle")}</h1>
        <p className="text-sm text-slate-300">{t("odometer.captureInstructions")}</p>
      </div>

      {/* Preview */}
      {preview && (
        <div className="rounded-xl overflow-hidden border border-slate-700">
          <img src={preview} alt="preview" className="w-full object-contain max-h-60" />
        </div>
      )}

      {/* Camera button (direct camera, back lens, no gallery) */}
      <Button
        size="lg"
        className="w-full gap-2 text-base"
        onClick={() => cameraInputRef.current?.click()}
      >
        <Camera className="w-5 h-5" />
        {t("odometer.captureTakePhoto")}
      </Button>

      {/* Gallery picker */}
      <button
        type="button"
        className="text-sm text-slate-400 underline underline-offset-2 flex items-center justify-center gap-1.5"
        onClick={() => galleryInputRef.current?.click()}
      >
        <ImagePlus className="w-4 h-4" />
        {t("odometer.captureOr")}
      </button>

      {/* Hidden inputs */}
      {/* capture="environment" → directly opens back camera on mobile */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
      {/* No capture attr → shows gallery/files AND camera option */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Send button (only visible once a file is selected) */}
      {file && (
        <Button
          size="lg"
          variant="default"
          className="w-full gap-2"
          onClick={handleSubmit}
        >
          {t("odometer.captureSubmit")}
        </Button>
      )}
    </div>
  );
}
