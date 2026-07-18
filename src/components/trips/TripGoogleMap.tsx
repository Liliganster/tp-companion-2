import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/lib/logger";

function TripGoogleMapLoaded({ route, open, browserKey }: { route: string[]; open: boolean; browserKey: string }) {
  const { t } = useI18n();
  const { getAccessToken } = useAuth();
  const { profile } = useUserProfile();

  const googleRegion = useMemo(() => {
    const normalized = profile.country.trim().toLowerCase();
    const countryMap: Record<string, string> = {
      "austria": "at",
      "österreich": "at",
      "germany": "de",
      "deutschland": "de",
      "spain": "es",
      "españa": "es",
      "italy": "it",
      "italia": "it",
      "france": "fr",
      "switzerland": "ch",
      "schweiz": "ch",
      "suisse": "ch",
      "svizzera": "ch",
      "belgium": "be",
      "belgique": "be",
      "belgië": "be",
      "netherlands": "nl",
      "nederland": "nl",
      "portugal": "pt",
      "uk": "gb",
      "united kingdom": "gb",
      "poland": "pl",
      "polska": "pl",
      "czech republic": "cz",
      "czechia": "cz",
      "česko": "cz",
      "hungary": "hu",
      "magyarország": "hu",
      "slovakia": "sk",
      "slovensko": "sk",
      "slovenia": "si",
      "slovenija": "si",
      "croatia": "hr",
      "hrvatska": "hr",
    };
    return countryMap[normalized];
  }, [profile.country]);

  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const normalizedRoute = useMemo(() => route.map((s) => (s ?? "").trim()).filter(Boolean), [route]);
  const origin = normalizedRoute[0];
  const destination = normalizedRoute[normalizedRoute.length - 1];
  const waypoints = useMemo(() => normalizedRoute.slice(1, -1), [normalizedRoute]);
  const routeKey = useMemo(() => normalizedRoute.join(" | "), [normalizedRoute]);

  // Cargar el script de Google Maps
  useEffect(() => {
    if (scriptLoaded || !open || !browserKey) return;

    const checkGoogleMaps = () => {
      if (window.google?.maps) {
        setScriptLoaded(true);
        return true;
      }
      return false;
    };

    // Si ya está cargado
    if (checkGoogleMaps()) return;

    // Verificar si el script ya existe
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      const checkInterval = setInterval(() => {
        if (checkGoogleMaps()) {
          clearInterval(checkInterval);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        if (!window.google?.maps) {
          setLoadError(t("tripDetail.mapLoadError"));
        }
      }, 10000); // timeout después de 10 segundos

      return () => clearInterval(checkInterval);
    }

    // Cargar el script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${browserKey}&libraries=geometry&v=weekly`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      setScriptLoaded(true);
    };

    script.onerror = () => {
      logger.warn("Error loading Google Maps script");
      setLoadError(t("tripDetail.mapLoadError"));
    };

    document.head.appendChild(script);

    return () => {
      // No remover el script para evitar recargas
    };
  }, [open, browserKey, t, scriptLoaded]);

  // Inicializar el mapa
  useEffect(() => {
    if (!mapRef.current || !open || !scriptLoaded || mapReady) return;

    let mounted = true;

    const initMap = async () => {
      try {
        if (!window.google?.maps) {
          logger.warn("Google Maps not available after script load");
          setLoadError(t("tripDetail.mapLoadError"));
          return;
        }

        // Crear el mapa si no existe
        if (!googleMapRef.current && mapRef.current) {
          googleMapRef.current = new google.maps.Map(mapRef.current, {
            center: { lat: 48.2082, lng: 16.3738 },
            zoom: 12,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            zoomControl: true,
          });
          setMapReady(true);
        }
      } catch (error) {
        logger.warn("Error creating map", error);
        if (mounted) {
          setLoadError(t("tripDetail.mapLoadError"));
        }
      }
    };

    initMap();

    return () => {
      mounted = false;
    };
  }, [open, scriptLoaded, mapReady, t]);

  // Calcular y renderizar la ruta
  useEffect(() => {
    if (!googleMapRef.current || !open || !mapReady || !scriptLoaded) return;
    if (!origin || !destination || normalizedRoute.length < 2) return;

    let mounted = true;

    (async () => {
      try {
        setRequestError(null);

        routePolylineRef.current?.setMap(null);
        markersRef.current.forEach((marker) => marker.setMap(null));
        markersRef.current = [];

        if (!window.google?.maps) return;

        if (origin.trim() === destination.trim() && waypoints.length === 0) {
          setRequestError(t("tripDetail.mapNoRoute"));
          return;
        }

        const token = await getAccessToken();
        if (!token || !mounted) return;

        const response = await fetch("/api/google/directions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ origin, destination, waypoints, region: googleRegion }),
        });
        const data = (await response.json().catch(() => null)) as {
          overviewPolyline?: string;
          bounds?: {
            southwest?: { lat?: number; lng?: number };
            northeast?: { lat?: number; lng?: number };
          } | null;
          legs?: Array<{
            startLocation?: { lat?: number; lng?: number } | null;
            endLocation?: { lat?: number; lng?: number } | null;
          }>;
        } | null;

        if (!response.ok || !data?.overviewPolyline || !mounted) {
          setRequestError(t("tripDetail.mapNoRoute"));
          return;
        }

        const path = google.maps.geometry.encoding.decodePath(data.overviewPolyline);
        if (!path.length || !googleMapRef.current) {
          setRequestError(t("tripDetail.mapNoRoute"));
          return;
        }

        routePolylineRef.current = new google.maps.Polyline({
          map: googleMapRef.current,
          path,
          strokeColor: "#3F8CFF",
          strokeOpacity: 0.8,
          strokeWeight: 5,
        });

        const firstLeg = data.legs?.[0];
        const lastLeg = data.legs?.[data.legs.length - 1];
        const markerInputs = [
          { label: "A", location: firstLeg?.startLocation },
          { label: "B", location: lastLeg?.endLocation },
        ];
        markersRef.current = markerInputs.flatMap(({ label, location }) => {
          if (typeof location?.lat !== "number" || typeof location?.lng !== "number") return [];
          return [new google.maps.Marker({
            map: googleMapRef.current,
            position: { lat: location.lat, lng: location.lng },
            label,
          })];
        });

        const southwest = data.bounds?.southwest;
        const northeast = data.bounds?.northeast;
        if (
          typeof southwest?.lat === "number" && typeof southwest?.lng === "number" &&
          typeof northeast?.lat === "number" && typeof northeast?.lng === "number"
        ) {
          googleMapRef.current.fitBounds(new google.maps.LatLngBounds(southwest, northeast), 32);
        } else {
          const bounds = new google.maps.LatLngBounds();
          path.forEach((point) => bounds.extend(point));
          googleMapRef.current.fitBounds(bounds, 32);
        };
      } catch (error) {
        logger.warn("Error rendering route", error);
        if (mounted) {
          setRequestError(t("tripDetail.mapLoadError"));
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [origin, destination, waypoints, normalizedRoute.length, open, mapReady, scriptLoaded, routeKey, t, googleRegion, getAccessToken]);

  const isLoading = !scriptLoaded || !mapReady;

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />

      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center h-full p-8 space-y-4 bg-secondary/20">
          <MapPin className="w-12 h-12 text-muted-foreground" />
          <div className="text-center space-y-2 max-w-md">
            <h3 className="font-semibold">{t("tripDetail.mapLoadErrorTitle")}</h3>
            <p className="text-sm text-muted-foreground">{loadError}</p>
          </div>
        </div>
      )}

      {!loadError && isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center h-full p-8 space-y-4 bg-secondary/20">
          <Loader2 className="w-12 h-12 text-muted-foreground animate-spin" />
          <p className="text-sm text-muted-foreground">{t("tripDetail.mapLoading")}</p>
        </div>
      )}

      {requestError && (
        <div className="absolute top-3 left-3 right-3 pointer-events-none">
          <div className="bg-background/90 border border-border rounded-md px-3 py-2 text-sm text-muted-foreground">
            {requestError}
          </div>
        </div>
      )}
    </div>
  );
}

export function TripGoogleMap({ route, open }: { route: string[]; open: boolean }) {
  const { t } = useI18n();
  const browserKey = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined;

  if (!browserKey?.trim()) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-4 bg-secondary/20">
        <MapPin className="w-12 h-12 text-muted-foreground" />
        <div className="text-center space-y-2 max-w-md">
          <h3 className="font-semibold">{t("tripDetail.mapNotConfiguredTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("tripDetail.mapNotConfiguredBody")}</p>
        </div>
      </div>
    );
  }

  return <TripGoogleMapLoaded route={route} open={open} browserKey={browserKey} />;
}
