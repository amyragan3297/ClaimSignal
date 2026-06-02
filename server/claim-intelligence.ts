/* eslint-disable @typescript-eslint/no-explicit-any */
// ──────────────────────────────────────────────────────────────────────────
// Claim Intelligence Engine (Section 21) — MVP, rule-based.
// Aggregates all available claim data into a single intelligence dashboard.
// Never fabricates. Insufficient data = display message, not invented data.
// ──────────────────────────────────────────────────────────────────────────
import type { Claim } from "@shared/schema";

const lc = (v: unknown) => String(v ?? "").toLowerCase();
const isDenied = (v: unknown) => { const s = lc(v); return s.includes("deni") || s.includes("reject"); };
const isApproved = (v: unknown) => { const s = lc(v); return s.includes("approv") || s.includes("paid"); };

// ── Claim Health Score ────────────────────────────────────────────────────
export type ClaimHealthLabel = "Excellent" | "Good" | "Moderate Risk" | "High Risk";

export interface ClaimHealthScore {
  label: ClaimHealthLabel | null;
  score: number | null;
  factors: string[];
  insufficient: boolean;
  message: string | null;
}

export function computeClaimHealthScore(
  claim: Claim,
  linkedAdjusterCount: number,
  evidenceFileCount: number,
  _escalationCount: number,
): ClaimHealthScore {
  const a = claim as any;

  // Need at least date of loss and status to score.
  if (!a.dateOfLoss && !claim.status) {
    return { label: null, score: null, factors: [], insufficient: true, message: "Insufficient data for claim health scoring." };
  }

  let score = 100; // Start at 100, deduct for risk signals.
  const factors: string[] = [];

  // Status-based
  if (lc(claim.status).includes("clos")) { score -= 5; factors.push("Claim closed"); }
  if (isDenied(a.initialOutcome) && !isApproved(a.finalOutcome) && !a.denialOverturned) {
    score -= 25; factors.push("Active denial with no overturn");
  }
  if (isDenied(a.initialOutcome) && (isApproved(a.finalOutcome) || a.denialOverturned)) {
    score += 10; factors.push("Denial overturned — positive resolution path");
  }

  // Time pressure
  if (a.dateOfLoss) {
    const daysSinceLoss = Math.floor((Date.now() - new Date(a.dateOfLoss).getTime()) / 86400000);
    if (daysSinceLoss > 365) { score -= 20; factors.push("Over 1 year since date of loss"); }
    else if (daysSinceLoss > 180) { score -= 10; factors.push("Over 6 months since date of loss"); }
  }

  // Escalation signals
  if (a.escalationUsed) { score -= 10; factors.push("Escalation required"); }
  if (a.reinspectionRequested) {
    if (a.reinspectionOutcome && isApproved(a.reinspectionOutcome)) { score += 5; factors.push("Reinspection successful"); }
    else { score -= 5; factors.push("Reinspection requested"); }
  }

  // Documentation signals
  if (!a.denialLetterUploaded && isDenied(a.initialOutcome)) { score -= 10; factors.push("Denial letter missing"); }
  if (!a.estimateUploaded) { score -= 5; factors.push("No estimate uploaded"); }
  if (!a.photosUploaded) { score -= 5; factors.push("No photos uploaded"); }
  if (evidenceFileCount === 0) { score -= 5; factors.push("No documents on file"); }
  if (linkedAdjusterCount === 0) { score -= 5; factors.push("No adjuster assigned"); }

  // Supplement
  if (a.supplementRequested && !a.supplementApproved) { score -= 5; factors.push("Supplement pending"); }
  if (a.supplementApproved && a.supplementApproved > 0) { score += 5; factors.push("Supplement approved"); }

  // Payment
  if (a.paymentReceived) { score += 10; factors.push("Payment received"); }

  score = Math.max(0, Math.min(100, score));

  let label: ClaimHealthLabel;
  if (score >= 75) label = "Excellent";
  else if (score >= 55) label = "Good";
  else if (score >= 35) label = "Moderate Risk";
  else label = "High Risk";

  return { label, score, factors, insufficient: false, message: null };
}

// ── Risk Signals ──────────────────────────────────────────────────────────
export interface RiskSignal {
  type: string;
  label: string;
  severity: "low" | "medium" | "high";
  description: string;
}

