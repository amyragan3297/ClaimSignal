import OpenAI, { toFile } from "openai";

// Read env vars per-call so Replit AI Integration token rotation is always picked up.
// Never cache the client or the key values at module load time.

export function isOpenAIConfigured(): boolean {
  return Boolean(
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY &&
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  );
}

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey || !baseURL) {
    throw new Error("OpenAI integration is not configured: AI_INTEGRATIONS_OPENAI_API_KEY and AI_INTEGRATIONS_OPENAI_BASE_URL must be set");
  }
  return new OpenAI({ apiKey, baseURL, timeout: 120_000, maxRetries: 2 });
}

export { toFile };
