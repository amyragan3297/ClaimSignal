import { storage } from "./storage";
import type { InsertTimelineEvent, TimelineEvent } from "@shared/schema";

/**
 * AI Timeline / Date Extraction — MVP
 * ------------------------------------
 * Parses available document / transcript / communication text and attempts to
 * identify the ACTUAL event dates referenced in the content (NOT the upload
 * date). High-confidence dates become final timeline events whose `eventDate`
 * is the extracted date; low-confidence dates become review-needed candidates.
 *
 * This is a deterministic regex/keyword MVP. It is intentionally labelled as an
 * MVP extractor — it does not call an external LLM. When a production AI service
 * is connected, `extractTimelineCandidates` is the single seam to upgrade.
 */

export interface DateCandidate {
  eventType: string;
  title: string;
  extractedDate: Date | null;
  dateSource: string;
  confidence: number;
  description: string;
  rawMatch: string;
}

const AUTO_ACCEPT_THRESHOLD = 0.75;

// dateSource enum values: document_header | letter_date | estimate_date |
// email_date | transcript_content | audio_transcription | user_entered |
// metadata | inferred | unknown

interface EventPattern {
  eventType: string;
  title: string;
  keywords: RegExp;
  dateSource: string;
  baseConfidence: number;
}

const EVENT_PATTERNS: EventPattern[] = [
  { eventType: "date_of_loss", title: "Date of Loss", keywords: /\b(date of loss|loss date|d\.?o\.?l\.?|damage occurred|storm date)\b/i, dateSource: "letter_date", baseConfidence: 0.6 },
  { eventType: "inspection", title: "Inspection Date", keywords: /\b(inspection date|inspected on|date of inspection|field inspection|reinspection scheduled)\b/i, dateSource: "letter_date", baseConfidence: 0.6 },
  { eventType: "estimate", title: "Estimate Date", keywords: /\b(estimate date|estimate prepared|date of estimate|estimate dated)\b/i, dateSource: "estimate_date", baseConfidence: 0.6 },
  { eventType: "denial", title: "Denial Letter Date", keywords: /\b(denial|denied|claim is denied|coverage is denied|letter of denial)\b/i, dateSource: "letter_date", baseConfidence: 0.65 },
  { eventType: "approval", title: "Approval Letter Date", keywords: /\b(approval|approved|claim is approved|payment approved|letter of approval)\b/i, dateSource: "letter_date", baseConfidence: 0.65 },
  { eventType: "carrier_response", title: "Carrier Response Date", keywords: /\b(carrier response|insurer responded|response from carrier|adjuster responded)\b/i, dateSource: "letter_date", baseConfidence: 0.55 },
  { eventType: "supplement_submission", title: "Supplement Submission Date", keywords: /\b(supplement submitted|submitted supplement|supplement request dated|supplement filed)\b/i, dateSource: "estimate_date", baseConfidence: 0.6 },
  { eventType: "supplement_approval", title: "Supplement Approval Date", keywords: /\b(supplement approved|supplement was approved|approved supplement)\b/i, dateSource: "letter_date", baseConfidence: 0.6 },
  { eventType: "payment", title: "Payment Date", keywords: /\b(payment|paid on|check issued|payment issued|disbursement|remittance)\b/i, dateSource: "letter_date", baseConfidence: 0.6 },
  { eventType: "reinspection", title: "Reinspection Date", keywords: /\b(reinspection|re-inspection|second inspection|reinspected on)\b/i, dateSource: "letter_date", baseConfidence: 0.6 },
  { eventType: "communication", title: "Communication Date", keywords: /\b(email dated|call on|spoke on|correspondence dated|message sent)\b/i, dateSource: "email_date", baseConfidence: 0.5 },
  { eventType: "escalation", title: "Escalation Date", keywords: /\b(escalat|appraisal demand|department of insurance|doi complaint|bad faith)\b/i, dateSource: "letter_date", baseConfidence: 0.55 },
  { eventType: "repair_start", title: "Repair Start Date", keywords: /\b(repair start|work began|construction started|repairs commenced|build start)\b/i, dateSource: "letter_date", baseConfidence: 0.55 },
  { eventType: "repair_completion", title: "Repair Completion Date", keywords: /\b(repair complete|work completed|certificate of completion|final completion|repairs finished)\b/i, dateSource: "letter_date", baseConfidence: 0.55 },
  { eventType: "deadline", title: "Deadline Date", keywords: /\b(deadline|due by|respond by|expires on|must be received by|statute of limitations)\b/i, dateSource: "letter_date", baseConfidence: 0.5 },
];

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Matches: 04/18/2026, 4-18-26, 2026-04-18, April 18, 2026, 18 April 2026
const DATE_REGEX = new RegExp(
  [
    "(\\d{4})-(\\d{1,2})-(\\d{1,2})", // ISO
    "(\\d{1,2})[\\/\\-](\\d{1,2})[\\/\\-](\\d{2,4})", // US
    "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})", // Month D, Y
    "(\\d{1,2})(?:st|nd|rd|th)?\\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?,?\\s+(\\d{4})", // D Month Y
  ].join("|"),
  "i"
);

