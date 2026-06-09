---
name: claimsignal-executive-intelligence
description: >
  Convert claim, adjuster, carrier, playbook, timeline, supplement, payment, and document
  data into executive-level business intelligence. Use when the user asks for executive
  dashboards, KPIs, business analytics, financial summaries, or claim performance reports.
  Also triggers when the user asks for top risks, opportunities, trends, revenue impact,
  or recommended actions at the platform or organization level.
---

# ClaimSignal Executive Intelligence

## Purpose

Turn all claim intelligence into executive-level decision support. Aggregate data across claims, adjusters, carriers, playbooks, and timelines to produce KPIs, risk alerts, opportunity flags, and recommended actions.

## When to Use

- User asks for executive dashboards, KPIs, or business analytics
- User wants a financial summary of claims (RCV, ACV, payments, supplements)
- User asks for top risks, opportunities, or trends
- User wants to compare carrier or adjuster performance
- User asks for aging claims or claims needing attention
- User wants revenue impact or recovery opportunity analysis
- User asks for emerging denial, approval, or carrier trends
- User wants automated executive summaries

## Core Principle

Executive intelligence is actionable, not decorative. Every number must connect to a claim. Every trend must connect to evidence. Every recommendation must be traceable. Use careful language: "indicates," "suggests," "trending," "needs review." Never claim causation or guarantee outcomes.

## Responsibilities

### 1. Aggregate All Claim Data

Pull data from these tables:
- `claims` — claim status, financial amounts, outcomes, denial reasons
- `timeline_events` — claim lifecycle events, dates, status transitions
- `intelligence_events` — behavioral events, patterns, escalations
- `adjusters` + `claim_adjusters` — adjuster involvement, roles, outcomes
- `playbookEntries` — successful patterns, strategies, outcomes
- `evidence_files` — document uploads, coverage, gaps
- `supplements` — supplement requests, approvals, amounts
- `supplementIntelligence` — supplement triggers, patterns, outcomes

**Scope:** Aggregate at the organization level for non-Master users. Aggregate across all organizations for Master users. Apply tenant isolation via `organization_id`.

### 2. Track Executive KPIs

**Operational KPIs:**
- **Total claims** — count of all claims in scope
- **Open claims** — claims with status "open"
- **Closed claims** — claims with status "closed"
- **Denied claims** — claims with `denialOverturned = false` and denial outcome
- **Approved claims** — claims with approval outcome
- **Reopened claims** — claims that transitioned from denied to reopened
- **Overturned denials** — claims with `denialOverturned = true`
- **Supplement approvals** — claims with `supplementOutcome = "approved"`
- **Aging claims** — open claims > 30 days without status change
- **Claims needing action** — open claims with no activity in 14 days

**Calculation:** Use `claims` table for status counts. Use `timeline_events` for aging (compare `created_at` of last event to current date).

### 3. Track Financial KPIs

**Financial aggregates from `claims` table:**
- **Total RCV** — sum of `rcvAmount` or `rcvTotal`
- **Total ACV** — sum of `acvAmount` or `acvTotal`
- **Total deductible** — sum of `deductible`
- **Total depreciation** — sum of `recoverableDepreciation` + `nonRecoverableDepreciation`
- **Total payments issued** — sum of `finalPaidAmount` + `priorPayments`
- **Total supplement requested** — sum of `supplementRequested`
- **Total supplement approved** — sum of `supplementApproved`
- **Total recovered dollars** — sum of payments + supplement approvals - ACV
- **Estimated revenue opportunity** — sum of outstanding amounts + denied but not overturned claims

**Calculation:** Aggregate across all claims in scope. Filter by status if the user asks for a subset (e.g., "open claims only").

**Display:** Show financial KPIs with dollar formatting and percentage of total RCV where relevant.

### 4. Track Carrier Performance

**Carrier metrics (grouped by `claims.carrier`):**
- **Claims by carrier** — count of claims per carrier
- **Denial rate** — denied claims / total claims for that carrier
- **Approval rate** — approved claims / total claims for that carrier
- **Reinspection approval rate** — approved after reinspection / total reinspections for that carrier
- **Supplement approval rate** — supplement approvals / supplement requests for that carrier
- **Average response time** — mean days from filed to first action, per carrier
- **Average payment release time** — mean days from approval to payment, per carrier
- **Highest friction carriers** — carriers sorted by denial rate or average friction score

**Calculation:** Group `claims` by `carrier`. Use `timeline_events` for time calculations. Use `intelligence_events` for friction scores.

**Minimum sample size:** 3 claims per carrier for any rate. Below 3, display "Insufficient data."

### 5. Track Adjuster Performance

