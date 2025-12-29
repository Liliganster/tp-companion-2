import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSentryClient } from "@/lib/sentryClient";
import { initAnalytics } from "@/lib/analytics";
import { assertClientEnv } from "@/lib/envClient";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

assertClientEnv();
initSentryClient();
initAnalytics();

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
