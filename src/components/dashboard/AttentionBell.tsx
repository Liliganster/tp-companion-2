/**
 * Campana "Necesita tu atención" — vive en la cabecera del dashboard, a la
 * derecha del contador de IA (estilo Unity: campana con globo naranja).
 *
 * Sustituye a la tarjeta AttentionPanel de la Fase 4 (pedido de la
 * propietaria 2026-07-10). Junta en una lista clicable: warnings de viajes
 * (trip-warnings.ts, incluye viajes sin proyecto), callsheets fallidas y
 * callsheets pendientes de revisión. Cada línea lleva a su solución.
 * Vacío = "Todo en orden".
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, FileWarning } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTrips } from "@/contexts/TripsContext";
import { useAuth } from "@/contexts/AuthContext";
import { computeTripWarnings } from "@/lib/trip-warnings";
import { useI18n } from "@/hooks/use-i18n";
import { supabase } from "@/lib/supabaseClient";
import { logger } from "@/lib/logger";

type AttentionItem = {
  id: string;
  title: string;
  message: string;
  to: string;
};

export function AttentionBell() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { trips } = useTrips();
  const { user } = useAuth();
  const [jobItems, setJobItems] = useState<AttentionItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function fetchJobIssues() {
      if (!user?.id) {
        setJobItems([]);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("callsheet_jobs")
          .select("id, status, needs_review_reason, storage_path, created_at")
          .eq("user_id", user.id)
          .in("status", ["failed", "needs_review"])
          .order("created_at", { ascending: false })
          .limit(10);
        if (error || cancelled) return;
        setJobItems(
          (data ?? []).map((job: any) => {
            const fileName = String(job.storage_path ?? "").split("/").pop() || "callsheet";
            const failed = String(job.status) === "failed";
            return {
              id: `job:${job.id}`,
              title: failed ? t("dashboard.attentionCallsheetFailed") : t("dashboard.attentionCallsheetReview"),
              message: [fileName, job.needs_review_reason].filter(Boolean).join(" · "),
              to: failed ? "/trips?action=upload" : "/projects",
            };
          }),
        );
      } catch (err) {
        logger.warn("AttentionBell: fetching callsheet issues failed", err);
      }
    }
    void fetchJobIssues();
    return () => {
      cancelled = true;
    };
  }, [user?.id, t]);

  const tripItems = useMemo<AttentionItem[]>(() => {
    return computeTripWarnings(trips, t)
      .toNotifications({ dateLocale: locale })
      .map((n) => ({ id: n.id, title: n.title, message: n.message, to: "/trips" }));
  }, [trips, t, locale]);

  const items = [...jobItems, ...tripItems];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title={t("dashboard.attentionTitle")}
          aria-label={t("dashboard.attentionTitle")}
        >
          <Bell className="w-5 h-5" />
          {items.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {items.length}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <h3 className="text-sm font-semibold">{t("dashboard.attentionTitle")}</h3>
          {items.length > 0 && (
            <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-chip bg-warning/20 text-warning">
              {items.length}
            </span>
          )}
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 text-success" />
            <p className="text-sm font-medium">{t("dashboard.attentionEmpty")}</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto p-1.5 flex flex-col gap-1.5">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.to)}
                className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 hover:bg-muted px-3 py-2 text-left transition-colors w-full"
              >
                <span className="p-1.5 rounded-md shrink-0 bg-warning/20 text-warning">
                  {item.id.startsWith("job:") ? <FileWarning className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-xs">{item.title}</span>
                  <span className="block text-xs text-muted-foreground truncate">{item.message}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
