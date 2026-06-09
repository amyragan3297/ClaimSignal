---
name: claimsignal-playbook-learning
description: >
  Identify what worked in successful insurance claim outcomes and convert those patterns
  into reusable claim strategy intelligence. Use when the user asks about playbook patterns,
  successful claim strategies, what works for claim approvals, how to overturn a denial,
  or building reusable claim strategies from historical outcomes. Also triggers when analyzing
  successful claims, denial overturns, supplement approvals, or reinspection patterns.
---

# ClaimSignal Playbook Learning

## Purpose

Turn claim history into reusable strategy intelligence. Detect what actions commonly precede successful outcomes, document the evidence, and package the patterns into defensible playbook entries without overstating causation.

## When to Use

- User asks what works for claim approvals or denials
- User wants to build reusable claim strategies from historical data
- Analyzing successful claims (denial overturned, partial → full approval, supplement approved)
- Analyzing reinspection patterns that led to approval
- User asks how to overturn a denial or respond to a specific adjuster
- Processing claims to extract playbook patterns
- Building or updating playbook entries

## Core Principle

Playbook patterns describe association, not causation. The language is careful: "associated with approval," "preceded approval," "commonly appears in successful claims." Never claim that an action caused an outcome unless the source document explicitly states it.

## Responsibilities

### 1. Detect Successful Claim Outcomes

Scan claims and documents for these outcome types:

- **Denial overturned to approval** — claim was denied, later approved
- **Partial approval converted to full approval** — partial payment upgraded to full
- **Reinspection leading to approval** — reinspection requested, then approved
- **Supplement submitted and approved** — supplement requested, then approved
- **Code documentation accepted** — IRC code citation accepted by carrier
- **Missing scope added** — additional scope items accepted after challenge
- **Payment increased** — payment amount increased after dispute
- **Claim reopened after denial** — denied claim reopened for further review

**Detection method:** Compare status history in the `claims` table and `timeline_events` table. Look for status transitions that match the patterns above.

### 2. Identify Actions Before the Successful Outcome

For each successful outcome, identify what actions happened before it. These become the playbook pattern's components.

**Actions to track:**
- Reinspection requested
- Photos submitted
- Estimate revised
- Supplement submitted
- Code citation provided (IRC, manufacturer docs)
- Carrier contacted (supervisor, team lead)
- Supervisor involved
- Engineer report challenged
- Ladder assist findings disputed
- DOI complaint prepared or submitted

**Source of actions:** `intelligence_events` table with category "communication_signal" or "escalation", or `timeline_events` with descriptions of actions taken.

### 3. Track Supporting Evidence

Every action and outcome must have supporting evidence. Record:

- **Source document** — PDF, image, email that contains the action or outcome
- **Email** — email thread with subject, sender, date
- **Screenshot** — name and upload date
- **Estimate** — file name, version, date
- **Photo set** — description, upload date
- **Denial letter** — file name, date, page number
- **Approval letter** — file name, date, page number
- **Supplement** — file name, date, items requested
- **Payment document** — file name, amount, date

**Storage:** Link to `evidence_files` via `sourceClaimId` and `source_document_id`. Store file names in `metadataJson`.

### 4. Create Reusable Playbook Patterns

Package the pattern into a `playbookEntries` record:

- **title**: descriptive name (e.g., "Denial overturned after reinspection")
- **scenarioType**: what triggered the playbook (e.g., "denial", "partial_approval", "supplement")
- **outcomeType**: the result (e.g., "approved", "payment_increased", "scope_added")
- **claimType**: hail, wind, water, fire, etc.
- **carrier**: the carrier involved
- **adjuster**: the adjuster involved
- **adjusterId**: link to the `adjusters` table
- **denialReason**: the reason given for denial
- **missingScopeItems**: JSON array of scope items that were initially missing
- **documentationUsed**: JSON array of documents used (code citations, manufacturer docs, photos)
- **actionTaken**: what the contractor or homeowner did (text description)
- **whatWorked**: what actions appeared to be associated with the positive outcome
- **whatDidNotWork**: what actions were attempted but did not precede the positive outcome
- **timelineSummary**: brief narrative of the claim timeline
- **escalationUsed**: true if supervisor, DOI, or other escalation was involved
- **outcome**: final outcome (approved, payment_increased, etc.)
- **supplementDelta**: dollar amount increase if applicable
- **confidenceScore**: 0.0 to 1.0 based on evidence quality and sample size
- **sourceClaimCount**: number of claims that support this pattern
- **sourceClaimId**: the primary claim that generated this pattern
- **recommendedNextStep**: what to do next time this pattern is encountered
- **isSample**: true if this is a single-claim example, not yet a pattern

