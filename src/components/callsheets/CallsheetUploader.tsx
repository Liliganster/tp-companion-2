import { useState, useId } from "react";
import { usePlan } from "@/contexts/PlanContext";
import { supabase } from "@/lib/supabaseClient";
import { formatSupabaseError } from "@/lib/supabaseErrors";
import { CALLSHEET_ACCEPT, isSupportedCallsheetFile } from "@/lib/callsheetMime";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { CallsheetUploadHelp } from "./CallsheetUploadHelp";
import { isSupportedUploadFileName } from "@/lib/uploadFileName";
import { useI18n } from "@/hooks/use-i18n";

import { validateDocumentSize } from '@/lib/importDocuments';
import { uploadCallsheetFile } from '@/lib/callsheetUpload';

interface CallsheetUploaderProps {
  onJobCreated?: (jobId: string) => void;
  tripId?: string;
  projectId?: string;
  autoQueue?: boolean;
}

export function CallsheetUploader({ onJobCreated, tripId, projectId, autoQueue = true }: CallsheetUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputId = useId();
  const { limits } = usePlan();
  const { t, tf } = useI18n();

  const handleFiles = async (files: File[]) => {
    if (uploading) return;
    if (files.length === 0) return;

    logger.debug("CallsheetUploader: uploading files", { filesCount: files.length, projectId, tripId });

    if (files.length > limits.maxCallsheetsPerBatch) {
      toast.error(`Maximo ${limits.maxCallsheetsPerBatch} documentos por vez`);
      return;
    }

    for (const file of files) {
      try { validateDocumentSize(file); } catch (error) { toast.error((error as Error).message); return; }
      if (!isSupportedUploadFileName(file.name)) {
        toast.error(t("uploads.invalidNameTitle"), {
          description: tf("uploads.invalidNameBody", { name: file.name }),
          duration: 15000,
        });
        return;
      }
      if (!isSupportedCallsheetFile(file)) {
        toast.error(t("bulk.errorOnlyPdf"));
        return;
      }
    }

    setUploading(true);
    let successCount = 0;
    let failCount = 0;
    const queuedJobIds: string[] = [];

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("No estas autenticado");

      for (const file of files) {
        const id = crypto.randomUUID();
        const outcome = await uploadCallsheetFile(supabase, user.id, file, id, () => false, { projectId, autoQueue });
        if (outcome.persisted) onJobCreated?.(id);
        if (outcome.status === 'failed') {
          logger.warn('CallsheetUploader upload error', { id, reason: outcome.reason });
          failCount += 1;
        } else {
          successCount += 1;
          if (autoQueue) queuedJobIds.push(id);
        }
      }

      if (successCount > 0) {
        toast.success(
          autoQueue
            ? `Se subieron ${successCount} documentos`
            : `Se subieron ${successCount} documentos. Pulsa "Procesar ahora" para empezar.`,
        );
      }
      if (failCount > 0) toast.error(`Fallaron ${failCount} documentos`);

      if (autoQueue && queuedJobIds.length > 0) {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const accessToken = session?.access_token;

          void fetch("/api/callsheets/trigger-worker", {
            method: "POST",
            headers: {
              Authorization: accessToken ? `Bearer ${accessToken}` : "",
              "Content-Type": "application/json",
            },
          }).then(async (res) => {
            if (res.ok) return;
            const errorText = await res.text().catch(() => "");
            logger.warn("[CallsheetUploader] trigger-worker failed", { status: res.status, errorText });
          });
        } catch {
          // ignore: cron/manual trigger can still process later
        }
      }
    } catch (err: any) {
      logger.warn("CallsheetUploader error", err);
      toast.error(formatSupabaseError(err, "Error al subir callsheet"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div onDragOver={e => { e.preventDefault(); if (!uploading) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragging(false); void handleFiles(Array.from(e.dataTransfer.files)); }} className={`flex flex-col items-start gap-2 rounded-lg border border-dashed p-3 ${dragging ? 'border-primary bg-primary/10' : 'border-transparent'}`}>
      <input
        type="file"
        accept={CALLSHEET_ACCEPT}
        id={inputId}
        className="hidden"
        multiple
        onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void handleFiles(files); }}
        disabled={uploading}
      />
      <label htmlFor={inputId}>
        <Button variant="outline" size="sm" asChild disabled={uploading} className="cursor-pointer">
          <span>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Subir Callsheet
          </span>
        </Button>
      </label>
      <p className="text-xs text-muted-foreground">{t('bulk.aiDropTitle')}</p>
      <CallsheetUploadHelp maxFiles={limits.maxCallsheetsPerBatch} />
    </div>
  );
}
