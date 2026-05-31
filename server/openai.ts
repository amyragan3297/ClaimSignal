import OpenAI, { toFile } from "openai";

const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

export function isOpenAIConfigured(): boolean {
  return Boolean(apiKey && baseURL);
}

// A fresh client per call: Replit AI Integration tokens can rotate/expire, so
// never cache the client across requests.
export function getOpenAIClient(): OpenAI {
  if (!apiKey || !baseURL) {
    throw new Error("OpenAI integration is not configured");
  }
  return new OpenAI({ apiKey, baseURL });
}

export { toFile };
