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
  BarChart3,
  Activity,
  Target,
  Shield,
  Clock,
  CheckCircle,
  XCircle,
  BookOpen,
  Lightbulb,
  FolderOpen,
  AlertCircle,
} from "lucide-react";

interface ExecutiveSummary {
  period: string;
  totalClaims: number;
  openClaims: number;
  closedClaims: number;
  deniedClaims: number;
  approvedClaims: number;
  overturnedDenials: number;
  supplementApprovals: number;
  totalRCV: number;
  totalACV: number;
  totalPayments: number;
  totalSupplementRequested: number;
  totalSupplementApproved: number;
  totalRecovered: number;
  revenueOpportunity: number;
}

interface TopRisk {
  label: string;
  count: number;
  recommendedAction: string;
}

interface TopOpportunity {
  label: string;
  count: number;
  recommendedAction: string;
}

interface CarrierPerf {
  carrier: string;
  claims: number;
  denialRate: number;
  approvalRate: number;
  confidence: number;
}

interface AdjusterPerf {
  adjusterId: string;
  adjusterName: string;
  claims: number;
  denialRate: number;
  approvalRate: number;
  confidence: number;
}

interface AgingBucket {
  age: string;
  count: number;
}

interface MissingDoc {
  document: string;
  count: number;
}

interface PlaybookPerf {
  pattern: string;
  label: string;
  confidence: number;
  sourceClaimCount: number;
}

interface ExecutiveIntelligence {
  executiveSummary: ExecutiveSummary;
  topRisks: TopRisk[];
  topOpportunities: TopOpportunity[];
  carrierPerformance: CarrierPerf[];
  adjusterPerformance: AdjusterPerf[];
  agingClaims: AgingBucket[];
  missingDocuments: MissingDoc[];
  recommendedActions: string[];
  playbookPerformance: PlaybookPerf[];
}

function formatDollar(n: number | undefined) {
  if (n === undefined || n === null) return "$0";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function ExecutiveDashboardPage() {
  const { data: auth } = useAuth();
  const billing = auth?.billing;

  const { data: intel, isLoading } = useQuery<ExecutiveIntelligence>({
    queryKey: ["/api/executive/intelligence"],
  });

  const s = intel?.executiveSummary;

  const execCards = [
    { label: "Total Claims", value: s?.totalClaims ?? 0, icon: FileText, color: "text-primary" },
    { label: "Open Claims", value: s?.openClaims ?? 0, icon: FolderOpen, color: "text-chart-3" },
    { label: "Denied Claims", value: s?.deniedClaims ?? 0, icon: XCircle, color: "text-destructive" },
    { label: "Overturned Denials", value: s?.overturnedDenials ?? 0, icon: RotateCcw, color: "text-green-500" },
    { label: "Supplement Approvals", value: s?.supplementApprovals ?? 0, icon: CheckCircle, color: "text-emerald-500" },
  ];

  const financialCards = [
    { label: "Total RCV", value: formatDollar(s?.totalRCV), icon: DollarSign, color: "text-primary" },
    { label: "Total Payments", value: formatDollar(s?.totalPayments), icon: DollarSign, color: "text-green-500" },
    { label: "Total Supplements", value: formatDollar(s?.totalSupplementApproved), icon: DollarSign, color: "text-emerald-500" },
    { label: "Revenue Opportunity", value: formatDollar(s?.revenueOpportunity), icon: TrendingUp, color: "text-chart-3" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-executive-dashboard-title">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back, {auth?.user.fullName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-primary/50 text-primary" data-testid="badge-executive-plan">
            <BarChart3 className="w-3 h-3 mr-1" />
            Executive Plan
          </Badge>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {execCards.map((stat) => (
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

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {financialCards.map((stat) => (
          <Card key={stat.label} data-testid={`card-fin-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="text-xl font-bold" data-testid={`text-fin-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  {stat.value}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold">Top Risks</CardTitle>
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              intel?.topRisks.map((risk, i) => (
                <div key={i} className="flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{risk.label}</p>
                    <p className="text-xs text-muted-foreground">{risk.recommendedAction}</p>
                    <Badge variant="outline" className="mt-1 text-xs">{risk.count} claims</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold">Top Opportunities</CardTitle>
            <Lightbulb className="w-4 h-4 text-chart-3" />
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              intel?.topOpportunities.map((opp, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Lightbulb className="w-4 h-4 text-chart-3 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{opp.label}</p>
                    <p className="text-xs text-muted-foreground">{opp.recommendedAction}</p>
                    <Badge variant="outline" className="mt-1 text-xs">{opp.count} claims</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold">Aging Claims</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              intel?.agingClaims.map((bucket, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm">{bucket.age}</span>
                  <Badge variant={bucket.count > 0 ? "default" : "outline"} className="text-xs">
                    {bucket.count} claims
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold">Carrier Performance</CardTitle>
            <Shield className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              intel?.carrierPerformance.map((carrier, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{carrier.carrier}</p>
                    <p className="text-xs text-muted-foreground">{carrier.claims} claims</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs text-green-500">{Math.round((carrier.approvalRate || 0) * 100)}% appr</Badge>
                    <Badge variant="outline" className="text-xs text-destructive">{Math.round((carrier.denialRate || 0) * 100)}% deny</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold">Adjuster Performance</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              intel?.adjusterPerformance.map((adj, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{adj.adjusterName}</p>
                    <p className="text-xs text-muted-foreground">{adj.claims} claims</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs text-green-500">{Math.round((adj.approvalRate || 0) * 100)}% appr</Badge>
                    <Badge variant="outline" className="text-xs text-destructive">{Math.round((adj.denialRate || 0) * 100)}% deny</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold">Missing Documents</CardTitle>
            <FolderOpen className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              intel?.missingDocuments.map((doc, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm">{doc.document}</span>
                  <Badge variant={doc.count > 0 ? "default" : "outline"} className="text-xs">{doc.count} missing</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold">Recommended Actions</CardTitle>
            <BookOpen className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              intel?.recommendedActions.map((action, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-sm">{action}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold">Playbook Patterns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              intel?.playbookPerformance.map((pb, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{pb.pattern}</p>
                    <p className="text-xs text-muted-foreground">{pb.label} &middot; {pb.sourceClaimCount} claims</p>
                  </div>
                  <Badge variant="outline" className="text-xs">{Math.round((pb.confidence || 0) * 100)}% confidence</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base font-semibold">Executive Quick Actions</CardTitle>
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
            <Link href="/carrier-intelligence">
              <Button variant="ghost" className="w-full justify-start" data-testid="button-carrier-intel">
                <Shield className="w-4 h-4 mr-2" />
                Carrier Intelligence
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
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base font-semibold">Executive Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Data Access</span>
            <Badge variant="default" className="text-xs">
              <Activity className="w-3 h-3 mr-1" />
              Aggregated Only
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
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Role</span>
            <Badge variant="outline" className="text-xs">
              <Target className="w-3 h-3 mr-1" />
              Executive Admin
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
