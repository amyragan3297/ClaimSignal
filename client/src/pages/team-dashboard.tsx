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
  ArrowRight,
  AlertTriangle,
  DollarSign,
  RotateCcw,
  Shield,
  UserPlus,
  BarChart3,
} from "lucide-react";

export default function TeamDashboardPage() {
  const { data: auth } = useAuth();
  const billing = auth?.billing;
  const role = auth?.user.role;
  const isTeamAdmin = role === "team_admin";

  const { data: stats, isLoading } = useQuery<{
    totalClaims: number;
    openClaims: number;
    totalAdjusters: number;
    highRiskClaims: number;
    overturnedDenials: number;
    avgSupplementOpp: number;
  }>({
    queryKey: ["/api/dashboard/stats"],
  });

  const teamCards = [
    { label: "Team Claims", value: stats?.totalClaims ?? 0, icon: FileText, color: "text-primary" },
    { label: "High Risk Claims", value: stats?.highRiskClaims ?? 0, icon: AlertTriangle, color: "text-destructive" },
    { label: "Overturned Denials", value: stats?.overturnedDenials ?? 0, icon: RotateCcw, color: "text-green-500" },
    { label: "Adjuster Profiles", value: stats?.totalAdjusters ?? 0, icon: Users, color: "text-chart-4" },
    { label: "Avg Supplement Opp", value: stats?.avgSupplementOpp ? `$${stats.avgSupplementOpp.toLocaleString()}` : "$0", icon: DollarSign, color: "text-chart-3" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-team-dashboard-title">Team Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back, {auth?.user.fullName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" data-testid="badge-team-plan">
            {billing?.planType ? billing.planType.charAt(0).toUpperCase() + billing.planType.slice(1) : "Free"} Plan
          </Badge>
          {isTeamAdmin && (
            <Badge variant="default" className="text-xs" data-testid="badge-team-admin">
              <Shield className="w-3 h-3 mr-1" />
              Team Admin
            </Badge>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {teamCards.map((stat) => (
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
            <CardTitle className="text-base font-semibold">Team Quick Actions</CardTitle>
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
            {isTeamAdmin && (
              <Link href="/team-admin">
                <Button variant="ghost" className="w-full justify-start" data-testid="button-team-settings">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Team Settings
                  <ArrowRight className="w-4 h-4 ml-auto" />
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold">Team Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Your Role</span>
              <Badge variant="outline" className="text-xs capitalize">
                {role === "team_admin" ? "Team Admin" : "Team Member"}
              </Badge>
            </div>
            {isTeamAdmin && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Seat Usage</span>
                <Badge variant="outline" className="text-xs">
                  <BarChart3 className="w-3 h-3 mr-1" />
                  View Billing
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
