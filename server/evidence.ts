import { Router, Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import { storage } from "./storage";
import { createCandidatesFromText } from "./timeline-extraction";
import { isMaster, canViewUnmasked, applyPiiMasking, maskExtractionData } from "./masking";
import { extractClaimFieldsFromText, extractClaimFieldsFromImages, transcribeAudio, isOpenAIConfigured, recordAiError, type ExtractionResult } from "./ai-services";
import { renderPdfToImages } from "./pdf-render";
import { computeFullClaimScoring } from "./scoring";
import { findOrCreateClaimFromExtraction, coerceStr, type ExtractionData } from "./claim-matching";

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

/**
 * Robustly parse a date string that may be in YYYY-MM-DD, MM/DD/YYYY,
 * M/D/YYYY, "January 15 2025", "Jan 15, 2025", or ISO 8601 format.
 * Returns null if the value cannot be confidently parsed into a valid Date.
 */
function parseFlexDate(val: string): Date | null {
  if (!val || typeof val !== "string") return null;
  const s = val.trim();
  if (!s) return null;

  // Try ISO 8601 / native parse first (handles "2025-01-15" and "2025-01-15T...")
  const direct = new Date(s);
  if (!isNaN(direct.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(s)) return direct;

  // MM/DD/YYYY or M/D/YYYY (US format)
  const mdyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const dt = new Date(iso);
    if (!isNaN(dt.getTime())) return dt;
  }

  // MM-DD-YYYY
  const mdyDashMatch = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mdyDashMatch) {
    const [, m, d, y] = mdyDashMatch;
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const dt = new Date(iso);
    if (!isNaN(dt.getTime())) return dt;
  }

  // "January 15, 2025" or "Jan 15 2025" — let JS parse spelled-out dates
  const spelled = new Date(s);
  if (!isNaN(spelled.getTime())) return spelled;

  return null;
}

const ADDRESS_CONTAMINATION_RE = /date\s+of\s+loss|date\s+of\s+damage|d\.o\.l|carrier|policy\s+#|policy\s+number|claim\s+#|claim\s+number|insured\s+name|adjuster/i;

/**
 * Validate a propertyAddress value returned by AI extraction.
 * Returns the cleaned address string, or null if the value looks contaminated
 * (contains other field keywords) or is unreasonably long.
 */
function sanitizeAddress(val: string): string | null {
  if (!val || typeof val !== "string") return null;
  const s = val.trim();
  // Reject if the string is clearly multi-field (contains Date of Loss, Carrier, etc.)
  if (ADDRESS_CONTAMINATION_RE.test(s)) return null;
  // Reject if unreasonably long (a street address should rarely exceed 120 chars)
  if (s.length > 120) return null;
  return s;
}

function detectFileType(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop();
  const map: Record<string, string> = {
    pdf: "pdf", jpg: "image", jpeg: "image", png: "image", gif: "image",
    doc: "docx", docx: "docx", eml: "eml", msg: "msg", txt: "txt",
    mp3: "audio", m4a: "audio", wav: "audio", webm: "audio",
    ogg: "audio", aac: "audio", flac: "audio", mp4: "audio",
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

// Create a fully-populated claim directly from a document's extracted data,
// link the file to it, link any adjuster, and generate timeline events.
// Used both on upload (no draft step) and by the manual create-claim route.
// Field priority: UI-accepted values > LLM extraction > rule-based entities.
async function _createClaimFromExtraction(opts: {
  fileId: string;
  fileOrganizationId: string;
  fileDocCategory: string | null | undefined;
  accepted?: Record<string, string>;
  llmExtraction: ExtractionResult | null;
  entities: Array<{ entityType: string; rawValue: string; confidence: number }>;
  userId: string;
  role: string;
  actorOrganizationId: string;
}): Promise<Awaited<ReturnType<typeof storage.createClaim>>> {
  const {
    fileId, fileOrganizationId, fileDocCategory, llmExtraction, entities,
    userId, role, actorOrganizationId,
  } = opts;
  const accepted: Record<string, string> = opts.accepted || {};

  const getEntity = (t: string) => entities.find(e => e.entityType === t)?.rawValue;
  const llm = (k: keyof ExtractionResult): string | undefined => {
    if (!llmExtraction) return undefined;
    const v = llmExtraction[k];
    return v != null && typeof v !== "object" ? String(v) : undefined;
  };
  const f = (fieldKey: string, entityType: string, llmKey: keyof ExtractionResult): string | undefined =>
    accepted[fieldKey]?.trim() || llm(llmKey) || getEntity(entityType) || undefined;
  const numericVal = (v?: string): number | undefined => {
    if (!v) return undefined;
    const n = parseFloat(v.replace(/[$,\s]/g, ""));
    return isNaN(n) ? undefined : n;
  };
  const dateVal = (v?: string) => {
    if (!v) return undefined;
    return parseFlexDate(v) ?? undefined;
  };

  const claimNumber = f("claimNumber", "claim_number", "claimNumber") || `CLM-${Date.now().toString().slice(-6)}`;

  const claim = await storage.createClaim({
    organizationId: fileOrganizationId,
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

  await storage.updateEvidenceFile(fileId, fileOrganizationId, { claimId: claim.id });

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
  await generateTimelineEvents(claim.id, claim.organizationId, fileId, fileDocCategory || "unknown", entities, userId);
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
          evidenceFileId: fileId,
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
            evidenceFileId: fileId,
            createdByUserId: userId,
          });
        } catch (_) { /* non-fatal */ }
      }
    }
  }

  await storage.createAuditLog({
    organizationId: claim.organizationId,
    actorUserId: userId,
    actorRole: role,
    actionType: "CLAIM_CREATED_FROM_FILE",
    entityType: "claim",
    entityId: claim.id,
    afterJson: {
      claimNumber: claim.claimNumber,
      evidenceFileId: fileId,
      adjusterLinked: !!adjName,
      fieldsAccepted: Object.keys(accepted),
      llmConfidence: llmExtraction?.confidence ?? null,
      actorOrganizationId,
      crossTenant: fileOrganizationId !== actorOrganizationId,
    },
  });

  return claim;
}

