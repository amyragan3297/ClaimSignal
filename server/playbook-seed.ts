import { storage } from "./storage";
import type { InsertPlaybookEntry } from "@shared/schema";

/**
 * Seeds sample Playbook entries using GENERIC / masked data (no real homeowner
 * or contractor identity). Idempotent: skips entries whose title already exists.
 * Gated by the same demo-seeding policy used elsewhere.
 */
const SAMPLE_PLAYBOOKS: InsertPlaybookEntry[] = [
  {
    title: "Denial Overturned After Reinspection",
    scenarioType: "denial_overturned",
    claimType: "Hail / Wind",
    carrier: "State Farm",
    adjuster: "Field Adjuster (anonymized)",
    iaFirm: "Independent Adjusting Firm",
    vendor: "EagleView",
    denialReason: "Wear and tear / cosmetic",
    missingScopeItems: ["test square documentation", "matching shingle availability"],
    documentationUsed: ["dated photo report", "ITEL match report", "manufacturer brittleness bulletin"],
    actionTaken: "Requested reinspection with documented hail hits per slope and submitted code/manufacturer references.",
    whatWorked: "Per-slope test squares + manufacturer documentation removed the cosmetic argument.",
    whatDidNotWork: "Initial phone-only appeal without new evidence was ignored.",
    timelineSummary: "Denial → reinspection requested (7 days) → reinspection (21 days) → approval.",
    escalationUsed: false,
    outcome: "Full approval",
    supplementDelta: 8200,
    confidenceScore: 0.82,
    sourceClaimCount: 4,
    region: "TX",
    recommendedNextStep: "Request reinspection with per-slope test squares and manufacturer brittleness reference.",
    isSample: true,
  },
  {
    title: "Missing Drip Edge and Starter Recovered",
    scenarioType: "missing_scope_recovered",
    claimType: "Hail",
    carrier: "Allstate",
    adjuster: "Desk Adjuster (anonymized)",
    iaFirm: null,
    vendor: "Ladder assist company",
    denialReason: "Items not included in original scope",
    missingScopeItems: ["drip edge", "starter course", "ridge vent"],
    documentationUsed: ["IRC R905.2.8.5 reference", "local code amendment", "photos of existing components"],
    actionTaken: "Submitted line-item supplement citing IRC + local code requiring drip edge and starter.",
    whatWorked: "Code citations tied to existing-condition photos forced inclusion.",
    whatDidNotWork: "Generic 'industry standard' language alone was rejected.",
    timelineSummary: "Initial estimate → supplement submitted (10 days) → partial approval → full inclusion after code letter.",
    escalationUsed: false,
    outcome: "Supplement approved",
    supplementDelta: 1450,
    confidenceScore: 0.78,
    sourceClaimCount: 6,
    region: "Southeast",
    recommendedNextStep: "Attach IRC R905 + local amendment with existing-condition photos to the supplement.",
    isSample: true,
  },
  {
    title: "Vendor Report Challenged Successfully",
    scenarioType: "vendor_report_challenged",
    claimType: "Wind",
    carrier: "Travelers",
    adjuster: "Field Adjuster (anonymized)",
    iaFirm: "Independent Adjusting Firm",
    vendor: "Engineering firm",
    denialReason: "Engineering report attributed damage to age",
    missingScopeItems: ["wind directionality analysis", "comparable storm data"],
    documentationUsed: ["NOAA storm report", "counter-engineering opinion", "dated pre-loss imagery"],
    actionTaken: "Submitted rebuttal with NOAA verified wind event and counter-engineering review.",
    whatWorked: "Independent storm verification contradicted the vendor's age conclusion.",
    whatDidNotWork: "Disputing the report without a competing expert opinion stalled.",
    timelineSummary: "Engineering denial → rebuttal packet (14 days) → reinspection → approval.",
    escalationUsed: true,
    outcome: "Denial overturned",
    supplementDelta: 15600,
    confidenceScore: 0.74,
    sourceClaimCount: 3,
    region: "Midwest",
    recommendedNextStep: "Pair NOAA storm verification with an independent engineering rebuttal before reinspection.",
    isSample: true,
  },
  {
    title: "Supplement Approved After Documentation Pressure",
    scenarioType: "supplement_approved",
    claimType: "Hail / Wind",
    carrier: "Farmers",
    adjuster: "Desk Adjuster (anonymized)",
    iaFirm: null,
    vendor: "SeekNow",
    denialReason: "Insufficient documentation",
    missingScopeItems: ["detached structures", "gutters", "screens"],
    documentationUsed: ["annotated photo report", "Xactimate line items", "scope narrative"],
    actionTaken: "Resubmitted with annotated photos mapped to each line item and a written scope narrative.",
    whatWorked: "One-to-one photo-to-line-item mapping eliminated 'insufficient documentation'.",
    whatDidNotWork: "Bulk photo dumps without annotation were repeatedly returned.",
    timelineSummary: "Supplement returned → annotated resubmission (5 days) → approval.",
    escalationUsed: false,
    outcome: "Supplement approved",
    supplementDelta: 3900,
    confidenceScore: 0.8,
    sourceClaimCount: 5,
    region: "TX",
    recommendedNextStep: "Map every photo to a specific Xactimate line item and include a scope narrative.",
    isSample: true,
  },
];

export async function seedSamplePlaybooks(): Promise<number> {
  const existing = await storage.getPlaybookEntries();
  const existingTitles = new Set(existing.map((e) => e.title));
  let created = 0;
  for (const pb of SAMPLE_PLAYBOOKS) {
    if (existingTitles.has(pb.title)) continue;
    await storage.createPlaybookEntry(pb);
    created++;
  }
  return created;
}
