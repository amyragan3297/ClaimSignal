---
name: Cross-tenant governance pattern
description: How super_admin governance storage calls must pass orgId to avoid tenant-scoping errors.
---

# Cross-Tenant Governance Pattern

## The Rule
All governance storage methods (archiveClaim, restoreClaim, permanentDeleteClaim, and equivalents for adjusters, clients, evidenceFiles, audioRecordings, emails) accept `orgId?: string`. When `orgId` is `undefined`, the method skips the org filter and operates platform-wide. When `orgId` is provided, it scopes to that tenant.

## How to Apply
In governance routes:
```ts
const isSuperAdmin = req.auth!.role === "super_admin";
const orgId = req.auth!.organizationId;
const scopedOrgId = isSuperAdmin ? undefined : orgId;
const ok = await storage.archiveClaim(id, scopedOrgId);
```

**Why:** super_admin users' own organizationId (e.g. "ClaimSignal Platform" org) doesn't match the orgs of tenant claims they're governing. Passing their orgId causes a false 404. Passing `undefined` enables cross-tenant access intentionally.

**Important:** Do NOT pass `null` — JavaScript `null` is falsy so it evaluates the same as `undefined` in `if (orgId)` checks, but TypeScript may warn. Always use `undefined` explicitly for the cross-tenant path.

## Files
- `server/storage.ts` — all governance methods accept optional orgId
- `server/routes.ts` — all governance PATCH/DELETE routes implement the isSuperAdmin pattern above
