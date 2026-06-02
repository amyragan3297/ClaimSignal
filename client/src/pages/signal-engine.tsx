/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  AlertTriangle, TrendingUp, FileX, Users, Zap, ChevronRight,
  AlertCircle, CheckCircle, Clock, Shield, Activity, ArrowRight,
} from "lucide-react";
import type { Claim, Adjuster } from "@shared/schema";

function riskLevel(score: number | null | undefined): { label: string; color: string; badge: string } {
  const s = score ?? 0;
  if (s >= 7) return { label: "High", color: "text-red-500", badge: "destructive" };
  if (s >= 4) return { label: "Medium", color: "text-yellow-500", badge: "secondary" };
  return { label: "Low", color: "text-green-500", badge: "outline" };
}

function escalationReadiness(claim: Claim): number {
  let score = 0;
  if ((claim.escalationLevel ?? 0) >= 2) score += 30;
  if ((claim.frictionScore ?? 0) >= 6) score += 25;
  if (claim.status === "denied" || claim.status === "escalated") score += 25;
  if ((claim.supplementAmountTotal ?? 0) > 0) score += 10;
  if ((claim.scopeDeltaScore ?? 0) >= 40) score += 10;
  return Math.min(score, 100);
}

function getMissingDocs(claim: Claim): string[] {
  const missing: string[] = [];
  if (!claim.rcvAmount) missing.push("RCV estimate");
  if (!claim.acvAmount) missing.push("ACV determination");
  if (!claim.inspectionDate) missing.push("Inspection report");
  if (claim.status === "denied") missing.push("Denial letter response");
  if ((claim.supplementAmountTotal ?? 0) > 0 && !claim.determinationDate) missing.push("Supplement determination");
  return missing;
}

function nextBestAction(claim: Claim): string {
  if (claim.status === "denied") return "Prepare reinspection packet and appeal documentation";
  if (claim.status === "escalated") return "File formal escalation with carrier — documentation pressure recommended";
  if ((claim.supplementAmountTotal ?? 0) > 0 && claim.status === "open") return "Follow up on pending supplement — track carrier response timeline";
  if (!claim.inspectionDate) return "Schedule inspection and collect photo documentation";
  if ((claim.frictionScore ?? 0) >= 6) return "Adjuster friction detected — consider escalation or supervisor contact";
  return "Monitor claim status and maintain communication log";
}

