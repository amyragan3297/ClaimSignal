import type { ClaimAdjuster } from "@shared/schema";
import { storage } from "./storage";

export interface AdjusterMention {
  name: string;
  roleLabel?: string;
  email?: string;
  phone?: string;
  carrier?: string;
  confidenceScore?: number;
}

export interface LinkSource {
  sourceType: "document" | "transcript" | "audio" | "communication" | "manual" | "system" | "unknown";
  sourceDocumentId?: string;
  sourceTranscriptId?: string;
  sourceAudioId?: string;
}

/**
 * Normalize a raw name string to "First Last" canonical form.
 * Handles: "CODY VINES" → "Cody Vines"
 *          "Vines, Cody M." → "Cody M. Vines"
 *          extra whitespace, mixed casing
 */
export function normalizeAdjusterName(raw: string): string {
  let s = raw.trim();
  if (!s) return s;

  if (s === s.toUpperCase() && s.length > 2) {
    s = s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const commaMatch = s.match(/^([A-Za-z'-]+),\s*(.+)$/);
  if (commaMatch) {
    s = `${commaMatch[2].trim()} ${commaMatch[1].trim()}`;
  }

  return s.replace(/\s+/g, " ").trim();
}

/**
 * Build a comparison key that ignores middle initials so that
 * "Cody M. Vines", "Cody Vines", and "CODY VINES" all map to "cody vines".
 * Used only for dedup lookups — the stored name is always the normalized form.
 */
function nameComparisonKey(name: string): string {
  return normalizeAdjusterName(name)
    .toLowerCase()
    .replace(/\s+[a-z]\.\s+/g, " ")
    .replace(/\s+[a-z]\s+(?=[a-z])/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCarrierKey(carrier: string | null | undefined): string {
  if (!carrier) return "";
  const k = carrier.trim().toLowerCase();
  if (k === "unknown" || k === "") return "";
  return k;
}

type ClaimAdjusterRole =
  | "primary_adjuster"
  | "field_adjuster"
  | "desk_adjuster"
  | "catastrophe_adjuster"
  | "supervisor"
  | "team_lead"
  | "reinspection_adjuster"
  | "supplement_adjuster"
  | "appraisal_contact"
  | "carrier_representative"
  | "unknown";

/**
 * Map a raw role label from a document to the claimAdjusterRole enum value.
 * Falls back to "primary_adjuster" for generic "adjuster" labels.
 */
export function mapRoleLabelToEnum(label: string | undefined): ClaimAdjusterRole {
  if (!label) return "primary_adjuster";
  const l = label.toLowerCase().trim();

  if (l.includes("desk") || l.includes("inside adj") || l.includes("examiner")) return "desk_adjuster";
  if (l.includes("field") || l.includes("outside adj")) return "field_adjuster";
  if (l.includes("catastrophe") || l.includes("cat adj") || l.match(/\bcat\b/)) return "catastrophe_adjuster";
  if (l.includes("supplement")) return "supplement_adjuster";
  if (l.includes("reinspect")) return "reinspection_adjuster";
  if (l.includes("apprais")) return "appraisal_contact";
  if (l.includes("supervisor") || l.includes("manager") || l.includes("managing")) return "supervisor";
  if (l.includes("team lead") || l.includes("lead adj")) return "team_lead";
  if (
    l.includes("carrier rep") ||
    l.includes("claim rep") ||
    l.includes("claim specialist") ||
    l.includes("claims specialist") ||
    l.includes("property claim") ||
    l.includes("representative")
  ) return "carrier_representative";
  if (l.includes("adj") || l.includes("primary") || l.includes("claim")) return "primary_adjuster";
  return "unknown";
}

/**
 * Find or create adjuster profiles for every mention, then link each one to
 * the claim via the claim_adjusters junction table.
 *
 * Idempotent: unique constraint on (claimId, adjusterId, roleOnClaim) means
 * duplicate calls for the same adjuster+role pair are silently ignored.
 *
 * Deduplication rules:
 *  - Names are first normalized (ALL_CAPS, Last/First, etc.) then compared via
 *    a middle-initial-stripped key so "Cody Vines" == "Cody M. Vines".
 *  - When both the existing profile and the new mention have a known carrier,
 *    the carrier must also match. When either side is unknown/empty, name
 *    comparison alone is sufficient.
 *
 * Returns the list of newly created ClaimAdjuster link records
 * (skips already-linked pairs; does not return the existing row for those).
 */
const NON_ADJUSTER_ROLES = [
  "homeowner", "insured", "contractor", "public adjuster", "roofing", "roofing staff",
  "restoration", "mitigation", "project manager", "estimator", "user", "owner",
  "property owner", "building owner", "tenant", "claimant", "vendor", "supplier",
  "material supplier", "subcontractor", "inspector", "engineer", "attorney",
  "legal", "pa", "independent adjuster", "ia",
];

function isNonAdjusterRole(label: string | undefined): boolean {
  if (!label) return false;
  const l = label.toLowerCase();
  for (const term of NON_ADJUSTER_ROLES) {
    if (l.includes(term)) return true;
  }
  return false;
}

export async function extractAndLinkAdjustersForClaim(
  claimId: string,
  orgId: string,
  mentions: AdjusterMention[],
  source: LinkSource,
): Promise<ClaimAdjuster[]> {
  if (!mentions || mentions.length === 0) return [];

  const existingAdjs = await storage.getAdjusters(orgId);
  const linked: ClaimAdjuster[] = [];

  for (const mention of mentions) {
    const rawName = mention.name?.trim();
    if (!rawName) continue;

    const normalized = normalizeAdjusterName(rawName);
    if (!normalized) continue;

    // Never classify homeowners/contractors/roofing staff/users as adjusters
    if (isNonAdjusterRole(mention.roleLabel)) {
      console.log(`[adjuster-linking] skipped non-adjuster role "${mention.roleLabel}" for "${normalized}"`);
      continue;
    }

    const mentionKey = nameComparisonKey(normalized);
    const mentionCarrier = normalizeCarrierKey(mention.carrier);

    let adj = existingAdjs.find((a) => {
      if (!a.adjusterName) return false;
      const nameMatch = nameComparisonKey(a.adjusterName) === mentionKey;
      if (!nameMatch) return false;
      const existingCarrier = normalizeCarrierKey(a.carrierName);
      // Strict dedup: both sides have known carriers -> must match
      if (existingCarrier && mentionCarrier) return existingCarrier === mentionCarrier;
      // When both sides have unknown carriers, allow name-only match
      if (!existingCarrier && !mentionCarrier) return true;
      // When only one side has a carrier, require a tighter match to avoid merging
      // different adjusters with the same name across different carriers
      return false;
    });

    if (!adj) {
      try {
        adj = await storage.createAdjuster({
          organizationId: orgId,
          adjusterName: normalized,
          adjusterEmail: mention.email?.trim() || undefined,
          adjusterPhone: mention.phone?.trim() || undefined,
          carrierName: mention.carrier?.trim() || "Unknown",
        });
        existingAdjs.push(adj);
        console.log(`[adjuster-linking] created adjuster "${normalized}" (carrier: ${adj.carrierName}) in org ${orgId}`);
      } catch (createErr: unknown) {
        console.error("[adjuster-linking] create non-fatal:", (createErr as Error)?.message);
        continue;
      }
    }

    const roleOnClaim = mapRoleLabelToEnum(mention.roleLabel);

    try {
      const link = await storage.linkAdjusterToClaim({
        claimId,
        adjusterId: adj.id,
        organizationId: orgId,
        roleOnClaim,
        sourceType: source.sourceType,
        sourceDocumentId: source.sourceDocumentId,
        sourceTranscriptId: source.sourceTranscriptId,
        sourceAudioId: source.sourceAudioId,
        confidenceScore: mention.confidenceScore ?? 1,
      });
      linked.push(link);
      console.log(`[adjuster-linking] linked "${normalized}" (${roleOnClaim}) to claim ${claimId} via ${source.sourceType}`);
    } catch (linkErr: unknown) {
      const msg = (linkErr as Error)?.message ?? "";
      if (!msg.includes("unique") && !msg.includes("duplicate") && !msg.includes("23505")) {
        console.error("[adjuster-linking] link non-fatal:", msg);
      }
    }
  }

  return linked;
}
