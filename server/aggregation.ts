import { storage } from "./storage";
import type { Adjuster } from "@shared/schema";

export async function computeAggregatedMetrics(timePeriod: string): Promise<{ computed: number }> {
  await storage.deleteAggregatedMetricsByPeriod(timePeriod);
  
  const allAdjusters = await storage.getAllAdjustersAcrossTenants();
  
  const adjusterMap = new Map<string, Adjuster[]>();
  
  for (const adj of allAdjusters) {
    const key = `${adj.adjusterName}|||${adj.carrierName}`;
    if (!adjusterMap.has(key)) adjusterMap.set(key, []);
    adjusterMap.get(key)!.push(adj);
  }
  
  let computed = 0;
  
  const entries = Array.from(adjusterMap.entries());
  for (const [key, adjustersGroup] of entries) {
    const [adjusterName, carrier] = key.split("|||");
    
    const n = adjustersGroup.length;
    const avg = (field: keyof Adjuster): number => {
      const vals = adjustersGroup.map((a: Adjuster) => (a[field] as number) || 0);
      return vals.reduce((sum: number, v: number) => sum + v, 0) / n;
    };
    const total = (field: keyof Adjuster): number => {
      return adjustersGroup.reduce((s: number, a: Adjuster) => s + ((a[field] as number) || 0), 0);
    };
    
    const frictionScores = adjustersGroup.map((a: Adjuster) => a.frictionScore || 0);
    const meanFriction = avg("frictionScore");
    const varianceScore = Math.sqrt(
      frictionScores.reduce((s: number, v: number) => s + Math.pow(v - meanFriction, 2), 0) / n
    );
    
    const responseTimes = adjustersGroup.map((a: Adjuster) => a.avgResponseTimeHours || 0);
    const meanResponse = avg("avgResponseTimeHours");
    const responseDeviation = Math.sqrt(
      responseTimes.reduce((s: number, v: number) => s + Math.pow(v - meanResponse, 2), 0) / n
    );
    
    const outlierFlag = meanFriction > 70 || avg("denialRate") > 0.6;
    
    const totalRequested = total("totalSupplementsRequested");
    const totalApproved = total("totalSupplementsApproved");
    const supplementInflation = totalRequested > 0 ? totalApproved / totalRequested : 0;
    
    const region = adjustersGroup.find((a: Adjuster) => a.region)?.region || null;
    
    await storage.upsertAggregatedMetric({
      adjusterName,
      carrier,
      region,
      timePeriod,
      avgFrictionScore: avg("frictionScore"),
      avgDenialRate: avg("denialRate"),
      avgSupplementApprovalRate: avg("supplementAcceptanceRate"),
      avgResponseTimeHours: avg("avgResponseTimeHours"),
      avgDaysToInitialDetermination: avg("avgDaysToInitialDetermination"),
      avgEscalationRate: avg("escalationTriggerRate"),
      avgReinspectionRate: avg("reinspectionRate"),
      avgLifecycleVelocityScore: 0,
      avgScopeDeltaScore: 0,
      totalClaimsModeled: total("totalClaimsTracked"),
      totalDenials: total("totalDenials"),
      totalSupplementsSubmitted: total("totalSupplementsRequested"),
      totalSupplementsApproved: total("totalSupplementsApproved"),
      totalEscalations: 0,
      decisionVarianceScore: varianceScore,
      responseVelocityDeviation: responseDeviation,
      outlierBehaviorFlag: outlierFlag,
      supplementInflationIndex: supplementInflation,
      commonTriggerFrequency: null,
      complianceTrendScore: 0,
      periodStart: null,
      periodEnd: null,
    });
    
    computed++;
  }
  
  return { computed };
}
