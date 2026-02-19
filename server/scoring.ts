import { storage } from "./storage";
import type { Claim, Adjuster, CommunicationSignal, SupplementIntelligence } from "@shared/schema";
import type { ScoringWeight } from "@shared/schema";

let cachedWeights: Map<string, number> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000;

export async function loadScoringWeights(): Promise<Map<string, number>> {
  const now = Date.now();
  if (cachedWeights && now - cacheTimestamp < CACHE_TTL) {
    return cachedWeights;
  }
  
  const weights = await storage.getScoringWeights("v1");
  const map = new Map<string, number>();
  for (const w of weights) {
    map.set(w.metricName, w.weightValue);
  }
  
  cachedWeights = map;
  cacheTimestamp = now;
  return map;
}

function getWeight(weights: Map<string, number>, key: string, fallback: number): number {
  return weights.get(key) ?? fallback;
}

export async function seedDefaultWeights(): Promise<void> {
  const existing = await storage.getScoringWeights("v1");
  if (existing.length > 0) return;
  
  const defaults: Array<{ metricName: string; weightValue: number }> = [
    { metricName: "adjuster_friction.denial_ratio", weightValue: 0.25 },
    { metricName: "adjuster_friction.supplement_reduction_ratio", weightValue: 0.20 },
    { metricName: "adjuster_friction.avg_response_lag_hours", weightValue: 0.15 },
    { metricName: "adjuster_friction.escalation_trigger_frequency", weightValue: 0.15 },
    { metricName: "adjuster_friction.transcript_deflection_language_rate", weightValue: 0.15 },
    { metricName: "adjuster_friction.irc_rejection_rate", weightValue: 0.10 },
    { metricName: "communication_risk.delay_language", weightValue: 0.25 },
    { metricName: "communication_risk.deflection_language", weightValue: 0.25 },
    { metricName: "communication_risk.refusal_language", weightValue: 0.30 },
    { metricName: "communication_risk.escalation_resistance", weightValue: 0.20 },
    { metricName: "claim_friction.supplement_resistance", weightValue: 0.25 },
    { metricName: "claim_friction.communication_risk", weightValue: 0.20 },
    { metricName: "claim_friction.irc_trigger_conflicts", weightValue: 0.15 },
    { metricName: "claim_friction.lifecycle_velocity_deviation", weightValue: 0.20 },
    { metricName: "claim_friction.determination_delta_variance", weightValue: 0.20 },
  ];
  
  for (const d of defaults) {
    await storage.upsertScoringWeight({
      metricName: d.metricName,
      weightValue: d.weightValue,
      activeVersion: "v1",
    });
  }
}

const ADJUSTER_FRICTION_WEIGHTS = {
  denialRatio: 0.25,
  supplementReductionRatio: 0.20,
  avgResponseLagHours: 0.15,
  escalationTriggerFrequency: 0.15,
  transcriptDeflectionLanguageRate: 0.15,
  ircRejectionRate: 0.10,
};

const COMMUNICATION_RISK_WEIGHTS = {
  delayLanguage: 0.25,
  deflectionLanguage: 0.25,
  refusalLanguage: 0.30,
  escalationResistance: 0.20,
};

const CLAIM_FRICTION_WEIGHTS = {
  supplementResistance: 0.25,
  communicationRisk: 0.20,
  ircTriggerConflicts: 0.15,
  lifecycleVelocityDeviation: 0.20,
  determinationDeltaVariance: 0.20,
};

