// ──────────────────────────────────────────────────────────────────────────
// Playbook Engine (MVP, rule-based) — shared logic for:
//   Section 17  : Playbook Search Engine (NL -> filters -> historical results)
//   Section 17A : Playbook Recommendation Engine (similar historical claims)
//
// This is SEPARATE from the Action Engine (/api/playbooks*, what to do now) and
// from the curated playbook library recommendations. It operates over REAL
// historical claim outcomes only. It NEVER fabricates results.
// ──────────────────────────────────────────────────────────────────────────
import type { Claim } from "@shared/schema";

export interface PlaybookFilters {
  carrier?: string;
  adjusterName?: string;
  status?: string;
  initialOutcome?: string;
  finalOutcome?: string;
  damageType?: string;
  denialReason?: string;
  escalationUsed?: boolean;
  reinspectionRequested?: boolean;
  supplementOutcome?: string;
  doiInvolved?: boolean;
  repairabilityIssue?: boolean;
  matchingIssue?: boolean;
  brittleTest?: boolean;
  codeDispute?: boolean;
  missingLineItems?: boolean;
  deniedThenApproved?: boolean;
  partialToFull?: boolean;
  textTerms?: string[];
}

const lc = (v: unknown): string => (typeof v === "string" ? v.toLowerCase() : "");

function outcomeIs(value: unknown, kind: "denied" | "approved" | "partial" | "paid"): boolean {
  const v = lc(value);
  if (!v) return false;
  switch (kind) {
    case "denied":
      return v.includes("deni") || v.includes("reject");
    case "approved":
      return v.includes("approv") || v.includes("full") || v.includes("paid");
    case "partial":
      return v.includes("partial");
    case "paid":
      return v.includes("paid") || v.includes("payment");
  }
}

function claimText(c: Claim): string {
  return [
    c.carrier, c.lossType, c.status, c.initialOutcome, c.finalOutcome,
    c.denialReason, c.supplementOutcome, c.reinspectionOutcome,
    c.whatWorked, c.whatDidNotWork, c.playbookNote, c.notes,
    c.aiClaimSummary,
  ].map(lc).join(" ");
}

// ── Natural-language query -> structured filters (deterministic keyword pass).
// Used directly, and as a guaranteed fallback when AI parsing is unavailable.
export function parseQueryToFilters(query: string, knownCarriers: string[] = []): PlaybookFilters {
  const q = lc(query);
  const f: PlaybookFilters = {};
  if (!q.trim()) return f;

  for (const carrier of knownCarriers) {
    if (carrier && q.includes(lc(carrier))) { f.carrier = carrier; break; }
  }

  const deniedFirst = /(denied|denial|rejected)/.test(q);
  const laterApproved = /(later|then|eventually|after).*(approv|paid|overturn)|overturn|paid after|approved after/.test(q);
  if (deniedFirst) f.initialOutcome = "denied";
  if (/(approv|paid|overturn|full)/.test(q)) f.finalOutcome = "approved";
  if (deniedFirst && laterApproved) f.deniedThenApproved = true;

  if (/partial.*(full|approv)/.test(q) || /partial to full/.test(q)) f.partialToFull = true;
  if (/reinspect|re-inspect|second inspection/.test(q)) f.reinspectionRequested = true;
  if (/escalat|doi|department of insurance|appraisal|attorney|legal/.test(q)) f.escalationUsed = true;
  if (/doi|department of insurance/.test(q)) f.doiInvolved = true;
  if (/supplement/.test(q)) f.supplementOutcome = "any";
  if (/repairab|repair only|not repairable/.test(q)) f.repairabilityIssue = true;
  if (/match(ing)? (dispute|issue|problem)|matching/.test(q)) f.matchingIssue = true;
  if (/brittle/.test(q)) f.brittleTest = true;
  if (/\bcode\b|code dispute|code upgrade/.test(q)) f.codeDispute = true;
  if (/missing line item|missing item|line items/.test(q)) f.missingLineItems = true;
  if (/hail/.test(q)) f.damageType = "hail";
  else if (/wind/.test(q)) f.damageType = "wind";

  // Residual significant words become loose text terms (>=4 chars, not stopwords).
  const stop = new Set(["show","every","claim","claims","that","with","were","where","which","later","after","first","then","involving","reached","help","used","carrier","adjuster","denied","approved"]);
  f.textTerms = Array.from(new Set(q.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !stop.has(w))));
  return f;
}

