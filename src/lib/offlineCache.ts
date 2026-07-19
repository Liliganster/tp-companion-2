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

/**
 * Borra del navegador todo dato personal persistido al cerrar sesión
 * (dispositivo compartido: el siguiente usuario no debe ver nada del anterior).
 * - `cache:*` — cachés offline por usuario (viajes/proyectos/perfil: direcciones, matrícula…)
 * - `filters:*` — filtros guardados (contienen nombres de proyecto/productora)
 * - `calendar.enabledIds` — ids de calendarios de Google
 * - claves de la app local antigua (pre-Supabase) que aún pudieran quedar
 * Se conservan: preferencias de apariencia, flags de tours y consentimiento
 * de analytics (no contienen datos personales).
 */
export function clearSensitiveLocalData() {
  try {
    const legacyKeys = new Set(["user-profile", "projects", "trips", "reports", "migration-completed-v1"]);
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith("cache:") || key.startsWith("filters:") || key === "calendar.enabledIds" || legacyKeys.has(key)) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore (modo privado, storage lleno…)
  }
}