**Adjuster metrics (from `adjusters` + `claim_adjusters`):**
- **Claims by adjuster** — count of claims linked to adjuster
- **Adjuster involvement** — roles, claims, timeline
- **Approval patterns** — approval rate per adjuster
- **Denial patterns** — denial rate per adjuster
- **Reinspection outcomes** — reinspection approval rate per adjuster
- **Supplement outcomes** — supplement approval rate per adjuster
- **Average response time** — mean hours from assignment to first action
- **Highest friction adjusters** — adjusters sorted by friction score or denial rate

**Calculation:** Use `claim_adjusters` to join `adjusters` to `claims`. Use `adjusters` table for precomputed metrics. Recalculate from `intelligence_events` if needed.

**Minimum sample size:** 3 claims per adjuster for any rate. Below 3, display "Insufficient data."

### 6. Track Playbook Performance

**Playbook metrics (from `playbookEntries`):**
- **Most successful playbook patterns** — top patterns by `confidenceScore` and `sourceClaimCount`
- **Denial overturn patterns** — patterns with `outcomeType = "denial_overturned"`
- **Supplement approval patterns** — patterns with `outcomeType = "supplement_approved"`
- **Code documentation patterns** — patterns with `documentationUsed` containing code citations
- **Reinspection success patterns** — patterns with `outcomeType = "reinspection_approval"`
- **Documentation strategies associated with approval** — patterns where `outcome = "approved"` and `documentationUsed` is populated

**Calculation:** Query `playbookEntries` by `outcomeType`, `outcome`, `confidenceScore`, and `sourceClaimCount`. Sort by confidence descending.

**Minimum sample size:** 3 claims for any pattern. Single-claim patterns (`isSample = true`) are displayed as "Examples," not "Strategies."

### 7. Generate AI Executive Summaries

Every dashboard refresh should produce an executive summary with:

**Top Risks:**
- Claims denied with no overturn attempt
- Aging claims with no activity
- Claims missing critical documents (denial letter, estimate, supplement)
- High-friction carriers trending up

**Top Opportunities:**
- Denied claims eligible for overturn (have denial letter, no supplement submitted)
- Claims with low supplement probability but high outstanding amount
- Playbook patterns with high confidence but low utilization

**Claims Needing Attention:**
- Open > 30 days with no status change
- Missing denial letter but status shows "denied"
- Missing estimate but status shows "approved"
- Supplement submitted but no response in 14 days

**Aging Claims:**
- Open > 30 days
- Open > 60 days
- Open > 90 days

**Missing Documents:**
- Claims without denial letter
- Claims without estimate
- Claims without supplement
- Claims without approval letter

**Emerging Trends:**
- Carrier denial rate increasing
- Adjuster friction score increasing
- Supplement approval rate decreasing
- Reinspection approval rate changing
- New denial reasons appearing

**Recommended Executive Actions:**
- "Review 5 denied claims with no overturn attempt"
- "Submit supplements for 3 claims with outstanding amounts > $10,000"
- "Request reinspection for 2 claims denied by Allstate"
- "Follow up on 4 aging claims with no adjuster response"

**Storage:** Generate executive summaries on demand. Do not store them as static records. Each refresh is a live computation.

### 8. Use Careful Language

**Allowed language:**
- "Indicates"
- "Suggests"
- "Trending"
- "Needs review"
- "Requires action"
- "Associated with"
- "Commonly observed"
- "Higher than average"
- "Lower than average"

**Prohibited language:**
- "Guaranteed"
- "Caused"
- "Proves"
- "Bad faith" (unless legally documented)
- "Will result in"
- "Always"
- "Never"

**Why:** Executive intelligence drives business decisions. Overstated claims lead to poor decisions. The language must be defensible.

### 9. Preserve Source Evidence

Every KPI and executive insight must connect to:

- **Claim IDs** — which claims produced this number
- **Source documents** — which files support this insight
- **Timeline events** — which events produced this metric
- **Carrier records** — which carrier is being analyzed
- **Adjuster records** — which adjuster is being analyzed
- **Playbook entries** — which patterns support this recommendation
- **Confidence scores** — how reliable is this insight

**Storage:** Store source metadata in JSON alongside the KPI. Do not store the KPI without its source claims.

**Example:**
```json
{
  "kpi": "denial_rate",
  "value": 0.22,
  "carrier": "Allstate",
  "sourceClaims": ["claim-id-1", "claim-id-2", "claim-id-3"],
  "sourceDocuments": ["denial_letter.pdf"],
  "confidenceScore": 0.78,
  "computedAt": "2026-06-09T12:00:00Z"
}
```

