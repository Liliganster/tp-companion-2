import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { useUserProfile } from "@/contexts/UserProfileContext";

function TripGoogleMapLoaded({ route, open, browserKey }: { route: string[]; open: boolean; browserKey: string }) {
  const { t, locale } = useI18n();
  const language = useMemo(() => locale.split("-")[0] ?? "en", [locale]);
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
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  // markersRef removed as we use default markers

  
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
      console.log('Google Maps script already exists, waiting for load...');
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
    console.log('Loading Google Maps script...');
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${browserKey}&libraries=places,geometry&v=weekly`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      console.log('Google Maps script loaded successfully');
      setScriptLoaded(true);
    };
    
    script.onerror = () => {
      console.error('Error loading Google Maps script');
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
          console.error('Google Maps not available after script load');
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
          console.log('Map created successfully');
          setMapReady(true);
        }
      } catch (error) {
        console.error("Error creating map:", error);
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

        // Limpiar marcadores anteriores
        // Limpiar marcadores anteriores (Managed by DirectionsRenderer now)


        // Limpiar renderer anterior
        if (directionsRendererRef.current) {
          directionsRendererRef.current.setMap(null);
        }

        if (!window.google?.maps) return;

        if (!mounted) return;

        // Crear DirectionsService y DirectionsRenderer
        const directionsService = new google.maps.DirectionsService();
        const directionsRenderer = new google.maps.DirectionsRenderer({
          map: googleMapRef.current,
          suppressMarkers: false,
          polylineOptions: {
            strokeColor: "#2563eb",
            strokeOpacity: 0.8,
            strokeWeight: 5,
          },
        });

        directionsRendererRef.current = directionsRenderer;

        // Preparar waypoints
        const waypointsFormatted = waypoints.map(location => ({
          location,
          stopover: true,
        }));

        // Calcular la ruta
        const request: google.maps.DirectionsRequest = {
          origin,
          destination,
          waypoints: waypointsFormatted,
          travelMode: google.maps.TravelMode.DRIVING,
          region: googleRegion,
          language,
        };

        directionsService.route(request, (result, status) => {
          if (!mounted) return;

          if (status === google.maps.DirectionsStatus.OK && result) {
            // Renderizar la ruta
            directionsRenderer.setDirections(result);
          } else {
            console.error("Directions request failed:", status);
            setRequestError(t("tripDetail.mapNoRoute"));
          }
        });
      } catch (error) {
        console.error("Error rendering route:", error);
        if (mounted) {
          setRequestError(t("tripDetail.mapLoadError"));
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [origin, destination, waypoints, open, mapReady, scriptLoaded, routeKey, t, language, googleRegion]);

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
