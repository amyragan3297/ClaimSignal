---
name: Express body parser ordering
description: Why route-level express.json limit overrides silently fail, and the fix used in this repo
---

# Express JSON body-parser ordering

A global `app.use(express.json(...))` runs before any route-level `express.json({ limit })`.
Once the global parser has consumed (or rejected) the body, the route-level parser sees
`req._body` already set and skips — so a per-route higher `limit` has **no effect**, and
oversized payloads are rejected with 413 by the global parser's default (~100kb) limit.

**Why:** The audio transcribe route accepts large base64 audio. Adding
`express.json({ limit: "30mb" })` on just that route did nothing until the global parser
was bypassed for its path.

**How to apply:** In `server/index.ts` the global JSON parser is wrapped so it skips
`/api/audio/transcribe` (similar to how `/api/billing/webhook` uses `express.raw`); the
route then installs its own large-limit parser. Any future route needing a larger body
limit must be excluded from the global parser the same way.
