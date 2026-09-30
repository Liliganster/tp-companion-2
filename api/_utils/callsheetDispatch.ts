// Use a configured origin: never send the worker secret to a request Host header.
export async function dispatchCallsheetWorker(params: URLSearchParams) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('Missing CRON_SECRET');
  const origin = new URL(process.env.APP_URL || 'https://dashboard.fahrtenbuchpro.com');
  if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Invalid APP_URL');
  params.set('background', '1');
  const response = await fetch(new URL('/api/worker?' + params.toString(), origin), {
    method: 'POST', headers: { Authorization: 'Bearer ' + secret }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('worker_dispatch_failed_' + response.status);
}
