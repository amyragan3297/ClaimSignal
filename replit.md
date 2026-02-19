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
- Billing gate: Access only if `subscription_status = active` OR `(trialing AND trial_end_date > now())`
- Platform owner can impersonate users with full audit logging
- Session secret via `SESSION_SECRET` env var

### Billing Model
- **4 tiers:** Founder ($249/mo), Pro ($79/mo), Team ($149/mo), Enterprise (custom/contact sales)
- **Founder tier:** 14-day free trial, global cap of 3 subscriptions, full unmasked data (after signing agreement)
- **Pro/Team/Enterprise:** No trial, immediate active status, data always masked
- **Dev fallback:** When Stripe keys not configured, founder gets trial, others get active status
- **Stripe integration:** Checkout sessions with per-tier pricing, webhook handling for subscription lifecycle
- **Required secrets:** `STRIPE_SECRET_KEY`, `STRIPE_PRICE_FOUNDER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM`, `STRIPE_PRICE_ENTERPRISE`, `STRIPE_WEBHOOK_SECRET`

### Intelligence Engines (6 total)
1. Friction Scoring Engine
2. Inspection Integrity Engine
3. Scope Delta Engine
4. Lifecycle Phase Engine (8 phases)
5. Escalation Architecture Engine (levels 0-5)
6. Outcome Migration Engine (monetization layer)

### Key API Routes
- `POST /api/auth/register` - Create org + user + billing account
- `POST /api/auth/login` - Authenticate and get tokens
- `POST /api/auth/refresh` - Rotate refresh token
- `GET /api/auth/me` - Current user, org, billing, founder agreement status
- `GET/POST /api/claims` - CRUD claims with org isolation
- `GET/POST /api/adjusters` - CRUD adjusters
- `POST /api/billing/checkout` - Create Stripe checkout session
- `POST /api/legal/founder/sign` - Sign founder agreement
- `GET /api/admin/overview` - Platform stats (owner only)
- `POST /api/admin/impersonate/:userId` - Impersonate user (owner only)

### Admin Access
- Default platform owner: `admin@claimsignal.com` / `ClaimSignal2026!`
- Auto-seeded on first startup

## Recent Changes
- 2026-02-19: Complete rebuild - all backend files rewritten for new 10-table schema
- 2026-02-19: JWT auth with refresh token rotation, cookie-based refresh
- 2026-02-19: Frontend rewritten with JWT Bearer auth flow, auto-refresh on 401
- 2026-02-19: Homepage updated to 4-tier pricing (Founder/Pro/Team/Enterprise), 6 intelligence engines
- 2026-02-19: Multi-tier billing: Founder $249/mo (14-day trial, 3 cap), Pro $79/mo, Team $149/mo, Enterprise (contact sales)
- 2026-02-19: Registration flow with plan selection, founder cap enforcement, masking per plan type
- 2026-02-19: Adjusters page added with fullName, carrier, licenseNumber, region fields
- 2026-02-19: Admin panel with impersonation and subscription breakdown
- 2026-02-19: Schema: planTypeEnum supports founder/pro/team/enterprise/individual (legacy)
