import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  FileText,
  Users,
  TrendingUp,
  Clock,
  ArrowRight,
  Shield,
  AlertTriangle,
} from "lucide-react";

export default function DashboardPage() {
  const { data: auth } = useAuth();

  const { data: stats, isLoading } = useQuery<{
    totalClaims: number;
    openClaims: number;
    totalAdjusters: number;
  }>({
    queryKey: ["/api/dashboard/stats"],
  });

  const hasSignedAgreement = !!auth?.founderAgreement;
  const billing = auth?.billing;
  const daysLeft = billing?.trialEndDate
    ? Math.max(0, Math.ceil((new Date(billing.trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const statCards = [
    { label: "Total Claims", value: stats?.totalClaims ?? 0, icon: FileText, color: "text-primary" },
    { label: "Open Claims", value: stats?.openClaims ?? 0, icon: Clock, color: "text-chart-3" },
    { label: "Adjusters", value: stats?.totalAdjusters ?? 0, icon: Users, color: "text-chart-4" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back, {auth?.user.fullName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" data-testid="badge-plan-type">
            {billing?.planType === "founder" ? "Founding Partner" : billing?.planType ? billing.planType.charAt(0).toUpperCase() + billing.planType.slice(1) : "Free"} Plan
          </Badge>
          {billing?.subscriptionStatus === "trialing" && daysLeft !== null && (
            <Badge variant="secondary" data-testid="badge-trial-status">
              {daysLeft} days left
            </Badge>
          )}
        </div>
      </div>

      {!hasSignedAgreement && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-destructive/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="font-medium text-sm">Founding Partner Agreement Required</p>
                <p className="text-xs text-muted-foreground">Sign the Founding Partner agreement to unlock full unmasked data access.</p>
              </div>
            </div>
            <Link href="/legal/founder">
              <Button size="sm" variant="destructive" data-testid="button-sign-agreement">
                Sign Now
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} data-testid={`card-stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold" data-testid={`text-stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  {stat.value}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/claims">
              <Button variant="ghost" className="w-full justify-start" data-testid="button-view-claims">
                <FileText className="w-4 h-4 mr-2" />
                View Claims
                <ArrowRight className="w-4 h-4 ml-auto" />
              </Button>
            </Link>
            <Link href="/adjusters">
              <Button variant="ghost" className="w-full justify-start" data-testid="button-view-adjusters">
                <Users className="w-4 h-4 mr-2" />
                View Adjusters
                <ArrowRight className="w-4 h-4 ml-auto" />
              </Button>
            </Link>
            <Link href="/billing">
              <Button variant="ghost" className="w-full justify-start" data-testid="button-manage-billing">
                <TrendingUp className="w-4 h-4 mr-2" />
                Manage Billing
                <ArrowRight className="w-4 h-4 ml-auto" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold">Platform Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Data Access</span>
              <Badge variant={hasSignedAgreement ? "default" : "secondary"} className="text-xs">
                {hasSignedAgreement ? "Full Access" : "Masked"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Subscription</span>
              <Badge variant="outline" className="text-xs capitalize">
                {billing?.subscriptionStatus || "inactive"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Organization</span>
              <span className="text-sm font-medium">{auth?.org.name}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
