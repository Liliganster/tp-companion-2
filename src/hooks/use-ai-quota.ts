import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePlan } from '@/contexts/PlanContext';
import { logger } from '@/lib/logger';

/** The server ledger is authoritative for both monthly and annual quotas.
 * Counting jobs locally would lose reprocesses, reviewed/deleted documents,
 * reservations and the Stripe subscription-year boundaries.
 */
export function useAiQuota() {
  const { user, getAccessToken } = useAuth();
  const { limits, aiQuota } = usePlan();
  const [used, setUsed] = useState<number | null>(null);
  const [limit, setLimit] = useState(aiQuota?.limit ?? limits.aiJobsPerMonth);
  const [period, setPeriod] = useState<'monthly' | 'annual'>(aiQuota?.period ?? 'monthly');
  const [periodEnd, setPeriodEnd] = useState<string | null>(aiQuota?.periodEnd ?? null);
  const [bypass, setBypass] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUsed(null);
    setBypass(false);
    setLimit(aiQuota?.limit ?? limits.aiJobsPerMonth);
    setPeriod(aiQuota?.period ?? 'monthly');
    setPeriodEnd(aiQuota?.periodEnd ?? null);
    async function fetchQuota() {
      if (!user?.id) { setLoading(false); return; }
      setLoading(true);
      try {
        const token = await getAccessToken();
        if (!token) return;
        const response = await fetch('/api/user/ai-quota', { headers: { Authorization: 'Bearer ' + token } });
        if (!response.ok) throw new Error('Failed to fetch AI quota');
        const data = await response.json();
        if (typeof data.used !== 'number' || typeof data.limit !== 'number') throw new Error('Invalid AI quota');
        if (!cancelled) {
          setUsed(data.used); setLimit(data.limit); setBypass(data.bypass === true);
          setPeriod(data.period === 'annual' ? 'annual' : 'monthly');
          setPeriodEnd(data.periodEnd ?? null);
        }
      } catch (error) {
        logger.warn('Could not fetch authoritative AI quota', error);
        if (!cancelled) { setUsed(null); setBypass(false); }
      } finally { if (!cancelled) setLoading(false); }
    }
    void fetchQuota();
    return () => { cancelled = true; };
  }, [user?.id, getAccessToken, limits.aiJobsPerMonth, aiQuota?.limit, aiQuota?.period, aiQuota?.periodEnd]);

  return { used, limit, period, periodEnd, bypass, loading };
}
