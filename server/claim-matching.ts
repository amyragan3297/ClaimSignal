import { storage } from "./storage";
import { isMaster } from "./masking";
import { type Claim, type InsertClaim } from "@shared/schema";
import { evaluateClaimCreationGate, logPrivacyGuardBlock } from "./entity-privacy";

export interface MatchResult {
  claim: Claim;
  created: boolean;
  matchedBy: string;
}

/** Coerce an unknown value to a trimmed string or null. */
export function coerceStr(val: unknown): string | null {
  if (val == null) return null;
  const s = typeof val === "string" ? val.trim() : String(val).trim();
  return s || null;
}

export interface ExtractionData {
  claimNumber?: string | null;
  carrier?: string | null;
  homeownerName?: string | null;
  insuredName?: string | null;
  lossType?: string | null;
  propertyAddress?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  dateOfLoss?: string | Date | null;
  policyNumber?: string | null;
  adjusterName?: string | null;
  adjusterEmail?: string | null;
  adjusterPhone?: string | null;
  rcv?: string | number | null;
  acv?: string | number | null;
  deductible?: string | number | null;
  supplementRequested?: string | number | null;
  supplementApproved?: string | number | null;
  supplementTotal?: string | number | null;
  recoverableDepreciation?: string | number | null;
  approvedAmount?: string | number | null;
  claimAmount?: string | number | null;
  finalPaid?: string | number | null;
  denialReason?: string | null;
  initialOutcome?: string | null;
  finalOutcome?: string | null;
  iaFirm?: string | null;
  vendor?: string | null;
  inspectionDate?: string | Date | null;
}

// ── Normalization ─────────────────────────────────────────────────────────

