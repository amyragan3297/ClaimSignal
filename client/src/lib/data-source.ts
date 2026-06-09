// Shared helpers for honest, transparent intelligence display.
// Avoids showing fake 0.0 / 0% values when there is not enough underlying
// claim data to support a real calculation, and standardizes the wording the
// product uses to describe where a number came from and how reliable it is.

export const NO_DATA = "Not enough data";
export const PENDING = "Analysis pending";

export type DataSource =
  | "real_claim_data"
  | "manually_entered"
  | "sample_demo"
  | "imported_reference"
  | "pending_evidence"
  | "mixed";

export const DATA_SOURCE_LABEL: Record<DataSource, string> = {
  real_claim_data: "Real claim data",
  manually_entered: "Manually entered",
  sample_demo: "Sample / demo data",
  imported_reference: "Imported reference",
  pending_evidence: "Pending evidence",
  mixed: "Mixed sources",
};

/**
 * Describe how trustworthy an aggregate metric is based on its sample size.
 * Returns null when the sample is large enough to be shown plainly.
 */
export function sampleSizeLabel(sampleSize: number): string | null {
  if (sampleSize <= 0) return NO_DATA;
  if (sampleSize === 1) return "Based on 1 claim — directional only";
  if (sampleSize < 5) return `Based on ${sampleSize} claims — directional only`;
  return null;
}

/**
 * Format a metric value, but suppress meaningless zeroes when there is no
 * supporting data. Use this instead of printing a raw 0 / 0.0% / 0h.
 */
export function formatMetric(
  value: number | null | undefined,
  opts: { sampleSize: number; suffix?: string; percent?: boolean; digits?: number } = { sampleSize: 0 },
): string {
  const { sampleSize, suffix = "", percent = false, digits = 1 } = opts;
  if (sampleSize <= 0 || value === null || value === undefined) return NO_DATA;
  const n = percent ? value * 100 : value;
  const text = Number.isInteger(n) ? String(n) : n.toFixed(digits);
  return `${text}${percent ? "%" : suffix}`;
}

export interface ClaimLike {
  aiAnalysisAt?: string | Date | null;
  aiModulesCompleted?: string[] | unknown;
  riskScore?: number | null;
  frictionScore?: number | null;
  status?: string | null;
  rcvAmount?: string | number | null;
  inspectionDate?: string | Date | null;
}

export interface ClaimAnalysisStatus {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
}

const AI_MODULE_NAMES = [
  "claim_extraction",
  "financial_extraction",
  "code_analysis",
  "timeline_generation",
  "risk_scoring",
  "weather_analysis",
];

function countAiModulesDone(claim: ClaimLike): number {
  const done = Array.isArray(claim.aiModulesCompleted) ? claim.aiModulesCompleted : [];
  return AI_MODULE_NAMES.filter(m => done.includes(m)).length;
}

export function hasAiAnalysis(claim: ClaimLike): boolean {
  return countAiModulesDone(claim) >= 6;
}

export interface AiModuleStatus {
  name: string;
  label: string;
  completed: boolean;
}

export function getAiModuleBreakdown(claim: ClaimLike): AiModuleStatus[] {
  const done = Array.isArray(claim.aiModulesCompleted) ? claim.aiModulesCompleted : [];
  const labels: Record<string, string> = {
    claim_extraction: "Claim Extraction",
    financial_extraction: "Financial Extraction",
    code_analysis: "Code Analysis",
    timeline_generation: "Timeline Generation",
    risk_scoring: "Risk Scoring",
    weather_analysis: "Weather Analysis",
  };
  return AI_MODULE_NAMES.map((name) => ({
    name,
    label: labels[name] || name,
    completed: done.includes(name),
  }));
}

/**
 * Derive an honest analysis-status badge for a claim row. Distinguishes
 * full AI analysis (all 6 AI modules were persisted) from partial or rule-based.
 */
export function claimAnalysisStatus(claim: ClaimLike): ClaimAnalysisStatus {
  const doneCount = countAiModulesDone(claim);
  if (doneCount >= 6) return { label: "AI analysis complete", variant: "default" };
  if (doneCount > 0) return { label: "Partial analysis", variant: "secondary" };
  if (claim.status === "denied" || claim.status === "escalated")
    return { label: "Ready for escalation review", variant: "destructive" };
  const hasSignals = (claim.riskScore ?? 0) > 0 || (claim.frictionScore ?? 0) > 0;
  if (hasSignals) return { label: "MVP rule-based analysis", variant: "secondary" };
  if (!claim.rcvAmount && !claim.inspectionDate)
    return { label: "Needs more data", variant: "outline" };
  return { label: "Analysis in progress", variant: "outline" };
}
