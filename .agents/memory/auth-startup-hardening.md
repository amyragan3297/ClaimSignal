---
name: Auth startup hardening
description: How production secret/credential safety is enforced at startup, and why the policy is centralized.
---

## Rules
- JWT signing secret comes only from `resolveJwtSecret()` (server/config.ts). In production it THROWS if `SESSION_SECRET` is missing; the labeled insecure dev fallback is allowed only outside production. `server/auth.ts` must never embed a hardcoded secret.
- `assertStartupConfig()` runs in `server/index.ts` before routes/listen, so misconfigured production fails fast before serving traffic.
- All Master/platform-owner seeding goes through `resolveSeedMasterCredentials()` (server/config.ts). It returns `null` in production unless BOTH `MASTER_EMAIL` and `MASTER_INITIAL_PASSWORD` are set — it never falls back to hardcoded defaults in production, **including when `DEMO_MODE=true`**. Hardcoded demo/test accounts are created only when the returned `isDemo` is true (non-production).
- API request logging in `server/index.ts` wraps the captured JSON in `redactSensitive()` (server/config.ts) so auth responses never leak `accessToken`/`refreshToken`/`token`/`password`/`passwordHash`/`secret`.

**Why:** Two real risks were found — a hardcoded JWT fallback and a default Master credential (admin@claimsignal.com / a known password) that could be seeded in production, plus access tokens being written to logs. Centralizing the seed-credential decision in one pure function makes the "no defaults in prod" rule testable and prevents the DEMO_MODE bypass from reappearing.

**How to apply:** When touching auth startup, seeding, or logging, route decisions through these config functions rather than re-deriving env logic inline. Regression coverage lives in `server/auth.test.ts` (run `npx tsx server/auth.test.ts`).
