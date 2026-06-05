import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, ArrowLeft } from "lucide-react";
import type { Adjuster } from "@shared/schema";

interface AdjusterScorecard {
  linkedClaimCount: number;
  insufficient: boolean;
  message: string | null;
  dataConfidence: "low" | "medium" | "high";
  counts: {
    initialDenials: number;
    finalApprovals: number;
    partialApprovals: number;
    denialsOverturned: number;
    reinspectionsRequested: number;
    escalationsUsed: number;
    paymentsReceived: number;
  };
  rates: {
    denialRate: number | null;
    overturnRate: number | null;
    reinspectionRate: number | null;
    escalationRate: number | null;
    approvalRate: number | null;
  };
  avgResolutionDays: number | null;
  avgResponseDays: number | null;
  behaviorSignals: string[];
  negotiationSignals: string[];
}

interface LinkedClaimSummary {
  id: string;
  carrier: string | null;
  lossType: string | null;
  status: string;
  initialOutcome: string | null;
  finalOutcome: string | null;
  denialOverturned: boolean;
}

interface ReportData {
  adjuster: Adjuster;
  scorecard: AdjusterScorecard;
  linkedClaims: LinkedClaimSummary[];
  generatedAt: string;
}

function pctStr(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v}%`;
}

function daysStr(v: number | null | undefined, label = "days"): string {
  if (v == null) return "—";
  return `${v} ${label}`;
}

export default function AdjusterReportPage() {
  const [, params] = useRoute("/adjusters/:id/report");
  const adjusterId = params?.id;

  const { data, isLoading, error } = useQuery<ReportData>({
    queryKey: ["/api/adjusters", adjusterId, "report"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/adjusters/${adjusterId}/report`);
      return res.json();
    },
    enabled: !!adjusterId,
  });

  if (isLoading) {
    return (
      <div className="p-8 space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="grid grid-cols-3 gap-4 mt-6">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Unable to load report. The adjuster may not exist or you may not have access.</p>
        <Button variant="outline" className="mt-4" onClick={() => window.history.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
        </Button>
      </div>
    );
  }

  const { adjuster, scorecard, linkedClaims, generatedAt } = data;

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-8 print:p-0 print:space-y-6">
      {/* Print controls — hidden when printing */}
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()} data-testid="button-back-report">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Button onClick={() => window.print()} data-testid="button-print-report">
          <Printer className="w-4 h-4 mr-2" /> Print / Save PDF
        </Button>
      </div>

      {/* Report header */}
      <div className="border-b border-border pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-report-adjuster-name">{adjuster.adjusterName}</h1>
            <p className="text-base text-muted-foreground">{adjuster.carrierName}</p>
            {adjuster.region && <p className="text-sm text-muted-foreground">{adjuster.region}</p>}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p className="font-semibold text-sm">Adjuster Intelligence Report</p>
            <p>ClaimSignal</p>
            <p>Generated: {new Date(generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {adjuster.isFieldAdjuster && <span className="text-xs border border-border rounded px-2 py-0.5">Field Adjuster</span>}
          {adjuster.isDeskAdjuster && <span className="text-xs border border-border rounded px-2 py-0.5">Desk Adjuster</span>}
          <span className="text-xs border border-border rounded px-2 py-0.5 capitalize">{scorecard.dataConfidence} confidence</span>
          <span className="text-xs border border-border rounded px-2 py-0.5">{scorecard.linkedClaimCount} linked claims</span>
        </div>
      </div>

      {scorecard.insufficient ? (
        <div className="rounded-lg border border-border p-6 text-center text-muted-foreground">
          <p className="font-medium">Insufficient Data</p>
          <p className="text-sm mt-1">Fewer than 3 linked claims — behavioral metrics are not yet available for this adjuster.</p>
        </div>
      ) : (
        <>
          {/* Key Metrics */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Key Performance Metrics</h2>
            <div className="grid grid-cols-3 gap-4">
              <StatBox label="Denial Rate" value={pctStr(scorecard.rates.denialRate)} data-testid="text-report-denial-rate" />
              <StatBox label="Overturn Rate" value={pctStr(scorecard.rates.overturnRate)} />
              <StatBox label="Approval Rate" value={pctStr(scorecard.rates.approvalRate)} />
              <StatBox label="Reinspection Rate" value={pctStr(scorecard.rates.reinspectionRate)} />
              <StatBox label="Escalation Rate" value={pctStr(scorecard.rates.escalationRate)} />
              <StatBox label="Avg Resolution" value={daysStr(scorecard.avgResolutionDays)} />
            </div>
          </section>

          {/* Response Velocity */}
          {scorecard.avgResponseDays !== null && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Response Velocity</h2>
              <div className="rounded-lg border border-border p-4 flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold" data-testid="text-report-response-days">{scorecard.avgResponseDays}</p>
                  <p className="text-xs text-muted-foreground">Average days from loss date to first inspection</p>
                </div>
                <div className={`text-sm font-semibold px-3 py-1 rounded-full ${
                  scorecard.avgResponseDays <= 14
                    ? "bg-emerald-500/15 text-emerald-400"
                    : scorecard.avgResponseDays <= 30
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-red-500/15 text-red-400"
                }`}>
                  {scorecard.avgResponseDays <= 14 ? "Fast" : scorecard.avgResponseDays <= 30 ? "Moderate" : "Slow"}
                </div>
              </div>
            </section>
          )}

          {/* Volume Summary */}
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Volume Summary</h2>
            <div className="grid grid-cols-4 gap-3 text-center">
              <VolumeBox label="Initial Denials" value={scorecard.counts.initialDenials} />
              <VolumeBox label="Final Approvals" value={scorecard.counts.finalApprovals} />
              <VolumeBox label="Denials Overturned" value={scorecard.counts.denialsOverturned} />
              <VolumeBox label="Reinspections" value={scorecard.counts.reinspectionsRequested} />
            </div>
          </section>

          {/* Behavioral Signals */}
          {scorecard.behaviorSignals.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Behavioral Signals</h2>
              <ul className="space-y-1.5">
                {scorecard.behaviorSignals.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" data-testid={`text-report-signal-${i}`}>
                    <span className="text-primary mt-0.5">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Negotiation Signals */}
          {scorecard.negotiationSignals.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Negotiation Signals</h2>
              <div className="space-y-2">
                {scorecard.negotiationSignals.map((s, i) => (
                  <div key={i} className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm" data-testid={`text-report-negotiation-${i}`}>
                    {s}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Linked Claims */}
          {linkedClaims.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Linked Claims History</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-xs text-muted-foreground font-medium">Carrier</th>
                    <th className="text-left py-2 text-xs text-muted-foreground font-medium">Loss Type</th>
                    <th className="text-left py-2 text-xs text-muted-foreground font-medium">Initial Outcome</th>
                    <th className="text-left py-2 text-xs text-muted-foreground font-medium">Final Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedClaims.map((c, i) => (
                    <tr key={c.id} className={i < linkedClaims.length - 1 ? "border-b border-border/50" : ""} data-testid={`row-report-claim-${c.id}`}>
                      <td className="py-2">{c.carrier ?? "—"}</td>
                      <td className="py-2">{c.lossType ?? "—"}</td>
                      <td className="py-2 capitalize">{c.initialOutcome?.replace(/_/g, " ") ?? "—"}</td>
                      <td className="py-2 capitalize">
                        {c.denialOverturned
                          ? <span className="text-emerald-400">Overturned to Approval</span>
                          : (c.finalOutcome?.replace(/_/g, " ") ?? "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}

      {/* Footer */}
      <div className="border-t border-border pt-4 text-xs text-muted-foreground">
        <p>This report contains behavioral intelligence derived from linked claim data. No homeowner PII is included.</p>
        <p className="mt-1">Generated by ClaimSignal · {new Date(generatedAt).toLocaleString()}</p>
      </div>
    </div>
  );
}

function StatBox({ label, value, ...rest }: { label: string; value: string; [key: string]: unknown }) {
  return (
    <div className="rounded-md border border-border p-3" {...rest}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function VolumeBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
