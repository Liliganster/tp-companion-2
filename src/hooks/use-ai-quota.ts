import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePlan } from "@/contexts/PlanContext";
import { logger } from "@/lib/logger";

/**
 * Cuota mensual de IA (callsheets) — Fase 4 del PLAN.md.
 *
 * Extraído del dashboard para reutilizarlo en el contador transparente
 * (tarjeta del dashboard) y en el modal de subida ANTES de gastar.
 * Fuente primaria: /api/user/ai-quota (respeta plan y bypass); fallback:
 * contar callsheet_jobs done del mes directamente en Supabase.
 */
export function useAiQuota() {
  const { user, getAccessToken } = useAuth();
  const { limits } = usePlan();
  const [used, setUsed] = useState<number | null>(null);
  const [limit, setLimit] = useState<number>(limits.aiJobsPerMonth);
  const [bypass, setBypass] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchAiQuota() {
      if (!user?.id) {
        setUsed(null);
        return;
      }

      setLoading(true);
      try {
        const token = await getAccessToken();
        if (!token) {
          if (!cancelled) setUsed(null);
          return;
        }

        const response = await fetch("/api/user/ai-quota", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Failed to fetch AI quota");
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) throw new Error("AI quota endpoint did not return JSON");

        const data = await response.json();
        if (!cancelled) {
          setBypass(data.bypass === true);
          setLimit(data.limit);
          setUsed(data.used);
        }
      } catch (e) {
        logger.warn("Error fetching AI quota from API, trying Supabase fallback", e);
        try {
          const { supabase } = await import("@/lib/supabaseClient");
          if (supabase && user?.id) {
            const startOfMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
            const { count, error } = await supabase
              .from("callsheet_jobs")
              .select("id", { count: "exact" })
              .range(0, 0)
              .eq("user_id", user.id)
              .eq("status", "done")
              .gte("processed_at", startOfMonth);
            if (!error && typeof count === "number" && !cancelled) {
              setUsed(count);
              setLimit(limits.aiJobsPerMonth);
              setBypass(false);
              return;
            }
          }
        } catch (fallbackErr) {
          logger.warn("Supabase fallback for AI quota also failed", fallbackErr);
        }
        if (!cancelled) setUsed(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchAiQuota();
    return () => {
      cancelled = true;
    };
  }, [user?.id, getAccessToken, limits.aiJobsPerMonth]);

  return { used, limit, bypass, loading };
}
