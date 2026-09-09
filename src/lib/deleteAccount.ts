export async function continueAccountDeletion(
  getToken: () => Promise<string | null>,
  signal: AbortSignal,
  request: typeof fetch = fetch,
  wait: (ms: number) => Promise<void> = ms => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, ms);
    const cancel = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    signal.addEventListener('abort', cancel, { once: true });
  }),
) {
  let receipt: string | undefined;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const token = await getToken();
    if (!token && !receipt) throw new Error('session_invalid');
    const response = await request('/api/user/delete-account', { method: 'POST', headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(receipt ? { 'X-Deletion-Receipt': receipt } : {}), 'Content-Type': 'application/json',
    }, signal });
    const data = await response.json().catch(() => null);
    if (typeof data?.receipt === 'string') receipt = data.receipt;
    // A 202 is progress, never successful account deletion.
    if (response.status === 200 && data?.ok === true) return;
    if (response.status !== 202 || data?.pending !== true) throw new Error('account_deletion_incomplete');
    await wait(Math.min(15000, Math.max(5000, Number(data.retryAfterMs) || 5000)));
  }
  throw new Error('account_deletion_incomplete');
}
