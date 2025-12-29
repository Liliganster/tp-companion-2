import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { setAnalyticsConsent } from "@/lib/analytics";
import { readAnalyticsConsent } from "@/lib/analyticsConsent";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

export function CookieConsentBanner() {
  const { language } = useI18n();
  const [open, setOpen] = useState(false);

  const hasGa = Boolean(import.meta.env.VITE_GA_MEASUREMENT_ID);

  useEffect(() => {
    if (!hasGa) return;
    const consent = readAnalyticsConsent();
    setOpen(consent === null);
  }, [hasGa]);

  const copy = useMemo(() => {
    if (language === "de") {
      return {
        title: "Cookies & Analytics",
        body: "Wir würden gerne anonyme Analytics verwenden, um die App zu verbessern. Du kannst jederzeit ablehnen.",
        accept: "Akzeptieren",
        decline: "Ablehnen",
        learn: "Mehr erfahren",
      };
    }
    if (language === "en") {
      return {
        title: "Cookies & Analytics",
        body: "We’d like to use anonymous analytics to improve the app. You can opt out anytime.",
        accept: "Accept",
        decline: "Decline",
        learn: "Learn more",
      };
    }
    return {
      title: "Cookies y analítica",
      body: "Nos gustaría usar analítica anónima para mejorar la app. Puedes rechazarla cuando quieras.",
      accept: "Aceptar",
      decline: "Rechazar",
      learn: "Ver detalles",
    };
  }, [language]);

  if (!hasGa || !open) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[60] mx-auto max-w-3xl">
      <div className="glass-card p-4 border border-border/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="font-medium">{copy.title}</div>
            <div className="text-sm text-muted-foreground">{copy.body}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              <Link to="/legal/cookies" className="hover:underline">
                {copy.learn}
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAnalyticsConsent(false);
                setOpen(false);
              }}
            >
              {copy.decline}
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={() => {
                setAnalyticsConsent(true);
                setOpen(false);
              }}
            >
              {copy.accept}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

