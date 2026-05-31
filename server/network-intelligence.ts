// ──────────────────────────────────────────────────────────────────────────
// Network Intelligence Engine (Section 25) — MVP, rule-based, aggregate only.
// All outputs are aggregate — never expose homeowner/address/claim#/policy#.
// Minimum sample size 3 for any pattern. Insufficient → message, not fabrication.
// ──────────────────────────────────────────────────────────────────────────
import type { Claim } from "@shared/schema";
import type { Escalation } from "@shared/schema";

const MIN_SAMPLE = 3;
const lc = (v: unknown) => String(v ?? "").toLowerCase();

function pct(n: number, total: number) { return total === 0 ? 0 : Math.round((n / total) * 100); }

// ── Helpers ───────────────────────────────────────────────────────────────
function groupBy<T>(arr: T[], key: (item: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item) || "unknown";
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(item);
  }
  return m;
}

function isDenied(v: unknown) { const s = lc(v); return s.includes("deni") || s.includes("reject"); }
function isApproved(v: unknown) { const s = lc(v); return s.includes("approv") || s.includes("paid") || s.includes("resolv"); }

// ── Pattern Detection ─────────────────────────────────────────────────────
export interface NetworkPattern {
  patternType: string;
  description: string;
  sampleSize: number;
  confidence: number;
  dateRange: string;
  insufficient: boolean;
  message: string | null;
}

export function computePatterns(
  allClaims: Claim[],
  allEscalations: Escalation[],
  dateFrom?: Date,
  dateTo?: Date,
): NetworkPattern[] {
  const now = dateTo ?? new Date();
  const fromDate = dateFrom ?? new Date(now.getTime() - 365 * 86400000);
  const rangeLabel = `${fromDate.toISOString().slice(0, 10)} – ${now.toISOString().slice(0, 10)}`;

  const patterns: NetworkPattern[] = [];

  // 1. Carrier denial rate patterns
  const byCarrier = groupBy(allClaims, (c) => (c.carrier ?? "unknown").toLowerCase());
  for (const [carrier, clms] of byCarrier) {
    if (clms.length < MIN_SAMPLE || !carrier || carrier === "unknown") continue;
    const denialCount = clms.filter((c) => isDenied((c as any).initialOutcome)).length;
    const denialRate = pct(denialCount, clms.length);
    if (denialRate > 50) {
      patterns.push({
        patternType: "carrier_denial",
        description: `${carrier} has a ${denialRate}% initial denial rate across ${clms.length} claims.`,
        sampleSize: clms.length,
        confidence: Math.min(0.9, 0.5 + clms.length * 0.02),
        dateRange: rangeLabel,
        insufficient: false,
        message: null,
      });
    }
  }

  // 2. Denial reason frequency patterns
  const denialReasons = groupBy(
    allClaims.filter((c) => isDenied((c as any).initialOutcome) && (c as any).denialReason),
    (c) => lc((c as any).denialReason ?? "unknown"),
  );
  for (const [reason, clms] of denialReasons) {
    if (clms.length < MIN_SAMPLE) continue;
    patterns.push({
      patternType: "denial_reason_frequency",
      description: `"${reason}" appears as a denial reason in ${clms.length} claims.`,
      sampleSize: clms.length,
      confidence: Math.min(0.85, 0.5 + clms.length * 0.015),
      dateRange: rangeLabel,
      insufficient: false,
      message: null,
    });
  }

  // 3. Escalation effectiveness patterns by type
  const byEscType = groupBy(allEscalations, (e) => e.escalationType);
  for (const [type, escs] of byEscType) {
    if (escs.length < MIN_SAMPLE) continue;
    const successSet = new Set(["full_approval", "partial_approval", "supplement_approved", "payment_increased", "reinspection_scheduled", "claim_reopened"]);
    const successes = escs.filter((e) => e.escalationResult && successSet.has(e.escalationResult)).length;
    const successRate = pct(successes, escs.length);
    if (successRate > 40) {
      patterns.push({
        patternType: "escalation_effectiveness",
        description: `"${type}" escalation has a ${successRate}% success rate across ${escs.length} uses.`,
        sampleSize: escs.length,
        confidence: Math.min(0.85, 0.5 + escs.length * 0.02),
        dateRange: rangeLabel,
        insufficient: false,
        message: null,
      });
    }
  }

  // 4. Supplement resistance pattern
  const withSupplement = allClaims.filter((c) => (c as any).supplementRequested);
  if (withSupplement.length >= MIN_SAMPLE) {
    const notApproved = withSupplement.filter((c) => !(c as any).supplementApproved).length;
    const resistRate = pct(notApproved, withSupplement.length);
    if (resistRate > 30) {
      patterns.push({
        patternType: "supplement_resistance",
        description: `${resistRate}% of supplement requests remain unapproved across ${withSupplement.length} claims.`,
        sampleSize: withSupplement.length,
        confidence: Math.min(0.8, 0.5 + withSupplement.length * 0.01),
        dateRange: rangeLabel,
        insufficient: false,
        message: null,
      });
    }
  }

  // 5. Reinspection request increase signal
  const withReinspection = allClaims.filter((c) => (c as any).reinspectionRequested);
  if (withReinspection.length >= MIN_SAMPLE) {
    const successRate = pct(
      withReinspection.filter((c) => isApproved((c as any).reinspectionOutcome)).length,
      withReinspection.length,
    );
    patterns.push({
      patternType: "reinspection_usage",
      description: `Reinspection used in ${withReinspection.length} claims with a ${successRate}% favorable outcome rate.`,
      sampleSize: withReinspection.length,
      confidence: Math.min(0.8, 0.5 + withReinspection.length * 0.015),
      dateRange: rangeLabel,
      insufficient: false,
      message: null,
    });
  }

  if (patterns.length === 0) {
    patterns.push({
      patternType: "insufficient_data",
      description: "Insufficient evidence to establish reliable patterns.",
      sampleSize: allClaims.length,
      confidence: 0,
      dateRange: rangeLabel,
      insufficient: true,
      message: "Insufficient evidence to establish a reliable pattern.",
    });
  }

  return patterns;
}

