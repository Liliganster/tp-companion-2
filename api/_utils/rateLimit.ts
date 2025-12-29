import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type LimitResult = {
  ok: boolean;
  remaining: number;
  resetMs: number;
};

function getEnv(name: string): string | null {
  const v = process.env[name];
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

function getClientIp(req: any): string {
  const h = req?.headers ?? {};
  const xff = typeof h["x-forwarded-for"] === "string" ? h["x-forwarded-for"] : typeof h["X-Forwarded-For"] === "string" ? h["X-Forwarded-For"] : "";
  const first = xff.split(",")[0]?.trim();
  const ip =
    first ||
    (typeof h["x-real-ip"] === "string" ? h["x-real-ip"] : "") ||
    (typeof h["cf-connecting-ip"] === "string" ? h["cf-connecting-ip"] : "") ||
    (typeof req?.socket?.remoteAddress === "string" ? req.socket.remoteAddress : "") ||
    "unknown";
  return ip;
}

function sendRateLimited(res: any, result: LimitResult, requestId?: string) {
  const retryAfterSec = Math.max(1, Math.ceil(result.resetMs / 1000));
  res.statusCode = 429;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Retry-After", String(retryAfterSec));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
  res.setHeader("X-RateLimit-Reset", String(Date.now() + result.resetMs));
  res.end(JSON.stringify({ error: "rate_limited", retryAfterSec, requestId }));
}

// In-memory fallback (best-effort, per-instance)
const MEM = new Map<string, number[]>();
function memorySlidingWindow(key: string, limit: number, windowMs: number): LimitResult {
  const now = Date.now();
  const start = now - windowMs;
  const prev = MEM.get(key) ?? [];
  const next = prev.filter((t) => t >= start);
  next.push(now);
  MEM.set(key, next);
  const remaining = Math.max(0, limit - next.length);
  const oldest = next[0] ?? now;
  const resetMs = Math.max(0, oldest + windowMs - now);
  return { ok: next.length <= limit, remaining, resetMs };
}

function getUpstashRedis() {
  const url = getEnv("UPSTASH_REDIS_REST_URL");
  const token = getEnv("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) return null;
  return new Redis({ url, token });
}

let ratelimiters: Record<string, Ratelimit> | null = null;
function windowMsToDuration(windowMs: number): Duration {
  const seconds = Math.max(1, Math.ceil(windowMs / 1000));
  return `${seconds} s` as unknown as Duration;
}

function getLimiter(name: string, limit: number, window: Duration): Ratelimit | null {
  const redis = getUpstashRedis();
  if (!redis) return null;

  if (!ratelimiters) ratelimiters = {};
  const cacheKey = `${name}:${limit}:${window}`;
  if (!ratelimiters[cacheKey]) {
    ratelimiters[cacheKey] = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, window),
      analytics: true,
      prefix: "tp",
    });
  }
  return ratelimiters[cacheKey]!;
}

export async function enforceRateLimit(params: {
  req: any;
  res: any;
  name: string;
  limit: number;
  windowMs: number;
  identifier?: string;
  requestId?: string;
}): Promise<boolean> {
  const { req, res, name, limit, windowMs, requestId } = params;
  const identifier = (params.identifier ?? "").trim() || getClientIp(req);
  const key = `${name}:${identifier}`;

  // Prefer Upstash if configured
  const limiter = getLimiter(name, limit, windowMsToDuration(windowMs));
  if (limiter) {
    const result = await limiter.limit(key);
    if (result.success) return true;
    sendRateLimited(res, { ok: false, remaining: result.remaining, resetMs: result.reset * 1000 - Date.now() }, requestId);
    return false;
  }

  // Fallback: in-memory limiter
  const result = memorySlidingWindow(key, limit, windowMs);
  if (result.ok) return true;
  sendRateLimited(res, result, requestId);
  return false;
}
