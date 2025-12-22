import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, MarkerF, PolylineF, useLoadScript, type Libraries } from "@react-google-maps/api";
import { MapPin } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

type LatLng = { lat: number; lng: number };

type DirectionsResponse = {
  overviewPolyline?: string;
  bounds?: { northeast?: LatLng; southwest?: LatLng } | null;
  legs?: Array<{ startLocation?: LatLng; endLocation?: LatLng }>;
  error?: string;
  message?: string;
};

function TripGoogleMapLoaded({ route, open, browserKey }: { route: string[]; open: boolean; browserKey: string }) {
  const { t, locale } = useI18n();

  const libraries = useMemo<Libraries>(() => ["places", "geometry"], []);
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: browserKey,
    libraries,
    language: locale,
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const [path, setPath] = useState<LatLng[] | null>(null);
  const [markers, setMarkers] = useState<LatLng[] | null>(null);
  const [bounds, setBounds] = useState<{ northeast: LatLng; southwest: LatLng } | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const origin = route[0];
  const destination = route[route.length - 1];
  const waypoints = route.slice(1, -1);

  useEffect(() => {
    if (!open) return;
    if (!isLoaded) return;
    if (!origin || !destination || route.length < 2) return;

    const controller = new AbortController();
    setRequestError(null);
    setPath(null);
    setMarkers(null);
    setBounds(null);

    (async () => {
      try {
        const response = await fetch("/api/google/directions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin,
            destination,
            waypoints,
            language: locale,
          }),
          signal: controller.signal,
        });

        const data = (await response.json().catch(() => null)) as DirectionsResponse | null;
        if (!response.ok || !data) {
          setRequestError(t("tripDetail.mapLoadError"));
          return;
        }

        if (!data.overviewPolyline) {
          setRequestError(t("tripDetail.mapNoRoute"));
          return;
        }

        if ((window as any).google?.maps?.geometry?.encoding?.decodePath) {
          const decoded = (window as any).google.maps.geometry.encoding.decodePath(data.overviewPolyline);
          const points = decoded.map((p: any) => ({ lat: p.lat(), lng: p.lng() })) as LatLng[];
          setPath(points);
        }

        const legMarkers: LatLng[] = [];
        const legs = Array.isArray(data.legs) ? data.legs : [];
        if (legs.length) {
          const first = legs[0]?.startLocation;
          if (first) legMarkers.push(first);
          for (const leg of legs) {
            if (leg?.endLocation) legMarkers.push(leg.endLocation);
          }
        }
        setMarkers(legMarkers.length ? legMarkers : null);

        const b = data.bounds?.northeast && data.bounds?.southwest ? { northeast: data.bounds.northeast, southwest: data.bounds.southwest } : null;
        setBounds(b);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setRequestError(t("tripDetail.mapLoadError"));
      }
    })();

    return () => controller.abort();
  }, [open, isLoaded, origin, destination, locale, waypoints, route.length, t]);

  useEffect(() => {
    if (!mapRef.current || !bounds) return;
    const sw = new google.maps.LatLng(bounds.southwest.lat, bounds.southwest.lng);
    const ne = new google.maps.LatLng(bounds.northeast.lat, bounds.northeast.lng);
    mapRef.current.fitBounds(new google.maps.LatLngBounds(sw, ne), 48);
  }, [bounds]);

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-4 bg-secondary/20">
        <MapPin className="w-12 h-12 text-muted-foreground" />
        <div className="text-center space-y-2 max-w-md">
          <h3 className="font-semibold">{t("tripDetail.mapLoadErrorTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("tripDetail.mapLoadError")}</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-4 bg-secondary/20">
        <MapPin className="w-12 h-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("tripDetail.mapLoading")}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <GoogleMap
        mapContainerClassName="w-full h-full"
        onLoad={(m) => (mapRef.current = m)}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        }}
        zoom={10}
        center={{ lat: 48.2082, lng: 16.3738 }}
      >
        {markers?.map((pos, idx) => (
          <MarkerF
            key={`${pos.lat}_${pos.lng}_${idx}`}
            position={pos}
            label={idx === 0 ? "A" : idx === markers.length - 1 ? "B" : String(idx)}
          />
        ))}
        {path && (
          <PolylineF
            path={path}
            options={{
              strokeColor: "#2563eb",
              strokeOpacity: 0.9,
              strokeWeight: 4,
            }}
          />
        )}
      </GoogleMap>

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
