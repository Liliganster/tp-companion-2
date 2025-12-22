import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MapPin, FileText, Paperclip, CircleDot, Download, Upload } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { tf } from "@/lib/i18n";
import { TripGoogleMap } from "@/components/trips/TripGoogleMap";
import { Trip, useTrips } from "@/contexts/TripsContext";
import { useProjects } from "@/contexts/ProjectsContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface TripDetailModalProps {
  trip: Trip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TripDetailModal({ trip, open, onOpenChange }: TripDetailModalProps) {
  const { t, locale, language } = useI18n();
  const { setTrips } = useTrips();
  const { setProjects } = useProjects();
  const { getAccessToken } = useAuth();
  const { toast } = useToast();

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

  const uploadDocument = async (file: File) => {
    if (file.size > 3_000_000) {
      toast({ title: "Drive", description: "File too large (max 3MB).", variant: "destructive" });
      return;
    }

    const token = await getAccessToken();
    if (!token) return;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("read_failed"));
      reader.readAsDataURL(file);
    });
    if (!dataUrl) return;

    const response = await fetch("/api/google/drive/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, dataUrl }),
    });

    setTrips((prev) =>
      prev.map((t0) => {
        if (t0.id !== trip.id) return t0;
        const nextDocs = [
          ...(t0.documents ?? []),
          {
            id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
            name: data.name ?? file.name,
            mimeType: data.mimeType ?? file.type ?? "application/octet-stream",
            driveFileId: data.fileId,
            createdAt: new Date().toISOString(),
          },
        ];
        return { ...t0, documents: nextDocs, invoice: data.name ?? file.name };
      }),
    );

    // Update Project Invoice Count
    setProjects((prev) =>
      prev.map((p) => {
        if (p.name === trip.project) {
          return { ...p, invoices: (p.invoices || 0) + 1 };
        }
        return p;
      })
    );

    toast({ title: "Drive", description: t("tripDetail.attachDocument") });
  };

  const downloadDocument = async (doc: NonNullable<Trip["documents"]>[number]) => {
    const token = await getAccessToken();
    if (!token) return;

    const response = await fetch(
      `/api/google/drive/download?fileId=${encodeURIComponent(doc.driveFileId)}&name=${encodeURIComponent(doc.name)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      toast({ title: "Drive", description: t("tripDetail.mapLoadError"), variant: "destructive" });
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
              <p className="font-semibold">{t("tripDetail.currentUser")}</p>
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
                <Button size="sm" variant="secondary" className="gap-1">
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
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                        <h3 className="font-medium">{t("tripDetail.tabDocument")}</h3>
                      </div>
                      <label className="inline-flex">
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,application/pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadDocument(file);
                            e.currentTarget.value = "";
                          }}
                        />
                        <Button variant="outline" size="sm" type="button">
                          <Upload className="w-4 h-4 mr-2" />
                          {t("tripDetail.attachDocument")}
                        </Button>
                      </label>
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
                            <Button variant="outline" size="sm" type="button" onClick={() => downloadDocument(doc)}>
                              <Download className="w-4 h-4 mr-2" />
                              {t("reports.view")}
                            </Button>
                          </div>
                        ))}
                      </div>
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
