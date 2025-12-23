import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Sparkles, FileSpreadsheet, CloudUpload, Loader2, Link, MapPin, Calendar, Building2, CheckCircle, Save } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useI18n } from "@/hooks/use-i18n";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { useUserProfile } from "@/contexts/UserProfileContext";
import { getCountryCode } from "@/lib/country-mapping";
import { useProjects } from "@/contexts/ProjectsContext";

interface SavedTrip {
  id: string;
  date: string;
  route: string[];
  project: string;
  purpose: string;
  passengers: number;
  invoice?: string;
  distance: number;
  ratePerKmOverride?: number | null;
  specialOrigin?: "base" | "continue" | "return";
  documents?: any[];
}

interface BulkUploadModalProps {
  trigger: React.ReactNode;
  onSave?: (data: SavedTrip) => void;
}

export function BulkUploadModal({ trigger, onSave }: BulkUploadModalProps) {
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  
  // AI Tab State
  const [aiStep, setAiStep] = useState<"upload" | "processing" | "review">("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [uploadedFilePath, setUploadedFilePath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Review form state
  const [reviewDate, setReviewDate] = useState("");
  const [reviewProject, setReviewProject] = useState("");
  const [reviewProducer, setReviewProducer] = useState("");
  const [reviewLocations, setReviewLocations] = useState<string[]>([]);
  
  const [reviewDistance, setReviewDistance] = useState("0");
  const [isOptimizing, setIsOptimizing] = useState(false);
  
  const { t, locale } = useI18n();
  const exampleText = t("bulk.examplePlaceholder");

  // Reset state when modal closes or tab changes
  useEffect(() => {
    if (!open) {
      resetAiState();
    }
  }, [open]);

  const resetAiState = () => {
    setAiStep("upload");
    setSelectedFile(null);
    setJobId(null);
    setExtractedData(null);
    setAiLoading(false);
    setIsOptimizing(false);
    setReviewDate("");
    setReviewProject("");
    setReviewProducer("");
    setReviewLocations([]);
    setReviewDistance("0");
    setReviewLocations([]);
    setReviewDistance("0");
    setUploadedFilePath(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Solo se permiten archivos PDF para la extracción AI");
      return;
    }
    setSelectedFile(file);
  };

  const startAiProcess = async () => {
    if (!selectedFile) return;
    
    setAiLoading(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("No estás autenticado");

      // 1. Create Job
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
      setJobId(job.id);

      // 2. Upload File
      const filePath = `${user.id}/${job.id}/${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("callsheets")
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;
      
      setUploadedFilePath(filePath);

      // 3. Queue Job
      const { error: updateError } = await supabase
        .from("callsheet_jobs")
        .update({ storage_path: filePath, status: "queued" })
        .eq("id", job.id);

      if (updateError) throw updateError;

      setAiStep("processing");
      // Polling starts automatically via useEffect due to aiStep === 'processing'

    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error al subir documento");
      setAiLoading(false);
    }
  };

  // Polling Effect
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (aiStep === "processing" && jobId) {
      const checkStatus = async () => {
        try {
          const { data: job } = await supabase
            .from("callsheet_jobs")
            .select("*")
            .eq("id", jobId)
            .single();

          if (job.status === "done") {
             clearInterval(interval);
             // Fetch results
             const { data: result } = await supabase
                .from("callsheet_results")
                .select("*")
                .eq("job_id", jobId)
                .single();
             
             const { data: locs } = await supabase
                .from("callsheet_locations")
                .select("*")
                .eq("job_id", jobId);

             if (result) {
                setExtractedData({ result, locations: locs || [] });
                
                // Pre-fill basic fields
                setReviewDate(result.date_value || "");
                setReviewProject(result.project_value || "");
                setReviewProducer(result.producer_value || "");
                
                // Start optimization (Address Normalization + Distance)
                optimizeRoute(locs || []);
             }
          } else if (job.status === "failed") {
              toast.error("Error en la extracción AI: " + job.error);
              setAiStep("upload");
              setAiLoading(false);
              clearInterval(interval);
          }
        } catch (e) {
          console.error("Polling error", e);
        }
      };

      interval = setInterval(checkStatus, 2000);
    }

    return () => clearInterval(interval);
  }, [aiStep, jobId]);

  const optimizeRoute = async (rawLocations: any[]) => {
      setIsOptimizing(true);
      // Use raw strings if formatted_address is missing/null
      let currentLocs = rawLocations.map(l => l.formatted_address || l.address_raw);
      const region = getCountryCode(profile.country);

      try {
          // A. Multi-phase Normalization
          const normalizedLocs = [];
          
          for (const locStr of currentLocs) {
              let query = locStr;
              // 1. Context Injection: if missing city/country (simple heuristic), append profile context
              const hasContext = locStr.toLowerCase().includes(profile.city?.toLowerCase()) || locStr.toLowerCase().includes(profile.country?.toLowerCase());
              
              if (!hasContext && profile.city && profile.country) {
                  query = `${locStr}, ${profile.city}, ${profile.country}`;
              }

              // 2. Google Validation
              try {
                  const res = await fetch("/api/google/geocode", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ 
                          address: query, 
                          region: region // Essential for correct bias
                      })
                  });
                  const data = await res.json();
                  if (res.ok && data.formattedAddress) {
                      normalizedLocs.push(data.formattedAddress);
                  } else {
                      // If geocoding failed even with context, keep original (as per instructions)
                      // OR: if we added context, falling back to query might be better than raw?
                      // User said: "Si Google no la encuentra, se mantiene la original como fallback."
                      normalizedLocs.push(locStr);
                  }
              } catch (e) {
                  normalizedLocs.push(locStr); // Fallback
              }
          }

          setReviewLocations(normalizedLocs);

          // B. Auto-Distance Calculation
          const origin = profile.baseAddress;
          const destination = profile.baseAddress;

          if (origin && destination) {
              const res = await fetch("/api/google/directions", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                      origin,
                      destination,
                      waypoints: normalizedLocs,
                      region: region
                  })
              });
              
              const data = await res.json();
              if (res.ok && typeof data.totalDistanceMeters === 'number') {
                  const km = Math.round((data.totalDistanceMeters / 1000) * 10) / 10;
                  setReviewDistance(String(km));
              }
          }

      } catch (e) {
          console.error("Optimization failed", e);
          // Still create the trip with what we have
          setReviewLocations(currentLocs);
      } finally {
          setIsOptimizing(false);
          setAiLoading(false);
          setAiStep("review");
      }
  };

  const { profile } = useUserProfile();
  const { projects, addProject } = useProjects();

  const handleSaveTrip = async () => {
    if (!onSave) return;
    
    // Use base address for Origin and Destination
    const baseAddress = profile.baseAddress || "";
    
    // Construct route: Origin -> [Extracted Stops] -> Destination
    // Only add base address if it exists, otherwise just use extracted locations (though strictly user wants base -> stops -> base)
    // If baseAddress is empty, we might want to prompt or just leave it. Assuming it exists or user is fine with empty for now if not set.
    const fullRoute = baseAddress 
        ? [baseAddress, ...reviewLocations, baseAddress]
        : reviewLocations;

    // Create trip object
    const newTrip: SavedTrip = {
        id: crypto.randomUUID(),
        date: reviewDate,
        project: reviewProject,
        purpose: "Rodaje: " + reviewProducer, // Default purpose
        route: fullRoute, 
        passengers: 0,
        distance: parseFloat(reviewDistance) || 0,
        specialOrigin: "base",
        documents: uploadedFilePath ? [{
            id: crypto.randomUUID(),
            name: selectedFile?.name || "Documento Original",
            mimeType: selectedFile?.type || "application/pdf",
            storagePath: uploadedFilePath,
            createdAt: new Date().toISOString()
        }] : undefined
    };

    // Auto-create project if it doesn't exist
    if (newTrip.project) {
        const projectExists = projects.some(p => p.name.toLowerCase() === newTrip.project.toLowerCase());
        
        if (!projectExists) {
            await addProject({
                id: crypto.randomUUID(),
                name: newTrip.project,
                producer: reviewProducer,
                description: `Created from AI Upload: ${selectedFile?.name}`,
                ratePerKm: 0.30, // Default rate
                starred: false,
                trips: 0, // Initial 0, will be 1 once trip is saved and stats re-computed
                totalKm: 0,
                documents: 0,
                invoices: 0,
                estimatedCost: 0,
                shootingDays: 0,
                kmPerDay: 0,
                co2Emissions: 0
            });
            toast.success(`Proyecto "${newTrip.project}" creado automáticamente`);
        }
        // No need to update existing project stats manually anymore; 
        // Projects.tsx calculates them from the trips list.
    }

    onSave(newTrip);
    toast.success("Viaje guardado correctamente");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>{t("bulk.title")}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="csv" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-6">
            <TabsTrigger value="csv" className="gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              {t("bulk.tabCsv")}
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-2">
              <Sparkles className="w-4 h-4" />
              {t("bulk.tabAi")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="csv" className="space-y-6">
             {/* CSV Config logic remains same ... */}
            <div className="rounded-lg border border-border/50 bg-secondary/30 p-4 space-y-3">
              <h4 className="font-semibold text-sm uppercase tracking-wide">{t("bulk.csvInstructionsTitle")}</h4>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                <li>{t("bulk.csvInstructionsRequired")}</li>
                <li>{t("bulk.csvInstructionsStops")}</li>
                <li>{t("bulk.csvInstructionsSeparator")}</li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Button variant="outline" className="h-12 gap-2">
                <Upload className="w-4 h-4" />
                {t("bulk.selectCsvFile")}
              </Button>
              <Button variant="outline" className="h-12 gap-2">
                <CloudUpload className="w-4 h-4" />
                {t("bulk.importFromDrive")}
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">{t("bulk.or")}</span>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("bulk.pasteCsv")}</Label>
              <Textarea
                placeholder={exampleText}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="min-h-[140px] font-mono text-sm bg-secondary/30"
              />
              <Button variant="secondary" className="w-full" disabled={!csvText.trim()}>
                {t("bulk.processPasted")}
              </Button>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("bulk.cancel")}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="ai" className="space-y-6">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="application/pdf"
                onChange={handleFileSelect}
            />
            
            {aiStep === "upload" && (
                <>
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-border/50 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                    >
                    <Sparkles className="w-12 h-12 text-primary mx-auto mb-4" />
                    <p className="font-medium text-lg">{selectedFile ? selectedFile.name : t("bulk.aiDropTitle")}</p>
                    <p className="text-sm text-muted-foreground mt-2">{selectedFile ? "Click para cambiar archivo" : t("bulk.aiDropSubtitle")}</p>
                    </div>

                    <p className="text-sm text-muted-foreground text-center">
                        Suba sus hojas de rodaje (Call Sheets) en PDF. Nuestra IA extraerá automáticamente fechas, lugares, producción y proyectos.
                    </p>

                    <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        {t("bulk.cancel")}
                    </Button>
                    <Button 
                        variant="add" 
                        className="gap-2" 
                        onClick={startAiProcess} 
                        disabled={!selectedFile || aiLoading}
                    >
                        {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {t("bulk.aiProcess")}
                    </Button>
                    </div>
                </>
            )}

            {aiStep === "processing" && (
                <div className="text-center py-12 space-y-4">
                    <Loader2 className="w-16 h-16 text-primary animate-spin mx-auto" />
                    <div>
                        <h3 className="text-lg font-medium">
                            {isOptimizing ? "Optimizando ruta y direcciones..." : "Analizando documento..."}
                        </h3>
                        <p className="text-muted-foreground">Esto puede tomar unos segundos.</p>
                    </div>
                </div>
            )}

            {aiStep === "review" && (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex items-center gap-2 text-green-500 mb-4">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-medium">Datos extraídos exitosamente</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Proyecto</Label>
                            <Input 
                                value={reviewProject} 
                                onChange={(e) => setReviewProject(e.target.value)} 
                                className="bg-secondary/30"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Fecha</Label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    value={reviewDate} 
                                    onChange={(e) => setReviewDate(e.target.value)} 
                                    className="pl-9 bg-secondary/30"
                                />
                            </div>
                        </div>
                        <div className="space-y-2 col-span-2">
                            <Label>Productora</Label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    value={reviewProducer} 
                                    onChange={(e) => setReviewProducer(e.target.value)} 
                                    className="pl-9 bg-secondary/30"
                                />
                            </div>
                        </div>

                        <div className="space-y-2 col-span-2">
                            <Label>Distancia (km)</Label>
                            <Input 
                                type="number"
                                value={reviewDistance} 
                                onChange={(e) => setReviewDistance(e.target.value)} 
                                className="bg-secondary/30"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Ubicaciones / Ruta ({reviewLocations.length})</Label>
                        
                        <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
                           <MapPin className="w-3 h-3 text-green-500" />
                           <span className="font-semibold">Origen:</span> {profile.baseAddress || "No definido"}
                        </div>

                        <Card className="bg-secondary/20">
                            <CardContent className="p-3 max-h-48 overflow-y-auto space-y-2">
                                {reviewLocations.map((loc, idx) => (
                                    <div key={idx} className="flex items-start gap-2 text-sm p-2 bg-background rounded border border-border/50">
                                        <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                                        <span>{loc}</span>
                                    </div>
                                ))}
                                {reviewLocations.length === 0 && (
                                    <p className="text-sm text-muted-foreground italic">No se encontraron ubicaciones.</p>
                                )}
                            </CardContent>
                        </Card>

                        <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
                           <MapPin className="w-3 h-3 text-red-500" />
                           <span className="font-semibold">Destino:</span> {profile.baseAddress || "No definido"}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={resetAiState}>
                            Volver
                        </Button>
                        <Button onClick={handleSaveTrip} className="gap-2">
                            <Save className="w-4 h-4" />
                            Guardar Viaje
                        </Button>
                    </div>
                </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
