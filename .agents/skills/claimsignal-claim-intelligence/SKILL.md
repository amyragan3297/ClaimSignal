---
name: claimsignal-claim-intelligence
description: >
  Extract and organize insurance claim intelligence from uploaded documents, emails,
  screenshots, estimates, denial letters, approval letters, supplements, photos, and notes.
  Use when the user uploads claim-related files, asks to process claim documents,
  build claim timelines, extract adjuster information, or resolve duplicate claim records.
  Also triggers when the user mentions claim intelligence, document extraction, or
  claims data cleanup.
---

# ClaimSignal Claim Intelligence

## When to Use

- User uploads claim documents (PDFs, images, emails, screenshots)
- User asks to extract information from claim files
- User needs to build or update a claim timeline
- User reports duplicate adjusters, claims, or aliases
- User asks to reconcile claim data across multiple sources
- User mentions specific claims like CLM-721631 or 604 Milton Road

## Core Principle

Do not just store files. Build relationships between claims, addresses, documents, emails, adjusters, carriers, timelines, and outcomes. Every extracted fact must be traceable to its source.

## Extraction Rules

### 1. Claim Identity

Extract these fields from every document set:

- **Claim number** — primary identifier; look for variations (CLM- prefix, numeric only)
- **Property address** — full street address; use for claim matching
- **Insured/homeowner name** — do not assume the first person named is the insured
- **Carrier** — insurance company name; normalize (e.g., "Allstate Vehicle and Property Insurance Company" → "Allstate Insurance Company")
- **Date of loss** — convert to ISO format when possible
- **Loss type** — hail, wind, water, fire, etc.
- **Current status** — open, closed, denied, approved, etc.
- **Full status history** — preserve sequence, never overwrite

### 2. People and Roles

Extract all participants with their roles:

- Homeowner / insured
- Adjusters (primary, field, desk, catastrophe, supplement, reinspection)
- Supervisors / team leads
- Contractors
- Vendors (ladder assist, engineering, etc.)
- Carrier representatives

**Rule:** Do not assume the first name found is the insured. Verify against the policy or claim header.

### 3. Document-to-Claim Matching

Before creating a new claim, compare against existing claims using:

- Claim number (exact match)
- Property address (normalized: lowercase, no punctuation)
- Carrier name (normalized)
- Insured name (normalized, last-name first variant)
- Adjuster names (cross-reference)
- Email subject and body
- Attachment names
- Dates (within 30-day window)
- Status language patterns

**Match threshold:** If 3 or more fields align, merge into existing claim. If uncertain, create a draft claim and flag for review.

### 4. Alias Resolution

Resolve spelling variations and aliases using context from the same claim, carrier, address, document set, or timeline.

**Example:**
- Edwinah Bopape, Edwina Bopape, Edwina Opape, Edwina, Eswinah Bopape
- These are the same person when supported by shared claim, carrier, address, or document context.

**Method:**
1. Compare name similarity (Levenshtein distance < 3 for first name)
2. Check shared carrier or company
3. Check shared claim number or address
4. Check shared document set or email thread
5. If 2+ signals match, consolidate under the most complete name (usually the full name with company)

### 5. Claim Timeline Building

Build timeline from earliest to latest event. Standard phases:

1. **Filed** — claim submitted
2. **Inspected** — initial inspection completed
3. **Denied** — claim denied
4. **Reopened** — claim reopened after denial
5. **Reinspected** — second inspection
6. **Approved** — claim approved
7. **Supplemented** — supplement requested/approved
8. **Paid** — payment issued
9. **Closed** — claim closed

**Rules:**
- Preserve full sequence: Denied → Approved → Closed
- Never overwrite a later status with an earlier one
- If documents conflict, use the most recent document's date
- Track the source document for each timeline entry

### 6. Outcome History Preservation

Store the complete outcome chain, not just the current state.

**Never overwrite:**
- Denied → Approved → Closed
- Denied → Reopened → Approved → Supplemented → Paid

Store as an array of outcome events with dates and sources.

### 7. Outcome Pattern Recognition

Identify and label these patterns:

