---
name: claimsignal-identity-resolution
description: >
  Resolve duplicate or alias person records across claims using fuzzy matching,
  OCR correction, alias detection, email matching, claim context, carrier context,
  timeline context, and confidence scoring. Use when the user reports duplicate
  adjusters, asks to merge person records, or when AI detects possible aliases
  during document extraction. Triggers for identity matching, deduplication,
  alias resolution, and merge review.
---

# ClaimSignal Identity Resolution

## Purpose

Prevent duplicate person records when the same adjuster, insured, or vendor appears with spelling variations, OCR errors, or partial names across documents. Use AI-driven matching with human oversight for high-confidence merges.

## When to Use

- User reports duplicate adjusters or persons
- AI detects possible aliases during document extraction
- User asks to merge or deduplicate person records
- OCR or transcription produces name variations
- Email signatures reveal alternate name spellings
- User asks to review identity matches
- User mentions identity resolution, deduplication, or merge

## Core Principle

Never create a duplicate person record when the AI can determine a high-confidence alias match. Always preserve the original extracted text. Humans approve merges; AI proposes them.

## Identity Resolution Pipeline

### 1. Extract and Normalize

When a person is extracted from a document:

1. **Normalize the name** using `normalizeAdjusterName()` from `server/adjuster-linking.ts`
2. **Check for exact matches** against existing `identity_profiles` canonical names
3. **Check for fuzzy matches** using Levenshtein distance < 3 for first name
4. **Check for partial matches** — first name only, last name only, initials
5. **Check for OCR substitutions** — common character swaps (O↔B, I↔l, 0↔O, rn↔m)

### 2. Gather Match Context

For each candidate match, collect context signals:

- **Same claim number** — strongest signal
- **Same property address** — strong signal
- **Same carrier** — strong signal
- **Same email address** — very strong signal
- **Same email thread** — strong signal
- **Same document set** — medium signal
- **Same timeline window** — medium signal
- **Same role or similar role** — weak signal
- **Adjuster keywords nearby** — medium signal

### 3. Score Confidence

Use the confidence scoring formula:

```
base = 0.0
if exact_name_match:        base += 0.50
if claim_number_match:      base += 0.40
if address_match:           base += 0.25
if carrier_match:           base += 0.20
if email_address_match:     base += 0.35
if email_thread_match:      base += 0.20
if document_set_match:       base += 0.15
if name_similarity:         base += 0.10
if same_role:               base += 0.05
if adjuster_keywords:       base += 0.05

confidence = min(base, 1.0)
```

### 4. Decision Rules

| Confidence | Action |
|------------|--------|
| `>= 0.90` | Auto-merge as alias (if claim context matches) |
| `0.75 - 0.89` | Flag for Master Admin review |
| `0.60 - 0.74` | Store as "Possible Match" — needs evidence |
| `< 0.60` | Create separate identity profile |

### 5. Store Results

**For auto-merged aliases (>= 0.90):**
- Create `identity_aliases` record linking to canonical profile
- Store `extracted_name`, `confidence_score`, `match_reason`
- Update `adjusters` table to point to canonical profile
- Log merge action in `audit_logs`

**For review-flagged aliases (0.75 - 0.89):**
- Create `identity_matches` record with status `pending_review`
- Add to `identity_review_queue` for Master Admin
- Store all evidence: `source_document`, `claim_id`, `carrier`, `match_reason`

**For possible matches (0.60 - 0.74):**
- Create `identity_matches` record with status `needs_evidence`
- Do not merge; store for future evidence accumulation

### 6. Master Admin Review

Master Admin (claimsignal1@gmail.com) can:

- **View review queue** — all pending `identity_matches` with evidence
- **Approve merge** — merge alias into canonical profile, log in `audit_logs`
- **Reject merge** — mark as `rejected`, create separate identity profile, log in `audit_logs`
- **Bulk review** — approve or reject multiple matches at once

### 7. Audit Logging

Every merge action creates an `audit_logs` record with:
- `actionType`: `IDENTITY_MERGE_APPROVED` or `IDENTITY_MERGE_REJECTED`
- `entityType`: `identity_profile`
- `entityId`: canonical profile ID
- `beforeJson`: { alias_id, extracted_name, canonical_name }
- `afterJson`: { merged: true, reason, confidence_score }
- `actorUserId`: Master Admin user ID

