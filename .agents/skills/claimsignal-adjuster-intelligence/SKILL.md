---
name: claimsignal-adjuster-intelligence
description: >
  Track adjuster involvement, behavior patterns, claim outcomes, communication patterns,
  approval rates, denial rates, and reinspection outcomes across all claims. Use when the
  user asks about adjuster performance, adjuster patterns, adjuster metrics, or adjuster
  intelligence. Also triggers when processing claims with multiple adjusters, analyzing
  adjuster outcomes, or building adjuster profiles from documents and transcripts.
---

# ClaimSignal Adjuster Intelligence

## Purpose

Transform raw claim participant data into actionable adjuster intelligence. Track what adjusters do, how they behave, and what outcomes they produce — without making unsupported conclusions.

## When to Use

- User asks about adjuster performance, patterns, or metrics
- User wants to analyze adjuster behavior across claims
- Processing claims with multiple adjusters
- Building adjuster profiles from documents, transcripts, or emails
- Analyzing adjuster outcomes (denials, approvals, reinspections)
- User asks why a claim was denied or approved
- Detecting adjuster patterns like frequent denials or overturns

## Core Principle

Adjuster intelligence is aggregate, not anecdotal. One claim does not define an adjuster. Patterns emerge from many claims. Always report confidence levels and sample sizes.

## Responsibilities

### 1. Create Adjuster Profiles

When an adjuster is first identified in any document, transcript, or email:

1. Create an `adjusters` table record with:
   - `adjuster_name`: normalized name (First Last format)
   - `carrier_name`: insurance company or employer
   - `region`: state or territory if known
   - `is_field_adjuster`: true if role is field_adjuster
   - `is_desk_adjuster`: true if role is desk_adjuster

2. Link to the claim via `claim_adjusters` with:
   - `role_on_claim`: primary_adjuster, field_adjuster, desk_adjuster, etc.
   - `involvement_type`: assigned, inspected, denied, approved, partially_approved, etc.
   - `source_type`: document, transcript, audio, manual, system
   - `source_document_id`: the file that mentioned this adjuster
   - `confidence_score`: extraction confidence

3. Use existing deduplication in `server/adjuster-linking.ts` for name normalization and carrier-aware dedup.

### 2. Resolve Adjuster Aliases

Same-name adjusters are the same person only when supported by evidence.

**Consolidate when:**
- Same name + same carrier = same person
- Same name + same email address = same person
- Same name + same phone number = same person
- Name similarity + same claim + same carrier = same person

**Keep separate when:**
- Same name + different carriers = different people
- Same name + different regions = probably different people
- No supporting evidence = do not merge

**Method:** Use `normalizeAdjusterName()` and `nameComparisonKey()` from `server/adjuster-linking.ts` for name comparison. Check carrier context before deduplication.

### 3. Track Outcomes

For every adjuster on every claim, record:

- **Carrier** — the adjuster's employer or representing carrier
- **Role** — primary, field, desk, catastrophe, supplement, reinspection, supervisor
- **Claims handled** — count of claims this adjuster is linked to
- **Approval outcomes** — claims where this adjuster is linked and the claim was approved
- **Denial outcomes** — claims where this adjuster is linked and the claim was denied
- **Reinspection outcomes** — claims where this adjuster is linked and reinspection occurred
- **Supplement outcomes** — claims where this adjuster is linked and a supplement was handled

Store these in the `adjusters` table fields:
- `total_claims_tracked`
- `total_denials`
- `total_reinspections`
- `total_supplements_requested`
- `total_supplements_approved`

### 4. Calculate Metrics

Compute aggregate metrics only when there are enough claims to be meaningful.

**Minimum sample size:** 3 claims before any rate is calculated.

**Formulas:**

- **Approval rate** = approved claims / total claims tracked
- **Denial rate** = denials / total claims tracked
- **Reinspection rate** = reinspections / total claims tracked
- **Supplement acceptance rate** = supplements approved / supplements requested
- **Average response time** = mean hours between assignment and first action
- **Average claim cycle time** = mean days from filed to closed

