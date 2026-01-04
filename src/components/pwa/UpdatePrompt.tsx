import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type WorkboxInstance = import("workbox-window").Workbox;

export function UpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [needRefresh, setNeedRefresh] = useState(false);
  const wbRef = useRef<WorkboxInstance | null>(null);
  const registeredRef = useRef(false);
  const promptShownRef = useRef(false);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
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

        wb.addEventListener("installed", (event: any) => {
          if (cancelled) return;
          // Only show update prompt if this is not the initial load
          // On initial load, the app already has the latest version
          if (event?.isUpdate && !isInitialLoadRef.current) {
            setNeedRefresh(true);
          }
        });

        wb.addEventListener("waiting", () => {
          if (cancelled) return;
          // Only show update prompt if this is not the initial load
          if (!isInitialLoadRef.current) {
            setNeedRefresh(true);
          }
        });

        const swRegistration = await wb.register();
        if (cancelled) return;
        if (swRegistration) setRegistration(swRegistration);

        // If an update was downloaded while the app was in the background, `waiting` may already be set.
        // But only show prompt if this is not the initial load
        if (swRegistration?.waiting && !isInitialLoadRef.current) {
          setNeedRefresh(true);
        }
        
        // Mark that initial load is complete after a short delay
        // This allows the SW to activate on first load without showing the prompt
        setTimeout(() => {
          isInitialLoadRef.current = false;
        }, 2000);
      } catch (error) {
        console.log("SW registration error", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!registration) return;

    const updateNow = () => {
      if (document.visibilityState !== "visible") return;
      if (!navigator.onLine) return;
      registration.update().catch(() => {});
    };

    // Check for updates shortly after load, and then frequently while the tab is visible.
    const initial = window.setTimeout(updateNow, 1_000);
    const interval = window.setInterval(updateNow, 30_000);

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
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
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
