import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  localStorage.clear();
  document.head.querySelectorAll("script").forEach((s) => s.remove());
  vi.restoreAllMocks();
});

describe("analytics consent gating", () => {
  it("does not load GA4 before consent", async () => {
    vi.resetModules();
    const { initAnalytics } = await import("./analytics");

    const appendSpy = vi.spyOn(document.head, "appendChild");
    initAnalytics();

    expect(appendSpy).not.toHaveBeenCalled();
    expect(document.querySelector('script[src*="gtag/js"]')).toBeNull();
  });

  it("loads GA4 after consent is granted", async () => {
    vi.resetModules();
    const { initAnalytics, setAnalyticsConsent } = await import("./analytics");

    initAnalytics(); // should no-op until consent
    setAnalyticsConsent(true); // should force init + load script

    const script = document.querySelector('script[src*="gtag/js"]') as HTMLScriptElement | null;
    expect(script).not.toBeNull();
    expect(script!.async).toBe(true);
  });
});

