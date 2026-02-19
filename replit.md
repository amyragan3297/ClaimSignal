# ClaimSignal

## Overview

ClaimSignal is a production-ready SaaS platform providing operational intelligence for property insurance claims. It offers structured behavioral analytics, escalation modeling, and audit-ready claim infrastructure for restoration contractors, public adjusters, and insurance consultants.

The application is a full-stack monorepo with a React frontend and Express backend, using PostgreSQL with Drizzle ORM for data persistence. It features multi-tenant organization-based isolation, JWT-based authentication with refresh tokens, Stripe billing integration, and a founder-only pricing model with 14-day trials and legal agreement gating for full data access.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Monorepo Structure
- `client/` — React SPA (Vite + TypeScript + Tailwind CSS)
- `server/` — Express API server (TypeScript, port 5000)
- `shared/` — Shared schema and types (Drizzle ORM schema, Zod validators)
- `attached_assets/` — Product requirement documents and screenshots

### Frontend Architecture
- **Framework:** React 18 with TypeScript, bundled by Vite
- **Routing:** Wouter (lightweight client-side router)
- **State/Data:** TanStack React Query for server state, React Context for auth
- **UI:** shadcn/ui component library with Radix UI primitives, Tailwind CSS
- **Forms:** React Hook Form with Zod resolvers
- **Dark mode:** Always-on dark mode via CSS class strategy
- **Path aliases:** `@/` maps to `client/src/`, `@shared/` maps to `shared/`, `@assets/` maps to `attached_assets/`
- **Branding:** "CLAIMSIGNAL" with blue accent, dark theme matching ClaimSignal1.com

Key pages: Homepage (public), Login/Register, Dashboard, Claims, Adjusters, Billing, Founder Legal Agreement, Admin (platform owner only).

### Backend Architecture
- **Framework:** Express.js with TypeScript
- **Authentication:** JWT access tokens (15min expiry) + HTTP-only cookie refresh tokens (30 days) with token rotation
- **Middleware stack:** `requireAuth`, `requireActiveSubscription`, `requirePlatformOwner`, `blockDuringImpersonation`
- **API prefix:** All routes under `/api/`
- **Health check:** `GET /api/health`
- **Webhook:** `POST /api/billing/webhook` uses `express.raw()` before JSON parser
- **Cookie parsing:** `cookie-parser` for refresh token cookies

### Database
- **Engine:** PostgreSQL (via `DATABASE_URL` env var)
- **ORM:** Drizzle ORM with `drizzle-kit`
- **Schema push:** `npm run db:push`
- **Schema location:** `shared/schema.ts`
- **Key tables:** `organizations`, `users`, `user_sessions`, `billing_accounts`, `claims`, `claim_versions`, `adjusters`, `adjuster_metrics`, `founder_agreements`, `audit_logs`
- **Multi-tenancy:** Organization-based isolation
- **IDs:** UUID primary keys via `gen_random_uuid()`

### Authentication & Authorization
- JWT-based with 15-minute access tokens and 30-day refresh tokens
- Refresh tokens stored as SHA-256 hashes in `user_sessions` table
- Token rotation on refresh (old token revoked, new one issued)
- **Roles:** `super_admin`, `admin`, `founder`, `standard` (userRoleEnum)
- **super_admin** role = platform owner, has full admin panel access, impersonation, all data visibility
- Billing gate: Access only if `subscription_status = active` OR `(trialing AND trial_end_date > now())`
- Session secret via `SESSION_SECRET` env var

### Billing Model
- **4 tiers:** Founding Partner ($99/mo), Pro ($199/mo), Team ($399/mo), Enterprise (custom/contact sales)
- **Founding Partner:** 14-day trial, card required upfront, auto-converts, $99/mo locked permanently, cancel = lose pricing forever, global cap of 3 subscriptions, full unmasked data (after signing Founding Partner Agreement with co-branding/logo terms)
- **Pro/Team/Enterprise:** No trial, immediate active status, data always masked
- **Dev fallback:** When Stripe keys not configured, founder gets trial, others get active status
- **Stripe integration:** Checkout sessions with per-tier pricing, webhook handling for `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_failed`
- **Required secrets:** `STRIPE_SECRET_KEY`, `STRIPE_PRICE_FOUNDER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM`, `STRIPE_PRICE_ENTERPRISE`, `STRIPE_WEBHOOK_SECRET`

