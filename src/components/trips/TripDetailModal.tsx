import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MapPin, FileText, Paperclip, CircleDot, Download, Upload, Eye, ArrowLeft, ExternalLink } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { tf } from "@/lib/i18n";
import { TripGoogleMap } from "@/components/trips/TripGoogleMap";
import { Trip, useTrips } from "@/contexts/TripsContext";
import { useProjects } from "@/contexts/ProjectsContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { useUserProfile } from "@/contexts/UserProfileContext";

interface TripDetailModalProps {
  trip: Trip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TripDetailModal({ trip, open, onOpenChange }: TripDetailModalProps) {
  const { t, locale, language } = useI18n();
  const { profile } = useUserProfile();
  const { updateTrip } = useTrips();
  const { getAccessToken } = useAuth();
  const { toast } = useToast();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDocName, setPreviewDocName] = useState<string>("");
  const [attachBusy, setAttachBusy] = useState(false);
  const attachInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setPreviewUrl(null);
      setPreviewDocName("");
    } else if (trip?.documents && trip.documents.length > 0) {
        // Auto-load the first document
        viewDocument(trip.documents[0]);
    }
  }, [open, trip]);

  if (!trip) return null;

  const formattedDate = (() => {
    const raw = trip.date?.trim?.() ?? "";
    const time = Date.parse(raw);
    if (!raw) return "-";
    if (!Number.isFinite(time)) return raw;
    return new Date(time).toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  })();

  const documentedTotal = 0;
  const documentedTotalLabel = `${documentedTotal.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;

  const tripDocuments = trip.documents ?? [];

  const onAttachFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!supabase) return;

    setAttachBusy(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user) throw new Error("No estás autenticado");

      const userId = data.user.id;
      const uploadedDocs: NonNullable<Trip["documents"]> = [];

      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/\s+/g, " ").trim();
        const storagePath = `${userId}/trip-documents/${trip.id}/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabase.storage.from("callsheets").upload(storagePath, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (uploadError) throw uploadError;

        uploadedDocs.push({
          id: crypto.randomUUID(),
          name: safeName,
          mimeType: file.type || "application/octet-stream",
          storagePath,
          createdAt: new Date().toISOString(),
        });
      }

      const nextDocs = [...tripDocuments, ...uploadedDocs];
      await updateTrip(trip.id, { documents: nextDocs });

      toast({ title: t("tripDetail.invoicesTitle"), description: `Se adjuntaron ${uploadedDocs.length} archivo(s).` });

      // Preview the last uploaded
      const last = uploadedDocs[uploadedDocs.length - 1];
      if (last) void viewDocument(last);
    } catch (e: any) {
      console.error(e);
      toast({ title: "Error", description: e?.message ?? "No se pudo adjuntar el archivo", variant: "destructive" });
    } finally {
      setAttachBusy(false);
      if (attachInputRef.current) attachInputRef.current.value = "";
    }
  };


  const viewDocument = async (doc: NonNullable<Trip["documents"]>[number]) => {
    // Handle Supabase Storage files
    if (doc.storagePath) {
      try {
        const { data, error } = await supabase.storage
          .from("callsheets")
          .download(doc.storagePath);

        if (error) throw error;

        const url = URL.createObjectURL(data);
        setPreviewUrl(url);
        setPreviewDocName(doc.name);
      } catch (e) {
        console.error("Preview error:", e);
        toast({ title: "Error", description: "No se pudo cargar la vista previa.", variant: "destructive" });
      }
      return;
    }

    // Handle Google Drive files
    const token = await getAccessToken();
    if (!token) return;

    // For Google Drive, we might not get a blob easily if it's a GDoc, 
    // but assuming it's a file we can try to download as blob for preview
    // or keep legacy download behavior if it fails.
    try {
        const response = await fetch(
            `/api/google/drive/download?fileId=${encodeURIComponent(doc.driveFileId!)}&name=${encodeURIComponent(doc.name)}`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!response.ok) throw new Error("Failed to fetch from Drive");
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setPreviewDocName(doc.name);
    } catch {
        toast({ title: "Drive", description: t("tripDetail.mapLoadError"), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle>{t("tripDetail.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col md:flex-row h-[600px]">
          <div className="w-full md:w-80 p-4 space-y-4 overflow-y-auto border-r border-border/50 bg-secondary/20">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.date")}</Label>
              <p className="font-semibold">{formattedDate}</p>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.project")}</Label>
              <p className="font-semibold">{trip.project}</p>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.driver")}</Label>
              <p className="font-semibold">{profile.fullName || t("tripDetail.currentUser")}</p>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.purpose")}</Label>
              <p className="font-semibold">{trip.purpose}</p>
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-primary" />
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.route")}</Label>
              </div>
              <div className="space-y-2 ml-1">
                {trip.route.map((stop, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <CircleDot
                        className={`w-4 h-4 ${index === 0 || index === trip.route.length - 1 ? "text-primary" : "text-muted-foreground"
                          }`}
                      />
                      {index < trip.route.length - 1 && <div className="w-0.5 h-6 bg-border" />}
                    </div>
                    <span className="text-sm">{stop}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.totalDistance")}</Label>
              <p className="text-2xl font-bold text-primary">{trip.distance} km</p>
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground block">
                    {t("tripDetail.invoicesTitle")}
                  </Label>
                </div>
                <input
                  ref={attachInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept="application/pdf,image/*"
                  onChange={(e) => void onAttachFiles(e.target.files)}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1"
                  type="button"
                  disabled={attachBusy}
                  onClick={() => attachInputRef.current?.click()}
                >
                  <Paperclip className="w-3 h-3" />
                  {t("tripDetail.attach")}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{tf(language, "tripDetail.totalDocumented", { amount: documentedTotalLabel })}</p>
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            <Tabs defaultValue="map" className="flex-1 flex flex-col">
              <div className="flex-1 relative">
                <TabsContent value="map" className="absolute inset-0 m-0">
                  <TripGoogleMap route={trip.route} open={open} />
                </TabsContent>

                <TabsContent value="document" className="absolute inset-0 m-0 bg-secondary/20">
                  <div className="w-full h-full p-6 overflow-auto">
                    {previewUrl ? (
                        <div className="flex flex-col h-full">
                            <div className="flex-1 bg-background rounded border border-border/50 overflow-hidden">
                                {previewDocName.toLowerCase().endsWith(".pdf") || previewDocName.toLowerCase().endsWith(".jpg") || previewDocName.toLowerCase().endsWith(".png") ? (
                                     <iframe src={previewUrl} className="w-full h-full" title="Vista previa" />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-center p-4">
                                        <FileText className="w-12 h-12 text-muted-foreground mb-2" />
                                        <p>Vista previa no disponible en el navegador.</p>
                                        <Button variant="outline" size="sm" asChild className="mt-4">
                                            <a href={previewUrl} download={previewDocName}>
                                                Descargar archivo
                                            </a>
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <>
                        <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-muted-foreground" />
                            <h3 className="font-medium">{t("tripDetail.tabDocument")}</h3>
                        </div>
                    </div>

                        {tripDocuments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[70%] text-center space-y-2">
                            <p className="text-muted-foreground">{t("tripDetail.noDocuments")}</p>
                        </div>
                        ) : (
                        <div className="space-y-2">
                            {tripDocuments.map((doc) => (
                            <div key={doc.id} className="glass-card p-3 flex items-center justify-between">
                                <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{doc.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{doc.mimeType}</p>
                                </div>
                                <Button variant="outline" size="sm" type="button" onClick={() => viewDocument(doc)}>
                                <Eye className="w-4 h-4 mr-2" />
                                {t("reports.view")}
                                </Button>
                            </div>
                            ))}
                        </div>
                        )}
                        </>
                    )}
                  </div>
                </TabsContent>
              </div>

              <div className="p-2 border-t border-border/50 bg-background">
                <TabsList className="w-full max-w-xs mx-auto">
                  <TabsTrigger value="map" className="flex-1 gap-2">
                    <MapPin className="w-4 h-4" />
                    {t("tripDetail.tabMap")}
                  </TabsTrigger>
                  <TabsTrigger value="document" className="flex-1 gap-2">
                    <FileText className="w-4 h-4" />
                    {t("tripDetail.tabDocument")}
                  </TabsTrigger>
                </TabsList>
              </div>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