## Required Data Fields

### `identity_profiles` — canonical person records

- `id`: UUID
- `canonical_name`: preferred name
- `aliases`: array of known variations
- `email`: email address if known
- `phone`: phone number if known
- `carrier`: carrier/company if known
- `role`: primary role (adjuster, supervisor, vendor, etc.)
- `created_at`: timestamp
- `updated_at`: timestamp

### `identity_aliases` — spelling variations

- `id`: UUID
- `identity_profile_id`: canonical profile reference
- `alias_name`: extracted/spelled variation
- `extracted_name`: raw text from source
- `confidence_score`: 0.0 to 1.0
- `match_reason`: why this is considered an alias
- `source_document`: file name or source
- `source_location`: page or position
- `claim_id`: claim context
- `carrier`: carrier context
- `created_at`: timestamp

### `identity_matches` — AI-proposed matches

- `id`: UUID
- `source_identity_id`: existing identity profile
- `target_identity_id`: proposed match identity
- `match_type`: `alias`, `duplicate`, `possible`
- `confidence_score`: 0.0 to 1.0
- `match_reason`: evidence summary
- `status`: `pending_review`, `approved`, `rejected`, `needs_evidence`
- `reviewed_by`: Master Admin user ID
- `reviewed_at`: timestamp
- `created_at`: timestamp

### `identity_review_queue` — pending matches for Master Admin

- `id`: UUID
- `match_id`: reference to `identity_matches`
- `priority`: `high` (>=0.85), `medium` (0.75-0.84), `low` (<0.75)
- `status`: `pending`, `approved`, `rejected`, `expired`
- `created_at`: timestamp
- `expires_at`: timestamp (default 30 days)

## Integration with ClaimSignal

When working inside the ClaimSignal codebase:

- Use `server/adjuster-linking.ts` for name normalization and comparison
- Use `server/storage.ts` for identity CRUD operations
- Use `identity_profiles` for canonical person records
- Use `identity_aliases` for spelling variations
- Use `identity_matches` for AI-proposed matches
- Use `identity_review_queue` for Master Admin review
- Use `audit_logs` for all merge actions
- Apply PII masking via `server/masking.ts` before displaying identity data to non-Master users
- Master Admin (super_admin role) can view and approve all identity merges
- Use Levenshtein distance for name similarity: `import levenshtein from 'fast-levenshtein'` or implement inline

## Examples

### Example 1: Auto-merge (high confidence)

- Extracted: "Edwinah Bopape" from document
- Existing: "Edwina Bopape" (adjuster, Allstate)
- Context: Same claim CLM-721631, same carrier Allstate
- Confidence: 0.95 (exact name + claim + carrier)
- Action: Auto-merge alias into canonical profile
- Result: `identity_aliases` record created, `adjusters` table updated

### Example 2: Flag for review (medium confidence)

- Extracted: "Eswinah Bopape" from transcript
- Existing: "Edwina Bopape" (adjuster, Allstate)
- Context: Same claim, but transcript has no carrier info
- Confidence: 0.78 (name similarity + claim match)
- Action: Create `identity_matches` with status `pending_review`, add to `identity_review_queue`
- Result: Master Admin receives review request

### Example 3: Keep separate (low confidence)

- Extracted: "John Smith" from document
- Existing: "John Smith" (adjuster, State Farm)
- Context: Different claim, different carrier, no other signals
- Confidence: 0.10 (name only)
- Action: Create separate `identity_profile` record
- Result: No merge, no alias

## Edge Cases

- **Same name, different carriers:** Always create separate profiles unless email/phone match
- **Partial documents:** If only first name is visible, flag as "Needs Evidence" and do not merge
- **Transcription errors:** Multiple errors in one name reduce confidence; require more context signals
- **Email forwarding chains:** Extract each person separately with their own source context
- **OCR confidence:** If OCR confidence is low (< 0.70), flag extracted name for review before matching
- **Bulk imports:** During bulk import, defer identity resolution to batch processing; do not auto-merge during upload
