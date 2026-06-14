import { getOpenAIClient } from "../openai";

export type DocType =
  | "estimate"
  | "policy"
  | "denial_letter"
  | "email"
  | "photo_report"
  | "supplement"
  | "invoice"
  | "unknown";

const VALID_DOC_TYPES: DocType[] = [
  "estimate", "policy", "denial_letter", "email",
  "photo_report", "supplement", "invoice", "unknown",
];

export async function classifyDoc(text: string): Promise<DocType> {
  const client = getOpenAIClient();
  const preview = text.slice(0, 4000);

  const completion = await client.chat.completions.create({
    model: "gpt-5.4",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Classify the insurance document type. Respond with JSON: {"docType":"<type>"}.
Allowed types: estimate, policy, denial_letter, email, photo_report, supplement, invoice, unknown.
Return exactly one of those strings. Do not include any other keys.`,
      },
      { role: "user", content: preview },
    ],
  });

  try {
    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}") as Record<string, unknown>;
    const dt = parsed.docType as string;
    return VALID_DOC_TYPES.includes(dt as DocType) ? (dt as DocType) : "unknown";
  } catch {
    return "unknown";
  }
}