router.post("/upload", upload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    
    const { organizationId, userId } = req.auth;
    const buffer = req.file.buffer;
    const sha256 = computeSha256(buffer);
    
    const existing = await storage.getEvidenceFileBySha256(sha256, organizationId);
    if (existing && existing.claimId === req.body.claimId) {
      return res.status(409).json({
        message: "This document already exists on this claim",
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
    } else if (fileType === "audio") {
      if (isOpenAIConfigured()) {
        try {
          textContent = await transcribeAudio(buffer);
          console.log(`[audio-transcribe] file="${req.file!.originalname}" transcript_length=${textContent.length}`);
        } catch (audioErr: unknown) {
          console.error("[audio-transcribe] non-fatal:", (audioErr as Error)?.message);
        }
      } else {
        console.log(`[audio-transcribe] skipped — OpenAI not configured`);
      }
    }
    
    const classification = classifyDocument(textContent);
    const entities = extractEntities(textContent);

    // ── Diagnostics ──────────────────────────────────────────────────────────
    // The length-only line is PII-safe and is logged for PDFs to help diagnose
    // the text-vs-vision branch. The raw text preview and LLM result can contain
    // homeowner PII, so they are gated behind the explicit DEBUG_EXTRACTION flag.
    const debugExtraction = process.env.DEBUG_EXTRACTION === "true";
    if (fileType === "pdf" || debugExtraction) {
      console.log(`[extraction] file="${req.file.originalname}" fileType=${fileType} text_length=${textContent.length}`);
    }
    if (debugExtraction && textContent.length > 0) {
      console.log(`[extraction-debug] text_preview=\n${textContent.slice(0, 2000)}`);
    }

    // ── LLM field extraction (runs after rule-based, non-blocking on failure) ──
    let llmExtraction: ExtractionResult | null = null;
    let llmExtractionError: string | null = null;
    const hasText = !!textContent && textContent.trim().length > 80;
    // Trust the upload's MIME type too, so image formats that detectFileType maps
    // to "other" (bmp/tiff/webp) still get the vision fallback.
    const isImageUpload = fileType === "image" || !!req.file.mimetype?.startsWith("image/");
    // Scanned PDFs and photographed/image documents have no text layer, so
    // pdf-parse returns nothing. Fall back to vision OCR on the rendered pages.
    const needsVision = !hasText && (fileType === "pdf" || isImageUpload);

    if (isOpenAIConfigured() && hasText) {
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
    } else if (isOpenAIConfigured() && needsVision) {
      try {
        let images: string[] = [];
        if (fileType === "pdf") {
          images = await renderPdfToImages(buffer);
        } else {
          const mime = req.file.mimetype && req.file.mimetype.startsWith("image/")
            ? req.file.mimetype
            : "image/jpeg";
          images = [`data:${mime};base64,${buffer.toString("base64")}`];
        }
        if (images.length === 0) {
          llmExtractionError = "Document uploaded but no readable pages could be rendered.";
          console.log(`[ai-extraction] vision skipped for ${req.file.originalname} — 0 pages rendered`);
        } else {
          llmExtraction = await extractClaimFieldsFromImages(images, classification.category);
          console.log(`[ai-extraction] vision success for ${req.file.originalname}, pages=${images.length}, confidence=${llmExtraction.confidence}`);
          if (debugExtraction) {
            console.log(`[extraction-debug] vision_result=${JSON.stringify(llmExtraction)}`);
          }
        }
      } catch (aiErr) {
        llmExtractionError = (aiErr as Error)?.message ?? "unknown error";
        recordAiError("extractClaimFieldsFromImages/upload", aiErr);
        console.error("[ai-extraction] vision non-fatal:", llmExtractionError);
      }
    } else if (!isOpenAIConfigured()) {
      llmExtractionError = "AI extraction unavailable — integration not configured.";
    } else if (!hasText) {
      llmExtractionError = "Document uploaded but text extraction failed.";
      console.log(`[ai-extraction] skipped for ${req.file.originalname} — no readable text content (fileType=${fileType})`);
    } else {
      llmExtractionError = "Document uploaded but AI structured extraction failed.";
    }

    // When rule-based classification found nothing (e.g. a scanned PDF with no
    // text layer), promote the document type identified by vision extraction.
    const VALID_DOC_CATEGORIES = new Set([
      "denial_letter", "estimate", "scope", "supplement", "payment_letter",
      "invoice", "photo_report", "policy", "email_thread", "unknown",
    ]);
    let effectiveCategory = classification.category;
    const visionDocType = llmExtraction?.documentType;
    if (
      effectiveCategory === "unknown" &&
      visionDocType && visionDocType !== "other" &&
      VALID_DOC_CATEGORIES.has(visionDocType)
    ) {
      effectiveCategory = visionDocType;
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
      fileType: (fileType === "audio" ? "other" : fileType) as "pdf" | "image" | "docx" | "eml" | "msg" | "txt" | "other",
      sha256,
      fileSize: buffer.length,
      docCategory: effectiveCategory as "denial_letter" | "estimate" | "scope" | "supplement" | "payment_letter" | "invoice" | "photo_report" | "policy" | "email_thread" | "unknown",
      confidence: classification.confidence,
      extractionStatus: llmExtraction ? "complete" : (!isOpenAIConfigured() ? "pending" : (textContent && textContent.trim().length > 80 ? "failed" : (fileType === "pdf" || fileType === "docx" || fileType === "image" ? "failed" : "pending"))),
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
      await generateTimelineEvents(claimId, timelineOrgId, evidenceFile.id, effectiveCategory, entities, userId);
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
        supplementTotal:          "supplementAmountTotal",
        recoverableDepreciation:  "recoverableDepreciation",
        approvedAmount:           "approvedAmount",
        claimAmount:              "claimAmount",
        finalPaid:                "finalPaidAmount",
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
        "supplementApproved", "supplementTotal", "recoverableDepreciation",
        "approvedAmount", "claimAmount", "finalPaid",
      ]);

      const claimUpdate: Record<string, string | number | Date> = {};
      const ex = llmExtraction as unknown as Record<string, unknown>;
      for (const [exKey, claimKey] of Object.entries(APPLY_FIELD_MAP)) {
        const raw = ex[exKey];
        if (raw == null || String(raw).trim() === "") continue;
        const val = String(raw).trim();
        if (DATE_APPLY_KEYS.has(exKey)) {
          const d = parseFlexDate(val);
          if (d) claimUpdate[claimKey] = d;
        } else if (NUMERIC_APPLY_KEYS.has(exKey)) {
          const n = parseFloat(val.replace(/[$,\s]/g, ""));
          if (!isNaN(n)) claimUpdate[claimKey] = n;
        } else if (exKey === "propertyAddress") {
          // Sanitize address — reject contaminated/oversized values
          const existingVal = (matchedClaim as Record<string, unknown>)[claimKey];
          if (existingVal == null || existingVal === "") {
            const clean = sanitizeAddress(val);
            if (clean) claimUpdate[claimKey] = clean;
          }
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
          // Re-compute intelligence scores now that claim fields are fresher.
          // Non-blocking — a scoring failure must never fail the upload.
          computeFullClaimScoring(claimId, matchedClaim.organizationId)
            .then(scores => storage.updateClaim(claimId!, matchedClaim.organizationId, {
              frictionScore: Math.round(scores.claimFrictionScore),
            } as Partial<import("@shared/schema").InsertClaim>))
            .catch((scoreErr: unknown) => console.error("[scoring-auto] non-fatal:", (scoreErr as Error)?.message));
        } catch (applyErr: unknown) {
          console.error(`[ai-auto-apply] non-fatal — failed to apply extraction to claim ${claimId}:`, (applyErr as Error)?.message);
        }
      } else {
        console.log(`[ai-auto-apply] no new fields to apply for claim ${claimId} from "${req.file!.originalname}" (all fields already populated)`);
      }
    }

    // ── Adjuster extraction + AI-staleness clear for existing-claim uploads ──
    // Runs whenever a document is attached to an existing claim, regardless of
    // whether LLM extraction succeeded. Adjuster linkage is best-effort; the
    // AI analysis clear always runs so the next claim-detail load reruns the
    // suggestion rather than serving a suggestion that predates the new evidence.
    let adjusterAutoLinked = false;
    let adjusterAutoLinkedName: string | null = null;
    if (claimId && matchedClaim) {
      // Adjuster auto-link (only when extraction produced a name)
      if (llmExtraction) {
        const adjName = (llmExtraction as unknown as Record<string, unknown>)["adjusterName"];
        if (adjName && typeof adjName === "string" && adjName.trim()) {
          const adjNameStr = adjName.trim();
          try {
            const existingAdjs = await storage.getAdjusters(matchedClaim.organizationId);
            let adj = existingAdjs.find(a => a.adjusterName?.toLowerCase() === adjNameStr.toLowerCase());
            if (!adj) {
              const adjEmail = (llmExtraction as unknown as Record<string, unknown>)["adjusterEmail"];
              const adjPhone = (llmExtraction as unknown as Record<string, unknown>)["adjusterPhone"];
              const carrierName = (llmExtraction as unknown as Record<string, unknown>)["carrier"];
              adj = await storage.createAdjuster({
                organizationId: matchedClaim.organizationId,
                adjusterName: adjNameStr,
                adjusterEmail: typeof adjEmail === "string" && adjEmail.trim() ? adjEmail.trim() : undefined,
                adjusterPhone: typeof adjPhone === "string" && adjPhone.trim() ? adjPhone.trim() : undefined,
                carrierName: typeof carrierName === "string" && carrierName.trim() ? carrierName.trim() : (matchedClaim.carrier ?? "Unknown"),
              });
              console.log(`[adjuster-extract] created adjuster "${adjNameStr}" from upload on existing claim ${claimId}`);
            }
            await storage.linkAdjusterToClaim({
              claimId,
              adjusterId: adj.id,
              organizationId: matchedClaim.organizationId,
              roleOnClaim: "primary_adjuster",
              sourceType: "document",
              sourceDocumentId: evidenceFile.id,
            });
            adjusterAutoLinked = true;
            adjusterAutoLinkedName = adjNameStr;
            console.log(`[adjuster-extract] linked adjuster "${adjNameStr}" to existing claim ${claimId}`);
          } catch (adjErr: unknown) {
            console.error("[adjuster-extract] non-fatal:", (adjErr as Error)?.message);
          }
        }
      }

      // Clear stale AI analysis — runs unconditionally so any new upload invalidates
      // the cached suggestion, even when extraction is unavailable or fails.
      try {
        await storage.updateClaim(claimId, matchedClaim.organizationId, { aiAnalysisJson: null } as Partial<import("@shared/schema").InsertClaim>);
      } catch (clearErr: unknown) {
        console.error("[ai-analysis-clear] non-fatal:", (clearErr as Error)?.message);
      }
    }

    // When the upload isn't pre-linked to a claim, run the normalized
    // claim-matching layer. If a match is found, attach the document and
    // apply extracted fields. If not, create one new claim. This is the
    // ONLY path for creating claims from uploaded documents.
    let createdClaim: Awaited<ReturnType<typeof storage.createClaim>> | null = null;
    let matchResult: import("./claim-matching").MatchResult | null = null;
    if (!claimId) {
      const extractionData: ExtractionData = {
        claimNumber: coerceStr(llmExtraction?.claimNumber) || coerceStr(entities.find(e => e.entityType === "claim_number")?.rawValue),
        carrier: coerceStr(llmExtraction?.carrier) || coerceStr(entities.find(e => e.entityType === "carrier_name")?.rawValue),
        homeownerName: coerceStr(llmExtraction?.homeownerName) || coerceStr(entities.find(e => e.entityType === "insured_name")?.rawValue),
        insuredName: coerceStr(llmExtraction?.insuredName) || coerceStr(entities.find(e => e.entityType === "insured_name")?.rawValue),
        propertyAddress: coerceStr(llmExtraction?.propertyAddress) || coerceStr(entities.find(e => e.entityType === "property_address")?.rawValue),
        address: coerceStr(llmExtraction?.propertyAddress),
        city: coerceStr(llmExtraction?.city),
        state: coerceStr(llmExtraction?.state),
        zipCode: coerceStr(llmExtraction?.zipCode),
        dateOfLoss: coerceStr(llmExtraction?.dateOfLoss) || coerceStr(entities.find(e => e.entityType === "date_of_loss")?.rawValue),
        policyNumber: coerceStr(llmExtraction?.policyNumber),
        adjusterName: coerceStr(llmExtraction?.adjusterName),
        adjusterEmail: coerceStr(llmExtraction?.adjusterEmail),
        adjusterPhone: coerceStr(llmExtraction?.adjusterPhone),
        rcv: coerceStr(llmExtraction?.rcv) || coerceStr(entities.find(e => e.entityType === "rcv")?.rawValue),
        acv: coerceStr(llmExtraction?.acv) || coerceStr(entities.find(e => e.entityType === "acv")?.rawValue),
        deductible: coerceStr(llmExtraction?.deductible) || coerceStr(entities.find(e => e.entityType === "deductible")?.rawValue),
        supplementRequested: coerceStr(llmExtraction?.supplementRequested),
        supplementApproved: coerceStr(llmExtraction?.supplementApproved),
        supplementTotal: coerceStr(llmExtraction?.supplementTotal),
        recoverableDepreciation: coerceStr(llmExtraction?.recoverableDepreciation),
        approvedAmount: coerceStr(llmExtraction?.approvedAmount),
        claimAmount: coerceStr(llmExtraction?.claimAmount),
        finalPaid: coerceStr(llmExtraction?.finalPaid),
        denialReason: coerceStr(llmExtraction?.denialReason),
        initialOutcome: coerceStr(llmExtraction?.initialOutcome),
        finalOutcome: coerceStr(llmExtraction?.finalOutcome),
        iaFirm: coerceStr(llmExtraction?.iaFirm),
        vendor: coerceStr(llmExtraction?.vendor),
        inspectionDate: coerceStr(llmExtraction?.inspectionDate),
      };

      const hasClaimIndicators = !!(
        extractionData.claimNumber || extractionData.homeownerName || extractionData.insuredName ||
        extractionData.propertyAddress || extractionData.carrier || extractionData.adjusterName ||
        extractionData.rcv || extractionData.policyNumber || extractionData.dateOfLoss
      );

      if (hasClaimIndicators) {
        try {
          matchResult = await findOrCreateClaimFromExtraction(extractionData, {
            organizationId,
            role: req.auth.role,
            userId,
            fileId: evidenceFile.id,
            fileDocCategory: effectiveCategory,
          });
          claimId = matchResult.claim.id;
          createdClaim = matchResult.created ? matchResult.claim : null;
          if (matchResult.created) {
            console.log(`[upload] created claim ${matchResult.claim.claimNumber} from "${req.file!.originalname}" via findOrCreateClaimFromExtraction`);
            // Seed initial intelligence scores for the new claim (non-blocking).
            computeFullClaimScoring(matchResult.claim.id, organizationId)
              .then(scores => storage.updateClaim(matchResult!.claim.id, organizationId, {
                frictionScore: Math.round(scores.claimFrictionScore),
              } as Partial<import("@shared/schema").InsertClaim>))
              .catch((scoreErr: unknown) => console.error("[scoring-auto] non-fatal (new claim):", (scoreErr as Error)?.message));

            // Auto-link adjuster from extracted data on new claim
            const adjName = coerceStr(llmExtraction?.adjusterName) || coerceStr(entities.find(e => e.entityType === "adjuster_name")?.rawValue);
            if (adjName) {
              try {
                const existingAdjs = await storage.getAdjusters(organizationId);
                let adj = existingAdjs.find(a => a.adjusterName?.toLowerCase() === adjName.toLowerCase());
                if (!adj) {
                  const adjEmail = coerceStr(llmExtraction?.adjusterEmail);
                  const adjPhone = coerceStr(llmExtraction?.adjusterPhone);
                  const carrierName = coerceStr(llmExtraction?.carrier) || coerceStr(entities.find(e => e.entityType === "carrier_name")?.rawValue) || "Unknown";
                  adj = await storage.createAdjuster({
                    organizationId,
                    adjusterName: adjName,
                    adjusterEmail: adjEmail || undefined,
                    adjusterPhone: adjPhone || undefined,
                    carrierName,
                  });
                  console.log(`[adjuster-extract] created adjuster "${adjName}" from upload on new claim ${matchResult.claim.id}`);
                }
                await storage.linkAdjusterToClaim({
                  claimId: matchResult.claim.id,
                  adjusterId: adj.id,
                  organizationId,
                  roleOnClaim: "primary_adjuster",
                  sourceType: "document",
                  sourceDocumentId: evidenceFile.id,
                });
                adjusterAutoLinked = true;
                adjusterAutoLinkedName = adjName;
                console.log(`[adjuster-extract] linked adjuster "${adjName}" to new claim ${matchResult.claim.id}`);
              } catch (adjErr: unknown) {
                console.error("[adjuster-extract] non-fatal:", (adjErr as Error)?.message);
              }
            }
          } else {
            console.log(`[upload] matched existing claim ${matchResult.claim.claimNumber} from "${req.file!.originalname}" matchedBy=${matchResult.matchedBy}`);
          }
        } catch (matchErr: unknown) {
          console.error("[upload] claim matching failed:", (matchErr as Error)?.message);
        }
      }
    }
    
    await storage.createAuditLog({
      organizationId,
      actorUserId: userId,
      actorRole: req.auth.role,
      actionType: "EVIDENCE_UPLOADED",
      entityType: "evidence_file",
      entityId: evidenceFile.id,
      afterJson: { fileName: req.file.originalname, docCategory: effectiveCategory, claimId },
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
      createdClaim,
      autoAppliedFields,
      adjusterAutoLinked,
      adjusterName: adjusterAutoLinkedName,
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
    const role = req.auth.role;
    const master = isMaster(role);
    // Master sees all evidence files across tenants; others scoped to their org.
    const files = master && !claimId
      ? await storage.getAllEvidenceFilesAcrossTenants()
      : await storage.getEvidenceFiles(req.auth.organizationId, claimId);
    // Mask extraction data for non-Master users
    const maskedFiles = files.map((f) => {
      const extracted = (f as { extractedJson?: Record<string, unknown> }).extractedJson;
      if (!extracted) return f;
      const masked = maskExtractionData(extracted, role);
      return { ...f, extractedJson: masked };
    });
    res.json(maskedFiles);
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

router.patch("/files/:id", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const master = isMaster(req.auth.role);
    const file = master
      ? await storage.getEvidenceFileAnyTenant(req.params.id as string)
      : await storage.getEvidenceFile(req.params.id as string, req.auth.organizationId);
    if (!file) return res.status(404).json({ message: "File not found" });
    const updates: Partial<typeof file> = {};
    if (req.body.fileName !== undefined) updates.fileName = req.body.fileName;
    if (req.body.docCategory !== undefined) updates.docCategory = req.body.docCategory;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "Nothing to update" });
    }
    const updated = await storage.updateEvidenceFile(req.params.id as string, file.organizationId, updates);
    res.json(updated);
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

// Create a claim from an uploaded file's extracted fields. Uses the normalized
// matching layer first: if an existing claim matches, attach the file there instead
// of creating a duplicate. Accepts `fields` in body (accepted/edited extraction
// values from the UI) or falls back to storedEntities + LLM extraction.
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
    interface StoredExtractedJson { extraction?: ExtractionResult | null }
    const llmExtraction = (file.extractedJson as StoredExtractedJson | null)?.extraction ?? null;

    // Accept field-by-field accepted values from the UI, or fall back to
    // LLM extraction and rule-based entities (in that priority order).
    const accepted: Record<string, string> = req.body?.fields || {};

    const extractionData: ExtractionData = {
      claimNumber: accepted.claimNumber || llmExtraction?.claimNumber || storedEntities.find(e => e.entityType === "claim_number")?.rawValue || null,
      carrier: accepted.carrier || llmExtraction?.carrier || null,
      homeownerName: accepted.homeownerName || llmExtraction?.homeownerName || storedEntities.find(e => e.entityType === "insured_name")?.rawValue || null,
      insuredName: accepted.insuredName || llmExtraction?.insuredName || null,
      propertyAddress: accepted.propertyAddress || llmExtraction?.propertyAddress || storedEntities.find(e => e.entityType === "property_address")?.rawValue || null,
      address: accepted.propertyAddress || llmExtraction?.propertyAddress || null,
      city: accepted.city || llmExtraction?.city || null,
      state: accepted.state || llmExtraction?.state || null,
      zipCode: accepted.zipCode || llmExtraction?.zipCode || null,
      dateOfLoss: accepted.dateOfLoss || llmExtraction?.dateOfLoss || storedEntities.find(e => e.entityType === "date_of_loss")?.rawValue || null,
      policyNumber: accepted.policyNumber || llmExtraction?.policyNumber || null,
      adjusterName: accepted.adjusterName || llmExtraction?.adjusterName || null,
      adjusterEmail: accepted.adjusterEmail || llmExtraction?.adjusterEmail || null,
      adjusterPhone: accepted.adjusterPhone || llmExtraction?.adjusterPhone || null,
      rcv: accepted.rcv || llmExtraction?.rcv || null,
      acv: accepted.acv || llmExtraction?.acv || null,
      deductible: accepted.deductible || llmExtraction?.deductible || null,
      supplementRequested: accepted.supplementRequested || llmExtraction?.supplementRequested || null,
      supplementApproved: accepted.supplementApproved || llmExtraction?.supplementApproved || null,
      supplementTotal: accepted.supplementTotal || llmExtraction?.supplementTotal || null,
      recoverableDepreciation: accepted.recoverableDepreciation || llmExtraction?.recoverableDepreciation || null,
      approvedAmount: accepted.approvedAmount || llmExtraction?.approvedAmount || null,
      claimAmount: accepted.claimAmount || llmExtraction?.claimAmount || null,
      finalPaid: accepted.finalPaid || llmExtraction?.finalPaid || null,
      denialReason: accepted.denialReason || llmExtraction?.denialReason || null,
      initialOutcome: accepted.initialOutcome || llmExtraction?.initialOutcome || null,
      finalOutcome: accepted.finalOutcome || llmExtraction?.finalOutcome || null,
      iaFirm: accepted.iaFirm || llmExtraction?.iaFirm || null,
      vendor: accepted.vendor || llmExtraction?.vendor || null,
      inspectionDate: accepted.inspectionDate || llmExtraction?.inspectionDate || null,
    };

    const matchResult = await findOrCreateClaimFromExtraction(extractionData, {
      organizationId: file.organizationId,
      role,
      userId,
      fileId: file.id,
      fileDocCategory: file.docCategory,
    });

    // If the file was already linked to a different claim, make sure it
    // now points to the matched/created claim.
    if (file.claimId !== matchResult.claim.id) {
      await storage.updateEvidenceFile(file.id, file.organizationId, { claimId: matchResult.claim.id });
    }

    // Generate timeline events for the matched/created claim.
    const fileEntities = storedEntities.map(e => ({
      entityType: e.entityType,
      rawValue: e.rawValue,
      confidence: e.confidence || 0,
    }));
    await generateTimelineEvents(matchResult.claim.id, file.organizationId, file.id, file.docCategory || "unknown", fileEntities, userId);

    // Auto-link adjuster from accepted/extracted data.
    const adjName = accepted.adjusterName || llmExtraction?.adjusterName || storedEntities.find(e => e.entityType === "adjuster_name")?.rawValue;
    if (adjName) {
      try {
        const existingAdjs = await storage.getAdjusters(file.organizationId);
        let adj = existingAdjs.find(a => a.adjusterName?.toLowerCase() === adjName.toLowerCase());
        if (!adj) {
          const carrierName = accepted.carrier || llmExtraction?.carrier || "Unknown";
          adj = await storage.createAdjuster({
            organizationId: file.organizationId,
            adjusterName: adjName,
            adjusterEmail: accepted.adjusterEmail || llmExtraction?.adjusterEmail || undefined,
            adjusterPhone: accepted.adjusterPhone || llmExtraction?.adjusterPhone || undefined,
            carrierName,
          });
        }
        await storage.linkAdjusterToClaim({
          claimId: matchResult.claim.id,
          adjusterId: adj.id,
          organizationId: file.organizationId,
          roleOnClaim: "primary_adjuster",
        });
      } catch (adjErr: unknown) {
        console.error("[create-claim] adjuster linking non-fatal:", (adjErr as Error)?.message);
      }
    }

    // Seed intelligence scores (non-blocking).
    computeFullClaimScoring(matchResult.claim.id, file.organizationId)
      .then(scores => storage.updateClaim(matchResult.claim.id, file.organizationId, {
        frictionScore: Math.round(scores.claimFrictionScore),
      } as Partial<import("@shared/schema").InsertClaim>))
      .catch((scoreErr: unknown) => console.error("[scoring-auto] non-fatal (create-claim):", (scoreErr as Error)?.message));

    res.json({
      created: matchResult.created,
      matchedBy: matchResult.matchedBy,
      claim: matchResult.claim,
    });
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

    await storage.createAuditLog({
      organizationId: file.organizationId,
      actorUserId: userId,
      actorRole: role,
      actionType: "EVIDENCE_SAVED_UNMATCHED",
      entityType: "evidence_file",
      entityId: file.id,
      afterJson: { actorOrganizationId: organizationId, crossTenant: file.organizationId !== organizationId },
    });

    res.json({ unmatched: true });
  } catch (err) {
    return res.status(500).json({ message: (err as Error).message });
  }
});

