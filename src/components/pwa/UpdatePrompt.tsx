import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (!r) return;
      setInterval(() => {
        r.update();
      }, 10 * 60 * 1000);
    },
    onRegisterError(error) {
      console.log("SW registration error", error);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    toast("Nueva versión disponible", {
      description: "Haz clic en actualizar para cargar la nueva versión.",
      action: {
        label: "Actualizar",
        onClick: () => updateServiceWorker(true),
      },
      duration: Infinity,
    });
  }, [needRefresh, updateServiceWorker]);

  return null;
}

