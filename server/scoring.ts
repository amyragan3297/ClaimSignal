export function computeLifecycleVelocity(
  dateOfLoss: Date | null,
  inspectionDate: Date | null,
  determinationDate: Date | null,
  resolutionDate: Date | null
): number | null {
  if (!dateOfLoss) return null;
  
  const daysBetween = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  
  const w1 = 0.3;
  const w2 = 0.4;
  const w3 = 0.3;
  
  let score = 0;
  let factors = 0;
  
  if (inspectionDate) {
    score += daysBetween(dateOfLoss, inspectionDate) * w1;
    factors++;
  }
  if (determinationDate && inspectionDate) {
    score += daysBetween(inspectionDate, determinationDate) * w2;
    factors++;
  }
  if (resolutionDate && determinationDate) {
    score += daysBetween(determinationDate, resolutionDate) * w3;
    factors++;
  }
  
  if (factors === 0) return null;
  
  const normalized = Math.min(100, (score / 90) * 100);
  return Number(normalized.toFixed(1));
}
