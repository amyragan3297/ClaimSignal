// ──────────────────────────────────────────────────────────────────────────
// Escalation Intelligence Engine (Section 19) — MVP, rule-based.
// Computes effectiveness from REAL escalation records only.
// With < 3 comparable examples: returns insufficient=true.
// Never fabricates results or recommendations.
// ──────────────────────────────────────────────────────────────────────────
import type { Claim } from "@shared/schema";

export interface Escalation {
  id: string;
  claimId: string;
  carrierName: string | null;
  adjusterId: string | null;
  escalationType: string;
  dateInitiated: string | null;
  reasonForEscalation: string | null;
  documentsSubmitted: string[] | null;
  personContacted: string | null;
  responseReceived: string | null;
  timelineImpactDays: number | null;
  outcomeBeforeEscalation: string | null;
  outcomeAfterEscalation: string | null;
  escalationResult: string | null;
  savedToPlaybook: boolean;
  createdByUserId: string | null;
  createdAt: Date | string;
}

const SUCCESSFUL_RESULTS = new Set([
  "full_approval", "partial_approval", "supplement_approved", "payment_increased",
  "reinspection_scheduled", "claim_reopened",
]);

const RESULT_LABELS: Record<string, string> = {
  no_response: "No Response",
  pending: "Pending",
  denial_upheld: "Denial Upheld",
  reinspection_scheduled: "Reinspection Scheduled",
  partial_approval: "Partial Approval",
  full_approval: "Full Approval",
  supplement_approved: "Supplement Approved",
  payment_increased: "Payment Increased",
  claim_reopened: "Claim Reopened",
  claim_closed: "Claim Closed",
  moved_to_appraisal: "Moved to Appraisal",
  referred_to_supervisor: "Referred to Supervisor",
  referred_to_legal: "Referred to Legal",
};

const TYPE_LABELS: Record<string, string> = {
  reinspection_request: "Reinspection Request",
  supervisor_review: "Supervisor Review",
  team_lead_review: "Team Lead Review",
  desk_adjuster_review: "Desk Adjuster Review",
  carrier_internal_escalation: "Carrier Internal Escalation",
  supplement_submission: "Supplement Submission",
  code_documentation: "Code Documentation",
  manufacturer_documentation: "Manufacturer Documentation",
  repairability_documentation: "Repairability Documentation",
  brittle_test: "Brittle Test Documentation",
  matching_dispute: "Matching Dispute Documentation",
  photo_evidence_packet: "Photo Evidence Packet",
  estimate_comparison: "Estimate Comparison",
  engineer_report_dispute: "Engineer Report Dispute",
  doi_complaint: "DOI Complaint",
  appraisal_demand: "Appraisal Demand",
  attorney_involvement: "Attorney Involvement",
  public_adjuster_involvement: "Public Adjuster Involvement",
};

export interface EscalationTypeStats {
  escalationType: string;
  typeLabel: string;
  totalUsed: number;
  successCount: number;
  approvalRate: number | null;
  avgDaysToResponse: number | null;
  denialUpheldCount: number;
  topResults: Array<{ result: string; resultLabel: string; count: number }>;
  commonDocuments: string[];
  insufficient: boolean;
  message: string | null;
}

export interface EscalationEffectiveness {
  totalEscalations: number;
  byType: EscalationTypeStats[];
  overallSuccessRate: number | null;
}

function topItems<T extends string>(arr: (T | null | undefined)[], limit = 3): T[] {
  const map = new Map<T, number>();
  for (const v of arr) {
    if (!v) continue;
    map.set(v, (map.get(v) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k]) => k);
}