function matchesText(c: Claim, terms: string[] | undefined): boolean {
  if (!terms || terms.length === 0) return true;
  const hay = claimText(c);
  return terms.some((t) => hay.includes(t));
}

// Filter a claim set against structured filters. adjusterNamesByClaim lets us
// match by adjuster without re-querying inside the loop.
export function filterClaims(
  claims: Claim[],
  f: PlaybookFilters,
  adjusterNamesByClaim?: Map<string, string[]>,
): Claim[] {
  return claims.filter((c) => {
    if (f.carrier && lc(c.carrier) !== lc(f.carrier)) return false;
    if (f.status && lc(c.status) !== lc(f.status)) return false;
    if (f.damageType && !lc(c.lossType).includes(lc(f.damageType))) return false;
    if (f.adjusterName) {
      const names = adjusterNamesByClaim?.get(c.id) ?? [];
      if (!names.some((n) => lc(n).includes(lc(f.adjusterName!)))) return false;
    }
    if (f.initialOutcome === "denied" && !outcomeIs(c.initialOutcome, "denied")) return false;
    if (f.finalOutcome === "approved" && !(outcomeIs(c.finalOutcome, "approved") || c.denialOverturned === true)) return false;
    if (f.deniedThenApproved && !(outcomeIs(c.initialOutcome, "denied") && (outcomeIs(c.finalOutcome, "approved") || c.denialOverturned === true))) return false;
    if (f.partialToFull && !(outcomeIs(c.initialOutcome, "partial") && outcomeIs(c.finalOutcome, "approved"))) return false;
    if (f.reinspectionRequested && c.reinspectionRequested !== true) return false;
    if (f.escalationUsed && c.escalationUsed !== true) return false;
    if (f.denialReason && !lc(c.denialReason).includes(lc(f.denialReason))) return false;
    if (f.supplementOutcome && f.supplementOutcome !== "any" && !lc(c.supplementOutcome).includes(lc(f.supplementOutcome))) return false;
    if (f.supplementOutcome === "any" && !c.supplementOutcome && !c.supplementRequested) return false;
    if (f.repairabilityIssue && !claimText(c).includes("repairab")) return false;
    if (f.matchingIssue && !claimText(c).includes("match")) return false;
    if (f.brittleTest && !claimText(c).includes("brittle")) return false;
    if (f.codeDispute && !claimText(c).includes("code")) return false;
    if (f.missingLineItems && !(claimText(c).includes("missing") && claimText(c).includes("line"))) return false;
    if (f.doiInvolved && !claimText(c).includes("doi") && !claimText(c).includes("department of insurance")) return false;
    if (!matchesText(c, f.textTerms)) return false;
    return true;
  });
}

// A claim is a usable "playbook outcome" if it has enough recorded outcome data.
export function isUsableOutcome(c: Claim): boolean {
  return Boolean(c.initialOutcome || c.finalOutcome || c.denialOverturned || c.reinspectionRequested || c.escalationUsed || c.whatWorked);
}

function _cycleTimeDays(c: Claim): number | null {
  const start = c.dateOfLoss ? new Date(c.dateOfLoss) : null;
  const end = c.resolutionDate ? new Date(c.resolutionDate) : (c.determinationDate ? new Date(c.determinationDate) : null);
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const d = Math.round((end.getTime() - start.getTime()) / 86400000);
  return d >= 0 ? d : null;
}

