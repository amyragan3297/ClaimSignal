---
name: claim_adjusters multi-adjuster linkage
description: Design rules for the claim_adjusters join table (multi-adjuster / cross-claim) and how uniqueness is enforced.
---

# claim_adjusters linkage

Additive join table linking adjusters to claims (many-to-many). `claim.adjusterId` is kept as the legacy primary; the join table is the real multi-adjuster model.

## Uniqueness rule
A claim may have the SAME adjuster in MULTIPLE distinct roles (e.g. primary_adjuster + supervisor + reinspection_adjuster). Uniqueness is therefore on the triple **(claim_id, adjuster_id, role_on_claim)**, NOT (claim_id, adjuster_id).

**Why:** Real escalations involve one person acting in several capacities over a claim's life; collapsing to one row per adjuster would lose that and inflate/confuse analytics. But the exact same adjuster+role pair twice is always a duplicate.

**How to apply:** Enforced two ways that must stay in lockstep — a DB `uniqueIndex` (`claim_adjusters_claim_adjuster_role_uniq`) in shared/schema.ts AND an app-level pre-insert check in the POST link route returning 409. If you change the uniqueness key, change both.

## Provisioning / backfill
Table + enums are committed in shared/schema.ts, so the normal `npm run db:push` (post-merge.sh) provisions them — reproducible without a hand-written migration. The legacy backfill (one primary_adjuster row per claim that has claim.adjusterId) was a one-time idempotent data step run via a throwaway tsx script on the app pg pool (see db-migrations.md), not committed.

## RBAC / tenancy
Routes resolve the claim via a caller-scoped helper: own-org for everyone, cross-tenant only for super_admin (Master). All link mutations scope to claim.organizationId and verify link ownership (link.claimId === claim.id) so non-Master cannot tamper across tenants. carrier_analyst is blocked from writes server-side (audited as ADJUSTER_LINK_DENIED), not just hidden in UI.
