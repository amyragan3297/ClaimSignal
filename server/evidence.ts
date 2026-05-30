import { Router, Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import { storage } from "./storage";
import { createCandidatesFromText } from "./timeline-extraction";

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
  
  return entities;
}

async function autoMatchClaim(
  orgId: string, 
  entities: Array<{ entityType: string; rawValue: string; confidence: number }>
): Promise<string | null> {
  const claimNum = entities.find(e => e.entityType === "claim_number");
  if (claimNum) {
    const allClaims = await storage.getClaims(orgId);
    const match = allClaims.find(c => c.claimNumber === claimNum.rawValue);
    if (match) return match.id;
  }
  
  const policyNum = entities.find(e => e.entityType === "policy_number");
  if (policyNum) {
    const allClaims = await storage.getClaims(orgId);
    const match = allClaims.find(c => c.policyNumber === policyNum.rawValue);
    if (match) return match.id;
  }
  
  const insured = entities.find(e => e.entityType === "insured_name");
  const addr = entities.find(e => e.entityType === "property_address");
  if (insured && addr) {
    const allClaims = await storage.getClaims(orgId);
    const match = allClaims.find(c => {
      const nameMatch = (c.insuredName || c.homeownerName || "").toLowerCase().includes(insured.rawValue.toLowerCase());
      const addrMatch = (c.propertyAddress || c.address || "").toLowerCase().includes(addr.rawValue.toLowerCase().slice(0, 10));
      return nameMatch && addrMatch;
    });
    if (match) return match.id;
  }
  
  return null;
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
    }
    
    const classification = classifyDocument(textContent);
    const entities = extractEntities(textContent);
    
    const claimId = req.body.claimId || await autoMatchClaim(organizationId, entities);
    
    const evidenceFile = await storage.createEvidenceFile({
      organizationId,
      uploadedByUserId: userId,
      claimId: claimId || undefined,
      sourceType: "upload",
      fileName: req.file.originalname,
      fileType: fileType as any,
      sha256,
      fileSize: buffer.length,
      docCategory: classification.category as any,
      confidence: classification.confidence,
      extractionStatus: textContent ? "complete" : "pending",
      extractedJson: entities.length > 0 ? { entities } : undefined,
    });
    
    for (const entity of entities) {
      await storage.createExtractedEntity({
        evidenceFileId: evidenceFile.id,
        claimId: claimId || undefined,
        entityType: entity.entityType as any,
        rawValue: entity.rawValue,
        normalizedValue: entity.rawValue,
        confidence: entity.confidence,
      });
    }
    
    if (claimId) {
      await generateTimelineEvents(claimId, organizationId, evidenceFile.id, classification.category, entities, userId);
      // AI date-extraction MVP: derive event-dated timeline candidates from the
      // document text. Low-confidence dates become needsReview candidates. Never
      // allowed to break the upload pipeline.
      if (textContent && textContent.trim()) {
        try {
          await createCandidatesFromText({
            text: textContent,
            claimId,
            orgId: organizationId,
            createdByUserId: userId,
            sourceDocumentId: evidenceFile.id,
            sourceHint: classification.category === "denial_letter" ? "letter_date" : undefined,
          });
        } catch (extractErr: any) {
          console.error("[timeline-extraction] non-fatal:", extractErr?.message);
        }
      }
    }
    
    let draft = null;
    if (!claimId) {
      const claimNum = entities.find(e => e.entityType === "claim_number");
      const insured = entities.find(e => e.entityType === "insured_name");
      const addr = entities.find(e => e.entityType === "property_address");
      
      draft = await storage.createClaimDraft({
        organizationId,
        createdFromEvidenceFileId: evidenceFile.id,
        extractedClaimNumber: claimNum?.rawValue,
        extractedInsured: insured?.rawValue,
        extractedAddress: addr?.rawValue,
      });
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
    
    res.json({
      file: evidenceFile,
      entities,
      classification,
      matchedClaimId: claimId,
      draft,
    });
  } catch (err: any) {
    console.error("Evidence upload error:", err);
    return res.status(500).json({ message: err.message });
  }
});

router.get("/files", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const claimId = req.query.claimId as string | undefined;
    const files = await storage.getEvidenceFiles(req.auth.organizationId, claimId);
    res.json(files);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.get("/files/:id", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const file = await storage.getEvidenceFile(req.params.id as string, req.auth.organizationId);
    if (!file) return res.status(404).json({ message: "File not found" });
    res.json(file);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.get("/files/:id/entities", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const entities = await storage.getExtractedEntities(req.params.id as string);
    res.json(entities);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.post("/files/:id/match", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const { claimId } = req.body;
    if (!claimId) return res.status(400).json({ message: "claimId required" });
    
    const file = await storage.getEvidenceFile(req.params.id as string, req.auth.organizationId);
    if (!file) return res.status(404).json({ message: "File not found" });
    
    await storage.updateEvidenceFile(req.params.id as string, req.auth.organizationId, { claimId });
    
    const entities = await storage.getExtractedEntities(req.params.id as string);
    await generateTimelineEvents(
      claimId as string, 
      req.auth.organizationId, 
      req.params.id as string, 
      file.docCategory || "unknown",
      entities.map(e => ({ entityType: e.entityType, rawValue: e.rawValue, confidence: e.confidence || 0 })),
      req.auth.userId
    );
    
    res.json({ matched: true, claimId });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.get("/drafts", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const drafts = await storage.getClaimDrafts(req.auth.organizationId);
    res.json(drafts);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.patch("/drafts/:id", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const updated = await storage.updateClaimDraft(req.params.id as string, req.auth.organizationId, req.body);
    if (!updated) return res.status(404).json({ message: "Draft not found" });
    res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.get("/timeline/:claimId", async (req: AuthRequest, res: Response) => {
  try {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    const events = await storage.getTimelineEvents(req.params.claimId as string, req.auth.organizationId);
    res.json(events);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
