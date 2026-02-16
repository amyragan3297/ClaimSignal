import type { Claim } from "@shared/schema";

export function maskClaim(claim: Claim): Claim {
  return {
    ...claim,
    claimNumber: "***-" + claim.claimNumber.slice(-4),
    insuredName: claim.insuredName[0] + "****",
    address: "****",
    zipCode: claim.zipCode ? "****" : null,
  };
}

export function maskClaims(claims: Claim[]): Claim[] {
  return claims.map(maskClaim);
}

export function shouldMask(tier: string | null, hasSignedAgreement: boolean): boolean {
  if (tier === "founder" && hasSignedAgreement) {
    return false;
  }
  return true;
}
