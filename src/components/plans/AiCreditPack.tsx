import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useAiQuota } from '@/hooks/use-ai-quota';
import { useI18n } from '@/hooks/use-i18n';
import { toast } from 'sonner';

export function AiCreditPack() {
  const { t, tf } = useI18n();
  const { getAccessToken } = useAuth();
  const quota = useAiQuota();
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<'pending' | 'paid' | 'refunded' | null>(null);
  const [sessionId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('credits') === 'success' ? params.get('session_id') : null;
  });
  const [check, setCheck] = useState(0);
  const purchaseId = useRef<string | null>(null);
  const buying = useRef(false);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setBusy(true); setConfirmation('pending');
    async function confirm() {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('missing_session');
        const response = await fetch('/api/stripe/credits/confirm', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId }),
        });
        const result = await response.json();
        if (!response.ok || !['paid', 'refunded'].includes(result.status)) throw new Error('payment_pending');
        if (!cancelled) {
          setConfirmation(result.status); quota.refresh();
          window.history.replaceState({}, '', window.location.pathname);
        }
      } catch { /* Keep the status pending and offer an explicit refresh; never loop indefinitely. */ }
      finally { if (!cancelled) setBusy(false); }
    }
    void confirm();
    return () => { cancelled = true; };
  }, [sessionId, check, getAccessToken, quota.refresh]);

  async function buy() {
    if (buying.current) return;
    buying.current = true; setBusy(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('missing_session');
      purchaseId.current ??= crypto.randomUUID();
      const response = await fetch('/api/stripe/credits', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ purchaseId: purchaseId.current }),
      });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error('checkout_failed');
      window.location.assign(result.url);
    } catch {
      toast.error(t('credits.purchaseError'));
      buying.current = false; setBusy(false);
    }
  }

  return <section aria-labelledby="ai-credits-title" className="rounded-lg border border-border bg-card p-6 space-y-3">
    <h2 id="ai-credits-title" className="text-lg font-semibold">{t('credits.title')}</h2>
    <p className="text-2xl font-bold">{t('credits.offer')}</p>
    <p className="text-sm text-muted-foreground">{t('credits.description')}</p>
    <p className="text-xs text-muted-foreground">{t('credits.unit')}</p>
    <p className="text-sm">{quota.creditsAvailable === null ? t('credits.balanceUnknown') : tf('credits.balance', { count: quota.creditsAvailable })}</p>
    {confirmation && <p role="status">{t(confirmation === 'paid' ? 'credits.confirmed' : confirmation === 'refunded' ? 'credits.refunded' : 'credits.pending')}</p>}
    {confirmation === 'pending' ? <Button disabled={busy} onClick={() => setCheck(value => value + 1)}>{t('credits.checkPayment')}</Button>
      : <Button disabled={busy || quota.loading || quota.creditsAvailable === null} onClick={() => void buy()}>{t(busy ? 'credits.opening' : 'credits.buy')}</Button>}
    {quota.creditsAvailable === null && !quota.loading && <Button variant="outline" onClick={quota.refresh}>{t('ui.retry')}</Button>}
  </section>;
}