### 5. Use Careful Language

Do not claim causation unless the source document explicitly states it.

**Allowed language:**
- "Associated with approval"
- "Present before approval"
- "Preceded approval"
- "Commonly appears in successful claims"
- "Often observed in claims that were later approved"

**Prohibited language:**
- "Caused approval"
- "Guaranteed approval"
- "Proves approval"
- "Ensures approval"
- "Will result in approval"

**Why:** Legal defensibility. The playbook is intelligence, not legal advice. Claim outcomes depend on many factors. The skill reports what was observed, not what is guaranteed.

### 6. Validate Patterns Before Labeling

Require multiple similar claims before labeling a pattern as repeatable.

**Labeling thresholds:**

| Claims | Label |
|--------|-------|
| 1 | **Single Claim Example** |
| 2 | **Single Claim Example** (still too few) |
| 3+ | **Emerging Pattern** |
| 5+ | **Validated Pattern** |

**Why:** One claim is an anecdote. Three claims show a trend. Five claims show a repeatable pattern.

**Store in `playbookEntries.confidenceScore` and `sourceClaimCount`:**
- Single claim: confidenceScore 0.3–0.5
- 3+ claims: confidenceScore 0.5–0.7
- 5+ claims: confidenceScore 0.7–1.0

### 7. Preserve Source References

Every playbook pattern must include a reference to the claims and documents that produced it.

**Required references:**
- List of claim IDs used to build the pattern
- List of source document file names
- Date range of the claims
- Extraction confidence scores

**Storage:** Store in `metadataJson` as a JSON object:
```json
{
  "sourceClaims": ["claim-id-1", "claim-id-2", "claim-id-3"],
  "sourceDocuments": ["denial_letter.pdf", "approval_letter.pdf", "supplement.pdf"],
  "dateRange": { "from": "2023-01-01", "to": "2023-06-30" },
  "extractionConfidence": [0.95, 0.92, 0.88]
}
```

### 8. Include Confidence Scores and Sample Size

Every playbook pattern must display:

- **Confidence score** — 0.0 to 1.0
- **Sample size** — number of claims the pattern is based on
- **Evidence quality** — "High" (documents + transcripts), "Medium" (documents only), "Low" (inferred or transcript-only)

**Confidence formula:**
```
base = 0.2
+ (sourceClaimCount / 10) * 0.4  // up to 0.4 for 10+ claims
+ (evidenceQuality === "high" ? 0.2 : evidenceQuality === "medium" ? 0.1 : 0)
+ (hasOutcomeDocument ? 0.1 : 0)  // approval letter, payment document, etc.
+ (hasActionDocument ? 0.1 : 0)  // reinspection request, supplement, etc.
confidence = min(base, 1.0)
```

### 9. Connect Playbook Patterns to Context

Every pattern must be connected to the context that produced it:

- **Carrier** — which insurance company
- **Adjuster** — which adjuster was involved
- **Claim type** — hail, wind, water, fire
- **Damage type** — roof, siding, interior, etc.
- **Denial reason** — why the claim was denied
- **Reinspection status** — was reinspection requested, approved, completed
- **Supplement status** — was supplement submitted, approved, denied
- **Final outcome** — approved, partial approval, payment increased, etc.

**Why:** A pattern that works for hail damage with Allstate may not work for water damage with State Farm. Context matters.

### 10. Never Use Homeowner PII in Generalized Playbook Intelligence

Playbook patterns are generalized intelligence. They must not contain:

- Homeowner names
- Homeowner addresses
- Homeowner phone numbers
- Homeowner email addresses
- Policy numbers
- Claim numbers (unless the claim number is used as a source reference, not a display value)

