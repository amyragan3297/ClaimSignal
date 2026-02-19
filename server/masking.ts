import type { Claim } from "@shared/schema";

export function maskClaim(claim: Claim): Claim {
  return {
    ...claim,
    claimNumber: "***-" + (claim.claimNumber || "").slice(-4),
    propertyAddress: claim.propertyAddress ? "****" : null,
    notes: claim.notes ? "[masked]" : null,
  };
}

export function maskClaims(claims: Claim[]): Claim[] {
  return claims.map(maskClaim);
}

export function shouldMask(hasFounderAgreement: boolean): boolean {
  return !hasFounderAgreement;
}
