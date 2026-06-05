// ──────────────────────────────────────────────────────────────────────────
// Adjuster Scorecard Engine (Section 14) — MVP, rule-based.
// Computed only from REAL linked claim outcomes. Never fabricates.
// With < 3 linked claims, returns insufficient=true and no derived rates.
// ──────────────────────────────────────────────────────────────────────────
import type { Claim, ClaimAdjuster } from "@shared/schema";

const MIN_CLAIMS = 3;
const lc = (v: unknown): string => (typeof v === "string" ? v.toLowerCase() : "");
const isDenied = (v: unknown) => lc(v).includes("deni") || lc(v).includes("reject");
const isApproved = (v: unknown) => { const s = lc(v); return s.includes("approv") || s.includes("full") || s.includes("paid"); };
const isPartial = (v: unknown) => lc(v).includes("partial");

export interface AdjusterScorecard {
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

function resolutionDays(c: Claim): number | null {
  const start = c.dateOfLoss ? new Date(c.dateOfLoss) : null;
  const end = c.resolutionDate ? new Date(c.resolutionDate) : (c.determinationDate ? new Date(c.determinationDate) : null);
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const d = Math.round((end.getTime() - start.getTime()) / 86400000);
  return d >= 0 ? d : null;
}

function responseDays(c: Claim): number | null {
  // Days from date of loss to first inspection (first adjuster response)
  const start = c.dateOfLoss ? new Date(c.dateOfLoss) : (c.lossDate ? new Date(c.lossDate) : null);
  const firstResponse = c.inspectionDate ? new Date(c.inspectionDate) : null;
  if (!start || !firstResponse || isNaN(start.getTime()) || isNaN(firstResponse.getTime())) return null;
  const d = Math.round((firstResponse.getTime() - start.getTime()) / 86400000);
  return d >= 0 ? d : null;
}

const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 100) : null);