// Build a reusable, honest strategy summary from recorded fields only.
export function buildStrategySummary(c: Claim): {
  initialOutcome: string | null;
  finalOutcome: string | null;
  path: string[];
  keyEvidence: string[];
  reusableStrategy: string[];
  confidence: "high" | "medium" | "low";
} {
  const path: string[] = [];
  if (outcomeIs(c.initialOutcome, "denied")) path.push("Initial denial");
  if (outcomeIs(c.initialOutcome, "partial")) path.push("Initial partial approval");
  if (c.reinspectionRequested) path.push("Reinspection requested" + (c.reinspectionOutcome ? ` (${c.reinspectionOutcome})` : ""));
  if (c.escalationUsed) path.push("Escalation used");
  if (c.denialOverturned) path.push("Denial overturned");
  if (c.supplementOutcome) path.push(`Supplement ${c.supplementOutcome}`);
  if (outcomeIs(c.finalOutcome, "approved")) path.push("Reached approval");

  const keyEvidence: string[] = [];
  if (c.photosUploaded) keyEvidence.push("Photo documentation");
  if (c.denialLetterUploaded) keyEvidence.push("Denial letter");
  if (c.estimateUploaded) keyEvidence.push("Estimate comparison");
  if (c.supplementUploaded) keyEvidence.push("Supplement package");
  if (c.codeDocUploaded) keyEvidence.push("Code documentation");
  if (c.manufacturerDocUploaded) keyEvidence.push("Manufacturer documentation");
  if (c.stormReportStatus) keyEvidence.push("Storm report");

  const reusableStrategy: string[] = [];
  if (c.whatWorked && typeof c.whatWorked === "string") reusableStrategy.push(c.whatWorked);
  else {
    if (c.reinspectionRequested) reusableStrategy.push("Request reinspection with organized supporting documentation");
    if (c.photosUploaded) reusableStrategy.push("Submit annotated photo evidence");
    if (c.escalationUsed) reusableStrategy.push("Escalate when carrier resists supported claim");
  }

  let confidence: "high" | "medium" | "low" = "low";
  const dataPoints = [c.initialOutcome, c.finalOutcome, c.reinspectionOutcome, c.supplementOutcome, c.whatWorked].filter(Boolean).length
    + keyEvidence.length;
  if (dataPoints >= 5) confidence = "high";
  else if (dataPoints >= 3) confidence = "medium";

  return {
    initialOutcome: c.initialOutcome ?? null,
    finalOutcome: c.finalOutcome ?? null,
    path,
    keyEvidence,
    reusableStrategy,
    confidence,
  };
}

// ── Section 17A: similarity scoring of a candidate claim vs the target claim.
export function similarityScore(target: Claim, candidate: Claim, targetAdjusterIds: Set<string>, candidateAdjusterIds: Set<string>): {
  score: number;
  factors: string[];
} {
  let score = 0;
  let max = 0;
  const factors: string[] = [];

  // Same carrier (weight 30)
  max += 30;
  if (target.carrier && candidate.carrier && lc(target.carrier) === lc(candidate.carrier)) { score += 30; factors.push("Same carrier"); }

  // Shared adjuster (weight 20)
  max += 20;
  const sharedAdj = Array.from(targetAdjusterIds).some((id) => candidateAdjusterIds.has(id));
  if (sharedAdj) { score += 20; factors.push("Same adjuster"); }

  // Similar damage type (weight 15)
  max += 15;
  if (target.lossType && candidate.lossType && lc(target.lossType) === lc(candidate.lossType)) { score += 15; factors.push("Similar damage type"); }

  // Similar denial reason (weight 15)
  max += 15;
  if (target.denialReason && candidate.denialReason && lc(candidate.denialReason).includes(lc(target.denialReason).split(/\s+/)[0] || "~")) { score += 15; factors.push("Similar denial reason"); }

  // Similar escalation path (weight 10)
  max += 10;
  if (Boolean(target.escalationUsed) === Boolean(candidate.escalationUsed) && (target.escalationUsed || candidate.reinspectionRequested === target.reinspectionRequested)) {
    if (target.escalationUsed && candidate.escalationUsed) { score += 10; factors.push("Similar escalation path"); }
    else if (Boolean(target.reinspectionRequested) && Boolean(candidate.reinspectionRequested)) { score += 10; factors.push("Similar reinspection path"); }
  }

  // Similar initial outcome (weight 10)
  max += 10;
  if (target.initialOutcome && candidate.initialOutcome && lc(target.initialOutcome) === lc(candidate.initialOutcome)) { score += 10; factors.push("Similar initial outcome"); }

  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return { score: pct, factors };
}
