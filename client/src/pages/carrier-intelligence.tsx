import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, TrendingUp, TrendingDown, AlertTriangle, Shield, ChevronDown, ChevronRight, Info } from "lucide-react";
import { sampleSizeLabel } from "@/lib/data-source";

interface LossTypeBreakdown {
  lossType: string;
  count: number;
  approvalRate: number;
  denialRate: number;
}

interface CarrierIntelligence {
  carrierName: string;
  claimsCount: number;
  approvalRate: number;
  denialRate: number;
  partialApprovalRate: number;
  supplementSuccessRate: number;
  supplementSampleSize: number;
  escalationSuccessRate: number;
  escalationSampleSize: number;
  avgResponseTimeDays: number | null;
  commonDenialReasons: { reason: string; count: number }[];
  commonMissingScopeItems: { item: string; count: number }[];
  avgRcv: number | null;
  avgAcv: number | null;
  avgSupplementDelta: number | null;
  frictionIndex: number | null;
  regionPatterns: { region: string; count: number }[];
  behaviorNotes: string[];
  byLossType: LossTypeBreakdown[];
  insufficient: boolean;
  dataConfidence: "low" | "medium" | "high";
  overturnRate: number | null;
  reinspectionRate: number | null;
  escalationRate: number | null;
  avgResolutionDays: number | null;
  deniedThenApprovedCount: number;
  commonSignals: string[];
  dataSource: "your_claims" | "network";
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const pctDirect = (v: number) => `${v}%`;
const money = (v: number | null) => (v == null ? "—" : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);

function EmptyStateCard() {
  return (
    <Card>
      <CardContent className="py-10 text-center" data-testid="text-carrier-empty">
        <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground/20" />
        <p className="text-base font-medium text-muted-foreground mb-1">No carrier intelligence yet</p>
        <p className="text-sm text-muted-foreground/70 mb-6">
          Add claims with carrier and outcome data to generate behavioral patterns.
          Patterns unlock after 3+ claims per carrier.
        </p>
        <div className="max-w-sm mx-auto rounded-lg border border-border/50 bg-muted/30 p-4 opacity-50 pointer-events-none select-none">
          <div className="flex items-center justify-between mb-3">
            <div className="h-4 w-24 rounded bg-muted-foreground/20" />
            <div className="h-5 w-14 rounded-full bg-muted-foreground/20" />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded border border-border/50 p-2 text-center">
                <div className="h-3 w-10 mx-auto rounded bg-muted-foreground/20 mb-1" />
                <div className="h-5 w-8 mx-auto rounded bg-muted-foreground/30" />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            {[0, 1].map((i) => (
              <div key={i} className="h-3 rounded bg-muted-foreground/15" style={{ width: `${70 + i * 15}%` }} />
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground/50 mt-4">Preview of what carrier cards look like when populated</p>
      </CardContent>
    </Card>
  );
}

function LossTypeRow({ breakdown }: { breakdown: LossTypeBreakdown[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!breakdown || breakdown.length === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 hover:text-foreground transition-colors"
        data-testid="button-toggle-loss-type"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Loss Type Breakdown
      </button>
      {expanded && (
        <div className="space-y-1.5 mt-1">
          {breakdown.map((lt) => (
            <div key={lt.lossType} className="flex items-center justify-between gap-3 text-xs rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5" data-testid={`row-loss-type-${lt.lossType.replace(/\s+/g, "-").toLowerCase()}`}>
              <span className="font-medium">{lt.lossType}</span>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-muted-foreground">{lt.count} claim{lt.count !== 1 ? "s" : ""}</span>
                <span className="text-emerald-400">{pctDirect(lt.approvalRate)} approval</span>
                <span className="text-red-400">{pctDirect(lt.denialRate)} denial</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CarrierIntelligencePage() {
  const { data, isLoading } = useQuery<CarrierIntelligence[]>({
    queryKey: ["/api/carriers/intelligence"],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-carrier-intel-title">
          <Building2 className="w-6 h-6 text-primary" />
          Carrier Intelligence
        </h1>
        <p className="text-sm text-muted-foreground">
          Aggregated behavioral patterns by carrier — derived from your claims. Contains no homeowner PII.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-400" data-testid="text-carrier-data-source-note">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          <strong>Data source:</strong> All metrics are derived from claims you have entered. Patterns are most reliable with 5+ claims per carrier.
          Network-wide benchmarks will be added as the platform grows.
        </span>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-64 w-full" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyStateCard />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((c) => (
            <CarrierCard key={c.carrierName} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CarrierCard({ c }: { c: CarrierIntelligence }) {
  const confidenceBadge = c.dataConfidence === "high"
    ? "text-emerald-400 border-emerald-500/40"
    : c.dataConfidence === "medium"
    ? "text-amber-400 border-amber-500/40"
    : "text-muted-foreground border-border";

  return (
    <Card data-testid={`card-carrier-${c.carrierName.replace(/\s+/g, "-").toLowerCase()}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg" data-testid={`text-carrier-name-${c.carrierName.replace(/\s+/g, "-").toLowerCase()}`}>
            {c.carrierName}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`capitalize text-[10px] ${confidenceBadge}`} data-testid={`badge-confidence-${c.carrierName.replace(/\s+/g, "-").toLowerCase()}`}>
              {c.dataConfidence} confidence
            </Badge>
            <Badge variant="outline" data-testid={`badge-claims-count-${c.carrierName.replace(/\s+/g, "-").toLowerCase()}`}>
              {c.claimsCount} claim{c.claimsCount === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Derived from your claims
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Approval" value={pct(c.approvalRate)} good />
          <Metric label="Partial" value={pct(c.partialApprovalRate)} />
          <Metric label="Denial" value={pct(c.denialRate)} bad />
          <Metric label="Suppl. Win" value={c.supplementSampleSize > 0 ? pct(c.supplementSuccessRate) : "—"} good />
          <Metric label="Escal. Win" value={c.escalationSampleSize > 0 ? pct(c.escalationSuccessRate) : "—"} good />
          <Metric label="Friction" value={c.frictionIndex == null ? "—" : String(c.frictionIndex)} />
        </div>

        {sampleSizeLabel(c.claimsCount) && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-xs text-amber-500" data-testid="text-carrier-basis">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{sampleSizeLabel(c.claimsCount)} — rates reflect a small sample and may shift as more claims are added.</span>
          </div>
        )}

        {c.insufficient && (
          <div className="text-xs text-muted-foreground italic border border-dashed border-border rounded px-2.5 py-1.5">
            Add {3 - c.claimsCount} more claim{3 - c.claimsCount !== 1 ? "s" : ""} with this carrier to unlock pattern analysis.
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><div className="text-xs text-muted-foreground">Avg RCV</div><div className="font-medium">{money(c.avgRcv)}</div></div>
          <div><div className="text-xs text-muted-foreground">Avg ACV</div><div className="font-medium">{money(c.avgAcv)}</div></div>
          <div><div className="text-xs text-muted-foreground">Suppl Δ</div><div className="font-medium">{money(c.avgSupplementDelta)}</div></div>
        </div>

        {c.overturnRate !== null && (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Overturn Rate</div><div className="font-medium">{c.overturnRate}%</div></div>
            {c.avgResolutionDays !== null && <div><div className="text-xs text-muted-foreground">Avg Resolution</div><div className="font-medium">{c.avgResolutionDays}d</div></div>}
            {c.escalationRate !== null && <div><div className="text-xs text-muted-foreground">Escalation Rate</div><div className="font-medium">{c.escalationRate}%</div></div>}
          </div>
        )}

        <LossTypeRow breakdown={c.byLossType} />

        {c.commonDenialReasons.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Common Denial Reasons</div>
            <div className="flex flex-wrap gap-1.5">
              {c.commonDenialReasons.map((r) => (
                <Badge key={r.reason} variant="secondary" data-testid="badge-denial-reason">{r.reason} ({r.count})</Badge>
              ))}
            </div>
          </div>
        )}

        {c.commonSignals.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Behavioral Signals</div>
            <div className="flex flex-wrap gap-1.5">
              {c.commonSignals.map((s) => (
                <Badge key={s} variant="outline" className="text-[11px]">{s}</Badge>
              ))}
            </div>
          </div>
        )}

        {c.regionPatterns.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Region Patterns</div>
            <div className="flex flex-wrap gap-1.5">
              {c.regionPatterns.map((r) => (
                <Badge key={r.region} variant="outline">{r.region} ({r.count})</Badge>
              ))}
            </div>
          </div>
        )}

        {c.behaviorNotes.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {c.behaviorNotes.map((note, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="text-behavior-note">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                <span>{note}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  return (
    <div className="rounded-md border border-border p-2 text-center">
      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
        {good && <TrendingUp className="w-3 h-3 text-emerald-500" />}
        {bad && <TrendingDown className="w-3 h-3 text-red-500" />}
        {label}
      </div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}
