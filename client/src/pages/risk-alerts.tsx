import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Building2, Loader2, Users } from "lucide-react";
import { Link } from "wouter";
import type { Adjuster, Claim, ClaimAdjuster } from "@shared/schema";
import { authFetch } from "@/lib/api";

interface AdjusterWithScore extends Adjuster {
  riskScore: number;
  claimCount: number;
}

function calculateRiskScore(adjuster: Adjuster, claimCount: number): number {
  let score = 50; // Base score
  
  // Increase risk based on riskImpression content
  const impression = (adjuster.riskImpression || '').toLowerCase();
  if (impression.includes('difficult') || impression.includes('aggressive')) score += 15;
  if (impression.includes('unresponsive') || impression.includes('delay')) score += 10;
  if (impression.includes('denied') || impression.includes('rejection')) score += 10;
  if (impression.includes('lowball') || impression.includes('scope reduction')) score += 10;
  
  // Decrease risk for positive signals
  if (impression.includes('fair') || impression.includes('reasonable')) score -= 15;
  if (impression.includes('responsive') || impression.includes('cooperative')) score -= 10;
  if (impression.includes('approved') || impression.includes('professional')) score -= 10;
  
  // More claims = more data = more reliable score
  if (claimCount > 5) score += 5;
  
  // Clamp to 0-100
  return Math.max(0, Math.min(100, score));
}

function getRiskLevel(score: number): { label: string; color: string; bgColor: string } {
  if (score >= 75) return { label: 'High Risk', color: 'text-red-500', bgColor: 'bg-red-500' };
  if (score >= 60) return { label: 'Elevated', color: 'text-amber-500', bgColor: 'bg-amber-500' };
  if (score >= 40) return { label: 'Moderate', color: 'text-yellow-500', bgColor: 'bg-yellow-500' };
  return { label: 'Low Risk', color: 'text-green-500', bgColor: 'bg-green-500' };
}

export default function RiskAlertsPage() {
  const { data: adjustersData, isLoading: loadingAdjusters } = useQuery({
    queryKey: ["/api/adjusters"],
    queryFn: async () => {
      const res = await authFetch("/api/adjusters");
      if (!res.ok) throw new Error("Failed to load adjusters");
      return res.json();
    },
  });

  const { data: claimsData, isLoading: loadingClaims } = useQuery({
    queryKey: ["/api/claims"],
    queryFn: async () => {
      const res = await authFetch("/api/claims");
      if (!res.ok) throw new Error("Failed to load claims");
      return res.json();
    },
  });

  const { data: claimAdjustersData, isLoading: loadingClaimAdjusters } = useQuery({
    queryKey: ["/api/claim-adjusters"],
    queryFn: async () => {
      const res = await authFetch("/api/claim-adjusters");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const isLoading = loadingAdjusters || loadingClaims || loadingClaimAdjusters;
  const adjusters: Adjuster[] = adjustersData?.adjusters || adjustersData || [];
  const claims: Claim[] = claimsData?.claims || [];
  const claimAdjusters: ClaimAdjuster[] = claimAdjustersData || [];

  // Calculate claim counts per adjuster using the junction table
  const adjusterClaimCounts: Record<string, number> = {};
  claimAdjusters.forEach(ca => {
    adjusterClaimCounts[ca.adjusterId] = (adjusterClaimCounts[ca.adjusterId] || 0) + 1;
  });

  // Calculate risk scores for all adjusters
  const adjustersWithScores: AdjusterWithScore[] = adjusters.map(adj => ({
    ...adj,
    riskScore: calculateRiskScore(adj, adjusterClaimCounts[adj.id] || 0),
    claimCount: adjusterClaimCounts[adj.id] || 0,
  })).sort((a, b) => b.riskScore - a.riskScore);

  // Get high-risk adjusters (score >= 60)
  const highRiskAdjusters = adjustersWithScores.filter(a => a.riskScore >= 60);

  // Carrier breakdown
  const carrierCounts: Record<string, number> = {};
  adjusters.forEach(adj => {
    carrierCounts[adj.carrier] = (carrierCounts[adj.carrier] || 0) + 1;
  });
  const carrierBreakdown = Object.entries(carrierCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6" data-testid="risk-alerts-page">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            Risk Alerts
          </h1>
          <p className="text-muted-foreground">Monitor high-risk adjusters and carrier patterns</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Risk Alerts Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Risk Alerts
              </CardTitle>
              <Badge variant="destructive">{highRiskAdjusters.length}</Badge>
            </CardHeader>
            <CardContent>
              {highRiskAdjusters.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No high-risk adjusters detected</p>
              ) : (
                <div className="space-y-3">
                  {highRiskAdjusters.slice(0, 10).map((adjuster) => {
                    const risk = getRiskLevel(adjuster.riskScore);
                    return (
                      <Link key={adjuster.id} href={`/adjuster/${adjuster.id}`}>
                        <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                          <div className={`w-10 h-10 rounded-full ${risk.bgColor} flex items-center justify-center text-white font-bold text-sm`}>
                            {adjuster.riskScore}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{adjuster.name}</p>
                            <p className="text-sm text-muted-foreground">{adjuster.carrier}</p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Carrier Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Carrier Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {carrierBreakdown.map(([carrier, count]) => {
                  const maxCount = carrierBreakdown[0]?.[1] || 1;
                  const percentage = (count / maxCount) * 100;
                  return (
                    <div key={carrier} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Link href={`/carriers/${encodeURIComponent(carrier)}`}>
                          <span className="font-medium hover:underline cursor-pointer">{carrier}</span>
                        </Link>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Adjuster Risk Classification Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Adjuster Behavior Classification
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {[
                { label: 'RED (70-100)', color: 'bg-red-500', count: adjustersWithScores.filter(a => a.riskScore >= 70).length },
                { label: 'YELLOW (50-69)', color: 'bg-amber-500', count: adjustersWithScores.filter(a => a.riskScore >= 50 && a.riskScore < 70).length },
                { label: 'GREEN (0-49)', color: 'bg-green-500', count: adjustersWithScores.filter(a => a.riskScore < 50).length },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded ${item.color}`} />
                  <span className="text-sm font-medium">{item.label}: {item.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* All Adjusters by Risk */}
        <Card>
          <CardHeader>
            <CardTitle>All Adjusters by Risk Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {adjustersWithScores.map((adjuster) => {
                const risk = getRiskLevel(adjuster.riskScore);
                return (
                  <Link key={adjuster.id} href={`/adjuster/${adjuster.id}`}>
                    <div className="flex items-center gap-3 p-3 rounded-lg border hover:border-primary/50 transition-colors cursor-pointer">
                      <div className={`w-8 h-8 rounded-full ${risk.bgColor} flex items-center justify-center text-white font-bold text-xs`}>
                        {adjuster.riskScore}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{adjuster.name}</p>
                        <p className="text-xs text-muted-foreground">{adjuster.carrier}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