export function computeAdjusterFrictionScore(adjuster: Adjuster, dbWeights?: Map<string, number>): number {
  const w = {
    denialRatio: dbWeights?.get("adjuster_friction.denial_ratio") ?? ADJUSTER_FRICTION_WEIGHTS.denialRatio,
    supplementReductionRatio: dbWeights?.get("adjuster_friction.supplement_reduction_ratio") ?? ADJUSTER_FRICTION_WEIGHTS.supplementReductionRatio,
    avgResponseLagHours: dbWeights?.get("adjuster_friction.avg_response_lag_hours") ?? ADJUSTER_FRICTION_WEIGHTS.avgResponseLagHours,
    escalationTriggerFrequency: dbWeights?.get("adjuster_friction.escalation_trigger_frequency") ?? ADJUSTER_FRICTION_WEIGHTS.escalationTriggerFrequency,
    transcriptDeflectionLanguageRate: dbWeights?.get("adjuster_friction.transcript_deflection_language_rate") ?? ADJUSTER_FRICTION_WEIGHTS.transcriptDeflectionLanguageRate,
    ircRejectionRate: dbWeights?.get("adjuster_friction.irc_rejection_rate") ?? ADJUSTER_FRICTION_WEIGHTS.ircRejectionRate,
  };

  const normalizedResponseLag = Math.min((adjuster.avgResponseTimeHours || 0) / 168, 1);
  const escalationFreq = adjuster.escalationTriggerRate || 0;

  const score = (
    (adjuster.denialRatio || adjuster.denialRate || 0) * w.denialRatio +
    (adjuster.supplementReductionRatio || 0) * w.supplementReductionRatio +
    normalizedResponseLag * w.avgResponseLagHours +
    escalationFreq * w.escalationTriggerFrequency +
    (adjuster.transcriptDeflectionLanguageRate || 0) * w.transcriptDeflectionLanguageRate +
    (adjuster.ircRejectionRate || 0) * w.ircRejectionRate
  ) * 100;

  return Math.round(Math.min(Math.max(score, 0), 100));
}

export function computeCommunicationRiskScore(signals: CommunicationSignal[], dbWeights?: Map<string, number>): number {
  if (signals.length === 0) return 0;

  const w = {
    delayLanguage: dbWeights?.get("communication_risk.delay_language") ?? COMMUNICATION_RISK_WEIGHTS.delayLanguage,
    deflectionLanguage: dbWeights?.get("communication_risk.deflection_language") ?? COMMUNICATION_RISK_WEIGHTS.deflectionLanguage,
    refusalLanguage: dbWeights?.get("communication_risk.refusal_language") ?? COMMUNICATION_RISK_WEIGHTS.refusalLanguage,
    escalationResistance: dbWeights?.get("communication_risk.escalation_resistance") ?? COMMUNICATION_RISK_WEIGHTS.escalationResistance,
  };
  let totalScore = 0;

  for (const sig of signals) {
    const score = (
      (sig.delayLanguageDetected ? 1 : 0) * w.delayLanguage +
      (sig.deflectionLanguageDetected ? 1 : 0) * w.deflectionLanguage +
      (sig.refusalLanguageDetected ? 1 : 0) * w.refusalLanguage +
      (sig.escalationResistanceLanguageDetected ? 1 : 0) * w.escalationResistance
    ) * 100;
    totalScore += score;
  }

  return Math.round(Math.min(totalScore / signals.length, 100));
}

export function computeSupplementResistanceScore(supplements: SupplementIntelligence[]): number {
  if (supplements.length === 0) return 0;

  let resistanceTotal = 0;
  let count = 0;

  for (const sup of supplements) {
    let itemScore = 0;

    if (sup.triggerDetected) {
      count++;
      const outcome = (sup.adjusterResponseOutcome || "").toLowerCase();
      if (outcome === "denied" || outcome === "rejected") {
        itemScore = 1.0;
      } else if (outcome === "partial") {
        itemScore = 0.5;
      } else if (outcome === "approved") {
        itemScore = 0.0;
      } else {
        itemScore = 0.3;
      }

      if (sup.daysToResolution && sup.daysToResolution > 14) {
        itemScore += Math.min((sup.daysToResolution - 14) / 60, 0.3);
      }

      resistanceTotal += Math.min(itemScore, 1.0);
    }
  }

  if (count === 0) return 0;
  return Math.round((resistanceTotal / count) * 100);
}

