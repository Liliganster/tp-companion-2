import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, Sparkles, FileSpreadsheet, CloudUpload } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface BulkUploadModalProps {
  trigger: React.ReactNode;
}

export function BulkUploadModal({ trigger }: BulkUploadModalProps) {
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState("");

  const exampleText = `Ejemplo:
date,projectName,reason,origin,stop1,destination,km
20-09-2025,Mi Proyecto,Rodaje,"Plaza Mayor 1, 28012 Madrid","Puerta del Sol 1, 28013 Madrid","Plaza de Cibeles 1, 28014 Madrid",2.5`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Asistente de carga masiva</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="csv" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-6">
            <TabsTrigger value="csv" className="gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              Importar CSV
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-2">
              <Sparkles className="w-4 h-4" />
              AI Extraction
            </TabsTrigger>
          </TabsList>

          <TabsContent value="csv" className="space-y-6">
            {/* Instructions */}
            <div className="rounded-lg border border-border/50 bg-secondary/30 p-4 space-y-3">
              <h4 className="font-semibold text-sm uppercase tracking-wide">
                Instrucciones de importación CSV
              </h4>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                <li>
                  Cabeceras requeridas: <code className="text-foreground">'date'</code>, <code className="text-foreground">'projectName'</code>, <code className="text-foreground">'origin'</code>, <code className="text-foreground">'destination'</code>. Opcionales: <code className="text-foreground">'reason'</code>, <code className="text-foreground">'distance'</code>.
                </li>
                <li>
                  Todas las demás columnas se tratan como paradas intermedias. Si las celdas <code className="text-foreground">'origin'</code> o <code className="text-foreground">'destination'</code> están vacías, se usará tu dirección base por defecto.
                </li>
                <li>
                  El archivo puede estar separado por comas (,) o punto y coma (;). El importador lo detectará automáticamente.
                </li>
              </ul>
            </div>

            {/* File buttons */}
            <div className="grid grid-cols-2 gap-4">
              <Button variant="outline" className="h-12 gap-2">
                <Upload className="w-4 h-4" />
                Seleccionar archivo CSV
              </Button>
              <Button variant="outline" className="h-12 gap-2">
                <CloudUpload className="w-4 h-4" />
                Importar de Google Drive
              </Button>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">o</span>
              </div>
            </div>

            {/* Paste CSV */}
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Pegar texto CSV
              </Label>
              <Textarea
                placeholder={exampleText}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="min-h-[140px] font-mono text-sm bg-secondary/30"
              />
              <Button 
                variant="secondary" 
                className="w-full"
                disabled={!csvText.trim()}
              >
                Procesar texto pegado
              </Button>
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="ai" className="space-y-6">
            {/* AI Import content */}
            <div className="border-2 border-dashed border-border/50 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer">
              <Sparkles className="w-12 h-12 text-primary mx-auto mb-4" />
              <p className="font-medium text-lg">Arrastra documentos aquí</p>
              <p className="text-sm text-muted-foreground mt-2">
                PDFs, imágenes o documentos escaneados
              </p>
            </div>
            
            <p className="text-sm text-muted-foreground text-center">
              La IA extraerá automáticamente fechas, rutas y distancias de tus documentos de viaje, facturas o recibos.
            </p>

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button variant="add" className="gap-2">
                <Sparkles className="w-4 h-4" />
                Procesar con IA
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