### Intelligence Engines (6 total)
1. Friction Scoring Engine
2. Inspection Integrity Engine
3. Scope Delta Engine
4. Lifecycle Phase Engine (8 phases)
5. Escalation Architecture Engine (levels 0-5)
6. Outcome Migration Engine (monetization layer)

### PII Masking & Data Privacy
- **Role-based PII masking** enforced at API level (not UI)
- **PII fields:** homeownerName, homeownerPhone, homeownerEmail, propertyAddress, claimNumber, policyNumber, insuredName
- **Masking policy:** Only super_admin can unmask PII; all other roles (including team_owner, founder) see masked PII
- **Unmasked toggle:** `GET /api/claims?unmasked=true` — backend enforces super_admin-only role check, audits every unmask action
- **Audit trail:** PII_UNMASK_VIEW logged with actorUserId, tenantId, timestamp for legal protection
- **Masking ON by default** — no raw PII in dashboards, screenshots, or exports unless super_admin explicitly toggles
- **Masking utility:** `server/masking.ts` — `applyPiiMasking()`, `applyPiiMaskingToList()`, `canViewUnmasked()`
- **requireSuperAdmin middleware:** destructive routes (DELETE claims) require super_admin role
- **Tenant isolation:** super_admin can see cross-tenant data; all other roles scoped to their organization

### Key API Routes
- `POST /api/auth/register` - Create org + user + billing account
- `POST /api/auth/login` - Authenticate and get tokens
- `POST /api/auth/refresh` - Rotate refresh token
- `GET /api/auth/me` - Current user, org, billing, founder agreement status
- `GET /api/claims` - List claims (tenant-scoped, super_admin cross-tenant, supports `?unmasked=true`)
- `GET /api/claims/:id` - Get claim detail (tenant-scoped, super_admin cross-tenant, supports `?unmasked=true`)
- `POST /api/claims` - Create claim with PII fields
- `DELETE /api/claims/:id` - Soft delete (requireSuperAdmin only)
- `GET/POST /api/adjusters` - CRUD adjusters (tenant-scoped, super_admin cross-tenant)
- `POST /api/billing/checkout` - Create Stripe checkout session
- `POST /api/legal/founder/sign` - Sign founder agreement
- `GET /api/admin/overview` - Platform stats (owner only)
- `POST /api/admin/impersonate/:userId` - Impersonate user (owner only)
- `POST /api/evidence/upload` - Upload evidence file (multipart/form-data, auto-classifies and extracts entities)
- `GET /api/evidence/files` - List evidence files (tenant-scoped)
- `GET /api/evidence/files/:id` - Get single evidence file
- `POST /api/evidence/files/:id/match` - Match evidence file to a claim
- `GET /api/evidence/entities/:evidenceFileId` - Get extracted entities for a file
- `GET /api/evidence/timeline/:claimId` - Get timeline events for a claim
- `GET /api/evidence/drafts` - List claim drafts needing review

