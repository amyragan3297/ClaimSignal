import type { Claim, EvidenceFile } from "@shared/schema";

/**
 * Carrier Intelligence MVP
 * ------------------------
 * Aggregates behavioral intelligence per carrier from claims already entered.
 * Contains NO homeowner PII — only carrier-level behavioral patterns. Safe to
 * show to non-Master roles (and is the carrier-facing intelligence layer).
 */
export interface LossTypeBreakdown {
  lossType: string;
  count: number;
  approvalRate: number;
  denialRate: number;
}

export interface CarrierIntelligence {
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
  // Section 15 — Carrier Scorecard additions
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

function avg(nums: (number | null | undefined)[]): number | null {
  const vals = nums.filter((n): n is number => typeof n === "number" && !isNaN(n));
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
}

function topCounts(values: (string | null | undefined)[], limit = 3): { reason: string; count: number }[] {
  const map = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    const key = v.trim();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([reason, count]) => ({ reason, count }));
}

function isApproved(c: Claim): boolean {
  const o = (c.finalOutcome || c.initialOutcome || c.status || "").toLowerCase();
  return o.includes("approv") && !o.includes("partial");
}
function isPartial(c: Claim): boolean {
  const o = (c.finalOutcome || c.initialOutcome || c.status || "").toLowerCase();
  return o.includes("partial");
}
function isDenied(c: Claim): boolean {
  const o = (c.finalOutcome || c.initialOutcome || c.status || "").toLowerCase();
  return o.includes("deni") || !!c.denialReason;
}

