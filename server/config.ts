/**
 * Centralized runtime configuration & startup safety checks.
 *
 * Security goals:
 *  - In production, NEVER fall back to a hardcoded JWT/session secret.
 *  - In ALL environments, NEVER embed admin credentials in source code.
 *  - Demo/dev seeding is allowed only in development, test, or explicit DEMO_MODE,
 *    but still requires explicit ADMIN_EMAIL + ADMIN_PASSWORD env/secret values.
 *
 * Nothing in this file logs secret values.
 */

export const NODE_ENV = process.env.NODE_ENV || "development";
export const isProduction = NODE_ENV === "production";
export const isDevelopment = NODE_ENV === "development";
export const isTest = NODE_ENV === "test";
export const isDemoMode = process.env.DEMO_MODE === "true";

/**
 * Resolve the JWT/session signing secret.
 *
 * Accepts JWT_SECRET (user-facing name) or SESSION_SECRET (legacy name).
 * Prefers JWT_SECRET when both are present.
 *
 *  - In production with neither set: throws (fail fast, no fallback).
 *  - In development/test with neither set: returns a labeled insecure fallback
 *    so the server can start without configuration, but it is clearly marked.
 */
export function resolveJwtSecret(): string {
  // Support JWT_SECRET (required secrets list) as primary name.
  // SESSION_SECRET is accepted as a backward-compatible alias.
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (secret && secret.length > 0) return secret;

  if (isProduction) {
    throw new Error(
      "FATAL: JWT_SECRET (or SESSION_SECRET) is required in production but is not set. " +
        "Refusing to start with an insecure fallback. " +
        "Set the JWT_SECRET environment variable/secret and restart.",
    );
  }

  // Development / test only — clearly labeled, never used in production.
  return "claimsignal-dev-only-insecure-DO-NOT-USE-IN-PRODUCTION";
}

/**
 * Whether labeled demo/dev account & sample-data seeding is permitted.
 * Allowed in development, test, or when DEMO_MODE=true (incl. a demo deploy).
 */
export function isDemoSeedingAllowed(): boolean {
  return isDevelopment || isTest || isDemoMode;
}

/**
 * Read explicit admin/master credentials from environment secrets.
 * Returns null when either value is absent — callers must skip seeding.
 * No hardcoded credential fallbacks are ever used in any environment.
 *
 * Accepts:
 *   ADMIN_EMAIL  / MASTER_EMAIL            (primary / legacy alias)
 *   ADMIN_PASSWORD / MASTER_INITIAL_PASSWORD (primary / legacy alias)
 */
export function resolveSeedMasterCredentials(): {
  email: string;
  password: string;
  isDemo: boolean;
} | null {
  if (!isDemoSeedingAllowed() && !isProduction) return null;

  const email =
    process.env.ADMIN_EMAIL ||
    process.env.MASTER_EMAIL;

  const password =
    process.env.ADMIN_PASSWORD ||
    process.env.MASTER_INITIAL_PASSWORD;

  if (!email || !email.trim() || !password || !password.trim()) {
    if (isDevelopment || isTest) {
      console.warn(
        "[config] ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping Master seeding. " +
          "Set both as environment secrets to create the master account on startup.",
      );
    }
    return null;
  }

  return {
    email: email.trim(),
    password: password.trim(),
    isDemo: !isProduction,
  };
}

/**
 * Keys whose values must never appear in logs.
 * Covers all common naming conventions for sensitive fields.
 */
const SENSITIVE_LOG_KEYS = new Set([
  "accessToken",
  "refreshToken",
  "token",
  "password",
  "passwordHash",
  "secret",
  "sessionSecret",
  "jwtSecret",
  "apiKey",
  "api_key",
  "adminPassword",
  "adminToken",
  "backupEncryptionKey",
  "gmailAppPassword",
  "smtpPass",
  "stripeSecretKey",
  "stripeWebhookSecret",
  "openaiApiKey",
  "stormApiKey",
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
  // Throws in production if neither JWT_SECRET nor SESSION_SECRET is set.
  resolveJwtSecret();

  if (isProduction) {
    if (isDemoMode) {
      console.warn("[config] Production running with DEMO_MODE=true — demo accounts/data may be seeded.");
    }
    console.log("[config] Production startup checks passed: JWT secret present.");
  } else {
    console.log(`[config] Startup in ${NODE_ENV} mode (demo seeding ${isDemoSeedingAllowed() ? "enabled" : "disabled"}).`);
  }
}
