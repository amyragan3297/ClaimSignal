type Role = string;

/**
 * ROLE MAPPING — IMPORTANT
 * ------------------------
 * The platform-owner role is presented to users as "Master".
 * Internally (DB enum `user_role`, JWT `role` claim, all backend checks) the
 * Master permission level is represented by the string "super_admin".
 *
 *     Master  ===  super_admin   (internal permission level)
 *
 * The user-facing label "Master" is applied in the frontend via ROLE_LABEL in
 * client/src/components/app-layout.tsx. There is exactly one platform-owner
 * permission level; do not introduce a separate "master" enum value.
 */
export const MASTER_ROLE = "super_admin" as const;

// Only the Master (super_admin) permission level may view unmasked PII.
const PII_UNMASK_ROLES: string[] = [MASTER_ROLE];

export function isMaster(role: string): boolean {
  return role === MASTER_ROLE;
}

export function canViewUnmasked(role: string): boolean {
  return PII_UNMASK_ROLES.includes(role);
}

// "John Smith" → "J. S."
export function maskName(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.map((p) => (p[0]?.toUpperCase() ?? "") + ".").join(" ");
}

// "800816754" → "8008*****"
export function maskClaimNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (v.length <= 4) return "*".repeat(v.length);
  return v.slice(0, 4) + "*".repeat(v.length - 4);
}

// "604 Milton Road, Athens, AL" → "Athens, AL"
export function maskAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join(", ");
  return parts[0] || null;
}

// Generic partial mask for policy numbers etc.
export function maskString(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (v.length <= 4) return "*".repeat(v.length);
  return v.slice(0, 2) + "*".repeat(v.length - 2);
}

export function applyPiiMasking<T extends Record<string, any>>(row: T, role: Role): T {
  if (PII_UNMASK_ROLES.includes(role)) return row;
  return {
    ...row,
    homeownerName: maskName(row.homeownerName),
    homeownerPhone: null,
    homeownerEmail: null,
    propertyAddress: maskAddress(row.propertyAddress),
    claimNumber: maskClaimNumber(row.claimNumber),
    policyNumber: maskString(row.policyNumber),
    insuredName: maskName(row.insuredName),
  };
}

export function applyPiiMaskingToList<T extends Record<string, any>>(rows: T[], role: Role): T[] {
  return rows.map((r) => applyPiiMasking(r, role));
}

/**
 * For cross-tenant shared library views.
 *
 * Beyond homeowner PII masking, this also strips CONTRACTOR-SIDE IDENTITY so
 * one tenant cannot identify another contractor/roofing firm from a shared
 * record, while PRESERVING adjuster intelligence (carrier, adjusterId, and all
 * behavioral/friction scores) which is the whole point of the shared library.
 *
 * Stripped (contractor identity / private context):
 *   - organizationId / clientId   → roofing-firm + client linkage
 *   - notes                       → internal contractor-side notes
 *   - aiClaimSummary              → may embed contractor identity / raw context
 *   - address / zipCode           → exact street + ZIP (city/state kept, generalized)
 *
 * Preserved (adjuster intelligence — intentionally NOT masked):
 *   - carrier, adjusterId, lossType, dateOfLoss, status, currentPhase
 *   - frictionScore, adjusterFrictionScore, escalationLevel, riskScore,
 *     scopeDeltaScore, approvalProbability, supplementProbabilityScore, etc.
 */
export function sanitizeSharedClaimRecord<T extends Record<string, any>>(row: T, role: Role): T {
  if (PII_UNMASK_ROLES.includes(role)) return row;
  const piiMasked = applyPiiMasking(row, role);
  return {
    ...piiMasked,
    // contractor / tenant identity
    organizationId: undefined as any,
    clientId: undefined as any,
    // internal contractor-side content
    notes: null,
    aiClaimSummary: null,
    // exact-location fields (city/state are retained for pattern intelligence)
    address: null,
    zipCode: null,
  };
}

export function sanitizeSharedClaimList<T extends Record<string, any>>(rows: T[], role: Role): T[] {
  return rows.map((r) => sanitizeSharedClaimRecord(r, role));
}
