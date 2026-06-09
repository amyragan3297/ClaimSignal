---
name: claimsignal-entity-privacy
description: Prevent non-claim people, employers, business contacts, internal company personnel, and private organizations from being misclassified as homeowners, claims, adjusters, or public intelligence records. Use when processing documents, creating claims, extracting entities, linking adjusters, or analyzing intelligence data. Triggers on any entity extraction, claim creation, or data classification task.
---

# ClaimSignal Entity Classification & Privacy Guardrail

## When to Use

- Extracting names from documents, transcripts, or emails
- Creating new claim records
- Linking adjusters to claims
- Classifying entities in evidence files
- Processing intelligence data for analytics
- Any AI extraction or entity recognition pipeline

## Protected Entity List

The following names, companies, and contacts are **NEVER** homeowners, claims, or public intelligence records:

| Name | Company |
|------|---------|
| Jeremy Timko / Jeremy Timco | Aerial AI Solutions |
| Travis Peete | AAIS |
| Catherine | Pay It Forward Processing |
| Chris | Revolution Roofing |
| Jessica | |
| Rob | |
| Brad | |
| Kenzie | |
| Ashley | |

Also protected: Internal company personnel, employers, former employers, business contacts, vendors, investors, employees, managers, executives.

## 1. Entity Classification (Required Before Any Record Creation)

Every detected name **must** be classified into one of these categories:

- `homeowner` — The insured property owner
- `adjuster` — Insurance carrier adjuster
- `carrier_representative` — Carrier staff (non-adjuster)
- `contractor` — Restoration/roofing contractor
- `company` — Business entity
- `employee` — Internal staff
- `manager` — Internal manager
- `executive` — Internal executive
- `vendor` — Third-party vendor
- `engineer` — Engineer/inspector
- `attorney` — Legal representative
- `public_adjuster` — Public adjuster
- `investor` — Investor/business partner
- `other_person` — Unclassified person

**Rule:** Do NOT default to `homeowner`. A name alone is never sufficient.

## 2. Claim Creation Requirements

A claim record may **only** be created when the system identifies **all** of:

1. Property address
2. Homeowner (classified, not protected)
3. Loss event (loss type + date)
4. Carrier information
5. Claim evidence (document, transcript, or email)

**If any requirement is missing, flag for review instead of creating a claim.**

## 3. Internal Company Data Protection

Internal company names and personnel must **never** be converted into:

- Homeowners
- Claims
- Adjuster records
- Carrier records

**Unless** explicitly confirmed by the Master Admin (`claimsignal1@gmail.com`).

## 4. Data Masking for Intelligence Reporting

The following categories must be **masked** from all intelligence reporting (Carrier, Adjuster, Revenue, Executive, Playbook) except Master Admin:

- Former employers
- Internal company personnel
- Internal business contacts
- Private organizations
- Non-claim individuals

**Master Admin sees everything unmasked.**

## 5. Historical Cleanup Scanner

When scanning existing records, generate a cleanup report that identifies:

- Misclassified homeowners (protected names in homeowner fields)
- Misclassified claims (incomplete or missing required fields)
- Misclassified adjusters (protected names as adjusters)
- Misclassified companies (protected companies as carriers)

**Flag records for Master Admin review. Do NOT automatically merge or delete.**

## 6. Master Admin Authority

Only `claimsignal1@gmail.com` may:

- Approve cleanup actions
- Reclassify entities
- Merge identities
- Permanently delete records

## 7. Intelligence Integrity

All intelligence engines (Carrier, Adjuster, Revenue, Executive, Playbook) must **only** use verified claim entities.

**Unverified names must be excluded from analytics until classified.**

## 8. Protected Name Detection

Before creating any record, check against the protected list. If a match is found:

1. **Block** the record creation
2. **Log** the attempted misclassification
3. **Flag** for Master Admin review
4. **Continue** processing other entities

## 9. AI Extraction Pipeline Guard

When using AI to extract entities from documents:

- Add the protected list to the extraction prompt
- Instruct the AI to classify entities before returning them
- Reject any extraction that defaults names to `homeowner`
- Validate all extracted names against the protected list
- Flag ambiguous names for human review

## 10. Verification Checklist

Before any claim or adjuster record is persisted:

- [ ] Entity classified (not defaulting to homeowner)
- [ ] Name is NOT on the protected list
- [ ] Required fields present (address, loss, carrier, evidence)
- [ ] Classification is appropriate for the context
- [ ] If protected name detected, flagged for Master Admin
