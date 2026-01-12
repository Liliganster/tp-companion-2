type LocalFirstEnvelope<T> = {
  v: 1;
  ts: number;
  data: T;
};

export type LocalFirstResource = "trips" | "projects" | "reports" | "route_templates";

export function getLocalFirstKey(resource: LocalFirstResource, userId?: string | null) {
  const uid = String(userId ?? "anon").trim() || "anon";
  return `fbp.localfirst:v1:${resource}:${uid}`;
}

export function readLocalFirst<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalFirstEnvelope<T>;
    if (!parsed || parsed.v !== 1 || typeof parsed.ts !== "number") return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export function writeLocalFirst<T>(key: string, data: T) {
  try {
    const payload: LocalFirstEnvelope<T> = { v: 1, ts: Date.now(), data };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function removeLocalFirst(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

