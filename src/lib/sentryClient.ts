import * as Sentry from "@sentry/react";

let initialized = false;

function eventText(event: Sentry.Event): string {
  const parts: string[] = [];
  if (event.message) parts.push(String(event.message));
  const values = event.exception?.values ?? [];
  for (const v of values) {
    if (v?.type) parts.push(String(v.type));
    if (v?.value) parts.push(String(v.value));
  }
  const extra = event.extra as any;
  if (extra?.error?.message) parts.push(String(extra.error.message));
  return parts.join("\n").toLowerCase();
}

function isExpectedAuthFailure(event: Sentry.Event): boolean {
  const text = eventText(event);
  return (
    text.includes("invalid login credentials") ||
    text.includes("invalid_login_credentials") ||
    text.includes("authapierror") && text.includes("invalid")
  );
}

function readNumber(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function initSentryClient() {
  if (initialized) return;
  initialized = true;

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  const environment = (import.meta.env.MODE || "development") as string;
  const tracesSampleRate = readNumber(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0.1);

  Sentry.init({
    dsn,
    environment,
    tracesSampleRate,
    // Keep this conservative by default; turn on via env if needed.
    replaysSessionSampleRate: readNumber(import.meta.env.VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE, 0),
    replaysOnErrorSampleRate: readNumber(import.meta.env.VITE_SENTRY_REPLAY_ERROR_SAMPLE_RATE, 0),
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    beforeSend(event) {
      if (isExpectedAuthFailure(event)) return null;
      return event;
    },
  });
}

export function captureClientError(err: unknown, extra?: Record<string, unknown>) {
  if (!initialized) initSentryClient();
  if (!Sentry.getClient()) return;
  Sentry.captureException(err, { extra });
}

export function setSentryUser(user: { id: string } | null) {
  if (!initialized) initSentryClient();
  if (!Sentry.getClient()) return;
  Sentry.setUser(user ? { id: user.id } : null);
}
