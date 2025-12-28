import pino, { type Logger } from "pino";
import * as Sentry from "@sentry/node";
import { randomUUID } from "crypto";

let sentryInitialized = false;

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.VERCEL_ENV === "production" ? "info" : "debug"),
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "req.headers.set-cookie"],
    remove: true,
  },
});

function initSentryServer() {
  if (sentryInitialized) return;
  sentryInitialized = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
  });
}

function getRequestId(req: any): string {
  const h = req?.headers || {};
  const id =
    (typeof h["x-vercel-id"] === "string" && h["x-vercel-id"]) ||
    (typeof h["x-request-id"] === "string" && h["x-request-id"]) ||
    (typeof h["cf-ray"] === "string" && h["cf-ray"]);
  if (id) return id;
  try {
    return randomUUID();
  } catch {
    return String(Date.now());
  }
}

export function captureServerException(err: unknown, context?: Record<string, unknown>) {
  initSentryServer();
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureException(err, { extra: context });
}

export function withApiObservability<TReq = any, TRes = any>(
  handler: (req: TReq, res: TRes, ctx: { log: Logger; requestId: string }) => Promise<any>,
  meta?: { name?: string },
) {
  return async function wrapped(req: any, res: any) {
    const requestId = getRequestId(req);
    const log = logger.child({
      requestId,
      handler: meta?.name,
      method: req?.method,
      url: req?.url,
    });

    const start = Date.now();
    try {
      initSentryServer();

      const run = async () => handler(req, res, { log, requestId });
      const out =
        process.env.SENTRY_DSN
          ? await Sentry.startSpan(
              { op: "http.server", name: meta?.name || req?.url || "api" },
              async () => run(),
            )
          : await run();
      log.info({ status: res?.statusCode, duration_ms: Date.now() - start }, "request_complete");
      return out;
    } catch (err: any) {
      log.error({ err, status: res?.statusCode, duration_ms: Date.now() - start }, "request_failed");
      captureServerException(err, { requestId, handler: meta?.name, url: req?.url, method: req?.method });
      if (!res?.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "internal_error", requestId }));
      }
    }
  };
}
