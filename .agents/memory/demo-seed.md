---
name: Demo seed guard
description: seedDemoData is idempotent — checks for existing claims before seeding.
---

## Rule
The `seedDemoData()` function in `server/routes.ts` is guarded: it checks if any claims exist for the org before inserting. Safe to call on every startup.

**Demo credentials:** user@claimsignal.test / password123 — role=super_admin, planType=pro, subscriptionStatus=active.

**Demo claim:** SF-2026-0412897 — J. S***, **** Oak Ave, Dallas TX (masked PII). Has AI insights, timeline events, evidence files, and supplement data.
