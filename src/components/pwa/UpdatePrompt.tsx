import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type WorkboxInstance = import("workbox-window").Workbox;

export function UpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [needRefresh, setNeedRefresh] = useState(false);
  const wbRef = useRef<WorkboxInstance | null>(null);
  const registeredRef = useRef(false);
  const promptShownRef = useRef(false);

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

        wb.addEventListener("waiting", () => {
          if (cancelled) return;
          setNeedRefresh(true);
        });

        const swRegistration = await wb.register();
        if (cancelled) return;
        if (swRegistration) setRegistration(swRegistration);
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
