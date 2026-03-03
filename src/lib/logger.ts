import { captureClientError } from "@/lib/sentryClient";

const IS_TEST = import.meta.env.MODE === "test";
type ConsoleLevel = "debug" | "info" | "warn" | "error";
type ConsoleMethod = "log" | "info" | "warn" | "error";

function bindConsoleMethod(method: ConsoleMethod) {
  const fn = globalThis.console?.[method] as ((...args: unknown[]) => void) | undefined;
  return typeof fn === "function" ? fn.bind(globalThis.console) : null;
}

const rawConsole: Record<ConsoleMethod, ((...args: unknown[]) => void) | null> = {
  log: bindConsoleMethod("log"),
  info: bindConsoleMethod("info"),
  warn: bindConsoleMethod("warn"),
  error: bindConsoleMethod("error"),
};

const consoleMethodByLevel: Record<ConsoleLevel, ConsoleMethod> = {
  // `console.debug` lands in the browser's "Verbose" channel and looks "silent"
  // under the default console filters. Route debug to `log` so it stays visible.
  debug: "log",
  info: "info",
  warn: "warn",
  error: "error",
};

function safeConsole(level: ConsoleLevel, args: unknown[]) {
  if (IS_TEST) return;
  const fn = rawConsole[consoleMethodByLevel[level]];
  if (!fn) return;
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
