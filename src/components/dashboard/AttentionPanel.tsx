/**
 * Panel "Necesita tu atención" — Fase 4 del PLAN.md.
 *
 * Sustituye al NotificationDropdown (campana). Junta en una lista clicable:
 * warnings de viajes (trip-warnings.ts, incluye viajes sin proyecto),
 * callsheets fallidas y callsheets pendientes de revisión. Cada línea lleva
 * a su solución. Vacío = "Todo en orden".
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronRight, FileWarning } from "lucide-react";
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

const MAX_VISIBLE = 6;

export function AttentionPanel() {
  const { t, tf, locale } = useI18n();
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
        logger.warn("AttentionPanel: fetching callsheet issues failed", err);
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
  const visible = items.slice(0, MAX_VISIBLE);
  const hiddenCount = items.length - visible.length;

  return (
    <div className="glass-card p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          {t("dashboard.attentionTitle")}
        </h2>
        {items.length > 0 && (
          <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full bg-warning/20 text-warning">
            {items.length}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-6 text-muted-foreground">
          <CheckCircle2 className="w-8 h-8 text-[#129446]" />
          <p className="text-sm font-medium">{t("dashboard.attentionEmpty")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 overflow-y-auto">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.to)}
              className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 hover:bg-muted px-3 py-2 text-left transition-colors"
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
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => navigate("/trips")}
              className="text-xs text-muted-foreground hover:text-foreground text-left px-3 py-1"
            >
              {tf("dashboard.attentionMore", { count: hiddenCount })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
