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
 * Deduplication is name-normalized (handles ALL_CAPS, Last/First, etc.) so a
 * second document about the same adjuster never creates a duplicate profile.
 *
 * Returns the number of new adjuster-claim links created.
 */
export async function extractAndLinkAdjustersForClaim(
  claimId: string,
  orgId: string,
  mentions: AdjusterMention[],
  source: LinkSource,
): Promise<number> {
  if (!mentions || mentions.length === 0) return 0;

  const existingAdjs = await storage.getAdjusters(orgId);
  let linkedCount = 0;

  for (const mention of mentions) {
    const rawName = mention.name?.trim();
    if (!rawName) continue;

    const normalized = normalizeAdjusterName(rawName);
    if (!normalized) continue;

    const normalizedLower = normalized.toLowerCase();

    let adj = existingAdjs.find(
      (a) => a.adjusterName != null &&
        normalizeAdjusterName(a.adjusterName).toLowerCase() === normalizedLower
    );

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
        console.log(`[adjuster-linking] created adjuster "${normalized}" in org ${orgId}`);
      } catch (createErr: unknown) {
        console.error("[adjuster-linking] create non-fatal:", (createErr as Error)?.message);
        continue;
      }
    }

    const roleOnClaim = mapRoleLabelToEnum(mention.roleLabel);

    try {
      await storage.linkAdjusterToClaim({
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
      linkedCount++;
      console.log(`[adjuster-linking] linked "${normalized}" (${roleOnClaim}) to claim ${claimId} via ${source.sourceType}`);
    } catch (linkErr: unknown) {
      const msg = (linkErr as Error)?.message ?? "";
      if (!msg.includes("unique") && !msg.includes("duplicate") && !msg.includes("23505")) {
        console.error("[adjuster-linking] link non-fatal:", msg);
      }
    }
  }

  return linkedCount;
}