// ── Outcome Correlations ──────────────────────────────────────────────────
export interface OutcomeCorrelation {
  factor: string;
  label: string;
  approvalRateWith: number;
  approvalRateWithout: number;
  sampleSizeWith: number;
  sampleSizeWithout: number;
  confidence: number;
  sufficient: boolean;
  note: string;
}

export function computeOutcomeCorrelations(allClaims: Claim[]): OutcomeCorrelation[] {
  if (allClaims.length < MIN_SAMPLE * 2) {
    return [{
      factor: "insufficient_data",
      label: "Insufficient data",
      approvalRateWith: 0,
      approvalRateWithout: 0,
      sampleSizeWith: 0,
      sampleSizeWithout: allClaims.length,
      confidence: 0,
      sufficient: false,
      note: "Insufficient evidence to establish a reliable pattern.",
    }];
  }

  const correlations: OutcomeCorrelation[] = [];

  const factors: Array<{ key: string; label: string; test: (c: Claim) => boolean }> = [
    { key: "reinspection", label: "Reinspection Requested", test: (c) => !!(c as any).reinspectionRequested },
    { key: "supplement", label: "Supplement Submitted", test: (c) => !!(c as any).supplementRequested },
    { key: "escalation", label: "Escalation Used", test: (c) => !!(c as any).escalationUsed },
    { key: "denial_overturned", label: "Denial Overturned", test: (c) => !!(c as any).denialOverturned },
  ];

  for (const f of factors) {
    const withFactor = allClaims.filter(f.test);
    const withoutFactor = allClaims.filter((c) => !f.test(c));

    if (withFactor.length < MIN_SAMPLE || withoutFactor.length < MIN_SAMPLE) continue;

    const approveWith = withFactor.filter((c) => isApproved((c as any).finalOutcome) || isApproved((c as any).initialOutcome)).length;
    const approveWithout = withoutFactor.filter((c) => isApproved((c as any).finalOutcome) || isApproved((c as any).initialOutcome)).length;

    correlations.push({
      factor: f.key,
      label: f.label,
      approvalRateWith: pct(approveWith, withFactor.length),
      approvalRateWithout: pct(approveWithout, withoutFactor.length),
      sampleSizeWith: withFactor.length,
      sampleSizeWithout: withoutFactor.length,
      confidence: Math.min(0.85, 0.4 + Math.min(withFactor.length, withoutFactor.length) * 0.02),
      sufficient: true,
      note: "MVP correlation analysis. Correlation does not imply causation.",
    });
  }

  return correlations;
}

// ── Trend Analysis ────────────────────────────────────────────────────────
export interface TrendDataPoint {
  period: string;
  denialCount: number;
  approvalCount: number;
  escalationCount: number;
  supplementCount: number;
  reinspectionCount: number;
  total: number;
  denialRate: number;
  approvalRate: number;
}