export function computeEscalationEffectiveness(
  escalations: Escalation[],
  filterCarrier?: string,
  filterType?: string,
): EscalationEffectiveness {
  let filtered = escalations;
  if (filterCarrier) filtered = filtered.filter((e) => (e.carrierName || "").toLowerCase() === filterCarrier.toLowerCase());
  if (filterType) filtered = filtered.filter((e) => e.escalationType === filterType);

  const byType = new Map<string, Escalation[]>();
  for (const e of filtered) {
    const t = e.escalationType || "unknown";
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(e);
  }

  const stats: EscalationTypeStats[] = Array.from(byType.entries()).map(([type, group]) => {
    const n = group.length;
    if (n < 3) {
      return {
        escalationType: type,
        typeLabel: TYPE_LABELS[type] ?? type,
        totalUsed: n,
        successCount: 0,
        approvalRate: null,
        avgDaysToResponse: null,
        denialUpheldCount: 0,
        topResults: [],
        commonDocuments: [],
        insufficient: true,
        message: "Not enough escalation history yet.",
      };
    }

    const successCount = group.filter((e) => e.escalationResult && SUCCESSFUL_RESULTS.has(e.escalationResult)).length;
    const denialUpheldCount = group.filter((e) => e.escalationResult === "denial_upheld").length;
    const approvalRate = Math.round((successCount / n) * 100);

    const responseTimes = group
      .map((e) => e.timelineImpactDays)
      .filter((d): d is number => typeof d === "number" && d >= 0);
    const avgDaysToResponse = responseTimes.length
      ? Math.round(responseTimes.reduce((s, d) => s + d, 0) / responseTimes.length)
      : null;

    const resultMap = new Map<string, number>();
    for (const e of group) {
      if (e.escalationResult) resultMap.set(e.escalationResult, (resultMap.get(e.escalationResult) || 0) + 1);
    }
    const topResults = Array.from(resultMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([result, count]) => ({ result, resultLabel: RESULT_LABELS[result] ?? result, count }));

    const allDocs = group.flatMap((e) => e.documentsSubmitted ?? []);
    const commonDocuments = topItems(allDocs, 3);

    return {
      escalationType: type,
      typeLabel: TYPE_LABELS[type] ?? type,
      totalUsed: n,
      successCount,
      approvalRate,
      avgDaysToResponse,
      denialUpheldCount,
      topResults,
      commonDocuments,
      insufficient: false,
      message: null,
    };
  });

  stats.sort((a, b) => (b.approvalRate ?? -1) - (a.approvalRate ?? -1));

  const totalSuccesses = filtered.filter((e) => e.escalationResult && SUCCESSFUL_RESULTS.has(e.escalationResult)).length;
  const overallSuccessRate = filtered.length >= 3
    ? Math.round((totalSuccesses / filtered.length) * 100)
    : null;

  return { totalEscalations: filtered.length, byType: stats, overallSuccessRate };
}

// ── Recommended escalation path ────────────────────────────────────────────
// Suggests historically supported steps based on similar claims and escalations.
// NEVER fabricates. Requires ≥3 relevant examples or returns insufficient message.
export interface RecommendedEscalationPath {
  steps: Array<{ step: number; action: string; rationale: string }>;
  reason: string;
  disclaimer: string;
  insufficient: boolean;
  message: string | null;
}

export function buildRecommendedEscalationPath(
  targetClaim: Claim,
  orgEscalations: Escalation[],
  orgClaims: Claim[],
): RecommendedEscalationPath {
  const DISCLAIMER = "Suggested operational next step based on historical claim patterns. Not legal advice.";

  // Find escalations on claims with same carrier and/or similar denial reason.
  const targetCarrier = (targetClaim.carrier || "").toLowerCase();
  const targetDenial = ((targetClaim as any).denialReason || "").toLowerCase();

  const relatedClaimIds = new Set(
    orgClaims
      .filter((c) => c.id !== targetClaim.id && c.carrier?.toLowerCase() === targetCarrier)
      .map((c) => c.id),
  );

  const relevant = orgEscalations.filter(
    (e) => relatedClaimIds.has(e.claimId) && e.escalationResult && SUCCESSFUL_RESULTS.has(e.escalationResult),
  );

  if (relevant.length < 3) {
    return {
      steps: [],
      reason: "",
      disclaimer: DISCLAIMER,
      insufficient: true,
      message: "Not enough escalation history yet.",
    };
  }

  // Rank escalation types by success frequency on similar claims.
  const typeCounts = new Map<string, number>();
  for (const e of relevant) {
    typeCounts.set(e.escalationType, (typeCounts.get(e.escalationType) || 0) + 1);
  }
  const rankedTypes = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([type]) => type);

  const steps = rankedTypes.map((type, i) => ({
    step: i + 1,
    action: TYPE_LABELS[type] ?? type,
    rationale: `Used successfully in ${typeCounts.get(type)} similar ${targetCarrier ? targetCarrier + " " : ""}claim${typeCounts.get(type) === 1 ? "" : "s"}.`,
  }));

  const reason = `Similar ${targetCarrier ? targetCarrier + " " : ""}claims (${relatedClaimIds.size} matched) reached better outcomes after the following escalation steps.${targetDenial ? " Denial pattern: " + targetDenial + "." : ""}`;

  return { steps, reason, disclaimer: DISCLAIMER, insufficient: false, message: null };
}

export { TYPE_LABELS, RESULT_LABELS, SUCCESSFUL_RESULTS };