export function computeClaimFrictionScore(params: {
  supplementResistanceScore: number;
  communicationRiskScore: number;
  ircTriggerConflicts: number;
  lifecycleVelocityScore: number;
  determinationDeltaVariance: number;
}, dbWeights?: Map<string, number>): number {
  const w = {
    supplementResistance: dbWeights?.get("claim_friction.supplement_resistance") ?? CLAIM_FRICTION_WEIGHTS.supplementResistance,
    communicationRisk: dbWeights?.get("claim_friction.communication_risk") ?? CLAIM_FRICTION_WEIGHTS.communicationRisk,
    ircTriggerConflicts: dbWeights?.get("claim_friction.irc_trigger_conflicts") ?? CLAIM_FRICTION_WEIGHTS.ircTriggerConflicts,
    lifecycleVelocityDeviation: dbWeights?.get("claim_friction.lifecycle_velocity_deviation") ?? CLAIM_FRICTION_WEIGHTS.lifecycleVelocityDeviation,
    determinationDeltaVariance: dbWeights?.get("claim_friction.determination_delta_variance") ?? CLAIM_FRICTION_WEIGHTS.determinationDeltaVariance,
  };

  const normalizedIrcConflicts = Math.min(params.ircTriggerConflicts / 10, 1);
  const normalizedVelocity = params.lifecycleVelocityScore / 100;
  const normalizedDelta = Math.min(params.determinationDeltaVariance / 30, 1);

  const score = (
    (params.supplementResistanceScore / 100) * w.supplementResistance +
    (params.communicationRiskScore / 100) * w.communicationRisk +
    normalizedIrcConflicts * w.ircTriggerConflicts +
    normalizedVelocity * w.lifecycleVelocityDeviation +
    normalizedDelta * w.determinationDeltaVariance
  ) * 100;

  return Math.round(Math.min(Math.max(score, 0), 100));
}

export function computeLifecycleVelocityScore(claim: Claim): number | null {
  const phases: { key: keyof Claim; weight: number }[] = [
    { key: "inspectionDate", weight: 0.3 },
    { key: "determinationDate", weight: 0.4 },
    { key: "resolutionDate", weight: 0.3 },
  ];

  const baseDate = claim.dateOfLoss || claim.createdAt;
  if (!baseDate) return null;

  let totalWeightedDays = 0;
  let totalWeight = 0;
  let prevDate = new Date(baseDate as string | Date);

  for (const phase of phases) {
    const phaseDate = claim[phase.key] as Date | string | null;
    if (!phaseDate) continue;

    const d = new Date(phaseDate as string | Date);
    const daysDiff = (d.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
    totalWeightedDays += daysDiff * phase.weight;
    totalWeight += phase.weight;
    prevDate = d;
  }

  if (totalWeight === 0) return null;

  const avgWeightedDays = totalWeightedDays / totalWeight;
  const score = Math.min((avgWeightedDays / 90) * 100, 100);
  return Math.round(Math.max(score, 0));
}

export function computeLifecycleVelocity(
  dateOfLoss: Date | null,
  inspectionDate: Date | null,
  determinationDate: Date | null,
  resolutionDate: Date | null
): number | null {
  const claim = {
    dateOfLoss,
    inspectionDate,
    determinationDate,
    resolutionDate,
    createdAt: null,
  } as unknown as Claim;
  return computeLifecycleVelocityScore(claim);
}

export async function computeFullClaimScoring(claimId: string, orgId: string): Promise<{
  claimFrictionScore: number;
  supplementResistanceScore: number;
  communicationRiskScore: number;
  lifecycleVelocityScore: number | null;
}> {
  const claim = await storage.getClaim(claimId, orgId);
  if (!claim) throw new Error("Claim not found");

  const dbWeights = await loadScoringWeights();

  const supplements = await storage.getSupplementIntelligence(claimId, orgId);
  const supplementResistanceScore = computeSupplementResistanceScore(supplements);

  const signals = await storage.getCommunicationSignals(claimId, orgId);
  const communicationRiskScore = computeCommunicationRiskScore(signals, dbWeights);

  const ircTriggerConflicts = supplements.filter(
    (s: SupplementIntelligence) => s.triggerDetected && (s.adjusterResponseOutcome || "").toLowerCase() === "denied"
  ).length;

  const lifecycleVelocityScore = computeLifecycleVelocityScore(claim);

  const avgDetermination = 14;
  let determinationDeltaVariance = 0;
  if (claim.determinationDate && claim.dateOfLoss) {
    const days = (new Date(claim.determinationDate).getTime() - new Date(claim.dateOfLoss).getTime()) / (1000 * 60 * 60 * 24);
    determinationDeltaVariance = Math.abs(days - avgDetermination);
  }

  const claimFrictionScore = computeClaimFrictionScore({
    supplementResistanceScore,
    communicationRiskScore,
    ircTriggerConflicts,
    lifecycleVelocityScore: lifecycleVelocityScore || 0,
    determinationDeltaVariance,
  }, dbWeights);

  return {
    claimFrictionScore,
    supplementResistanceScore,
    communicationRiskScore,
    lifecycleVelocityScore,
  };
}