export function computeTrends(allClaims: Claim[], days: 30 | 90 | 180 | 365): TrendDataPoint[] {
  const now = Date.now();
  const cutoff = now - days * 86400000;
  const relevant = allClaims.filter((c) => {
    const a = c as any;
    const d = a.createdAt ?? a.dateOfLoss;
    return d && new Date(d).getTime() >= cutoff;
  });

  if (relevant.length < MIN_SAMPLE) {
    return [];
  }

  // Divide into 4 equal periods
  const periodSize = days / 4;
  const periods: TrendDataPoint[] = [];

  for (let i = 0; i < 4; i++) {
    const pStart = cutoff + i * periodSize * 86400000;
    const pEnd = cutoff + (i + 1) * periodSize * 86400000;
    const pLabel = `Period ${i + 1}`;

    const pClaims = relevant.filter((c) => {
      const a = c as any;
      const d = a.createdAt ?? a.dateOfLoss;
      if (!d) return false;
      const t = new Date(d).getTime();
      return t >= pStart && t < pEnd;
    });

    const total = pClaims.length;
    const denialCount = pClaims.filter((c) => isDenied((c as any).initialOutcome)).length;
    const approvalCount = pClaims.filter((c) => isApproved((c as any).finalOutcome ?? (c as any).initialOutcome)).length;
    const escalationCount = pClaims.filter((c) => (c as any).escalationUsed).length;
    const supplementCount = pClaims.filter((c) => (c as any).supplementRequested).length;
    const reinspectionCount = pClaims.filter((c) => (c as any).reinspectionRequested).length;

    periods.push({
      period: pLabel,
      total,
      denialCount,
      approvalCount,
      escalationCount,
      supplementCount,
      reinspectionCount,
      denialRate: pct(denialCount, total),
      approvalRate: pct(approvalCount, total),
    });
  }

  return periods;
}

// ── Emerging Signals ──────────────────────────────────────────────────────
export interface EmergingSignal {
  signalType: string;
  category: string;
  description: string;
  changeDirection: "increasing" | "decreasing" | "stable";
  recentRate: number;
  priorRate: number;
  sampleSize: number;
  sufficient: boolean;
}

export function computeEmergingSignals(allClaims: Claim[], allEscalations: Escalation[]): EmergingSignal[] {
  const now = Date.now();
  const recent = allClaims.filter((c) => {
    const a = c as any;
    const d = a.createdAt ?? a.dateOfLoss;
    return d && new Date(d).getTime() >= now - 90 * 86400000;
  });
  const prior = allClaims.filter((c) => {
    const a = c as any;
    const d = a.createdAt ?? a.dateOfLoss;
    if (!d) return false;
    const t = new Date(d).getTime();
    return t >= now - 180 * 86400000 && t < now - 90 * 86400000;
  });

  const signals: EmergingSignal[] = [];

  if (recent.length < MIN_SAMPLE || prior.length < MIN_SAMPLE) return signals;

  const metrics: Array<{ key: string; label: string; cat: string; test: (c: Claim) => boolean }> = [
    { key: "denials", label: "Denial Activity", cat: "carrier", test: (c) => isDenied((c as any).initialOutcome) },
    { key: "supplements", label: "Supplement Resistance", cat: "carrier", test: (c) => !!(c as any).supplementRequested && !(c as any).supplementApproved },
    { key: "reinspections", label: "Reinspection Requests", cat: "adjuster", test: (c) => !!(c as any).reinspectionRequested },
    { key: "escalations", label: "Escalation Usage", cat: "escalation", test: (c) => !!(c as any).escalationUsed },
  ];

  for (const m of metrics) {
    const recentRate = pct(recent.filter(m.test).length, recent.length);
    const priorRate = pct(prior.filter(m.test).length, prior.length);
    const delta = recentRate - priorRate;
    const direction: EmergingSignal["changeDirection"] =
      delta > 5 ? "increasing" : delta < -5 ? "decreasing" : "stable";

    if (Math.abs(delta) >= 5) {
      signals.push({
        signalType: m.key,
        category: m.cat,
        description: `${m.label} ${direction} (${priorRate}% → ${recentRate}%) in last 90 days vs prior 90 days.`,
        changeDirection: direction,
        recentRate,
        priorRate,
        sampleSize: recent.length + prior.length,
        sufficient: true,
      });
    }
  }

  return signals;
}
