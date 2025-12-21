import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserProfileProvider } from "@/contexts/UserProfileContext";
import { ProjectsProvider } from "@/contexts/ProjectsContext";
import { TripsProvider } from "@/contexts/TripsContext";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <UserProfileProvider>
      <ProjectsProvider>
        <TripsProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/trips" element={<Trips />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/reports/view" element={<ReportView />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/advanced" element={<Advanced />} />
                <Route path="/advanced/routes" element={<AdvancedRoutes />} />
                <Route path="/advanced/costs" element={<AdvancedCosts />} />
                <Route path="/advanced/emissions" element={<AdvancedEmissions />} />
                <Route path="/plans" element={<Plans />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </TripsProvider>
      </ProjectsProvider>
    </UserProfileProvider>
  </QueryClientProvider>
);

export default App;
