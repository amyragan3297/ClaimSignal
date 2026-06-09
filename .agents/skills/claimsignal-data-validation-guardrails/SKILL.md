---
name: claimsignal-data-validation-guardrails
description: >
  Act as the quality control layer for ClaimSignal data. Protects against bad data,
  duplicate records, wrong claim matches, incorrect person merges, OCR mistakes, and
  AI hallucinations. Use before saving, merging, displaying, or using any claim intelligence
  for playbook learning. Triggers when the user asks to validate data, check duplicates,
  review merges, verify claims, or mentions data quality concerns.
---

# ClaimSignal Data Validation & Guardrails

## Purpose

This skill is the quality control checkpoint before any claim intelligence is saved, merged, displayed, or used for playbook learning. It prevents data corruption and ensures every fact is trustworthy.

## When to Use

- Before merging any records (people, claims, documents)
- Before saving AI-extracted data to the database
- Before displaying claim intelligence to users
- Before using data for playbook or pattern learning
- When the user asks to validate, verify, check, or review data quality
- When the user reports possible duplicates, wrong matches, or incorrect merges
- When OCR or AI extraction results seem suspicious

## Core Rules

### Rule 1: Never Merge People Based on Name Alone

A name match is a signal, not proof. Two people with the same name are different people unless additional evidence confirms it.

**Why:** Names are not unique. "John Smith" could be hundreds of different adjusters across different carriers, states, and claims.

### Rule 2: Verify at Least 2 Supporting Factors Before Merging People

Before merging person records, confirm at least two independent signals:

- Same claim number
- Same property address
- Same carrier
- Same email thread
- Same uploaded document set
- Same role on the same claim
- Same timeline context

**Example:** "Edwina Bopape" and "Edwinah Bopape" can be merged when they share:
- Same claim number (CLM-721631) AND same carrier (Allstate)
- OR same address (604 Milton Road) AND same email thread

**Counter-example:** Two "John Smith" records on different claims with different carriers should never be merged, even if both are "field adjusters."

### Rule 3: Verify Strong Claim Matching Before Merging Claims

A claim merge requires one of these combinations:

- Matching claim number (exact)
- Matching property address + matching carrier
- Matching property address + matching insured name
- Matching email thread + matching claim number or address

**Why:** Address alone is not enough — a homeowner could file multiple claims (hail vs. wind) at the same address. Carrier + address narrows it to one claim per carrier. Email thread + claim number confirms the connection.

### Rule 4: Confidence Threshold for Automatic Merging

If confidence is below 85%, do not merge automatically.

**Action:** Mark as **"Needs Review"** and flag for human confirmation.

Confidence factors:
- Exact match on claim number: +0.40
- Exact match on address: +0.25
- Exact match on carrier: +0.20
- Exact match on insured name: +0.25
- Same email thread: +0.20
- Same document set: +0.15
- Name similarity (Levenshtein < 3): +0.10
- Same role: +0.05

**Maximum confidence from name alone: 0.10** — well below the 0.85 threshold.

### Rule 5: Never Overwrite Claim History

Preserve the full status sequence. History is additive, not replaceable.

**Valid sequences to preserve:**
- Open → Denied → Approved → Closed
- Denied → Reopened → Approved
- Partial Approval → Full Approval
- Supplement Submitted → Supplement Approved

**Wrong action:** Replacing "Denied → Approved → Closed" with just "Closed."

**Correct action:** Adding a new status event to the sequence. The claim can gain new states, never lose old ones.

### Rule 6: Never Invent Missing Information

If a document does not contain the information, leave the field blank.

**Never invent:**
- Claim numbers
- Addresses
- Insured names
- Adjuster names
- Carriers
- Dates
- Statuses
- Payment amounts

**Why:** Invented data corrupts intelligence, creates false matches, and destroys playbook reliability.

**Correct action:** Leave the field null, mark as "Needs Review," and flag the missing field for the user to fill in.

### Rule 7: Preserve Source Evidence

Every fact must be traceable to its origin.

