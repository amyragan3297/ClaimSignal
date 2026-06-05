import { spawn } from "child_process";
import { writeFile, unlink, readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import { getOpenAIClient, isOpenAIConfigured, toFile } from "./openai";
import type { Claim } from "@shared/schema";

export { isOpenAIConfigured };


// the newest OpenAI model is "gpt-5.4" — do not change unless explicitly requested.
const ANALYSIS_MODEL = "gpt-5.4";
const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

// ---------------------------------------------------------------------------
// Last-error tracking — never stored to DB, lives only in process memory.
// Cleared on restart. Used by the /api/health endpoint.
// ---------------------------------------------------------------------------
interface AiErrorRecord {
  message: string;
  operation: string;
  at: string; // ISO timestamp
}

let _lastAiError: AiErrorRecord | null = null;

export function recordAiError(operation: string, err: unknown): void {
  const message = err instanceof Error ? (err as Error).message : String(err);
  // Strip any potential token/key fragments from the log message.
  const safe = message.replace(/sk-[A-Za-z0-9\-_]{8,}/g, "[REDACTED]");
  _lastAiError = { operation, message: safe, at: new Date().toISOString() };
}

export function getAiStatus(): {
  apiKeyPresent: boolean;
  baseUrlPresent: boolean;
  analysisModel: string;
  transcribeModel: string;
  lastError: AiErrorRecord | null;
} {
  return {
    apiKeyPresent: Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY),
    baseUrlPresent: Boolean(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL),
    analysisModel: ANALYSIS_MODEL,
    transcribeModel: TRANSCRIBE_MODEL,
    lastError: _lastAiError,
  };
}

