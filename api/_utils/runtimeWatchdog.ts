type WatchdogLogger = {
  warn: (bindings: Record<string, unknown>, message: string) => void;
};

type StartRuntimeWatchdogArgs = {
  context?: Record<string, unknown>;
  event: string;
  log: WatchdogLogger;
  warningMs: number;
};

export function startRuntimeWatchdog(args: StartRuntimeWatchdogArgs) {
  const { context = {}, event, log, warningMs } = args;
  const startedAt = Date.now();
  let warningLogged = false;

  const timeoutId = setTimeout(() => {
    warningLogged = true;
    log.warn(
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