**Store in `adjusters` table:**
- `denial_rate`
- `supplement_acceptance_rate`
- `reinspection_rate`
- `avg_response_time_hours`
- `avg_days_to_initial_determination`

**Store in `adjuster_aggregated_metrics` table** for historical periods:
- `avg_friction_score`
- `avg_denial_rate`
- `avg_supplement_approval_rate`
- `avg_response_time_hours`
- `avg_days_to_initial_determination`

### 5. Track Outcome Influence

For every adjuster on every claim, record the claim status when the adjuster was first linked and the claim status when the adjuster was last linked. This reveals what events commonly precede or follow an adjuster's involvement without assigning blame or credit.

**Capture at entry:**
- Claim status when adjuster was first detected (filed, inspected, denied, reopened, etc.)
- Source document that introduced the adjuster
- Date of first detection

**Capture at exit:**
- Claim status when adjuster was last active (denied, approved, supplemented, closed, etc.)
- Source document that shows the adjuster's last action
- Date of last detection

**Track outcome influence:**
- **Involved before denial** — adjuster linked before the claim was denied
- **Involved during denial** — adjuster linked while the claim was in denied status
- **Involved during reinspection** — adjuster linked during reinspection phase
- **Involved during approval** — adjuster linked when the claim was approved
- **Involved during supplement approval** — adjuster linked when a supplement was approved

**Why this matters:** If an adjuster is frequently present during the transition from "denied" to "approved," the pattern is "frequently present at overturn" — not "frequently causes overturn." The skill reports correlation, not causation.

**Store in `claim_adjusters`:**
- `first_seen_date`: when adjuster was first detected on this claim
- `last_seen_date`: when adjuster was last active on this claim
- `involvement_type`: the current status at the time of last update

**Store in `intelligence_events`:**
- Event type: "lifecycle" or "escalation"
- Category: "adjuster_entry", "adjuster_exit", "adjuster_during_status_change"
- Metadata: `{ priorStatus, newStatus, adjusterId, claimId }`

**Example:**
- Adjuster enters claim at status: "Denied"
- Adjuster last active at status: "Approved"
- Outcome influence: "Involved during denial → approval transition"
- Pattern note: "Present in 3 of 5 denial-to-approval transitions. Not causal."

### 6. Identify Common Patterns

Label patterns only when the pattern appears across multiple claims.

**Pattern detection thresholds:**
- **Frequently denies** — denial rate > 50% across 5+ claims
- **Frequently approves after reinspection** — 2+ claims where reinspection led to approval
- **Frequently requests additional documentation** — 3+ claims with documentation requests
- **Frequently involved in overturned denials** — 2+ claims where this adjuster is present when a denial is overturned

**Pattern storage:** Use `intelligence_events` table with category "escalation" or "communication_signal" and source type "system." Link to the adjuster via `adjuster_id`.

### 7. Never Use a Single Claim to Determine Performance

One claim is an incident, not a pattern.

**Rule:**
- 1 claim: record the fact, no judgment
- 2 claims: note the trend, no label
- 3+ claims: calculate rates, consider labeling

**Why:** An adjuster who denied one claim might be following policy. An adjuster who denied 8 of 10 claims may have a pattern. Distinguish incident from behavior.

### 8. Require Multiple Claims Before Generating Metrics

**Minimums for metric display:**

| Metric | Minimum Claims |
|--------|---------------|
| Approval rate | 3 |
| Denial rate | 3 |
| Reinspection rate | 3 |
| Supplement acceptance rate | 3 |
| Response time average | 5 |
| Claim cycle time average | 5 |
| Pattern label | 3 |

**Below minimum:** Display "Insufficient data" or "N/A" with the current sample size.

### 9. Preserve Source Evidence for All Metrics

Every metric must be traceable to the claims that produced it.

**Required for each metric:**
- List of claim IDs used in the calculation
- Date range of the claims
- Source documents (denial letters, approval letters, estimates)
- Extraction confidence scores

**Storage:** Store source claim IDs in JSON metadata fields or `intelligence_events` table. Do not rely on memory or inference.

