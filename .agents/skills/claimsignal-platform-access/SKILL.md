---
name: claimsignal-platform-access
description: >
  Implement and enforce the ClaimSignal role-based access system. Use when the user asks about authentication, authorization, roles, access control, billing enforcement, Master Admin, user management, audit logging, login tracking, PII masking, or any access-related functionality. Also triggers when implementing dashboard routing, server-side route protection, or user deletion authority.
---

# ClaimSignal Platform Access & User Management

## Purpose

Enforce a strict, server-side role-based access system where every permission check, billing check, and data access check happens on the server. Never rely on frontend hiding alone. The Master Admin has absolute authority; all other users are subject to billing enforcement and role-based access control.

## Role Hierarchy

| Role | Internal Value | Label | Billing Required? | Special Access |
|---|---|---|---|---|
| **Master Admin** | `super_admin` | Master | No (comped) | Full unmasked access, deletion authority, cross-tenant visibility |
| **Admin** | `admin` | Admin | Yes | Org-level user management |
| **Team Admin** | `team_owner` | Team Admin | Yes | Team seat management, team member oversight |
| **Founder** | `founder` | Founder | Trial/Founder plan | Early access, locked rate, founder agreement required |
| **Individual** | `standard` | Individual | Yes | Single user access |
| **Executive** | `carrier_analyst` | Executive | Yes | Aggregate-only view, no claim details |
| **Investor** | `investor` | Investor | No (approved) | Dashboard-only, read-only metrics |

## Master Admin

Master Admin: `claimsignal1@gmail.com`  
Internal role: `super_admin` (there is no separate `master` enum value)

Master Admin has exclusive authority:
- Full unmasked PII access (server-side `isMaster()` check)
- Full deletion authority (users, organizations, claims, data)
- Full audit visibility (all `audit_logs` cross-tenant)
- Full billing control (comp users, override subscriptions)
- Full user management (create, delete, modify any user)
- Full organization management (create, delete, merge)
- Full AI activity visibility (all prompts, extractions, responses)
- Full platform configuration (feature flags, pricing, integrations)
- Impersonation of any user
- Access to all dashboards regardless of role

## Server-Side Enforcement Rules

### Rule 1: All checks happen server-side
- Never rely on frontend-only hiding for sensitive data
- Every API route must have the correct middleware
- Frontend redirects are UX sugar, not security

### Rule 2: Billing enforcement is mandatory
All non-Master users must have valid access:
- `active` subscription status
- `trialing` status with valid trial end date
- `founder` plan with founder agreement signed
- `team` plan with active seat allocation
- `investor` with approved investor access
- `comped` by Master Admin

### Rule 3: PII masking is server-side
- `applyPiiMasking()` runs in API routes before sending response
- `canViewUnmasked()` only returns `true` for `super_admin`
- Non-Master users always see masked PII regardless of frontend code

### Rule 4: Deletion is Master-only
- `DELETE /api/admin/users/:id` requires `requirePlatformOwner` + `requireMasterDelete`
- `DELETE /api/admin/organizations/:id` requires `requirePlatformOwner` + `requireMasterDelete`
- All deletions are audit-logged with `beforeJson` capture
- Soft delete preferred; hard delete only for Master Admin with explicit confirmation

### Rule 5: Audit logging is comprehensive
Every sensitive action creates an `audit_logs` entry:
- User login / logout
- User registration
- PII unmasked access
- User deletion
- Organization deletion
- Billing changes
- Subscription changes
- Impersonation start/stop
- AI extraction requests
- Identity merge approvals
- Role changes

### Rule 6: Login activity is tracked
- `loginAttempts` table tracks every login attempt
- Fields: `userId`, `email`, `ipAddress`, `userAgent`, `success`, `failureReason`, `timestamp`
- Master Admin can view all login activity
- Used for security monitoring and anomaly detection

## Middleware Reference

| Middleware | Use | Bypass |
|---|---|---|
| `requireAuth` | All authenticated routes | None |
| `requirePlatformOwner` | Master Admin only | Master only |
| `requireSuperAdmin` | Strict super_admin check | super_admin only |
| `requireActiveSubscription` | Billing enforcement | `isPlatformOwner` |
| `requireMasterDelete` | Deletion operations | `isPlatformOwner` only |
| `requireRole(roles[])` | Specific role routes | None (explicit) |
| `requireInvestorApproved` | Investor routes | approved investor |
| `blockDuringImpersonation` | Sensitive operations | Not impersonating |
| `getClientIp` | IP tracking | N/A |

## Billing Enforcement Logic

```
function hasAccess(billing, user):
  if user.isPlatformOwner: return true
  if user.role === "investor" and investorApproved: return true
  if user.compedByMaster: return true
  if billing.subscriptionStatus === "active": return true
  if billing.subscriptionStatus === "trialing" and trialEndDate > now: return true
  if user.role === "founder" and founderAgreement signed: return true
  return false
```

## Dashboard Routing

After login, redirect based on role:

| Role | Redirect Path |
|---|---|
| `super_admin` | `/admin` |
| `founder` | `/founder-dashboard` |
| `carrier_analyst` | `/executive-dashboard` |
| `team_owner` | `/team-dashboard` |
| `standard` | `/individual-dashboard` |
| `investor` | `/investor-dashboard` |
| `admin` | `/dashboard` |

## API Patterns

### Role-specific data endpoints
```typescript
// All routes protected by requireAuth + appropriate role middleware
app.get("/api/admin/audit-logs", requireAuth, requirePlatformOwner, ...)
app.get("/api/admin/login-activity", requireAuth, requirePlatformOwner, ...)
app.delete("/api/admin/users/:id", requireAuth, requirePlatformOwner, requireMasterDelete, ...)
app.delete("/api/admin/organizations/:id", requireAuth, requirePlatformOwner, requireMasterDelete, ...)
app.post("/api/admin/comp-user", requireAuth, requirePlatformOwner, ...)
app.get("/api/investor/dashboard", requireAuth, requireInvestorApproved, ...)
```

### Audit log entry format
```typescript
{
  organizationId: string,
  actorUserId: string,
  actorRole: string,
  actionType: string,
  entityType: string,
  entityId: string,
  beforeJson: object,
  afterJson: object,
  ipAddress: string,
  metadata: object
}
```

## Integration with ClaimSignal

When working inside the ClaimSignal codebase:

- Use `server/auth.ts` for all middleware
- Use `server/masking.ts` for all PII handling
- Use `shared/schema.ts` for all access-related tables
- Use `server/storage.ts` for all data access
- Use `client/src/lib/auth.tsx` for frontend auth state
- Apply `requireActiveSubscription` to all paid feature routes
- Apply `requirePlatformOwner` to all Master Admin routes
- Apply `blockDuringImpersonation` to billing, deletion, and role change routes

## Edge Cases

- **Impersonation:** Master Admin can impersonate any user. During impersonation, `blockDuringImpersonation` prevents billing changes and deletions.
- **Expired trial:** `trialing` status with `trialEndDate` in the past → redirect to billing page.
- **Founder without agreement:** `founder` role without signed founder agreement → show founder legal page.
- **Team without seats:** `team` plan with `seatCount` exceeded → block new team members.
- **Investor pending:** `investor` role without approval → show "Pending Approval" page.
- **Comped user:** Master Admin can comp any user, bypassing all billing checks. Comp status is logged.
