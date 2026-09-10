export const CALLSHEET_STALE_MS = 90_000;
export function resolveCallsheetProcessingState<T extends { status: string; processing_started_at?: string | null; processed_at?: string | null; needs_review_reason?: string | null }>(job: T, requestActive: boolean, now = Date.now()): T {
  if (job.status !== 'processing' || requestActive) return job;
  const started = Date.parse(job.processing_started_at || job.processed_at || '');
  if (Number.isFinite(started) && now - started < CALLSHEET_STALE_MS) return job;
  // A killed server cannot persist a terminal status. Do not launch AI again
  // automatically: expose the interruption and keep polling for a late result.
  return { ...job, status: 'needs_review', needs_review_reason: 'La extracción no terminó dentro del tiempo de espera. El documento se conserva; puedes revisarlo manualmente.' };
}
