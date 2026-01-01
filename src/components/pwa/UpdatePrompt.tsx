import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";

export function UpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const promptShownRef = useRef(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (!r) return;
      setRegistration(r);
    },
    onRegisterError(error) {
      console.log("SW registration error", error);
    },
  });

  useEffect(() => {
    if (!registration) return;

    // Best-effort: check for updates shortly after load, then periodically.
    const initial = window.setTimeout(() => {
      registration.update().catch(() => {});
    }, 5_000);

    const interval = window.setInterval(() => {
      registration.update().catch(() => {});
    }, 2 * 60 * 1000);

    const onFocus = () => {
      registration.update().catch(() => {});
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        registration.update().catch(() => {});
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [registration]);

  useEffect(() => {
    if (!needRefresh) return;
    if (promptShownRef.current) return;
    promptShownRef.current = true;

    toast("Nueva versión disponible", {
      description: "Haz clic en actualizar para cargar la nueva versión.",
      action: {
        label: "Actualizar",
        onClick: async () => {
          const waiting = registration?.waiting;
          const activated = waiting
            ? new Promise<void>((resolve) => {
                const done = () => resolve();
                const onStateChange = () => {
                  if (waiting.state === "activated") {
                    waiting.removeEventListener("statechange", onStateChange);
                    done();
                  }
                };

                waiting.addEventListener("statechange", onStateChange);
                if (waiting.state === "activated") {
                  waiting.removeEventListener("statechange", onStateChange);
                  done();
                  return;
                }

                window.setTimeout(() => {
                  waiting.removeEventListener("statechange", onStateChange);
                  done();
                }, 5_000);
              })
            : Promise.resolve();

          try {
            await updateServiceWorker(false);
            await activated;
          } finally {
            window.location.reload();
          }
        },
      },
      duration: Infinity,
    });
  }, [needRefresh, updateServiceWorker, registration]);

  return null;
}
