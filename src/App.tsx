import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserProfileProvider } from "@/contexts/UserProfileContext";
import { ProjectsProvider } from "@/contexts/ProjectsContext";
import { TripsProvider } from "@/contexts/TripsContext";
import { ReportsProvider } from "@/contexts/ReportsContext";
import { AppearanceProvider } from "@/contexts/AppearanceContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Trips from "./pages/Trips";
import Projects from "./pages/Projects";
import Reports from "./pages/Reports";
import ReportView from "./pages/ReportView";
import CalendarPage from "./pages/CalendarPage";
import Advanced from "./pages/Advanced";
import AdvancedRoutes from "./pages/AdvancedRoutes";
import AdvancedCosts from "./pages/AdvancedCosts";
import AdvancedEmissions from "./pages/AdvancedEmissions";
import Plans from "./pages/Plans";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";
import { RequireAuth } from "@/components/auth/RequireAuth";

import { DataMigration } from "@/components/DataMigration";

const queryClient = new QueryClient();

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
                  <BrowserRouter>
                    <Routes>
                      <Route path="/auth" element={<Auth />} />
                      <Route path="/auth/callback" element={<AuthCallback />} />
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
                        path="/plans"
                        element={
                          <RequireAuth>
                            <Plans />
                          </RequireAuth>
                        }
                      />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
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
