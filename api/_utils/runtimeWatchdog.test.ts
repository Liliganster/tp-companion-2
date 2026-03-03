import { afterEach, describe, expect, it, vi } from "vitest";

import { startRuntimeWatchdog } from "./runtimeWatchdog.js";

describe("runtimeWatchdog", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("logs a warning when the runtime crosses the threshold", () => {
    vi.useFakeTimers();
    const warn = vi.fn();

    const watchdog = startRuntimeWatchdog({
      context: { requestId: "req-1" },
      event: "worker_possible_vercel_timeout",
      log: { warn },
      warningMs: 55_000,
    });

    vi.advanceTimersByTime(55_000);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        warningMs: 55_000,
      }),
      "worker_possible_vercel_timeout",
    );

    expect(watchdog.cancel().warningLogged).toBe(true);
  });

  it("stays silent when the handler finishes before the threshold", () => {
    vi.useFakeTimers();
    const warn = vi.fn();

    const watchdog = startRuntimeWatchdog({
      event: "worker_possible_vercel_timeout",
      log: { warn },
      warningMs: 55_000,
    });

    vi.advanceTimersByTime(10_000);

    expect(watchdog.cancel().warningLogged).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});
