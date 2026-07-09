import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserProfileProvider } from "@/contexts/UserProfileContext";
import { ProjectsProvider } from "@/contexts/ProjectsContext";
import { TripsProvider } from "@/contexts/TripsContext";
import { ReportsProvider } from "@/contexts/ReportsContext";
import { OdometerProvider } from "@/contexts/OdometerContext";
import { AppearanceProvider } from "@/contexts/AppearanceContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { PlanProvider } from "@/contexts/PlanContext";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AnalyticsListener } from "@/components/AnalyticsListener";
import { CookieConsentBanner } from "@/components/analytics/CookieConsentBanner";
import { DataMigration } from "@/components/DataMigration";
import { GlobalLoadingBar } from "@/components/app/GlobalLoadingBar";
import { NetworkStatusBanner } from "@/components/app/NetworkStatusBanner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { UpdatePrompt } from "@/components/pwa/UpdatePrompt";
import { Suspense, lazy, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { FEATURES } from "@/lib/features";

const Index = lazy(() => import("./pages/Index"));
const Trips = lazy(() => import("./pages/Trips"));
const Projects = lazy(() => import("./pages/Projects"));
const Reports = lazy(() => import("./pages/Reports"));
const ReportView = lazy(() => import("./pages/ReportView"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const Advanced = lazy(() => import("./pages/Advanced"));
const AdvancedRoutes = lazy(() => import("./pages/AdvancedRoutes"));
const AdvancedCosts = lazy(() => import("./pages/AdvancedCosts"));
const AdvancedEmissions = lazy(() => import("./pages/AdvancedEmissions"));
const Plans = lazy(() => import("./pages/Plans"));

const Docs = lazy(() => import("./pages/Docs"));
const LegalTerms = lazy(() => import("./pages/LegalTerms"));
const LegalPrivacy = lazy(() => import("./pages/LegalPrivacy"));
const LegalCookies = lazy(() => import("./pages/LegalCookies"));
const Auth = lazy(() => import("./pages/Auth"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const OdometerCapture = lazy(() => import("./pages/OdometerCapture"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// Layout route (Fase 5): un solo RequireAuth para todas las rutas protegidas
// en vez de 12 repeticiones.
function ProtectedLayout() {
  return (
    <RequireAuth>
      <Outlet />
    </RequireAuth>
  );
}

function AppContent() {
  const { language } = useI18n();

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AnalyticsListener />
      <CookieConsentBanner />
      <NetworkStatusBanner />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/auth/reset" element={<ResetPassword />} />
          {/* Public page — no auth required, token-based access */}
          {FEATURES.odometer && <Route path="/odometer-capture" element={<OdometerCapture />} />}

          <Route path="/legal/terms" element={<LegalTerms />} />
          <Route path="/legal/privacy" element={<LegalPrivacy />} />
          <Route path="/legal/cookies" element={<LegalCookies />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/trips" element={<Trips />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/reports/view" element={<ReportView />} />
            <Route path="/calendar" element={<CalendarPage />} />
            {FEATURES.advancedPages && (
              <>
                <Route path="/advanced" element={<Advanced />} />
                <Route path="/advanced/routes" element={<AdvancedRoutes />} />
                <Route path="/advanced/costs" element={<AdvancedCosts />} />
                <Route path="/advanced/emissions" element={<AdvancedEmissions />} />
              </>
            )}
            <Route path="/plans" element={<Plans />} />
            <Route path="/docs" element={<Docs />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppearanceProvider>
      <AuthProvider>
        <PlanProvider>
          <DataMigration />
          <UserProfileProvider>
            <ProjectsProvider>
              <TripsProvider>
                <OdometerProvider>
                <ReportsProvider>
                  <TooltipProvider>
                    <Sonner />
                    <UpdatePrompt />
                    <GlobalLoadingBar />
                    <AppContent />
                  </TooltipProvider>
                </ReportsProvider>
                </OdometerProvider>
              </TripsProvider>
            </ProjectsProvider>
          </UserProfileProvider>
        </PlanProvider>
      </AuthProvider>
    </AppearanceProvider>
  </QueryClientProvider>
);

export default App;
