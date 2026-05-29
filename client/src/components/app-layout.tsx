import { type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation, Link, Redirect } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
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
  LogOut,
  Loader2,
  Lock,
  Users,
  UserCircle,
  AlertTriangle,
  FileSearch,
} from "lucide-react";
import logoImg from "@assets/claimsignal-logo.png";

const baseNavItems = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Claims", href: "/claims", icon: FileText },
  { title: "Evidence", href: "/evidence", icon: FileSearch },
  { title: "Clients", href: "/clients", icon: UserCircle },
  { title: "Adjusters", href: "/adjusters", icon: Users },
  { title: "Billing", href: "/billing", icon: CreditCard },
];

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

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-screen w-full">
        <Sidebar>
          <SidebarHeader className="p-4">
            <Link href="/" className="flex items-center gap-2">
              <img src={logoImg} alt="ClaimSignal" className="h-6 w-auto object-contain" data-testid="img-sidebar-logo" />
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {[...baseNavItems, ...(billing?.planType === "founder" ? [{ title: "Founding Partner Agreement", href: "/legal/founder", icon: Shield }] : [])].map((item) => {
                    const isActiveRoute = location === item.href || location.startsWith(item.href + "/");
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActiveRoute}
                          data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          <Link href={item.href}>
                            <item.icon className="w-4 h-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                  {(data.isPlatformOwner || data.user?.role === "super_admin") && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={location === "/admin"}
                        data-testid="nav-admin"
                      >
                        <Link href="/admin">
                          <Lock className="w-4 h-4" />
                          <span>Admin</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
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
                <p className="text-xs text-muted-foreground truncate">{data.org.name}</p>
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
              <Badge variant="outline" className="text-xs" data-testid="badge-header-plan">
                {billing?.planType === "founder" ? "Founding Partner" : billing?.planType ? billing.planType.charAt(0).toUpperCase() + billing.planType.slice(1) : 'Free'}
              </Badge>
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
