import * as Sentry from "@sentry/react";

let initialized = false;

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
      // Avoid leaking local dev noise if desired.
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
