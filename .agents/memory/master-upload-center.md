---
name: Master Upload Center
description: Long-term product vision for a universal AI-driven bulk upload experience that replaces all manual evidence management.
---

# Master Upload Center

## The Vision
A single drag-and-drop interface where a user drops 50+ files. AI automatically:
1. Identifies which existing claim each document belongs to
2. Creates new claim records if no matching claim exists
3. Matches documents to the correct claim
4. Extracts all structured data (homeowner, carrier, adjuster, financials, dates, codes)
5. Builds claim timelines from document events
6. Updates adjuster intelligence profiles
7. Updates carrier intelligence profiles
8. Generates claim insights and supplement opportunities

Then the user simply reviews and approves the results — no manual steps.

## Why This Matters
ClaimSignal is an intelligence platform, not a document repository. The document is fuel for the AI engine. The current claim-centric upload (one doc → one claim) is Phase 1. The Master Upload Center is Phase 2.

## Current State (Phase 1 — implemented)
- Evidence page removed entirely from navigation and routing
- Documents are uploaded inside a claim (Documents tab in claim detail)
- AI auto-extracts on upload, auto-applies to claim, no Apply button
- User can delete documents from a claim via trash icon
- Upload onSuccess invalidates claim, IRC screening, evidence file, and timeline queries so the claim updates immediately

## How to Apply
When the user asks about bulk upload, multi-file processing, or "upload 50 files at once," this is the right reference. Build the Master Upload Center as a new top-level page `/upload` that handles the auto-match/create/extract pipeline.
