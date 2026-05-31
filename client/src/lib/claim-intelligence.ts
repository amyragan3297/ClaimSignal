import type { Claim } from "@shared/schema";

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  weight: number;
}

export interface DefensibilityResult {
  score: number;
  level: "strong" | "moderate" | "weak";
  checklist: ChecklistItem[];
  completed: number;
  total: number;
  gaps: string[];
}

/**
 * Deterministic, client-side defensibility model. Scores how audit-ready a claim
 * is based on documentation flags and key data completeness. No AI involved —
 * this is a transparent, repeatable checklist so users always understand the score.
 */
export function computeDefensibility(claim: Claim): DefensibilityResult {
  const checklist: ChecklistItem[] = [
    { key: "photos", label: "Damage photos uploaded", done: !!claim.photosUploaded, weight: 15 },
    { key: "estimate", label: "Estimate on file", done: !!claim.estimateUploaded, weight: 15 },
    { key: "denialLetter", label: "Denial / determination letter", done: !!claim.denialLetterUploaded, weight: 10 },
    { key: "supplement", label: "Supplement documentation", done: !!claim.supplementUploaded, weight: 10 },
    { key: "codeDoc", label: "Building-code documentation", done: !!claim.codeDocUploaded, weight: 10 },
    { key: "manufacturerDoc", label: "Manufacturer documentation", done: !!claim.manufacturerDocUploaded, weight: 5 },
    { key: "inspectionDate", label: "Inspection date recorded", done: !!claim.inspectionDate, weight: 10 },
    { key: "dateOfLoss", label: "Date of loss recorded", done: !!(claim.dateOfLoss || claim.lossDate), weight: 10 },
    { key: "audio", label: "Call audio / transcript captured", done: !!claim.audioUploaded, weight: 5 },
    { key: "vendor", label: "Vendor / engineering findings logged", done: !!(claim.engineeringFirm || claim.itelVendor || claim.vendorFinding), weight: 10 },
  ];

  const totalWeight = checklist.reduce((sum, c) => sum + c.weight, 0);
  const earned = checklist.reduce((sum, c) => sum + (c.done ? c.weight : 0), 0);
  const score = Math.round((earned / totalWeight) * 100);

  const level: DefensibilityResult["level"] = score >= 75 ? "strong" : score >= 45 ? "moderate" : "weak";

  const gaps = checklist.filter((c) => !c.done).map((c) => c.label);

  return {
    score,
    level,
    checklist,
    completed: checklist.filter((c) => c.done).length,
    total: checklist.length,
    gaps,
  };
}

export interface AiAnalysis {
  narrative: string;
  riskExplanation: string;
  topMissingScope: string[];
  codeCompliance: string;
  suggestedAction: string;
  gaps: string[];
  recommendedActions: { title: string; detail: string; priority: "high" | "medium" | "low" }[];
}
