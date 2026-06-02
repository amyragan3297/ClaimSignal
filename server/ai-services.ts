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

const EXTRACTION_SYSTEM_PROMPT = `You are an expert property insurance claims analyst. Extract structured data from insurance claim documents with high precision. Only include fields where you have clear evidence in the text — never invent or guess values. Respond ONLY with valid JSON.`;

export async function extractClaimFieldsFromText(
  text: string,
  hint?: string
): Promise<ExtractionResult> {
  const client = getOpenAIClient();
  const truncated = text.slice(0, 12000);
  const docHint = hint ? hint.replace(/_/g, " ") : "insurance document";

  const userPrompt = `Extract all claim-related information from this ${docHint} and return JSON with this schema (omit any field not found in the text — never invent):

{
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
  "propertyAddress": "street address of property",
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
}

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

// ── Playbook: AI-enhanced natural language query parsing ──────────────────────
// Parses a free-text search query into structured PlaybookFilters.
// Caller is responsible for importing PlaybookFilters from playbook-engine.

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
