import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserProfileProvider } from "@/contexts/UserProfileContext";
import { ProjectsProvider } from "@/contexts/ProjectsContext";
import { TripsProvider } from "@/contexts/TripsContext";
import { ReportsProvider } from "@/contexts/ReportsContext";
import { AppearanceProvider } from "@/contexts/AppearanceContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AnalyticsListener } from "@/components/AnalyticsListener";
import { CookieConsentBanner } from "@/components/analytics/CookieConsentBanner";
import { DataMigration } from "@/components/DataMigration";
import { GlobalLoadingBar } from "@/components/app/GlobalLoadingBar";
import { NetworkStatusBanner } from "@/components/app/NetworkStatusBanner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { UpdatePrompt } from "@/components/pwa/UpdatePrompt";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

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

const Docs = lazy(() => import("./pages/Docs"));
const LegalTerms = lazy(() => import("./pages/LegalTerms"));
const LegalPrivacy = lazy(() => import("./pages/LegalPrivacy"));
const LegalCookies = lazy(() => import("./pages/LegalCookies"));
const Auth = lazy(() => import("./pages/Auth"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppearanceProvider>
      <AuthProvider>
        <DataMigration />
        <UserProfileProvider>
          <ProjectsProvider>
            <TripsProvider>
              <ReportsProvider>
                <TooltipProvider>
                  <Sonner />
                  <UpdatePrompt />
                  <GlobalLoadingBar />
                  <BrowserRouter>
                    <AnalyticsListener />
                    <CookieConsentBanner />
                    <NetworkStatusBanner />
                    <Suspense fallback={<RouteFallback />}>
                      <Routes>
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/auth/callback" element={<AuthCallback />} />
                        <Route path="/auth/reset" element={<ResetPassword />} />

                        <Route path="/legal/terms" element={<LegalTerms />} />
                        <Route path="/legal/privacy" element={<LegalPrivacy />} />
                        <Route path="/legal/cookies" element={<LegalCookies />} />
                        <Route
                          path="/"
                          element={
                            <RequireAuth>
                              <Index />
                            </RequireAuth>
                          }
                        />
                        <Route
                          path="/trips"
                          element={
                            <RequireAuth>
                              <Trips />
                            </RequireAuth>
                          }
                        />
                        <Route
                          path="/projects"
                          element={
                            <RequireAuth>
                              <Projects />
                            </RequireAuth>
                          }
                        />
                        <Route
                          path="/reports"
                          element={
                            <RequireAuth>
                              <Reports />
                            </RequireAuth>
                          }
                        />
                        <Route
                          path="/reports/view"
                          element={
                            <RequireAuth>
                              <ReportView />
                            </RequireAuth>
                          }
                        />
                        <Route
                          path="/calendar"
                          element={
                            <RequireAuth>
                              <CalendarPage />
                            </RequireAuth>
                          }
                        />
                        <Route
                          path="/advanced"
                          element={
                            <RequireAuth>
                              <Advanced />
                            </RequireAuth>
                          }
                        />
                        <Route
                          path="/advanced/routes"
                          element={
                            <RequireAuth>
                              <AdvancedRoutes />
                            </RequireAuth>
                          }
                        />
                        <Route
                          path="/advanced/costs"
                          element={
                            <RequireAuth>
                              <AdvancedCosts />
                            </RequireAuth>
                          }
                        />
                        <Route
                          path="/advanced/emissions"
                          element={
                            <RequireAuth>
                              <AdvancedEmissions />
                            </RequireAuth>
                          }
                        />

                        <Route
                          path="/docs"
                          element={
                            <RequireAuth>
                              <Docs />
                            </RequireAuth>
                          }
                        />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                  </BrowserRouter>
                </TooltipProvider>
              </ReportsProvider>
            </TripsProvider>
          </ProjectsProvider>
        </UserProfileProvider>
      </AuthProvider>
    </AppearanceProvider>
  </QueryClientProvider>
);

export default App;
