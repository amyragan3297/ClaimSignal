import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  Brain, Activity, TrendingUp, AlertTriangle, Target,
  FileText, ChevronRight, Shield, DollarSign,
  Clock, Users,
} from "lucide-react";
import type { Claim, Adjuster } from "@shared/schema";

const ENGINE_CARDS = [
  {
    icon: Activity,
    title: "Claim Risk Score",
    description: "Composite risk score based on claim complexity, carrier behavior, and adjuster friction patterns.",
    color: "text-red-400",
    bg: "bg-red-500/10",
  },
  {
    icon: TrendingUp,
    title: "Escalation Readiness Score",
    description: "Measures how prepared a claim is for formal escalation based on documentation and carrier resistance.",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
  },
  {
    icon: FileText,
    title: "Documentation Pressure Signals",
    description: "Identifies gaps in estimate coverage, code citations, scope completeness, and evidence documentation.",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
  },
  {
    icon: AlertTriangle,
    title: "Claim Friction Indicators",
    description: "Tracks stall patterns, response delays, scope reductions, and carrier communication signals.",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    icon: Shield,
    title: "Carrier Behavior Signals",
    description: "Aggregated carrier patterns: denial rates, supplement resistance, and response velocity trends.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    icon: Users,
    title: "Adjuster Behavior Signals",
    description: "Adjuster-level friction scoring, IRC rejection rates, and historical supplement reduction patterns.",
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
  },
  {
    icon: Target,
    title: "Missing Scope Flags",
    description: "Detects missing line items from estimate documents: O&P, drip edge, starter strip, permit fees.",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
  },
  {
    icon: DollarSign,
    title: "Supplement Opportunity Flags",
    description: "Identifies recoverable depreciation, code-required items, and scope gaps eligible for supplement.",
    color: "text-green-400",
    bg: "bg-green-500/10",
  },
  {
    icon: Clock,
    title: "Timeline Risk Signals",
    description: "Velocity analysis across lifecycle phases — flags stalled claims and deadline risk windows.",
    color: "text-teal-400",
    bg: "bg-teal-500/10",
  },
];

