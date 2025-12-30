import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log("SW Registered: " + r);
      if (r) {
        // Check for updates every 10 minutes
        setInterval(() => {
          console.log("Checking for SW update...");
          r.update();
        }, 10 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.log("SW registration error", error);
    },
  });

  useEffect(() => {
    if (needRefresh) {
      toast("Nueva versión disponible", {
        description: "Haz clic en actualizar para cargar la nueva versión.",
        action: {
          label: "Actualizar",
          onClick: () => updateServiceWorker(true),
        },
        duration: Infinity, // Don't auto-dismiss
      });
    }
  }, [needRefresh, updateServiceWorker]);

  return null; // Headless component
}
