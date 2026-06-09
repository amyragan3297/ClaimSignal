/**
 * ClaimSignal Entity Classification & Privacy Guard
 * ==================================================
 * Enforces entity classification rules and prevents misclassification
 * of non-claim people, employers, business contacts, and internal personnel.
 *
 * Reference: .agents/skills/claimsignal-entity-privacy/SKILL.md
 */

import { storage } from "./storage";
import { type InsertEntityClassification } from "@shared/schema";

// ── Protected Entity List ──
// Names and entities that must NEVER be classified as homeowners, claims,
// adjusters, carriers, or public intelligence records.

export const PROTECTED_NAMES = new Set([
  "jeremy timko", "jeremy timco",
  "travis peete",
  "catherine",
  "chris",
  "jessica",
  "rob",
  "brad",
  "kenzie",
  "ashley",
]);

export const PROTECTED_COMPANIES = new Set([
  "aerial ai solutions", "aais",
  "pay it forward processing",
  "revolution roofing",
  "uah",
  "i²c", "i2c",
]);

// Categories that are NEVER claim-related
export const NON_CLAIM_ENTITY_TYPES = new Set([
  "organization", "employer", "employee", "vendor",
  "business_contact", "internal_reference", "executive", "manager", "investor",
]);

// ── Normalization ──

export function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isProtectedName(name: string): boolean {
  const normalized = normalizeEntityName(name);
  if (PROTECTED_NAMES.has(normalized)) return true;
  // Check for partial matches on full names
  for (const protectedName of Array.from(PROTECTED_NAMES)) {
    if (normalized.includes(protectedName) || protectedName.includes(normalized)) return true;
  }
  return false;
}

export function isProtectedCompany(name: string): boolean {
  const normalized = normalizeEntityName(name);
  if (PROTECTED_COMPANIES.has(normalized)) return true;
  for (const company of Array.from(PROTECTED_COMPANIES)) {
    if (normalized.includes(company) || company.includes(normalized)) return true;
  }
  return false;
}

export function isProtectedEntity(name: string): boolean {
  return isProtectedName(name) || isProtectedCompany(name);
}

export function getProtectedReason(name: string): string {
  if (isProtectedName(name)) return "Protected internal personnel name";
  if (isProtectedCompany(name)) return "Protected internal company/organization";
  return "Unknown protection status";
}

// ── Claim Creation Gate ──

export interface ClaimCreationGateResult {
  allowed: boolean;
  reason?: string;
  missingFields?: string[];
}

export function evaluateClaimCreationGate(claimData: {
  propertyAddress?: string | null;
  homeownerName?: string | null;
  lossType?: string | null;
  dateOfLoss?: string | null;
  carrierName?: string | null;
  hasEvidence?: boolean;
}): ClaimCreationGateResult {
  const missingFields: string[] = [];

  if (!claimData.propertyAddress || claimData.propertyAddress.trim().length === 0) {
    missingFields.push("propertyAddress");
  }
  if (!claimData.homeownerName || claimData.homeownerName.trim().length === 0) {
    missingFields.push("homeownerName");
  } else if (isProtectedEntity(claimData.homeownerName)) {
    return {
      allowed: false,
      reason: `Protected entity detected as homeowner: "${claimData.homeownerName}". This name cannot be classified as a claim homeowner.`,
      missingFields: ["homeownerName"],
    };
  }
  if (!claimData.lossType || claimData.lossType.trim().length === 0) {
    missingFields.push("lossType");
  }
  if (!claimData.dateOfLoss || claimData.dateOfLoss.trim().length === 0) {
    missingFields.push("dateOfLoss");
  }
  if (!claimData.carrierName || claimData.carrierName.trim().length === 0) {
    missingFields.push("carrierName");
  } else if (isProtectedEntity(claimData.carrierName)) {
    return {
      allowed: false,
      reason: `Protected entity detected as carrier: "${claimData.carrierName}". This entity cannot be classified as a claim carrier.`,
      missingFields: ["carrierName"],
    };
  }
  if (!claimData.hasEvidence) {
    missingFields.push("evidence");
  }

  if (missingFields.length > 0) {
    return {
      allowed: false,
      reason: `Missing required fields for claim creation: ${missingFields.join(", ")}`,
      missingFields,
    };
  }

  return { allowed: true };
}

