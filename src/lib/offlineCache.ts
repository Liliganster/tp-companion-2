type CacheEnvelope<T> = {
  v: 1;
  ts: number;
  data: T;
};

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function writeOfflineCache<T>(key: string, data: T) {
  try {
    const payload: CacheEnvelope<T> = { v: 1, ts: Date.now(), data };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function readOfflineCacheEntry<T>(key: string, maxAgeMs: number): { ts: number; data: T } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || parsed.v !== 1 || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > maxAgeMs) return null;
    return { ts: parsed.ts, data: parsed.data };
  } catch {
    return null;
  }
}

export function readOfflineCache<T>(key: string, maxAgeMs: number): T | null {
  return readOfflineCacheEntry<T>(key, maxAgeMs)?.data ?? null;
}
