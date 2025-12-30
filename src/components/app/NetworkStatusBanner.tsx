import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function NetworkStatusBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
        <WifiOff className="h-4 w-4 text-amber-400" />
        <div className="text-xs text-muted-foreground">
          Sin conexión. La app puede mostrar datos guardados, pero no podrás sincronizar cambios hasta recuperar internet.
        </div>
      </div>
    </div>
  );
}

