type Role = string;

const PII_UNMASK_ROLES: string[] = ["super_admin"];

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

// For cross-tenant shared library views: mask PII + strip org identity
export function sanitizeSharedClaimRecord<T extends Record<string, any>>(row: T, role: Role): T {
  if (PII_UNMASK_ROLES.includes(role)) return row;
  const piiMasked = applyPiiMasking(row, role);
  return {
    ...piiMasked,
    organizationId: undefined as any,
  };
}

export function sanitizeSharedClaimList<T extends Record<string, any>>(rows: T[], role: Role): T[] {
  return rows.map((r) => sanitizeSharedClaimRecord(r, role));
}
