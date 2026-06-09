import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  RotateCcw,
  Target,
  ArrowRight,
  BarChart3,
  Shield,
} from "lucide-react";

interface RevenueAlert {
  alertType: string;
  claimId: string;
  claimNumber?: string;
  estimatedImpact: number;
  confidence: number;
  recommendedAction: string;
  urgency: "low" | "medium" | "high";
}

interface RevenueSummary {
  totalPotential: number;
  totalConfirmed: number;
  underpaidCount: number;
  depCount: number;
  supplementCount: number;
  claimCount: number;
}

export default function RevenueIntelligencePage() {
  useAuth();
  const { data: summary, isLoading: summaryLoading } = useQuery<RevenueSummary>({
    queryKey: ["/api/revenue/summary"],
  });

  const { data: alertsData, isLoading: alertsLoading } = useQuery<{ alerts: RevenueAlert[] }>({
    queryKey: ["/api/revenue/alerts"],
  });

  const kpiCards = [
    {
      label: "Total Potential Recovery",
      value: summary?.totalPotential ? `$${summary.totalPotential.toLocaleString()}` : "$0",
      icon: DollarSign,
      color: "text-green-500",
      desc: "Underpayments + depreciation + pending supplements",
    },
    {
      label: "Confirmed Recovery",
      value: summary?.totalConfirmed ? `$${summary.totalConfirmed.toLocaleString()}` : "$0",
      icon: TrendingUp,
      color: "text-primary",
      desc: "Already approved supplement amounts",
    },
    {
      label: "Underpaid Claims",
      value: summary?.underpaidCount ?? 0,
      icon: AlertTriangle,
      color: "text-destructive",
      desc: "Claims with RCV − paid − deductible > $1,000",
    },
    {
      label: "Depreciation Opportunities",
      value: summary?.depCount ?? 0,
      icon: RotateCcw,
      color: "text-chart-4",
      desc: "Claims with recoverable depreciation > 0",
    },
    {
      label: "Pending Supplements",
      value: summary?.supplementCount ?? 0,
      icon: Target,
      color: "text-chart-3",
      desc: "Supplements submitted but not yet approved",
    },
  ];

  const alerts = alertsData?.alerts ?? [];
  const highUrgency = alerts.filter((a) => a.urgency === "high");
  const mediumUrgency = alerts.filter((a) => a.urgency === "medium");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-revenue-title">Revenue Intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Identify underpaid claims, supplement opportunities, and recoverable depreciation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-primary/50 text-primary" data-testid="badge-revenue">
            <BarChart3 className="w-3 h-3 mr-1" />
            Revenue Intelligence
          </Badge>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpiCards.map((stat) => (
          <Card key={stat.label} data-testid={`card-kpi-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              {summaryLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold" data-testid={`text-kpi-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  {stat.value}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">{stat.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alert Summary */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm text-muted-foreground">Total Alerts</span>
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold">{alerts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm text-muted-foreground">High Urgency</span>
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </div>
            <p className="text-2xl font-bold text-destructive">{highUrgency.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm text-muted-foreground">Medium Urgency</span>
              <Target className="w-4 h-4 text-chart-3" />
            </div>
            <p className="text-2xl font-bold">{mediumUrgency.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Alert List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base font-semibold">Revenue Alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {alertsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No revenue alerts detected. All claims appear to be fully paid or have no recoverable opportunities.</p>
          ) : (
            alerts.map((alert) => (
              <div
                key={`${alert.alertType}-${alert.claimId}`}
                className="flex items-start justify-between gap-4 p-3 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors"
                data-testid={`alert-${alert.alertType}-${alert.claimId}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant={alert.urgency === "high" ? "destructive" : alert.urgency === "medium" ? "default" : "secondary"}
                      className="text-xs capitalize"
                    >
                      {alert.urgency}
                    </Badge>
                    <span className="text-sm font-medium capitalize">{alert.alertType.replace(/_/g, " ")}</span>
                    {alert.claimNumber && (
                      <span className="text-xs text-muted-foreground">{alert.claimNumber}</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{alert.recommendedAction}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">
                      Est. Impact: <span className="font-medium text-green-500">${alert.estimatedImpact.toLocaleString()}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Confidence: {Math.round(alert.confidence * 100)}%
                    </span>
                  </div>
                </div>
                <Link href={`/claims/${alert.claimId}`}>
                  <ArrowRight className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" />
                </Link>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
