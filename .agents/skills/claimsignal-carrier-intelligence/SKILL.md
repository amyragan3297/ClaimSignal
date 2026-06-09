---
name: claimsignal-carrier-intelligence
description: >
  Analyze carrier behavior across claims and turn carrier claim handling patterns into
  structured intelligence. Use when the user asks about carrier performance, carrier
  patterns, carrier outcomes, or carrier-specific claim handling. Also triggers when
  analyzing claims by carrier, comparing carriers, or building carrier profiles from
  claim data. Relevant when the user mentions specific insurance companies like Allstate,
  State Farm, or asks about carrier denial rates, approval rates, or response times.
---

# ClaimSignal Carrier Intelligence

## Purpose

Turn carrier claim handling history into evidence-backed carrier intelligence. Track how insurance companies process claims, what patterns emerge in their decisions, and what outcomes are commonly associated with each carrier — without making unsupported conclusions.

## When to Use

- User asks about carrier performance, patterns, or metrics
- User wants to compare carriers (denial rates, approval rates, response times)
- Analyzing claims by carrier to identify handling patterns
- Building carrier profiles from claim data
- User asks about a specific carrier's behavior (e.g., "How does Allstate handle hail claims?")
- User reports carrier-specific issues (missing scope, code items omitted, payment delays)
- Processing claims to extract carrier intelligence

## Core Principle

Carrier intelligence is aggregate, not anecdotal. One claim does not define a carrier. Patterns emerge from many claims. The language is careful: "associated with," "commonly appears," "frequently observed." Never claim causation or bad faith unless legally documented.

## Responsibilities

### 1. Create Carrier Profiles

When a carrier is first identified in any claim, document, or email:

1. Create a carrier profile record with:
   - **Carrier name** — normalized (e.g., "Allstate Vehicle and Property Insurance Company" → "Allstate Insurance Company")
   - **Total claims** — count of claims linked to this carrier
   - **Open claims** — count of claims with status "open"
   - **Closed claims** — count of claims with status "closed"
   - **Denied claims** — count of claims with denial outcome
   - **Approved claims** — count of claims with approval outcome
   - **Partially approved claims** — count of claims with partial approval
   - **Reopened claims** — count of claims that were reopened after denial
   - **Overturned denials** — count of claims denied then later approved
   - **Supplement approvals** — count of claims where supplements were approved
   - **Payment increases** — count of claims where payment increased

**Storage:** Use the `claims` table to aggregate by `carrier`. Store carrier-specific metrics in `adjuster_aggregated_metrics` or a dedicated carrier intelligence table if available.

**Normalization:** Maintain a carrier name map. Common variations:
- "Allstate Vehicle and Property Insurance Company" → "Allstate Insurance Company"
- "State Farm Fire and Casualty Company" → "State Farm Insurance"
- "USAA Casualty Insurance Company" → "USAA"

### 2. Track Carrier Response Behavior

For each carrier, calculate response time metrics from claim timeline events:

- **Average response time** — hours from claim filed to first carrier response
- **Average inspection scheduling time** — days from claim filed to inspection scheduled
- **Average reinspection time** — days from reinspection request to reinspection completion
- **Average supplement review time** — days from supplement submitted to supplement decision
- **Average payment release time** — days from approval to payment issued
- **Average claim cycle time** — days from filed to closed

**Calculation method:** Use `timeline_events` and `intelligence_events` tables. Extract dates for each event type. Calculate deltas between events. Average across all claims for the carrier.

**Minimum sample size:** 3 claims for any time metric. Below 3, display "Insufficient data."

### 3. Track Carrier Outcome Patterns

For each carrier, calculate outcome rates:

- **Denial rate** — denied claims / total claims
- **Approval rate** — approved claims / total claims
- **Partial approval rate** — partially approved claims / total claims
- **Reinspection approval rate** — claims approved after reinspection / claims with reinspection
- **Supplement approval rate** — supplements approved / supplements submitted
- **Denial overturn rate** — denials overturned to approval / total denials

**Formulas:**
```
denial_rate = total_denials / total_claims
approval_rate = total_approved / total_claims
partial_approval_rate = total_partially_approved / total_claims
reinspection_approval_rate = approved_after_reinspection / total_reinspections
supplement_approval_rate = supplements_approved / supplements_submitted
denial_overturn_rate = denials_overturned / total_denials
```

**Minimum sample size:** 3 claims for any rate. Below 3, display "Insufficient data."

### 4. Track Common Carrier Issues

Identify and count how often each carrier is associated with specific issue types:

