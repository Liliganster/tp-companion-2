import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatSupabaseError } from "@/lib/supabaseErrors";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

interface CallsheetUploaderProps {
  onJobCreated?: (jobId: string) => void;
  tripId?: string; // Optional context
  projectId?: string; // Optional context
}

export function CallsheetUploader({ onJobCreated, tripId, projectId }: CallsheetUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate PDF
    if (file.type !== "application/pdf") {
      toast.error("Solo se permiten archivos PDF");
      return;
    }

    setUploading(true);
    let createdJobId: string | null = null;
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("No estás autenticado");

      // 1. Create Job ID first (optimistic)
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
      const { error: uploadError } = await supabase.storage
        .from("callsheets")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 3. Update Job (Queue it)
      const { error: updateError } = await supabase
        .from("callsheet_jobs")
        .update({ 
          storage_path: filePath,
          status: "queued" 
        })
        .eq("id", job.id);

      if (updateError) throw updateError;

      toast.success("Callsheet subida. Esperando procesamiento...");
      if (onJobCreated) onJobCreated(job.id);

    } catch (err: any) {
      console.error(err);
      // Best-effort rollback so we don't leave stuck jobs when upload/update fails.
      if (createdJobId) {
        try {
          await supabase.from("callsheet_jobs").delete().eq("id", createdJobId);
        } catch {
          // ignore rollback failures
        }
      }

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
        onChange={handleFileChange}
        disabled={uploading}
      />
      <label htmlFor="callsheet-upload">
        <Button variant="outline" size="sm" asChild disabled={uploading} className="cursor-pointer">
          <span>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Subir Callsheet (AI)
          </span>
        </Button>
      </label>
    </div>
  );
}
