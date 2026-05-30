import type { Claim } from "@shared/schema";

/**
 * Carrier Intelligence MVP
 * ------------------------
 * Aggregates behavioral intelligence per carrier from claims already entered.
 * Contains NO homeowner PII — only carrier-level behavioral patterns. Safe to
 * show to non-Master roles (and is the carrier-facing intelligence layer).
 */
export interface CarrierIntelligence {
  carrierName: string;
  claimsCount: number;
  approvalRate: number;
  denialRate: number;
  partialApprovalRate: number;
  supplementSuccessRate: number;
  escalationSuccessRate: number;
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

export function computeCarrierIntelligence(claims: Claim[]): CarrierIntelligence[] {
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

    const behaviorNotes: string[] = [];
    const denialRate = n ? denied / n : 0;
    if (denialRate >= 0.4) behaviorNotes.push("Elevated denial rate — front-load code & damage documentation.");
    if (supReq.length && supWon.length / supReq.length >= 0.5) behaviorNotes.push("Supplements succeed more often than not after documentation pressure.");
    if (escalated.length && escalationWon.length / escalated.length >= 0.5) behaviorNotes.push("Escalation/appraisal historically effective with this carrier.");
    if (n < 3) behaviorNotes.push("Low sample size — treat metrics as directional only.");

    result.push({
      carrierName,
      claimsCount: n,
      approvalRate: n ? Math.round((approved / n) * 100) / 100 : 0,
      denialRate: Math.round(denialRate * 100) / 100,
      partialApprovalRate: n ? Math.round((partial / n) * 100) / 100 : 0,
      supplementSuccessRate: supReq.length ? Math.round((supWon.length / supReq.length) * 100) / 100 : 0,
      escalationSuccessRate: escalated.length ? Math.round((escalationWon.length / escalated.length) * 100) / 100 : 0,
      avgResponseTimeDays: avg(group.map((c) => c.lifecycleVelocityScore)),
      commonDenialReasons: topCounts(group.map((c) => c.denialReason)),
      commonMissingScopeItems: topCounts(group.map((c) => c.vendorFinding)).map((x) => ({ item: x.reason, count: x.count })),
      avgRcv: avg(group.map((c) => c.rcvAmount ?? c.rcvTotal)),
      avgAcv: avg(group.map((c) => c.acvAmount ?? c.acvTotal)),
      avgSupplementDelta: avg(supplementDeltas),
      frictionIndex: avg(group.map((c) => c.frictionScore)),
      regionPatterns: topCounts(group.map((c) => c.state || c.city)).map((x) => ({ region: x.reason, count: x.count })),
      behaviorNotes,
    });
  }
  result.sort((a, b) => b.claimsCount - a.claimsCount);
  return result;
}
