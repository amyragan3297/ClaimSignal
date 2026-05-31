import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, TrendingUp, TrendingDown, AlertTriangle, Shield } from "lucide-react";
import { sampleSizeLabel } from "@/lib/data-source";

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
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const money = (v: number | null) => (v == null ? "—" : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);

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
          Aggregated behavioral patterns by carrier. Contains no homeowner PII.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-64 w-full" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground" data-testid="text-carrier-empty">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-40" />
            No carrier intelligence yet. Add claims with carrier and outcome data to build patterns.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((c) => (
            <Card key={c.carrierName} data-testid={`card-carrier-${c.carrierName.replace(/\s+/g, "-").toLowerCase()}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg" data-testid={`text-carrier-name-${c.carrierName.replace(/\s+/g, "-").toLowerCase()}`}>
                    {c.carrierName}
                  </CardTitle>
                  <Badge variant="outline" data-testid={`badge-claims-count-${c.carrierName.replace(/\s+/g, "-").toLowerCase()}`}>
                    {c.claimsCount} claim{c.claimsCount === 1 ? "" : "s"}
                  </Badge>
                </div>
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

                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><div className="text-xs text-muted-foreground">Avg RCV</div><div className="font-medium">{money(c.avgRcv)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Avg ACV</div><div className="font-medium">{money(c.avgAcv)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Suppl Δ</div><div className="font-medium">{money(c.avgSupplementDelta)}</div></div>
                </div>

                {c.commonDenialReasons.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Common Denial Reasons</div>
                    <div className="flex flex-wrap gap-1.5">
                      {c.commonDenialReasons.map((r) => (
                        <Badge key={r.reason} variant="secondary" data-testid={`badge-denial-reason`}>{r.reason} ({r.count})</Badge>
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
          ))}
        </div>
      )}
    </div>
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
