import { zodResponseFormat } from "openai/helpers/zod";
import { getOpenAIClient } from "../openai";
import {
  ClaimBasics, People, Financials, Dates, Vendors, Evidence,
  type SectionedExtraction,
} from "./schema";
import type { ExtractionResult } from "../ai-services";

const ANALYSIS_MODEL = "gpt-5.4";

const SECTIONS = {
  basics:     { schema: ClaimBasics,  name: "ClaimBasics" },
  people:     { schema: People,       name: "People" },
  financials: { schema: Financials,   name: "Financials" },
  dates:      { schema: Dates,        name: "Dates" },
  vendors:    { schema: Vendors,      name: "Vendors" },
  evidence:   { schema: Evidence,     name: "Evidence" },
} as const;

const PROMPTS: Record<keyof typeof SECTIONS, string> = {
  basics:
    "Extract claim identifiers: claim number, carrier, policy number, loss type. " +
    "Also capture dateOfLoss (yyyy-mm-dd), dateReported (yyyy-mm-dd), denial reason, " +
    "initialOutcome/finalOutcome (approved|denied|partial|pending), and denialOverturned boolean. " +
    "Return null for any field not explicitly stated.",
  people:
    "Extract homeowner full name, phone, and email. Extract insuredName if different from homeowner. " +
    "Extract street address into propertyAddress (street only, e.g. '742 Elm St'), then city, state (2-letter), zipCode separately. " +
    "Extract adjuster full name, phone, email, and IA firm name. " +
    "Return null for anything not present in the document.",
  financials:
    "Extract dollar amounts as plain numbers (no $ signs or commas). " +
    "Fields: rcv (replacement cost value), acv (actual cash value), deductible, netClaim, " +
    "supplementTotal, depreciation, supplementRequested, supplementApproved, approvedAmount, " +
    "claimAmount (total submitted), finalPaid, recoverableDepreciation. " +
    "Return null for any amount not stated. Do not calculate or infer totals.",
  dates:
    "Extract dates as yyyy-mm-dd strings. " +
    "Fields: inspectionDate, estimateDate, denialDate, approvalDate, paymentDate. " +
    "Convert any MM/DD/YYYY or spelled-out dates to yyyy-mm-dd. Return null if not found.",
  vendors:
    "Extract third-party service provider names: contractor (roofing/restoration company), " +
    "engineer (engineering firm), publicAdjuster (public adjuster name or firm), " +
    "attorney (legal counsel), vendorName (ITEL, material supplier, or other vendor). " +
    "Return null if not found.",
  evidence:
    "Answer yes/no for each: " +
    "photoInspectionDone (were inspection photos documented?), " +
    "weatherEventConfirmed (is a storm or weather event explicitly confirmed?), " +
    "scopeOfLossPresent (is a scope of loss or scope of work included in this document?). " +
    "Return true, false, or null if not determinable.",
};

async function extractSection<K extends keyof typeof SECTIONS>(
  section: K,
  docText: string,
  docType: string,
): Promise<SectionedExtraction[K]> {
  const { schema, name } = SECTIONS[section];
  const client = getOpenAIClient();

  const completion = await client.chat.completions.create({
    model: ANALYSIS_MODEL,
    temperature: 0,
    response_format: zodResponseFormat(schema, name),
    messages: [
      {
        role: "system",
        content:
          `You extract insurance claim data from a "${docType}" document.\n` +
          PROMPTS[section] +
          "\nRules: Never invent values. If a field is not explicitly present, return null. Do not omit keys.",
      },
      { role: "user", content: docText.slice(0, 12000) },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  return schema.parse(JSON.parse(raw)) as SectionedExtraction[K];
}

export async function extractAll(docText: string, docType: string): Promise<SectionedExtraction> {
  const [basics, people, financials, dates, vendors, evidence] = await Promise.all([
    extractSection("basics",     docText, docType),
    extractSection("people",     docText, docType),
    extractSection("financials", docText, docType),
    extractSection("dates",      docText, docType),
    extractSection("vendors",    docText, docType),
    extractSection("evidence",   docText, docType),
  ]);
  return { basics, people, financials, dates, vendors, evidence };
}

/**
 * Convert the 6-section structured result into the flat ExtractionResult shape
 * that the rest of the evidence pipeline expects.
 */
export function sectionedToExtractionResult(
  s: SectionedExtraction,
  docType: string,
): ExtractionResult {
  const str = (v: string | null | undefined): string | undefined =>
    v != null && v.trim() ? v.trim() : undefined;

  const numStr = (v: number | null | undefined): string | undefined =>
    v != null ? v.toFixed(2) : undefined;

  const bool = (v: boolean | null | undefined): boolean | undefined =>
    v != null ? v : undefined;

  return {
    extractionMethod: "llm",
    confidence: 0.88,

    claimNumber:    str(s.basics.claimNumber),
    carrier:        str(s.basics.carrier),
    policyNumber:   str(s.basics.policyNumber),
    lossType:       str(s.basics.lossType),
    dateOfLoss:     str(s.basics.dateOfLoss),
    denialReason:   str(s.basics.denialReason),
    initialOutcome: str(s.basics.initialOutcome ?? undefined),
    finalOutcome:   str(s.basics.finalOutcome ?? undefined),
    denialOverturned: bool(s.basics.denialOverturned),

    homeownerName:  str(s.people.homeownerName),
    homeownerPhone: str(s.people.homeownerPhone),
    homeownerEmail: str(s.people.homeownerEmail),
    insuredName:    str(s.people.insuredName),
    propertyAddress: str(s.people.propertyAddress),
    city:           str(s.people.city),
    state:          str(s.people.state),
    zipCode:        str(s.people.zipCode),
    adjusterName:   str(s.people.adjusterName),
    adjusterPhone:  str(s.people.adjusterPhone),
    adjusterEmail:  str(s.people.adjusterEmail),
    iaFirm:         str(s.people.iaFirm),

    rcv:                   numStr(s.financials.rcv),
    acv:                   numStr(s.financials.acv),
    deductible:            numStr(s.financials.deductible),
    supplementTotal:       numStr(s.financials.supplementTotal ?? s.financials.netClaim),
    supplementRequested:   numStr(s.financials.supplementRequested),
    supplementApproved:    numStr(s.financials.supplementApproved),
    approvedAmount:        numStr(s.financials.approvedAmount),
    claimAmount:           numStr(s.financials.claimAmount),
    finalPaid:             numStr(s.financials.finalPaid),
    recoverableDepreciation: numStr(s.financials.recoverableDepreciation ?? s.financials.depreciation),

    inspectionDate: str(s.dates.inspectionDate),
    estimateDate:   str(s.dates.estimateDate),
    denialDate:     str(s.dates.denialDate),
    approvalDate:   str(s.dates.approvalDate),
    paymentDate:    str(s.dates.paymentDate),

    vendor: str(
      s.vendors.vendorName ??
      s.vendors.engineer ??
      s.vendors.contractor,
    ),

    documentType: docType,
  };
}