### 10. Display Confidence Levels for All Adjuster Intelligence

Every piece of adjuster intelligence must show:

- **Sample size** — number of claims in the calculation
- **Confidence score** — 0.0 to 1.0 based on sample size and data quality
- **Date range** — period the claims span
- **Data quality** — "High" (documents + transcripts), "Medium" (documents only), "Low" (transcripts only, or inferred)

**Confidence score formula:**
```
base = 0.3
+ (claims_count / 20) * 0.4  // up to 0.4 for 20+ claims
+ (has_documents ? 0.15 : 0)
+ (has_transcripts ? 0.15 : 0)
confidence = min(base, 1.0)
```

### 11. Flag Insufficient Data When Sample Size Is Too Small

When there are fewer than the minimum claims for a metric:

- Display the metric as "—" or "N/A"
- Show the sample size (e.g., "2 claims")
- Add a tooltip: "Insufficient data. Need 3+ claims for this metric."
- Do not hide the adjuster — show them with incomplete data

**Why:** Hiding adjusters creates blind spots. Showing them with "insufficient data" tells the user to upload more documents.

## Output Format

When presenting adjuster intelligence, use this structure:

```json
{
  "adjuster": {
    "name": "<adjuster name>",
    "carrier": "<carrier name>",
    "region": "<region if known>",
    "totalClaims": 12,
    "sampleSize": "sufficient | insufficient"
  },
  "metrics": {
    "approvalRate": { "value": 0.67, "claims": 12, "confidence": 0.72 },
    "denialRate": { "value": 0.25, "claims": 12, "confidence": 0.72 },
    "reinspectionRate": { "value": 0.17, "claims": 12, "confidence": 0.72 },
    "supplementAcceptanceRate": { "value": null, "claims": 2, "confidence": 0.35, "note": "Insufficient data. Need 3+ claims." },
    "avgResponseTime": { "value": null, "claims": 2, "confidence": 0.30, "note": "Insufficient data. Need 5+ claims." }
  },
  "patterns": [
    {
      "label": "frequently_approves_after_reinspection",
      "description": "2 of 3 reinspections led to approval",
      "claims": ["claim-id-1", "claim-id-2"],
      "confidence": 0.65
    }
  ],
  "sources": [
    { "claimId": "<id>", "fileName": "<file>", "date": "<date>", "confidence": 0.95 }
  ]
}
```

## Integration with ClaimSignal

When working inside the ClaimSignal codebase:

- Use `server/adjuster-linking.ts` for name normalization and deduplication
- Use the `adjusters` table for profile storage (key field: `adjuster_name`)
- Use `claim_adjusters` for claim-adjuster relationships (key fields: `role_on_claim`, `involvement_type`)
- Use `adjuster_aggregated_metrics` for historical period calculations
- Use `intelligence_events` for pattern detection and behavioral events
- Use `claims` table for outcome data (status, outcome, lifecycle_phase)
- Recompute metrics via `computeAggregatedMetrics()` in the scoring pipeline

## Edge Cases

- **Adjuster switches carriers:** Create a new profile for the new carrier. Do not merge across carriers. The old carrier's metrics stay with the old profile.
- **Adjuster with multiple roles:** Track each role separately. An adjuster can be a field adjuster on one claim and a desk adjuster on another. The `claim_adjusters` table supports this via the unique constraint on `(claim_id, adjuster_id, role_on_claim)`.
- **Contractor adjuster vs. carrier adjuster:** Do not mix contractor metrics with carrier adjuster metrics. If the same person works as both, create separate profiles.
- **Transcript-only adjuster:** If an adjuster is only mentioned in a transcript (not in a document), set confidence lower and note "Source: transcript only." Wait for document confirmation before generating patterns.
- **Unknown carrier:** If carrier is unknown, create the profile with "Unknown" carrier. When a carrier is later identified, update the profile. Do not auto-merge "Unknown" with a known carrier unless evidence confirms.
- **No claims yet:** If an adjuster is extracted but has no linked claims, show them in the adjuster list with "0 claims — insufficient data for all metrics."
