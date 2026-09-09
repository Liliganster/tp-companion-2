import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const html = readFileSync("index.html", "utf8");
const script = html.match(/<script id="app-recovery-bootstrap">([\s\S]*?)<\/script>/)![1];
let browser: { confirm: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn>; __appRecovery?: Window["__appRecovery"] };
let navigation: { href: string; origin: string; replace: ReturnType<typeof vi.fn> };
let network: { onLine: boolean; language: string; serviceWorker: { getRegistration: ReturnType<typeof vi.fn> } };
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = html.match(/<body>([\s\S]*?)<\/body>/)![1].replace(/<script[\s\S]*?<\/script>/g, "");
  browser = { confirm: vi.fn(() => true), addEventListener: vi.fn() };
  navigation = { href: "https://app.test/trips?filter=mine#receipt", origin: "https://app.test", replace: vi.fn() };
  network = { onLine: true, language: "es", serviceWorker: { getRegistration: vi.fn().mockResolvedValue(undefined) } };
  new Function("window", "document", "navigator", "location", "history", "setTimeout", "clearTimeout", script)(
    browser, document, network, navigation, { replaceState: vi.fn(), state: null }, setTimeout, clearTimeout,
  );
});
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });
const panel = () => document.getElementById("app-recovery")!;
describe("recovery before React starts", () => {
  it("shows a usable fallback for a missing entry module without reloading automatically", () => {
    const onError = browser.addEventListener.mock.calls.find(([name]) => name === "error")![1];
    onError({ target: { tagName: "SCRIPT", type: "module" } });
    expect(panel().hidden).toBe(false);
    expect(navigation.replace).not.toHaveBeenCalled();
  });
  it("shows a fallback when startup never finishes", async () => {
    await vi.advanceTimersByTimeAsync(20000);
    expect(panel().hidden).toBe(false);
    expect(navigation.replace).not.toHaveBeenCalled();
  });
  it("does not replace an existing form when a chunk fails", () => {
    document.getElementById("root")!.innerHTML = '<input value="unsaved">';
    browser.__appRecovery!.ready();
    const preload = browser.addEventListener.mock.calls.find(([name]) => name === "vite:preloadError")![1];
    preload();
    expect(document.querySelector("input")!.value).toBe("unsaved");
    expect(panel().hidden).toBe(false);
    expect(navigation.replace).not.toHaveBeenCalled();
  });
  it("cancels the startup timer after React mounts", async () => {
    browser.__appRecovery!.ready();
    await vi.advanceTimersByTimeAsync(25000);
    expect(panel().hidden).toBe(true);
  });
  it("keeps offline users on the page with an explanation", async () => {
    network.onLine = false;
    await browser.__appRecovery!.recover();
    expect(panel().textContent).toContain("Sin conexión");
    expect(navigation.replace).not.toHaveBeenCalled();
  });
  it("recovers the current route without clearing user data or other workers", async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    network.serviceWorker.getRegistration.mockResolvedValue({ active: { scriptURL: "https://app.test/sw.js" }, unregister });
    await Promise.all([browser.__appRecovery!.recover(), browser.__appRecovery!.recover()]);
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(navigation.replace).toHaveBeenCalledTimes(1);
    const url = new URL(navigation.replace.mock.calls[0][0]);
    expect(url.pathname).toBe("/trips");
    expect(url.searchParams.get("filter")).toBe("mine");
    expect(url.hash).toBe("#receipt");
    expect(url.searchParams.has("__app_recover")).toBe(true);
  });
  it("does not unregister a different application's worker", async () => {
    const unregister = vi.fn();
    network.serviceWorker.getRegistration.mockResolvedValue({ active: { scriptURL: "https://app.test/other/sw.js" }, unregister });
    await browser.__appRecovery!.recover();
    expect(unregister).not.toHaveBeenCalled();
  });
  it("does not reload after cancellation or failed recovery", async () => {
    document.getElementById("root")!.innerHTML = "<input>";
    browser.confirm.mockReturnValue(false);
    await browser.__appRecovery!.recover();
    expect(navigation.replace).not.toHaveBeenCalled();
    browser.confirm.mockReturnValue(true);
    network.serviceWorker.getRegistration.mockRejectedValue(new Error("unavailable"));
    await browser.__appRecovery!.recover();
    expect(panel().textContent).toContain("No se pudo recuperar");
    expect(navigation.replace).not.toHaveBeenCalled();
    expect((document.getElementById("app-recovery-retry") as HTMLButtonElement).disabled).toBe(false);
  });
});
