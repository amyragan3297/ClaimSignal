---
name: PII masking model
description: How ClaimSignal masks claim data — which roles see what, which endpoints apply masking, and how the shared library works.
---

## Role mapping (important)
Master === super_admin internally. There is NO separate "master" enum value. The
DB enum `user_role` = super_admin/admin/team_owner/founder/standard/carrier_analyst.
"Master" is a user-facing display label via ROLE_LABEL in client app-layout.tsx.
`MASTER_ROLE` const in server/masking.ts is the single source of truth.

## Core rule
Master (super_admin) always receives unmasked data automatically — no query param, no toggle.
Non-Master users see own-org claims unmasked; cross-tenant shared claims always masked server-side.

## Contractor-identity stripping in shared views
sanitizeSharedClaimRecord() strips (for non-Master): organizationId, clientId,
notes (internal contractor notes), aiClaimSummary, address (street), zipCode.
PRESERVES adjuster intelligence: carrier, adjusterId, lossType, dateOfLoss, status,
currentPhase, city/state (generalized), and ALL friction/risk/escalation scores.
**Why:** the shared library exists to surface adjuster behavior patterns, so adjuster
data must never be masked — only homeowner PII + contractor identity.

## Tests
server/masking.test.ts — run `npx tsx server/masking.test.ts` (99 assertions, pure-function, no DB).

## Masking functions (server/masking.ts)
- `maskName()` — initials only: "John Smith" → "J. S."
- `maskClaimNumber()` — first 4 digits + asterisks: "800816754" → "8008*****"
- `maskAddress()` — city/state only from last two comma-parts: "604 Milton Rd, Athens, AL" → "Athens, AL"
- `maskString()` — partial: first 2 chars + asterisks (for policy numbers)
- `homeownerPhone` / `homeownerEmail` — always set to null for non-Master
- `sanitizeSharedClaimRecord()` — applies PII masking + strips organizationId for cross-tenant records

## Endpoints
- `GET /api/claims` — Master: all orgs, unmasked, audit log. Non-Master: own org only, unmasked.
- `GET /api/claims/:id` — Master: unmasked, audit log. Non-Master: own org only (org-scoped query), unmasked.
- `GET /api/claims/shared` — All roles can access. Master: unmasked. Non-Master: `sanitizeSharedClaimList()` applied. Always audit logged.

**Why:** Shared library route must be declared BEFORE `/api/claims/:id` in Express or Express matches "shared" as the :id param.

## Frontend
- No unmask toggle on claims.tsx or claim-detail.tsx — masking is purely server-side.
- claims.tsx has two tabs: "My Claims" (own org, always unmasked) and "Platform Library" (shared masked, from /api/claims/shared).
- claim-detail.tsx shows an amber "Master view — all PII visible" banner only for super_admin.
- Export menu: "Full Claim Packet - Unmasked" items gated to `isMaster` only.
