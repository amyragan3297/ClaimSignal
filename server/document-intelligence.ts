// ──────────────────────────────────────────────────────────────────────────
// Document Intelligence Engine (Section 18) — MVP, rule-based text analysis.
//
// Extracts structured intelligence from uploaded document text.
// Returns SUGGESTIONS only — never auto-applies to claims.
// User must Review/Accept/Reject/Edit each suggestion.
// ──────────────────────────────────────────────────────────────────────────

export interface ExtractedField {
  fieldName: string;
  suggestedValue: string | number | null;
  confidence: number;
  source: string;
}

export interface DenialSignal {
  type: string;
  label: string;
  confidence: number;
  evidence: string;
}

export interface MissingLineItem {
  item: string;
  reason: string;
  confidence: number;
}

export interface DocumentIntelligenceResult {
  method: string;
  documentCategory: string;
  categoryConfidence: number;
  extractedFields: ExtractedField[];
  denialDetection: {
    isDenialDocument: boolean;
    denialSignals: DenialSignal[];
    primaryDenialType: string | null;
    overallConfidence: number;
  };
  missingLineItems: {
    isEstimateDocument: boolean;
    flagged: MissingLineItem[];
    note: string;
  };
  timelineHints: Array<{ eventType: string; dateHint: string | null; label: string }>;
  playbookLinkHint: string | null;
}

const lc = (s: string) => s.toLowerCase();

