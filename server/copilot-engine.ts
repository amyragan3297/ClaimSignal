// ──────────────────────────────────────────────────────────────────────────
// ClaimSignal AI Copilot Engine (Section 22)
//
// Assembles claim context, calls OpenAI, parses structured response.
// Falls back to rule-based context summary if OpenAI unavailable.
// Never exposes PII to LLM (intentional — strip homeownerName etc.).
// Always returns AI_DISCLOSURE in every response.
// ──────────────────────────────────────────────────────────────────────────
import type { Claim } from "@shared/schema";
import { getOpenAIClient, isOpenAIConfigured } from "./openai";
import type { Escalation } from "@shared/schema";
import type { TimelineEvent } from "@shared/schema";
import type { EvidenceFile } from "@shared/schema";

export const AI_DISCLOSURE =
  "Responses are generated from available claim data, historical claim intelligence, and configured platform rules. " +
  "Recommendations are operational guidance only and are not legal advice, engineering opinions, or claim determinations.";

export interface CopilotResponse {
  answer: string;
  supportingData: Record<string, unknown>;
  suggestedActions: Array<{ action: string; rationale: string }>;
  playbookHint: string | null;
  missingData: string[];
  disclosure: string;
  model: string;
  claimContext: boolean;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(not provided)";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

// ── Context assembly — NO PII sent to LLM ─────────────────────────────────
export function assembleCopilotContext(
  claim: Claim | null,
  escalations: Escalation[],
  timelineEvents: TimelineEvent[],
  evidenceFiles: EvidenceFile[],
  _role: string,
): string {
  if (!claim) return "No specific claim selected. Answering from platform knowledge only.";

  const lines: string[] = [
    `=== CLAIM CONTEXT (NO PII) ===`,
    `Carrier: ${fmt(claim.carrier)}`,
    `Loss Type: ${fmt(claim.lossType)}`,
    `Claim Type: ${fmt(claim.claimType)}`,
    `Property Type: ${fmt(claim.propertyType)}`,
    `Status: ${fmt(claim.status)}`,
    `Current Phase: ${fmt(claim.currentPhase)}`,
    `Date of Loss: ${fmt(claim.dateOfLoss)}`,
    `Storm Event: ${fmt((claim as Record<string, unknown>).stormEventDate)}`,
    `Hail Event: ${fmt((claim as Record<string, unknown>).hailEvent)}`,
    `Wind Event: ${fmt((claim as Record<string, unknown>).windEvent)}`,
    `Initial Outcome: ${fmt(claim.initialOutcome)}`,
    `Final Outcome: ${fmt(claim.finalOutcome)}`,
    `Denial Reason: ${fmt(claim.denialReason)}`,
    `Denial Overturned: ${fmt(claim.denialOverturned)}`,
    `Reinspection Requested: ${fmt(claim.reinspectionRequested)}`,
    `Reinspection Outcome: ${fmt(claim.reinspectionOutcome)}`,
    `Supplement Requested: ${fmt(claim.supplementRequested)}`,
    `Supplement Approved: ${fmt(claim.supplementApproved)}`,
    `Escalation Used: ${fmt(claim.escalationUsed)}`,
    `Payment Received: ${fmt(claim.paymentReceived)}`,
    `Friction Score: ${fmt(claim.frictionScore)}`,
    `Escalation Level: ${fmt(claim.escalationLevel)}`,
    `Approval Probability: ${fmt(claim.approvalProbability)}`,
    ``,
    `=== ESCALATION HISTORY (${escalations.length} records) ===`,
  ];

  for (const e of escalations.slice(0, 5)) {
    lines.push(`  - ${fmt(e.escalationType)}: result=${fmt(e.escalationResult)}, reason="${fmt(e.reasonForEscalation)}", days=${fmt(e.timelineImpactDays)}`);
  }
  if (escalations.length === 0) lines.push("  (none on record)");

  lines.push(``, `=== DOCUMENTS (${evidenceFiles.length} uploaded) ===`);
  const docCats = evidenceFiles.map((f) => f.docCategory).filter(Boolean);
  const catCounts: Record<string, number> = {};
  for (const c of docCats) { const k = c ?? "unknown"; catCounts[k] = (catCounts[k] || 0) + 1; }
  for (const [cat, cnt] of Object.entries(catCounts)) lines.push(`  ${cat}: ${cnt}`);
  if (evidenceFiles.length === 0) lines.push("  (none uploaded)");

  lines.push(``, `=== TIMELINE EVENTS (${timelineEvents.length} events) ===`);
  for (const ev of timelineEvents.slice(0, 8)) {
    lines.push(`  - [${fmt(ev.eventDate)}] ${fmt(ev.eventType)}: ${fmt(ev.description).slice(0, 80)}`);
  }
  if (timelineEvents.length === 0) lines.push("  (none recorded)");

  return lines.join("\n");
}

// ── System prompt ──────────────────────────────────────────────────────────
function buildSystemPrompt(role: string): string {
  const roleInstructions =
    role === "carrier_analyst"
      ? "You are in Executive mode. Provide only AGGREGATE intelligence — no individual homeowner details, no specific claim identifiers, no individual adjuster names. Focus on patterns, rates, and trends."
      : "You are operating in standard intelligence mode. Follow all masking rules — never output homeowner names, addresses, phone numbers, email addresses, claim numbers, or policy numbers.";

  return `You are ClaimSignal AI Copilot — an intelligent claim operations assistant for property insurance professionals.

ROLE: ${roleInstructions}

CAPABILITIES:
- Analyze claim data and answer questions about claim status, risks, and patterns
- Summarize claim activity, escalation history, and document status
- Identify missing documentation and data gaps
- Surface historical patterns and playbook intelligence
- Suggest operational next steps based on available evidence

HARD RULES:
1. NEVER fabricate claim data, adjuster names, carrier names, outcomes, or statistics
2. NEVER expose homeowner names, addresses, phone numbers, emails, claim numbers, or policy numbers
3. NEVER provide legal advice, engineering opinions, or claim determination decisions
4. If you don't have enough data, say "Insufficient data to answer this question" — do not invent
5. All recommendations must be labeled as operational guidance only
6. If asked about weather, note that live weather integration is pending unless weather data is present in context

OUTPUT FORMAT: Respond in valid JSON with this exact structure:
{
  "answer": "<clear, direct answer to the question>",
  "supportingData": { "<key>": "<value>" },
  "suggestedActions": [{ "action": "<action label>", "rationale": "<why, based on context>" }],
  "playbookHint": "<search query for playbook or null>",
  "missingData": ["<item1>", "<item2>"]
}

Always base responses on the provided claim context. Do not invent information not present in the context.`;
}

// ── Rule-based fallback ────────────────────────────────────────────────────
function ruleBasedResponse(question: string, claim: Claim | null): CopilotResponse {
  const q = question.toLowerCase();

  let answer = "I can analyze your claim data, but the AI service is currently unavailable. Here is what I can see from the available data:";
  const missingData: string[] = [];
  const suggestedActions: Array<{ action: string; rationale: string }> = [];

  if (claim) {
    if (!claim.carrier) missingData.push("Carrier not assigned");
    if (!claim.dateOfLoss) missingData.push("Date of loss not recorded");
    if (!claim.initialOutcome && !claim.finalOutcome) missingData.push("No outcome recorded");

    if (q.includes("risk") || q.includes("at risk")) {
      const risks: string[] = [];
      if (claim.initialOutcome?.toLowerCase().includes("deni")) risks.push("prior denial on record");
      if (!claim.denialOverturned && claim.escalationUsed) risks.push("escalation used without overturn");
      if (claim.supplementRequested && !claim.supplementApproved) risks.push("pending supplement");
      answer = risks.length > 0
        ? `Risk signals detected: ${risks.join("; ")}.`
        : "No immediate risk signals detected from available data.";
    } else if (q.includes("missing") || q.includes("documents")) {
      answer = `Available documents and gaps are shown in the claim evidence tab. Upload missing items to improve intelligence coverage.`;
    } else if (q.includes("next") || q.includes("action") || q.includes("should")) {
      if (claim.initialOutcome?.toLowerCase().includes("deni") && !claim.denialOverturned) {
        suggestedActions.push({ action: "Request reinspection", rationale: "Active denial without overturn on record" });
        suggestedActions.push({ action: "Upload repairability documentation", rationale: "Repairability disputes often benefit from additional evidence" });
      }
      answer = "Suggested actions based on available claim data:";
    } else {
      answer = `Claim is in "${claim.status || "unknown"}" status. Carrier: ${claim.carrier || "not assigned"}. Use the full copilot when AI service is available for deeper analysis.`;
    }
  }

  return {
    answer,
    supportingData: {},
    suggestedActions,
    playbookHint: null,
    missingData,
    disclosure: AI_DISCLOSURE,
    model: "rule-based-fallback",
    claimContext: claim !== null,
  };
}

// ── Main entry point ───────────────────────────────────────────────────────
export async function runCopilotQuery(
  question: string,
  claim: Claim | null,
  escalations: Escalation[],
  timelineEvents: TimelineEvent[],
  evidenceFiles: EvidenceFile[],
  role: string,
): Promise<CopilotResponse> {
  if (!isOpenAIConfigured()) {
    return ruleBasedResponse(question, claim);
  }

  const claimContext = assembleCopilotContext(claim, escalations, timelineEvents, evidenceFiles, role);
  const systemPrompt = buildSystemPrompt(role);
  const userMessage = `${claimContext}\n\n=== USER QUESTION ===\n${question}`;

  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { parsed = { answer: raw }; }

    return {
      answer: typeof parsed.answer === "string" ? parsed.answer : "No response generated.",
      supportingData: (parsed.supportingData && typeof parsed.supportingData === "object" && !Array.isArray(parsed.supportingData))
        ? parsed.supportingData as Record<string, unknown>
        : {},
      suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions as Array<{ action: string; rationale: string }> : [],
      playbookHint: typeof parsed.playbookHint === "string" ? parsed.playbookHint : null,
      missingData: Array.isArray(parsed.missingData) ? (parsed.missingData as unknown[]).map(String) : [],
      disclosure: AI_DISCLOSURE,
      model: "gpt-4o",
      claimContext: claim !== null,
    };
  } catch (err) {
    console.error("[copilot] OpenAI error:", (err as Error)?.message);
    return ruleBasedResponse(question, claim);
  }
}