// Apply LLM extraction fields to a claim. Accepts:
//   - claimId: if user is already inside a claim (optional)
//   - fields: user-selected extracted fields (optional, falls back to all file extraction)
// If claimId is missing or the claim doesn't exist, runs the normalized matching
// logic using the extracted data. If a match is found, applies to that claim.
// If no match is found, creates a new claim. Never returns 404 when extraction
// data contains enough fields to create or match a claim.
router.post("/files/:id/apply-extraction", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const { role, organizationId, userId } = req.auth;
    const master = isMaster(role);

    const file = master
      ? await storage.getEvidenceFileAnyTenant(req.params.id as string)
      : await storage.getEvidenceFile(req.params.id as string, organizationId);
    if (!file) return res.status(404).json({ message: "File not found" });

    const bodyClaimId = req.body.claimId as string | undefined;
    const bodyFields = req.body.fields as Record<string, string> | undefined;
    const fileExtraction = (file.extractedJson as { extraction?: Record<string, unknown> } | null)?.extraction;
    const fields: Record<string, string> = bodyFields && typeof bodyFields === "object" && Object.keys(bodyFields).length > 0
      ? bodyFields
      : (fileExtraction
          ? Object.fromEntries(
              Object.entries(fileExtraction).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)])
            )
          : {});
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ message: "No extraction fields available to apply" });
    }

    // Resolve the target claim
    let claim: Awaited<ReturnType<typeof storage.getClaim>> | undefined;
    let targetClaimId: string | null = bodyClaimId || file.claimId || null;

    if (targetClaimId) {
      claim = master
        ? await storage.getClaimAnyTenant(targetClaimId)
        : await storage.getClaim(targetClaimId, file.organizationId);
    }

    // If no claim found, run normalized matching logic
    if (!claim) {
      const storedEntities = await storage.getExtractedEntities(file.id);
      const extractionData: ExtractionData = {
        claimNumber: coerceStr(fields.claimNumber) || coerceStr(fileExtraction?.claimNumber) || coerceStr(storedEntities.find(e => e.entityType === "claim_number")?.rawValue),
        carrier: coerceStr(fields.carrier) || coerceStr(fileExtraction?.carrier),
        homeownerName: coerceStr(fields.homeownerName) || coerceStr(fileExtraction?.homeownerName) || coerceStr(storedEntities.find(e => e.entityType === "insured_name")?.rawValue),
        insuredName: coerceStr(fields.insuredName) || coerceStr(fileExtraction?.insuredName),
        propertyAddress: coerceStr(fields.propertyAddress) || coerceStr(fileExtraction?.propertyAddress) || coerceStr(storedEntities.find(e => e.entityType === "property_address")?.rawValue),
        address: coerceStr(fields.propertyAddress) || coerceStr(fileExtraction?.propertyAddress),
        city: coerceStr(fields.city) || coerceStr(fileExtraction?.city),
        state: coerceStr(fields.state) || coerceStr(fileExtraction?.state),
        zipCode: coerceStr(fields.zipCode) || coerceStr(fileExtraction?.zipCode),
        dateOfLoss: coerceStr(fields.dateOfLoss) || coerceStr(fileExtraction?.dateOfLoss) || coerceStr(storedEntities.find(e => e.entityType === "date_of_loss")?.rawValue),
        policyNumber: coerceStr(fields.policyNumber) || coerceStr(fileExtraction?.policyNumber) || coerceStr(storedEntities.find(e => e.entityType === "policy_number")?.rawValue),
        adjusterName: coerceStr(fields.adjusterName) || coerceStr(fileExtraction?.adjusterName) || coerceStr(storedEntities.find(e => e.entityType === "adjuster_name")?.rawValue),
        adjusterEmail: coerceStr(fields.adjusterEmail) || coerceStr(fileExtraction?.adjusterEmail) || coerceStr(storedEntities.find(e => e.entityType === "adjuster_email")?.rawValue),
        adjusterPhone: coerceStr(fields.adjusterPhone) || coerceStr(fileExtraction?.adjusterPhone) || coerceStr(storedEntities.find(e => e.entityType === "adjuster_phone")?.rawValue),
        rcv: coerceStr(fields.rcv) || coerceStr(fileExtraction?.rcv) || coerceStr(storedEntities.find(e => e.entityType === "rcv")?.rawValue),
        acv: coerceStr(fields.acv) || coerceStr(fileExtraction?.acv) || coerceStr(storedEntities.find(e => e.entityType === "acv")?.rawValue),
        deductible: coerceStr(fields.deductible) || coerceStr(fileExtraction?.deductible) || coerceStr(storedEntities.find(e => e.entityType === "deductible")?.rawValue),
        supplementRequested: coerceStr(fields.supplementRequested) || coerceStr(fileExtraction?.supplementRequested),
        supplementApproved: coerceStr(fields.supplementApproved) || coerceStr(fileExtraction?.supplementApproved),
        supplementTotal: coerceStr(fields.supplementTotal) || coerceStr(fileExtraction?.supplementTotal),
        recoverableDepreciation: coerceStr(fields.recoverableDepreciation) || coerceStr(fileExtraction?.recoverableDepreciation),
        approvedAmount: coerceStr(fields.approvedAmount) || coerceStr(fileExtraction?.approvedAmount),
        claimAmount: coerceStr(fields.claimAmount) || coerceStr(fileExtraction?.claimAmount),
        finalPaid: coerceStr(fields.finalPaid) || coerceStr(fileExtraction?.finalPaid),
        denialReason: coerceStr(fields.denialReason) || coerceStr(fileExtraction?.denialReason),
        initialOutcome: coerceStr(fields.initialOutcome) || coerceStr(fileExtraction?.initialOutcome),
        finalOutcome: coerceStr(fields.finalOutcome) || coerceStr(fileExtraction?.finalOutcome),
        iaFirm: coerceStr(fields.iaFirm) || coerceStr(fileExtraction?.iaFirm),
        vendor: coerceStr(fields.vendor) || coerceStr(fileExtraction?.vendor),
        inspectionDate: coerceStr(fields.inspectionDate) || coerceStr(fileExtraction?.inspectionDate),
      };

      const hasIndicators = !!(
        extractionData.claimNumber || extractionData.homeownerName || extractionData.insuredName ||
        extractionData.propertyAddress || extractionData.carrier || extractionData.adjusterName ||
        extractionData.rcv || extractionData.policyNumber || extractionData.dateOfLoss
      );

      if (hasIndicators) {
        try {
          const matchResult = await findOrCreateClaimFromExtraction(extractionData, {
            organizationId: file.organizationId,
            role,
            userId,
            fileId: file.id,
          });
          claim = matchResult.claim;
          targetClaimId = matchResult.claim.id;
          console.log(`[apply-extraction] ${matchResult.created ? "created" : "matched"} claim ${matchResult.claim.id} matchedBy=${matchResult.matchedBy}`);

          // Auto-link adjuster from extracted data
          const adjName = extractionData.adjusterName;
          if (adjName) {
            try {
              const existingAdjs = await storage.getAdjusters(file.organizationId);
              let adj = existingAdjs.find(a => a.adjusterName?.toLowerCase() === adjName.toLowerCase());
              if (!adj) {
                const carrierName = extractionData.carrier || "Unknown";
                adj = await storage.createAdjuster({
                  organizationId: file.organizationId,
                  adjusterName: adjName,
                  adjusterEmail: extractionData.adjusterEmail || undefined,
                  adjusterPhone: extractionData.adjusterPhone || undefined,
                  carrierName,
                });
              }
              await storage.linkAdjusterToClaim({
                claimId: matchResult.claim.id,
                adjusterId: adj.id,
                organizationId: file.organizationId,
                roleOnClaim: "primary_adjuster",
                sourceType: "document",
                sourceDocumentId: file.id,
              });
              console.log(`[apply-extraction] linked adjuster "${adjName}" to claim ${matchResult.claim.id}`);
            } catch (adjErr: unknown) {
              console.error("[apply-extraction] adjuster linking non-fatal:", (adjErr as Error)?.message);
            }
          }
        } catch (matchErr: unknown) {
          console.error("[apply-extraction] claim matching failed:", (matchErr as Error)?.message);
        }
      }
    }

    if (!claim) {
      return res.status(400).json({ message: "No claim found or creatable from the extracted data. Please link this file to a claim first." });
    }

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
      supplementTotal: "supplementAmountTotal",
      recoverableDepreciation: "recoverableDepreciation",
      approvedAmount: "approvedAmount",
      claimAmount: "claimAmount",
      finalPaid: "finalPaidAmount",
      denialReason: "denialReason",
      initialOutcome: "initialOutcome",
      finalOutcome: "finalOutcome",
      iaFirm: "iaFirm",
      adjusterEmail: "adjusterEmail",
      adjusterPhone: "adjusterPhone",
    };
    const DATE_KEYS = new Set(["dateOfLoss", "inspectionDate"]);
    const NUMERIC_KEYS = new Set(["rcv", "acv", "deductible", "supplementRequested", "supplementApproved", "supplementTotal", "recoverableDepreciation", "approvedAmount", "claimAmount", "finalPaid"]);

    const claimUpdate: Record<string, unknown> = {};
    for (const [exKey, claimKey] of Object.entries(FIELD_MAP)) {
      const raw = fields[exKey];
      if (!raw || String(raw).trim() === "") continue;
      const val = String(raw).trim();
      // Only apply if the claim field is currently blank/null — never overwrite user data
      const existingVal = (claim as Record<string, unknown>)[claimKey];
      if (existingVal != null && existingVal !== "") continue;
      if (DATE_KEYS.has(exKey)) {
        const d = parseFlexDate(val);
        if (d) claimUpdate[claimKey] = d;
      } else if (NUMERIC_KEYS.has(exKey)) {
        const n = parseFloat(val.replace(/[$,\s]/g, ""));
        if (!isNaN(n)) claimUpdate[claimKey] = n;
      } else if (exKey === "propertyAddress") {
        const clean = sanitizeAddress(val);
        if (clean) claimUpdate[claimKey] = clean;
      } else {
        claimUpdate[claimKey] = val;
      }
    }

    if (Object.keys(claimUpdate).length === 0) {
      return res.status(400).json({ message: "No valid fields to apply (all target fields already populated)" });
    }

    const updated = await storage.updateClaim(claim.id, claim.organizationId, claimUpdate as Partial<import("@shared/schema").InsertClaim>);

    await storage.createAuditLog({
      organizationId: claim.organizationId,
      actorUserId: userId,
      actorRole: role,
      actionType: "AI_EXTRACTION_APPLIED",
      entityType: "claim",
      entityId: claim.id,
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
