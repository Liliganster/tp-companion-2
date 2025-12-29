export type AnalyticsConsent = "granted" | "denied" | null;

const KEY = "tp.analytics_consent.v1";

export function readAnalyticsConsent(): AnalyticsConsent {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    if (raw === "granted") return "granted";
    if (raw === "denied") return "denied";
    return null;
  } catch {
    return null;
  }
}

export function writeAnalyticsConsent(consent: Exclude<AnalyticsConsent, null>) {
  try {
    localStorage.setItem(KEY, consent);
  } catch {
    // ignore
  }
}

export function clearAnalyticsConsent() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

