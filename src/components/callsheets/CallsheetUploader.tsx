import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatSupabaseError } from "@/lib/supabaseErrors";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface CallsheetUploaderProps {
  onJobCreated?: (jobId: string) => void;
  tripId?: string; // Optional context
  projectId?: string; // Optional context
  autoQueue?: boolean;
}

export function CallsheetUploader({ onJobCreated, tripId, projectId, autoQueue = true }: CallsheetUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    logger.debug("CallsheetUploader: uploading files", { filesCount: files.length, projectId, tripId });

    if (files.length > 20) {
      toast.error("Máximo 20 documentos por vez");
      e.target.value = "";
      return;
    }

    for (const file of files) {
      if (file.type !== "application/pdf") {
        toast.error("Solo se permiten archivos PDF");
        e.target.value = "";
        return;
      }
    }

    setUploading(true);
    let successCount = 0;
    let failCount = 0;
    let reusedCount = 0;
    const queuedJobIds: string[] = [];
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("No estás autenticado");

      for (const file of files) {
        let createdJobId: string | null = null;
        try {
          // Avoid duplicates if the user re-uploads the same file name (common when a previous processing is still running).
          const existingPattern = `%/${file.name}`;
          let existingQuery = supabase
            .from("callsheet_jobs")
            .select("id, storage_path, status, created_at")
            .eq("user_id", user.id)
            .ilike("storage_path", existingPattern)
            .order("created_at", { ascending: false })
            .limit(1);

          if (projectId) existingQuery = existingQuery.eq("project_id", projectId);

          const { data: existing, error: existingError } = await existingQuery.maybeSingle();
          const existingId = String((existing as any)?.id ?? "").trim();
          const existingStoragePath = String((existing as any)?.storage_path ?? "").trim();
          const existingStatus = String((existing as any)?.status ?? "").trim();

          if (!existingError && existingId && existingStoragePath && existingStoragePath !== "pending") {
            // If it's stuck in "created"/"failed"/"cancelled", re-queue it so it can process.
            if (
              autoQueue &&
              (existingStatus === "created" || existingStatus === "failed" || existingStatus === "cancelled")
            ) {
              try {
                await supabase
                  .from("callsheet_jobs")
                  .update({ status: "queued", needs_review_reason: null })
                  .eq("id", existingId);
                queuedJobIds.push(existingId);
              } catch {
                // ignore
              }
            }

            reusedCount += 1;
            successCount += 1;
            onJobCreated?.(existingId);
            continue;
          }

          const { data: job, error: jobError } = await supabase
            .from("callsheet_jobs")
            .insert({
              user_id: user.id,
              storage_path: "pending",
              status: "created",
              project_id: projectId || null,
            })
            .select()
            .single();

          if (jobError) throw jobError;
          createdJobId = job.id;

          const filePath = `${user.id}/${job.id}/${file.name}`;
          const { error: uploadError } = await supabase.storage.from("callsheets").upload(filePath, file);
          if (uploadError) throw uploadError;

          const { error: updateError } = await supabase
            .from("callsheet_jobs")
            .update({ storage_path: filePath, status: autoQueue ? "queued" : "created", needs_review_reason: null })
            .eq("id", job.id);
          
          if (updateError) {
            // If UNIQUE constraint fails (duplicate storage_path), log but continue
            if (updateError.code === '23505') {
              logger.debug(`Storage path ${filePath} already exists, skipping update`);
              failCount += 1;
            } else {
              throw updateError;
            }
          } else {
            successCount += 1;
            if (autoQueue) queuedJobIds.push(job.id);
            onJobCreated?.(job.id);
          }
        } catch (err: any) {
          logger.warn("CallsheetUploader upload error", err);
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

      if (successCount > 0) {
        toast.success(
          autoQueue
            ? `Se subieron ${successCount} documentos`
            : `Se subieron ${successCount} documentos. Pulsa "Procesar ahora" para empezar.`,
        );
      }
      if (reusedCount > 0) toast.info(`Se reutilizaron ${reusedCount} documento(s) ya subido(s)`);
      if (failCount > 0) toast.error(`Fallaron ${failCount} documentos`);

       // Best-effort: kick the worker once so users don't have to wait for cron/manual trigger.
       // Do not await: the worker call can take long and we don't want to block the UI.
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
      e.target.value = ""; // Reset input
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="file"
        accept="application/pdf"
        id="callsheet-upload"
        className="hidden"
        multiple
        onChange={handleFileChange}
        disabled={uploading}
      />
      <label htmlFor="callsheet-upload">
        <Button variant="outline" size="sm" asChild disabled={uploading} className="cursor-pointer">
          <span>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Subir Callsheet
          </span>
        </Button>
      </label>
    </div>
  );
}
