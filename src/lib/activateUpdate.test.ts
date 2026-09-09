import { afterEach, describe, expect, it, vi } from "vitest";
import { activateUpdate } from "./activateUpdate";

class Worker extends EventTarget {
  state = "installed";
  postMessage = vi.fn();
  transition(state: string) { this.state = state; this.dispatchEvent(new Event("statechange")); }
}
afterEach(() => vi.useRealTimers());
describe("worker activation", () => {
  it("waits for actual activation instead of a 300ms delay", async () => {
    vi.useFakeTimers();
    const worker = new Worker();
    const done = vi.fn();
    const pending = activateUpdate(worker as unknown as ServiceWorker).then(done);
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).not.toHaveBeenCalled();
    worker.transition("activated");
    await pending;
    expect(done).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });
  it("reports a timeout without activating or navigating blindly", async () => {
    vi.useFakeTimers();
    const worker = new Worker();
    const pending = expect(activateUpdate(worker as unknown as ServiceWorker)).rejects.toThrow("update_timeout");
    await vi.advanceTimersByTimeAsync(15000);
    await pending;
  });
  it("rejects a replaced worker and removes its listener", async () => {
    const worker = new Worker();
    const remove = vi.spyOn(worker, "removeEventListener");
    const pending = expect(activateUpdate(worker as unknown as ServiceWorker)).rejects.toThrow("update_replaced");
    worker.transition("redundant");
    await pending;
    expect(remove).toHaveBeenCalledWith("statechange", expect.any(Function));
  });
  it("handles a worker activated by another tab before the click", async () => {
    const worker = new Worker();
    worker.state = "activated";
    await activateUpdate(worker as unknown as ServiceWorker);
    expect(worker.postMessage).not.toHaveBeenCalled();
  });
});
