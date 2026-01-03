declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: any[]) => void;
  }
}

import { readAnalyticsConsent, writeAnalyticsConsent } from "@/lib/analyticsConsent";

let initialized = false;

function getMeasurementId(): string | undefined {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
  if (measurementId) return measurementId;

  const maybeProcess = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
  return maybeProcess?.env?.VITE_GA_MEASUREMENT_ID;

}

function isConsentGranted(): boolean {
  return readAnalyticsConsent() === "granted";
}

export function setAnalyticsConsent(granted: boolean) {
  writeAnalyticsConsent(granted ? "granted" : "denied");

  if (window.gtag) {
    window.gtag("consent", "update", {
      analytics_storage: granted ? "granted" : "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  }

  if (granted && !initialized) {
    initAnalytics({ force: true });
  }
}

export function initAnalytics(opts?: { force?: boolean }) {
  if (initialized) return;

  const measurementId = getMeasurementId();
  if (!measurementId) return;

  if (!opts?.force && !isConsentGranted()) {
    return;
  }

  initialized = true;

  // Load GA4 script
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag() {
      // Use the official gtag queue shape (IArguments), not arrays,
      // so gtag.js can consume queued calls reliably.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments as any);
    };

  window.gtag("js", new Date());
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag("config", measurementId, {
    send_page_view: false, // SPA: we do it manually on route changes
    anonymize_ip: true,
  });
}

export function trackPageView(path: string) {
  const measurementId = getMeasurementId();
  if (!measurementId) return;
  if (!isConsentGranted()) return;
  if (!initialized) initAnalytics();
  if (!window.gtag) return;

  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

export function trackEvent(name: string, params?: Record<string, unknown>) {
  const measurementId = getMeasurementId();
  if (!measurementId) return;
  if (!isConsentGranted()) return;
  if (!initialized) initAnalytics();
  if (!window.gtag) return;

  window.gtag("event", name, params ?? {});
}
