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
  const parsed = JSON.parse(raw);

  return {
    narrative: typeof parsed.narrative === "string" ? parsed.narrative : "",
    riskExplanation: typeof parsed.riskExplanation === "string" ? parsed.riskExplanation : "",
    topMissingScope: Array.isArray(parsed.topMissingScope) ? parsed.topMissingScope.map(String) : [],
    codeCompliance: typeof parsed.codeCompliance === "string" ? parsed.codeCompliance : "",
    suggestedAction: typeof parsed.suggestedAction === "string" ? parsed.suggestedAction : "",
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps.map(String) : [],
    recommendedActions: Array.isArray(parsed.recommendedActions)
      ? parsed.recommendedActions
          .filter((a: any) => a && typeof a.title === "string")
          .map((a: any) => ({
            title: String(a.title),
            detail: typeof a.detail === "string" ? a.detail : "",
            priority: ["high", "medium", "low"].includes(a.priority) ? a.priority : "medium",
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
