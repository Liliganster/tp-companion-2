import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MapPin, FileText, Paperclip, CircleDot } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { tf } from "@/lib/i18n";
import { TripGoogleMap } from "@/components/trips/TripGoogleMap";

interface Trip {
  id: string;
  date: string;
  route: string[];
  project: string;
  purpose: string;
  passengers: number;
  warnings?: string[];
  co2: number;
  distance: number;
  ratePerKmOverride?: number | null;
}

interface TripDetailModalProps {
  trip: Trip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TripDetailModal({ trip, open, onOpenChange }: TripDetailModalProps) {
  const { t, locale, language } = useI18n();

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
                        className={`w-4 h-4 ${
                          index === 0 || index === trip.route.length - 1 ? "text-primary" : "text-muted-foreground"
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

                <TabsContent value="document" className="absolute inset-0 m-0 flex items-center justify-center bg-secondary/20">
                  <div className="text-center space-y-2">
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto" />
                    <p className="text-muted-foreground">{t("tripDetail.noDocuments")}</p>
                    <Button variant="outline" size="sm">
                      <Paperclip className="w-4 h-4 mr-2" />
                      {t("tripDetail.attachDocument")}
                    </Button>
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
