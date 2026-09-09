import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { useI18n } from "@/hooks/use-i18n";
import { activateUpdate } from "@/lib/activateUpdate";

export function UpdatePrompt() {
  const { t } = useI18n();
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [needRefresh, setNeedRefresh] = useState(false);
  const updating = useRef(false);
  const reloading = useRef(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    let dispose = () => {};
    void (async () => {
      try {
        const { Workbox } = await import("workbox-window");
        if (cancelled) return;
        const base = import.meta.env.BASE_URL || "/";
        const wb = new Workbox(`${base}sw.js`, { scope: base, updateViaCache: "none" });
        const onWaiting = () => { if (!cancelled) setNeedRefresh(true); };
        wb.addEventListener("waiting", onWaiting);
        dispose = () => wb.removeEventListener("waiting", onWaiting);
        const result = await wb.register();
        if (cancelled) return;
        if (result) setRegistration(result);
        if (result?.waiting) setNeedRefresh(true);
      } catch (error) {
        logger.warn("SW registration error", error);
      }
    })();
    return () => { cancelled = true; dispose(); };
  }, []);

  useEffect(() => {
    if (!registration) return;
    const check = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void registration.update().catch(() => {});
      }
    };
    check();
    const timer = window.setInterval(check, 60_000);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [registration]);

  useEffect(() => {
    if (!needRefresh || !registration) return;
    let disposed = false;
    const show = () => {
      if (disposed || reloading.current) return;
      toast(t("updates.available"), {
        id: "app-update",
        description: t("updates.description"),
        duration: Infinity,
        action: {
          label: t("updates.action"),
          onClick: async () => {
            if (updating.current || reloading.current) return;
            // Open editors must be saved or closed using their own controls.
            if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) {
              toast.info(t("updates.closeEditor"));
              setTimeout(show, 0);
              return;
            }
            updating.current = true;
            try {
              if (registration.waiting) await activateUpdate(registration.waiting);
              if (disposed) return;
              // Ask immediately before navigation, including edits made while waiting.
              if (!window.confirm(t("updates.confirm"))) {
                setTimeout(show, 0);
                return;
              }
              reloading.current = true;
              window.location.reload();
            } catch (error) {
              logger.warn("SW update failed", error);
              toast.error(t("updates.failed"));
              setTimeout(show, 0);
            } finally {
              updating.current = false;
            }
          },
        },
      });
    };
    show();
    return () => { disposed = true; toast.dismiss("app-update"); };
  }, [needRefresh, registration, t]);

  // Other tabs never navigate in response to controllerchange or activation.
  return null;
}