- **Missing scope** — scope items omitted from initial estimate
- **Repairability disputes** — carrier disputes whether damage is repairable
- **Matching disputes** — carrier disputes color, texture, or material matching
- **Code items omitted** — building code items not included in scope
- **Drip edge omitted** — drip edge not included in scope
- **Starter omitted** — starter strip not included in scope
- **Ice and water omitted** — ice and water shield not included in scope
- **Ridge vent disputed** — ridge vent coverage disputed
- **Low slope disputed** — low slope roofing coverage disputed
- **Interior damage disputed** — interior damage coverage disputed
- **O&P disputed** — overhead and profit disputed
- **Depreciation withheld** — depreciation not released
- **Payment delay** — payment issued later than expected

**Detection method:** Scan `supplementTriggers` table, `timeline_events` with descriptions, and `intelligence_events` with category "denial" or "supplement." Look for keywords that match the issue types above.

**Storage:** Count issues per carrier and store in a JSON field or dedicated table. Include the claim IDs and source documents for each issue.

### 5. Track Carrier Documentation Behavior

Identify how often each carrier requests additional documentation:

- **Requests more photos** — carrier asks for additional photos
- **Requests revised estimate** — carrier asks for estimate revision
- **Requests reinspection** — carrier requests or approves reinspection
- **Requests engineer report** — carrier requires engineering report
- **Requests ladder assist** — carrier requires ladder assist inspection
- **Requires code documentation** — carrier requires IRC code citations
- **Requires manufacturer documentation** — carrier requires manufacturer specs

**Detection method:** Scan `intelligence_events` with category "communication_signal" or "escalation." Look for keywords: "photos," "estimate," "reinspection," "engineer," "ladder assist," "code," "manufacturer."

**Storage:** Count documentation requests per carrier. Store in a JSON field or dedicated table. Link to source emails and documents.

### 6. Connect Carrier Intelligence to Context

Every carrier metric must be connected to the context that produced it:

- **Adjusters** — which adjusters are commonly associated with this carrier
- **Claim types** — hail, wind, water, fire, etc.
- **Damage types** — roof, siding, interior, etc.
- **Regions** — state, territory
- **Denial reasons** — why claims are denied
- **Supplements** — supplement types and approval rates
- **Reinspections** — reinspection frequency and outcomes
- **Final outcomes** — approved, denied, partial, closed

**Why:** A carrier's denial rate for hail damage may differ from their denial rate for water damage. Context matters.

### 7. Validate Sample Size Before Labeling

Require multiple claims before labeling a carrier pattern as repeatable.

**Labeling thresholds:**

| Claims | Label |
|--------|-------|
| 1 | **Single Claim Example** |
| 2 | **Single Claim Example** (still too few) |
| 3+ | **Emerging Carrier Pattern** |
| 5+ | **Validated Carrier Pattern** |

**Confidence formula:**
```
base = 0.2
+ (claim_count / 15) * 0.5  // up to 0.5 for 15+ claims
+ (has_denial_document ? 0.1 : 0)
+ (has_approval_document ? 0.1 : 0)
+ (has_supplement_document ? 0.1 : 0)
confidence = min(base, 1.0)
```

### 8. Never Make Unsupported Conclusions

Use careful language in all carrier intelligence:

**Allowed:**
- "Associated with"
- "Commonly appears"
- "Frequently observed"
- "Present before"
- "Correlates with"
- "Higher rate of"
- "Lower average"

**Prohibited:**
- "Caused"
- "Guaranteed"
- "Proves"
- "Bad faith" (unless legally documented in the source)
- "Always"
- "Never"

**Why:** Legal defensibility. Carrier behavior is complex. Patterns describe what is observed, not what is guaranteed. Bad faith is a legal term with specific requirements. Do not use it unless the source documents support it.

### 9. Preserve Source Evidence

Every carrier metric must be traceable to the claims that produced it.

**Required references:**
- List of claim IDs used in the calculation
- List of source document file names
- Date range of the claims
- Extraction confidence scores
- Adjuster IDs involved

**Storage:** Store in JSON metadata:
```json
{
  "sourceClaims": ["claim-id-1", "claim-id-2", "claim-id-3"],
  "sourceDocuments": ["denial_letter.pdf", "approval_letter.pdf", "estimate.pdf"],
  "dateRange": { "from": "2023-01-01", "to": "2023-06-30" },
  "extractionConfidence": [0.95, 0.92, 0.88],
  "adjusters": ["adjuster-id-1", "adjuster-id-2"]
}
```

### 10. No Homeowner PII in Generalized Carrier Intelligence

Carrier intelligence is shared across organizations. Strip all homeowner PII:

**Remove:**
- Homeowner names
- Property addresses (keep city and state only)
- Homeowner phone numbers
- Homeowner email addresses
- Policy numbers
- Claim numbers (unless used as source reference, not display)

