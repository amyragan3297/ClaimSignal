import { Router, Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import { storage } from "./storage";
import { createCandidatesFromText } from "./timeline-extraction";
import { isMaster, canViewUnmasked, applyPiiMasking } from "./masking";
import { extractClaimFieldsFromText, isOpenAIConfigured, recordAiError, type ExtractionResult } from "./ai-services";

interface AuthRequest extends Request {
  auth?: {
    userId: string;
    organizationId: string;
    role: string;
    email: string;
  };
}

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const router = Router();

function computeSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function detectFileType(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop();
  const map: Record<string, string> = {
    pdf: "pdf", jpg: "image", jpeg: "image", png: "image", gif: "image",
    doc: "docx", docx: "docx", eml: "eml", msg: "msg", txt: "txt"
  };
  return map[ext || ""] || "other";
}

function classifyDocument(text: string): { category: string; confidence: number } {
  const lower = text.toLowerCase();
  
  const patterns: Array<{ category: string; keywords: string[]; weight: number }> = [
    { category: "denial_letter", keywords: ["denial", "we regret to inform", "not covered", "coverage does not apply", "excluded"], weight: 0.9 },
    { category: "estimate", keywords: ["rcv", "acv", "estimate", "xactimate", "line item"], weight: 0.8 },
    { category: "scope", keywords: ["scope of work", "scope of loss", "scope of damage"], weight: 0.85 },
    { category: "supplement", keywords: ["supplement", "additional payment", "revised estimate", "supplemental"], weight: 0.85 },
    { category: "payment_letter", keywords: ["payment", "check", "issued", "amount enclosed", "draft enclosed"], weight: 0.8 },
    { category: "invoice", keywords: ["invoice", "bill to", "amount due", "total due"], weight: 0.75 },
    { category: "photo_report", keywords: ["photo report", "inspection photos", "damage photos"], weight: 0.7 },
    { category: "policy", keywords: ["policy", "declarations page", "coverage limits", "endorsement"], weight: 0.75 },
    { category: "email_thread", keywords: ["from:", "to:", "subject:", "re:", "sent:"], weight: 0.7 },
  ];

  let bestMatch = { category: "unknown", confidence: 0.3 };
  for (const p of patterns) {
    const matchCount = p.keywords.filter(k => lower.includes(k)).length;
    if (matchCount > 0) {
      const confidence = Math.min(p.weight * (matchCount / p.keywords.length) + 0.2 * matchCount, 1.0);
      if (confidence > bestMatch.confidence) {
        bestMatch = { category: p.category, confidence: Number(confidence.toFixed(2)) };
      }
    }
  }
  return bestMatch;
}

function extractEntities(text: string): Array<{ entityType: string; rawValue: string; confidence: number }> {
  const entities: Array<{ entityType: string; rawValue: string; confidence: number }> = [];
  
  const claimPatterns = [/claim\s*#?\s*[:.]?\s*([A-Z0-9\-]+)/gi, /claim\s+number\s*[:.]?\s*([A-Z0-9\-]+)/gi];
  for (const p of claimPatterns) {
    const m = p.exec(text);
    if (m) entities.push({ entityType: "claim_number", rawValue: m[1], confidence: 0.8 });
  }
  
  const policyMatch = /policy\s*#?\s*[:.]?\s*([A-Z0-9\-]+)/gi.exec(text);
  if (policyMatch) entities.push({ entityType: "policy_number", rawValue: policyMatch[1], confidence: 0.8 });
  
  const rcvMatch = /rcv\s*[:.]?\s*\$?([\d,]+\.?\d*)/gi.exec(text);
  if (rcvMatch) entities.push({ entityType: "rcv", rawValue: rcvMatch[1].replace(/,/g, ""), confidence: 0.85 });
  
  const acvMatch = /acv\s*[:.]?\s*\$?([\d,]+\.?\d*)/gi.exec(text);
  if (acvMatch) entities.push({ entityType: "acv", rawValue: acvMatch[1].replace(/,/g, ""), confidence: 0.85 });
  
  const deductMatch = /deductible\s*[:.]?\s*\$?([\d,]+\.?\d*)/gi.exec(text);
  if (deductMatch) entities.push({ entityType: "deductible", rawValue: deductMatch[1].replace(/,/g, ""), confidence: 0.8 });
  
  const dolMatch = /date\s+of\s+loss\s*[:.]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi.exec(text);
  if (dolMatch) entities.push({ entityType: "date_of_loss", rawValue: dolMatch[1], confidence: 0.85 });
  
  const inspMatch = /inspection\s+date\s*[:.]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi.exec(text);
  if (inspMatch) entities.push({ entityType: "inspection_date", rawValue: inspMatch[1], confidence: 0.8 });
  
  const adjMatch = /adjuster\s*[:.]?\s*([A-Z][a-z]+ [A-Z][a-z]+)/g.exec(text);
  if (adjMatch) entities.push({ entityType: "adjuster_name", rawValue: adjMatch[1], confidence: 0.7 });
  
  const insuredMatch = /insured\s*[:.]?\s*([A-Z][a-z]+ [A-Z][a-z]+)/g.exec(text);
  if (insuredMatch) entities.push({ entityType: "insured_name", rawValue: insuredMatch[1], confidence: 0.75 });
  
  const addrMatch = /property\s+address\s*[:.]?\s*(.+?)(?:\n|$)/gi.exec(text);
  if (addrMatch) entities.push({ entityType: "property_address", rawValue: addrMatch[1].trim(), confidence: 0.7 });

  const carrierMatch = /(?:carrier|insurer|insurance\s+company)\s*[:.]?\s*([A-Z][A-Za-z&.,'\- ]{2,40}?)(?:\n|$)/g.exec(text);
  if (carrierMatch) entities.push({ entityType: "carrier_name", rawValue: carrierMatch[1].trim(), confidence: 0.65 });

  return entities;
}

// extracted_entities.entity_type is a DB enum; carrier_name is used only for
// in-memory matching, so it must be filtered out before persistence.
const PERSISTABLE_ENTITY_TYPES = new Set([
  "claim_number", "policy_number", "adjuster_name", "adjuster_email", "adjuster_phone",
  "insured_name", "property_address", "date_of_loss", "inspection_date", "determination_date",
  "payment_date", "rcv", "acv", "deductible", "depreciation", "supplement_amount",
  "check_amount", "coverage_type",
]);

type Entity = { entityType: string; rawValue: string; confidence: number };
type ClaimLike = Awaited<ReturnType<typeof storage.getClaims>>[number];

export interface MatchCandidate {
  claimId: string;
  score: number;
  reasons: string[];
}

const HIGH_CONFIDENCE = 0.7;
const REVIEW_CONFIDENCE = 0.4;

function matchConfidenceLabel(score: number): string {
  if (score >= HIGH_CONFIDENCE) return "Suggested match found.";
  if (score >= REVIEW_CONFIDENCE) return "Match needs review.";
  return "No matching claim found. Create new claim or save as draft.";
}

function norm(v: string | null | undefined): string {
  return (v || "").toLowerCase().trim();
}

// Rule-based MVP scoring across multiple signals. Returns a 0..1 confidence
// plus human-readable reasons. Never fabricates — only scores real overlaps.
function scoreClaimMatch(claim: ClaimLike, entities: Entity[], fileName: string): { score: number; reasons: string[] } {
  const get = (t: string) => entities.find(e => e.entityType === t)?.rawValue;
  const fname = norm(fileName);
  let score = 0;
  const reasons: string[] = [];

  const claimNum = get("claim_number");
  if (claimNum && claim.claimNumber && norm(claim.claimNumber) === norm(claimNum)) {
    score += 0.6;
    reasons.push(`Claim number ${claimNum} matches`);
  }

  const policyNum = get("policy_number");
  if (policyNum && claim.policyNumber && norm(claim.policyNumber) === norm(policyNum)) {
    score += 0.4;
    reasons.push("Policy number matches");
  }

  const insured = get("insured_name");
  const claimName = claim.insuredName || claim.homeownerName || "";
  if (insured && claimName && norm(claimName).includes(norm(insured))) {
    score += 0.25;
    reasons.push("Homeowner / insured name matches");
  }

  const addr = get("property_address");
  const claimAddr = claim.propertyAddress || claim.address || "";
  if (addr && claimAddr && norm(claimAddr).slice(0, 14).includes(norm(addr).slice(0, 14))) {
    score += 0.2;
    reasons.push("Property address matches");
  }

  const carrier = get("carrier_name");
  if (carrier && claim.carrier && norm(claim.carrier).includes(norm(carrier))) {
    score += 0.15;
    reasons.push("Carrier matches");
  }

  const dol = get("date_of_loss");
  if (dol && claim.dateOfLoss) {
    const d = new Date(dol);
    const claimDol = new Date(claim.dateOfLoss);
    if (!isNaN(d.getTime()) && !isNaN(claimDol.getTime()) &&
        Math.abs(d.getTime() - claimDol.getTime()) < 1000 * 60 * 60 * 24 * 2) {
      score += 0.15;
      reasons.push("Date of loss matches");
    }
  }

  if (claim.claimNumber && fname.includes(norm(claim.claimNumber)) && norm(claim.claimNumber).length > 3) {
    score += 0.2;
    reasons.push("Claim number appears in file name");
  }
  const lastName = norm(claimName).split(" ").pop();
  if (lastName && lastName.length > 2 && fname.includes(lastName)) {
    score += 0.1;
    reasons.push("Homeowner name appears in file name");
  }

  return { score: Math.min(score, 1), reasons };
}

// Rank a pool of claims for a file by match score, best first.
function rankClaimMatches(claims: ClaimLike[], entities: Entity[], fileName: string): MatchCandidate[] {
  return claims
    .map(claim => {
      const { score, reasons } = scoreClaimMatch(claim, entities, fileName);
      return { claimId: claim.id, score: Number(score.toFixed(2)), reasons };
    })
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);
}

// Returns the best claim id ONLY if confidence is high; otherwise null so the
// file is left unmatched for review (never force a bad match).
function autoMatchClaim(
  claims: ClaimLike[],
  entities: Entity[],
  fileName: string
): MatchCandidate | null {
  const ranked = rankClaimMatches(claims, entities, fileName);
  const best = ranked[0];
  if (best && best.score >= HIGH_CONFIDENCE) return best;
  return null;
}

// Master sees all claims cross-tenant; everyone else is scoped to their org.
async function getClaimPool(role: string, orgId: string): Promise<ClaimLike[]> {
  return isMaster(role) ? storage.getAllClaimsAcrossTenants() : storage.getClaims(orgId);
}

async function generateTimelineEvents(
  claimId: string,
  orgId: string,
  evidenceFileId: string,
  docCategory: string,
  entities: Array<{ entityType: string; rawValue: string; confidence: number }>,
  userId: string
) {
  await storage.createTimelineEvent({
    claimId,
    organizationId: orgId,
    eventType: "doc_uploaded",
    title: "Document Uploaded",
    description: `Document classified as ${docCategory}`,
    evidenceFileId,
    createdByUserId: userId,
  });
  
  if (docCategory === "denial_letter") {
    const detDate = entities.find(e => e.entityType === "determination_date");
    await storage.createTimelineEvent({
      claimId,
      organizationId: orgId,
      eventType: "denial",
      eventDate: detDate ? new Date(detDate.rawValue) : new Date(),
      title: "Denial Received",
      description: "Denial letter detected in uploaded evidence",
      evidenceFileId,
      createdByUserId: userId,
    });
  }
  
  if (docCategory === "payment_letter") {
    await storage.createTimelineEvent({
      claimId,
      organizationId: orgId,
      eventType: "payment_issued",
      title: "Payment Issued",
      description: "Payment letter detected in uploaded evidence",
      evidenceFileId,
      createdByUserId: userId,
    });
  }
  
  if (docCategory === "supplement") {
    await storage.createTimelineEvent({
      claimId,
      organizationId: orgId,
      eventType: "supplement_submitted",
      title: "Supplement Submitted",
      description: "Supplement document detected",
      evidenceFileId,
      createdByUserId: userId,
    });
  }
  
  const inspDate = entities.find(e => e.entityType === "inspection_date");
  if (inspDate) {
    await storage.createTimelineEvent({
      claimId,
      organizationId: orgId,
      eventType: "inspection",
      eventDate: new Date(inspDate.rawValue),
      title: "Inspection",
      description: `Inspection date detected: ${inspDate.rawValue}`,
      evidenceFileId,
      createdByUserId: userId,
    });
  }
}

router.post("/upload", upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    
    const { organizationId, userId } = req.auth;
    const buffer = req.file.buffer;
    const sha256 = computeSha256(buffer);
    
    const existing = await storage.getEvidenceFileBySha256(sha256, organizationId);
    if (existing) {
      return res.status(409).json({
        message: "This document already exists",
        existingFile: existing,
        duplicate: true,
      });
    }
    
    const fileType = detectFileType(req.file.originalname);
    
    let textContent = "";
    if (fileType === "txt" || fileType === "eml") {
      textContent = buffer.toString("utf-8");
    } else if (fileType === "pdf") {
      try {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        try {
          const pdfData = await parser.getText();
          textContent = pdfData.text || "";
        } finally {
          await parser.destroy().catch(() => {});
        }
      } catch (pdfErr: unknown) {
        console.error("[pdf-parse] failed to extract text:", (pdfErr as Error)?.message);
      }
    }
    
    const classification = classifyDocument(textContent);
    const entities = extractEntities(textContent);

    // ── Debug logging (all PDFs + any file matching DEBUG_EXTRACTION env) ──
    const debugExtraction = fileType === "pdf" || process.env.DEBUG_EXTRACTION === "true";
    if (debugExtraction) {
      console.log(`[extraction-debug] file="${req.file.originalname}" fileType=${fileType} sha256=${sha256.slice(0, 12)}`);
      console.log(`[extraction-debug] text_length=${textContent.length}`);
      if (textContent.length > 0) {
        console.log(`[extraction-debug] text_preview=\n${textContent.slice(0, 2000)}`);
      } else {
        console.log(`[extraction-debug] text_preview=(empty — pdf-parse extracted nothing)`);
      }
    }

    // ── LLM field extraction (runs after rule-based, non-blocking on failure) ──
    let llmExtraction: ExtractionResult | null = null;
    let llmExtractionError: string | null = null;
    if (isOpenAIConfigured() && textContent && textContent.trim().length > 80) {
      try {
        llmExtraction = await extractClaimFieldsFromText(textContent, classification.category);
        console.log(`[ai-extraction] success for ${req.file.originalname}, confidence=${llmExtraction.confidence}`);
        if (debugExtraction) {
          console.log(`[extraction-debug] llm_result=${JSON.stringify(llmExtraction)}`);
        }
      } catch (aiErr) {
        llmExtractionError = (aiErr as Error)?.message ?? "unknown error";
        recordAiError("extractClaimFieldsFromText/upload", aiErr);
        console.error("[ai-extraction] non-fatal:", llmExtractionError);
      }
    } else if (!textContent || textContent.trim().length <= 80) {
      llmExtractionError = "Document uploaded but text extraction failed.";
      if (isOpenAIConfigured()) {
        console.log(`[ai-extraction] skipped for ${req.file.originalname} — no readable text content (fileType=${fileType})`);
      }
    } else {
      llmExtractionError = "Document uploaded but AI structured extraction failed.";
    }

    // Pre-selected claim wins; otherwise attempt high-confidence auto-match.
    const claimPool = await getClaimPool(req.auth.role, organizationId);
    let claimId: string | null = req.body.claimId || null;
    let autoMatch: MatchCandidate | null = null;
    if (!claimId) {
      autoMatch = autoMatchClaim(claimPool, entities, req.file.originalname);
      if (autoMatch) claimId = autoMatch.claimId;
    }
    // Build a ranked list for confidence reporting (best candidate even if below
    // the auto-assign threshold, so the UI can say "needs review").
    const ranked = rankClaimMatches(claimPool, entities, req.file.originalname);
    const bestScore = ranked[0]?.score ?? 0;

    const matchedClaim = claimId ? claimPool.find(c => c.id === claimId) : undefined;
    const timelineOrgId = matchedClaim?.organizationId || organizationId;

    const evidenceFile = await storage.createEvidenceFile({
      organizationId,
      uploadedByUserId: userId,
      claimId: claimId || undefined,
      sourceType: "upload",
      fileName: req.file.originalname,
      fileType: fileType as "pdf" | "image" | "docx" | "eml" | "msg" | "txt" | "other",
      sha256,
      fileSize: buffer.length,
      docCategory: classification.category as "denial_letter" | "estimate" | "scope" | "supplement" | "payment_letter" | "invoice" | "photo_report" | "policy" | "email_thread" | "unknown",
      confidence: classification.confidence,
      extractionStatus: llmExtraction ? "complete" : (textContent && textContent.trim().length > 80 ? "failed" : (fileType === "pdf" || fileType === "docx" || fileType === "image" ? "failed" : "pending")),
      extractedJson: (entities.length > 0 || llmExtraction)
        ? { entities, extraction: llmExtraction || null }
        : undefined,
    });
    
    for (const entity of entities) {
      if (!PERSISTABLE_ENTITY_TYPES.has(entity.entityType)) continue;
      await storage.createExtractedEntity({
        evidenceFileId: evidenceFile.id,
        claimId: claimId || undefined,
        entityType: entity.entityType as "claim_number" | "policy_number" | "adjuster_name" | "adjuster_email" | "adjuster_phone" | "insured_name" | "property_address" | "date_of_loss" | "inspection_date" | "determination_date" | "payment_date" | "rcv" | "acv" | "deductible" | "depreciation" | "supplement_amount" | "check_amount" | "coverage_type",
        rawValue: entity.rawValue,
        normalizedValue: entity.rawValue,
        confidence: entity.confidence,
      });
    }
    
    if (claimId) {
      await generateTimelineEvents(claimId, timelineOrgId, evidenceFile.id, classification.category, entities, userId);
      // AI date-extraction MVP: derive event-dated timeline candidates from the
      // document text. Low-confidence dates become needsReview candidates. Never
      // allowed to break the upload pipeline.
      if (textContent && textContent.trim()) {
        try {
          await createCandidatesFromText({
            text: textContent,
            claimId,
            orgId: timelineOrgId,
            createdByUserId: userId,
            sourceDocumentId: evidenceFile.id,
            sourceHint: classification.category === "denial_letter" ? "letter_date" : undefined,
          });
        } catch (extractErr: unknown) {
          console.error("[timeline-extraction] non-fatal:", (extractErr as Error)?.message);
        }
      }
    }

    // ── Auto-apply LLM extraction to matched claim ──────────────────────────
    // When extraction succeeds and the file is linked to a claim (pre-selected
    // or auto-matched), write extracted fields directly to the claim record so
    // the claim detail page reflects all document data without requiring a
    // separate manual "Apply" step in the Evidence UI.
    let autoAppliedFields: string[] = [];
    if (claimId && matchedClaim && llmExtraction) {
      const APPLY_FIELD_MAP: Record<string, string> = {
        claimNumber:              "claimNumber",
        policyNumber:             "policyNumber",
        homeownerName:            "homeownerName",
        insuredName:              "insuredName",
        carrier:                  "carrier",
        propertyAddress:          "propertyAddress",
        city:                     "city",
        state:                    "state",
        zipCode:                  "zipCode",
        dateOfLoss:               "dateOfLoss",
        inspectionDate:           "inspectionDate",
        rcv:                      "rcvAmount",
        acv:                      "acvAmount",
        deductible:               "deductible",
        supplementRequested:      "supplementRequested",
        supplementApproved:       "supplementApproved",
        recoverableDepreciation:  "recoverableDepreciation",
        denialReason:             "denialReason",
        initialOutcome:           "initialOutcome",
        finalOutcome:             "finalOutcome",
        iaFirm:                   "iaFirm",
        adjusterName:             "adjusterName",
        adjusterPhone:            "adjusterPhone",
        adjusterEmail:            "adjusterEmail",
      };
      const DATE_APPLY_KEYS = new Set(["dateOfLoss", "inspectionDate"]);
      const NUMERIC_APPLY_KEYS = new Set([
        "rcv", "acv", "deductible", "supplementRequested",
        "supplementApproved", "recoverableDepreciation",
      ]);

      const claimUpdate: Record<string, string | Date> = {};
      const ex = llmExtraction as Record<string, string>;
      for (const [exKey, claimKey] of Object.entries(APPLY_FIELD_MAP)) {
        const raw = ex[exKey];
        if (!raw || String(raw).trim() === "") continue;
        const val = String(raw).trim();
        if (DATE_APPLY_KEYS.has(exKey)) {
          const d = new Date(val);
          if (!isNaN(d.getTime())) claimUpdate[claimKey] = d;
        } else if (NUMERIC_APPLY_KEYS.has(exKey)) {
          const n = parseFloat(val.replace(/[$,\s]/g, ""));
          if (!isNaN(n)) claimUpdate[claimKey] = String(n);
        } else {
          // Only apply if claim field is currently blank/null — never overwrite
          // a field the user has already filled in manually.
          const existingVal = (matchedClaim as Record<string, unknown>)[claimKey];
          if (existingVal == null || existingVal === "") {
            claimUpdate[claimKey] = val;
          }
        }
      }

      if (Object.keys(claimUpdate).length > 0) {
        try {
          await storage.updateClaim(claimId, matchedClaim.organizationId, claimUpdate as Partial<import("@shared/schema").InsertClaim>);
          autoAppliedFields = Object.keys(claimUpdate);
          console.log(`[ai-auto-apply] applied ${autoAppliedFields.length} fields to claim ${claimId} from "${req.file!.originalname}": ${autoAppliedFields.join(", ")}`);
          if (debugExtraction) {
            console.log(`[extraction-debug] auto_apply_payload=${JSON.stringify(claimUpdate)}`);
          }
        } catch (applyErr: unknown) {
          console.error(`[ai-auto-apply] non-fatal — failed to apply extraction to claim ${claimId}:`, (applyErr as Error)?.message);
        }
      } else {
        console.log(`[ai-auto-apply] no new fields to apply for claim ${claimId} from "${req.file!.originalname}" (all fields already populated)`);
      }
    }

    // Only create a Claim Draft when extraction finds at least one meaningful
    // claim indicator. Do NOT create a draft just because a file was uploaded.
    let draft = null;
    if (!claimId) {
      const claimNum = entities.find(e => e.entityType === "claim_number");
      const insured = entities.find(e => e.entityType === "insured_name");
      const addr = entities.find(e => e.entityType === "property_address");
      const carrier = entities.find(e => e.entityType === "carrier_name");
      const dol = entities.find(e => e.entityType === "date_of_loss");

      // LLM extraction supplements rule-based entities for richer indicators
      const llmCn = llmExtraction?.claimNumber;
      const llmInsured = llmExtraction?.homeownerName || llmExtraction?.insuredName;
      const llmAddr = llmExtraction?.propertyAddress;
      const llmCarrier = llmExtraction?.carrier;
      const llmAdjuster = llmExtraction?.adjusterName;
      const llmDol = llmExtraction?.dateOfLoss;
      const llmRcv = llmExtraction?.rcv;

      const hasClaimIndicators = !!(
        claimNum || insured || addr || carrier || dol ||
        llmCn || llmInsured || llmAddr || llmCarrier || llmAdjuster || llmRcv
      );

      if (hasClaimIndicators) {
        const dolRaw = dol?.rawValue || llmDol;
        const dolDate = dolRaw ? new Date(dolRaw) : null;
        draft = await storage.createClaimDraft({
          organizationId,
          createdFromEvidenceFileId: evidenceFile.id,
          extractedClaimNumber: claimNum?.rawValue || llmCn || undefined,
          extractedInsured: insured?.rawValue || llmInsured || undefined,
          extractedAddress: addr?.rawValue || llmAddr || undefined,
          extractedCarrier: carrier?.rawValue || llmCarrier || undefined,
          extractedAdjuster: llmAdjuster || undefined,
          extractionConfidence: llmExtraction?.confidence ?? undefined,
          sourceFileName: req.file!.originalname,
          extractedDateOfLoss: dolDate && !isNaN(dolDate.getTime()) ? dolDate : undefined,
        });
      }
    }
    
    await storage.createAuditLog({
      organizationId,
      actorUserId: userId,
      actorRole: req.auth.role,
      actionType: "EVIDENCE_UPLOADED",
      entityType: "evidence_file",
      entityId: evidenceFile.id,
      afterJson: { fileName: req.file.originalname, docCategory: classification.category, claimId },
    });

    // Audit the auto-match attempt and its outcome (additive, never fabricated).
    await storage.createAuditLog({
      organizationId,
      actorUserId: userId,
      actorRole: req.auth.role,
      actionType: claimId && autoMatch ? "EVIDENCE_AUTO_MATCH_ACCEPTED" : "EVIDENCE_AUTO_MATCH_ATTEMPTED",
      entityType: "evidence_file",
      entityId: evidenceFile.id,
      afterJson: {
        matchedClaimId: claimId,
        autoMatched: !!autoMatch,
        bestScore,
        reasons: ranked[0]?.reasons || [],
        confidenceLabel: matchConfidenceLabel(bestScore),
      },
    });
    
    res.json({
      file: evidenceFile,
      entities,
      extraction: llmExtraction,
      extractionError: llmExtractionError,
      classification,
      matchedClaimId: claimId,
      autoMatched: !!autoMatch,
      matchConfidence: bestScore,
      matchConfidenceLabel: matchConfidenceLabel(bestScore),
      matchReasons: ranked[0]?.reasons || [],
      draft,
      autoAppliedFields,
    });
  } catch (err) {
    console.error("Evidence upload error:", err);
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.get("/files", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const claimId = req.query.claimId as string | undefined;
    // Master sees all evidence files across tenants; others scoped to their org.
    const files = isMaster(req.auth.role) && !claimId
      ? await storage.getAllEvidenceFilesAcrossTenants()
      : await storage.getEvidenceFiles(req.auth.organizationId, claimId);
    res.json(files);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

// Unmatched evidence files needing review. Master sees all tenants.
router.get("/files-unmatched", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const master = isMaster(req.auth.role);
    const files = await storage.getUnmatchedEvidenceFiles(
      master ? undefined : req.auth.organizationId
    );
    await storage.createAuditLog({
      organizationId: req.auth.organizationId,
      actorUserId: req.auth.userId,
      actorRole: req.auth.role,
      actionType: "EVIDENCE_UNMATCHED_VIEWED",
      entityType: "evidence_file",
      entityId: undefined,
      afterJson: { count: files.length, crossTenant: master },
    });
    res.json(files);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

// Ranked match suggestions for a file, with claim context (PII-masked per role).
router.get("/files/:id/match-suggestions", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const { role, organizationId } = req.auth;
    const file = isMaster(role)
      ? await storage.getEvidenceFileAnyTenant(req.params.id as string)
      : await storage.getEvidenceFile(req.params.id as string, organizationId);
    if (!file) return res.status(404).json({ message: "File not found" });

    const storedEntities = await storage.getExtractedEntities(req.params.id as string);
    const entities: Entity[] = storedEntities.map(e => ({
      entityType: e.entityType,
      rawValue: e.rawValue,
      confidence: e.confidence || 0,
    }));

    const claimPool = await getClaimPool(role, organizationId);
    const ranked = rankClaimMatches(claimPool, entities, file.fileName);
    const byId = new Map(claimPool.map(c => [c.id, c]));

    const unmask = canViewUnmasked(role);
    const candidates = ranked.slice(0, 10).map(r => {
      const claim = byId.get(r.claimId)!;
      const view = unmask ? claim : applyPiiMasking(claim, role);
      return {
        claimId: claim.id,
        score: r.score,
        confidenceLabel: matchConfidenceLabel(r.score),
        reasons: r.reasons,
        claimNumber: view.claimNumber,
        carrier: claim.carrier,
        homeownerName: view.homeownerName || view.insuredName || null,
        propertyLocation: [view.propertyAddress || view.address, claim.city, claim.state].filter(Boolean).join(", ") || null,
        status: claim.status,
        dateOfLoss: claim.dateOfLoss,
      };
    });

    const best = candidates[0];
    await storage.createAuditLog({
      organizationId: file.organizationId,
      actorUserId: req.auth.userId,
      actorRole: role,
      actionType: "EVIDENCE_MATCH_SUGGESTIONS_VIEWED",
      entityType: "evidence_file",
      entityId: file.id,
      afterJson: { candidateCount: candidates.length, bestScore: best?.score ?? 0, actorOrganizationId: organizationId, crossTenant: file.organizationId !== organizationId },
    });

    res.json({
      candidates,
      bestScore: best?.score ?? 0,
      confidenceLabel: matchConfidenceLabel(best?.score ?? 0),
      masked: !unmask,
    });
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.get("/files/:id", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const master = isMaster(req.auth.role);
    const file = master
      ? await storage.getEvidenceFileAnyTenant(req.params.id as string)
      : await storage.getEvidenceFile(req.params.id as string, req.auth.organizationId);
    if (!file) return res.status(404).json({ message: "File not found" });
    res.json(file);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.get("/files/:id/entities", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const entities = await storage.getExtractedEntities(req.params.id as string);
    res.json(entities);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.post("/files/:id/match", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const { role, organizationId, userId } = req.auth;
    const { claimId } = req.body;
    if (!claimId) return res.status(400).json({ message: "claimId required" });

    const master = isMaster(role);
    const file = master
      ? await storage.getEvidenceFileAnyTenant(req.params.id as string)
      : await storage.getEvidenceFile(req.params.id as string, organizationId);
    if (!file) return res.status(404).json({ message: "File not found" });

    // Verify the target claim exists and is authorized for this user.
    const claim = master
      ? await storage.getClaimAnyTenant(claimId as string)
      : await storage.getClaim(claimId as string, organizationId);
    if (!claim) return res.status(404).json({ message: "Claim not found or not authorized" });

    await storage.updateEvidenceFile(req.params.id as string, file.organizationId, { claimId });

    const entities = await storage.getExtractedEntities(req.params.id as string);
    await generateTimelineEvents(
      claimId as string,
      claim.organizationId,
      req.params.id as string,
      file.docCategory || "unknown",
      entities.map(e => ({ entityType: e.entityType, rawValue: e.rawValue, confidence: e.confidence || 0 })),
      userId
    );

    await storage.createAuditLog({
      organizationId: claim.organizationId,
      actorUserId: userId,
      actorRole: role,
      actionType: "EVIDENCE_MANUAL_MATCH",
      entityType: "evidence_file",
      entityId: file.id,
      afterJson: { claimId, claimNumber: claim.claimNumber, actorOrganizationId: organizationId, crossTenant: file.organizationId !== claim.organizationId },
    });

    res.json({ matched: true, claimId });
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

// Create a brand-new claim from an uploaded file's extracted fields, then link
// the file to it and wire adjuster/timeline/scoring intelligence.
// Accepts `fields` in body (accepted/edited extraction values from the UI) OR
// falls back to storedEntities + LLM extraction so older callers still work.
router.post("/files/:id/create-claim", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const { role, organizationId, userId } = req.auth;
    const master = isMaster(role);
    const file = master
      ? await storage.getEvidenceFileAnyTenant(req.params.id as string)
      : await storage.getEvidenceFile(req.params.id as string, organizationId);
    if (!file) return res.status(404).json({ message: "File not found" });

    const storedEntities = await storage.getExtractedEntities(req.params.id as string);
    const getEntity = (t: string) => storedEntities.find(e => e.entityType === t)?.rawValue;
    interface StoredExtractedJson { extraction?: ExtractionResult | null }
    const llmExtraction = (file.extractedJson as StoredExtractedJson | null)?.extraction ?? null;
    const llm = (k: keyof ExtractionResult): string | undefined => {
      if (!llmExtraction) return undefined;
      const v = llmExtraction[k];
      return v != null && typeof v !== "object" ? String(v) : undefined;
    };

    // Accept field-by-field accepted values from the UI, or fall back to
    // LLM extraction and rule-based entities (in that priority order).
    const accepted: Record<string, string> = req.body?.fields || {};
    const f = (fieldKey: string, entityType: string, llmKey: keyof ExtractionResult): string | undefined =>
      accepted[fieldKey]?.trim() || llm(llmKey) || getEntity(entityType) || undefined;

    const _NUMERIC_KEYS = ["rcv","acv","deductible","supplementRequested","supplementApproved","recoverableDepreciation"];
    const numericVal = (v?: string): number | undefined => {
      if (!v) return undefined;
      const n = parseFloat(v.replace(/[$,\s]/g, ""));
      return isNaN(n) ? undefined : n;
    };
    const dateVal = (v?: string) => {
      if (!v) return undefined;
      const d = new Date(v);
      return d && !isNaN(d.getTime()) ? d : undefined;
    };

    const claimNumber = f("claimNumber", "claim_number", "claimNumber") || `DRAFT-${Date.now().toString().slice(-6)}`;

    const claim = await storage.createClaim({
      organizationId: file.organizationId,
      claimNumber,
      policyNumber: f("policyNumber", "policy_number", "policyNumber"),
      homeownerName: f("homeownerName", "insured_name", "homeownerName") || llm("insuredName"),
      insuredName: f("insuredName", "insured_name", "insuredName") || llm("homeownerName"),
      carrier: f("carrier", "carrier_name", "carrier"),
      propertyAddress: f("propertyAddress", "property_address", "propertyAddress"),
      city: accepted["city"]?.trim() || llm("city"),
      state: accepted["state"]?.trim() || llm("state"),
      zipCode: accepted["zipCode"]?.trim() || llm("zipCode"),
      dateOfLoss: dateVal(f("dateOfLoss", "date_of_loss", "dateOfLoss")),
      inspectionDate: dateVal(accepted["inspectionDate"]?.trim() || llm("inspectionDate")),
      rcvAmount: numericVal(f("rcv", "rcv", "rcv")),
      acvAmount: numericVal(f("acv", "acv", "acv")),
      deductible: numericVal(f("deductible", "deductible", "deductible")),
      supplementRequested: numericVal(accepted["supplementRequested"]?.trim() || llm("supplementRequested")),
      supplementApproved: numericVal(accepted["supplementApproved"]?.trim() || llm("supplementApproved")),
      recoverableDepreciation: numericVal(accepted["recoverableDepreciation"]?.trim() || llm("recoverableDepreciation")),
      iaFirm: accepted["iaFirm"]?.trim() || llm("iaFirm"),
      vendorName: accepted["vendorName"]?.trim() || llm("vendor"),
      denialReason: accepted["denialReason"]?.trim() || llm("denialReason"),
      initialOutcome: accepted["initialOutcome"]?.trim() || llm("initialOutcome"),
      finalOutcome: accepted["finalOutcome"]?.trim() || llm("finalOutcome"),
      status: "open",
    });

    await storage.updateEvidenceFile(req.params.id as string, file.organizationId, { claimId: claim.id });

    // ── Adjuster intelligence linkage ────────────────────────────────────────
    const adjName = accepted["adjusterName"]?.trim() || llm("adjusterName");
    if (adjName) {
      try {
        const existingAdjs = await storage.getAdjusters(claim.organizationId);
        let adj = existingAdjs.find(a => a.adjusterName?.toLowerCase() === adjName.toLowerCase());
        if (!adj) {
          const carrierName = accepted["carrier"]?.trim() || llm("carrier") || "Unknown";
          adj = await storage.createAdjuster({
            organizationId: claim.organizationId,
            adjusterName: adjName,
            adjusterEmail: accepted["adjusterEmail"]?.trim() || llm("adjusterEmail") || undefined,
            adjusterPhone: accepted["adjusterPhone"]?.trim() || llm("adjusterPhone") || undefined,
            carrierName,
          });
        }
        await storage.linkAdjusterToClaim({
          claimId: claim.id,
          adjusterId: adj.id,
          organizationId: claim.organizationId,
          roleOnClaim: "primary_adjuster",
        });
      } catch (adjErr: unknown) {
        console.error("[create-claim] adjuster linking non-fatal:", (adjErr as Error)?.message);
      }
    }

    // ── Timeline events from extracted dates ─────────────────────────────────
    await generateTimelineEvents(
      claim.id,
      claim.organizationId,
      file.id,
      file.docCategory || "unknown",
      storedEntities.map(e => ({ entityType: e.entityType, rawValue: e.rawValue, confidence: e.confidence || 0 })),
      userId
    );
    // Additional timeline events from LLM dates not covered by rule-based entities
    if (llmExtraction) {
      const extraDates: Array<{ key: string; eventType: string; title: string }> = [
        { key: "inspectionDate", eventType: "inspection", title: "Inspection" },
        { key: "denialDate", eventType: "denial", title: "Denial Received" },
        { key: "approvalDate", eventType: "approval", title: "Approval Received" },
        { key: "paymentDate", eventType: "payment_issued", title: "Payment Issued" },
      ];
      for (const { key, eventType, title } of extraDates) {
        const raw = llmExtraction[key as keyof ExtractionResult];
        if (!raw || typeof raw !== "string") continue;
        const d = new Date(raw);
        if (isNaN(d.getTime())) continue;
        try {
          await storage.createTimelineEvent({
            claimId: claim.id,
            organizationId: claim.organizationId,
            eventType: eventType as "inspection" | "denial" | "approval" | "payment_issued",
            eventDate: d,
            title,
            description: `${title} date from AI extraction`,
            evidenceFileId: file.id,
            createdByUserId: userId,
          });
        } catch (_) { /* non-fatal */ }
      }
      if (llmExtraction.timelineEvents?.length) {
        for (const ev of llmExtraction.timelineEvents.slice(0, 5)) {
          const d = ev.date ? new Date(ev.date) : null;
          if (!d || isNaN(d.getTime())) continue;
          try {
            await storage.createTimelineEvent({
              claimId: claim.id,
              organizationId: claim.organizationId,
              eventType: "note",
              eventDate: d,
              title: ev.description || "Event",
              description: `AI extracted timeline: ${ev.description}`,
              evidenceFileId: file.id,
              createdByUserId: userId,
            });
          } catch (_) { /* non-fatal */ }
        }
      }
    }

    // Mark any draft for this file as merged
    const drafts = await storage.getClaimDrafts(file.organizationId);
    const draft = drafts.find(d => d.createdFromEvidenceFileId === file.id && d.status === "needs_review");
    if (draft) await storage.updateClaimDraft(draft.id, file.organizationId, { status: "merged" });

    await storage.createAuditLog({
      organizationId: claim.organizationId,
      actorUserId: userId,
      actorRole: role,
      actionType: "CLAIM_CREATED_FROM_FILE",
      entityType: "claim",
      entityId: claim.id,
      afterJson: {
        claimNumber: claim.claimNumber,
        evidenceFileId: file.id,
        adjusterLinked: !!adjName,
        fieldsAccepted: Object.keys(accepted),
        llmConfidence: llmExtraction?.confidence ?? null,
        actorOrganizationId: organizationId,
        crossTenant: file.organizationId !== organizationId,
      },
    });

    res.json({ created: true, claim });
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

// Leave a file unmatched for review: clears any claim link and ensures a draft
// exists so it appears in the review queue. Never forces a bad match.
router.post("/files/:id/unmatch", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const { role, organizationId, userId } = req.auth;
    const master = isMaster(role);
    const file = master
      ? await storage.getEvidenceFileAnyTenant(req.params.id as string)
      : await storage.getEvidenceFile(req.params.id as string, organizationId);
    if (!file) return res.status(404).json({ message: "File not found" });

    await storage.updateEvidenceFile(req.params.id as string, file.organizationId, { claimId: null });

    const storedEntities = await storage.getExtractedEntities(req.params.id as string);
    const get = (t: string) => storedEntities.find(e => e.entityType === t)?.rawValue;
    const drafts = await storage.getClaimDrafts(file.organizationId);
    let draft = drafts.find(d => d.createdFromEvidenceFileId === file.id);
    if (!draft) {
      const dolRaw = get("date_of_loss");
      const dol = dolRaw ? new Date(dolRaw) : null;
      draft = await storage.createClaimDraft({
        organizationId: file.organizationId,
        createdFromEvidenceFileId: file.id,
        extractedClaimNumber: get("claim_number"),
        extractedInsured: get("insured_name"),
        extractedAddress: get("property_address"),
        extractedDateOfLoss: dol && !isNaN(dol.getTime()) ? dol : undefined,
      });
    }

    await storage.createAuditLog({
      organizationId: file.organizationId,
      actorUserId: userId,
      actorRole: role,
      actionType: "EVIDENCE_SAVED_UNMATCHED",
      entityType: "evidence_file",
      entityId: file.id,
      afterJson: { draftId: draft?.id, actorOrganizationId: organizationId, crossTenant: file.organizationId !== organizationId },
    });

    res.json({ unmatched: true, draft });
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

// Apply LLM extraction fields to the matched claim. Only applies scalar fields
// the user accepted; arrays (scope items, code items) are informational only.
router.post("/files/:id/apply-extraction", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const { role, organizationId, userId } = req.auth;
    const master = isMaster(role);

    const file = master
      ? await storage.getEvidenceFileAnyTenant(req.params.id as string)
      : await storage.getEvidenceFile(req.params.id as string, organizationId);
    if (!file) return res.status(404).json({ message: "File not found" });
    if (!file.claimId) {
      return res.status(400).json({ message: "File must be matched to a claim before applying extraction" });
    }

    const { fields } = req.body as { fields: Record<string, string> };
    if (!fields || typeof fields !== "object") {
      return res.status(400).json({ message: "fields object required" });
    }

    const claim = master
      ? await storage.getClaimAnyTenant(file.claimId)
      : await storage.getClaim(file.claimId, file.organizationId);
    if (!claim) return res.status(404).json({ message: "Matched claim not found" });
    if (!master && claim.organizationId !== organizationId) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Map extraction keys → InsertClaim keys
    const FIELD_MAP: Record<string, string> = {
      claimNumber: "claimNumber",
      policyNumber: "policyNumber",
      homeownerName: "homeownerName",
      insuredName: "insuredName",
      carrier: "carrier",
      propertyAddress: "propertyAddress",
      city: "city",
      state: "state",
      zipCode: "zipCode",
      dateOfLoss: "dateOfLoss",
      inspectionDate: "inspectionDate",
      rcv: "rcvAmount",
      acv: "acvAmount",
      deductible: "deductible",
      supplementRequested: "supplementRequested",
      supplementApproved: "supplementApproved",
      recoverableDepreciation: "recoverableDepreciation",
      denialReason: "denialReason",
      initialOutcome: "initialOutcome",
      finalOutcome: "finalOutcome",
      iaFirm: "iaFirm",
      adjusterEmail: "adjusterEmail",
      adjusterPhone: "adjusterPhone",
    };
    const DATE_KEYS = new Set(["dateOfLoss", "inspectionDate"]);
    const NUMERIC_KEYS = new Set(["rcv", "acv", "deductible", "supplementRequested", "supplementApproved", "recoverableDepreciation"]);

    const claimUpdate: Record<string, unknown> = {};
    for (const [exKey, claimKey] of Object.entries(FIELD_MAP)) {
      const raw = fields[exKey];
      if (!raw || String(raw).trim() === "") continue;
      const val = String(raw).trim();
      if (DATE_KEYS.has(exKey)) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) claimUpdate[claimKey] = d;
      } else if (NUMERIC_KEYS.has(exKey)) {
        const n = parseFloat(val.replace(/[$,\s]/g, ""));
        if (!isNaN(n)) claimUpdate[claimKey] = String(n);
      } else {
        claimUpdate[claimKey] = val;
      }
    }

    if (Object.keys(claimUpdate).length === 0) {
      return res.status(400).json({ message: "No valid fields to apply" });
    }

    const updated = await storage.updateClaim(file.claimId, claim.organizationId, claimUpdate as Partial<import("@shared/schema").InsertClaim>);

    await storage.createAuditLog({
      organizationId: claim.organizationId,
      actorUserId: userId,
      actorRole: role,
      actionType: "AI_EXTRACTION_APPLIED",
      entityType: "claim",
      entityId: file.claimId,
      afterJson: {
        fileId: file.id,
        fileName: file.fileName,
        fieldsApplied: Object.keys(claimUpdate),
        count: Object.keys(claimUpdate).length,
        actorOrganizationId: organizationId,
      },
    });

    res.json({ claim: updated, fieldsApplied: Object.keys(claimUpdate) });
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.get("/drafts", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const master = isMaster(req.auth.role);
    const drafts = master
      ? await storage.getAllClaimDraftsAcrossTenants()
      : await storage.getClaimDrafts(req.auth.organizationId);
    res.json(drafts);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

// Archive a claim draft (sets status to "discarded", preserves record).
router.post("/drafts/:id/archive", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const { role, organizationId, userId } = req.auth;
    const master = isMaster(role);

    // Resolve org for master (draft may belong to any tenant)
    let draft = master
      ? (await storage.getAllClaimDraftsAcrossTenants()).find(d => d.id === req.params.id)
      : await storage.getClaimDraft(req.params.id as string, organizationId);
    if (!draft) return res.status(404).json({ message: "Draft not found" });

    const updated = await storage.updateClaimDraft(req.params.id as string, draft.organizationId, { status: "discarded" });

    await storage.createAuditLog({
      organizationId: draft.organizationId,
      actorUserId: userId,
      actorRole: role,
      actionType: "CLAIM_DRAFT_ARCHIVED",
      entityType: "claim_draft",
      entityId: draft.id,
      afterJson: { reason: req.body.reason || null, actorOrganizationId: organizationId },
    });

    res.json({ archived: true, draft: updated });
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.patch("/drafts/:id", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const updated = await storage.updateClaimDraft(req.params.id as string, req.auth.organizationId, req.body);
    if (!updated) return res.status(404).json({ message: "Draft not found" });
    res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

router.get("/timeline/:claimId", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const events = await storage.getTimelineEvents(req.params.claimId as string, req.auth.organizationId);
    res.json(events);
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