// ── Adjuster Linking Guard ──

export interface AdjusterLinkingResult {
  allowed: boolean;
  reason?: string;
}

export function evaluateAdjusterLinking(adjusterName: string): AdjusterLinkingResult {
  if (isProtectedEntity(adjusterName)) {
    return {
      allowed: false,
      reason: `Protected entity cannot be linked as adjuster: "${adjusterName}"`,
    };
  }
  return { allowed: true };
}

// ── Privacy Guard Logging ──

export async function logPrivacyGuardBlock(
  entityName: string,
  attemptedAction: string,
  attemptedRecordType: string,
  blockedReason: string,
  userId?: string,
  userRole?: string,
  sourceDocumentId?: string,
  claimId?: string,
): Promise<void> {
  try {
    await storage.createPrivacyGuardLog({
      entityName,
      attemptedAction,
      attemptedRecordType,
      blockedReason,
      userId,
      userRole,
      sourceDocumentId,
      claimId,
    });
  } catch {
    // Non-fatal: logging failure should not block the operation
  }
}

// ── Entity Classification ──

export async function classifyEntity(
  name: string,
  entityType: string,
  options: {
    classificationReason?: string;
    sourceDocumentId?: string;
    claimId?: string;
    classifiedBy?: string;
    confidenceScore?: number;
  } = {},
): Promise<{ classification: Awaited<ReturnType<typeof storage.createEntityClassification>>; wasProtected: boolean }> {
  const normalizedName = normalizeEntityName(name);
  const isProtected = isProtectedEntity(name);

  const data: InsertEntityClassification = {
    name: name.trim(),
    normalizedName,
    entityType: (isProtected ? "internal_reference" : entityType) as InsertEntityClassification["entityType"],
    classificationReason: options.classificationReason || (isProtected ? getProtectedReason(name) : undefined),
    sourceDocumentId: options.sourceDocumentId,
    claimId: options.claimId,
    isProtected,
    protectedReason: isProtected ? getProtectedReason(name) : undefined,
    classifiedBy: options.classifiedBy,
    confidenceScore: options.confidenceScore,
    status: isProtected ? "blocked" : "approved",
  };

  const classification = await storage.createEntityClassification(data);
  return { classification, wasProtected: isProtected };
}

// ── Historical Cleanup Scanner ──

export interface CleanupScanResult {
  misclassifiedHomeowners: Array<{ claimId: string; homeownerName: string; reason: string }>;
  misclassifiedAdjusters: Array<{ adjusterId: string; adjusterName: string; reason: string }>;
  misclassifiedCompanies: Array<{ recordId: string; companyName: string; reason: string }>;
  incompleteClaims: Array<{ claimId: string; missingFields: string[]; reason: string }>;
  totalFlags: number;
}