/** Normalize claim number: remove spaces, dashes, punctuation, uppercase. */
export function normalizeClaimNumber(v: string | null | undefined): string {
  if (!v) return "";
  return v
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[-_.,/#]/g, "")
    .trim();
}

/** Normalize address: uppercase, trim, expand common abbreviations. */
export function normalizeAddress(v: string | null | undefined): string {
  if (!v) return "";
  let s = v.toUpperCase().trim().replace(/\s+/g, " ");
  const abbrs: Array<[RegExp, string]> = [
    [/\bTRL\b|\bTRAIL\b/g, "TRAIL"],
    [/\bST\b|\bST\.\b/g, "STREET"],
    [/\bAVE\b|\bAVE\.\b/g, "AVENUE"],
    [/\bRD\b|\bRD\.\b/g, "ROAD"],
    [/\bDR\b|\bDR\.\b/g, "DRIVE"],
    [/\bBLVD\b|\bBLVD\.\b/g, "BOULEVARD"],
    [/\bLN\b|\bLN\.\b/g, "LANE"],
    [/\bCT\b|\bCT\.\b/g, "COURT"],
    [/\bCIR\b|\bCIR\.\b/g, "CIRCLE"],
    [/\bHWY\b|\bHWY\.\b/g, "HIGHWAY"],
    [/\bPKWY\b|\bPKWY\.\b/g, "PARKWAY"],
    [/\bPL\b|\bPL\.\b/g, "PLACE"],
    [/\bAPT\b|\bAPT\.\b/g, "APARTMENT"],
    [/\bSTE\b|\bSTE\.\b/g, "SUITE"],
    [/\bUNIT\b/g, "UNIT"],
    [/\bFL\b|\bFL\.\b/g, "FLOOR"],
    [/\bN\b|\bN\./g, "NORTH"],
    [/\bS\b|\bS\./g, "SOUTH"],
    [/\bE\b|\bE\./g, "EAST"],
    [/\bW\b|\bW\./g, "WEST"],
    [/\bNE\b/g, "NORTHEAST"],
    [/\bNW\b/g, "NORTHWEST"],
    [/\bSE\b/g, "SOUTHEAST"],
    [/\bSW\b/g, "SOUTHWEST"],
  ];
  for (const [re, repl] of abbrs) {
    s = s.replace(re, repl);
  }
  return s;
}

/** Normalize name: uppercase, trim, collapse extra spaces. */
export function normalizeName(v: string | null | undefined): string {
  if (!v) return "";
  return v.toUpperCase().trim().replace(/\s+/g, " ");
}

/** Normalize carrier: uppercase, trim, collapse spaces. */
export function normalizeCarrier(v: string | null | undefined): string {
  if (!v) return "";
  return v.toUpperCase().trim().replace(/\s+/g, " ");
}

// ── Matching logic ────────────────────────────────────────────────────────

function scoreClaimMatch(
  claim: Claim,
  extraction: ExtractionData
): { score: number; reasons: string[]; matchedBy: string } {
  let score = 0;
  const reasons: string[] = [];
  const extClaimNum = normalizeClaimNumber(extraction.claimNumber);
  const extAddr = normalizeAddress(extraction.propertyAddress || extraction.address);
  const extName = normalizeName(extraction.homeownerName || extraction.insuredName);
  const extCarrier = normalizeCarrier(extraction.carrier);

  const cClaimNum = normalizeClaimNumber(claim.claimNumber);
  const cAddr = normalizeAddress(claim.propertyAddress || claim.address);
  const cName = normalizeName(claim.homeownerName || claim.insuredName);
  const cCarrier = normalizeCarrier(claim.carrier);

  // A. normalized claim number + carrier
  if (extClaimNum && cClaimNum && extClaimNum === cClaimNum) {
    if (extCarrier && cCarrier && extCarrier === cCarrier) {
      score += 1.0;
      reasons.push("Claim number + carrier exact match");
      return { score, reasons, matchedBy: "claim_number+carrier" };
    }
    score += 0.6;
    reasons.push(`Claim number ${extraction.claimNumber} matches`);
  }

  // B. normalized property address + homeowner name
  if (extAddr && cAddr && extAddr === cAddr) {
    if (extName && cName && extName === cName) {
      score += 0.95;
      reasons.push("Address + homeowner name exact match");
      return { score, reasons, matchedBy: "address+homeowner" };
    }
    score += 0.5;
    reasons.push("Property address matches");
  } else if (extAddr && cAddr && (extAddr.includes(cAddr) || cAddr.includes(extAddr))) {
    if (extAddr.length > 8 && cAddr.length > 8) {
      score += 0.35;
      reasons.push("Property address substring match");
    }
  }

  // C. normalized claim number alone
  if (extClaimNum && cClaimNum && extClaimNum === cClaimNum) {
    score += 0.6;
    reasons.push(`Claim number ${extraction.claimNumber} matches (standalone)`);
  }

  // D. normalized property address alone
  if (extAddr && cAddr && extAddr === cAddr) {
    score += 0.4;
    reasons.push("Property address matches (standalone)");
  }

  // Name-only fallback (weak)
  if (extName && cName && extName === cName && extName.length > 3) {
    score += 0.15;
    reasons.push("Homeowner name matches");
  }

  // Determine matchedBy reason
  let matchedBy = "none";
  if (score >= 1.0) matchedBy = "claim_number+carrier";
  else if (score >= 0.95) matchedBy = "address+homeowner";
  else if (extClaimNum && cClaimNum && extClaimNum === cClaimNum) matchedBy = "claim_number";
  else if (extAddr && cAddr && extAddr === cAddr) matchedBy = "address";
  else if (extName && cName && extName === cName) matchedBy = "homeowner";

  return { score: Math.min(score, 1), reasons, matchedBy };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Find an existing claim by normalized extraction data, or create a new one.
 * This is the ONLY path for creating claims from uploaded documents.
 */
export async function findOrCreateClaimFromExtraction(
  extraction: ExtractionData,
  opts: {
    organizationId: string;
    role: string;
    userId: string;
    fileId?: string;
    fileDocCategory?: string | null;
  }
): Promise<MatchResult> {
  const { organizationId, role } = opts;
  const claimPool = isMaster(role)
    ? await storage.getAllClaimsAcrossTenants()
    : await storage.getClaims(organizationId);

  const extClaimNum = normalizeClaimNumber(extraction.claimNumber);
  const extAddr = normalizeAddress(extraction.propertyAddress || extraction.address);
  const extName = normalizeName(extraction.homeownerName || extraction.insuredName);
  const extCarrier = normalizeCarrier(extraction.carrier);

  // Log extracted values
  console.log(`[claim-matching] extracted: claimNum="${extraction.claimNumber}" normalized="${extClaimNum}" addr="${extraction.propertyAddress || extraction.address}" normalized="${extAddr}" name="${extraction.homeownerName || extraction.insuredName}" normalized="${extName}" carrier="${extraction.carrier}" normalized="${extCarrier}"`);

  // Score every claim
  const scored = claimPool
    .map((claim) => {
      const { score, reasons, matchedBy } = scoreClaimMatch(claim, extraction);
      return { claim, score, reasons, matchedBy };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const MATCH_THRESHOLD = 0.55;

  if (best && best.score >= MATCH_THRESHOLD) {
    console.log(`[claim-matching] MATCHED existing claim ${best.claim.id} (claimNum=${best.claim.claimNumber}) score=${best.score.toFixed(2)} matchedBy=${best.matchedBy} reasons=[${best.reasons.join("; ")}]`);

    // If fileId provided, attach the document
    if (opts.fileId) {
      await storage.updateEvidenceFile(opts.fileId, organizationId, { claimId: best.claim.id });
    }

    return { claim: best.claim, created: false, matchedBy: best.matchedBy };
  }

  // No match — create a new claim
  // Privacy Guard: validate claim creation gate before auto-creating
  const gate = evaluateClaimCreationGate({
    propertyAddress: extraction.propertyAddress,
    homeownerName: extraction.homeownerName || extraction.insuredName,
    lossType: extraction.lossType,
    dateOfLoss: extraction.dateOfLoss ? String(extraction.dateOfLoss) : null,
    carrierName: extraction.carrier,
    hasEvidence: true,
  });
  if (!gate.allowed) {
    const blockedName = extraction.homeownerName || extraction.insuredName || "unknown";
    await logPrivacyGuardBlock(
      blockedName,
      "auto_claim_create",
      "claim",
      gate.reason || "Auto claim creation gate failed",
      opts.userId,
      opts.role,
      opts.fileId,
    );
    console.log(`[claim-matching] BLOCKED auto claim creation: ${gate.reason}`);
    throw new Error(gate.reason);
  }

  const newClaim = await storage.createClaim(buildClaimFromExtraction(extraction, organizationId));
  console.log(`[claim-matching] CREATED new claim ${newClaim.id} (claimNum=${newClaim.claimNumber})`);

  if (opts.fileId) {
    await storage.updateEvidenceFile(opts.fileId, organizationId, { claimId: newClaim.id });
  }

  return { claim: newClaim, created: true, matchedBy: "new" };
}

/**
 * Build a claim insert object from extraction data.
 */
export function buildClaimFromExtraction(
  extraction: ExtractionData,
  organizationId: string
): InsertClaim {
  const claimNum = extraction.claimNumber?.trim() || `CLM-${Date.now().toString().slice(-6)}`;

  return {
    organizationId,
    claimNumber: claimNum,
    policyNumber: extraction.policyNumber || null,
    homeownerName: extraction.homeownerName || null,
    insuredName: extraction.insuredName || null,
    lossType: extraction.lossType || null,
    carrier: extraction.carrier || null,
    propertyAddress: extraction.propertyAddress || null,
    address: extraction.address || null,
    city: extraction.city || null,
    state: extraction.state || null,
    zipCode: extraction.zipCode || null,
    dateOfLoss: parseDate(extraction.dateOfLoss),
    inspectionDate: parseDate(extraction.inspectionDate),
    rcvAmount: parseNumeric(extraction.rcv),
    acvAmount: parseNumeric(extraction.acv),
    deductible: parseNumeric(extraction.deductible),
    supplementRequested: parseNumeric(extraction.supplementRequested),
    supplementApproved: parseNumeric(extraction.supplementApproved),
    supplementAmountTotal: parseNumeric(extraction.supplementTotal),
    recoverableDepreciation: parseNumeric(extraction.recoverableDepreciation),
    approvedAmount: parseNumeric(extraction.approvedAmount),
    claimAmount: parseNumeric(extraction.claimAmount),
    finalPaidAmount: parseNumeric(extraction.finalPaid),
    denialReason: extraction.denialReason || null,
    initialOutcome: extraction.initialOutcome || null,
    finalOutcome: extraction.finalOutcome || null,
    iaFirm: extraction.iaFirm || null,
    vendorName: extraction.vendor || null,
    status: "open",
  };
}

function parseNumeric(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,\s]/g, ""));
  return isNaN(n) ? null : n;
}

function parseDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// ── Duplicate detection (admin-safe) ─────────────────────────────────────

export interface DuplicateGroup {
  normalizedKey: string;
  claims: Array<{ id: string; claimNumber: string; homeownerName: string | null; propertyAddress: string | null; carrier: string | null }>;
  reason: string;
}

/**
 * Identify likely duplicate claims by normalized claim number, address,
 * homeowner name, and carrier. Returns a report without merging.
 */
export async function findDuplicateClaims(
  role: string,
  organizationId?: string
): Promise<DuplicateGroup[]> {
  const claims = isMaster(role) && !organizationId
    ? await storage.getAllClaimsAcrossTenants()
    : await storage.getClaims(organizationId || "");

  const byClaimNum = new Map<string, typeof claims>();
  const byAddrName = new Map<string, typeof claims>();
  const byAddr = new Map<string, typeof claims>();

  for (const claim of claims) {
    const nClaimNum = normalizeClaimNumber(claim.claimNumber);
    const nAddr = normalizeAddress(claim.propertyAddress || claim.address);
    const nName = normalizeName(claim.homeownerName || claim.insuredName);
    const nCarrier = normalizeCarrier(claim.carrier);

    if (nClaimNum) {
      const key = nCarrier ? `${nClaimNum}|${nCarrier}` : nClaimNum;
      byClaimNum.set(key, [...(byClaimNum.get(key) || []), claim]);
    }
    if (nAddr && nName) {
      const key = `${nAddr}|${nName}`;
      byAddrName.set(key, [...(byAddrName.get(key) || []), claim]);
    }
    if (nAddr) {
      byAddr.set(nAddr, [...(byAddr.get(nAddr) || []), claim]);
    }
  }

  const groups: DuplicateGroup[] = [];

  byClaimNum.forEach((group, key) => {
    if (group.length > 1) {
      groups.push({
        normalizedKey: key,
        claims: group.map((c: Claim) => ({
          id: c.id,
          claimNumber: c.claimNumber,
          homeownerName: c.homeownerName || c.insuredName,
          propertyAddress: c.propertyAddress || c.address,
          carrier: c.carrier,
        })),
        reason: "Normalized claim number",
      });
    }
  });

  byAddrName.forEach((group, key) => {
    if (group.length > 1) {
      groups.push({
        normalizedKey: key,
        claims: group.map((c: Claim) => ({
          id: c.id,
          claimNumber: c.claimNumber,
          homeownerName: c.homeownerName || c.insuredName,
          propertyAddress: c.propertyAddress || c.address,
          carrier: c.carrier,
        })),
        reason: "Normalized address + homeowner name",
      });
    }
  });

  byAddr.forEach((group, key) => {
    if (group.length > 1) {
      groups.push({
        normalizedKey: key,
        claims: group.map((c: Claim) => ({
          id: c.id,
          claimNumber: c.claimNumber,
          homeownerName: c.homeownerName || c.insuredName,
          propertyAddress: c.propertyAddress || c.address,
          carrier: c.carrier,
        })),
        reason: "Normalized address",
      });
    }
  });

  return groups;
}
