import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatSupabaseError } from "@/lib/supabaseErrors";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

interface ProjectInvoiceUploaderProps {
  onUploadComplete?: () => void;
  projectId: string;
}

export function ProjectInvoiceUploader({ onUploadComplete, projectId }: ProjectInvoiceUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

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

      for (const file of files) {
        try {
          const filePath = `${projectId}/${crypto.randomUUID()}-${file.name}`;
          const { error: uploadError } = await supabase.storage.from("project_documents").upload(filePath, file);
          if (uploadError) throw uploadError;

          const { error: dbError } = await supabase.from("project_documents").insert({
            project_id: projectId,
            user_id: user.id,
            name: file.name,
            storage_path: filePath,
            type: "invoice",
          });
          if (dbError) throw dbError;

          successCount += 1;
        } catch (err: any) {
          console.error(err);
          failCount += 1;
        }
      }

      if (successCount > 0) toast.success(`Se subieron ${successCount} facturas/documentos`);
      if (failCount > 0) toast.error(`Fallaron ${failCount} documentos`);
      onUploadComplete?.();

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
