---
name: claimsignal-revenue-intelligence
description: >
  Identify financial opportunities, claim value gaps, underpayment patterns,
  supplement opportunities, recoverable depreciation, missing scope, and revenue
  impact across all claims. Use when the user asks about revenue, underpaid claims,
  supplement opportunities, depreciation recovery, financial impact, claim value,
  or money left on the table. Also triggers for financial analysis, payment
  tracking, or recovery opportunity detection.
---

# ClaimSignal Revenue Intelligence

## Purpose

Turn claim financial data into actionable revenue intelligence. Identify underpaid claims, supplement opportunities, recoverable depreciation, missing scope, and business value gaps without inventing numbers or making unsupported claims.

## When to Use

- User asks about revenue opportunities or claim value gaps
- User wants to know if a claim is underpaid
- User asks about supplement opportunities or missing scope
- User mentions recoverable depreciation or depreciation release
- User wants financial impact analysis across claims
- User asks about payment delays or outstanding amounts
- User wants to track revenue by carrier, adjuster, or contractor
- User asks about O&P (overhead and profit) opportunities
- User mentions code items, matching issues, or price list changes
- User wants revenue alerts or financial summaries

## Core Principle

Revenue intelligence is evidence-based, not speculative. Every dollar amount must trace to a document. Every opportunity must include confidence. Never claim guaranteed recovery or carrier bad faith without legal documentation.

## Responsibilities

### 1. Extract Financial Data

Extract these financial fields from every claim document:

- **RCV** (Replacement Cost Value) — from estimate or scope
- **ACV** (Actual Cash Value) — from estimate or payment letter
- **Deductible** — from policy or estimate
- **Depreciation** — recoverable and non-recoverable
- **Payments issued** — from payment letters, checks, EFT records
- **Supplement requested** — amount from supplement submission
- **Supplement approved** — amount from approval letter
- **Amount still owed** — calculated: RCV - payments - deductible
- **Price list version** — Xactimate, Symbility, or carrier-specific
- **Line item totals** — per category (roof, siding, interior, etc.)

**Source tracking:** Every extracted financial value must include:
- Document name and type (estimate, payment letter, supplement)
- Page number if applicable
- Confidence score (0.0 to 1.0)
- Extraction date

### 2. Detect Revenue Opportunities

AI identifies these opportunity types across all claims:

| Opportunity Type | Detection Signal | Evidence Source |
|---|---|---|
| **Missing scope** | Line items in estimate but not in scope | Compare estimate to scope |
| **Omitted code items** | Code compliance required but not included | Policy, local codes, estimate |
| **Underpaid line items** | Unit price below market rate | Price list comparison |
| **Depreciation not released** | `recoverableDepreciation` > 0 and not released | Payment history, policy |
| **Supplement not submitted** | Scope gap identified, no supplement on file | Evidence files, supplements table |
| **Supplement pending** | Supplement submitted, no response in 21 days | `supplements` table |
| **Payment delay** | Approved but not paid within 14 days | Timeline events, payment records |
| **Reinspection opportunity** | Denied claim with reinspection potential | Denial letter, claim status |
| **Matching issue** | Matching items disputed or omitted | Estimate, scope comparison |
| **O&P opportunity** | Overhead and profit omitted or reduced | Estimate line items |

### 3. Estimate Financial Impact

For each opportunity, calculate:

- **Potential recovery amount** — estimated dollars if opportunity is pursued
- **Confirmed recovery amount** — dollars already recovered from supplements
- **Pending supplement amount** — submitted but not yet approved
- **Approved supplement amount** — approved but not yet paid
- **Lost opportunity amount** — expired deadlines, forfeited depreciation

**Calculation rules:**
- Potential recovery = scope gap × unit price × quantity
- If unit price is unknown, use regional average from playbook data
- If quantity is unknown, flag as "Needs Review" and do not estimate
- Never invent dollar amounts — if uncertain, mark "Needs Review"

### 4. Track Revenue by Dimensions

Aggregate revenue intelligence across these dimensions:

- **By claim** — total opportunities, confirmed recovery, pending amounts
- **By carrier** — carrier-level underpayment patterns, approval rates
- **By adjuster** — adjuster-level payment patterns, supplement behavior
- **By contractor** — contractor recovery rates, opportunity capture
- **By organization** — org-level revenue metrics (tenant-scoped)
- **By region** — geographic revenue patterns
- **By claim type** — hail, wind, water, fire patterns
- **By damage type** — roof, siding, interior, structural
- **By playbook pattern** — which successful strategies generate revenue