// ── 1. Enhanced entity extraction ──────────────────────────────────────────
function extractFields(text: string): ExtractedField[] {
  const fields: ExtractedField[] = [];
  const t = text;

  const push = (fieldName: string, regex: RegExp, transform?: (m: RegExpMatchArray) => string | number) => {
    const m = t.match(regex);
    if (m) {
      const raw = transform ? transform(m) : (m[1] ?? m[0]).trim();
      fields.push({ fieldName, suggestedValue: raw, confidence: 0.8, source: "regex extraction" });
    }
  };

  // Claim identity
  push("claimNumber", /claim\s*(?:number|#|no\.?)\s*[:\s]*([A-Z0-9\-]{4,20})/i);
  push("policyNumber", /policy\s*(?:number|#|no\.?)\s*[:\s]*([A-Z0-9\-]{4,20})/i);
  push("carrier", /(?:carrier|insurance\s+company|insurer)\s*[:\s]*([A-Z][A-Za-z\s&]{2,40})/i);
  push("dateOfLoss", /date\s+of\s+loss\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
  push("propertyAddress", /(?:property|loss)\s+address\s*[:\s]*(.{10,80}?)(?:\n|$)/i);
  push("insuredName", /insured\s*[:\s]*([A-Z][a-z]+\s+[A-Z][a-z]+)/);

  // Financial
  const parseAmt = (m: RegExpMatchArray) => parseFloat((m[1] ?? m[0]).replace(/[$,]/g, ""));
  push("rcvAmount", /\brcv\b[:\s]*\$?([\d,]+\.?\d*)/i, parseAmt);
  push("acvAmount", /\bacv\b[:\s]*\$?([\d,]+\.?\d*)/i, parseAmt);
  push("deductible", /deductible\s*[:\s]*\$?([\d,]+\.?\d*)/i, parseAmt);
  push("netPayment", /net\s*(?:payment|claim|amount)[:\s]*\$?([\d,]+\.?\d*)/i, parseAmt);
  push("depreciation", /(?:recoverable\s+)?depreciation\s*[:\s]*\$?([\d,]+\.?\d*)/i, parseAmt);
  push("permitCost", /permit\s*(?:cost|fee)?\s*[:\s]*\$?([\d,]+\.?\d*)/i, parseAmt);
  push("supplementRequested", /supplement\s*(?:amount|total|requested)?\s*[:\s]*\$?([\d,]+\.?\d*)/i, parseAmt);

  // O&P — often "Overhead and Profit" or "O&P"
  const opMatch = t.match(/(?:overhead\s*(?:and|&)\s*profit|o\s*&\s*p)\s*[:\s]*\$?([\d,]+\.?\d*)/i);
  if (opMatch) fields.push({ fieldName: "opAmount", suggestedValue: parseFloat((opMatch[1] ?? "0").replace(/[$,]/g, "")), confidence: 0.8, source: "regex extraction" });

  // Adjuster info
  push("adjusterName", /(?:adjuster|field\s+adj\.?|desk\s+adj\.?)\s*[:\s]*([A-Z][a-z]+\s+[A-Z][a-z]+)/i);
  push("adjusterSupervisor", /supervisor\s*[:\s]*([A-Z][a-z]+\s+[A-Z][a-z]+)/i);
  push("iaFirm", /(?:ia\s+firm|independent\s+adjuster|adjusting\s+firm)\s*[:\s]*([A-Z][A-Za-z\s]{2,40})/i);
  push("carrierRepresentative", /(?:carrier\s+rep|representative)\s*[:\s]*([A-Z][a-z]+\s+[A-Z][a-z]+)/i);

  // Property info
  push("roofType", /(?:roof\s+type|roofing\s+material|shingle\s+type)\s*[:\s]*([A-Za-z\s\-]{4,30}?)(?:\n|,|$)/i);
  const storiesMatch = t.match(/(\d)\s*(?:story|stories|storey)/i);
  if (storiesMatch) fields.push({ fieldName: "stories", suggestedValue: parseInt(storiesMatch[1]), confidence: 0.75, source: "regex extraction" });
  const steepMatch = /(?:steep\s+slope|steep\s+pitch|7\/12|8\/12|9\/12|10\/12|11\/12|12\/12)/i.test(t);
  if (steepMatch) fields.push({ fieldName: "steepDesignation", suggestedValue: "steep", confidence: 0.7, source: "regex extraction" });

  // Dates
  push("inspectionDate", /inspection\s+date\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
  push("determinationDate", /(?:determination|decision|denial)\s+date\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);

  return fields;
}

// ── 2. Denial detection ──────────────────────────────────────────────────
const DENIAL_PATTERNS: Array<{ type: string; label: string; patterns: RegExp[]; weight: number }> = [
  {
    type: "full_denial",
    label: "Full Denial",
    patterns: [/we regret to inform/i, /claim is denied/i, /not covered under/i, /coverage does not apply/i, /\bdenie[ds]\b/i],
    weight: 0.9,
  },
  {
    type: "partial_denial",
    label: "Partial Denial",
    patterns: [/partially\s+(?:covered|approved)/i, /partial\s+(?:payment|approval|coverage)/i, /some\s+items\s+(?:are\s+not|were\s+not)\s+covered/i],
    weight: 0.85,
  },
  {
    type: "coverage_limitation",
    label: "Coverage Limitation",
    patterns: [/coverage\s+(?:is\s+)?limited/i, /excluded\s+(?:from|under)/i, /not\s+within\s+(?:the\s+)?scope\s+of\s+coverage/i, /coverage\s+limit/i],
    weight: 0.8,
  },
  {
    type: "matching_dispute",
    label: "Matching Dispute",
    patterns: [/matching\s+(?:issue|dispute|concern)/i, /\bmatching\b/i, /uniformity\s+(?:of|in)/i, /cannot\s+match/i],
    weight: 0.8,
  },
  {
    type: "repairability_dispute",
    label: "Repairability Dispute",
    patterns: [/repairable\b/i, /repair\s+(?:only|not\s+replace)/i, /not\s+repairable/i, /repairability/i],
    weight: 0.8,
  },
  {
    type: "wear_and_tear",
    label: "Wear and Tear",
    patterns: [/wear\s+and\s+tear/i, /normal\s+wear/i, /general\s+deterioration/i, /\bdeterioration\b/i],
    weight: 0.85,
  },
  {
    type: "mechanical_damage",
    label: "Mechanical Damage",
    patterns: [/mechanical\s+damage/i, /mechanical\s+failure/i],
    weight: 0.85,
  },
  {
    type: "installation_defect",
    label: "Installation Defect",
    patterns: [/installation\s+defect/i, /improper\s+installation/i, /faulty\s+installation/i],
    weight: 0.85,
  },
  {
    type: "maintenance",
    label: "Maintenance Issue",
    patterns: [/lack\s+of\s+maintenance/i, /maintenance\s+(?:issue|problem|concern)/i, /preventable\s+(?:damage|deterioration)/i],
    weight: 0.85,
  },
];

function detectDenials(text: string): DocumentIntelligenceResult["denialDetection"] {
  const signals: DenialSignal[] = [];

  for (const dp of DENIAL_PATTERNS) {
    for (const regex of dp.patterns) {
      const m = text.match(regex);
      if (m) {
        signals.push({ type: dp.type, label: dp.label, confidence: dp.weight, evidence: m[0].trim().slice(0, 80) });
        break;
      }
    }
  }

  const isDenialDocument = signals.some((s) => ["full_denial", "partial_denial"].includes(s.type));
  const primaryDenialType = signals.length > 0 ? signals.sort((a, b) => b.confidence - a.confidence)[0].type : null;
  const overallConfidence = signals.length > 0 ? Math.max(...signals.map((s) => s.confidence)) : 0;

  return { isDenialDocument, denialSignals: signals, primaryDenialType, overallConfidence };
}

// ── 3. Missing line item detection (roofing — MVP keyword-based) ───────────
const ROOFING_ITEMS: Array<{ item: string; patterns: RegExp[] }> = [
  { item: "Drip Edge", patterns: [/drip\s+edge/i, /eave\s+drip/i] },
  { item: "Starter Strip", patterns: [/starter\s+(?:strip|course|shingle)/i] },
  { item: "Ridge Cap", patterns: [/ridge\s+cap/i, /ridge\s+shingle/i] },
  { item: "Ridge Vent", patterns: [/ridge\s+vent/i, /hip\s+and\s+ridge\s+vent/i] },
  { item: "Ice and Water Shield", patterns: [/ice\s+(?:and\s+)?water\s+(?:shield|barrier)/i, /ice\s+dam/i] },
  { item: "Valley Liner", patterns: [/valley\s+(?:liner|flashing|metal)/i, /open\s+valley/i] },
  { item: "Pipe Jacks", patterns: [/pipe\s+(?:jack|boot|flashing)/i, /pipe\s+penetration/i] },
  { item: "Flashing", patterns: [/\bflashing\b/i, /step\s+flashing/i, /counter\s+flashing/i] },
  { item: "Permit", patterns: [/\bpermit\b/i, /building\s+permit/i] },
  { item: "Dumpster / Debris Removal", patterns: [/dumpster/i, /debris\s+removal/i, /haul\s+away/i] },
  { item: "O&P (Overhead & Profit)", patterns: [/overhead\s*(?:and|&)\s*profit/i, /\bo\s*&\s*p\b/i] },
  { item: "Steep Slope Charges", patterns: [/steep\s+(?:slope|charge|factor)/i, /slope\s+(?:factor|charge)/i] },
  { item: "High Roof Charges", patterns: [/high\s+(?:roof|lift|story)/i, /two\s*-?\s*story\s+(?:charge|factor)/i] },
  { item: "Detachment & Reset Items", patterns: [/detach\s+(?:and|&)\s*reset/i, /\bd\/r\b/i, /\bdetach\b.*\breset\b/i] },
];

function detectMissingLineItems(text: string, isEstimate: boolean): DocumentIntelligenceResult["missingLineItems"] {
  if (!isEstimate) {
    return { isEstimateDocument: false, flagged: [], note: "MVP keyword-based detection — applicable to estimate documents only" };
  }

  const flagged: MissingLineItem[] = [];
  for (const ri of ROOFING_ITEMS) {
    const present = ri.patterns.some((p) => p.test(text));
    if (!present) {
      flagged.push({
        item: ri.item,
        reason: `"${ri.item}" not detected in document text`,
        confidence: 0.65,
      });
    }
  }

  return {
    isEstimateDocument: true,
    flagged,
    note: "MVP keyword-based detection. Verify manually. Not all items may be applicable to every claim.",
  };
}

// ── 4. Timeline hints ─────────────────────────────────────────────────────
function extractTimelineHints(text: string, docCategory: string): DocumentIntelligenceResult["timelineHints"] {
  const hints: DocumentIntelligenceResult["timelineHints"] = [];
  const dateRe = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g;
  const dates = Array.from(text.matchAll(dateRe)).map((m) => m[1]);

  if (docCategory === "denial_letter") {
    hints.push({ eventType: "denial", dateHint: dates[0] ?? null, label: "Denial Received" });
  }
  if (docCategory === "payment_letter") {
    hints.push({ eventType: "payment_issued", dateHint: dates[0] ?? null, label: "Payment Issued" });
  }
  if (docCategory === "supplement") {
    hints.push({ eventType: "supplement_submitted", dateHint: dates[0] ?? null, label: "Supplement Submitted" });
  }
  if (/reinspection/i.test(text)) {
    const m = text.match(/reinspection\s+(?:date|scheduled)?\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    hints.push({ eventType: "reinspection", dateHint: m?.[1] ?? null, label: "Reinspection Referenced" });
  }
  return hints;
}

// ── 5. Playbook link hint ────────────────────────────────────────────────
function playbookHint(denial: DocumentIntelligenceResult["denialDetection"]): string | null {
  if (!denial.isDenialDocument || !denial.primaryDenialType) return null;
  const hints: Record<string, string> = {
    wear_and_tear: "Search playbook: wear and tear denial overturned",
    matching_dispute: "Search playbook: matching dispute resolution",
    repairability_dispute: "Search playbook: repairability dispute overturned",
    full_denial: "Search playbook: denial overturned after reinspection",
  };
  return hints[denial.primaryDenialType] ?? "Search playbook: similar denial patterns";
}

// ── Main entry point ─────────────────────────────────────────────────────
export function analyzeDocumentText(
  text: string,
  fileName: string,
  existingDocCategory?: string,
): DocumentIntelligenceResult {
  if (!text || text.trim().length < 20) {
    return {
      method: "MVP rule-based document intelligence",
      documentCategory: existingDocCategory ?? "unknown",
      categoryConfidence: 0,
      extractedFields: [],
      denialDetection: { isDenialDocument: false, denialSignals: [], primaryDenialType: null, overallConfidence: 0 },
      missingLineItems: { isEstimateDocument: false, flagged: [], note: "No text content available for analysis" },
      timelineHints: [],
      playbookLinkHint: null,
    };
  }

  const docCategory = existingDocCategory ?? "unknown";
  const isEstimate = ["estimate", "scope", "supplement"].includes(docCategory);

  const extractedFields = extractFields(text);
  const denialDetection = detectDenials(text);
  const missingLineItems = detectMissingLineItems(text, isEstimate);
  const timelineHints = extractTimelineHints(text, docCategory);
  const playbookLinkHint = playbookHint(denialDetection);

  return {
    method: "MVP rule-based document intelligence",
    documentCategory: docCategory,
    categoryConfidence: 0.8,
    extractedFields,
    denialDetection,
    missingLineItems,
    timelineHints,
    playbookLinkHint,
  };
}
