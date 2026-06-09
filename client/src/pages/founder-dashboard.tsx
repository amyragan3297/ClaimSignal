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
  AlertTriangle,
  DollarSign,
  RotateCcw,
  ArrowRight,
  TrendingUp,
  Award,
  Lock,
  Unlock,
} from "lucide-react";

export default function FounderDashboardPage() {
  const { data: auth } = useAuth();
  const billing = auth?.billing;
  const hasSignedAgreement = !!auth?.founderAgreement;
  const daysLeft = billing?.trialEndDate
    ? Math.max(0, Math.ceil((new Date(billing.trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

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

  const founderCards = [
    { label: "Founding Partner Claims", value: stats?.totalClaims ?? 0, icon: FileText, color: "text-primary" },
    { label: "High Risk Claims", value: stats?.highRiskClaims ?? 0, icon: AlertTriangle, color: "text-destructive" },
    { label: "Overturned Denials", value: stats?.overturnedDenials ?? 0, icon: RotateCcw, color: "text-green-500" },
    { label: "Adjuster Profiles", value: stats?.totalAdjusters ?? 0, icon: Users, color: "text-chart-4" },
    { label: "Avg Supplement Opp", value: stats?.avgSupplementOpp ? `$${stats.avgSupplementOpp.toLocaleString()}` : "$0", icon: DollarSign, color: "text-chart-3" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-founder-dashboard-title">Founding Partner Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back, {auth?.user.fullName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-primary/50 text-primary" data-testid="badge-founder-plan">
            <Award className="w-3 h-3 mr-1" />
            Founding Partner
          </Badge>
          {billing?.subscriptionStatus === "trialing" && daysLeft !== null && (
            <Badge variant="secondary" data-testid="badge-trial-status">
              {daysLeft} days left
            </Badge>
          )}
        </div>
      </div>

      {/* Founder Agreement Banner */}
      <Card className={hasSignedAgreement ? "border-primary/30 bg-primary/5" : "border-destructive/50"}>
        <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-md flex items-center justify-center ${hasSignedAgreement ? "bg-primary/10" : "bg-destructive/10"}`}>
              {hasSignedAgreement ? (
                <Unlock className="w-5 h-5 text-primary" />
              ) : (
                <Lock className="w-5 h-5 text-destructive" />
              )}
            </div>
            <div>
              <p className="font-medium text-sm">
                {hasSignedAgreement ? "Founding Partner Agreement Signed" : "Founding Partner Agreement Required"}
              </p>
              <p className="text-xs text-muted-foreground">
                {hasSignedAgreement
                  ? "You have full access to unmasked data and all founder features."
                  : "Sign the agreement to unlock full unmasked data access and premium features."}
              </p>
            </div>
          </div>
          {!hasSignedAgreement && (
            <Link href="/legal/founder">
              <Button size="sm" variant="destructive" data-testid="button-sign-agreement">
                Sign Now
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {founderCards.map((stat) => (
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
            <CardTitle className="text-base font-semibold">Founder Quick Actions</CardTitle>
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
            <CardTitle className="text-base font-semibold">Founder Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Data Access</span>
              <Badge variant={hasSignedAgreement ? "default" : "secondary"} className="text-xs">
                {hasSignedAgreement ? "Full Unmasked" : "Masked"}
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
              <span className="text-sm text-muted-foreground">Founder Rate</span>
              <Badge variant="outline" className="text-xs text-primary">
                $79/mo locked for life
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