### Evidence Pipeline
- **Upload:** SHA-256 deduplication, regex-based document classification (9 categories), entity extraction (claim#, policy#, dates, amounts, names)
- **Auto-matching:** Matches uploaded documents to claims by claim number, policy number, or fuzzy name+address
- **Timeline events:** Auto-generated from document classification (denial, payment, supplement, inspection events)
- **Claim drafts:** Created for unmatched uploads with status needs_review
- **Document categories:** denial_letter, estimate, scope, payment_letter, supplement, invoice, photo_report, policy, email_thread, unknown

### Lifecycle Phases & Scoring
- **9 lifecycle phases:** pre_claim, filed, inspected, initial_determination, supplement_submitted, reinspection_requested, escalated, resolved, closed
- **Lifecycle velocity scoring:** Weighted time intervals (inspection 0.3, determination 0.4, resolution 0.3), normalized 0-100, lower=better
- **Intelligence scores:** frictionScore, scopeDeltaScore, escalationLevel (0-5), outcomeMigrationDelta, approvalProbability
- **Financial fields:** rcvAmount, acvAmount, deductible, supplementAmountTotal, finalPaidAmount

### Admin Access
- Default platform owner: `admin@claimsignal.com` / `ClaimSignal2026!`
- Auto-seeded on first startup with role: super_admin

## Recent Changes
- 2026-02-19: Complete rebuild - all backend files rewritten for new 10-table schema
- 2026-02-19: JWT auth with refresh token rotation, cookie-based refresh
- 2026-02-19: Frontend rewritten with JWT Bearer auth flow, auto-refresh on 401
- 2026-02-19: Homepage updated to 4-tier pricing, 6 intelligence engines
- 2026-02-19: Pricing finalized: Founding Partner $99/mo (14-day trial, 3 cap, price locked permanently), Pro $199/mo, Team $399/mo, Enterprise (contact sales)
- 2026-02-19: Founding Partner Agreement updated with strategic terms: lifetime pricing lock, cancel = lose forever, co-branding/logo permissions
- 2026-02-19: Added invoice.payment_failed webhook handler for past_due status
- 2026-02-19: Registration flow with plan selection, founder cap enforcement, masking per plan type
- 2026-02-19: Adjusters page added with fullName, carrier, licenseNumber, region fields
- 2026-02-19: Admin panel with impersonation and subscription breakdown
- 2026-02-19: Schema: planTypeEnum supports founder/pro/team/enterprise/individual (legacy)
- 2026-02-19: Added clients table (homeowner records separate from claims) with CRUD API
- 2026-02-19: Added supplements table with CRUD API under /api/claims/:id/supplements
- 2026-02-19: Added documents, emails, ai_insights tables (schema ready, basic CRUD in storage)
- 2026-02-19: Extended claims with clientId, roofType, shingleType, rcvTotal, acvTotal, deductible, escalationCategory, approvalProbability
- 2026-02-19: Export system: GET /api/exports/claims/:claimId with ?format=pdf|csv&type=intelligence_summary|claim_packet_masked|claim_packet_unmasked
- 2026-02-19: Export enforces masking for non-privileged roles, audit logs all exports (EXPORT_MASKED/EXPORT_UNMASKED)
- 2026-02-19: Clients page with CRUD UI, claim detail page with supplements section and export dropdown
- 2026-02-19: Navigation updated: Dashboard, Claims, Clients, Adjusters, Billing
- 2026-02-19: Evidence pipeline: SHA-256 dedup, document classification, entity extraction, claim auto-match, timeline events
- 2026-02-19: New tables: evidence_files, extracted_entities, claim_drafts, audio_recordings, timeline_events, adjuster_playbooks, irc_codes, supplement_triggers, pii_access_logs
- 2026-02-19: Claims extended with lifecycle phases (9 phases), lifecycle dates, financial fields, scoring fields, AI summary fields
- 2026-02-19: Masking policy tightened: only super_admin can unmask PII (team_owner removed)
- 2026-02-19: Lifecycle velocity scoring engine (weighted time intervals, 0-100 normalized)
- 2026-02-19: Evidence upload page with drop zone, classification display, entity viewer, claim matching
- 2026-02-19: Claim detail page enhanced with phase progression, financial summary, intelligence scores, timeline
- 2026-02-19: Claims list enhanced with Phase and Escalation columns, new form fields for phase/dates/financials
- 2026-02-19: Navigation updated: Dashboard, Claims, Evidence, Clients, Adjusters, Billing
