import { captureClientError } from "@/lib/sentryClient";

const DEV = import.meta.env.DEV;
const IS_TEST = import.meta.env.MODE === "test";

function safeConsole(method: "debug" | "info" | "warn" | "error", args: unknown[]) {
  if (!DEV || IS_TEST) return;
  const fn = console[method] as ((...a: unknown[]) => void) | undefined;
  if (typeof fn !== "function") return;
  fn(...args);
}

export const logger = {
  debug: (...args: unknown[]) => safeConsole("debug", args),
  info: (...args: unknown[]) => safeConsole("info", args),
  warn: (...args: unknown[]) => safeConsole("warn", args),
  error: (message: string, err?: unknown, extra?: Record<string, unknown>) => {
    safeConsole("error", err != null ? [message, err] : [message]);
    if (err != null) captureClientError(err, { message, ...extra });
    else captureClientError(new Error(message), extra);
  },
};
