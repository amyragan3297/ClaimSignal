/**
 * Adjuster-linking dedup regression tests.
 * Run with:  npx tsx server/adjuster-linking.test.ts
 *
 * Covers:
 *   1. Pure-function sanity: normalizeAdjusterName, mapRoleLabelToEnum
 *   2. CORE REGRESSION: document creates adjuster with unknown carrier, then
 *      transcript extracts same name with known carrier → single profile, no dup
 *   3. Two genuinely different adjusters at distinct known carriers → two profiles
 *   4. Idempotent: duplicate mention creates only one claim link
 *   5. Non-adjuster role labels are filtered out entirely
 *   6. ALL_CAPS transcript name deduped against title-case document profile
 */

import { storage } from "./storage";
import {
  extractAndLinkAdjustersForClaim,
  normalizeAdjusterName,
  mapRoleLabelToEnum,
  type AdjusterMention,
} from "./adjuster-linking";
import type { Adjuster, ClaimAdjuster } from "@shared/schema";

// ── Pass/fail tracking ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
  }
}

// ── In-memory storage state ───────────────────────────────────────────────────

let adjusterStore: Adjuster[] = [];
let linkStore: ClaimAdjuster[] = [];
let adjIdSeq = 0;
let linkIdSeq = 0;

function resetStores() {
  adjusterStore = [];
  linkStore = [];
  adjIdSeq = 0;
  linkIdSeq = 0;
}

function installStorageStubs() {
  Object.assign(storage, {
    getAdjusters: async (_orgId: string) => [...adjusterStore],

    createAdjuster: async (data: {
      organizationId: string;
      adjusterName: string;
      adjusterEmail?: string;
      adjusterPhone?: string;
      carrierName?: string;
    }): Promise<Adjuster> => {
      const adj: Adjuster = {
        id: `adj-${++adjIdSeq}`,
        organizationId: data.organizationId,
        adjusterName: data.adjusterName,
        carrierName: data.carrierName ?? "Unknown",
        adjusterEmail: data.adjusterEmail ?? null,
        adjusterPhone: data.adjusterPhone ?? null,
        licenseNumber: null,
        licenseState: null,
        yearsExperience: null,
        specializations: null,
        frictionScore: null,
        totalClaimsHandled: null,
        avgResolutionDays: null,
        denialRatio: null,
        supplementReductionRatio: null,
        partialApprovalRatio: null,
        communicationRiskScore: null,
        lastScoreUpdate: null,
        createdAt: new Date(),
      };
      adjusterStore.push(adj);
      return adj;
    },

    linkAdjusterToClaim: async (data: {
      claimId: string;
      adjusterId: string;
      organizationId: string;
      roleOnClaim: string;
      sourceType: string;
      sourceDocumentId?: string;
      sourceTranscriptId?: string;
      sourceAudioId?: string;
      confidenceScore?: number;
    }): Promise<ClaimAdjuster> => {
      const existing = linkStore.find(
        l =>
          l.claimId === data.claimId &&
          l.adjusterId === data.adjusterId &&
          l.roleOnClaim === data.roleOnClaim,
      );
      if (existing) {
        const err = new Error("unique constraint") as Error & { code: string };
        err.message = "unique constraint violation (23505)";
        throw err;
      }
      const link: ClaimAdjuster = {
        id: `link-${++linkIdSeq}`,
        claimId: data.claimId,
        adjusterId: data.adjusterId,
        organizationId: data.organizationId,
        roleOnClaim: data.roleOnClaim as ClaimAdjuster["roleOnClaim"],
        sourceType: data.sourceType as ClaimAdjuster["sourceType"],
        sourceDocumentId: data.sourceDocumentId ?? null,
        sourceTranscriptId: data.sourceTranscriptId ?? null,
        sourceAudioId: data.sourceAudioId ?? null,
        confidenceScore: data.confidenceScore ?? 1,
        linkedAt: new Date(),
      };
      linkStore.push(link);
      return link;
    },
  });
}

// ── Pure function tests ───────────────────────────────────────────────────────

console.log("\n=== 1. normalizeAdjusterName ===");
check("all-caps → title case", normalizeAdjusterName("CODY VINES") === "Cody Vines");
check("Last, First → First Last", normalizeAdjusterName("Vines, Cody") === "Cody Vines");
check("extra whitespace collapsed", normalizeAdjusterName("  Jane   Doe  ") === "Jane Doe");

console.log("\n=== 2. mapRoleLabelToEnum ===");
check("'field adjuster' → field_adjuster", mapRoleLabelToEnum("field adjuster") === "field_adjuster");
check("'desk adjuster' → desk_adjuster", mapRoleLabelToEnum("desk adjuster") === "desk_adjuster");
check("'CAT adjuster' → catastrophe_adjuster", mapRoleLabelToEnum("CAT adjuster") === "catastrophe_adjuster");
check("undefined → primary_adjuster", mapRoleLabelToEnum(undefined) === "primary_adjuster");
check("'supervisor' → supervisor", mapRoleLabelToEnum("supervisor") === "supervisor");

