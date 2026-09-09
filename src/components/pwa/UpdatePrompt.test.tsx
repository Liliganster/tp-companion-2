import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdatePrompt } from "./UpdatePrompt";

const mocks = vi.hoisted(() => ({
  registrations: [] as { waiting: null | object; update: ReturnType<typeof vi.fn> }[],
  workboxes: [] as { listeners: Map<string, () => void> }[],
  toast: Object.assign(vi.fn(), { info: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
  activate: vi.fn(),
  t: (key: string) => key,
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));
vi.mock("@/hooks/use-i18n", () => ({ useI18n: () => ({ t: mocks.t }) }));
vi.mock("@/lib/activateUpdate", () => ({ activateUpdate: mocks.activate }));
vi.mock("workbox-window", () => ({
  Workbox: class {
    listeners = new Map<string, () => void>();
    registration = mocks.registrations.shift();
    constructor() { mocks.workboxes.push(this); }
    addEventListener(name: string, cb: () => void) { this.listeners.set(name, cb); }
    removeEventListener(name: string) { this.listeners.delete(name); }
    register() { return Promise.resolve(this.registration); }
  },
}));
const realWindow = window;
const reload = vi.fn();
const confirm = vi.fn();
beforeEach(() => {
  vi.stubEnv("PROD", true);
  vi.clearAllMocks();
  mocks.registrations.length = 0;
  mocks.workboxes.length = 0;
  mocks.activate.mockResolvedValue(undefined);
  confirm.mockReturnValue(true);
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: new EventTarget() });
  vi.stubGlobal("window", new Proxy(realWindow, {
    get(target, key) {
      if (key === "location") return { reload };
      if (key === "confirm") return confirm;
      return Reflect.get(target, key, target);
    },
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function start() {
  mocks.registrations.push({ waiting: {}, update: vi.fn().mockResolvedValue(undefined) });
  render(<UpdatePrompt />);
  await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
  return mocks.toast.mock.calls.at(-1)![1].action.onClick as () => Promise<void>;
}
describe("update prompt", () => {
  it("does not reload either of two mounted tabs on controllerchange", async () => {
    await start();
    await start();
    act(() => navigator.serviceWorker.dispatchEvent(new Event("controllerchange")));
    expect(reload).not.toHaveBeenCalled();
    expect(mocks.activate).not.toHaveBeenCalled();
  });
  it("activates and reloads only once despite repeated clicks", async () => {
    const click = await start();
    await act(async () => { await Promise.all([click(), click()]); });
    expect(mocks.activate).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("preserves an open editor without even activating the update", async () => {
    const click = await start();
    const editor = document.createElement("div");
    editor.setAttribute("role", "dialog");
    editor.dataset.state = "open";
    document.body.append(editor);
    await act(click);
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    editor.remove();
  });
  it("does not reload when the user cancels", async () => {
    const click = await start();
    confirm.mockReturnValue(false);
    await act(click);
    expect(reload).not.toHaveBeenCalled();
  });
  it("keeps the tab open and reports an activation failure", async () => {
    const click = await start();
    mocks.activate.mockRejectedValue(new Error("update_timeout"));
    await act(click);
    expect(reload).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith("updates.failed");
  });
});