**Keep:**
- Carrier name
- City and state (generalized location)
- Claim type (hail, wind, water)
- Damage type (roof, siding, interior)
- Outcome (approved, denied, partial)
- Pattern data (denial rate, approval rate, etc.)
- Adjuster name (behavioral intelligence, not PII)

**Why:** Carrier intelligence is shared. Homeowner PII must not leak into generalized intelligence.

## Output Format

When presenting carrier intelligence, use this structure:

```json
{
  "carrier": {
    "name": "Allstate Insurance Company",
    "label": "Validated Carrier Pattern",
    "totalClaims": 45,
    "sampleSize": "sufficient"
  },
  "metrics": {
    "denialRate": { "value": 0.22, "claims": 45, "confidence": 0.78 },
    "approvalRate": { "value": 0.67, "claims": 45, "confidence": 0.78 },
    "partialApprovalRate": { "value": 0.11, "claims": 45, "confidence": 0.78 },
    "reinspectionApprovalRate": { "value": 0.75, "claims": 12, "confidence": 0.65 },
    "supplementApprovalRate": { "value": 0.60, "claims": 20, "confidence": 0.70 },
    "denialOverturnRate": { "value": 0.30, "claims": 10, "confidence": 0.55, "note": "10 denials, 3 overturned." }
  },
  "responseTimes": {
    "avgInspectionScheduling": { "value": 8, "claims": 35, "confidence": 0.72, "unit": "days" },
    "avgSupplementReview": { "value": 14, "claims": 15, "confidence": 0.60, "unit": "days" },
    "avgPaymentRelease": { "value": 5, "claims": 28, "confidence": 0.68, "unit": "days" }
  },
  "commonIssues": [
    { "issue": "missing_scope", "count": 15, "claims": ["id-1", "id-2"], "confidence": 0.75 },
    { "issue": "code_items_omitted", "count": 8, "claims": ["id-3"], "confidence": 0.60 }
  ],
  "documentationBehavior": [
    { "behavior": "requests_revised_estimate", "count": 12, "confidence": 0.70 },
    { "behavior": "requires_code_documentation", "count": 5, "confidence": 0.55 }
  ],
  "language": {
    "description": "Allstate has a lower denial rate for hail claims, and supplements are frequently associated with approval when code documentation is provided.",
    "avoid": "Allstate always approves hail claims when code documentation is provided."
  },
  "sources": [
    { "claimId": "<id>", "fileName": "denial_letter.pdf", "date": "<date>", "confidence": 0.95 }
  ],
  "metadata": {
    "sourceClaims": ["claim-id-1", "claim-id-2", "claim-id-3"],
    "sourceDocuments": ["denial_letter.pdf", "approval_letter.pdf", "estimate.pdf"],
    "dateRange": { "from": "2023-01-01", "to": "2023-06-30" },
    "extractionConfidence": [0.95, 0.92, 0.88],
    "adjusters": ["adjuster-id-1", "adjuster-id-2"]
  }
}
```

## Integration with ClaimSignal

When working inside the ClaimSignal codebase:

- Use the `claims` table to aggregate carrier metrics (group by `carrier`)
- Use `timeline_events` for response time calculations
- Use `intelligence_events` for issue detection and documentation behavior
- Use `supplementTriggers` for supplement-specific patterns
- Use `adjuster_aggregated_metrics` for historical carrier metrics
- Use `playbookEntries` for reusable carrier patterns
- Use `evidence_files` for source document linkage
- Apply PII masking rules in `server/masking.ts` before displaying carrier data to non-Master users
- Use the carrier normalization map to handle carrier name variations

## Edge Cases

- **Carrier name variations:** Always normalize before aggregating. "Allstate Vehicle and Property Insurance Company" and "Allstate Insurance Company" are the same carrier. Maintain a normalization map.
- **Multi-carrier claims:** If a claim involves multiple carriers (rare), track each carrier separately. Do not merge metrics across carriers.
- **Carrier vs. TPA:** A Third-Party Administrator (TPA) may handle claims for a carrier. Track the TPA and the underlying carrier separately. The TPA is the behavioral actor, the carrier is the policy issuer.
- **Insufficient data:** If a carrier has fewer than 3 claims, display the metrics as "Insufficient data" with the sample size. Do not calculate rates.
- **Conflicting metrics:** If two time periods show different metrics for the same carrier, store both and note the time period. Do not overwrite.
- **Carrier rebranding:** If a carrier rebrands (e.g., merger, name change), create a new profile. Do not merge metrics across the rebrand unless the user explicitly requests it.
- **Playbook masking:** Before displaying carrier intelligence to non-Master users, strip `sourceClaimId`, `organizationId`, and `metadataJson` that contains claim references. Use `server/masking.ts` for this.
