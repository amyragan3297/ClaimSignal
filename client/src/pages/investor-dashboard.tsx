import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3,
  TrendingUp,
  Users,
  Shield,
  Lock,
  Activity,
  DollarSign,
  Target,
  Layers,
} from "lucide-react";

interface InvestorMetrics {
  totalUsers: number;
  totalOrgs: number;
  totalClaims: number;
  totalRevenue: number;
  mrr: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  churnRate: number;
  avgRevenuePerUser: number;
  topCarrier: string;
  topPlanType: string;
}

export default function InvestorDashboardPage() {
  const { data: auth } = useAuth();

  const { data: metrics, isLoading } = useQuery<InvestorMetrics>({
    queryKey: ["/api/executive/investor-safe"],
  });

  const kpiCards = [
    { label: "Total Users", value: metrics?.totalUsers ?? 0, icon: Users, color: "text-primary" },
    { label: "Organizations", value: metrics?.totalOrgs ?? 0, icon: Shield, color: "text-chart-4" },
    { label: "Total Claims", value: metrics?.totalClaims ?? 0, icon: BarChart3, color: "text-chart-3" },
    { label: "Total Revenue", value: metrics?.totalRevenue ? `$${metrics.totalRevenue.toLocaleString()}` : "$0", icon: DollarSign, color: "text-green-500" },
    { label: "MRR", value: metrics?.mrr ? `$${metrics.mrr.toLocaleString()}` : "$0", icon: TrendingUp, color: "text-chart-2" },
  ];

  const secondaryCards = [
    { label: "Active Subscriptions", value: metrics?.activeSubscriptions ?? 0, icon: Activity, color: "text-green-500" },
    { label: "Trialing", value: metrics?.trialingSubscriptions ?? 0, icon: Layers, color: "text-yellow-500" },
    { label: "Churn Rate", value: metrics?.churnRate ? `${(metrics.churnRate * 100).toFixed(1)}%` : "0%", icon: TrendingUp, color: "text-destructive" },
    { label: "ARPU", value: metrics?.avgRevenuePerUser ? `$${metrics.avgRevenuePerUser.toFixed(0)}` : "$0", icon: Target, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-investor-dashboard-title">Investor Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back, {auth?.user.fullName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-primary/50 text-primary" data-testid="badge-investor">
            <Lock className="w-3 h-3 mr-1" />
            Investor Access
          </Badge>
        </div>
      </div>

      {/* Primary KPIs */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpiCards.map((stat) => (
          <Card key={stat.label} data-testid={`card-kpi-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold" data-testid={`text-kpi-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  {stat.value}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Secondary KPIs */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {secondaryCards.map((stat) => (
          <Card key={stat.label} data-testid={`card-secondary-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold" data-testid={`text-secondary-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  {stat.value}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Insights Panel */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold">Platform Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Top Plan Type</span>
              <Badge variant="outline" className="text-xs capitalize">
                {metrics?.topPlanType || "N/A"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Most Active Carrier</span>
              <Badge variant="outline" className="text-xs">
                {metrics?.topCarrier || "N/A"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Data Access</span>
              <Badge variant="default" className="text-xs">
                <Lock className="w-3 h-3 mr-1" />
                Investor-Safe Only
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold">Investor Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              All metrics shown are aggregated and PII-free. No individual claim data, homeowner names, or addresses are exposed.
            </p>
            <p className="text-sm text-muted-foreground">
              Revenue figures are estimated based on subscription tier and seat count. Actual Stripe revenue may differ.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