export function computeAdjusterScorecard(links: ClaimAdjuster[], claims: Claim[]): AdjusterScorecard {
  // Dedupe to unique claims linked to this adjuster.
  const linkedClaimIds = new Set(links.map((l) => l.claimId));
  const claimMap = new Map(claims.map((c) => [c.id, c]));
  const uniqueClaims: Claim[] = Array.from(linkedClaimIds)
    .map((id) => claimMap.get(id))
    .filter((c): c is Claim => Boolean(c));

  const n = uniqueClaims.length;

  if (n < MIN_CLAIMS) {
    // Still compute real counts — just skip rate derivations which need ≥3 claims.
    let initialDenials = 0, finalApprovals = 0, partialApprovals = 0, denialsOverturned = 0;
    let reinspectionsRequested = 0, escalationsUsed = 0, paymentsReceived = 0;
    for (const c of uniqueClaims) {
      if (isDenied(c.initialOutcome)) initialDenials++;
      if (isApproved(c.finalOutcome)) finalApprovals++;
      if (isPartial(c.initialOutcome) || isPartial(c.finalOutcome)) partialApprovals++;
      if (c.denialOverturned === true) denialsOverturned++;
      if (c.reinspectionRequested === true) reinspectionsRequested++;
      if (c.escalationUsed === true) escalationsUsed++;
      if (c.paymentReceived === true) paymentsReceived++;
    }
    return {
      linkedClaimCount: n,
      insufficient: true,
      message: n === 0 ? "No linked claims yet." : `${n} claim${n === 1 ? "" : "s"} linked — rates require ${MIN_CLAIMS - n} more to compute.`,
      dataConfidence: "low",
      counts: { initialDenials, finalApprovals, partialApprovals, denialsOverturned, reinspectionsRequested, escalationsUsed, paymentsReceived },
      rates: { denialRate: null, overturnRate: null, reinspectionRate: null, escalationRate: null, approvalRate: null },
      avgResolutionDays: null,
      avgResponseDays: null,
      behaviorSignals: [],
      negotiationSignals: [],
    };
  }

  let initialDenials = 0, finalApprovals = 0, partialApprovals = 0, denialsOverturned = 0;
  let reinspectionsRequested = 0, escalationsUsed = 0, paymentsReceived = 0;
  const resDays: number[] = [];
  const respDays: number[] = [];

  for (const c of uniqueClaims) {
    if (isDenied(c.initialOutcome)) initialDenials++;
    if (isApproved(c.finalOutcome)) finalApprovals++;
    if (isPartial(c.initialOutcome) || isPartial(c.finalOutcome)) partialApprovals++;
    if (c.denialOverturned === true) denialsOverturned++;
    if (c.reinspectionRequested === true) reinspectionsRequested++;
    if (c.escalationUsed === true) escalationsUsed++;
    if (c.paymentReceived === true) paymentsReceived++;
    const rd = resolutionDays(c);
    if (rd !== null) resDays.push(rd);
    const rsp = responseDays(c);
    if (rsp !== null) respDays.push(rsp);
  }

  const denialRate = pct(initialDenials, n);
  const overturnRate = pct(denialsOverturned, initialDenials);
  const reinspectionRate = pct(reinspectionsRequested, n);
  const escalationRate = pct(escalationsUsed, n);
  const approvalRate = pct(finalApprovals, n);
  const avgResolutionDays = resDays.length ? Math.round(resDays.reduce((s, d) => s + d, 0) / resDays.length) : null;
  const avgResponseDays = respDays.length ? Math.round(respDays.reduce((s, d) => s + d, 0) / respDays.length) : null;

  const behaviorSignals: string[] = [];
  if (denialRate !== null && denialRate >= 50) behaviorSignals.push("High initial denial rate");
  if (overturnRate !== null && overturnRate >= 50) behaviorSignals.push("Denials frequently overturned on challenge");
  if (reinspectionRate !== null && reinspectionRate >= 40) behaviorSignals.push("Reinspection often required");
  if (escalationRate !== null && escalationRate >= 40) behaviorSignals.push("Escalation often required to resolve");
  if (approvalRate !== null && approvalRate >= 60) behaviorSignals.push("High eventual approval rate");
  if (avgResolutionDays !== null && avgResolutionDays >= 120) behaviorSignals.push("Long average resolution time");
  if (avgResponseDays !== null && avgResponseDays > 30) behaviorSignals.push("Slow initial response — above 30-day threshold");

  // ── Negotiation Signals ─ derived from behavioral patterns ─────────────
  const negotiationSignals: string[] = [];

  if (overturnRate !== null && overturnRate >= 50) {
    negotiationSignals.push("Frequently reverses on reinspection — request reinspection early rather than supplementing first.");
  }
  if (reinspectionRate !== null && reinspectionRate >= 40) {
    negotiationSignals.push("High reinspection rate — prepare complete documentation package before reinspection is scheduled.");
  }
  if (escalationRate !== null && escalationRate >= 40) {
    negotiationSignals.push("Escalation commonly required — include escalation path (supervisor / DOI) in initial demand letter.");
  }
  if (denialRate !== null && denialRate >= 60 && (overturnRate === null || overturnRate < 30)) {
    negotiationSignals.push("High denial rate with low overturn — prioritize code documentation and third-party expert opinions from the start.");
  }
  if (approvalRate !== null && approvalRate >= 70) {
    negotiationSignals.push("Strong eventual approval rate — persistence and complete documentation packages yield results.");
  }
  if (avgResolutionDays !== null && avgResolutionDays >= 90) {
    negotiationSignals.push("Long cycle times — set written deadlines in correspondence and reference state claims-handling statutes.");
  }
  if (avgResponseDays !== null && avgResponseDays > 14 && avgResponseDays <= 30) {
    negotiationSignals.push("Moderate response velocity (14–30 days) — follow up with written confirmation after each contact.");
  }
  if (avgResponseDays !== null && avgResponseDays > 30) {
    negotiationSignals.push("Slow response velocity (>30 days) — document each contact attempt and cite statutory response timeline in written follow-up.");
  }
  if (denialsOverturned >= 2 && initialDenials >= 3) {
    negotiationSignals.push("Pattern of denial reversal — submit rebuttal package within 7 days of initial denial to minimize cycle time.");
  }

  const dataConfidence: "low" | "medium" | "high" = n >= 10 ? "high" : n >= 5 ? "medium" : "low";

  return {
    linkedClaimCount: n,
    insufficient: false,
    message: null,
    dataConfidence,
    counts: { initialDenials, finalApprovals, partialApprovals, denialsOverturned, reinspectionsRequested, escalationsUsed, paymentsReceived },
    rates: { denialRate, overturnRate, reinspectionRate, escalationRate, approvalRate },
    avgResolutionDays,
    avgResponseDays,
    behaviorSignals,
    negotiationSignals,
  };
}
