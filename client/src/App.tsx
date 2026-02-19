import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import Homepage from "@/pages/homepage";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import ClaimsPage from "@/pages/claims";
import ClaimDetailPage from "@/pages/claim-detail";
import ClientsPage from "@/pages/clients";
import BillingPage from "@/pages/billing";
import FounderLegalPage from "@/pages/founder-legal";
import AdminPage from "@/pages/admin";
import AdjustersPage from "@/pages/adjusters";
import AppLayout from "@/components/app-layout";
import { useEffect } from "react";

function AppRoutes() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/claims" component={ClaimsPage} />
        <Route path="/claims/:id" component={ClaimDetailPage} />
        <Route path="/clients" component={ClientsPage} />
        <Route path="/adjusters" component={AdjustersPage} />
        <Route path="/billing" component={BillingPage} />
        <Route path="/legal/founder" component={FounderLegalPage} />
        <Route path="/admin" component={AdminPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Homepage} />
      <Route path="/login" component={LoginPage} />
      <Route>
        <AppRoutes />
      </Route>
    </Switch>
  );
}

function DarkModeInit() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <DarkModeInit />
          <Router />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