export default function SignalEnginePage() {
  const { data: claims, isLoading: claimsLoading } = useQuery<Claim[]>({ queryKey: ["/api/claims"] });
  const { data: adjusters } = useQuery<Adjuster[]>({ queryKey: ["/api/adjusters"] });

  const highRisk = claims?.filter(c => (c.riskScore ?? 0) >= 7 || (c.frictionScore ?? 0) >= 7 || c.status === "denied" || c.status === "escalated") ?? [];
  const mediumRisk = claims?.filter(c => !highRisk.includes(c) && ((c.riskScore ?? 0) >= 4 || (c.frictionScore ?? 0) >= 4)) ?? [];
  const lowRisk = claims?.filter(c => !highRisk.includes(c) && !mediumRisk.includes(c)) ?? [];

  const scoredClaims = claims?.filter(c => (c.frictionScore ?? 0) > 0) ?? [];
  const avgFriction = scoredClaims.length
    ? (scoredClaims.reduce((s, c) => s + (c.frictionScore ?? 0), 0) / scoredClaims.length).toFixed(1)
    : "—";

  const deniedCount = claims?.filter(c => c.status === "denied").length ?? 0;
  const escalatedCount = claims?.filter(c => c.status === "escalated" || (c.escalationLevel ?? 0) >= 3).length ?? 0;
  const highFrictionAdjusters = adjusters?.filter(a => (a.frictionScore ?? 0) >= 6) ?? [];

  return (
    <div className="space-y-6" data-testid="page-signal-engine">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-signal-engine-title">Signal Engine</h1>
        <p className="text-sm text-muted-foreground">Real-time claim risk signals, escalation readiness, and recommended actions</p>
      </div>

      {/* Platform-Wide Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "High Risk Claims", value: highRisk.length, icon: AlertTriangle, color: "text-red-500", testId: "stat-high-risk" },
          { label: "Active Escalations", value: escalatedCount, icon: Zap, color: "text-orange-500", testId: "stat-escalations" },
          { label: "Avg Friction Score", value: avgFriction, icon: Activity, color: "text-yellow-500", testId: "stat-avg-friction" },
          { label: "Denied Claims", value: deniedCount, icon: FileX, color: "text-destructive", testId: "stat-denied" },
        ].map(s => (
          <Card key={s.label} data-testid={s.testId}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <div className="text-2xl font-bold">{claimsLoading ? <Skeleton className="h-6 w-10" /> : s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Risk Distribution */}
      <div className="grid md:grid-cols-3 gap-4">
        {[
          { label: "High Risk", claims: highRisk, color: "border-red-500/30 bg-red-500/5", badge: "destructive" as const },
          { label: "Medium Risk", claims: mediumRisk, color: "border-yellow-500/30 bg-yellow-500/5", badge: "secondary" as const },
          { label: "Low Risk", claims: lowRisk, color: "border-green-500/30 bg-green-500/5", badge: "outline" as const },
        ].map(tier => (
          <Card key={tier.label} className={`border ${tier.color}`} data-testid={`card-risk-${tier.label.toLowerCase().replace(" ", "-")}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                {tier.label}
                <Badge variant={tier.badge}>{claimsLoading ? "—" : tier.claims.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {claimsLoading ? <Skeleton className="h-8 w-full" /> : (
                <div className="space-y-1.5">
                  {tier.claims.slice(0, 3).map(c => (
                    <Link key={c.id} href={`/claims/${c.id}`}>
                      <div className="text-xs text-muted-foreground hover:text-foreground transition-colors truncate cursor-pointer" data-testid={`signal-claim-${c.id}`}>
                        {c.claimNumber} — {c.carrier ?? "Unknown carrier"}
                      </div>
                    </Link>
                  ))}
                  {tier.claims.length > 3 && (
                    <p className="text-xs text-muted-foreground/60">+{tier.claims.length - 3} more</p>
                  )}
                  {tier.claims.length === 0 && <p className="text-xs text-muted-foreground/60">None</p>}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-Claim Signal Cards */}
      <div>
        <h2 className="text-base font-semibold mb-3">Active Claim Signals</h2>
        {claimsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : !claims?.length ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No claims found. Create a claim to generate signals.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {[...claims].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)).slice(0, 10).map(claim => {
              const risk = riskLevel(claim.riskScore ?? claim.frictionScore);
              const readiness = escalationReadiness(claim);
              const missing = getMissingDocs(claim);
              const action = nextBestAction(claim);

              return (
                <Card key={claim.id} data-testid={`card-signal-${claim.id}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-sm" data-testid={`signal-claim-number-${claim.id}`}>{claim.claimNumber}</span>
                          <Badge variant={risk.badge as any} className="text-xs" data-testid={`signal-risk-${claim.id}`}>{risk.label} Risk</Badge>
                          {(claim.escalationLevel ?? 0) >= 3 && (
                            <Badge variant="destructive" className="text-xs">Escalation Active</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{claim.carrier ?? "Unknown carrier"} · {claim.status ?? "open"}</p>
                      </div>
                      <Link href={`/claims/${claim.id}`}>
                        <div className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer" data-testid={`link-signal-detail-${claim.id}`}>
                          View Claim <ChevronRight className="w-3 h-3" />
                        </div>
                      </Link>
                    </div>

                    <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
                      {/* Risk */}
                      <div data-testid={`signal-risk-detail-${claim.id}`}>
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Risk Level</p>
                        <p className={`text-sm font-semibold ${risk.color}`}>{risk.label}</p>
                        <p className="text-xs text-muted-foreground">Score: {claim.riskScore ?? claim.frictionScore ?? "—"}/10</p>
                      </div>

                      {/* Escalation Readiness */}
                      <div data-testid={`signal-escalation-${claim.id}`}>
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Escalation Readiness</p>
                        <p className={`text-sm font-semibold ${readiness >= 60 ? "text-red-500" : readiness >= 30 ? "text-yellow-500" : "text-green-500"}`}>{readiness}%</p>
                        <p className="text-xs text-muted-foreground">{readiness >= 60 ? "Action recommended" : readiness >= 30 ? "Monitor closely" : "Within range"}</p>
                      </div>

                      {/* Missing Docs */}
                      <div data-testid={`signal-missing-docs-${claim.id}`}>
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><FileX className="w-3 h-3" /> Missing Documentation</p>
                        {missing.length === 0
                          ? <p className="text-xs text-green-500 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Complete</p>
                          : <p className="text-xs text-yellow-500">{missing.length} item{missing.length > 1 ? "s" : ""} flagged</p>
                        }
                        {missing.slice(0, 2).map(m => (
                          <p key={m} className="text-xs text-muted-foreground/70 truncate">· {m}</p>
                        ))}
                      </div>

                      {/* Next Best Action */}
                      <div data-testid={`signal-action-${claim.id}`}>
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><ArrowRight className="w-3 h-3" /> Recommended Action</p>
                        <p className="text-xs leading-relaxed">{action}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Adjuster Friction Signals */}
      {highFrictionAdjusters.length > 0 && (
        <div data-testid="section-adjuster-signals">
          <h2 className="text-base font-semibold mb-3">Adjuster Friction Signals</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {highFrictionAdjusters.slice(0, 4).map(adj => (
              <Card key={adj.id} className="border-yellow-500/20" data-testid={`card-adjuster-signal-${adj.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-yellow-500/10 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-yellow-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{adj.adjusterName}</p>
                      <p className="text-xs text-muted-foreground">{adj.carrierName} · Friction: {adj.frictionScore ?? "—"}/10</p>
                      <p className="text-xs text-muted-foreground/70">Supplement reduction: {adj.supplementReductionRatio != null ? `${Math.round((adj.supplementReductionRatio ?? 0) * 100)}%` : "—"} · Denial rate: {adj.denialRate != null ? `${Math.round((adj.denialRate ?? 0) * 100)}%` : "—"}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">High Friction</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Carrier Friction Indicators */}
      <Card data-testid="card-carrier-intelligence">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Carrier Behavior Signals
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Carrier Friction Level</p>
              <p className="text-sm font-semibold text-yellow-500">{deniedCount > 2 ? "High" : deniedCount > 0 ? "Medium" : "Low"}</p>
              <p className="text-xs text-muted-foreground">{deniedCount} denial{deniedCount !== 1 ? "s" : ""} detected</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Adjuster Response Trend</p>
              <p className="text-sm font-semibold">{highFrictionAdjusters.length > 0 ? "Elevated Resistance" : "Normal"}</p>
              <p className="text-xs text-muted-foreground">{highFrictionAdjusters.length} high-friction adjuster{highFrictionAdjusters.length !== 1 ? "s" : ""} active</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Platform Signal Status</p>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-blue-500" />
                <p className="text-sm font-semibold text-blue-400">MVP Rule-Based</p>
              </div>
              <p className="text-xs text-muted-foreground">Signals derived from real claim data</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