### 5. Generate AI Revenue Alerts

AI generates alerts for these conditions:

- **Claim may be underpaid** — `finalPaidAmount` < `acvAmount` − `deductible`
- **Supplement opportunity detected** — scope gap > $1,000
- **Depreciation may be recoverable** — `recoverableDepreciation` > 0, not released
- **Missing code item detected** — code trigger in `supplementIntelligence`
- **Payment delay detected** — approved > 14 days, no payment
- **Approved amount differs from requested** — supplement approved < requested
- **Price list update may increase claim value** — price list changed after estimate

**Alert format:**
```json
{
  "alertType": "supplement_opportunity",
  "claimId": "<id>",
  "estimatedImpact": 5000,
  "confidence": 0.82,
  "evidence": ["estimate.pdf", "scope.pdf"],
  "recommendedAction": "Submit supplement for missing line items",
  "urgency": "high"
}
```

### 6. Preserve Source Evidence

Every financial insight must include:

- **Document name** — original upload
- **Document type** — estimate, payment letter, supplement, invoice, policy
- **Page number** — if applicable
- **Confidence score** — extraction confidence
- **Extraction date** — when the insight was generated

**Why:** Revenue intelligence is often disputed. Source evidence allows audit, dispute resolution, and confidence recalculation.

### 7. Never Invent Dollar Amounts

If a financial number is uncertain:

- Mark the field as **"Needs Review"**
- Set confidence score < 0.70
- Include the raw text snippet
- Flag for human review

**Never invent:**
- RCV amounts
- ACV amounts
- Payment amounts
- Supplement amounts
- Depreciation values
- Deductible amounts

**Correct action:** Leave the field null, mark as "Needs Review," and flag the missing field for the user to fill in.

### 8. Use Careful Language

Revenue intelligence affects business decisions and carrier relationships. Use careful language:

**Use:**
- "Potential opportunity"
- "Estimated recovery"
- "Possible underpayment"
- "Needs review"
- "Supported by document"
- "Trend suggests"
- "May indicate"

**Avoid:**
- "Guaranteed recovery"
- "Carrier owes"
- "Bad faith" (unless legally documented)
- "Underpaid by $X" (unless confirmed by payment record)
- "Supplement will be approved" (no outcome guarantees)

### 9. Master Admin Visibility

Master Admin (claimsignal1@gmail.com) can view:
- All revenue intelligence across all organizations
- Unmasked financial data for all claims
- Revenue opportunity summaries
- Alert history and outcomes
- Revenue by carrier, adjuster, and region (cross-tenant)

### 10. Non-Master User Access

Non-Master users see:
- Revenue intelligence for claims they own or are assigned to
- Shared revenue patterns (aggregated, anonymized)
- Private claim financial details only for their own claims
- Tenant-scoped revenue metrics

**PII masking:** Financial data may include homeowner names, addresses, or policy numbers. Apply `server/masking.ts` before displaying to non-Master users.

## Integration with ClaimSignal

When working inside the ClaimSignal codebase:

- Use `claims` table for RCV, ACV, deductible, depreciation, payments
- Use `supplements` table for supplement requests and approvals
- Use `supplementIntelligence` table for code triggers and patterns
- Use `evidence_files` for document extraction and source tracking
- Use `playbookEntries` for successful revenue strategies
- Use `timelineEvents` for payment delay detection
- Use `intelligence_events` for revenue alert history
- Apply PII masking via `server/masking.ts` before displaying to non-Master users
- Use `computeFullClaimScoring()` for claim health and opportunity scoring

## Edge Cases

- **Missing financial data:** If `rcvAmount` or `acvAmount` is null, exclude the claim from financial aggregates. Do not assume zero.
- **Conflicting amounts:** If two documents show different payment amounts, keep both and flag the conflict. Do not arbitrarily pick one.
- **Partial payment:** If multiple payments exist, sum them. If payment dates differ, track the latest.
- **Expired depreciation:** If recoverable depreciation deadline has passed, mark as "Lost Opportunity" with the expired amount.
- **Supplement denied:** If a supplement was denied, update the opportunity status to "Denied" and capture the denial reason.
- **Tenant isolation:** Non-Master users see only their organization's revenue data. Master users see cross-tenant aggregates.
