---
name: AI extraction pipeline
description: How AI field extraction works for uploaded documents and audio transcripts in ClaimSignal
---

# AI Extraction Pipeline

## Overview
Every uploaded document (PDF, TXT, EML) and audio transcript is run through OpenAI GPT-5.4 to extract 30+ structured claim fields. Results are stored in `evidence_files.extracted_json.extraction` and reviewed via the Extraction Review dialog.

## Key components
- `server/ai-services.ts` — `extractClaimFieldsFromText(text, hint?)` and `extractClaimFieldsFromImages(images, hint?)` — LLM extraction, returns `ExtractionResult`
- `server/evidence.ts` — upload route: pdf-parse for PDF text → `cleanPdfText()` → `hasUsableClaimText()` → text LLM or vision OCR; sanitization via `sanitizePlaceholders()` and `isExtractionUsable()`; doc-type alias resolution via `DOC_TYPE_ALIASES`
- `server/pdf-render.ts` — `renderPdfToImages()` for vision OCR fallback on scanned/image PDFs
- `client/src/pages/claims.tsx` — `CreateClaimDialog` with Extraction Review step; `PLACEHOLDER_VALUES` set filters hallucinated values before display

## Text quality gate for PDFs (critical)
Use `hasUsableClaimText(text)` NOT a bare char count:
- Requires >= 200 chars AND at least one insurance claim indicator term
- Term list: "claim number", "policy number", "insured", "date of loss", "rcv", "acv", "deductible", "estimate", "adjuster", "coverage", etc.
- This prevents image-only PDFs whose pdf-parse output is junk page markers from bypassing vision OCR
- For audio/TXT/EML: simple `length > 80` is used (claim term check not applied)

## Vision OCR fallback
- Triggered when `hasText = false AND (fileType === "pdf" OR isImageUpload)`
- Renders PDF pages to images via `renderPdfToImages()` (pdf-parse + @napi-rs/canvas)
- Passes up to 6 page images to `extractClaimFieldsFromImages()` (gpt-5.4 vision)

## Text cleaning pipeline
`cleanPdfText(raw)`:
1. Strip `-- N of N --` page markers
2. Strip bare page numbers (1–4 digit lines)
3. Strip separator lines (`---`, `===`, `___`, etc.)
4. Filter lines shorter than 3 chars
Applied to all PDF text before the `hasUsableClaimText` check.

## Placeholder sanitization
After extraction, `sanitizePlaceholders()` removes fields matching `KNOWN_PLACEHOLDERS`:
- `clm-00001`, `john doe`, `jane doe`, `123 main street`, `pol-12345`, `555-0100`, `john@example.com`, `unknown`, `n/a`, `tbd`, etc.
- Then `isExtractionUsable()` checks if at least one key field (claimNumber, carrier, adjusterName, etc.) is non-empty
- If all-empty after sanitization → `llmExtraction = null`, `extractionStatus = "failed"`

## Document type resolution
`DOC_TYPE_ALIASES` maps non-standard LLM type strings to DB enum values:
- `insurance_estimate_statement_of_loss` → `estimate`
- `scope_of_work` / `scope_of_loss` → `scope`
- `claim_denial` → `denial_letter`
- `supplement_request` → `supplement`
- `payment_notice` → `payment_letter`
- etc.
Promotion logic: if rule-based = "unknown" and LLM returns a resolved type, use the LLM type.

## Re-extraction on re-upload
When same SHA-256 already exists with `extractionStatus === "failed"`, server re-runs extraction (same text/vision pipeline + sanitization) and patches the existing evidence record, returning `reExtracted: true`.

## Fields extracted (30+)
claimNumber, policyNumber, homeownerName, insuredName, adjusterName, adjusterEmail, adjusterPhone, iaFirm, carrier, vendor, propertyAddress, city, state, zipCode, dateOfLoss, inspectionDate, estimateDate, denialDate, approvalDate, paymentDate, rcv, acv, deductible, recoverableDepreciation, supplementRequested, supplementApproved, denialReason, initialOutcome, finalOutcome, denialOverturned, missingScopeItems[], codeItems[], reinspectionReferences[], escalationReferences[], timelineEvents[]

## Why
- pdf-parse must use `require("pdf-parse")` not ESM import (CJS module)
- `hasUsableClaimText` prevents image-only PDFs from bypassing vision OCR
- Sanitization prevents hallucinated placeholders from reaching the review form
- Extraction is non-blocking: failure only sets extractionStatus="failed", upload still succeeds

## extractedJson shape
```json
{ "entities": [...rule-based...], "extraction": {...ExtractionResult...} }
```
