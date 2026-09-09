// Observe the actual worker, not a fixed delay or another tab's controllerchange.
export function activateUpdate(worker: ServiceWorker, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", check);
      if (error) reject(error); else resolve();
    };
    const check = () => {
      if (worker.state === "activated") finish();
      else if (worker.state === "redundant") finish(new Error("update_replaced"));
    };
    const timer = setTimeout(() => finish(new Error("update_timeout")), timeoutMs);
    worker.addEventListener("statechange", check);
    check();
    if (worker.state === "activated" || worker.state === "redundant") return;
    try { worker.postMessage({ type: "SKIP_WAITING" }); }
    catch (error) { finish(error instanceof Error ? error : new Error("update_failed")); }
  });
}
