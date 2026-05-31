---
name: AI extraction pipeline
description: How AI field extraction works for uploaded documents and audio transcripts in ClaimSignal
---

# AI Extraction Pipeline

## Overview
Every uploaded document (PDF, TXT, EML) and audio transcript is run through OpenAI GPT-5.4 to extract 30+ structured claim fields. Results are stored in `evidence_files.extracted_json.extraction` and reviewed via the Extraction Review dialog.

## Key components
- `server/ai-services.ts` — `extractClaimFieldsFromText(text, hint?)` — LLM extraction, returns `ExtractionResult`
- `server/evidence.ts` — upload route: pdf-parse for PDF text, then `extractClaimFieldsFromText`, stored in `extractedJson.extraction`; `POST /files/:id/apply-extraction` applies accepted fields to claim via `storage.updateClaim()`
- `server/routes.ts` — audio transcription route: calls `extractClaimFieldsFromText` on transcript, returns `extraction` in response
- `client/src/pages/evidence.tsx` — `ExtractionReviewDialog` shows all fields editable by section; "Apply to Claim" button

## Fields extracted (30+)
claimNumber, policyNumber, homeownerName, insuredName, adjusterName, adjusterEmail, adjusterPhone, iaFirm, carrier, vendor, propertyAddress, city, state, zipCode, dateOfLoss, inspectionDate, estimateDate, denialDate, approvalDate, paymentDate, rcv, acv, deductible, recoverableDepreciation, supplementRequested, supplementApproved, denialReason, initialOutcome, finalOutcome, denialOverturned, missingScopeItems[], codeItems[], reinspectionReferences[], escalationReferences[], timelineEvents[]

## Why
- pdf-parse must use `require("pdf-parse")` not ESM import (CJS module)
- Text must be >80 chars to trigger LLM (avoids wasting tokens on empty files)
- Extraction is non-blocking: failure only sets extractionStatus="failed", upload still succeeds
- apply-extraction maps extraction keys → InsertClaim keys (rcv→rcvAmount, acv→acvAmount etc.)
- File must be matched to a claim before apply-extraction will work (400 if no claimId)

## extractedJson shape
```json
{ "entities": [...rule-based...], "extraction": {...ExtractionResult...} }
```
