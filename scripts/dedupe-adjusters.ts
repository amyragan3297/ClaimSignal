import { db } from "../server/db";
import { normalizeAdjusterName } from "../server/adjuster-linking";
import { adjusters, claimAdjusters, type Adjuster } from "../shared/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * One-time deduplication script for adjuster profiles created before name
 * normalization was in place.
 *
 * Safe to re-run: already-merged duplicates are soft-deleted (deleted_at IS NOT
 * NULL) and are therefore excluded from the initial load on every subsequent run.
 *
 * Merge strategy:
 *   - Group adjusters by (organizationId, nameKey) — carrier is not part of
 *     the match key so the same person with different carrier spellings is
 *     still caught.
 *   - Within each duplicate group the earliest createdAt is the canonical record.
 *   - Every claim_adjusters row pointing at a duplicate is re-pointed to the
 *     canonical.  If the canonical already owns that (claimId, roleOnClaim) pair
 *     the conflicting link is deleted instead.
 *   - The duplicate adjuster row is soft-deleted (deleted_at = NOW()).
 *
 * Run with:
 *   npx tsx scripts/dedupe-adjusters.ts
 */

function nameKey(name: string): string {
  return normalizeAdjusterName(name)
    .toLowerCase()
    .replace(/\s+[a-z]\.\s+/g, " ")
    .replace(/\s+[a-z]\s+(?=[a-z])/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function run() {
  console.log("=== Adjuster deduplication script ===\n");

  const all = await db
    .select()
    .from(adjusters)
    .where(sql`deleted_at IS NULL`);

  console.log(`Loaded ${all.length} active adjuster record(s).`);

  // Group by (organizationId, normalizedNameKey) only — matching the task
  // requirement that any two records whose normalized names are equivalent
  // within the same org are duplicates, regardless of carrier name.
  const groups = new Map<string, Adjuster[]>();
  for (const adj of all) {
    const key = `${adj.organizationId}||${nameKey(adj.adjusterName)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(adj);
  }

  const dupGroups = Array.from(groups.values()).filter((g) => g.length > 1);
  console.log(`Found ${dupGroups.length} duplicate group(s) requiring a merge.\n`);

  let mergedCount = 0;

  for (const members of dupGroups) {
    members.sort((a, b) => {
      const ta = a.createdAt?.getTime() ?? 0;
      const tb = b.createdAt?.getTime() ?? 0;
      return ta - tb;
    });

    const canonical = members[0];
    const duplicates = members.slice(1);

    console.log(`Group — canonical: id=${canonical.id} name="${canonical.adjusterName}" carrier="${canonical.carrierName}" org=${canonical.organizationId}`);

    for (const dup of duplicates) {
      console.log(`  Duplicate: id=${dup.id} name="${dup.adjusterName}" createdAt=${dup.createdAt?.toISOString() ?? "unknown"}`);

      const dupLinks = await db
        .select()
        .from(claimAdjusters)
        .where(eq(claimAdjusters.adjusterId, dup.id));

      console.log(`  claim_adjusters rows to migrate: ${dupLinks.length}`);

      for (const link of dupLinks) {
        const conflict = await db
          .select({ id: claimAdjusters.id })
          .from(claimAdjusters)
          .where(
            and(
              eq(claimAdjusters.claimId, link.claimId),
              eq(claimAdjusters.adjusterId, canonical.id),
              eq(claimAdjusters.roleOnClaim, link.roleOnClaim),
            ),
          );

        if (conflict.length > 0) {
          await db
            .delete(claimAdjusters)
            .where(eq(claimAdjusters.id, link.id));
          console.log(`    Deleted conflicting link id=${link.id} (claimId=${link.claimId}, role=${link.roleOnClaim}) — canonical already has this link`);
        } else {
          await db
            .update(claimAdjusters)
            .set({ adjusterId: canonical.id })
            .where(eq(claimAdjusters.id, link.id));
          console.log(`    Re-pointed link id=${link.id} claimId=${link.claimId} role=${link.roleOnClaim} → canonical ${canonical.id}`);
        }
      }

      await db.execute(
        sql`UPDATE adjusters SET deleted_at = NOW() WHERE id = ${dup.id}`,
      );

      console.log(`  Soft-deleted duplicate adjuster id=${dup.id}`);
      mergedCount++;
    }

    console.log();
  }

  console.log(`=== Done. Merged ${mergedCount} duplicate adjuster profile(s). ===`);
  process.exit(0);
}

run().catch((e) => {
  console.error("Dedup script failed:", e);
  process.exit(1);
});
