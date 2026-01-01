import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatSupabaseError } from "@/lib/supabaseErrors";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useProjects } from "@/contexts/ProjectsContext";

interface ProjectInvoiceUploaderProps {
  onUploadComplete?: (jobIds: string[]) => void;
  projectId: string;
}

export function ProjectInvoiceUploader({ onUploadComplete, projectId }: ProjectInvoiceUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const { refreshProjects } = useProjects();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    console.log("ProjectInvoiceUploader: uploading files", { filesCount: files.length, projectId });

    if (files.length > 20) {
      toast.error("Máximo 20 documentos por vez");
      e.target.value = "";
      return;
    }

    for (const file of files) {
      if (!file.type.match(/pdf|image/)) {
        toast.error("Solo se permiten archivos PDF o Imágenes");
        e.target.value = "";
        return;
      }
    }

    setUploading(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("No estás autenticado");

      let successCount = 0;
      let failCount = 0;
      const createdJobIds: string[] = [];

      for (const file of files) {
        try {
          const filePath = `${projectId}/${crypto.randomUUID()}-${file.name}`;
          const { error: uploadError } = await supabase.storage.from("project_documents").upload(filePath, file);
          if (uploadError) throw uploadError;

          // Create invoice extraction job
          const { data: jobData, error: jobError } = await supabase
            .from("invoice_jobs")
            .insert({
              project_id: projectId,
              user_id: user.id,
              storage_path: filePath,
              status: "created"
            })
            .select("id")
            .single();

          if (jobError) throw jobError;
          createdJobIds.push(jobData.id);

          // Auto-queue the job for processing
          try {
            await fetch('/api/invoices/queue', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ jobId: jobData.id })
            });
          } catch (queueErr) {
            console.warn("Failed to auto-queue invoice job:", queueErr);
            // Non-fatal, user can manually trigger later
          }

          // Create project_documents entry linked to the job
          const { error: dbError } = await supabase.from("project_documents").insert({
            project_id: projectId,
            user_id: user.id,
            name: file.name,
            storage_path: filePath,
            type: "invoice",
            invoice_job_id: jobData.id
          });
          
          if (dbError) {
            // If UNIQUE constraint fails (duplicate storage_path), just warn and continue
            if (dbError.code === '23505') {
              console.warn(`Document ${filePath} already exists, skipping`);
              failCount += 1;
            } else {
              throw dbError;
            }
          } else {
            successCount += 1;
          }
        } catch (err: any) {
          console.error(err);
          failCount += 1;
        }
      }

      if (successCount > 0) toast.success(`Se subieron ${successCount} facturas. La extracción comenzará automáticamente.`);
      if (failCount > 0) toast.error(`Fallaron ${failCount} documentos`);
      onUploadComplete?.(createdJobIds);
      refreshProjects();

    } catch (err: any) {
      console.error(err);
      toast.error(formatSupabaseError(err, "Error al subir factura"));
    } finally {
      setUploading(false);
      e.target.value = ""; 
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="file"
        accept="application/pdf,image/*"
        id="invoice-upload"
        className="hidden"
        multiple
        onChange={handleFileChange}
        disabled={uploading}
      />
      <label htmlFor="invoice-upload">
        <Button size="sm" className="bg-primary hover:bg-primary/90 cursor-pointer" asChild disabled={uploading}>
          <span>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Adjuntar Factura
          </span>
        </Button>
      </label>
    </div>
  );
}