export default function IntelligencePage() {
  const { data: claims, isLoading } = useQuery<Claim[]>({ queryKey: ["/api/claims"] });
  const { data: adjusters } = useQuery<Adjuster[]>({ queryKey: ["/api/adjusters"] });

  const totalClaims = claims?.length ?? 0;
  const scoredClaims = (claims ?? []).filter(c => (c.frictionScore ?? 0) > 0);
  const avgFriction = scoredClaims.length
    ? (scoredClaims.reduce((s, c) => s + (c.frictionScore ?? 0), 0) / scoredClaims.length).toFixed(1)
    : "—";
  const totalSupplementOpp = claims?.reduce((s, c) => s + (c.supplementAmountTotal ?? 0), 0) ?? 0;
  const deniedCount = claims?.filter(c => c.status === "denied").length ?? 0;
  const _highRiskCount = claims?.filter(c => (c.riskScore ?? 0) >= 7 || (c.frictionScore ?? 0) >= 7).length ?? 0;
  const avgApprovalProb = claims?.length
    ? Math.round(claims.reduce((s, c) => s + (c.approvalProbability ?? 0), 0) / claims.length * 100)
    : null;

  const topRiskClaims = [...(claims ?? [])].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)).slice(0, 5);

  return (
    <div className="space-y-6" data-testid="page-intelligence">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-intelligence-title">Claim Intelligence</h1>
        <p className="text-sm text-muted-foreground">Behavioral analytics, scoring engines, and structured intelligence for property claims</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Claims Analyzed", value: isLoading ? null : totalClaims, testId: "stat-intel-claims" },
          { label: "Avg Friction Score", value: isLoading ? null : avgFriction, testId: "stat-intel-friction" },
          { label: "Supplement Opportunity", value: isLoading ? null : `$${totalSupplementOpp.toLocaleString()}`, testId: "stat-intel-supplement" },
          { label: "Denied Claims", value: isLoading ? null : deniedCount, testId: "stat-intel-denied" },
          { label: "Avg Approval Probability", value: isLoading ? null : (avgApprovalProb != null ? `${avgApprovalProb}%` : "—"), testId: "stat-intel-approval" },
        ].map(s => (
          <Card key={s.label} data-testid={s.testId}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
              <p className="text-xl font-bold">
                {s.value === null ? <Skeleton className="h-5 w-12" /> : s.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Intelligence Engines */}
      <div>
        <h2 className="text-base font-semibold mb-3">Intelligence Engines</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ENGINE_CARDS.map(engine => (
            <Card key={engine.title} className="hover:border-border/80 transition-colors" data-testid={`card-engine-${engine.title.toLowerCase().replace(/\s+/g, "-")}`}>
              <CardContent className="p-5">
                <div className={`w-9 h-9 rounded-md ${engine.bg} flex items-center justify-center mb-3`}>
                  <engine.icon className={`w-4 h-4 ${engine.color}`} />
                </div>
                <h3 className="text-sm font-semibold mb-1.5">{engine.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{engine.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Top Risk Claims */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Top Risk Claims</h2>
          <Link href="/signal-engine">
            <div className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer" data-testid="link-signal-engine">
              Full Signal Engine <ChevronRight className="w-3 h-3" />
            </div>
          </Link>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : !topRiskClaims.length ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No claims yet. Create claims to generate intelligence.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {topRiskClaims.map(claim => (
              <Card key={claim.id} data-testid={`card-intel-claim-${claim.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium" data-testid={`intel-claim-number-${claim.id}`}>{claim.claimNumber}</span>
                        <Badge variant="outline" className="text-xs">{claim.carrier ?? "Unknown"}</Badge>
                        {(claim.riskScore ?? 0) >= 7 && <Badge variant="destructive" className="text-xs">High Risk</Badge>}
                        {claim.status === "denied" && <Badge variant="destructive" className="text-xs">Denied</Badge>}
                        {claim.status === "escalated" && <Badge variant="secondary" className="text-xs">Escalated</Badge>}
                      </div>
                      <div className="flex items-center gap-4 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">Friction: {claim.frictionScore ?? "—"}/10</span>
                        <span className="text-xs text-muted-foreground">Risk: {claim.riskScore ?? "—"}/10</span>
                        <span className="text-xs text-muted-foreground">Approval prob: {claim.approvalProbability != null ? `${Math.round(claim.approvalProbability * 100)}%` : "—"}</span>
                      </div>
                    </div>
                    <Link href={`/claims/${claim.id}`}>
                      <div className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer shrink-0" data-testid={`link-intel-detail-${claim.id}`}>
                        View <ChevronRight className="w-3 h-3" />
                      </div>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Adjuster Intelligence */}
      {adjusters && adjusters.length > 0 && (
        <div data-testid="section-adjuster-intelligence">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Adjuster Intelligence</h2>
            <Link href="/adjusters">
              <div className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer" data-testid="link-adjusters">
                All Adjusters <ChevronRight className="w-3 h-3" />
              </div>
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {adjusters.slice(0, 3).map(adj => (
              <Card key={adj.id} data-testid={`card-intel-adjuster-${adj.id}`}>
                <CardContent className="p-4">
                  <p className="text-sm font-medium mb-0.5">{adj.adjusterName}</p>
                  <p className="text-xs text-muted-foreground mb-3">{adj.carrierName}</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Friction Score</span>
                      <span className={(adj.frictionScore ?? 0) >= 6 ? "text-red-400 font-medium" : ""}>{adj.frictionScore ?? "—"}/10</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Denial Rate</span>
                      <span>{adj.denialRate != null ? `${Math.round((adj.denialRate ?? 0) * 100)}%` : "—"}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Supplement Reduction</span>
                      <span>{adj.supplementReductionRatio != null ? `${Math.round((adj.supplementReductionRatio ?? 0) * 100)}%` : "—"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Demo Note */}
      <Card className="border-border/40 bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Brain className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Intelligence Engine Status</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Risk, friction, and escalation scores are computed from your real claim data. AI narrative analysis (per claim), document extraction, and audio transcription run live via OpenAI. Aggregated carrier and adjuster patterns grow stronger as more claims and evidence are added.
              </p>
            </div>
            <Badge variant="outline" className="text-xs shrink-0">AI-Powered</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