### 10. Protect Homeowner PII

Executive summaries must not expose homeowner PII unless the user is in Master view and opens the specific claim.

**Executive view (default):**
- Show claim counts, not claim numbers
- Show carrier names, not homeowner names
- Show financial totals, not individual claim amounts
- Show adjuster names for behavioral intelligence
- Show city and state for location, not full addresses

**Master view (only when requested):**
- Show claim numbers, homeowner names, and addresses
- Show full PII with audit logging

**Why:** Executive summaries are shared across teams. PII must be protected. Use `server/masking.ts` rules to enforce this.

## Output Format

When presenting executive intelligence, use this structure:

```json
{
  "executiveSummary": {
    "period": "2026-06-01 to 2026-06-09",
    "totalClaims": 45,
    "openClaims": 12,
    "closedClaims": 33,
    "totalRCV": 1250000,
    "totalPayments": 875000,
    "revenueOpportunity": 375000
  },
  "topRisks": [
    {
      "label": "5 denied claims with no overturn attempt",
      "count": 5,
      "sourceClaims": ["id-1", "id-2", "id-3", "id-4", "id-5"],
      "recommendedAction": "Review denial letters and consider supplement submission"
    }
  ],
  "topOpportunities": [
    {
      "label": "3 claims with outstanding > $10,000",
      "count": 3,
      "sourceClaims": ["id-6", "id-7", "id-8"],
      "recommendedAction": "Submit supplements for outstanding scope"
    }
  ],
  "carrierPerformance": [
    {
      "carrier": "Allstate",
      "claims": 15,
      "denialRate": 0.20,
      "approvalRate": 0.67,
      "confidence": 0.72
    }
  ],
  "adjusterPerformance": [
    {
      "adjuster": "<adjuster name>",
      "claims": 8,
      "denialRate": 0.12,
      "approvalRate": 0.75,
      "confidence": 0.65
    }
  ],
  "playbookPerformance": [
    {
      "pattern": "Denial overturned after reinspection",
      "label": "Validated Pattern",
      "confidence": 0.82,
      "sourceClaimCount": 5,
      "utilization": "3 of 5 eligible claims used this pattern"
    }
  ],
  "agingClaims": [
    {
      "age": "30-60 days",
      "count": 4,
      "sourceClaims": ["id-9", "id-10", "id-11", "id-12"]
    }
  ],
  "missingDocuments": [
    {
      "document": "Denial letter",
      "count": 3,
      "sourceClaims": ["id-13", "id-14", "id-15"]
    }
  ],
  "emergingTrends": [
    {
      "trend": "Allstate denial rate increasing",
      "direction": "up",
      "priorPeriod": 0.15,
      "currentPeriod": 0.22,
      "confidence": 0.60
    }
  ],
  "recommendedActions": [
    "Review 5 denied claims with no overturn attempt",
    "Submit supplements for 3 claims with outstanding > $10,000",
    "Request reinspection for 2 claims denied by Allstate"
  ]
}
```

## Integration with ClaimSignal

When working inside the ClaimSignal codebase:

- Use `claims` table for operational and financial KPIs
- Use `timeline_events` for aging calculations and time metrics
- Use `intelligence_events` for trend detection and risk flags
- Use `adjusters` + `claim_adjusters` for adjuster performance
- Use `playbookEntries` for playbook performance
- Use `supplementIntelligence` + `supplements` for supplement metrics
- Use `evidence_files` for document coverage analysis
- Apply PII masking via `server/masking.ts` before displaying to non-Master users
- Use `computeFullClaimScoring()` and `computeAggregatedMetrics()` for score calculations

## Edge Cases

- **No claims in scope:** Display "No data available for the selected period." Do not generate empty summaries.
- **Single claim:** Do not generate executive summaries for single claims. Executive intelligence requires aggregate data.
- **Missing financial data:** If `rcvAmount` or `finalPaidAmount` is null, exclude the claim from financial aggregates. Do not assume zero.
- **Conflicting metrics:** If two time periods show conflicting trends, display both and note the conflict. Do not arbitrarily pick one.
- **Tenant isolation:** Non-Master users see only their organization's data. Master users see cross-tenant data. Apply `organization_id` filter for non-Master queries.
- **PII leakage:** Before displaying any executive summary, run the data through `server/masking.ts`. If any homeowner PII appears, redact it and log the incident.
- **Master view override:** If a Master user clicks into a specific claim, show unmasked PII with audit logging. Do not show unmasked PII in the executive summary view.
- **Performance:** Executive summaries should compute in under 2 seconds. Use precomputed aggregates in `adjuster_aggregated_metrics` where possible. Fall back to live queries only when needed.
