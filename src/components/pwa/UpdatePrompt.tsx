import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

type WorkboxInstance = import("workbox-window").Workbox;

export function UpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [needRefresh, setNeedRefresh] = useState(false);
  const wbRef = useRef<WorkboxInstance | null>(null);
  const registeredRef = useRef(false);
  const promptShownRef = useRef(false);

  useEffect(() => {
    if (import.meta.env.PROD) return;
    if (!("serviceWorker" in navigator)) return;
    try {
      const registrationsPromise = navigator.serviceWorker.getRegistrations?.();
      if (!registrationsPromise) return;
      registrationsPromise
        .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
        .catch(() => {});
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (!("serviceWorker" in navigator)) return;
    if (registeredRef.current) return;
    registeredRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        const { Workbox } = await import("workbox-window");
        const baseUrl = import.meta.env.BASE_URL || "/";
        const swUrl = `${baseUrl}sw.js`;
        const wb = new Workbox(swUrl, { scope: baseUrl });

        wbRef.current = wb;

        // Show update prompt when a new SW is installed (isUpdate=true means not first install)
        wb.addEventListener("installed", (event: any) => {
          if (cancelled) return;
          if (event?.isUpdate) {
            logger.debug("[SW] New version installed, showing update prompt");
            setNeedRefresh(true);
          }
        });

        // Show update prompt when a new SW is waiting to activate
        wb.addEventListener("waiting", () => {
          if (cancelled) return;
          logger.debug("[SW] New version waiting, showing update prompt");
          setNeedRefresh(true);
        });

        // Listen for controlling changes to auto-reload if SW takes control
        wb.addEventListener("controlling", () => {
          logger.debug("[SW] New version took control, reloading...");
          window.location.reload();
        });

        const swRegistration = await wb.register();
        if (cancelled) return;
        if (swRegistration) setRegistration(swRegistration);

        // If a SW is already waiting (downloaded in background), show prompt immediately
        if (swRegistration?.waiting) {
          logger.debug("[SW] Found waiting SW on load, showing update prompt");
          setNeedRefresh(true);
        }
      } catch (error) {
        logger.warn("SW registration error", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (!registration) return;

    const updateNow = () => {
      if (document.visibilityState !== "visible") return;
      if (!navigator.onLine) return;
      registration.update().catch(() => {});
    };

    // Check for updates immediately, then every 10 seconds while visible
    updateNow();
    const interval = window.setInterval(updateNow, 10_000);

    const onFocus = () => {
      updateNow();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        updateNow();
      }
    };

    const onOnline = () => updateNow();

    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [registration]);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
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
            wbRef.current?.messageSkipWaiting();
            await activated;
          } finally {
            window.location.reload();
          }
        },
      },
      duration: Infinity,
    });
  }, [needRefresh, registration]);

  return null;
}