export async function runEntityCleanupScan(): Promise<CleanupScanResult> {
  const result: CleanupScanResult = {
    misclassifiedHomeowners: [],
    misclassifiedAdjusters: [],
    misclassifiedCompanies: [],
    incompleteClaims: [],
    totalFlags: 0,
  };

  // Scan all claims for protected names in homeowner fields
  const allClaims = await storage.getAllClaimsAcrossTenants();
  for (const claim of allClaims) {
    const missingFields: string[] = [];
    if (!claim.propertyAddress || claim.propertyAddress.trim().length === 0) missingFields.push("propertyAddress");
    if (!claim.homeownerName || claim.homeownerName.trim().length === 0) missingFields.push("homeownerName");
    if (!claim.lossType || claim.lossType.trim().length === 0) missingFields.push("lossType");
    if (!claim.carrier || claim.carrier.trim().length === 0) missingFields.push("carrierName");

    if (missingFields.length > 0) {
      result.incompleteClaims.push({
        claimId: claim.id,
        missingFields,
        reason: `Missing required fields: ${missingFields.join(", ")}`,
      });
      result.totalFlags++;
    }

    if (claim.homeownerName && isProtectedEntity(claim.homeownerName)) {
      result.misclassifiedHomeowners.push({
        claimId: claim.id,
        homeownerName: claim.homeownerName,
        reason: `Protected name "${claim.homeownerName}" detected in homeowner field`,
      });
      result.totalFlags++;
    }

    if (claim.carrier && isProtectedCompany(claim.carrier)) {
      result.misclassifiedCompanies.push({
        recordId: claim.id,
        companyName: claim.carrier,
        reason: `Protected company "${claim.carrier}" detected in carrier field`,
      });
      result.totalFlags++;
    }
  }

  // Scan all adjusters for protected names
  const allAdjusters = await storage.getAllAdjustersAcrossTenants();
  for (const adjuster of allAdjusters) {
    const adjusterName = adjuster.adjusterName?.trim() || "";
    if (adjusterName && isProtectedEntity(adjusterName)) {
      result.misclassifiedAdjusters.push({
        adjusterId: adjuster.id,
        adjusterName,
        reason: `Protected name "${adjusterName}" detected in adjuster record`,
      });
      result.totalFlags++;
    }
  }

  // Persist cleanup flags
  for (const item of result.misclassifiedHomeowners) {
    await storage.createEntityCleanupFlag({
      recordType: "claim",
      recordId: item.claimId,
      recordField: "homeownerName",
      detectedValue: item.homeownerName,
      flagReason: item.reason,
      severity: "high",
    });
  }

  for (const item of result.misclassifiedAdjusters) {
    await storage.createEntityCleanupFlag({
      recordType: "adjuster",
      recordId: item.adjusterId,
      detectedValue: item.adjusterName,
      flagReason: item.reason,
      severity: "high",
    });
  }

  for (const item of result.misclassifiedCompanies) {
    await storage.createEntityCleanupFlag({
      recordType: "claim",
      recordId: item.recordId,
      recordField: "carrierName",
      detectedValue: item.companyName,
      flagReason: item.reason,
      severity: "high",
    });
  }

  for (const item of result.incompleteClaims) {
    await storage.createEntityCleanupFlag({
      recordType: "claim",
      recordId: item.claimId,
      detectedValue: item.missingFields.join(", "),
      flagReason: item.reason,
      severity: "medium",
    });
  }

  return result;
}

// ── Intelligence Engine Filtering ──

export function shouldIncludeInIntelligence(entityType: string | null | undefined): boolean {
  if (!entityType) return false;
  return !NON_CLAIM_ENTITY_TYPES.has(entityType);
}

export function filterIntelligenceEntities<T extends { name?: string | null; entityType?: string | null }>(
  entities: T[],
): T[] {
  return entities.filter((e) => {
    if (!e.name) return false;
    if (isProtectedEntity(e.name)) return false;
    return shouldIncludeInIntelligence(e.entityType);
  });
}

// ── AI Extraction Prompt Guard ──

export function buildEntityExtractionPrompt(basePrompt: string): string {
  const protectedList = Array.from(PROTECTED_NAMES).concat(Array.from(PROTECTED_COMPANIES)).join(", ");
  return `${basePrompt}

── Entity Classification Rules (MANDATORY) ──

Before returning any extracted entity, you MUST classify it into one of these types:
- homeowner — The insured property owner
- adjuster — Insurance carrier adjuster
- carrier_representative — Carrier staff
- contractor — Restoration/roofing contractor
- company — Business entity
- organization — Institutional entity
- employer — Current/past employer
- employee — Internal staff
- vendor — Third-party vendor
- business_contact — Business partner
- internal_reference — Internal-only

── PROTECTED ENTITIES (NEVER classify as homeowners, adjusters, or carriers) ──

The following names and companies must NEVER be classified as claim-related entities:
${protectedList}

Rule: Do NOT default names to "homeowner". A name alone is never sufficient.
Rule: If a protected entity is detected, classify it as "internal_reference" and exclude it from claim intelligence.

Return only classified entities with their entity_type field. Exclude any entity classified as internal_reference, employer, employee, vendor, business_contact, or organization from claim-related output.`;
}
