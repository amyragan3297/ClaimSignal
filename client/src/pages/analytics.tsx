import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, TrendingUp, TrendingDown, Users, FileText, Building2, Clock, AlertTriangle, CheckCircle, BarChart3, FileCheck, RefreshCw, ArrowUpRight, Loader2, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { fetchAdjusters, fetchClaims, authFetch } from "@/lib/api";

interface PerformanceSummary {
  supplementSuccessRate: number | null;
  reinspectionWinRate: number | null;
  escalationSuccessRate: number | null;
  avgDaysToApproval: number | null;
  totalSupplements: number;
  totalReinspections: number;
  totalEscalations: number;
}

export default function Analytics() {
  const [, setLocation] = useLocation();
  
  const { data: adjusters = [] } = useQuery({
    queryKey: ['adjusters'],
    queryFn: fetchAdjusters,
  });

  const { data: claims = [] } = useQuery({
    queryKey: ['claims'],
    queryFn: fetchClaims,
  });

  const { data: performanceSummary, isLoading: loadingPerformance } = useQuery<PerformanceSummary>({
    queryKey: ['performance-summary'],
    queryFn: async () => {
      const res = await authFetch('/api/analytics/performance-summary');
      if (!res.ok) throw new Error('Failed to fetch performance summary');
      return res.json();
    },
  });

  const carriers = Array.from(new Set(adjusters.map((a: any) => a.carrier?.trim()).filter(Boolean)));
  
  const openClaims = claims.filter((c: any) => c.status === 'open').length;
  const resolvedClaims = claims.filter((c: any) => c.status === 'resolved').length;
  const stalledClaims = claims.filter((c: any) => c.status === 'stalled').length;

  const highRiskAdjusters = adjusters.filter((a: any) => 
    a.riskImpression?.toLowerCase().includes('high')
  ).length;

  const carrierStats = carriers.map(carrier => {
    const carrierAdjusters = adjusters.filter((a: any) => a.carrier?.trim() === carrier);
    const carrierClaims = claims.filter((c: any) => c.carrier?.trim() === carrier);
    return {
      name: carrier,
      adjusters: carrierAdjusters.length,
      claims: carrierClaims.length,
      open: carrierClaims.filter((c: any) => c.status === 'open').length,
      resolved: carrierClaims.filter((c: any) => c.status === 'resolved').length,
    };
  }).sort((a, b) => b.claims - a.claims);

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <LayoutDashboard className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
            <p className="text-muted-foreground">Overview of your claims intelligence data</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Adjusters</p>
                  <p className="text-3xl font-bold">{adjusters.length}</p>
                </div>
                <div className="bg-blue-500/10 p-3 rounded-full">
                  <Users className="w-6 h-6 text-blue-500" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-sm">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-emerald-500">{highRiskAdjusters} high risk</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Claims</p>
                  <p className="text-3xl font-bold">{claims.length}</p>
                </div>
                <div className="bg-purple-500/10 p-3 rounded-full">
                  <FileText className="w-6 h-6 text-purple-500" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>{openClaims} open</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Carriers Tracked</p>
                  <p className="text-3xl font-bold">{carriers.length}</p>
                </div>
                <div className="bg-orange-500/10 p-3 rounded-full">
                  <Building2 className="w-6 h-6 text-orange-500" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
                <BarChart3 className="w-4 h-4" />
                <span>Across all regions</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Resolution Rate</p>
                  <p className="text-3xl font-bold">
                    {claims.length > 0 ? Math.round((resolvedClaims / claims.length) * 100) : 0}%
                  </p>
                </div>
                <div className="bg-emerald-500/10 p-3 rounded-full">
                  <CheckCircle className="w-6 h-6 text-emerald-500" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-sm">
                {stalledClaims > 0 ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    <span className="text-yellow-500">{stalledClaims} stalled</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">All claims progressing</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance Summary KPIs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Performance Summary
            </CardTitle>
            <CardDescription>Key success metrics across all claims and adjusters</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingPerformance ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : performanceSummary ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 mb-2">
                    <FileCheck className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-medium text-muted-foreground">Supplement Success</span>
                  </div>
                  <div className="text-3xl font-bold" data-testid="perf-supplement-success">
                    {performanceSummary.supplementSuccessRate !== null ? `${performanceSummary.supplementSuccessRate}%` : '—'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{performanceSummary.totalSupplements} total supplements</p>
                </div>

                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium text-muted-foreground">Re-inspection Win</span>
                  </div>
                  <div className="text-3xl font-bold" data-testid="perf-reinspection-win">
                    {performanceSummary.reinspectionWinRate !== null ? `${performanceSummary.reinspectionWinRate}%` : '—'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{performanceSummary.totalReinspections} total inspections</p>
                </div>

                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowUpRight className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium text-muted-foreground">Escalation Success</span>
                  </div>
                  <div className="text-3xl font-bold" data-testid="perf-escalation-success">
                    {performanceSummary.escalationSuccessRate !== null ? `${performanceSummary.escalationSuccessRate}%` : '—'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{performanceSummary.totalEscalations} total escalations</p>
                </div>

                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-purple-500" />
                    <span className="text-sm font-medium text-muted-foreground">Avg Time to Approval</span>
                  </div>
                  <div className="text-3xl font-bold" data-testid="perf-avg-approval-time">
                    {performanceSummary.avgDaysToApproval !== null ? `${performanceSummary.avgDaysToApproval}d` : '—'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">for resolved claims</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">No performance data available</p>
            )}
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Claims by Status</CardTitle>
              <CardDescription>Current distribution of claim statuses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Open</span>
                    <span className="text-muted-foreground">{openClaims}</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${claims.length > 0 ? (openClaims / claims.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Resolved</span>
                    <span className="text-muted-foreground">{resolvedClaims}</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${claims.length > 0 ? (resolvedClaims / claims.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Stalled</span>
                    <span className="text-muted-foreground">{stalledClaims}</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-yellow-500 rounded-full transition-all"
                      style={{ width: `${claims.length > 0 ? (stalledClaims / claims.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Carrier Breakdown</CardTitle>
              <CardDescription>Claims and adjusters by carrier</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {carrierStats.slice(0, 5).map((carrier, i) => (
                  <div 
                    key={i} 
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/70 transition-colors group"
                    onClick={() => setLocation(`/carriers/${encodeURIComponent(carrier.name)}`)}
                    data-testid={`carrier-card-${carrier.name.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <div>
                      <p className="font-medium">{carrier.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {carrier.adjusters} adjusters • {carrier.claims} claims
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-blue-500 border-blue-500/30">
                        {carrier.open} open
                      </Badge>
                      <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
                        {carrier.resolved} resolved
                      </Badge>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                  </div>
                ))}
                {carrierStats.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No carrier data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Adjuster Risk Distribution</CardTitle>
            <CardDescription>Overview of adjuster difficulty levels</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-3 gap-4">
              {['low', 'medium', 'high'].map((risk) => {
                const count = adjusters.filter((a: any) => 
                  a.riskImpression?.toLowerCase().includes(risk)
                ).length;
                const percentage = adjusters.length > 0 ? Math.round((count / adjusters.length) * 100) : 0;
                
                return (
                  <div 
                    key={risk}
                    className={`p-4 rounded-lg border ${
                      risk === 'low' ? 'border-emerald-500/30 bg-emerald-500/5' :
                      risk === 'medium' ? 'border-yellow-500/30 bg-yellow-500/5' :
                      'border-red-500/30 bg-red-500/5'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {risk === 'high' && <AlertTriangle className="w-5 h-5 text-red-500" />}
                      {risk === 'medium' && <Clock className="w-5 h-5 text-yellow-500" />}
                      {risk === 'low' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                      <span className="font-medium capitalize">{risk} Risk</span>
                    </div>
                    <p className="text-3xl font-bold">{count}</p>
                    <p className="text-sm text-muted-foreground">{percentage}% of adjusters</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
