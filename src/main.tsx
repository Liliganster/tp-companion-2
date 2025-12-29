import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSentryClient } from "@/lib/sentryClient";
import { initAnalytics } from "@/lib/analytics";
import { assertClientEnv } from "@/lib/envClient";

assertClientEnv();
initSentryClient();
initAnalytics();

createRoot(document.getElementById("root")!).render(<App />);
