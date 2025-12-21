import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MapPin, FileText, Paperclip, CircleDot } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

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
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapboxToken, setMapboxToken] = useState("");
  const [tokenSubmitted, setTokenSubmitted] = useState(false);

  // Check for stored token
  useEffect(() => {
    const storedToken = localStorage.getItem("mapbox_token");
    if (storedToken) {
      setMapboxToken(storedToken);
      setTokenSubmitted(true);
    }
  }, []);

  // Initialize map when token is available
  useEffect(() => {
    if (!mapContainer.current || !tokenSubmitted || !mapboxToken || !open) return;

    mapboxgl.accessToken = mapboxToken;

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: [16.3738, 48.2082], // Vienna as default
        zoom: 10,
      });

      map.current.addControl(new mapboxgl.NavigationControl(), "bottom-right");

      // Add markers for each stop (mock coordinates for demo)
      if (trip) {
        const mockCoordinates = [
          [16.3738, 48.2082],
          [16.3256, 48.3053],
          [16.3189, 48.2886],
          [16.3738, 48.2082],
        ];

        trip.route.forEach((stop, index) => {
          if (index < mockCoordinates.length) {
            new mapboxgl.Marker({ color: index === 0 || index === trip.route.length - 1 ? "#ef4444" : "#3b82f6" })
              .setLngLat(mockCoordinates[index] as [number, number])
              .setPopup(new mapboxgl.Popup().setHTML(`<p class="text-sm font-medium">${stop}</p>`))
              .addTo(map.current!);
          }
        });
      }
    } catch (error) {
      console.error("Error initializing map:", error);
      setTokenSubmitted(false);
    }

    return () => {
      map.current?.remove();
    };
  }, [tokenSubmitted, mapboxToken, open, trip]);

  const handleTokenSubmit = () => {
    if (mapboxToken.trim()) {
      localStorage.setItem("mapbox_token", mapboxToken);
      setTokenSubmitted(true);
    }
  };

  if (!trip) return null;

  const formattedDate = new Date(trip.date).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle>Detalles del viaje</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col md:flex-row h-[600px]">
          {/* Left sidebar */}
          <div className="w-full md:w-80 p-4 space-y-4 overflow-y-auto border-r border-border/50 bg-secondary/20">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Fecha</Label>
              <p className="font-semibold">{formattedDate}</p>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Proyecto</Label>
              <p className="font-semibold">{trip.project}</p>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Conductor</Label>
              <p className="font-semibold">Usuario actual</p>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Motivo</Label>
              <p className="font-semibold">{trip.purpose}</p>
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-primary" />
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Ruta</Label>
              </div>
              <div className="space-y-2 ml-1">
                {trip.route.map((stop, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <CircleDot className={`w-4 h-4 ${index === 0 || index === trip.route.length - 1 ? "text-primary" : "text-muted-foreground"}`} />
                      {index < trip.route.length - 1 && (
                        <div className="w-0.5 h-6 bg-border" />
                      )}
                    </div>
                    <span className="text-sm">{stop}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Distancia total</Label>
              <p className="text-2xl font-bold text-primary">{trip.distance} km</p>
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground block">
                    Facturas de combustible
                  </Label>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    y mantenimiento
                  </Label>
                </div>
                <Button size="sm" variant="secondary" className="gap-1">
                  <Paperclip className="w-3 h-3" />
                  Adjuntar
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Total documentado: 0,00 €</p>
            </div>
          </div>

          {/* Right side - Map */}
          <div className="flex-1 flex flex-col">
            <Tabs defaultValue="map" className="flex-1 flex flex-col">
              <div className="flex-1 relative">
                <TabsContent value="map" className="absolute inset-0 m-0">
                  {!tokenSubmitted ? (
                    <div className="flex flex-col items-center justify-center h-full p-8 space-y-4 bg-secondary/20">
                      <MapPin className="w-12 h-12 text-muted-foreground" />
                      <div className="text-center space-y-2">
                        <h3 className="font-semibold">Configura Mapbox</h3>
                        <p className="text-sm text-muted-foreground max-w-sm">
                          Para ver el mapa, necesitas un token público de Mapbox. 
                          Obtén uno gratis en{" "}
                          <a href="https://mapbox.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                            mapbox.com
                          </a>
                        </p>
                      </div>
                      <div className="w-full max-w-sm space-y-2">
                        <Input
                          placeholder="pk.eyJ1Ijoi..."
                          value={mapboxToken}
                          onChange={(e) => setMapboxToken(e.target.value)}
                        />
                        <Button onClick={handleTokenSubmit} className="w-full">
                          Guardar token
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div ref={mapContainer} className="w-full h-full" />
                  )}
                </TabsContent>
                <TabsContent value="document" className="absolute inset-0 m-0 flex items-center justify-center bg-secondary/20">
                  <div className="text-center space-y-2">
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto" />
                    <p className="text-muted-foreground">No hay documentos adjuntos</p>
                    <Button variant="outline" size="sm">
                      <Paperclip className="w-4 h-4 mr-2" />
                      Adjuntar documento
                    </Button>
                  </div>
                </TabsContent>
              </div>

              <div className="p-2 border-t border-border/50 bg-background">
                <TabsList className="w-full max-w-xs mx-auto">
                  <TabsTrigger value="map" className="flex-1 gap-2">
                    <MapPin className="w-4 h-4" />
                    Mapa
                  </TabsTrigger>
                  <TabsTrigger value="document" className="flex-1 gap-2">
                    <FileText className="w-4 h-4" />
                    Documento
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
