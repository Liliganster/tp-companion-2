// Keep provider < server < client < lease/stale recovery. SQL lease: 3 minutes.
export const CALLSHEET_PROVIDER_TIMEOUT_MS = 100_000;
export const CALLSHEET_CLIENT_TIMEOUT_MS = 160_000;
export const CALLSHEET_RECOVERY_TIMEOUT_MS = 180_000;
