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
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type (PDF/Image)
    if (!file.type.match(/pdf|image/)) {
      toast.error("Solo se permiten archivos PDF o Imágenes");
      return;
    }

    setUploading(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("No estás autenticado");

      // 1. Upload File
      const filePath = `${projectId}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("project_documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Insert Record
      const { error: dbError } = await supabase
        .from("project_documents")
        .insert({
            project_id: projectId,
            user_id: user.id,
            name: file.name,
            storage_path: filePath,
            type: "invoice"
        });

      if (dbError) throw dbError;

      toast.success("Factura subida correctamente");
      if (onUploadComplete) onUploadComplete();

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
