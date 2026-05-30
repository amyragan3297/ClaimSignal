/**
 * Centralized runtime configuration & startup safety checks.
 *
 * Security goals:
 *  - In production, NEVER fall back to a hardcoded JWT/session secret.
 *  - In production, NEVER seed default Master/platform-owner credentials.
 *  - Demo/dev seeding is allowed only in development, test, or explicit DEMO_MODE.
 *
 * Nothing in this file logs secret values.
 */

export const NODE_ENV = process.env.NODE_ENV || "development";
export const isProduction = NODE_ENV === "production";
export const isDevelopment = NODE_ENV === "development";
export const isTest = NODE_ENV === "test";
export const isDemoMode = process.env.DEMO_MODE === "true";

// Used only outside production. Clearly labeled so it can never be mistaken
// for a real secret.
const DEV_FALLBACK_JWT_SECRET = "claimsignal-dev-only-insecure-secret-DO-NOT-USE-IN-PRODUCTION";

/**
 * Resolve the JWT/session signing secret.
 * - Returns SESSION_SECRET when set (the only acceptable value in production).
 * - In production with no SESSION_SECRET: throws (fail fast, no fallback).
 * - In development/test with no SESSION_SECRET: returns a labeled dev fallback.
 */
export function resolveJwtSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length > 0) return secret;

  if (isProduction) {
    throw new Error(
      "FATAL: SESSION_SECRET is required in production but is not set. " +
        "Refusing to start with an insecure fallback secret. " +
        "Set the SESSION_SECRET environment variable and restart.",
    );
  }

  return DEV_FALLBACK_JWT_SECRET;
}

/**
 * Whether labeled demo/dev account & sample-data seeding is permitted.
 * Allowed in development, test, or when DEMO_MODE=true (incl. a demo deploy).
 */
export function isDemoSeedingAllowed(): boolean {
  return isDevelopment || isTest || isDemoMode;
}

/**
 * Explicit, secure Master credentials for production seeding.
 * Returns null when not fully provided — callers MUST then skip Master creation
 * rather than fall back to defaults.
 */
export function getProductionMasterCredentials(): { email: string; password: string } | null {
  const email = process.env.MASTER_EMAIL;
  const password = process.env.MASTER_INITIAL_PASSWORD;
  if (email && email.length > 0 && password && password.length > 0) {
    return { email, password };
  }
  return null;
}

/**
 * Decide which Master credentials (if any) may be used for startup seeding.
 *
 * Policy:
 *  - Production (including DEMO_MODE=true): ONLY explicit MASTER_EMAIL +
 *    MASTER_INITIAL_PASSWORD. Hardcoded/default credentials are never used in
 *    production. Returns null when those are not provided (caller must skip).
 *  - Development / test: ADMIN_EMAIL/ADMIN_PASSWORD if provided, otherwise a
 *    clearly-labeled demo default. Marked `isDemo: true`.
 *
 * Returns null when no Master should be auto-seeded.
 */
export function resolveSeedMasterCredentials(): { email: string; password: string; isDemo: boolean } | null {
  if (isProduction) {
    const creds = getProductionMasterCredentials();
    if (!creds) return null;
    return { email: creds.email, password: creds.password, isDemo: false };
  }

  if (!isDemoSeedingAllowed()) return null;

  return {
    email: process.env.ADMIN_EMAIL || "admin@claimsignal.com",
    password: process.env.ADMIN_PASSWORD || "ClaimSignal2026!",
    isDemo: true,
  };
}

// Keys whose values must never appear in logs.
const SENSITIVE_LOG_KEYS = new Set([
  "accessToken",
  "refreshToken",
  "token",
  "password",
  "passwordHash",
  "secret",
  "sessionSecret",
  "apiKey",
]);

/**
 * Recursively redact sensitive fields from an object before logging.
 * Never mutates the input. Used by the request logger so auth responses
 * (which carry access tokens) never leak into logs.
 */
export function redactSensitive(value: any): any {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_LOG_KEYS.has(k) ? "[REDACTED]" : redactSensitive(v);
    }
    return out;
  }
  return value;
}

/**
 * Run at startup, before serving traffic. Triggers fail-fast validation of
 * required production configuration. Logs status without revealing secrets.
 */
export function assertStartupConfig(): void {
  // Throws in production if SESSION_SECRET is missing.
  resolveJwtSecret();

  if (isProduction) {
    if (isDemoMode) {
      console.warn("[config] Production running with DEMO_MODE=true — demo accounts/data may be seeded.");
    }
    console.log("[config] Production startup checks passed: SESSION_SECRET present.");
  } else {
    console.log(`[config] Startup in ${NODE_ENV} mode (demo seeding ${isDemoSeedingAllowed() ? "enabled" : "disabled"}).`);
  }
}
