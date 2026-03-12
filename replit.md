# ClaimSignal

## Overview

ClaimSignal is a production-ready SaaS platform providing operational intelligence for property insurance claims. It offers structured behavioral analytics, escalation modeling, and audit-ready claim infrastructure for restoration contractors, public adjusters, and insurance consultants. The platform aims to enhance claims management through data-driven insights and process optimization.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

ClaimSignal is a full-stack monorepo with a React frontend (`client/`), an Express backend (`server/`), and shared schemas/types (`shared/`). It uses PostgreSQL with Drizzle ORM.

### Frontend
- **Framework:** React 18 with TypeScript (Vite)
- **Routing:** Wouter
- **State Management:** TanStack React Query for server state, React Context for authentication
- **UI:** shadcn/ui, Radix UI, Tailwind CSS (always-on dark mode)
- **Forms:** React Hook Form with Zod resolvers
- **Branding:** "CLAIMSIGNAL" with a blue accent and dark theme.
- **Key Pages:** Homepage, Login/Register, Dashboard, Claims, Adjusters, Billing, Founder Legal Agreement, Admin.

### Backend
- **Framework:** Express.js with TypeScript
- **Authentication:** JWT access tokens (15min) and HTTP-only cookie refresh tokens (30 days) with token rotation.
- **Middleware:** `requireAuth`, `requireActiveSubscription`, `requirePlatformOwner`, `blockDuringImpersonation`.
- **API:** All routes under `/api/`.
- **Webhook:** Stripe webhook handling at `/api/billing/webhook`.

### Database
- **Engine:** PostgreSQL
- **ORM:** Drizzle ORM
- **Multi-tenancy:** Organization-based isolation.
- **IDs:** UUID primary keys.
- **Key Tables:** `organizations`, `users`, `user_sessions`, `billing_accounts`, `claims`, `adjusters`, `founder_agreements`, `audit_logs`, `evidence_files`, `intelligence_events`.

### Authentication & Authorization
- **Mechanism:** JWT for access, refresh tokens for session management.
- **Roles:** `super_admin`, `admin`, `founder`, `standard`.
- **Access Control:** Billing gate based on subscription status.
- `super_admin` has full platform access, impersonation, and cross-tenant data visibility.

### Billing Model
- **Tiers:** Founding Partner ($99/mo), Pro ($199/mo), Team ($399/mo), Enterprise (custom).
- **Founding Partner:** 14-day trial (card required), $99/mo locked permanently, limited availability, requires legal agreement for unmasked data.
- **Other Tiers:** No trial, immediate active status, data always masked by default.
- **Stripe Integration:** Checkout sessions, webhook handling for subscription lifecycle.

### Intelligence Engines
ClaimSignal incorporates six core intelligence engines: Friction Scoring, Inspection Integrity, Scope Delta, Lifecycle Phase, Escalation Architecture, and Outcome Migration.

### PII Masking & Data Privacy
- **Policy:** Role-based PII masking enforced at the API level.
- **PII Fields:** homeownerName, homeownerPhone, homeownerEmail, propertyAddress, claimNumber, policyNumber, insuredName.
- **Access:** Only `super_admin` can view unmasked PII, with all unmasking actions audited.
- **Default:** Masking is ON by default; PII is not exposed in dashboards or exports unless explicitly unmasked by a `super_admin`.
- **Tenant Isolation:** Data is tenant-scoped; `super_admin` can view cross-tenant data.

### Evidence Pipeline
- **Functionality:** Upload, SHA-256 deduplication, regex-based document classification (9 categories), entity extraction (claim #, policy #, dates, amounts, names).
- **Automation:** Auto-matching documents to claims, auto-generation of timeline events, creation of claim drafts for unmatched uploads.
- **Document Categories:** denial_letter, estimate, scope, payment_letter, supplement, invoice, photo_report, policy, email_thread, unknown.

### Lifecycle Phases & Scoring
- **Phases:** 9 distinct lifecycle phases (e.g., pre_claim, filed, inspected, resolved, closed).
- **Scoring:** Lifecycle velocity scoring (weighted time intervals), frictionScore, scopeDeltaScore, escalationLevel, outcomeMigrationDelta, approvalProbability.

### Dual-Sided Intelligence Architecture
- **Organization Types:** contractor, roofing_firm, enterprise_operator, carrier, tpa.
- **Data Layers:**
    1.  Private Tenant Data
    2.  Aggregated Anonymous Behavioral Data (e.g., `adjuster_aggregated_metrics`)
    3.  Carrier Intelligence
- **Carrier Mode:** Carriers view aggregated pattern intelligence without homeowner PII.

### Intelligence Core v2 – Master Scoring Model
- **Master Scores:** `adjuster_friction_score`, `claim_friction_score`, `supplement_resistance_score`, `communication_risk_score`.
- **Metrics:** Includes `denialRatio`, `partialApprovalRatio`, `supplementReductionRatio`.
- **Configurable Weights:** Scoring weights are stored in the `scoring_weights` table.
- **Scoring Pipeline:** `computeFullClaimScoring()` and `computeAggregatedMetrics()`.

### Intelligence Events
- **Model:** Unified behavioral event stream (`intelligence_events` table).
- **Source Types:** document, transcript, email, manual, system.
- **Categories:** denial, payment, supplement, irc_trigger, communication_signal, lifecycle, escalation.
- **Scoring:** Event-driven scoring for claim friction and adjuster friction.
- **Playbook Generation:** Auto-generates behavioral recommendations based on event frequency.

## External Dependencies

- **PostgreSQL:** Primary database.
- **Stripe:** Billing and subscription management.
- **Vite:** Frontend tooling for React.
- **TanStack React Query:** Server state management.
- **Radix UI / shadcn/ui:** UI component libraries.
- **Tailwind CSS:** Styling framework.
- **Drizzle ORM:** TypeScript ORM for PostgreSQL.
- **Zod:** Schema validation.
- **Wouter:** Lightweight client-side router.