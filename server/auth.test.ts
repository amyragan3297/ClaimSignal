
/**
 * Auth startup security verification.
 * Run with:  npx tsx server/auth.test.ts
 *
 * Proves:
 *   - Production startup fails if SESSION_SECRET is missing.
 *   - Production never uses a hardcoded JWT/session fallback secret.
 *   - Development/test fall back to a labeled dev secret (still runs safely).
 *   - Production does not seed default Master credentials when env vars missing.
 *   - Demo seeding is allowed only in dev/test/DEMO_MODE.
 *
 * NOTE: config.ts reads process.env live on each call, so we mutate env per case.
 *       This file imports config.ts fresh each time via the cache-busting loader.
 */

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    console.error(`  \u2717 FAIL: ${name}`);
  }
}

// Import a *fresh* copy of config.ts so module-level NODE_ENV constants reflect
// the current process.env (tsx/esbuild caches modules by default).
async function loadConfig(env: Record<string, string | undefined>) {
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    const mod = await import(`./config?bust=${Math.random()}`);
    return { mod, restore: () => { process.env = saved; } };
  } catch (e) {
    process.env = saved;
    throw e;
  }
}

async function run() {
  console.log("\n=== 1. Production fails fast when SESSION_SECRET missing ===");
  {
    const { mod, restore } = await loadConfig({ NODE_ENV: "production", JWT_SECRET: undefined, SESSION_SECRET: undefined, DEMO_MODE: undefined });
    let threw = false;
    let leaked = false;
    try {
      mod.resolveJwtSecret();
    } catch (e: unknown) {
      threw = true;
      // ensure the error message does not contain a secret value
      leaked = /claimsignal-dev-only/.test((e as Error).message);
    }
    check("resolveJwtSecret throws in production with no SESSION_SECRET", threw);
    check("error message does not leak a fallback secret value", !leaked);
    restore();
  }

  console.log("\n=== 2. Production uses provided SESSION_SECRET, never a fallback ===");
  {
    const { mod, restore } = await loadConfig({ NODE_ENV: "production", JWT_SECRET: undefined, SESSION_SECRET: "real-prod-secret-from-env", DEMO_MODE: undefined });
    let secret = "";
    let threw = false;
    try { secret = mod.resolveJwtSecret(); } catch { threw = true; }
    check("does not throw when SESSION_SECRET is set", !threw);
    check("returns the env-provided secret", secret === "real-prod-secret-from-env");
    check("does NOT return a hardcoded fallback", !/claimsignal-dev-only/.test(secret));
    restore();
  }

  console.log("\n=== 3. Development/test run safely with labeled dev fallback ===");
  for (const env of ["development", "test"]) {
    const { mod, restore } = await loadConfig({ NODE_ENV: env, JWT_SECRET: undefined, SESSION_SECRET: undefined, DEMO_MODE: undefined });
    let secret = "";
    let threw = false;
    try { secret = mod.resolveJwtSecret(); } catch { threw = true; }
    check(`[${env}] does not throw without SESSION_SECRET`, !threw);
    check(`[${env}] uses a clearly labeled dev-only secret`, /dev-only-insecure/.test(secret));
    restore();
  }

  console.log("\n=== 4. Production does NOT seed default Master credentials ===");
  {
    const { mod, restore } = await loadConfig({ NODE_ENV: "production", MASTER_EMAIL: undefined, MASTER_INITIAL_PASSWORD: undefined, DEMO_MODE: undefined });
    check("getProductionMasterCredentials() returns null when env missing", mod.getProductionMasterCredentials() === null);
    check("isProduction true", mod.isProduction === true);
    check("isDemoSeedingAllowed() false in plain production", mod.isDemoSeedingAllowed() === false);
    restore();
  }

  console.log("\n=== 5. Production Master seeding only with explicit secure env ===");
  {
    const { mod, restore } = await loadConfig({ NODE_ENV: "production", MASTER_EMAIL: "owner@example.com", MASTER_INITIAL_PASSWORD: "x", DEMO_MODE: undefined });
    const creds = mod.getProductionMasterCredentials();
    check("returns credentials when both env vars provided", creds !== null && creds.email === "owner@example.com");
    restore();
  }

  console.log("\n=== 6. Demo seeding gating ===");
  {
    let r = await loadConfig({ NODE_ENV: "development", DEMO_MODE: undefined });
    check("[development] demo seeding allowed", r.mod.isDemoSeedingAllowed() === true);
    r.restore();

    r = await loadConfig({ NODE_ENV: "test", DEMO_MODE: undefined });
    check("[test] demo seeding allowed", r.mod.isDemoSeedingAllowed() === true);
    r.restore();

    r = await loadConfig({ NODE_ENV: "production", DEMO_MODE: undefined });
    check("[production] demo seeding NOT allowed by default", r.mod.isDemoSeedingAllowed() === false);
    r.restore();

    r = await loadConfig({ NODE_ENV: "production", DEMO_MODE: "true" });
    check("[production + DEMO_MODE=true] demo seeding allowed", r.mod.isDemoSeedingAllowed() === true);
    r.restore();
  }

  console.log("\n=== 7. Production NEVER seeds default Master credentials ===");
  {
    // plain production, no MASTER_* set
    let r = await loadConfig({ NODE_ENV: "production", MASTER_EMAIL: undefined, MASTER_INITIAL_PASSWORD: undefined, ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined, DEMO_MODE: undefined });
    check("[production] resolveSeedMasterCredentials() is null (no seeding)", r.mod.resolveSeedMasterCredentials() === null);
    r.restore();

    // production + DEMO_MODE=true, no MASTER_* set → still null (the previously-flagged hole)
    r = await loadConfig({ NODE_ENV: "production", DEMO_MODE: "true", MASTER_EMAIL: undefined, MASTER_INITIAL_PASSWORD: undefined, ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined });
    const demoSeed = r.mod.resolveSeedMasterCredentials();
    check("[production + DEMO_MODE] does NOT fall back to default credentials", demoSeed === null);
    r.restore();

    // production WITH explicit secure creds → uses them, marked non-demo
    r = await loadConfig({ NODE_ENV: "production", MASTER_EMAIL: "owner@example.com", MASTER_INITIAL_PASSWORD: "x", ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined, DEMO_MODE: undefined });
    const prodSeed = r.mod.resolveSeedMasterCredentials();
    check("[production] uses explicit Master creds when provided", prodSeed?.email === "owner@example.com");
    check("[production] never uses hardcoded admin@claimsignal.com", prodSeed?.email !== "admin@claimsignal.com");
    check("[production] seeded Master not marked demo", prodSeed?.isDemo === false);
    r.restore();

    // development → demo defaults allowed and clearly marked
    r = await loadConfig({ NODE_ENV: "development", ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined, DEMO_MODE: undefined });
    const devSeed = r.mod.resolveSeedMasterCredentials();
    check("[development] demo default credentials allowed", devSeed?.isDemo === true && !!devSeed?.email);
    r.restore();
  }

  console.log("\n=== 8. API logs never expose tokens/secrets ===");
  {
    const { mod, restore } = await loadConfig({ NODE_ENV: "test" });
    const loginResponse = {
      user: { id: "u1", email: "a@b.com", role: "master_admin", passwordHash: "HASH" },
      accessToken: "eyJ-secret-jwt-token",
      refreshToken: "raw-refresh-token",
      nested: { token: "deep-token", keep: "visible" },
    };
    const redacted = mod.redactSensitive(loginResponse);
    const serialized = JSON.stringify(redacted);
    check("accessToken redacted", redacted.accessToken === "[REDACTED]");
    check("refreshToken redacted", redacted.refreshToken === "[REDACTED]");
    check("nested token redacted", redacted.nested.token === "[REDACTED]");
    check("passwordHash redacted", redacted.user.passwordHash === "[REDACTED]");
    check("non-sensitive fields preserved", redacted.user.email === "a@b.com" && redacted.nested.keep === "visible");
    check("no token value present in serialized log line", !serialized.includes("eyJ-secret-jwt-token") && !serialized.includes("raw-refresh-token") && !serialized.includes("deep-token"));
    check("original object not mutated", loginResponse.accessToken === "eyJ-secret-jwt-token");
    restore();
  }

  console.log(`\n================ RESULT: ${passed} passed, ${failed} failed ================\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run();