function parseDateAt(segment: string): { date: Date; raw: string; explicit: boolean } | null {
  const m = segment.match(DATE_REGEX);
  if (!m) return null;
  const raw = m[0];
  let year: number, month: number, day: number;
  try {
    if (m[1] && m[2] && m[3]) {
      year = +m[1]; month = +m[2] - 1; day = +m[3];
    } else if (m[4] && m[5] && m[6]) {
      month = +m[4] - 1; day = +m[5]; year = +m[6];
      if (year < 100) year += 2000;
    } else if (m[7] && m[8] && m[9]) {
      month = MONTHS[m[7].slice(0, 3).toLowerCase()]; day = +m[8]; year = +m[9];
    } else if (m[10] && m[11] && m[12]) {
      day = +m[10]; month = MONTHS[m[11].slice(0, 3).toLowerCase()]; year = +m[12];
    } else {
      return null;
    }
    if (month < 0 || month > 11 || day < 1 || day > 31 || year < 1990 || year > 2100) return null;
    const date = new Date(Date.UTC(year, month, day));
    if (isNaN(date.getTime())) return null;
    const explicit = /[a-z]{3}/i.test(raw) || raw.includes("-") || raw.includes("/");
    return { date, raw, explicit };
  } catch {
    return null;
  }
}

/**
 * Core extraction. Returns one candidate per matched event type (highest
 * confidence occurrence wins). Pure function — easy to unit test and to swap
 * for a real AI call later.
 */
export function extractTimelineCandidates(text: string, opts?: { sourceHint?: string }): DateCandidate[] {
  if (!text || !text.trim()) return [];
  const lower = text.toLowerCase();
  const candidates: DateCandidate[] = [];
  const headerZone = text.slice(0, 240); // top-of-document date often = letter date

  for (const pat of EVENT_PATTERNS) {
    const km = pat.keywords.exec(lower);
    if (!km) continue;
    const idx = km.index;
    // search a window after (and a little before) the keyword for a date
    const window = text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + 160));
    const found = parseDateAt(window);
    if (!found) continue;

    let confidence = pat.baseConfidence;
    let dateSource = opts?.sourceHint || pat.dateSource;
    // boost: explicit, well-formed date
    if (found.explicit) confidence += 0.12;
    // boost: date sits in the document header (letter date)
    if (headerZone.includes(found.raw)) { confidence += 0.1; dateSource = "document_header"; }
    // dampen vague single-keyword matches
    if (km[0].length < 5) confidence -= 0.08;
    confidence = Math.max(0.3, Math.min(0.95, confidence));

    candidates.push({
      eventType: pat.eventType,
      title: pat.title,
      extractedDate: found.date,
      dateSource,
      confidence: Math.round(confidence * 100) / 100,
      description: `Auto-extracted from content near "${km[0]}" (MVP rule-based extraction).`,
      rawMatch: found.raw,
    });
  }
  return candidates;
}

export interface PersistOpts {
  text: string;
  claimId: string;
  orgId: string;
  createdByUserId?: string | null;
  sourceDocumentId?: string | null;
  sourceAudioId?: string | null;
  sourceTranscriptId?: string | null;
  sourceHint?: string;
}

/**
 * Extracts candidates from text and persists them as timeline events.
 * - confidence >= AUTO_ACCEPT_THRESHOLD → final event (eventDate = extracted date)
 * - confidence <  AUTO_ACCEPT_THRESHOLD → needsReview candidate (not silently final)
 * In all cases uploadDate = now (so the AUDIT/action date stays distinct from the
 * extracted event date).
 */
export async function createCandidatesFromText(opts: PersistOpts): Promise<TimelineEvent[]> {
  const candidates = extractTimelineCandidates(opts.text, { sourceHint: opts.sourceHint });
  const now = new Date();
  const created: TimelineEvent[] = [];
  for (const c of candidates) {
    const needsReview = c.confidence < AUTO_ACCEPT_THRESHOLD;
    const insert: InsertTimelineEvent = {
      claimId: opts.claimId,
      organizationId: opts.orgId,
      eventType: c.eventType,
      title: c.title,
      description: c.description,
      eventDate: c.extractedDate ?? now,
      extractedDate: c.extractedDate ?? null,
      uploadDate: now,
      dateSource: c.dateSource,
      confidenceScore: c.confidence,
      needsReview,
      reviewStatus: needsReview ? "pending" : "auto_accepted",
      sourceDocumentId: opts.sourceDocumentId ?? null,
      sourceAudioId: opts.sourceAudioId ?? null,
      sourceTranscriptId: opts.sourceTranscriptId ?? null,
      createdByUserId: opts.createdByUserId ?? null,
      metadataJson: { rawMatch: c.rawMatch, extractor: "mvp_rule_based_v1" },
    } as InsertTimelineEvent;
    created.push(await storage.createTimelineEvent(insert));
  }
  return created;
}

/** Deterministic sample text so the MVP flow is demonstrable without uploads. */
export function sampleClaimDocumentText(claimNumber?: string): string {
  return [
    `RE: Claim ${claimNumber || "(on file)"}`,
    `Date of loss: 04/18/2026 (hail and wind event).`,
    `An inspection was completed on April 25, 2026 by the field adjuster.`,
    `The carrier issued a partial denial dated 05/02/2026 citing wear and tear.`,
    `A supplement was submitted on 05/10/2026 for drip edge and starter course.`,
    `Reinspection scheduled for May 20, 2026.`,
    `Please respond by deadline 06/15/2026 to preserve appraisal rights.`,
  ].join("\n");
}