- **Denial overturned to approval** — a claim was denied and later approved
- **Reinspection leading to approval** — reinspection event precedes approval
- **Multi-adjuster involvement before approval** — 2+ adjusters involved before final approval
- **Supplement approved** — supplement requested and later approved
- **Partial approval converted to full approval** — initial partial approval upgraded

### 8. Source Tracking

Every extracted fact must include:

- **File name** — original upload name
- **Page number** — if applicable
- **Email subject** — if from email
- **Screenshot name** — if from image
- **Upload date** — when the file was added to the system
- **Confidence score** — 0.0 to 1.0 based on clarity and completeness

Store source metadata alongside the extracted fact. Use it for audit trails and disambiguation.

### 9. Uncertainty Handling

If extraction is uncertain:

- Mark the field as **"Needs Review"**
- Set confidence score < 0.7
- Include the raw text snippet that caused uncertainty
- Flag for human review in the UI

**Do not guess.** A blank field with "Needs Review" is better than incorrect data.

### 10. Special Claim Rules

**CLM-721631 / 604 Milton Road:**
- Group all related uploaded materials under this claim when evidence supports the connection
- Known participants: Cody Vines, Edwinah Bopape (and variants), Vernon Hood
- Known lifecycle: Denied → Approved → Closed
- Cody Vines is the adjuster who overturned the denial to approval

## Output Format

When extracting claim intelligence, produce structured data in this format:

```json
{
  "claim": {
    "claimNumber": "CLM-721631",
    "propertyAddress": "604 Milton Road",
    "insuredName": "Cody Vines",
    "carrier": "Allstate Insurance Company",
    "dateOfLoss": "2023-03-15",
    "lossType": "hail",
    "currentStatus": "closed",
    "statusHistory": [
      { "status": "filed", "date": "2023-03-15", "source": "claim_form.pdf" },
      { "status": "denied", "date": "2023-04-02", "source": "denial_letter.pdf" },
      { "status": "approved", "date": "2023-05-10", "source": "approval_letter.pdf" },
      { "status": "closed", "date": "2023-05-15", "source": "closing_notice.pdf" }
    ]
  },
  "adjusters": [
    {
      "name": "Cody Vines",
      "company": "Allstate Insurance Company",
      "role": "primary_adjuster",
      "involvement": "approved",
      "notes": "Overturned denial to approval"
    },
    {
      "name": "Edwinah Bopape",
      "aliases": ["Edwina Bopape", "Edwina Opape", "Edwina"],
      "company": "Allstate Insurance Company",
      "role": "field_adjuster",
      "involvement": "unknown"
    },
    {
      "name": "Vernon Hood",
      "company": "Unknown",
      "role": "primary_adjuster",
      "involvement": "unknown"
    }
  ],
  "outcomePattern": "denial_overturned_to_approval",
  "sources": [
    { "fileName": "denial_letter.pdf", "page": 1, "confidence": 0.95 },
    { "fileName": "approval_letter.pdf", "page": 1, "confidence": 0.95 }
  ],
  "needsReview": false
}
```

## Integration with ClaimSignal

When working inside the ClaimSignal codebase:

- Use the `adjusters` table for adjuster records (name field: `adjuster_name`)
- Use the `claim_adjusters` junction table for claim-adjuster relationships
- Use `claimAdjusterRoleEnum` for roles and `claimAdjusterInvolvementEnum` for involvement status
- Store source documents in `evidence_files` with `claimId` linkage
- Use `intelligence_events` for timeline events
- Deduplicate adjusters via `server/adjuster-linking.ts` logic
- For alias resolution, leverage the existing adjuster normalization pipeline

## Edge Cases

- **Same adjuster, multiple roles on one claim:** This is allowed. The `claim_adjusters` table enforces uniqueness on `(claim_id, adjuster_id, role_on_claim)`.
- **Partial address match:** Use street name + city + state. ZIP alone is insufficient.
- **Carrier name variations:** Maintain a normalized carrier name map. "Allstate Vehicle and Property Insurance Company" and "Allstate Insurance Company" are the same carrier.
- **Missing claim number:** Use address + insured name + date of loss as fallback identifier. Flag for review.
- **Conflicting status dates:** If two documents show different dates for the same status, use the later date and note the conflict.
