type WatchdogLogger = {
  error?: (bindings: Record<string, unknown>, message: string) => void;
  warn: (bindings: Record<string, unknown>, message: string) => void;
};

type StartRuntimeWatchdogArgs = {
  context?: Record<string, unknown>;
  event: string;
  level?: "warn" | "error";
  log: WatchdogLogger;
  warningMs: number;
};

export function startRuntimeWatchdog(args: StartRuntimeWatchdogArgs) {
  const { context = {}, event, level = "warn", log, warningMs } = args;
  const startedAt = Date.now();
  let warningLogged = false;

  const timeoutId = setTimeout(() => {
    warningLogged = true;
    const writeLog = level === "error" && typeof log.error === "function"
      ? log.error.bind(log)
      : log.warn.bind(log);
    writeLog(
      {
        ...context,
        elapsedMs: Date.now() - startedAt,
        warningMs,
      },
      event,
    );
  }, warningMs);

  return {
    cancel(extraContext: Record<string, unknown> = {}) {
      clearTimeout(timeoutId);
      return {
        elapsedMs: Date.now() - startedAt,
        warningLogged,
        context: {
          ...context,
          ...extraContext,
          warningMs,
        },
      };
    },
  };
}