export function computeCarrierIntelligence(
  claims: Claim[],
  evidenceFiles: EvidenceFile[] = [],
): CarrierIntelligence[] {
  // Index evidence files by claimId for fast lookup (denial letters only)
  const denialLettersByClaimId = new Map<string, EvidenceFile[]>();
  for (const f of evidenceFiles) {
    if (f.docCategory !== "denial_letter" || !f.claimId) continue;
    const existing = denialLettersByClaimId.get(f.claimId) ?? [];
    existing.push(f);
    denialLettersByClaimId.set(f.claimId, existing);
  }

  const byCarrier = new Map<string, Claim[]>();
  for (const c of claims) {
    const name = (c.carrier || "Unknown Carrier").trim();
    if (!byCarrier.has(name)) byCarrier.set(name, []);
    byCarrier.get(name)!.push(c);
  }

  const result: CarrierIntelligence[] = [];
  for (const [carrierName, group] of Array.from(byCarrier.entries())) {
    const n = group.length;
    const approved = group.filter(isApproved).length;
    const partial = group.filter(isPartial).length;
    const denied = group.filter(isDenied).length;

    const supReq = group.filter((c) => (c.supplementRequested ?? 0) > 0 || (c.supplementAmountTotal ?? 0) > 0);
    const supWon = supReq.filter((c) => (c.supplementApproved ?? 0) > 0 || (c.supplementOutcome || "").toLowerCase().includes("approv"));
    const escalated = group.filter((c) => c.escalationUsed);
    const escalationWon = escalated.filter((c) => c.denialOverturned || (c.finalOutcome || "").toLowerCase().includes("approv"));

    const supplementDeltas = group.map((c) => {
      if (typeof c.supplementApproved === "number" && typeof c.supplementRequested === "number") {
        return c.supplementApproved - c.supplementRequested;
      }
      return c.supplementAmountTotal ?? null;
    });

    // ── Pull denial reasons from manual fields AND extracted documents ─────
    const manualDenialReasons = group.map((c) => c.denialReason);
    const documentDenialReasons: string[] = [];
    for (const c of group) {
      const letters = denialLettersByClaimId.get(c.id) ?? [];
      for (const letter of letters) {
        const extracted = letter.extractedJson as Record<string, unknown> | null;
        if (!extracted) continue;
        const reason = extracted.denialReason ?? extracted.denial_reason ?? extracted.reasonForDenial;
        if (reason && typeof reason === "string" && reason.trim()) {
          documentDenialReasons.push(reason.trim());
        }
      }
    }
    const allDenialReasons = [...manualDenialReasons, ...documentDenialReasons];
    const commonDenialReasons = topCounts(allDenialReasons);

    const behaviorNotes: string[] = [];
    const denialRate = n ? denied / n : 0;
    if (denialRate >= 0.4) behaviorNotes.push("Elevated denial rate — front-load code & damage documentation.");
    if (supReq.length && supWon.length / supReq.length >= 0.5) behaviorNotes.push("Supplements succeed more often than not after documentation pressure.");
    if (escalated.length && escalationWon.length / escalated.length >= 0.5) behaviorNotes.push("Escalation/appraisal historically effective with this carrier.");
    if (n < 3) behaviorNotes.push("Low sample size — treat metrics as directional only.");

    // ── Loss-type breakdown ────────────────────────────────────────────────
    const byLossTypeMap = new Map<string, Claim[]>();
    for (const c of group) {
      const lt = (c.lossType || c.claimType || "Unknown").trim();
      if (!byLossTypeMap.has(lt)) byLossTypeMap.set(lt, []);
      byLossTypeMap.get(lt)!.push(c);
    }
    const byLossType: LossTypeBreakdown[] = Array.from(byLossTypeMap.entries())
      .map(([lossType, ltClaims]) => {
        const ltN = ltClaims.length;
        const ltApproved = ltClaims.filter(isApproved).length;
        const ltDenied = ltClaims.filter(isDenied).length;
        return {
          lossType,
          count: ltN,
          approvalRate: ltN ? Math.round((ltApproved / ltN) * 100) : 0,
          denialRate: ltN ? Math.round((ltDenied / ltN) * 100) : 0,
        };
      })
      .sort((a, b) => b.count - a.count);

    // ── Section 15 — Carrier Scorecard metrics (real data only)
    const overturned = group.filter((c) => c.denialOverturned === true).length;
    const reinspected = group.filter((c) => c.reinspectionRequested === true).length;
    const deniedThenApproved = group.filter((c) => {
      const init = (c.initialOutcome || "").toLowerCase();
      const fin = (c.finalOutcome || "").toLowerCase();
      return (init.includes("deni") || init.includes("reject")) && (fin.includes("approv") || fin.includes("paid") || c.denialOverturned === true);
    }).length;
    const resDays = group.map((c) => {
      const start = c.dateOfLoss ? new Date(c.dateOfLoss) : null;
      const end = c.resolutionDate ? new Date(c.resolutionDate) : (c.determinationDate ? new Date(c.determinationDate) : null);
      if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return null;
      const d = Math.round((end.getTime() - start.getTime()) / 86400000);
      return d >= 0 ? d : null;
    }).filter((d): d is number => d !== null);
    const overturnRate = denied > 0 ? Math.round((overturned / denied) * 100) : null;
    const reinspectionRate = n ? Math.round((reinspected / n) * 100) : null;
    const escalationRate = n ? Math.round((escalated.length / n) * 100) : null;
    const avgResolutionDays = resDays.length ? Math.round(resDays.reduce((s, d) => s + d, 0) / resDays.length) : null;
    const dataConfidence: "low" | "medium" | "high" = n >= 10 ? "high" : n >= 5 ? "medium" : "low";
    const commonSignals: string[] = [];
    if (overturnRate !== null && overturnRate >= 50) commonSignals.push("Denials frequently overturned on challenge");
    if (reinspectionRate !== null && reinspectionRate >= 40) commonSignals.push("Reinspection commonly required");
    if (escalationRate !== null && escalationRate >= 40) commonSignals.push("Escalation commonly required");
    if (deniedThenApproved >= 2) commonSignals.push("Pattern: denies first, pays later");

    result.push({
      carrierName,
      claimsCount: n,
      approvalRate: n ? Math.round((approved / n) * 100) / 100 : 0,
      denialRate: Math.round(denialRate * 100) / 100,
      partialApprovalRate: n ? Math.round((partial / n) * 100) / 100 : 0,
      supplementSuccessRate: supReq.length ? Math.round((supWon.length / supReq.length) * 100) / 100 : 0,
      supplementSampleSize: supReq.length,
      escalationSuccessRate: escalated.length ? Math.round((escalationWon.length / escalated.length) * 100) / 100 : 0,
      escalationSampleSize: escalated.length,
      avgResponseTimeDays: avg(group.map((c) => c.lifecycleVelocityScore)),
      commonDenialReasons,
      commonMissingScopeItems: topCounts(group.map((c) => c.vendorFinding)).map((x) => ({ item: x.reason, count: x.count })),
      avgRcv: avg(group.map((c) => c.rcvAmount ?? c.rcvTotal)),
      avgAcv: avg(group.map((c) => c.acvAmount ?? c.acvTotal)),
      avgSupplementDelta: avg(supplementDeltas),
      frictionIndex: avg(group.map((c) => c.frictionScore)),
      regionPatterns: topCounts(group.map((c) => c.state || c.city)).map((x) => ({ region: x.reason, count: x.count })),
      behaviorNotes,
      byLossType,
      insufficient: n < 3,
      dataConfidence,
      overturnRate,
      reinspectionRate,
      escalationRate,
      avgResolutionDays,
      deniedThenApprovedCount: deniedThenApproved,
      commonSignals,
      dataSource: "your_claims",
    });
  }
  result.sort((a, b) => b.claimsCount - a.claimsCount);
  return result;
}