// ── Integration tests using stubbed storage ───────────────────────────────────

installStorageStubs();

async function runIntegrationTests() {
  // ── Test 3: CORE REGRESSION ─────────────────────────────────────────────────
  // Document creates adjuster with unknown carrier. Transcript later extracts
  // the same person's name with a known carrier (from claim context).
  // Expected: ONE adjuster profile, TWO claim links.
  console.log(
    "\n=== 3. REGRESSION: document (unknown carrier) + transcript (known carrier) → single profile ===",
  );
  resetStores();

  await extractAndLinkAdjustersForClaim(
    "claim-1",
    "org-1",
    [{ name: "John Smith" }],
    { sourceType: "document", sourceDocumentId: "doc-1" },
  );

  check("one adjuster profile created from doc", adjusterStore.length === 1);
  check("doc-created adjuster has unknown carrier", adjusterStore[0].carrierName === "Unknown");
  check("one claim link after doc", linkStore.length === 1);

  await extractAndLinkAdjustersForClaim(
    "claim-1",
    "org-1",
    [{ name: "John Smith", roleLabel: "field adjuster", carrier: "State Farm" }],
    { sourceType: "transcript", sourceTranscriptId: "rec-1" },
  );

  check("still only ONE adjuster profile (no duplicate created)", adjusterStore.length === 1);
  check("two claim links (doc link + transcript link)", linkStore.length === 2);
  check("transcript link has role field_adjuster", linkStore[1].roleOnClaim === "field_adjuster");
  check("transcript link has sourceType transcript", linkStore[1].sourceType === "transcript");
  check("transcript link has correct sourceTranscriptId", linkStore[1].sourceTranscriptId === "rec-1");

  // ── Test 4: Two distinct carriers → two separate profiles ───────────────────
  console.log("\n=== 4. Same name + two distinct known carriers → two separate profiles ===");
  resetStores();

  await extractAndLinkAdjustersForClaim(
    "claim-2",
    "org-1",
    [{ name: "Jane Doe", carrier: "Allstate" }],
    { sourceType: "document", sourceDocumentId: "doc-2" },
  );
  await extractAndLinkAdjustersForClaim(
    "claim-2",
    "org-1",
    [{ name: "Jane Doe", carrier: "State Farm" }],
    { sourceType: "transcript", sourceTranscriptId: "rec-2" },
  );

  check("two adjuster profiles for genuinely distinct carriers", adjusterStore.length === 2);
  check("two claim links", linkStore.length === 2);

  // ── Test 5: Idempotent — same mention twice creates only one link ─────────
  console.log("\n=== 5. Idempotent: duplicate call creates only one claim link ===");
  resetStores();

  const mention: AdjusterMention = { name: "Bob Jones", carrier: "Nationwide" };
  await extractAndLinkAdjustersForClaim("claim-3", "org-1", [mention], {
    sourceType: "document",
    sourceDocumentId: "doc-3",
  });
  await extractAndLinkAdjustersForClaim("claim-3", "org-1", [mention], {
    sourceType: "document",
    sourceDocumentId: "doc-3",
  });

  check("one adjuster profile after duplicate calls", adjusterStore.length === 1);
  check("one claim link after duplicate calls (idempotent)", linkStore.length === 1);

  // ── Test 6: Non-adjuster role label filtered out ───────────────────────────
  console.log("\n=== 6. Non-adjuster role label is filtered out entirely ===");
  resetStores();

  await extractAndLinkAdjustersForClaim(
    "claim-4",
    "org-1",
    [{ name: "Alice Green", roleLabel: "public adjuster" }],
    { sourceType: "transcript", sourceTranscriptId: "rec-4" },
  );

  check("no adjuster profile created for non-adjuster role", adjusterStore.length === 0);
  check("no claim link created for non-adjuster role", linkStore.length === 0);

  // ── Test 7: ALL_CAPS transcript name deduped against title-case doc profile ─
  console.log(
    "\n=== 7. ALL_CAPS transcript name deduped against title-case document profile ===",
  );
  resetStores();

  await extractAndLinkAdjustersForClaim(
    "claim-5",
    "org-1",
    [{ name: "Cody Vines" }],
    { sourceType: "document", sourceDocumentId: "doc-5" },
  );
  await extractAndLinkAdjustersForClaim(
    "claim-5",
    "org-1",
    [{ name: "CODY VINES", roleLabel: "desk adjuster" }],
    { sourceType: "transcript", sourceTranscriptId: "rec-5" },
  );

  check("ALL_CAPS name merges with title-case profile (single profile)", adjusterStore.length === 1);
  check("two links created (doc + transcript with different roles)", linkStore.length === 2);
}

runIntegrationTests()
  .then(() => {
    console.log(
      `\n================ RESULT: ${passed} passed, ${failed} failed ================\n`,
    );
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch(err => {
    console.error("Unexpected test error:", err);
    process.exit(1);
  });