Required metadata for every extracted field:
- **File name** — original upload
- **Page number** — if applicable
- **Email subject** — if applicable
- **Screenshot name** — if applicable
- **Upload date** — when added to system
- **Confidence score** — 0.0 to 1.0

**Why:** Source tracking allows audit, dispute resolution, and confidence recalculation. A fact without a source is a guess.

### Rule 8: Flag Conflicts, Do Not Resolve Arbitrarily

If two documents disagree on the same fact, keep both and flag the conflict.

**Example:**
- Document A says "Date of loss: March 15, 2023"
- Document B says "Date of loss: April 2, 2023"

**Wrong action:** Pick one and delete the other.

**Correct action:**
- Store both dates
- Flag as **"Conflicting Evidence"**
- Note the source documents
- Set confidence to the lower of the two
- Present both to the user for resolution

### Rule 9: Flag Possible Duplicates, Never Auto-Delete

When a duplicate is suspected, flag it. Do not delete.

**Flag types:**
- **Possible Duplicate Claim** — two claim records that might be the same
- **Possible Duplicate Person** — two adjuster/insured records that might be the same person
- **Possible Duplicate Document** — two uploaded files that might be the same document

**Why:** Auto-deletion destroys data. A flagged possible duplicate can be reviewed and confirmed or dismissed by a human. A deleted record is gone.

**Correct action:**
- Create a duplicate flag record
- Link the two suspected duplicates
- Show the matching evidence
- Set confidence score
- Present to the user for confirmation

### Rule 10: Claim-Specific Information Belongs in the Database

The skill contains rules, not data. No claim numbers, addresses, names, or carriers are hardcoded.

**Why:** Reusable skills are frameworks. Claim-specific data lives in the database where it can be queried, updated, and audited. A skill with hardcoded data is stale the moment a new claim arrives.

## Confidence Scoring Formula

Use this formula when evaluating whether to merge:

```
base = 0.0
if claim_number_match: base += 0.40
if address_match: base += 0.25
if carrier_match: base += 0.20
if insured_name_match: base += 0.25
if email_thread_match: base += 0.20
if document_set_match: base += 0.15
if name_similarity: base += 0.10
if same_role: base += 0.05

confidence = min(base, 1.0)
```

**Decision table:**
- `confidence >= 0.85`: Auto-merge
- `0.60 <= confidence < 0.85`: Flag as "Needs Review"
- `confidence < 0.60`: Do not merge, treat as separate records

## Validation Checklist

Before any save or merge, run this checklist:

- [ ] Are at least 2 supporting factors confirmed?
- [ ] Is confidence >= 0.85?
- [ ] Is every fact traceable to a source?
- [ ] Is no information invented?
- [ ] Is claim history preserved (not overwritten)?
- [ ] Are conflicts flagged, not silently resolved?
- [ ] Are possible duplicates flagged, not deleted?
- [ ] Is no claim-specific data hardcoded in the skill?

If any checkbox fails, stop and flag for review.

## Integration with ClaimSignal

When working inside the ClaimSignal codebase:

- Validate against the `claims` table before creating new claims
- Validate against the `adjusters` table before creating new adjuster records
- Check `claim_adjusters` for existing role assignments before adding duplicates
- Use `evidence_files` to verify source documents exist
- Use `intelligence_events` to check for conflicting timeline entries
- Leverage existing deduplication in `server/adjuster-linking.ts` but apply guardrails before accepting its output

## Edge Cases

- **AI hallucination:** If an AI extraction includes a claim number that does not appear in any source document, reject it. The AI may have invented a plausible-looking number.
- **OCR error:** If an OCR result reads "ABC-12345" but the document image shows "ABC-12346," flag as "OCR Mismatch" and flag for review.
- **Transcript misattribution:** If a transcript mentions an adjuster who is not on the claim, do not auto-add them. Verify with a document or email that confirms their involvement.
- **Partial document:** If only page 1 of a 5-page document is uploaded, flag as "Incomplete Document" and note that the full document may contain additional facts.
- **Email forwarding chain:** If an email contains forwarded messages from multiple adjusters, extract each adjuster separately with their own source context. Do not merge them into one person.
