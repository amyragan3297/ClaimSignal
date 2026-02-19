type Role = string;

const PII_UNMASK_ROLES: string[] = ["super_admin"];

export function maskString(value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  const v = value.trim();
  if (v.length <= 2) return "**";
  if (v.length <= 4) return v.slice(0, 2) + "****";
  return v.slice(0, 2) + "****" + v.slice(-2);
}

function maskAddress(value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  const v = value.trim();
  if (v.length <= 6) return "******";
  return "****" + v.slice(-6);
}

export function applyPiiMasking<T extends Record<string, any>>(row: T, role: Role): T {
  if (PII_UNMASK_ROLES.includes(role)) return row;

  return {
    ...row,
    homeownerName: maskString(row.homeownerName),
    homeownerPhone: maskString(row.homeownerPhone),
    homeownerEmail: maskString(row.homeownerEmail),
    propertyAddress: maskAddress(row.propertyAddress),
    claimNumber: maskString(row.claimNumber),
    policyNumber: maskString(row.policyNumber),
    insuredName: maskString(row.insuredName),
  };
}

export function applyPiiMaskingToList<T extends Record<string, any>>(rows: T[], role: Role): T[] {
  return rows.map((r) => applyPiiMasking(r, role));
}

export function canViewUnmasked(role: string): boolean {
  return PII_UNMASK_ROLES.includes(role);
}
