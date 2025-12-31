/**
 * Retry logic with exponential backoff for AI job processing
 * Provides utilities for detecting stuck jobs and calculating retry delays
 */

/**
 * Calculate next retry timestamp with exponential backoff
 * @param retryCount Current retry attempt (0-indexed)
 * @param baseDelayMs Base delay in milliseconds (default: 60000 = 1 minute)
 * @param maxDelayMs Maximum delay cap (default: 3600000 = 1 hour)
 * @returns ISO timestamp string for next retry
 */
export function calculateNextRetry(
  retryCount: number,
  baseDelayMs: number = 60_000,
  maxDelayMs: number = 3_600_000
): string {
  // Exponential backoff: 1min, 2min, 4min, 8min... up to maxDelay
  const delayMs = Math.min(baseDelayMs * Math.pow(2, retryCount), maxDelayMs);
  const nextRetry = new Date(Date.now() + delayMs);
  return nextRetry.toISOString();
}

/**
 * Check if a job is stuck in processing state
 * @param processingStartedAt ISO timestamp when processing started
 * @param timeoutMinutes Timeout threshold in minutes (default: 10)
 * @returns true if job has been processing for longer than timeout
 */
export function isJobStuck(
  processingStartedAt: string | null | undefined,
  timeoutMinutes: number = 10
): boolean {
  if (!processingStartedAt) return false;
  
  const startedAt = new Date(processingStartedAt).getTime();
  const now = Date.now();
  const elapsedMinutes = (now - startedAt) / (60 * 1000);
  
  return elapsedMinutes > timeoutMinutes;
}

/**
 * Should a failed job be retried?
 * @param retryCount Current retry count
 * @param maxRetries Maximum allowed retries
 * @param nextRetryAt ISO timestamp for next retry
 * @returns true if job should be retried now
 */
export function shouldRetry(
  retryCount: number,
  maxRetries: number,
  nextRetryAt: string | null | undefined
): boolean {
  if (retryCount >= maxRetries) return false;
  if (!nextRetryAt) return true; // No scheduled retry yet, should retry
  
  const retryTime = new Date(nextRetryAt).getTime();
  const now = Date.now();
  
  return now >= retryTime;
}

/**
 * Generate cache key for deduplication
 * @param userId User ID
 * @param storagePath Storage path of document
 * @returns Cache key string
 */
export function generateCacheKey(userId: string, storagePath: string): string {
  return `${userId}:${storagePath}`;
}

export type RetryStrategy = {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMinutes: number;
};

export const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
  maxRetries: 3,
  baseDelayMs: 60_000, // 1 minute
  maxDelayMs: 3_600_000, // 1 hour
  timeoutMinutes: 10,
};
