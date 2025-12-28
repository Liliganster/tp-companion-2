declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: any[]) => void;
  }
}

let initialized = false;

export function initAnalytics() {
  if (initialized) return;
  initialized = true;

  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
  if (!measurementId) return;

  // Load GA4 script
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag(...args: any[]) {
      window.dataLayer!.push(args);
    };

  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false, // SPA: we do it manually on route changes
    anonymize_ip: true,
  });
}

export function trackPageView(path: string) {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
  if (!measurementId) return;
  if (!initialized) initAnalytics();
  if (!window.gtag) return;

  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

export function trackEvent(name: string, params?: Record<string, unknown>) {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
  if (!measurementId) return;
  if (!initialized) initAnalytics();
  if (!window.gtag) return;

  window.gtag("event", name, params ?? {});
}

