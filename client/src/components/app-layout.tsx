import { type ReactNode } from "react";
import logoImg from "@assets/claimsignal_logo_transparent.png";
import { useAuth } from "@/lib/auth";
import { useLocation, Link, Redirect } from "wouter";
import type { LucideIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  FileText,
  CreditCard,
  Shield,
  LogOut,
  Loader2,
  Lock,
  Users,
  UserCircle,
  AlertTriangle,
  FileSearch,
  CloudLightning,
  Brain,
  Zap,
  Mic,
  MessageSquare,
  BarChart2,
  Building2,
  BookOpen,
} from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Master Admin",
  admin: "Admin",
  team_owner: "Team Admin",
  founder: "Founder",
  standard: "Individual",
  carrier_analyst: "Executive",
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const { data, isLoading, logout, stopImpersonation } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return <Redirect to="/login" />;
  }

  const billing = data.billing;
  const isActive = billing?.subscriptionStatus === "active";
  const isTrialing = billing?.subscriptionStatus === "trialing" && billing.trialEndDate && new Date(billing.trialEndDate) > new Date();
  const hasAccess = isActive || isTrialing || data.isPlatformOwner;

  if (!hasAccess && location !== "/billing") {
    return <Redirect to="/billing" />;
  }

  const role = data.user?.role ?? "standard";
  const isMaster = role === "super_admin" || data.isPlatformOwner;
  const isExecutive = role === "carrier_analyst";
  const roleLabel = ROLE_LABEL[role] ?? role;

  const planLabel = billing?.planType === "founder"
    ? "Founder"
    : billing?.planType
      ? billing.planType.charAt(0).toUpperCase() + billing.planType.slice(1)
      : "Free";

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  const initials = data.user.fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const daysLeft = billing?.trialEndDate
    ? Math.max(0, Math.ceil((new Date(billing.trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const isActive2 = (href: string) => location === href || location.startsWith(href + "/");

  const navItem = (title: string, href: string, Icon: LucideIcon, testId?: string) => (
    <SidebarMenuItem key={title}>
      <SidebarMenuButton asChild isActive={isActive2(href)} data-testid={testId ?? `nav-${title.toLowerCase().replace(/\s+/g, "-")}`}>
        <Link href={href}>
          <Icon className="w-4 h-4" />
          <span>{title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-screen w-full">
        <Sidebar>
          <SidebarHeader className="p-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex items-center" data-testid="img-sidebar-logo">
                <img src={logoImg} alt="ClaimSignal" className="h-10 w-auto object-contain" />
              </div>
            </Link>
          </SidebarHeader>

          <SidebarContent>
            {/* Core */}
            <SidebarGroup>
              <SidebarGroupLabel>Core</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItem("Dashboard", "/dashboard", LayoutDashboard)}
                  {!isExecutive && navItem("Claims", "/claims", FileText)}
                  {!isExecutive && navItem("Evidence", "/evidence", FileSearch)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Intelligence */}
            {!isExecutive && (
              <SidebarGroup>
                <SidebarGroupLabel>Intelligence</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navItem("Claim Intelligence", "/intelligence", Brain)}
                    {navItem("Carrier Intelligence", "/carrier-intelligence", Building2, "nav-carrier-intelligence")}
                    {navItem("Playbook Engine", "/playbooks", BookOpen, "nav-playbooks")}
                    {navItem("Signal Engine", "/signal-engine", Zap)}
                    {navItem("Adjusters", "/adjusters", Users)}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {/* Workflow */}
            {!isExecutive && (
              <SidebarGroup>
                <SidebarGroupLabel>Workflow</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navItem("Audio / Transcripts", "/audio", Mic)}
                    {navItem("Communications", "/communications", MessageSquare)}
                    {navItem("Storm Events", "/storm-events", CloudLightning)}
                    {navItem("Clients", "/clients", UserCircle)}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {/* Account */}
            <SidebarGroup>
              <SidebarGroupLabel>Account</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItem("Billing", "/billing", CreditCard)}
                  {(isMaster || isExecutive) && navItem("Executive Metrics", "/admin", BarChart2, "nav-executive-metrics")}
                  {isMaster && navItem("Admin", "/admin", Lock, "nav-admin")}
                  {billing?.planType === "founder" && navItem("Founder Agreement", "/legal/founder", Shield)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{data.user.fullName}</p>
                <p className="text-xs text-muted-foreground truncate">{roleLabel} · {data.org.name}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => logout()}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
              Log Out
            </Button>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col flex-1 min-w-0">
          {data.isImpersonation && (
            <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <span className="font-medium text-destructive">Impersonating: {data.user.fullName} ({data.org.name})</span>
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => stopImpersonation()}
                data-testid="button-stop-impersonation"
              >
                Stop Impersonation
              </Button>
            </div>
          )}
          <header className="flex items-center gap-2 p-3 border-b border-border/50 sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="ml-auto flex items-center gap-2">
              {billing?.subscriptionStatus === "trialing" && daysLeft !== null && (
                <Badge variant="outline" className="text-xs" data-testid="badge-trial-days">
                  {daysLeft} days left in trial
                </Badge>
              )}
              {isMaster ? (
                <Badge variant="outline" className="text-xs font-semibold" data-testid="badge-header-plan">
                  Role: {roleLabel}
                </Badge>
              ) : (
                <>
                  <Badge variant="outline" className="text-xs" data-testid="badge-header-plan">
                    Plan: {planLabel}
                  </Badge>
                  <Badge variant="outline" className="text-xs" data-testid="badge-header-role">
                    Role: {roleLabel}
                  </Badge>
                </>
              )}
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
