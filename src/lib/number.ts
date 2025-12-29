export function parseLocaleNumber(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function formatLocaleNumber(value: number): string {
  return String(value).replace(".", ",");
}

export function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