export interface ClaimAnalysis {
  narrative: string;
  riskExplanation: string;
  topMissingScope: string[];
  codeCompliance: string;
  suggestedAction: string;
  gaps: string[];
  recommendedActions: { title: string; detail: string; priority: "high" | "medium" | "low" }[];
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(not provided)";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function buildClaimContext(claim: Claim): string {
  // Intentionally exclude direct PII identifiers (claim number, policy number,
  // homeowner/insured names, contact info, street address) from the LLM prompt.
  const lines: string[] = [
    `Carrier: ${fmt(claim.carrier)}`,
    `Loss Type: ${fmt(claim.lossType)}`,
    `Claim Type: ${fmt(claim.claimType)}`,
    `Property Type: ${fmt(claim.propertyType)}`,
    `Status: ${fmt(claim.status)}`,
    `Current Phase: ${fmt(claim.currentPhase)}`,
    `Date of Loss: ${fmt(claim.dateOfLoss || claim.lossDate)}`,
    `Inspection Date: ${fmt(claim.inspectionDate)}`,
    `Determination Date: ${fmt(claim.determinationDate)}`,
    `Location: ${fmt(claim.city)}, ${fmt(claim.state)} ${fmt(claim.zipCode)}`,
    `Claim Amount: ${fmt(claim.claimAmount)}`,
    `Approved Amount: ${fmt(claim.approvedAmount)}`,
    `RCV: ${fmt(claim.rcvAmount)} | ACV: ${fmt(claim.acvAmount)} | Deductible: ${fmt(claim.deductible)}`,
    `Supplement Requested: ${fmt(claim.supplementRequested)} | Approved: ${fmt(claim.supplementApproved)}`,
    `Friction Score: ${fmt(claim.frictionScore)} | Scope Delta: ${fmt(claim.scopeDeltaScore)}`,
    `Escalation Level: ${fmt(claim.escalationLevel)} | Approval Probability: ${fmt(claim.approvalProbability)}`,
    `Denial Reason: ${fmt(claim.denialReason)}`,
    `Initial Outcome: ${fmt(claim.initialOutcome)} | Final Outcome: ${fmt(claim.finalOutcome)}`,
    `Vendor / Engineering: ${fmt(claim.engineeringFirm)} | ITEL: ${fmt(claim.itelVendor)} | Finding: ${fmt(claim.vendorFinding)}`,
    `Documentation on file: ${[
      claim.photosUploaded && "photos",
      claim.denialLetterUploaded && "denial letter",
      claim.estimateUploaded && "estimate",
      claim.supplementUploaded && "supplement",
      claim.codeDocUploaded && "code documentation",
      claim.manufacturerDocUploaded && "manufacturer documentation",
    ].filter(Boolean).join(", ") || "none recorded"}`,
    `Notes: ${fmt(claim.notes)}`,
  ];
  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are an expert property insurance claims analyst for restoration contractors and public adjusters. You analyze a single claim's structured data and produce defensible, practical intelligence. Be specific and grounded only in the data provided — never invent homeowner PII, dollar figures, or facts not present. When information is missing, say so and treat it as a documentation gap. Respond ONLY with valid JSON matching the requested schema.`;

interface RawRecommendedAction {
  title?: unknown;
  detail?: unknown;
  priority?: unknown;
}

export async function generateClaimAnalysis(claim: Claim): Promise<ClaimAnalysis> {
  const client = getOpenAIClient();
  const context = buildClaimContext(claim);

  const userPrompt = `Analyze this property insurance claim and return JSON with this exact shape:
{
  "narrative": "2-4 sentence plain-language summary of where this claim stands and its risk posture",
  "riskExplanation": "1-2 sentences explaining the primary risk driver(s)",
  "topMissingScope": ["short scope item likely missing or under-documented", "..."],
  "codeCompliance": "1-2 sentences on building-code / IRC compliance leverage or exposure",
  "suggestedAction": "the single most important next action to take",
  "gaps": ["documentation or process gap to address", "..."],
  "recommendedActions": [{"title": "short action", "detail": "1 sentence on how/why", "priority": "high|medium|low"}]
}

Keep arrays focused (3-6 items). CLAIM DATA:
${context}`;

  const completion = await client.chat.completions.create({
    model: ANALYSIS_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  return {
    narrative: typeof parsed.narrative === "string" ? parsed.narrative : "",
    riskExplanation: typeof parsed.riskExplanation === "string" ? parsed.riskExplanation : "",
    topMissingScope: Array.isArray(parsed.topMissingScope) ? (parsed.topMissingScope as unknown[]).map(String) : [],
    codeCompliance: typeof parsed.codeCompliance === "string" ? parsed.codeCompliance : "",
    suggestedAction: typeof parsed.suggestedAction === "string" ? parsed.suggestedAction : "",
    gaps: Array.isArray(parsed.gaps) ? (parsed.gaps as unknown[]).map(String) : [],
    recommendedActions: Array.isArray(parsed.recommendedActions)
      ? (parsed.recommendedActions as RawRecommendedAction[])
          .filter((a) => a && typeof a.title === "string")
          .map((a) => ({
            title: String(a.title),
            detail: typeof a.detail === "string" ? a.detail : "",
            priority: (["high", "medium", "low"] as const).includes(a.priority as "high" | "medium" | "low")
              ? (a.priority as "high" | "medium" | "low")
              : ("medium" as const),
          }))
      : [],
  };
}

// ── Audio transcription ────────────────────────────────────────────────

type CompatFormat = "wav" | "mp3";

function detectAudioFormat(buffer: Buffer): string {
  if (buffer.length < 12) return "unknown";
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return "wav";
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return "webm";
  if ((buffer[0] === 0xff && (buffer[1] === 0xfb || buffer[1] === 0xfa || buffer[1] === 0xf3)) ||
      (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33)) return "mp3";
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) return "mp4";
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) return "ogg";
  return "unknown";
}

async function convertToWav(audioBuffer: Buffer): Promise<Buffer> {
  const inputPath = join(tmpdir(), `in-${randomUUID()}`);
  const outputPath = join(tmpdir(), `out-${randomUUID()}.wav`);
  try {
    await writeFile(inputPath, audioBuffer);
    await new Promise<void>((resolve, reject) => {
      const ff = spawn("ffmpeg", ["-i", inputPath, "-vn", "-f", "wav", "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", "-y", outputPath]);
      ff.stderr.on("data", () => {});
      ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
      ff.on("error", reject);
    });
    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

async function ensureCompatible(buffer: Buffer): Promise<{ buffer: Buffer; format: CompatFormat }> {
  const detected = detectAudioFormat(buffer);
  if (detected === "wav") return { buffer, format: "wav" };
  if (detected === "mp3") return { buffer, format: "mp3" };
  return { buffer: await convertToWav(buffer), format: "wav" };
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const client = getOpenAIClient();
  const { buffer, format } = await ensureCompatible(audioBuffer);
  const file = await toFile(buffer, `audio.${format}`);
  const response = await client.audio.transcriptions.create({ file, model: TRANSCRIBE_MODEL });
  return response.text;
}

// ── AI document field extraction ──────────────────────────────────────────────

export interface ExtractionResult {
  claimNumber?: string;
  policyNumber?: string;
  homeownerName?: string;
  insuredName?: string;
  adjusterName?: string;
  adjusterEmail?: string;
  adjusterPhone?: string;
  iaFirm?: string;
  carrier?: string;
  vendor?: string;
  propertyAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  dateOfLoss?: string;
  inspectionDate?: string;
  estimateDate?: string;
  denialDate?: string;
  approvalDate?: string;
  paymentDate?: string;
  rcv?: string;
  acv?: string;
  deductible?: string;
  recoverableDepreciation?: string;
  supplementRequested?: string;
  supplementApproved?: string;
  approvedAmount?: string;
  denialReason?: string;
  initialOutcome?: string;
  finalOutcome?: string;
  denialOverturned?: boolean;
  missingScopeItems?: string[];
  codeItems?: string[];
  reinspectionReferences?: string[];
  escalationReferences?: string[];
  timelineEvents?: Array<{ date: string; description: string }>;
  documentType?: string;
  confidence: number;
  extractionMethod: "llm";
}

const EXTRACTION_SYSTEM_PROMPT = `You are an expert property insurance claims analyst. Extract structured data from insurance claim documents with high precision.

Rules you must follow exactly:
1. Only include fields where you have clear evidence in the document — never invent or guess values.
2. Respond ONLY with valid JSON matching the provided schema.
3. "propertyAddress" must contain ONLY the street address (e.g. "123 Main St" or "456 Oak Ave Apt 2"). Never include city, state, zip, date of loss, carrier name, policy number, or any other information in this field. If you cannot extract a clean street address, omit this field entirely.
4. All date fields (dateOfLoss, inspectionDate, etc.) must be in YYYY-MM-DD format only. Convert any MM/DD/YYYY or spelled-out dates to YYYY-MM-DD before returning. If you cannot determine a date with confidence, omit that field.
5. Numeric fields (rcv, acv, deductible, etc.) must be plain decimal strings, e.g. "18500.00". No currency symbols or commas.`;

const EXTRACTION_SCHEMA = `{
  "claimNumber": "claim number string",
  "policyNumber": "policy number string",
  "homeownerName": "homeowner full name",
  "insuredName": "insured party full name",
  "adjusterName": "adjuster full name",
  "adjusterEmail": "adjuster email",
  "adjusterPhone": "adjuster phone number",
  "iaFirm": "independent adjusting firm name",
  "carrier": "insurance carrier or company name",
  "vendor": "engineering firm, ITEL, or vendor name",
  "propertyAddress": "street address ONLY — e.g. '123 Main St' (never include city, state, zip, dates, or carrier info)",
  "city": "city",
  "state": "2-letter state code",
  "zipCode": "zip code",
  "dateOfLoss": "YYYY-MM-DD",
  "inspectionDate": "YYYY-MM-DD",
  "estimateDate": "YYYY-MM-DD",
  "denialDate": "YYYY-MM-DD",
  "approvalDate": "YYYY-MM-DD",
  "paymentDate": "YYYY-MM-DD",
  "rcv": "replacement cost value as decimal string e.g. '18500.00'",
  "acv": "actual cash value as decimal string",
  "deductible": "deductible amount as decimal string",
  "recoverableDepreciation": "recoverable depreciation as decimal string",
  "supplementRequested": "supplement amount requested as decimal string",
  "supplementApproved": "supplement amount approved as decimal string",
  "approvedAmount": "total approved or settled payment amount as decimal string e.g. '5000.00'",
  "denialReason": "reason for denial or coverage exclusion",
  "initialOutcome": "one of: approved | denied | partial | pending",
  "finalOutcome": "one of: approved | denied | partial | pending",
  "denialOverturned": true or false,
  "missingScopeItems": ["scope item not included or disputed", "..."],
  "codeItems": ["building code or IRC item referenced", "..."],
  "reinspectionReferences": ["reinspection request or result", "..."],
  "escalationReferences": ["appraisal clause, litigation, or escalation mention", "..."],
  "timelineEvents": [{"date": "YYYY-MM-DD", "description": "brief event description"}],
  "documentType": "denial_letter | estimate | scope | supplement | payment_letter | invoice | policy | email_thread | other",
  "confidence": 0.0 to 1.0
}`;

function parseExtractionResponse(raw: string): ExtractionResult {
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  const arr = (v: unknown): string[] | undefined =>
    Array.isArray(v) && v.length > 0 ? (v as unknown[]).filter((x) => typeof x === "string") as string[] : undefined;

  const result: ExtractionResult = {
    extractionMethod: "llm",
    confidence:
      typeof parsed.confidence === "number"
        ? Math.min(Math.max(parsed.confidence, 0), 1)
        : 0.5,
  };

  const textFields: Array<keyof ExtractionResult> = [
    "claimNumber", "policyNumber", "homeownerName", "insuredName",
    "adjusterName", "adjusterEmail", "adjusterPhone", "iaFirm", "carrier", "vendor",
    "propertyAddress", "city", "state", "zipCode",
    "dateOfLoss", "inspectionDate", "estimateDate", "denialDate", "approvalDate", "paymentDate",
    "rcv", "acv", "deductible", "recoverableDepreciation", "supplementRequested", "supplementApproved",
    "approvedAmount",
    "denialReason", "initialOutcome", "finalOutcome", "documentType",
  ];
  for (const key of textFields) {
    const v = str(parsed[key]);
    if (v !== undefined) Object.assign(result, { [key]: v });
  }

  if (typeof parsed.denialOverturned === "boolean") {
    result.denialOverturned = parsed.denialOverturned;
  }

  const arrayFields: Array<keyof ExtractionResult> = ["missingScopeItems", "codeItems", "reinspectionReferences", "escalationReferences"];
  for (const key of arrayFields) {
    const v = arr(parsed[key]);
    if (v) Object.assign(result, { [key]: v });
  }

  if (Array.isArray(parsed.timelineEvents)) {
    interface RawTimelineEvent { date?: unknown; description?: unknown }
    const evts = (parsed.timelineEvents as RawTimelineEvent[]).filter(
      (e): e is { date: string; description: string } =>
        !!e && typeof e.date === "string" && typeof e.description === "string"
    );
    if (evts.length > 0) result.timelineEvents = evts.map((e) => ({ date: e.date, description: e.description }));
  }

  return result;
}

export async function extractClaimFieldsFromText(
  text: string,
  hint?: string
): Promise<ExtractionResult> {
  const client = getOpenAIClient();
  const truncated = text.slice(0, 12000);
  const docHint = hint ? hint.replace(/_/g, " ") : "insurance document";

  const userPrompt = `Extract all claim-related information from this ${docHint} and return JSON with this schema (omit any field not found in the text — never invent).

CRITICAL FORMAT RULES:
- "propertyAddress" = street address line only (e.g. "742 Evergreen Terrace"). Do NOT put date of loss, carrier, or other fields here.
- All dates must be YYYY-MM-DD (convert "01/15/2025" → "2025-01-15", "January 15, 2025" → "2025-01-15").
- Numeric values as plain decimal strings without $ or commas.

${EXTRACTION_SCHEMA}

DOCUMENT TEXT:
${truncated}`;

  const completion = await client.chat.completions.create({
    model: ANALYSIS_MODEL,
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  return parseExtractionResponse(raw);
}

/**
 * Vision-based extraction for scanned / image-only documents (PDFs with no
 * embedded text layer, photographed letters, JPG/PNG uploads). Pass one or more
 * image data URLs (e.g. "data:image/png;base64,...."). Used as a fallback when
 * pdf-parse yields no readable text.
 */
export async function extractClaimFieldsFromImages(
  imageDataUrls: string[],
  hint?: string
): Promise<ExtractionResult> {
  const client = getOpenAIClient();
  const docHint = hint ? hint.replace(/_/g, " ") : "insurance document";
  const images = imageDataUrls.slice(0, 6);

  const instruction = `These image(s) are pages of a ${docHint}. Read all visible text (including handwriting, stamps, and tables) and extract claim-related information. Return JSON with this schema (omit any field not visible in the images — never invent).

CRITICAL FORMAT RULES:
- "propertyAddress" = street address line only (e.g. "742 Evergreen Terrace"). Do NOT put date of loss, carrier, or other fields here.
- All dates must be YYYY-MM-DD (convert "01/15/2025" → "2025-01-15", "January 15, 2025" → "2025-01-15").
- Numeric values as plain decimal strings without $ or commas.

${EXTRACTION_SCHEMA}`;

  const completion = await client.chat.completions.create({
    model: ANALYSIS_MODEL,
    messages: [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: instruction },
          ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
        ],
      },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  return parseExtractionResponse(raw);
}

// ── Playbook: AI strategy synthesis ───────────────────────────────────────────

export interface PlaybookStrategy {
  summary: string;
  prioritizedSteps: Array<{
    step: string;
    rationale: string;
    priority: "critical" | "high" | "medium";
  }>;
  keyLeveragePoints: string[];
  warningFlags: string[];
}

interface RawPrioritizedStep {
  step?: unknown;
  rationale?: unknown;
  priority?: unknown;
}

export async function generatePlaybookStrategy(
  claim: Claim,
  playbooks: Array<{
    title: string;
    whatWorked?: string | null;
    outcome?: string | null;
    scenarioType?: string | null;
    carrier?: string | null;
    claimType?: string | null;
    recommendedNextStep?: string | null;
    confidenceScore?: number | null;
  }>,
): Promise<PlaybookStrategy> {
  const client = getOpenAIClient();
  const context = buildClaimContext(claim);

  const playbookContext = playbooks
    .map(
      (p, i) =>
        `[Pattern ${i + 1}: ${p.title}]` +
        (p.whatWorked ? `\nWhat worked: ${p.whatWorked}` : "") +
        (p.outcome ? `\nOutcome: ${p.outcome}` : "") +
        (p.recommendedNextStep ? `\nNext step: ${p.recommendedNextStep}` : ""),
    )
    .join("\n\n");

  const userPrompt = `Given this active claim and historical patterns that resolved similarly, generate a tailored action strategy. Do not reference homeowner names, policy numbers, or any PII. Return JSON with this exact shape:
{
  "summary": "1-2 sentence strategic overview of what this claim needs most urgently",
  "prioritizedSteps": [{"step": "concise action phrase", "rationale": "why — grounded in the patterns", "priority": "critical|high|medium"}],
  "keyLeveragePoints": ["specific leverage to use with this carrier or adjuster type"],
  "warningFlags": ["risk or resistance pattern to watch for"]
}
Keep prioritizedSteps to 3-5 items. Base everything only on the data provided — never invent facts.

ACTIVE CLAIM:
${context}

HISTORICAL PATTERNS THAT RESOLVED SIMILARLY:
${playbookContext}`;

  const completion = await client.chat.completions.create({
    model: ANALYSIS_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    prioritizedSteps: Array.isArray(parsed.prioritizedSteps)
      ? (parsed.prioritizedSteps as RawPrioritizedStep[])
          .filter((s): s is RawPrioritizedStep & { step: string } => typeof s?.step === "string")
          .map((s) => ({
            step: s.step,
            rationale: typeof s.rationale === "string" ? s.rationale : "",
            priority: (["critical", "high", "medium"] as const).includes(s.priority as "critical" | "high" | "medium")
              ? (s.priority as "critical" | "high" | "medium")
              : ("medium" as const),
          }))
      : [],
    keyLeveragePoints: Array.isArray(parsed.keyLeveragePoints)
      ? (parsed.keyLeveragePoints as unknown[]).map(String)
      : [],
    warningFlags: Array.isArray(parsed.warningFlags)
      ? (parsed.warningFlags as unknown[]).map(String)
      : [],
  };
}

// ── Playbook: AI fallback recommendations (no library matches) ────────────────

export interface AiFallbackRecommendation {
  title: string;
  recommendedNextStep: string;
  rationale: string;
  source: "ai_generated";
}

export async function generateAiFallbackPlaybookRecs(claim: Claim): Promise<AiFallbackRecommendation[]> {
  const client = getOpenAIClient();
  const carrier = claim.carrier || "the carrier";
  const lossType = claim.lossType || claim.claimType || "the loss type";
  const denialReason = claim.denialReason || null;
  const phase = claim.currentPhase || claim.status || null;

  const userPrompt = `You are an expert property insurance claims consultant. Generate 2-3 specific, actionable strategy recommendations for a claim with the following context. Do not reference any PII, homeowner names, or policy numbers. Return JSON with this exact shape:
{
  "recommendations": [
    {
      "title": "Short action title (max 8 words)",
      "recommendedNextStep": "Specific actionable instruction (1-2 sentences)",
      "rationale": "Why this tactic works for this carrier/loss type (1 sentence)"
    }
  ]
}

Claim context:
- Carrier: ${carrier}
- Loss Type: ${lossType}
${denialReason ? `- Denial Reason: ${denialReason}` : ""}
${phase ? `- Current Phase: ${phase}` : ""}

Base recommendations only on the data provided. Be specific to the carrier and loss type where possible.`;

  const completion = await client.chat.completions.create({
    model: ANALYSIS_MODEL,
    messages: [
      { role: "system", content: "You are an expert property insurance claims consultant who generates specific tactical recommendations. Return only valid JSON." },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const recs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
  return recs
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null && typeof r.title === "string")
    .map((r) => ({
      title: String(r.title),
      recommendedNextStep: typeof r.recommendedNextStep === "string" ? r.recommendedNextStep : "",
      rationale: typeof r.rationale === "string" ? r.rationale : "",
      source: "ai_generated" as const,
    }));
}

// ── Playbook: AI entry generation from seed inputs ────────────────────────────

export interface GeneratedPlaybookEntry {
  title: string;
  actionTaken: string;
  whatWorked: string;
  whatDidNotWork: string;
  timelineSummary: string;
  recommendedNextStep: string;
  missingScopeItems: string[];
  documentationUsed: string[];
  outcome: string;
  confidenceScore: number;
}

export async function generatePlaybookEntry(seed: {
  scenarioType?: string;
  carrier?: string;
  claimType?: string;
  denialReason?: string;
}): Promise<GeneratedPlaybookEntry> {
  const client = getOpenAIClient();

  const seedLines = [
    seed.scenarioType ? `Scenario type: ${seed.scenarioType}` : null,
    seed.carrier ? `Carrier: ${seed.carrier}` : null,
    seed.claimType ? `Claim type: ${seed.claimType}` : null,
    seed.denialReason ? `Denial reason: ${seed.denialReason}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const userPrompt = `You are generating a playbook entry for a property insurance claims intelligence platform. Based on the seed inputs below, produce a realistic, actionable playbook entry that describes what action was taken, what worked, what didn't, the recommended next step, and supporting context. Do not invent PII (no homeowner names, addresses, policy numbers). Use professional insurance/restoration industry language. Return JSON matching this exact shape:

{
  "title": "concise playbook title (10 words max) summarizing the scenario and outcome",
  "actionTaken": "2-4 sentences describing the specific actions taken on this type of claim",
  "whatWorked": "2-3 sentences on the tactics or documentation that produced a positive result",
  "whatDidNotWork": "1-2 sentences on approaches that failed or stalled the claim",
  "timelineSummary": "1-2 sentences describing the typical timeline arc for this scenario",
  "recommendedNextStep": "1-2 sentences — the most important action for a claim in this situation right now",
  "missingScopeItems": ["scope line item commonly missed", "..."],
  "documentationUsed": ["document type that supported the case", "..."],
  "outcome": "brief outcome label (e.g. denial_overturned, supplement_approved, partial_settlement)",
  "confidenceScore": 0.0-1.0 float based on how specific/actionable the entry is
}

Keep missingScopeItems and documentationUsed to 3-5 items each. Base everything on common property insurance claim patterns for the given inputs.

SEED INPUTS:
${seedLines || "(no seed inputs — generate a general best-practice playbook entry)"}`;

  const completion = await client.chat.completions.create({
    model: ANALYSIS_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  return {
    title: typeof parsed.title === "string" ? parsed.title : "AI-Generated Playbook Entry",
    actionTaken: typeof parsed.actionTaken === "string" ? parsed.actionTaken : "",
    whatWorked: typeof parsed.whatWorked === "string" ? parsed.whatWorked : "",
    whatDidNotWork: typeof parsed.whatDidNotWork === "string" ? parsed.whatDidNotWork : "",
    timelineSummary: typeof parsed.timelineSummary === "string" ? parsed.timelineSummary : "",
    recommendedNextStep: typeof parsed.recommendedNextStep === "string" ? parsed.recommendedNextStep : "",
    missingScopeItems: Array.isArray(parsed.missingScopeItems)
      ? (parsed.missingScopeItems as unknown[]).map(String)
      : [],
    documentationUsed: Array.isArray(parsed.documentationUsed)
      ? (parsed.documentationUsed as unknown[]).map(String)
      : [],
    outcome: typeof parsed.outcome === "string" ? parsed.outcome : "",
    confidenceScore: typeof parsed.confidenceScore === "number"
      ? Math.min(1, Math.max(0, parsed.confidenceScore))
      : 0.75,
  };
}

// ── Playbook: AI-enhanced natural language query parsing ──────────────────────
// Parses a free-text search query into structured PlaybookFilters.
// Caller is responsible for importing PlaybookFilters from playbook-engine.

export async function generateDenialToApprovalPatterns(
  target: { carrier?: string; lossType?: string; claimType?: string; denialReason?: string; city?: string; state?: string },
  historicalCases: Array<{
    carrier: string;
    lossType?: string;
    claimType?: string;
    initialOutcome?: string;
    finalOutcome?: string;
    denialReason?: string;
    whatWorked?: string;
    whatDidNotWork?: string;
    escalationUsed?: boolean;
    reinspectionRequested?: boolean;
    reinspectionOutcome?: string;
    supplementOutcome?: string;
    denialOverturned?: boolean;
    adjusterNames: string[];
    evidenceCategories: string[];
    timelinePhases: string[];
    aiSummary?: string;
  }>
): Promise<{
  summary: string;
  patterns: Array<{ name: string; description: string; frequency: number }>;
  topStrategies: string[];
  commonDocumentation: string[];
  typicalTimeline: string;
  confidence: number;
}> {
  const client = getOpenAIClient();
  if (historicalCases.length === 0) {
    return {
      summary: "No historical denial-to-approval cases found yet in this data set.",
      patterns: [],
      topStrategies: [],
      commonDocumentation: [],
      typicalTimeline: "Insufficient data",
      confidence: 0,
    };
  }

  const targetContext = [
    target.carrier ? `Carrier: ${target.carrier}` : null,
    target.lossType ? `Loss Type: ${target.lossType}` : null,
    target.claimType ? `Claim Type: ${target.claimType}` : null,
    target.denialReason ? `Denial Reason: ${target.denialReason}` : null,
    target.city || target.state ? `Location: ${target.city || ""}, ${target.state || ""}` : null,
  ].filter(Boolean).join("\n");

  const casesJson = JSON.stringify(
    historicalCases.map((c, i) => ({
      index: i + 1,
      carrier: c.carrier,
      lossType: c.lossType || null,
      claimType: c.claimType || null,
      initialOutcome: c.initialOutcome || null,
      finalOutcome: c.finalOutcome || null,
      denialReason: c.denialReason || null,
      whatWorked: c.whatWorked || null,
      whatDidNotWork: c.whatDidNotWork || null,
      escalationUsed: c.escalationUsed || false,
      reinspectionRequested: c.reinspectionRequested || false,
      reinspectionOutcome: c.reinspectionOutcome || null,
      supplementOutcome: c.supplementOutcome || null,
      denialOverturned: c.denialOverturned || false,
      adjusters: c.adjusterNames.slice(0, 3),
      evidenceCategories: c.evidenceCategories.slice(0, 5),
      timelinePhases: c.timelinePhases.slice(0, 5),
      aiSummary: c.aiSummary || null,
    })),
    null,
    2
  );

  const userPrompt = `You are a property insurance claims intelligence analyst. Analyze these historical claims that started with a DENIAL and were later overturned to APPROVAL, and identify the patterns that worked.

TARGET CLAIM (the one we want to help):
${targetContext || "(target claim context not fully specified)"}

HISTORICAL DENIAL-OVERTURNED CASES (${historicalCases.length}):
${casesJson.slice(0, 12000)}

Return JSON with this exact shape:
{
  "summary": "2-3 sentences describing the overall pattern landscape for this type of claim",
  "patterns": [
    {
      "name": "short name (5 words max)",
      "description": "1-2 sentences explaining what this pattern looks like and why it worked",
      "frequency": 0.0-1.0 (how many of the historical cases used this pattern)
    }
  ],
  "topStrategies": ["strategy 1", "strategy 2", "..."],
  "commonDocumentation": ["document type commonly used", "..."],
  "typicalTimeline": "1 sentence describing the typical path from denial to approval",
  "confidence": 0.0-1.0 (how confident the analysis is based on data quality)
}

Keep patterns to 3-5 items. Top strategies to 3-5. Common documentation to 3-5. Base everything ONLY on the data provided. Do not invent.`;

  const completion = await client.chat.completions.create({
    model: ANALYSIS_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  const patterns = Array.isArray(parsed.patterns)
    ? (parsed.patterns as unknown[])
      .filter((p) => p && typeof (p as Record<string, unknown>).name === "string")
      .map((p) => ({
        name: String((p as Record<string, unknown>).name),
        description: typeof (p as Record<string, unknown>).description === "string" ? String((p as Record<string, unknown>).description) : "",
        frequency: typeof (p as Record<string, unknown>).frequency === "number" ? Math.min(1, Math.max(0, (p as Record<string, unknown>).frequency as number)) : 0.5,
      }))
    : [];

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "Pattern analysis complete.",
    patterns,
    topStrategies: Array.isArray(parsed.topStrategies) ? (parsed.topStrategies as unknown[]).map(String).slice(0, 6) : [],
    commonDocumentation: Array.isArray(parsed.commonDocumentation) ? (parsed.commonDocumentation as unknown[]).map(String).slice(0, 6) : [],
    typicalTimeline: typeof parsed.typicalTimeline === "string" ? parsed.typicalTimeline : "",
    confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
  };
}

export async function parsePlaybookQueryWithAI(
  query: string,
  knownCarriers: string[],
): Promise<{
  carrier?: string;
  damageType?: string;
  initialOutcome?: string;
  finalOutcome?: string;
  escalationUsed?: boolean;
  reinspectionRequested?: boolean;
  deniedThenApproved?: boolean;
  partialToFull?: boolean;
  supplementOutcome?: string;
  repairabilityIssue?: boolean;
  matchingIssue?: boolean;
  brittleTest?: boolean;
  codeDispute?: boolean;
  missingLineItems?: boolean;
  doiInvolved?: boolean;
}> {
  const client = getOpenAIClient();

  const userPrompt = `Parse this insurance claim search query into structured filters. Return JSON — include only fields that the query explicitly or strongly implies; omit everything else.

Known carriers (use exact name from this list if matched): ${knownCarriers.slice(0, 20).join(", ") || "none"}

Schema (all fields optional):
{
  "carrier": "exact carrier name or null",
  "damageType": "hail|wind|fire|flood|null",
  "initialOutcome": "denied|partial|approved|null",
  "finalOutcome": "denied|partial|approved|null",
  "escalationUsed": true|false|null,
  "reinspectionRequested": true|false|null,
  "deniedThenApproved": true|false|null,
  "partialToFull": true|false|null,
  "supplementOutcome": "any|approved|denied|null",
  "repairabilityIssue": true|false|null,
  "matchingIssue": true|false|null,
  "brittleTest": true|false|null,
  "codeDispute": true|false|null,
  "missingLineItems": true|false|null,
  "doiInvolved": true|false|null
}

QUERY: "${query.slice(0, 300)}"`;

  const completion = await client.chat.completions.create({
    model: ANALYSIS_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a search query parser for an insurance claims system. Extract structured filters from natural language. Return only valid JSON.",
      },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  // Sanitize — only keep truthy non-null values so they cleanly overlay keyword filters.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== null && v !== undefined && v !== "" && v !== false) out[k] = v;
  }
  return out as ReturnType<typeof parsePlaybookQueryWithAI> extends Promise<infer R> ? R : never;
}