**What to use instead:**
- Claim type (hail, wind, water)
- Carrier name (Allstate, State Farm)
- City and state (generalized location)
- Adjuster name (behavioral intelligence, not PII)
- Denial reason (coverage, scope, etc.)

**Why:** Playbook patterns are shared across organizations. Homeowner PII must not leak into generalized intelligence.

## Output Format

When presenting a playbook pattern, use this structure:

```json
{
  "pattern": {
    "title": "Denial overturned after reinspection",
    "label": "Validated Pattern",
    "scenarioType": "denial",
    "outcomeType": "approved",
    "confidenceScore": 0.82,
    "sourceClaimCount": 5,
    "evidenceQuality": "High"
  },
  "context": {
    "carrier": "Allstate Insurance Company",
    "adjuster": "<adjuster name or null>",
    "claimType": "hail",
    "damageType": "roof",
    "denialReason": "insufficient_scope",
    "region": "Illinois"
  },
  "actions": [
    { "action": "Reinspection requested", "presentBeforeOutcome": true, "source": "reinspection_request.pdf" },
    { "action": "Photos submitted", "presentBeforeOutcome": true, "source": "photo_set_1.jpg" },
    { "action": "Estimate revised", "presentBeforeOutcome": true, "source": "revised_estimate.pdf" }
  ],
  "language": {
    "description": "Reinspection requests are commonly associated with denials that are later overturned to approval.",
    "avoid": "Reinspection requests cause denials to be overturned."
  },
  "sources": [
    { "claimId": "<id>", "fileName": "denial_letter.pdf", "date": "<date>", "confidence": 0.95 },
    { "claimId": "<id>", "fileName": "approval_letter.pdf", "date": "<date>", "confidence": 0.95 }
  ],
  "recommendedNextStep": "If a claim is denied for insufficient scope, request a reinspection and submit revised photos and estimate.",
  "metadata": {
    "sourceClaims": ["claim-id-1", "claim-id-2", "claim-id-3", "claim-id-4", "claim-id-5"],
    "sourceDocuments": ["denial_letter.pdf", "reinspection_request.pdf", "approval_letter.pdf"],
    "dateRange": { "from": "2023-01-01", "to": "2023-06-30" },
    "extractionConfidence": [0.95, 0.92, 0.88, 0.90, 0.91]
  }
}
```

## Integration with ClaimSignal

When working inside the ClaimSignal codebase:

- Use `playbookEntries` for reusable historical patterns
- Use `playbookInsights` for adjuster-specific insights derived from playbooks
- Use `adjusterPlaybooks` for adjuster-specific behavioral patterns
- Use `intelligence_events` for timeline events and action detection
- Use `timeline_events` for claim status transitions
- Use `claims` table for outcome data and status history
- Use `evidence_files` for source document linkage
- Use PII masking rules in `server/masking.ts` before displaying playbook data to non-Master users

## Edge Cases

- **Single claim outcome:** If only one claim supports a pattern, create a `playbookEntries` record with `isSample: true` and label "Single Claim Example." Do not present it as a repeatable strategy.
- **No action evidence:** If a claim outcome is positive but no specific action is documented, do not invent actions. Create a playbook entry with `whatWorked: "No specific action documented."` and low confidence.
- **Conflicting actions:** If two different actions were taken on two similar claims with the same outcome, include both in the playbook pattern. Do not arbitrarily pick one. Note the conflict in `whatWorked`.
- **Carrier-specific patterns:** A pattern that works for one carrier may not work for another. Always connect the pattern to the carrier. Do not generalize across carriers without evidence.
- **Adjuster-specific patterns:** A pattern that works with one adjuster may not work with another. Include the adjuster in the context. If the pattern is validated across multiple adjusters, note "applies across adjusters."
- **Missing outcome document:** If the approval or payment document is missing, create the playbook entry with lower confidence and flag "Missing outcome document." Do not assume the outcome.
- **Playbook masking:** Before displaying playbook data to non-Master users, strip `sourceClaimId`, `organizationId`, `createdBy`, and `metadataJson` that contains source references. Use `server/masking.ts` for this.