export function computeRiskSignals(claim: Claim, linkedAdjusterCount: number, evidenceFileCount: number): RiskSignal[] {
  const a = claim as any;
  const signals: RiskSignal[] = [];

  if (isDenied(a.initialOutcome) && !a.denialOverturned && !isApproved(a.finalOutcome)) {
    signals.push({ type: "prior_denial", label: "Prior Denial", severity: "high", description: "Claim has an active denial without overturn." });
  }
  if (isDenied(a.initialOutcome) && isDenied(a.finalOutcome)) {
    signals.push({ type: "repeated_denial", label: "Repeated Denial", severity: "high", description: "Denial upheld after escalation or review." });
  }
  if (lc(claim.status).includes("clos") && !a.paymentReceived) {
    signals.push({ type: "closure_threat", label: "Claim Closure Without Payment", severity: "high", description: "Claim is marked closed but no payment recorded." });
  }
  const claimText = lc(`${a.denialReason} ${a.notes} ${a.aiClaimSummary}`);
  if (claimText.includes("match")) signals.push({ type: "matching_dispute", label: "Matching Dispute", severity: "medium", description: "Matching or uniformity issue detected." });
  if (claimText.includes("repairabl")) signals.push({ type: "repairability_dispute", label: "Repairability Dispute", severity: "medium", description: "Repairability issue referenced in claim record." });
  if (claimText.includes("brittle")) signals.push({ type: "brittle_test", label: "Brittle Test Issue", severity: "medium", description: "Brittle test language present." });
  if (claimText.includes("coverage")) signals.push({ type: "coverage_dispute", label: "Coverage Dispute", severity: "medium", description: "Coverage limitation language detected." });
  if (a.supplementRequested && !a.supplementApproved) signals.push({ type: "supplement_resistance", label: "Supplement Resistance", severity: "medium", description: "Supplement requested but not yet approved." });
  if (evidenceFileCount === 0) signals.push({ type: "missing_documentation", label: "Missing Documentation", severity: "medium", description: "No documents on file for this claim." });
  if (linkedAdjusterCount === 0) signals.push({ type: "no_adjuster", label: "No Adjuster Assigned", severity: "low", description: "No adjuster linked to this claim." });
  if (!a.dateOfLoss) signals.push({ type: "missing_dol", label: "Missing Date of Loss", severity: "low", description: "Date of loss has not been recorded." });
  if (!claim.carrier) signals.push({ type: "missing_carrier", label: "No Carrier Assigned", severity: "low", description: "Carrier has not been assigned." });
  if (a.dateOfLoss) {
    const daysOld = Math.floor((Date.now() - new Date(a.dateOfLoss).getTime()) / 86400000);
    if (daysOld > 90 && !a.determinationDate && !a.resolutionDate) {
      signals.push({ type: "delayed_response", label: "Delayed Carrier Response", severity: "medium", description: `${daysOld} days since loss with no determination date recorded.` });
    }
  }

  return signals;
}

// ── Dashboard Alerts ──────────────────────────────────────────────────────
export interface DashboardAlert {
  alertType: string;
  label: string;
  description: string;
}

export function computeAlerts(claim: Claim, linkedAdjusterCount: number): DashboardAlert[] {
  const a = claim as any;
  const alerts: DashboardAlert[] = [];

  if (isDenied(a.initialOutcome) && !a.denialLetterUploaded) {
    alerts.push({ alertType: "missing_denial_letter", label: "Missing Denial Letter", description: "Claim shows a denial but no denial letter has been uploaded." });
  }
  if (!a.estimateUploaded) {
    alerts.push({ alertType: "missing_estimate", label: "Missing Estimate", description: "No estimate or scope document has been uploaded." });
  }
  if (!a.dateOfLoss) {
    alerts.push({ alertType: "missing_dol", label: "Missing Date of Loss", description: "Date of loss is not recorded." });
  }
  if (!claim.carrier) {
    alerts.push({ alertType: "missing_carrier", label: "Missing Carrier Assignment", description: "No carrier has been assigned to this claim." });
  }
  if (linkedAdjusterCount === 0) {
    alerts.push({ alertType: "missing_adjuster", label: "Missing Adjuster", description: "No adjuster has been linked to this claim." });
  }
  if (!a.initialOutcome && !a.finalOutcome) {
    alerts.push({ alertType: "missing_outcome", label: "Incomplete Outcome", description: "No initial or final outcome has been recorded." });
  }
  if (a.escalationUsed && !a.reinspectionOutcome && !a.finalOutcome) {
    alerts.push({ alertType: "unresolved_escalation", label: "Unresolved Escalation", description: "Escalation has been used but no outcome has been recorded." });
  }

  return alerts;
}

// ── Executive Summary ──────────────────────────────────────────────────────
// Assembled from real data fields only. Does not call AI.
export function buildExecutiveSummary(
  claim: Claim,
  riskSignals: RiskSignal[],
  healthScore: ClaimHealthScore,
  linkedAdjusterCount: number,
  hasPlaybookMatches: boolean,
): string {
  const a = claim as any;
  if (healthScore.insufficient) return "Insufficient claim data to generate intelligence summary.";

  const parts: string[] = [];

  parts.push(`Claim is in ${lc(claim.status ?? "unknown status")} status`);

  const highSignals = riskSignals.filter((s) => s.severity === "high");
  const medSignals = riskSignals.filter((s) => s.severity === "medium");

  if (highSignals.length > 0) {
    parts.push(`and shows elevated risk due to: ${highSignals.map((s) => s.label.toLowerCase()).join(", ")}`);
  }
  if (medSignals.length > 0) {
    parts.push(`Additional signals: ${medSignals.map((s) => s.label.toLowerCase()).join(", ")}.`);
  }

  if (a.initialOutcome && a.finalOutcome && lc(a.initialOutcome) !== lc(a.finalOutcome)) {
    parts.push(`Outcome moved from ${a.initialOutcome} to ${a.finalOutcome}.`);
  }

  if (hasPlaybookMatches) {
    parts.push("Historical claims with similar characteristics have been identified — review playbook matches for proven strategies.");
  }

  if (parts.length <= 1) return "Claim data recorded. No significant risk signals detected at this time.";
  return parts.join(". ") + ".";
}
