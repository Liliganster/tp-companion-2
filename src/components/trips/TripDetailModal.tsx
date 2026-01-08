import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MapPin, FileText, CircleDot, Eye, Car, Receipt, ParkingCircle, Banknote } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { TripGoogleMap } from "@/components/trips/TripGoogleMap";
import { Trip, useTrips } from "@/contexts/TripsContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { parseLocaleNumber } from "@/lib/number";

interface TripDetailModalProps {
  trip: Trip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TripDetailModal({ trip, open, onOpenChange }: TripDetailModalProps) {
  const { t, tf, locale } = useI18n();
  const { profile } = useUserProfile();
  const { trips } = useTrips();
  const { getAccessToken } = useAuth();
  const { toast } = useToast();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDocName, setPreviewDocName] = useState<string>("");

  const liveTrip = useMemo(() => {
    if (!trip) return null;
    return trips.find((t) => t.id === trip.id) ?? trip;
  }, [trip, trips]);

  useEffect(() => {
    if (!open) {
      setPreviewUrl(null);
      setPreviewDocName("");
    } else if (liveTrip?.documents && liveTrip.documents.length > 0) {
      // Auto-load the first document
      viewDocument(liveTrip.documents[0]);
    }
  }, [liveTrip, open]);

  // Early return AFTER all hooks
  if (!liveTrip) return null;

  const formattedDate = (() => {
    const raw = liveTrip.date?.trim?.() ?? "";
    const time = Date.parse(raw);
    if (!raw) return "-";
    if (!Number.isFinite(time)) return raw;
    return new Date(time).toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  })();

  const tripDocuments = liveTrip.documents ?? [];

  const viewDocument = async (doc: NonNullable<Trip["documents"]>[number]) => {
    // Handle Supabase Storage files
    if (doc.storagePath) {
      try {
        const bucket = doc.bucketId || "callsheets";
        const { data, error } = await supabase.storage
          .from(bucket)
          .download(doc.storagePath);

        if (error) throw error;

        const url = URL.createObjectURL(data);
        setPreviewUrl(url);
        setPreviewDocName(doc.name);
      } catch (e) {
        console.error("Preview error:", e);
        toast({ title: t("tripDetail.errorTitle"), description: t("tripDetail.previewLoadFailed"), variant: "destructive" });
      }
      return;
    }

    // Handle Google Drive files
    const token = await getAccessToken();
    if (!token) return;

    try {
      const response = await fetch(
        `/api/google/drive/download?fileId=${encodeURIComponent(doc.driveFileId!)}&name=${encodeURIComponent(doc.name)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error(t("tripDetail.driveFetchFailed"));

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewDocName(doc.name);
    } catch {
      toast({ title: "Drive", description: t("tripDetail.driveFetchFailed"), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle>{t("tripDetail.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("tripDetail.title")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col md:flex-row h-[600px]">
          <div className="w-full md:w-80 p-4 space-y-4 overflow-y-auto border-r border-border/50 bg-secondary/20">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.date")}</Label>
              <p className="font-semibold">{formattedDate}</p>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.project")}</Label>
              <p className="font-semibold">{liveTrip.project || "-"}</p>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.driver")}</Label>
              <p className="font-semibold">{profile.fullName || t("tripDetail.currentUser")}</p>
            </div>

            {liveTrip.purpose && (
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.purpose")}</Label>
                <p className="font-semibold">{liveTrip.purpose}</p>
              </div>
            )}

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-primary" />
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.route")}</Label>
              </div>
              <div className="space-y-2 ml-1">
                {liveTrip.route.map((stop, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <CircleDot
                        className={`w-4 h-4 ${index === 0 || index === liveTrip.route.length - 1 ? "text-primary" : "text-muted-foreground"
                          }`}
                      />
                      {index < liveTrip.route.length - 1 && <div className="w-0.5 h-6 bg-border" />}
                    </div>
                    <span className="text-sm">{stop}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Distance and Passengers */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Car className="w-3.5 h-3.5 text-muted-foreground" />
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("tripDetail.totalDistance")}</Label>
                </div>
                <p className="text-xl font-bold text-primary">{liveTrip.distance} km</p>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("trips.passengers")}</Label>
                <p className="text-xl font-bold">{liveTrip.passengers || 0}</p>
              </div>
            </div>

            {/* Trip Expenses */}
            {(liveTrip.tollAmount || liveTrip.parkingAmount || liveTrip.otherExpenses) && (
              <>
                <Separator />
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-3 block">{t("trips.expenses")}</Label>
                  <div className="space-y-2">
                    {liveTrip.tollAmount != null && liveTrip.tollAmount > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Receipt className="w-4 h-4 text-yellow-500" />
                          <span className="text-muted-foreground">{t("tripModal.toll")}</span>
                        </div>
                        <span className="font-medium">{liveTrip.tollAmount.toFixed(2)} €</span>
                      </div>
                    )}
                    {liveTrip.parkingAmount != null && liveTrip.parkingAmount > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <ParkingCircle className="w-4 h-4 text-purple-500" />
                          <span className="text-muted-foreground">{t("tripModal.parking")}</span>
                        </div>
                        <span className="font-medium">{liveTrip.parkingAmount.toFixed(2)} €</span>
                      </div>
                    )}
                    {liveTrip.otherExpenses != null && liveTrip.otherExpenses > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Banknote className="w-4 h-4 text-green-500" />
                          <span className="text-muted-foreground">{t("tripModal.otherExpenses")}</span>
                        </div>
                        <span className="font-medium">{liveTrip.otherExpenses.toFixed(2)} €</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex-1 flex flex-col">
            <Tabs defaultValue="document" className="flex-1 flex flex-col">
              <div className="flex-1 relative">
                <TabsContent value="map" className="absolute inset-0 m-0">
                  <TripGoogleMap route={liveTrip.route} open={open} />
                </TabsContent>

                <TabsContent value="document" className="absolute inset-0 m-0 bg-secondary/20">
                  <div className="w-full h-full p-6 overflow-auto">
                    {previewUrl ? (
                      <div className="flex flex-col h-full">
                        <div className="flex-1 bg-background rounded border border-border/50 overflow-hidden">
                          {previewDocName.toLowerCase().endsWith(".pdf") || previewDocName.toLowerCase().endsWith(".jpg") || previewDocName.toLowerCase().endsWith(".png") || previewDocName.toLowerCase().endsWith(".jpeg") ? (
                            <iframe src={previewUrl} className="w-full h-full" title={t("tripDetail.previewFrameTitle")} />
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center p-4">
                              <FileText className="w-12 h-12 text-muted-foreground mb-2" />
                              <p>{t("tripDetail.previewUnavailable")}</p>
                              <Button variant="outline" size="sm" asChild className="mt-4">
                                <a href={previewUrl} download={previewDocName}>
                                  {t("tripDetail.downloadFile")}
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
