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
import FounderDashboardPage from "@/pages/founder-dashboard";
import ExecutiveDashboardPage from "@/pages/executive-dashboard";
import TeamDashboardPage from "@/pages/team-dashboard";
import IndividualDashboardPage from "@/pages/individual-dashboard";
import InvestorDashboardPage from "@/pages/investor-dashboard";
import ClaimsPage from "@/pages/claims";
import ClaimDetailPage from "@/pages/claim-detail";
import BillingPage from "@/pages/billing";
import FounderLegalPage from "@/pages/founder-legal";
import AdminPage from "@/pages/admin";
import AdjustersPage from "@/pages/adjusters";
import AdjusterReportPage from "@/pages/adjuster-report";
import EvidencePage from "@/pages/evidence";
import StormEventsPage from "@/pages/storm-events";
import SignalEnginePage from "@/pages/signal-engine";
import AudioPage from "@/pages/audio";
import CommunicationsPage from "@/pages/communications";
import IntelligencePage from "@/pages/intelligence";
import CarrierIntelligencePage from "@/pages/carrier-intelligence";
import PlaybooksPage from "@/pages/playbooks";
import RiskMapPage from "@/pages/risk-map";
import BrandAssetsPage from "@/pages/brand-assets";
import PricingPage from "@/pages/pricing";
import FoundingPartnerApplyPage from "@/pages/founding-partner-apply";
import EnterpriseContactPage from "@/pages/enterprise-contact";
import FounderAccessPage from "@/pages/founder-access";
import InvestorAccessPage from "@/pages/investor-access";
import InvestorPage from "@/pages/investor";
import TermsPage from "@/pages/terms";
import IdentityResolutionPage from "@/pages/identity-resolution";
import RevenueIntelligencePage from "@/pages/revenue-intelligence";
import AppLayout from "@/components/app-layout";
import { useEffect } from "react";

function AppRoutes() {
  return (
    <AppLayout>
      <Switch>
        {/* Role-specific dashboards */}
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/founder" component={FounderDashboardPage} />
        <Route path="/executive" component={ExecutiveDashboardPage} />
        <Route path="/team-admin" component={TeamDashboardPage} />
        <Route path="/individual" component={IndividualDashboardPage} />
        <Route path="/investor" component={InvestorDashboardPage} />
        {/* Master & Admin routes */}
        <Route path="/admin" component={AdminPage} />
        <Route path="/master" component={AdminPage} />
        {/* Core pages */}
        <Route path="/claims" component={ClaimsPage} />
        <Route path="/claims/:id" component={ClaimDetailPage} />
        <Route path="/evidence" component={EvidencePage} />
        <Route path="/storm-events" component={StormEventsPage} />
        <Route path="/intelligence" component={IntelligencePage} />
        <Route path="/carrier-intelligence" component={CarrierIntelligencePage} />
        <Route path="/playbooks" component={PlaybooksPage} />
        <Route path="/risk-map" component={RiskMapPage} />
        <Route path="/signal-engine" component={SignalEnginePage} />
        <Route path="/audio" component={AudioPage} />
        <Route path="/communications" component={CommunicationsPage} />
        <Route path="/adjusters/:id/report" component={AdjusterReportPage} />
        <Route path="/adjusters" component={AdjustersPage} />
        <Route path="/billing" component={BillingPage} />
        <Route path="/brand-assets" component={BrandAssetsPage} />
        <Route path="/identity-resolution" component={IdentityResolutionPage} />
        <Route path="/revenue" component={RevenueIntelligencePage} />
        <Route path="/legal/founder" component={FounderLegalPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Homepage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/founding-partner-apply" component={FoundingPartnerApplyPage} />
      <Route path="/enterprise-contact" component={EnterpriseContactPage} />
      <Route path="/founder-access" component={FounderAccessPage} />
      <Route path="/investor-access" component={InvestorAccessPage} />
      <Route path="/investor-relations" component={InvestorPage} />
      <Route path="/terms" component={TermsPage} />
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
