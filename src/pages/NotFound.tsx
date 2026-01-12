import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n";
import { logger } from "@/lib/logger";

export default function NotFound() {
  const location = useLocation();
  const { t } = useI18n();

  useEffect(() => {
    logger.warn("404 route not found", { path: location.pathname });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">{t("notFound.message")}</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          {t("notFound.returnHome")}
        </a>
      </div>
    </div>
  );
}
