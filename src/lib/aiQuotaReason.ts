export type ParsedMonthlyQuotaExceeded = {
  tier?: "free" | "pro";
  used?: number;
  limit?: number;
};

export function parseMonthlyQuotaExceededReason(reason?: string | null): ParsedMonthlyQuotaExceeded | null {
  const raw = String(reason ?? "").trim();
  if (!raw) return null;

  if (!raw.startsWith("monthly_quota_exceeded")) return null;

  const m = /^monthly_quota_exceeded:(free|pro):(\d+)\/(\d+)/.exec(raw);
  if (m) {
    const used = Number(m[2]);
    const limit = Number(m[3]);
    return {
      tier: m[1] as any,
      used: Number.isFinite(used) ? used : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    };
  }

  return {};
}

